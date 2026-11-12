// ============ 72 格环形地图布局（纯几何计算，渲染层复用） ============
// 一条圆角矩形商路：直段贴边、四角收紧、东南留出海湾。格子沿线等距分布，
// 卡片直径略小于步距，邻格之间留出细缝，不再靠叠压来填补曲线。
// 卡片保持正向（文字始终可读）；四大地形区仍按 1~17 森林、19~35 高原、
// 36~52 沙漠、54~71 沿海的索引顺序铺在路旁。

import { BRIDGES, EAST_BRIDGE, FLOOD_TILES, RESOURCES, START_INDEX, TERRAIN_RESOURCE, TILE_COUNT, WEST_BRIDGE, ZONES } from './config'
import type { RNG } from './rng'
import type { Tile, TilePos, TileType } from './types'

export const BOARD = { w: 2304, h: 1536 }
export const BOARD_CX = BOARD.w / 2
export const BOARD_CY = BOARD.h / 2

/** 相邻格子的中心距：圆牌之间留 6px 细缝，弯道处也不叠压 */
const TILE_SPACING = 86

/** 圆牌直径（世界单位）：比步距小 6px，直段和弯道都能看见完整卡片 */
export const TILE_SIZE = 80

const TARGET_PERIMETER = TILE_SPACING * TILE_COUNT

type Pt = { x: number; y: number }

/**
 * 商路控制点（逆时针，自底部中央出发，沿左缘上行，经顶部、右缘、东南海湾回到起点）。
 * 坐标是「基准轮廓」，之后会整体缩放到目标周长。
 */
const CONTROL: Pt[] = [
  { x: 1152, y: 1450 },  // 0 起点（底部中央）
  { x: 760, y: 1451 },
  { x: 420, y: 1440 },
  { x: 250, y: 1390 },   // 左下圆角
  { x: 160, y: 1230 },
  { x: 145, y: 980 },
  { x: 150, y: 740 },    // 西桥附近，左岸直线段
  { x: 180, y: 500 },
  { x: 280, y: 290 },    // 左上圆角
  { x: 470, y: 165 },
  { x: 760, y: 125 },
  { x: 1080, y: 115 },   // 顶部直线段（高原 → 沙漠）
  { x: 1400, y: 118 },
  { x: 1700, y: 135 },
  { x: 1935, y: 195 },   // 右上圆角
  { x: 2100, y: 330 },
  { x: 2175, y: 520 },
  { x: 2195, y: 720 },   // 东桥附近
  // 东南海湾：路线向内收，给台风留出一条完整的海面航道
  { x: 2080, y: 835 },
  { x: 1900, y: 930 },
  { x: 1720, y: 970 },
  { x: 1570, y: 1020 },
  { x: 1420, y: 1090 },
  { x: 1330, y: 1200 },
  { x: 1315, y: 1320 },
  { x: 1290, y: 1420 },
  { x: 1220, y: 1450 },
]

/** 均匀 Catmull-Rom（闭合）→ 密集折线 */
function catmullRomClosed(points: Pt[], perSeg = 72): Pt[] {
  const out: Pt[] = []
  const n = points.length
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[(i + 2) % n]
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  return out
}

function polylineLength(pts: Pt[]): number {
  let L = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    L += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return L
}

/** 闭合折线按弧长重采样：台风航点保持约 `step` 世界像素的均匀间距 */
function resampleClosed(pts: Pt[], step: number): Pt[] {
  const total = polylineLength(pts)
  const count = Math.max(12, Math.round(total / step))
  const out: Pt[] = []
  let seg = 0
  let acc = 0
  let segLen = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) || 1
  for (let i = 0; i < count; i++) {
    const target = (i / count) * total
    while (acc + segLen < target) {
      acc += segLen
      seg = (seg + 1) % pts.length
      const a = pts[seg]
      const b = pts[(seg + 1) % pts.length]
      segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1
    }
    const a = pts[seg]
    const b = pts[(seg + 1) % pts.length]
    const t = (target - acc) / segLen
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
  }
  return out
}

function scaleAbout(pts: Pt[], k: number, cx: number, cy: number): Pt[] {
  return pts.map(p => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k }))
}

/** 等弧长采样 72 个位置 */
function sampleLayout(): TilePos[] {
  let dense = catmullRomClosed(CONTROL, 64)
  const base = polylineLength(dense)
  const k = TARGET_PERIMETER / base
  dense = scaleAbout(dense, k, BOARD_CX, BOARD_CY)
  // 整体轻移，给右侧海面与底部画框留出同等边距
  dense = dense.map(p => ({ x: p.x - 9, y: p.y - 4 }))
  // 缩放后重新计算累计弧长（缩放是线性的，长度同比，但重新算更稳）
  const total = polylineLength(dense)
  const step = total / TILE_COUNT
  const result: TilePos[] = []
  let idx = 0
  let acc = 0
  for (let i = 0; i < TILE_COUNT; i++) {
    const target = i * step
    while (acc + Math.hypot(dense[(idx + 1) % dense.length].x - dense[idx].x, dense[(idx + 1) % dense.length].y - dense[idx].y) < target) {
      acc += Math.hypot(dense[(idx + 1) % dense.length].x - dense[idx].x, dense[(idx + 1) % dense.length].y - dense[idx].y)
      idx = (idx + 1) % dense.length
    }
    const a = dense[idx]
    const b = dense[(idx + 1) % dense.length]
    const segLen = Math.hypot(b.x - a.x, b.y - a.y) || 1
    const t = (target - acc) / segLen
    const prev = dense[(idx - 1 + dense.length) % dense.length]
    result.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - prev.y, b.x - prev.x),
    })
  }
  return result
}

export const LAYOUT: TilePos[] = sampleLayout()

if (LAYOUT.length !== TILE_COUNT) {
  console.warn(`[map] 布局格数 ${LAYOUT.length} ≠ ${TILE_COUNT}，请检查路线几何`)
}

/** 东西两桥共用的同一条河：西侧山泉 → 西桥 → 谷地 → 东桥 → 东南海湾 */
const RIVER_CONTROL: Pt[] = [
  { x: 18, y: 842 },
  { x: LAYOUT[WEST_BRIDGE].x, y: LAYOUT[WEST_BRIDGE].y },
  { x: 300, y: 880 },
  { x: 560, y: 790 },
  { x: 840, y: 850 },
  { x: 1120, y: 765 },
  { x: 1400, y: 805 },
  { x: 1670, y: 735 },
  { x: 1930, y: 650 },
  { x: LAYOUT[EAST_BRIDGE].x, y: LAYOUT[EAST_BRIDGE].y },
  { x: 2288, y: 600 },
  { x: 2300, y: 660 },
]

export const RIVER_POINTS: { x: number; y: number; t: number }[] = (() => {
  const dense: Pt[] = []
  const n = RIVER_CONTROL.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = RIVER_CONTROL[Math.max(0, i - 1)]
    const p1 = RIVER_CONTROL[i]
    const p2 = RIVER_CONTROL[i + 1]
    const p3 = RIVER_CONTROL[Math.min(n - 1, i + 2)]
    for (let k = 0; k < 24; k++) {
      const t = k / 24
      const t2 = t * t
      const t3 = t2 * t
      dense.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  dense.push({ ...RIVER_CONTROL[n - 1] })
  return dense.map((p, i) => ({ x: p.x, y: p.y, t: i / (dense.length - 1) }))
})()


/**
 * 东南海湾的新海岸线：沿 53~71 号沿海格的外缘向外收 68px，
 * 一直连到右侧与底部画框——让海面比旧版更大，同时保证沿海格仍站在岸上。
 * 台风航点、底图海面与 Canvas 海面共用这一条线。
 */
export const SEA_COAST: Pt[] = (() => {
  const pts: Pt[] = [{ x: BOARD.w, y: 600 }]
  for (let i = EAST_BRIDGE; i <= 71; i++) {
    const p = LAYOUT[i]
    const dx = p.x - BOARD_CX
    const dy = p.y - BOARD_CY
    const len = Math.hypot(dx, dy) || 1
    pts.push({
      x: Math.max(8, Math.min(BOARD.w - 8, p.x + (dx / len) * 74)),
      y: Math.max(8, Math.min(BOARD.h - 6, p.y + (dy / len) * 74)),
    })
  }
  const last = pts[pts.length - 1]
  pts.push({ x: Math.max(1100, last.x - 120), y: BOARD.h - 2 })
  // 海岸线做两轮 Chaikin 平滑：避免逐格法线造成锯齿/折角
  let smooth = pts
  for (let pass = 0; pass < 2; pass++) {
    const next: Pt[] = [smooth[0]]
    for (let i = 0; i < smooth.length - 1; i++) {
      const a = smooth[i]
      const b = smooth[i + 1]
      next.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 })
      next.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 })
    }
    next.push(smooth[smooth.length - 1])
    smooth = next
  }
  return smooth
})()

// ---------- 真实海域：台风在面内随机生成 / 自由移动，不再沿固定线 ----------

export const COAST_TILE_INDEXES = Array.from({ length: 18 }, (_, k) => 54 + k)

/** 东南海湾的闭合多边形：海岸线 + 棋盘右下角 */
const SEA_POLYGON: Pt[] = [...SEA_COAST, { x: BOARD.w, y: BOARD.h }]

function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]
    const b = poly[j]
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** 点是否在外海（东南海湾）水面上 */
export function isSeaPoint(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x <= BOARD.w && y <= BOARD.h && pointInPolygon(x, y, SEA_POLYGON)
}

/** 最近的海岸地块（54~71）及其到圆牌中心的距离 */
export function nearestCoast(x: number, y: number): { tile: number; dist: number } {
  let tile = COAST_TILE_INDEXES[0]
  let dist = Infinity
  for (const i of COAST_TILE_INDEXES) {
    const d = Math.hypot(LAYOUT[i].x - x, LAYOUT[i].y - y)
    if (d < dist) { dist = d; tile = i }
  }
  return { tile, dist }
}

/**
 * 近海航点（东南海湾，台风移动带）。
 *
 * 台风不再在十几个相距上百像素的粗航点之间跳跃：这里先生成一条闭合的
 * 平滑海湾航线，再按约 24px 的弧长重采样。`seaIndex` 指向这些密集航点，
 * 每回合只前进 1~3 个航点，配合渲染层的路径补间，看起来是连续航行。
 * 所有控制点都落在海湾内，且避开了海岸卡片与内陆。
 */
export const SEA_POINTS: { x: number; y: number; tiles: number[] }[] = (() => {
  const controls: Pt[] = [
    { x: 2250, y: 900 },   // 东桥外侧，湾口（距东桥约 330，保留浪涌损桥判定）
    { x: 2225, y: 1080 },  // 沿东侧海岸南下
    { x: 2160, y: 1225 },
    { x: 2030, y: 1355 },  // 转向西南
    { x: 1850, y: 1430 },
    { x: 1650, y: 1465 },  // 海湾底部
    { x: 1500, y: 1445 },
    { x: 1575, y: 1350 },  // 内圈回头，避免台风只贴着画框走
    { x: 1750, y: 1300 },
    { x: 1940, y: 1230 },  // 沿湾内北上
    { x: 2090, y: 1130 },
    { x: 2200, y: 1010 },
  ]
  // 先做平滑闭合曲线，再按 24px 等弧长重采样：每段距离稳定，路径不会突然拉长
  const dense = resampleClosed(catmullRomClosed(controls, 64), 24)
  const coastTiles = COAST_TILE_INDEXES
  return dense.map(s => {
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
    const n = (terrainCount[zone.terrain] = (terrainCount[zone.terrain] ?? 0) + 1)
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
