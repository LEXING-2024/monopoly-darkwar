// ============ 资源市场（文档 4.3 / 9.4） ============

import {
  BUILDING_DEFS, BULK_SALE_DISCOUNT, BULK_SALE_THRESHOLD, INDUSTRY_LEADER,
  MARKET_PRESSURE_COEF, MARKET_PRESSURE_THRESHOLD,
  MARKET_REVERT, MARKET_WALK, MARKET_WALK_ENDGAME,
  PRICE_CLAMP_MAX, PRICE_CLAMP_MIN, RESOURCES, SEASONS,
} from './config'
import type { GameApi, ResourceType } from './types'

/** 每轮价格随机游走 + 向基准价回归（季节/卡牌修正参与夹逼边界；事件发生时另由 applyPriceShock 一次性冲击） */
export function updateMarket(game: GameApi): void {
  const { state, rng } = game
  const walk = state.endgame ? MARKET_WALK_ENDGAME : MARKET_WALK
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    const base = RESOURCES[res].basePrice
    const seasonMod = SEASONS[state.season].priceMod[res] ?? 1
    let cardMod = 1
    for (const m of state.priceMods) if (m.resource === res && m.turns > 0) cardMod *= m.factor
    const anchor = base * seasonMod * cardMod
    let p = state.market[res] * (1 + rng.float(-walk, walk))
    // 均值回归：避免长局价格钉死在 0.5x / 2.2x 夹逼边界，让「高价卖出」有周期而不是一次性运气
    p += (anchor - p) * MARKET_REVERT
    p = Math.min(Math.max(anchor * PRICE_CLAMP_MIN, p), base * PRICE_CLAMP_MAX)
    state.market[res] = Math.round(p)
  }
  // 价格修正按「轮」衰减（见 Game.runMainLoop 轮末），这里只负责应用
}

/** 一次性价格冲击：卡牌/季节事件声称“价格 ±X%”时，必须立即体现在市价上。
 *  仅把修正乘进夹逼下界几乎看不出来（旧实现的市场崩盘卡因此近乎无效）。
 *  冲击后仍受基准价 0.5~2.2 倍夹逼。 */
export function applyPriceShock(game: GameApi, res: ResourceType, factor: number): void {
  const base = RESOURCES[res].basePrice
  const p = game.state.market[res] * factor
  game.state.market[res] = Math.round(
    Math.min(Math.max(base * PRICE_CLAMP_MIN, p), base * PRICE_CLAMP_MAX),
  )
}

/** 某资源的"行业龙头"：该类地形上生产建筑（伐木场/牧场/油井/渔港）数量最多的玩家。
 *  并列时取建筑总等级更高者；仍并列则返回 null（避免多个龙头）。
 *  至少要有 INDUSTRY_LEADER.minBuildings 座才算。 */
export function industryLeader(game: GameApi, res: ResourceType): number | null {
  const terrain = RESOURCES[res].terrain
  const counts = new Map<number, { n: number; lv: number }>()
  for (const t of game.state.tiles) {
    if (t.owner === null || t.type !== 'terrain') continue
    for (const b of t.buildings) {
      const def = BUILDING_DEFS[b.type]
      if (!def || def.category !== 'production' || def.terrain !== terrain) continue
      const cur = counts.get(t.owner) ?? { n: 0, lv: 0 }
      cur.n++
      cur.lv += b.level
      counts.set(t.owner, cur)
    }
  }
  let best: { id: number; n: number; lv: number } | null = null
  let tie = false
  for (const [id, v] of counts) {
    const p = game.state.players[id]
    if (!p?.alive || v.n < INDUSTRY_LEADER.minBuildings) continue
    if (!best || v.n > best.n || (v.n === best.n && v.lv > best.lv)) {
      best = { id, ...v }
      tie = false
    } else if (best && v.n === best.n && v.lv === best.lv) {
      tie = true
    }
  }
  return best && !tie ? best.id : null
}

/** 出售资源的成交单价（大量抛售当笔折价、无人机物流加成、行业龙头溢价） */
export function sellUnitPrice(game: GameApi, playerId: number, res: ResourceType, units: number): number {
  let p = game.state.market[res]
  if (units >= BULK_SALE_THRESHOLD) p *= BULK_SALE_DISCOUNT
  if (ownsTech(game, playerId, 'drone-logistics')) p *= 1.1
  if (industryLeader(game, res) === playerId) p *= INDUSTRY_LEADER.sellBonus
  return p
}

/** 玩家是否拥有某科技建筑 */
export function ownsTech(game: GameApi, playerId: number, techId: string): boolean {
  return game.state.tiles.some(
    t => t.owner === playerId && t.buildings.some(b => b.type === techId),
  )
}

// ---------- 市场供给压力（大量抛售压价，有界微调） ----------

/** 记录卖出量（仅单笔大额抛售计入供给压力；日常小额卖出不影响市价） */
export function recordSale(game: GameApi, res: ResourceType, units: number): void {
  if (units < MARKET_PRESSURE_THRESHOLD) return
  const s = game.state
  if (!s.marketPressure) s.marketPressure = { wood: 0, beef: 0, oil: 0, fish: 0 }
  s.marketPressure[res] += units
}

/** 轮首结算供给压力：大额抛售量按比例压低市价（封顶 -20%），随后清零 */
export function settleMarketPressure(game: GameApi): void {
  const s = game.state
  if (!s.marketPressure) return
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    const pressure = s.marketPressure[res] ?? 0
    if (pressure <= 0) continue
    const drop = 1 - Math.min(0.2, pressure * MARKET_PRESSURE_COEF)
    s.market[res] = Math.round(s.market[res] * drop)
  }
  s.marketPressure = { wood: 0, beef: 0, oil: 0, fish: 0 }
}
