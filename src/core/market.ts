// ============ 资源市场（文档 4.3 / 9.4） ============

import {
  BULK_SALE_DISCOUNT, BULK_SALE_THRESHOLD, MARKET_PRESSURE_COEF, MARKET_PRESSURE_THRESHOLD,
  MARKET_WALK, MARKET_WALK_ENDGAME,
  PRICE_CLAMP_MAX, PRICE_CLAMP_MIN, RESOURCES, SEASONS,
} from './config'
import type { GameApi, ResourceType } from './types'

/** 每回合价格随机游走 */
export function updateMarket(game: GameApi): void {
  const { state, rng } = game
  const walk = state.endgame ? MARKET_WALK_ENDGAME : MARKET_WALK
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    const base = RESOURCES[res].basePrice
    let p = state.market[res] * (1 + rng.float(-walk, walk))
    // 季节修正
    const seasonMod = SEASONS[state.season].priceMod[res] ?? 1
    // 卡牌价格修正
    let cardMod = 1
    for (const m of state.priceMods) {
      if (m.resource === res) cardMod *= m.factor
    }
    p = Math.min(Math.max(base * seasonMod * cardMod * PRICE_CLAMP_MIN, p), base * PRICE_CLAMP_MAX)
    state.market[res] = Math.round(p)
  }
  // 修正回合递减
  state.priceMods = state.priceMods.filter(m => m.turns > 0)
  for (const m of state.priceMods) m.turns--
}

/** 出售资源的成交单价（大量抛售当笔折价、无人机物流加成） */
export function sellUnitPrice(game: GameApi, playerId: number, res: ResourceType, units: number): number {
  let p = game.state.market[res]
  if (units >= BULK_SALE_THRESHOLD) p *= BULK_SALE_DISCOUNT
  if (ownsTech(game, playerId, 'drone-logistics')) p *= 1.1
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

/** 玩家全部资源按市价估值 */
export function resourceValue(game: GameApi, playerId: number): number {
  const p = game.state.players[playerId]
  if (!p) return 0
  let v = 0
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    v += p.resources[res] * game.state.market[res]
  }
  return v
}
