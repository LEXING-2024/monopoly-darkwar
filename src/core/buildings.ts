// ============ 建筑系统：建造 / 升级 / 修理 / 勘探（文档 8、4.2） ============

import {
  BUILDING_DEFS, BUILD_SLOTS, CLIMATE_MODS, FLOOD_TILES, MAX_BUILDING_LEVEL,
  REPAIR_COST_RATIO, SEASONS, UPGRADE_COST_RATIO,
} from './config'
import { exploreCost, rollReserve } from './economy'
import type { Building, GameApi, Tile } from './types'

/** 某级建筑成本（建 L1 为基础成本；升 L2/L3 按比例；春季建造 -20%） */
export function levelCost(game: GameApi, defId: string, level: number): number {
  const def = BUILDING_DEFS[defId]
  let cost = def.cost
  if (level === 2) cost = def.cost * UPGRADE_COST_RATIO[0]
  if (level === 3) cost = def.cost * UPGRADE_COST_RATIO[1]
  if (game.state.season === 'spring') cost *= SEASONS.spring.buildCostMod
  // 景气修正：繁荣建筑费 -10%、衰退 +10%
  cost *= CLIMATE_MODS[game.state.climate].buildCost
  return Math.round(cost / 10) * 10
}

/** 修理一级的费用（含余震恐慌等全局修正） */
export function repairCost(game: GameApi, b: Building): number {
  let cost = levelCost(game, b.type, b.level + 1) * REPAIR_COST_RATIO
  for (const m of game.state.repairMods) if (m.turns > 0) cost *= m.factor
  return Math.round(cost / 10) * 10
}

export interface BuildCheck {
  ok: boolean
  reason?: string
}

export function canBuild(game: GameApi, playerId: number, tile: Tile, defId: string): BuildCheck {
  const def = BUILDING_DEFS[defId]
  if (!def) return { ok: false, reason: '未知建筑' }
  if (tile.owner !== playerId) return { ok: false, reason: '不是你的地块' }
  if (tile.type !== 'terrain') return { ok: false, reason: '该格不可建造' }
  if (def.terrain && tile.terrain !== def.terrain) return { ok: false, reason: '地形不符' }
  if (def.protects === 'flood' && !FLOOD_TILES.includes(tile.index)) return { ok: false, reason: '需建在河流沿岸' }
  if (tile.buildings.length >= BUILD_SLOTS) return { ok: false, reason: '建筑位已满' }
  if (tile.buildings.some(b => b.type === defId)) return { ok: false, reason: '该建筑已存在' }
  if (def.maxPerPlayer) {
    const owned = game.state.tiles.filter(
      t => t.owner === playerId && t.buildings.some(b => b.type === defId),
    ).length
    if (owned >= def.maxPerPlayer) return { ok: false, reason: `每名玩家限建 ${def.maxPerPlayer} 座` }
  }
  const cost = levelCost(game, defId, 1)
  if (game.state.players[playerId].cash < cost) return { ok: false, reason: '现金不足' }
  return { ok: true }
}

/** 建造。调用前应先用 canBuild 校验；失败抛出或静默返回 */
export function build(game: GameApi, playerId: number, tileIndex: number, defId: string): boolean {
  const tile = game.state.tiles[tileIndex]
  const check = canBuild(game, playerId, tile, defId)
  if (!check.ok) {
    game.log(`建造失败：${check.reason}`, playerId)
    return false
  }
  const def = BUILDING_DEFS[defId]
  const cost = levelCost(game, defId, 1)
  const p = game.state.players[playerId]
  p.cash -= cost
  p.stats.spent += cost
  p.stats.buildSpent += cost   // 金钱流向观测
  tile.buildings.push({ id: game.state.turn * 100 + tile.buildings.length, type: defId, level: 1, invested: cost })
  game.log(`${p.name} 在「${tile.name}」建造了${def.icon}${def.name}（-${cost}）`, playerId)
  game.sfx('build' as any)
  game.markChanged()
  return true
}

/** 升级建筑 */
export function upgrade(game: GameApi, playerId: number, tileIndex: number, buildingId: number): boolean {
  const tile = game.state.tiles[tileIndex]
  const b = tile?.buildings.find(x => x.id === buildingId)
  if (!b || tile.owner !== playerId) return false
  if (b.level >= MAX_BUILDING_LEVEL) return false
  const cost = levelCost(game, b.type, b.level + 1)
  const p = game.state.players[playerId]
  if (p.cash < cost) return false
  p.cash -= cost
  p.stats.spent += cost
  p.stats.buildSpent += cost   // 金钱流向观测
  b.level = (b.level + 1) as 1 | 2 | 3
  b.invested += cost
  b.damaged = false   // 升级视同重建，清除受损标记
  game.log(`${p.name} 将「${tile.name}」的${BUILDING_DEFS[b.type].name}升级为 ${b.level} 级（-${cost}）`, playerId)
  game.sfx('build' as any)
  game.markChanged()
  return true
}

/** 修理（返回是否成功）：仅限被灾害降级（damaged）的建筑；只恢复功能与收益，不恢复等级——
 *  等级只能靠「升级」提升（升级视同重建，受损建筑升级后自动恢复） */
export function repair(game: GameApi, playerId: number, tileIndex: number, buildingId: number, discount = 1): boolean {
  const tile = game.state.tiles[tileIndex]
  const b = tile?.buildings.find(x => x.id === buildingId)
  if (!b || tile.owner !== playerId) return false
  if (!b.damaged) return false
  const cost = Math.round((repairCost(game, b) * discount) / 10) * 10
  const p = game.state.players[playerId]
  if (p.cash < cost) return false
  p.cash -= cost
  p.stats.spent += cost
  p.stats.buildSpent += cost   // 金钱流向观测
  b.damaged = false   // 修理完成：恢复产出/租金加成（等级不变）
  game.log(`${p.name} 修理了「${tile.name}」的${BUILDING_DEFS[b.type].name}，恢复收益（-${cost}）`, playerId)
  game.sfx('build' as any)
  game.markChanged()
  return true
}

/** 勘探储量 */
export function explore(game: GameApi, playerId: number, tileIndex: number): boolean {
  const tile = game.state.tiles[tileIndex]
  if (tile.owner !== playerId || tile.type !== 'terrain' || tile.explored) return false
  const cost = exploreCost(tile)
  const p = game.state.players[playerId]
  if (p.cash < cost) return false
  p.cash -= cost
  p.stats.spent += cost
  tile.explored = true
  tile.reserve = rollReserve(game)
  const names = { rich: '富矿', normal: '普通', poor: '贫矿' } as const
  game.log(`${p.name} 勘探「${tile.name}」发现${names[tile.reserve]}（-${cost}）`, playerId)
  game.sfx('click')
  game.markChanged()
  return true
}
