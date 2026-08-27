// ============ AI 行动阶段：市场操作 → 修理维护 → 勘探 → 建造 → 升级 → 修桥 → 游说/举报 ============
// 混合设计：沿用经模拟验证的旧版现金门控节奏（避免对局过早结束），
// 叠加 M3 修复：走 sellResources API、修桥半价、dam/breakwater/office 建造、威胁排序举报、评分选勘探/升级目标

import {
  BUILDINGS, BUILDING_DEFS, EAST_BRIDGE, FLOOD_TILES, RESOURCES, RESOURCE_ORDER,
  SEASONS, TERRAIN_RESOURCE, WEST_BRIDGE,
} from '../config'
import { canBuild, levelCost, repair, repairCost } from '../buildings'
import { bridgeRepairCost, exploreCost, tileRent } from '../economy'
import { isMonopoly, lobby, monopolyInfo, monopolyTargets, reportMonopoly } from '../events'
import { recordSale } from '../market'
import { getBrain, decayBrain, incomeEstimate, terrainDependence } from './brain'
import { brainRng, saveBrainRng } from './personality'
import { cashSafetyLine, priceForecast, tileValue } from './score'
import { updateOpponentModels } from './opponent'
import { rushTarget, updateStrategy } from './strategy'
import type { AiBrain, GameApi, Terrain, Tile, TradeOffer } from '../types'

/** 按大脑私有随机源掷概率（无大脑时退回主随机源） */
function chance(game: GameApi, brain: AiBrain | null, p: number): boolean {
  if (brain) {
    const rng = brainRng(brain)
    const ok = rng.chance(p)
    saveBrainRng(brain, rng)
    return ok
  }
  return game.rng.chance(p)
}

/** AI 行动阶段：卖资源 → 修理 → 勘探 → 建造 → 升级 → 游说/举报 */
export async function aiAct(game: GameApi, playerId: number): Promise<void> {
  const s = game.state
  const p = s.players[playerId]
  if (!p.alive) return

  // 大脑维护：情绪冷却 → 对手建模 → 策略切换
  const brain = getBrain(s, playerId)
  if (brain) {
    decayBrain(brain, s)
    updateOpponentModels(game, playerId)
    updateStrategy(game, brain, p)
  }

  await game.sleep()

  // 1) 市场操作：紧急变现 → 择时抛售/囤积（走 sellResources，批量折价与无人机加成生效）
  planSales(game, playerId)

  const myTiles = s.tiles.filter(t => t.owner === playerId)
  const safety = cashSafetyLine(game, playerId)

  // 2) 建筑维护：每回合修理 ≤1 座（统一配额），仅修理受损建筑（恢复收益），花后保留缓冲
  for (const t of myTiles) {
    if (s.ops.repair <= 0) break
    for (const b of [...t.buildings]) {
      if (s.ops.repair <= 0) break
      if (b.damaged && p.cash - repairCost(game, b) >= 900) {
        await game.sleep()
        game.repairAt(t.index, b.id)
      }
    }
  }

  // 3) 勘探：评分最高的未勘探地块（花后留缓冲）
  if (brain) {
    const unk = myTiles.filter(t => t.type === 'terrain' && !t.explored)
    if (unk.length) {
      const best = unk
        .map(t => ({ t, score: exploreGain(game, playerId, t) }))
        .sort((a, b) => b.score - a.score)[0]
      if (best.score > 0 && p.cash - exploreCost(best.t) >= 500) {
        await game.sleep()
        game.exploreAt(best.t.index)   // 走统一配额 API（全体玩家同数）
      }
    }
  }

  // 4) 建造：生产 / 防护（含堤坝、防波堤）/ 商业（含写字楼）/ 科技，沿用旧版现金门控
  const seasonDef = SEASONS[s.season]
  for (const t of myTiles) {
    if (t.type !== 'terrain' || !p.alive) continue
    // 生产建筑
    const prodDef = BUILDINGS.find(b => b.category === 'production' && b.terrain === t.terrain)
    if (prodDef && !t.buildings.some(b => b.type === prodDef.id) && canBuild(game, playerId, t, prodDef.id).ok) {
      const cost = levelCost(game, prodDef.id, 1)
      if (p.cash > cost * 1.8 && s.ops.build > 0) {
        await game.sleep()
        game.buildAt(t.index, prodDef.id)   // 走统一配额 API（全体玩家同数）
      }
    }
    // 防护建筑：当前季 + 下一季的灾害风险（含洪水堤坝与台风防波堤，修复旧版漏建）
    const terrainDanger: Record<string, string[]> = {
      forest: ['fire'], plateau: ['snow'], desert: ['sandstorm'],
      coast: ['typhoon'],
    }
    const floodRisk = FLOOD_TILES.includes(t.index) ? ['flood'] : []
    const danger = seasonDef.disasters.some(d =>
      terrainDanger[t.terrain as string]?.includes(d.kind) || floodRisk.includes(d.kind),
    )
    if (danger) {
      const protDef = BUILDINGS.find(b =>
        b.category === 'protection' && (b.terrain === t.terrain || (b.protects === 'flood' && FLOOD_TILES.includes(t.index))),
      )
      if (protDef && !t.buildings.some(b => b.type === protDef.id) && canBuild(game, playerId, t, protDef.id).ok) {
        const cost = levelCost(game, protDef.id, 1)
        if (p.cash > cost * 2 && s.ops.build > 0 && chance(game, brain, 0.5)) {
          await game.sleep()
          game.buildAt(t.index, protDef.id)
        }
      }
    }
    // 商业建筑（租金是淘汰对手的主要武器）：按基础租金选型（加入写字楼）
    if (p.cash > 2400 && t.buildings.length < 2) {
      const comDef = t.baseRent >= 500 ? BUILDING_DEFS['mall'] : t.baseRent >= 350 ? BUILDING_DEFS['office'] : BUILDING_DEFS['apartment']
      if (!t.buildings.some(b => b.type === comDef.id) && canBuild(game, playerId, t, comDef.id).ok && s.ops.build > 0 && chance(game, brain, 0.5)) {
        await game.sleep()
        game.buildAt(t.index, comDef.id)
      }
    }
  }
  // 科技建筑（旧版现金门控）
  const techOrder = ['weather-station', 'automation', 'drone-logistics'] as const
  for (const tid of techOrder) {
    const def = BUILDING_DEFS[tid]
    const owned = s.tiles.filter(t => t.owner === playerId && t.buildings.some(b => b.type === tid)).length
    if (def.maxPerPlayer && owned >= def.maxPerPlayer) continue
    const slot = myTiles.find(t => t.type === 'terrain' && t.buildings.length < 2)
    if (!slot) continue
    const want = tid === 'weather-station' ? (s.season === 'summer' || s.typhoon) && p.cash > 2600
      : tid === 'automation' ? p.cash > 3500
      : p.cash > 4000
    if (want && s.ops.build > 0) {
      await game.sleep()
      game.buildAt(slot.index, tid)
    }
  }

  // 5) 升级：评分最高的单次升级（旧版频率门控，选择更聪明）
  if (p.cash > 2600 && s.ops.upgrade > 0 && chance(game, brain, 0.4)) {
    const up = bestUpgrade(game, playerId, myTiles)
    if (up && up.score > 0) {
      await game.sleep()
      game.upgradeAt(up.tile.index, up.buildingId)
    }
  }

  // 6) 修桥/升级（走 repairBridge：与人类一致的半价，修复旧版 AI 付全价问题）
  for (const idx of [WEST_BRIDGE, EAST_BRIDGE]) {
    const b = s.tiles[idx]
    if (b.owner !== playerId || b.bridgeLevel >= 3) continue
    const cost = bridgeRepairCost(b)
    if (p.cash > Math.max(2500, cost * 1.5) && s.ops.bridge > 0 && chance(game, brain, 0.5)) {
      await game.sleep()
      game.repairBridge(idx)
    }
  }

  // 7) 游说 / 举报（威胁排序选目标，修复旧版随机选目标）
  if (isMonopoly(game, playerId) && p.cash > 2000 && p.status.antitrustMod > -0.3 && chance(game, brain, 0.4)) {
    await game.sleep()
    lobby(game, playerId, p.cash > 5000 ? 3 : p.cash > 3000 ? 2 : 1)
  }
  if (p.cash > 2800 && chance(game, brain, 0.2)) {
    const targets = monopolyTargets(game, playerId)
    if (targets.length) {
      // 威胁排序：资产最大（或敌意最高）的目标优先
      targets.sort((a, b) => threatOf(game, b) - threatOf(game, a))
      await game.sleep()
      await reportMonopoly(game, playerId, targets[0])
    }
  }

  // 8) 主动交易提议（中后期 + 合作倾向 + 冷却门控，每回合至多一次）
  if (brain && (s.endgame || s.totalRound > 20) && brain.profile.cooperation >= 0.3
    && s.turn - brain.lastTradeTurn > 10 && p.cash > safety * 1.5) {
    const offer = buildTradeProposal(game, playerId, safety)
    if (offer) {
      brain.lastTradeTurn = s.turn
      await game.sleep()
      await game.proposeTrade(offer.to, offer.give, offer.receive)
    }
  }

  game.markChanged()
}

// ---------- 主动交易提议 ----------

function buildTradeProposal(game: GameApi, playerId: number, safety: number): { to: number; give: TradeOffer; receive: TradeOffer } | null {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)!

  // ① 垄断冲刺：现金高价收购目标地形的地块（1.1 倍地价）
  const target = rushTarget(brain, s, playerId)
  if (target) {
    const candidates = s.tiles.filter(t =>
      t.terrain === target && t.owner !== null && t.owner !== playerId &&
      s.players[t.owner]?.alive,
    )
    if (candidates.length) {
      const t = candidates.sort((a, b) => a.price - b.price)[0]
      const price = Math.round(t.price * 1.1 / 10) * 10
      if (p.cash - price >= safety * 0.7) {
        return {
          to: t.owner as number,
          give: { cash: price, tiles: [], resources: {} },
          receive: { cash: 0, tiles: [t.index], resources: {} },
        }
      }
    }
  }

  // ② 趁火打劫：急需现金的对手 → 9 折现金收购其一块地
  for (const m of brain.models) {
    if (!m.desperate) continue
    const other = s.players[m.id]
    if (!other?.alive) continue
    const theirTiles = s.tiles.filter(t => t.owner === other.id && t.type === 'terrain')
    if (!theirTiles.length) continue
    const t = theirTiles.sort((a, b) => b.price - a.price)[0]
    const price = Math.round(t.price * 0.9 / 10) * 10
    if (p.cash - price < safety * 0.7) continue
    return {
      to: other.id,
      give: { cash: price, tiles: [], resources: {} },
      receive: { cash: 0, tiles: [t.index], resources: {} },
    }
  }
  return null
}

// ---------- 市场操作 ----------

function planSales(game: GameApi, playerId: number): void {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  if (!brain) return
  const safety = cashSafetyLine(game, playerId)
  const lookahead = Math.max(0, brain.profile.lookahead)
  const hoardBias = brain.profile.hoarding

  // 紧急变现：现金低于安全线 → 卖市价最高的资源补回安全线
  if (p.cash < safety) {
    const best = RESOURCE_ORDER
      .filter(r => p.resources[r] > 0)
      .sort((a, b) => s.market[b] - s.market[a])[0]
    if (best) {
      const need = Math.max(safety, 1500) - p.cash
      const units = Math.min(Math.floor(p.resources[best]), Math.ceil(need / s.market[best]))
      if (units > 0) game.sellResources(best, units)
    }
    return
  }

  // 择时抛售/囤积：市价高于基准且前景不涨（或囤积倾向低）→ 卖出一部分
  // 大额抛售计入供给压力（压低市价），小额卖出不影响市场
  for (const r of RESOURCE_ORDER) {
    const stock = Math.floor(p.resources[r])
    if (stock < 4) continue
    const base = RESOURCES[r].basePrice
    if (s.market[r] < base * 1.25) continue
    const outlook = priceForecast(game, r, lookahead)
    // 前景看涨 → 囤积（除非囤积倾向很低）；前景看跌 → 抛售
    const sellFrac = outlook > 1.05 ? (1 - hoardBias) * 0.5 : 0.6
    const units = Math.floor(stock * sellFrac)
    if (units > 0) {
      game.sellResources(r, units)
      recordSale(game, r, units)
    }
  }

  // 市场操纵：攻击策略或情绪高涨时，集中抛售打击依赖该资源的对手（压价伤其收入）
  const wantAttack = brain.strategy === 'attack' || brain.emotion > 0.5
  if (wantAttack) {
    for (const r of RESOURCE_ORDER) {
      const stock = Math.floor(p.resources[r])
      if (stock < 5) continue
      const terrain = RESOURCES[r].terrain
      const dependent = s.players.some(pl =>
        pl.alive && pl.id !== playerId && terrainDependence(s, pl.id, terrain) >= 0.3,
      )
      if (!dependent || s.market[r] < RESOURCES[r].basePrice * 1.15) continue
      const units = Math.floor(stock * 0.4)
      if (units > 0) {
        game.sellResources(r, units)
        recordSale(game, r, units)
      }
    }
  }
}

// ---------- 勘探 / 升级评分 ----------

function exploreGain(game: GameApi, playerId: number, t: Tile): number {
  const s = game.state
  const res = TERRAIN_RESOURCE[t.terrain as Terrain]
  if (!res) return -Infinity
  // 勘探揭示储量：期望产出提升（富 1.6/普 1.0/贫 0.6，加权 ≈1.05） vs 勘探费
  const gain = 1 * (1.05 - 1) * s.market[res] * 60
  return gain - exploreCost(t)
}

function bestUpgrade(game: GameApi, playerId: number, myTiles: Tile[]): { tile: Tile; buildingId: number; score: number } | null {
  const s = game.state
  const h = 80   // 升级回本视野
  const opponents = s.players.filter(p => p.alive && p.id !== playerId).length
  const visits = (opponents * 6) / 72
  let best: { tile: Tile; buildingId: number; score: number } | null = null
  for (const t of myTiles) {
    for (const b of t.buildings) {
      if (b.level >= 3) continue
      const def = BUILDING_DEFS[b.type]
      const cost = levelCost(game, b.type, b.level + 1)
      let gain = 0
      if (def.outputMult) {
        const res = TERRAIN_RESOURCE[t.terrain as Terrain]
        const curMult = t.buildings.reduce((a, x) => a + (BUILDING_DEFS[x.type].outputMult ?? 0) * x.level, 0)
        gain = 1 * (def.outputMult / (1 + curMult)) * (s.market[res] ?? 100) * h
      }
      if (def.rentMult) {
        gain += tileRent(game, t, null) * def.rentMult * visits * h
      }
      const score = gain - cost
      if (!best || score > best.score) best = { tile: t, buildingId: b.id, score }
    }
  }
  return best
}

// ---------- 举报目标威胁排序 ----------

function threatOf(game: GameApi, otherId: number): number {
  const s = game.state
  const other = s.players[otherId]
  const m = monopolyInfo(game, otherId)
  let v = other.cash
  for (const t of s.tiles) {
    if (t.owner !== otherId) continue
    v += t.price * 0.8
  }
  v += incomeEstimate(s, otherId) * 10
  v *= 1 + m.singleRatio
  return v
}
