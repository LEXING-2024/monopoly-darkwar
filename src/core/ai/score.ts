// ============ AI 效用评分核心：地块估值 / 灾害风险 / 现金安全线（模块化，参数集中在 config） ============

import {
  BRIDGES, BUILDING_DEFS, FLOOD_TILES, MAX_TURNS, RESERVE_MULT, RESERVE_WEIGHTS, RESOURCES,
  SEASONS, SEASON_ORDER, TILE_COUNT, TERRAIN_RESOURCE, EAST_BRIDGE, WEST_BRIDGE,
} from '../config'
import { bridgeToll, exploreCost, globalRentMod, tileOutput, tileRent } from '../economy'
import type { GameApi, ResourceType, Season, Terrain, Tile } from '../types'
import { getBrain } from './brain'

/** 决策视野：剩余回合估计（有界，终局更看重租金收益） */
export function horizon(game: GameApi): number {
  const s = game.state
  const remain = Math.max(30, MAX_TURNS - s.turn)
  return Math.min(300, remain)
}

/** 投资回本视野：建造/升级等现金支出只按近期回本评估（远期回报被破产风险与现金时间价值打折） */
export function investHorizon(game: GameApi): number {
  return Math.min(100, horizon(game))
}

/** 现金安全线：覆盖一次最大意外支出（对手最高租金/过路费） + 运营缓冲，随性格风险偏好缩放 */
export function cashSafetyLine(game: GameApi, playerId: number): number {
  const s = game.state
  const brain = getBrain(s, playerId)
  const safety = brain?.profile.cashSafety ?? 1
  let maxToll = 0
  for (const t of s.tiles) {
    if (t.owner !== null && t.owner !== playerId) {
      if (t.type === 'bridge') maxToll = Math.max(maxToll, bridgeToll(game, t))
      else maxToll = Math.max(maxToll, tileRent(game, t, s.players[t.owner]))
    }
  }
  // 风险承受高 → 允许更低的安全线；底线 1500（一次买地/过路费级别的缓冲）
  const risk = brain ? 1 - brain.profile.riskTolerance * 0.5 : 1
  return Math.round(Math.max(1500, (1500 + maxToll * 1.2)) * safety * risk)
}

/** 单地块综合估值 = 地价 + 租金现值 + 产出现值 + 垄断协同 */
export function tileValue(game: GameApi, playerId: number, tile: Tile): number {
  const s = game.state
  const h = Math.min(120, horizon(game))
  const opponents = s.players.filter(p => p.alive && p.id !== playerId).length
  // 每轮被对手踩中的期望次数：存活对手 × 平均步数 6 / 72 格
  const visits = (opponents * 6) / TILE_COUNT

  let v = tile.price
  if (tile.type === 'terrain') {
    // 租金现值（按无建筑的基础租金估算）
    v += tileRent(game, tile, null) * visits * h * 0.6
    // 产出现值（未勘探按期望储量 1.05 估算）
    const res = TERRAIN_RESOURCE[tile.terrain as Terrain]
    if (res) {
      const out = tileOutput(game, playerId, tile)
      v += out * s.market[res] * h * disasterDiscount(game, playerId, tile)
    }
  } else if (tile.type === 'bridge') {
    const cfg = BRIDGES[tile.index as typeof WEST_BRIDGE | typeof EAST_BRIDGE]
    if (cfg) {
      // 升级后平均过路费按未来收入预估
      v += (cfg.tolls[1] + cfg.tolls[2]) / 2 * visits * h * 0.5
    }
  }
  return Math.round(v)
}

/** 灾害折扣：未来 1~lookahead 季内该地块产出被灾害削弱的期望折扣（1 = 无灾害） */
export function disasterDiscount(game: GameApi, playerId: number, tile: Tile): number {
  const brain = getBrain(game.state, playerId)
  const lookahead = Math.max(0, brain?.profile.lookahead ?? 1)
  const risk = disasterRisk(game, tile, lookahead)
  // 有对应防护建筑则免疫对应灾害（风险已由 anticipate 调整，这里近似折半）
  const hasProtection = tile.buildings.some(b => BUILDING_DEFS[b.type]?.protects !== undefined)
  const r = hasProtection ? risk * 0.3 : risk
  return 1 - Math.min(0.6, r)
}

/** 未来 1~depth 季内该地块被灾害击中的期望概率（0~1，含台风近似） */
export function disasterRisk(game: GameApi, tile: Tile, depth: number): number {
  const s = game.state
  let p = 0
  const seasons = [s.season, ...nextSeasons(s.season, depth)]
  // 当前季剩余未知，按整季一半计；未来季整季计
  seasons.forEach((season, i) => {
    const w = i === 0 ? 0.5 : 1
    const def = SEASONS[season]
    for (const d of def.disasters) {
      switch (d.kind) {
        case 'fire':      // 随机森林格起火（含蔓延）
          p += tile.terrain === 'forest' ? d.prob * (1.3 / 15) * w : 0
          break
        case 'snow':      // 全部高原
          p += tile.terrain === 'plateau' ? d.prob * w : 0
          break
        case 'sandstorm': // 随机连续 3 格（全图）
          p += d.prob * (3 / TILE_COUNT) * w
          break
        case 'flood':     // 仅沿岸格
          p += isFloodTile(tile.index) ? d.prob * w : 0
          break
      }
    }
    // 台风：夏季沿海地块
    if (season === 'summer' && tile.terrain === 'coast') {
      p += 0.15 * 0.35 * w   // 生成率 × 登陆率（近似）
    }
  })
  return Math.min(0.9, p)
}

/** 未来 N 季（不含当前） */
export function nextSeasons(season: Season, n: number): Season[] {
  const idx = SEASON_ORDER.indexOf(season)
  const out: Season[] = []
  for (let i = 1; i <= n; i++) out.push(SEASON_ORDER[(idx + i) % SEASON_ORDER.length])
  return out
}

/** 资源价格预测：未来 depth 季内的价格修正（>1 看涨、<1 看跌） */
export function priceForecast(game: GameApi, res: ResourceType, depth: number): number {
  const s = game.state
  if (depth <= 0) return 1
  const next = nextSeasons(s.season, depth)[0]
  return SEASONS[next].priceMod[res] ?? 1
}

/** 勘探期望收益：花费勘探费揭示储量（富 1.6 / 普 1.0 / 贫 0.6，权重 25/50/25） */
export function exploreScore(game: GameApi, playerId: number, tile: Tile): number {
  const s = game.state
  if (tile.explored || tile.type !== 'terrain') return -Infinity
  const res = TERRAIN_RESOURCE[tile.terrain as Terrain]
  if (!res) return -Infinity
  // 基础产出 0.5 × 期望储量倍率 ≈1.05：勘探价值 = 提前锁定富矿的期望增益
  const expectedMult = RESERVE_WEIGHTS.reduce((a, [r, w]) => a + RESERVE_MULT[r] * w, 0)
  const outPerRound = RESOURCES[res].baseOutput * expectedMult
  const gain = outPerRound * s.market[res] * investHorizon(game) * disasterDiscount(game, playerId, tile)
  return gain - exploreCost(tile)
}

/** 是否是洪水沿岸格 */
function isFloodTile(index: number): boolean {
  return FLOOD_TILES.includes(index)
}
