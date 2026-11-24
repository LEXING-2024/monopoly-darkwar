// ============ 经济计算：租金 / 资源产出（文档 4、8、9） ============

import {
  BRIDGES, BRIDGE_REPAIR_DISCOUNT, BUILDING_DEFS, CLIMATE, CLIMATE_MODS, CONTIGUOUS_BONUS, EAST_BRIDGE, ENDGAME,
  EXPLORE_COST_RATIO, RENT_RAMP_MIN, RENT_RAMP_ROUNDS, RENT_STALL_MAX, RENT_STALL_PER_ROUND, RENT_STALL_START,
  RESERVE_MULT, RESERVE_WEIGHTS, RESOURCES, SEASONS, TERRAIN_RESOURCE, WEST_BRIDGE,
} from './config'
import { ownsTech } from './market'
import type { GameApi, Player, Reserve, ResourceType, Tile } from './types'

/** 全局租金倍率 */
export function globalRentMod(game: GameApi): number {
  const s = game.state
  let m = 1
  for (const mod of s.rentMods) if (mod.turns > 0) m *= mod.factor
  if (s.endgame) m *= ENDGAME.rentMod
  // 景气修正：繁荣租金 +10%、衰退 -10%（危机走过路费专项）
  m *= CLIMATE_MODS[s.climate].rent
  // 开局租金缓启动：前 N 轮从 60% 线性恢复到 100%
  const r = game.state.totalRound
  if (r < RENT_RAMP_ROUNDS) m *= RENT_RAMP_MIN + (1 - RENT_RAMP_MIN) * (r / RENT_RAMP_ROUNDS)
  // 反僵持：拖到后期的对局租金逐步上涨（超时局的共同特征是 3+ 人长期共存）
  m *= 1 + Math.min(RENT_STALL_MAX, Math.max(0, (r - RENT_STALL_START) * RENT_STALL_PER_ROUND))
  return m
}

/**
 * 该地块所在"连片段"的长度：同地形区内、同一所有者、索引连续（+1）的段。
 * 中间夹着特殊格（命运/机会/赌场/拍卖行）即视为断开——对应现实里被路口/广场隔断。
 * 非地形格或地块无主时返回 0。
 */
export function contiguousRun(game: GameApi, tile: Tile, assumeOwner?: number): number {
  const ownerId = assumeOwner ?? tile.owner
  if (tile.type !== 'terrain' || ownerId === null) return 0
  const s = game.state
  // 该地形区的地形格索引（升序；不含特殊格）
  const idxs = s.tiles
    .filter(t => t.type === 'terrain' && t.terrain === tile.terrain)
    .map(t => t.index)
    .sort((a, b) => a - b)
  const pos = idxs.indexOf(tile.index)
  if (pos < 0) return 0
  const sameOwner = (i: number): boolean => s.tiles[idxs[i]]?.owner === ownerId
  let len = 1
  // 向左延伸：数组相邻且索引差恰为 1（跨过特殊格则断）
  for (let i = pos - 1; i >= 0; i--) {
    if (idxs[i] !== idxs[i + 1] - 1 || !sameOwner(i)) break
    len++
  }
  // 向右延伸
  for (let i = pos + 1; i < idxs.length; i++) {
    if (idxs[i] !== idxs[i - 1] + 1 || !sameOwner(i)) break
    len++
  }
  return len
}

/**
 * 找"抽掉最能打断连片"的地块：该玩家最长连片段（≥3）的中点。
 * 抽掉中点能把整段劈成两半，最大化摧毁连片加成——反垄断"强制拆分"用。
 */
export function keyBreakupTile(game: GameApi, playerId: number): Tile | null {
  const s = game.state
  let best: { tile: Tile; run: number } | null = null
  for (const t of s.tiles) {
    if (t.type !== 'terrain' || t.owner !== playerId) continue
    const run = contiguousRun(game, t)
    if (run >= 3 && (!best || run > best.run)) best = { tile: t, run }
  }
  if (!best) return null
  const terrain = best.tile.terrain
  const idxs = s.tiles
    .filter(t => t.type === 'terrain' && t.terrain === terrain)
    .map(t => t.index)
    .sort((a, b) => a - b)
  const pos = idxs.indexOf(best.tile.index)
  let left = pos
  while (left - 1 >= 0 && idxs[left - 1] === idxs[left] - 1 && s.tiles[idxs[left - 1]].owner === playerId) left--
  let right = pos
  while (right + 1 < idxs.length && idxs[right + 1] === idxs[right] + 1 && s.tiles[idxs[right + 1]].owner === playerId) right++
  const mid = idxs[Math.floor((left + right) / 2)]
  return s.tiles[mid] ?? null
}

/** 连片租金加成倍率（连片 3/4/5+ 分别 +25%/+40%/+50%，取满足的最高档） */
export function contiguousBonus(game: GameApi, tile: Tile): number {
  const run = contiguousRun(game, tile)
  if (run < 3) return 1
  for (const tier of CONTIGUOUS_BONUS.tiers) {
    if (run >= tier.run) return 1 + tier.bonus
  }
  return 1
}

/** 一格当前租金（考虑建筑、全局修正、地震、终局、连片加成） */
export function tileRent(game: GameApi, tile: Tile, owner: Player | null): number {
  let rent = tile.baseRent
  if (tile.type === 'bridge') return 0   // 桥梁过路费单独算
  if (owner) {
    // 商业建筑每格限 1 座；这里取 max 而不是 sum，兼容旧存档里可能存在的两座商业，
    // 避免历史存档继续享受 5.2 倍叠加租金。
    let commercialMult = 0
    for (const b of tile.buildings) {
      if (b.damaged) continue   // 受损建筑停摆：不加成租金，修理后才恢复
      const def = BUILDING_DEFS[b.type]
      if (def.rentMult) commercialMult = Math.max(commercialMult, def.rentMult * b.level)
    }
    rent *= 1 + commercialMult
    // 玩家租金加成（开办集市等）
    for (const m of owner.status.rentBonus) {
      if (m.turns > 0) rent *= m.factor
    }
    if (ownsTech(game, owner.id, 'drone-logistics')) rent *= 1.1
    // 连片（整片开发）：同一所有者在该地形区连续 3 块以上，整段租金加成
    rent *= contiguousBonus(game, tile)
  }
  rent *= globalRentMod(game)
  // 地震当回合租金影响
  const q = game.state.quake
  if (q && q.affected.includes(tile.index) && q.turns > 0) {
    const table = [null, 0, 0.5, 1]
    rent *= 1 - (table[q.magnitude] as number)
  }
  return Math.round(rent / 10) * 10
}

/** 桥梁过路费（等级 + 关闭 + 修正） */
export function bridgeToll(game: GameApi, tile: Tile): number {
  if (tile.bridgeClosed > 0) return 0
  const cfg = BRIDGES[tile.index as typeof WEST_BRIDGE | typeof EAST_BRIDGE]
  if (!cfg) return 0
  let toll = cfg.tolls[tile.bridgeLevel]
  // 仅作用于指定桥的修正：只对匹配的桥生效（提价是桥主针对自己那座桥）
  for (const m of game.state.bridgeTollMods) {
    if (m.turns <= 0) continue
    if (m.bridge !== undefined && m.bridge !== tile.index) continue
    toll *= m.factor
  }
  toll *= globalRentMod(game)
  if (game.state.climate === 'crisis') toll *= CLIMATE.crisisBridgeToll
  return Math.round(toll / 10) * 10
}

/** 修桥/升级费用：该级升级成本 × 折扣（核心 game.repairBridge、AI、UI 共用此唯一口径） */
export function bridgeRepairCost(tile: Tile): number {
  const cfg = BRIDGES[tile.index as typeof WEST_BRIDGE | typeof EAST_BRIDGE]
  if (!cfg) return 0
  const base = (cfg.upgradeCosts as readonly number[])[tile.bridgeLevel] ?? 0
  return Math.round((base * BRIDGE_REPAIR_DISCOUNT) / 10) * 10
}

/** 地块当回合资源产出（未应用灾害，灾害由调用方按 tile.disaster 处理） */
export function tileOutput(game: GameApi, playerId: number, tile: Tile): number {
  const res = TERRAIN_RESOURCE[tile.terrain as keyof typeof TERRAIN_RESOURCE]
  if (!res) return 0
  const p = game.state.players[playerId]
  let out = RESOURCES[res].baseOutput
  if (tile.reserve !== 'unknown') out *= RESERVE_MULT[tile.reserve]
  // 生产建筑（文档 4.2：建设开采设施后才会自动产出——无采集建筑不产出任何资源）
  let prod = 0
  for (const b of tile.buildings) {
    if (b.damaged) continue   // 受损建筑停摆：产出归零，修理后才恢复
    const def = BUILDING_DEFS[b.type]
    if (def.outputMult) prod += def.outputMult * b.level
  }
  if (prod === 0) return 0
  out *= 1 + prod
  // 季节产出修正
  out *= SEASONS[game.state.season].outputMod[res] ?? 1
  // 玩家状态修正
  for (const m of p.status.outputMods) {
    if (m.turns > 0) out *= m.factor
  }
  for (const m of game.state.outputModAll) {
    if (m.turns > 0) out *= m.factor
  }
  for (const m of game.state.outputModsRes) {
    if (m.resource === res && m.turns > 0) out *= m.factor
  }
  if (ownsTech(game, playerId, 'automation')) out *= 1.25
  return out
}

/** 结算玩家当回合资源产出，返回各资源产量 */
export function collectOutput(game: GameApi, playerId: number): Partial<Record<ResourceType, number>> {
  const p = game.state.players[playerId]
  const gains: Partial<Record<ResourceType, number>> = {}
  for (const tile of game.state.tiles) {
    if (tile.owner !== playerId || tile.type !== 'terrain') continue
    const res = TERRAIN_RESOURCE[tile.terrain as keyof typeof TERRAIN_RESOURCE]
    if (!res) continue
    let out = tileOutput(game, playerId, tile)
    // 灾害影响
    if (tile.disaster) {
      const prot = tile.buildings.some(b => {
        const def = BUILDING_DEFS[b.type]
        return def.protects === tile.disaster!.kind
      })
      if (!prot) {
        switch (tile.disaster.kind) {
          case 'fire': case 'snow': case 'typhoon': case 'quake': case 'pollution':
            out = 0
            break
          case 'sandstorm': case 'flood':
            // 强度 3 级收益归零，1~2 级减半
            out = (tile.disaster.intensity ?? 1) >= 3 ? 0 : out * 0.5
            break
        }
      }
    }
    if (out > 0) {
      gains[res] = (gains[res] ?? 0) + out
      p.resources[res] += out
    }
  }
  return gains
}

/** 勘探费用与结果 */
export function exploreCost(tile: Tile): number {
  return Math.round((tile.price * EXPLORE_COST_RATIO) / 10) * 10
}

export function rollReserve(game: GameApi): Reserve {
  const idx = game.rng.weighted(RESERVE_WEIGHTS.map(w => w[1]))
  return RESERVE_WEIGHTS[idx][0]
}

/** 玩家总资产估值 */
export function totalValue(game: GameApi, playerId: number): number {
  const p = game.state.players[playerId]
  if (!p) return 0
  let v = p.cash
  for (const tile of game.state.tiles) {
    if (tile.owner === playerId) {
      v += tile.price
      for (const b of tile.buildings) v += b.invested
    }
  }
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    v += p.resources[res] * game.state.market[res]
  }
  return Math.round(v)
}

/** 总财富：全体存活玩家总资产之和（顶栏展示、轮末统计涨跌） */
export function totalWealthValue(game: GameApi): number {
  return game.state.players
    .filter(p => p.alive)
    .reduce((sum, p) => sum + totalValue(game, p.id), 0)
}
