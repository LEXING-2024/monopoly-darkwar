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

/** 生成全场唯一的建筑 id：扫描现有建筑取 max+1。
 *  旧实现用 turn*100+槽位，卡牌免费建筑用 turn*100+随机数，同一回合可能撞 id，
 *  导致升级/修理按 id 查找时命中错误建筑。 */
export function newBuildingId(game: GameApi): number {
  let max = 0
  for (const t of game.state.tiles) {
    for (const b of t.buildings) if (b.id > max) max = b.id
  }
  return max + 1
}

export function canBuild(game: GameApi, playerId: number, tile: Tile, defId: string): BuildCheck {
  const def = BUILDING_DEFS[defId]
  if (!def) return { ok: false, reason: '未知建筑' }
  if (tile.owner !== playerId) return { ok: false, reason: '不是你的地块' }
  if (tile.type !== 'terrain') return { ok: false, reason: '该格不可建造' }
  if (def.terrain && tile.terrain !== def.terrain) return { ok: false, reason: '地形不符' }
  if (def.protects === 'flood' && !FLOOD_TILES.includes(tile.index)) return { ok: false, reason: '需建在桥梁两侧' }
  if (tile.buildings.length >= BUILD_SLOTS) return { ok: false, reason: '建筑位已满' }
  if (tile.buildings.some(b => b.type === defId)) return { ok: false, reason: '该建筑已存在' }
  // 两个建筑位有明确分工：1 个资源生产位 + 1 个通用建筑位（商业/防灾/科技共用）。
  // 这样两座商业、商业+防灾都不能并存；生产 + 商业/防灾/科技仍可组合。
  const isProduction = def.category === 'production'
  const hasProduction = tile.buildings.some(b => BUILDING_DEFS[b.type]?.category === 'production')
  const hasGeneral = tile.buildings.some(b => BUILDING_DEFS[b.type]?.category !== 'production')
  if (isProduction && hasProduction) return { ok: false, reason: '每格只能建 1 座资源生产建筑' }
  if (!isProduction && hasGeneral) return { ok: false, reason: '通用建筑位已被商业/防灾/科技占用' }
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
  tile.buildings.push({ id: newBuildingId(game), type: defId, level: 1, invested: cost })
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
