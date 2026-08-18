// ============ 72 格环形地图布局（纯几何计算，渲染层复用） ============

import { BRIDGES, EAST_BRIDGE, FLOOD_TILES, RESOURCES, START_INDEX, TERRAIN_RESOURCE, TILE_COUNT, WEST_BRIDGE, ZONES } from './config'
import type { RNG } from './rng'
import type { Tile, TilePos, TileType } from './types'

export const BOARD = { w: 2304, h: 1536 }

/** 地块卡片边长（世界单位）：相邻卡片恰好相接、互不遮挡 */
export const TILE_W = 96

// 十字形路线（顺时针，自底部中央出发，直线段笔直）。
// 起点 + 12 个拐角 + 直段内部格子全部沿线路按 96 间距等距排布：
// 各段长度均为 96 的整数倍，因此相邻卡片严丝合缝——直段无缝隙、拐角格恰好填住拐点。
const START = { x: 1152, y: 1440 }
const CORNERS: { x: number; y: number }[] = [
  { x: 864, y: 1440 },   // 下臂左下内拐角
  { x: 864, y: 1248 },   // 左臂下内拐角
  { x: 96, y: 1248 },    // 左臂下外拐角
  { x: 96, y: 288 },     // 左臂上外拐角
  { x: 864, y: 288 },    // 左臂上内拐角
  { x: 864, y: 96 },     // 上臂左外拐角
  { x: 1440, y: 96 },    // 上臂右外拐角
  { x: 1440, y: 288 },   // 上臂右内拐角
  { x: 2208, y: 288 },   // 右臂上外拐角
  { x: 2208, y: 1248 },  // 右臂下外拐角
  { x: 1440, y: 1248 },  // 下臂右上内拐角
  { x: 1440, y: 1440 },  // 下臂右内拐角
]

/**
 * 72 个格子的中心坐标与朝向。
 * 沿顺时针依次摆放：起点 1 块 → 各直段内部每 96 一块 → 每个拐角顶点 1 块，
 * 相邻格子间距恰为 TILE_W，紧挨排列、互不遮挡（拐角格填住拐点，直段无缝隙）。
 */
export const LAYOUT: TilePos[] = (() => {
  const pts: TilePos[] = []
  const way = [START, ...CORNERS]
  for (let s = 0; s < way.length; s++) {
    const from = way[s]
    const to = way[(s + 1) % way.length]
    const len = Math.hypot(to.x - from.x, to.y - from.y)
    const nx = (to.x - from.x) / len
    const ny = (to.y - from.y) / len
    const angle = Math.atan2(ny, nx)
    if (s === 0) pts.push({ x: from.x, y: from.y, angle })   // 起点格
    const n = len / TILE_W - 1                                // 直段内部格子数
    for (let k = 1; k <= n; k++) {
      pts.push({ x: from.x + nx * TILE_W * k, y: from.y + ny * TILE_W * k, angle })
    }
    if (s < way.length - 1) pts.push({ x: to.x, y: to.y, angle })   // 拐角格
  }
  if (pts.length !== TILE_COUNT) {
    console.warn(`[map] 布局格数 ${pts.length} ≠ ${TILE_COUNT}，请检查路线几何`)
  }
  return pts
})()

/** 近海航点（东南袋形海域，台风移动带），每点映射最近的沿海格子 */
export const SEA_POINTS: { x: number; y: number; tiles: number[] }[] = (() => {
  // 右臂与下臂之间的东南袋形海域采样点
  const samples = [
    { x: 1500, y: 1300 }, { x: 1630, y: 1305 }, { x: 1760, y: 1320 }, { x: 1890, y: 1345 },
    { x: 2020, y: 1370 }, { x: 2090, y: 1390 }, { x: 1900, y: 1385 }, { x: 1680, y: 1360 },
  ]
  const coastTiles = Array.from({ length: 18 }, (_, k) => 54 + k)
  return samples.map(s => {
    // 取最近的 2 个沿海格
    const sorted = [...coastTiles].sort(
      (a, b) =>
        Math.hypot(LAYOUT[a].x - s.x, LAYOUT[a].y - s.y) -
        Math.hypot(LAYOUT[b].x - s.x, LAYOUT[b].y - s.y),
    )
    return { x: s.x, y: s.y, tiles: sorted.slice(0, 2) }
  })
})()

// ---------- 地块生成 ----------

const TERRAIN_NAMES = { forest: '森林', plateau: '高原', desert: '沙漠', coast: '沿海' } as const
export const TILE_ICONS: Record<TileType, string> = {
  start: '🏠', terrain: '', fate: '⏳', chance: '🎁', bridge: '🌉', casino: '🎰', auction: '🔨',
}

export function createTiles(rng: RNG): Tile[] {
  const tiles: Tile[] = []
  const terrainCount: Record<string, number> = {}

  for (let i = 0; i < TILE_COUNT; i++) {
    if (i === START_INDEX) {
      tiles.push(makeTile(i, 'start', 'none', '起点', 0, 0, TILE_ICONS.start))
      continue
    }
    if (i === WEST_BRIDGE || i === EAST_BRIDGE) {
      const b = BRIDGES[i]
      tiles.push(makeTile(i, 'bridge', 'none', b.name, b.price, 0, TILE_ICONS.bridge))
      continue
    }
    const zone = ZONES.find(z => i >= z.range[0] && i <= z.range[1])
    if (!zone) {
      tiles.push(makeTile(i, 'terrain', 'none', `地块${i}`, 0, 0, '❓'))
      continue
    }
    const special = zone.specials.find(s => s.index === i)
    if (special) {
      const type: TileType = special.type === 'fate' ? 'fate'
        : special.type === 'chance' ? 'chance'
        : special.type === 'casino' ? 'casino' : 'auction'
      const names = { fate: '命运格', chance: '机会格', casino: '赌场', auction: '拍卖行' } as const
      tiles.push(makeTile(i, type, zone.terrain, `${TERRAIN_NAMES[zone.terrain]}·${names[type]}`, 0, 0, TILE_ICONS[type]))
      continue
    }
    // 普通地形格
    const n = (terrainCount[zone.terrain] = (terrainCount[zone.terrain] ?? 0) + 1)
    // 价格 = 分区基价 + 区内随机浮动（与序号无关，同区地块价格随机分布）
    const price = Math.round((zone.priceBase + rng.int(0, zone.priceStep * 12)) / 10) * 10
    const rent = Math.round((price * zone.rentRatio) / 10) * 10
    const icon = RESOURCES[TERRAIN_RESOURCE[zone.terrain]].icon
    tiles.push(makeTile(i, 'terrain', zone.terrain, `${TERRAIN_NAMES[zone.terrain]}·${n}号地`, price, rent, icon))
  }
  return tiles
}

function makeTile(
  index: number, type: TileType, terrain: Tile['terrain'],
  name: string, price: number, baseRent: number, icon: string,
): Tile {
  return {
    index, type, terrain, name, price, baseRent,
    owner: null, reserve: 'unknown', explored: false,
    buildings: [], bridgeLevel: 0, bridgeClosed: 0,
    disaster: null, seized: false, icon,
  }
}

export { FLOOD_TILES }
