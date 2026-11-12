// ============ 自然灾害系统：地震 / 台风 / 季节灾害（文档 7） ============

import {
  BUILDING_DEFS, CLIMATE, DISASTER_INTENSITY_WEIGHTS, EAST_BRIDGE, FLOOD_TILES, QUAKE, SAFE_TURNS, SEASONS, START_INDEX, TYPHOON, WEST_BRIDGE,
} from './config'
import { addChain } from './events'
import { BOARD, COAST_TILE_INDEXES, LAYOUT, isSeaPoint, nearestCoast } from './map'
import type { Building, DisasterKind, GameApi, Terrain, Tile, TyphoonState } from './types'

const QUAKE_NAMES = { 1: '小震', 2: '中震', 3: '大震' } as const

/** 建筑受损：1 级可摧毁、2 级降级（大震可被直接摧毁）、3 级只降级。
 *  返回 'destroyed' | 'degraded' | 'insured' | 'ok' */
export function hitBuilding(
  game: GameApi, tile: Tile, b: Building,
  destroyProb: number, degrade2Prob: number, degrade3Prob: number,
  destroy2Prob = 0,
): 'destroyed' | 'degraded' | 'insured' | 'ok' {
  const owner = game.state.players[tile.owner as number]
  const willDestroy = b.level === 1
    ? game.rng.chance(destroyProb)
    : b.level === 2 && destroy2Prob > 0
      ? game.rng.chance(destroy2Prob)
      : false
  const willDegrade = !willDestroy && b.level > 1
    ? game.rng.chance(b.level === 2 ? degrade2Prob : degrade3Prob)
    : false
  if (!willDestroy && !willDegrade) return 'ok'
  // 保险：损失由银行承担
  if (owner && owner.status.insuredTurns > 0) {
    game.log(`${owner.name} 的建筑有保险庇护，损失由银行承担`, owner.id)
    return 'insured'
  }
  if (willDestroy) {
    tile.buildings = tile.buildings.filter(x => x.id !== b.id)
    return 'destroyed'
  }
  b.level = (b.level - 1) as 1 | 2 | 3
  b.damaged = true   // 受损未修复：地图显示受损标记，修理/升级后清除
  return 'degraded'
}

/** 每轮灾害更新（轮开始时调用） */
export async function updateDisasters(game: GameApi): Promise<void> {
  const s = game.state
  // 先清理上一轮遗留状态，再生成新灾害。
  // 旧实现先生成后清理：新灾害在同一轮就被 -1，地震甚至当轮即被清除，
  // 导致「持续 2 轮」实际只生效 1 轮、地震的租金/起点效果完全失效。
  for (const t of s.tiles) {
    if (t.disaster) {
      t.disaster.turns--
      if (t.disaster.turns <= 0) t.disaster = null
    }
    if (t.bridgeClosed > 0) t.bridgeClosed--
  }
  if (s.quake) {
    s.quake.turns--
    if (s.quake.turns <= 0) s.quake = null
  }
  // 前 10 轮保护期：不触发任何自然灾害（台风也不生成）
  if (s.totalRound > SAFE_TURNS) {
    await checkEarthquake(game)
    await updateTyphoon(game)
    await checkSeasonalDisasters(game)
  }
}

function buildingCount(game: GameApi, playerId: number): number {
  return game.state.tiles.reduce(
    (n, t) => n + (t.owner === playerId ? t.buildings.length : 0), 0,
  )
}

// ---------- 地震（文档 7.2 / 15） ----------

async function checkEarthquake(game: GameApi): Promise<void> {
  const s = game.state
  if (s.quake) return
  // 危机期间灾害概率 +5%
  const crisisDelta = s.climate === 'crisis' ? CLIMATE.crisisDisasterProb : 0
  let prob = QUAKE.baseProb + crisisDelta
  if (s.players.some(p => p.alive && buildingCount(game, p.id) > QUAKE.manyBuildingsCount)) {
    prob = QUAKE.manyBuildingsProb + crisisDelta
  }
  if (!game.rng.chance(prob)) return

  const magnitude = (game.rng.weighted([...QUAKE.magnitudeWeights]) + 1) as 1 | 2 | 3
  const center = game.rng.int(0, 71)
  const affected = [(center + 71) % 72, center, (center + 1) % 72]
  const t = QUAKE.table[magnitude - 1]

  const damaged: { playerId: number; tileName: string }[] = []
  const bridges: number[] = []
  for (const idx of affected) {
    const tile = s.tiles[idx]
    if (tile.type === 'bridge') {
      if (tile.bridgeLevel > 0 && game.rng.chance(t.bridge)) {
        tile.bridgeLevel = (tile.bridgeLevel - 1) as 0 | 1 | 2 | 3
        bridges.push(idx)
        game.log(`地震中「${tile.name}」受损，桥梁等级下降！`)
      }
      continue
    }
    if (tile.owner === null) continue
    for (const b of [...tile.buildings]) {
      const res = hitBuilding(game, tile, b, t.destroy1, t.degrade2, t.degrade3, t.destroy2)
      if (res === 'destroyed' || res === 'degraded') {
        damaged.push({ playerId: tile.owner as number, tileName: tile.name })
      }
    }
  }

  s.quake = { center, magnitude, turns: 1, affected, startHalf: center === START_INDEX }
  game.log(`地震来袭（${QUAKE_NAMES[magnitude]}）！震中「${s.tiles[center].name}」，波及 ${affected.map(i => `「${s.tiles[i].name}」`).join('、')}`, null)
  game.sfx('quake')
  game.emit('quake', { center, magnitude, affected })

  const rentText = magnitude === 2 ? '，受影响地块当回合租金减半' : magnitude === 3 ? '，受影响地块当回合租金归零' : ''
  await game.notice(
    `地震来袭（${QUAKE_NAMES[magnitude]}）`,
    `「${s.tiles[center].name}」附近发生地震${rentText}。${damaged.length ? `共 ${damaged.length} 座建筑受损！` : '所幸未造成建筑损失。'}`,
    '🌋',
  )

  // 事件链：余震恐慌（2 回合后修理费 +30%）
  if (damaged.length > 0) {
    addChain(game, 'quake-fear', null, 2, {})
  }
  if (bridges.length > 0) {
    addChain(game, 'bridge-repair', null, 1, { bridge: bridges[0] })
  }
}

// ---------- 台风（文档 7.1：随机海域生成 / 自由移动 / 实际路径影响 / 登陆） ----------

type Spawn = { x: number; y: number }
type Impact = { tiles: number[]; scales: Map<number, number>; radius: number }

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function normalizeAngle(a: number): number {
  let v = (a + Math.PI) % (Math.PI * 2)
  if (v < 0) v += Math.PI * 2
  return v - Math.PI
}

/** 点到线段的距离：用于“路径扫过”的真实影响范围，而不是只看当前点 */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 <= 1e-6) return Math.hypot(px - ax, py - ay)
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/** 在东南海湾水面内随机取点；拒绝离海岸太近的位置，避免贴岸凭空生成 */
function randomSeaSpawn(game: GameApi): Spawn {
  let best: Spawn = { x: 1980, y: 1260 }
  let bestDist = -1
  for (let i = 0; i < 520; i++) {
    const x = game.rng.int(1120, BOARD.w - TYPHOON.spawnEdgeMargin)
    const y = game.rng.int(620, BOARD.h - TYPHOON.spawnEdgeMargin)
    if (!isSeaPoint(x, y)) continue
    const d = nearestCoast(x, y).dist
    if (d > bestDist) { bestDist = d; best = { x, y } }
    if (d >= TYPHOON.spawnMinDist && d <= TYPHOON.spawnMaxDist) return { x, y }
  }
  return best
}

/** 沿海地形格（排除拍卖行/机会格等特殊格），台风只在这些地块上造成灾害 */
function coastTerrainIndexes(game: GameApi): number[] {
  return COAST_TILE_INDEXES.filter(i => game.state.tiles[i]?.type === 'terrain')
}

/** 距离最近的海岸地形格；台风登陆/日志都只认地形格 */
function nearestCoastTerrain(game: GameApi, x: number, y: number): { tile: number; dist: number } {
  const coast = coastTerrainIndexes(game)
  let tile = coast[0] ?? COAST_TILE_INDEXES[0]
  let dist = Infinity
  for (const i of coast) {
    const d = Math.hypot(LAYOUT[i].x - x, LAYOUT[i].y - y)
    if (d < dist) { dist = d; tile = i }
  }
  return { tile, dist }
}

/** 东南近海随机生成一个台风状态；「台风警报」卡牌也复用这个工厂。 */
export function makeTyphoonState(game: GameApi, strength: 0 | 1 = 0): TyphoonState {
  const spawn = randomSeaSpawn(game)
  const coast = coastTerrainIndexes(game)
  const coastal = game.rng.chance(TYPHOON.parallelProb)
  let target = game.rng.pick(coast)
  if (coastal) {
    const near = nearestCoastTerrain(game, spawn.x, spawn.y)
    const idx = Math.max(0, coast.indexOf(near.tile))
    const step = 4 + game.rng.int(0, 2)
    const dir = game.rng.chance(0.5) ? step : -step
    target = coast[(idx + dir + coast.length) % coast.length]
  }
  const targetPt = LAYOUT[target]
  let heading = Math.atan2(targetPt.y - spawn.y, targetPt.x - spawn.x)
  // 生成时不要直接对准登陆点：非平行台风先朝偏侧方向走，之后再被目标缓慢拉回
  heading += coastal
    ? game.rng.float(-TYPHOON.initialTurnJitter * 0.35, TYPHOON.initialTurnJitter * 0.35)
    : game.rng.float(-TYPHOON.initialTurnJitter, TYPHOON.initialTurnJitter)
  return {
    strength,
    x: spawn.x,
    y: spawn.y,
    heading: normalizeAngle(heading),
    targetTile: target,
    coastal,
    age: 1,
    maxLife: game.rng.int(TYPHOON.minLife, TYPHOON.maxLife),
    onLand: false,
    landTile: null,
    landTurns: 0,
    predictedX: null,
    predictedY: null,
    damagedBuildings: false,
    path: [{ x: spawn.x, y: spawn.y }],
    weakening: false,
    fading: false,
  }
}

/** 旧存档没有真实坐标 / 轨迹字段：补齐，避免读档后轨迹为空或无法移动 */
function ensureTyphoonPath(t: TyphoonState): void {
  if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) {
    const p = LAYOUT[COAST_TILE_INDEXES[0]]
    t.x = p.x
    t.y = p.y
  }
  if (!Number.isFinite(t.heading)) {
    const p = LAYOUT[t.targetTile] ?? LAYOUT[nearestCoast(t.x, t.y).tile]
    t.heading = Math.atan2(p.y - t.y, p.x - t.x)
  }
  if (!Number.isFinite(t.targetTile)) t.targetTile = nearestCoast(t.x, t.y).tile
  if (!Array.isArray(t.path) || t.path.length === 0) t.path = [{ x: t.x, y: t.y }]
}

function pushTyphoonTrack(t: TyphoonState, x: number, y: number): void {
  const last = t.path[t.path.length - 1]
  if (!last || Math.hypot(last.x - x, last.y - y) > 0.5) t.path.push({ x, y })
  if (t.path.length > TYPHOON.maxPathPoints) t.path.splice(0, t.path.length - TYPHOON.maxPathPoints)
}

/** 当前点到目标登陆点的距离与方位；每回合有概率自由偏转，其余时间朝目标缓慢修正 */
function steerTyphoon(game: GameApi, t: TyphoonState): void {
  // 一定概率不朝目标修正，而是随机转向：让生成→登陆的路径有弯曲，而不是一条直线
  if (game.rng.chance(TYPHOON.wanderProb)) {
    t.heading = normalizeAngle(t.heading + game.rng.float(-TYPHOON.wanderTurn, TYPHOON.wanderTurn))
    return
  }
  let target = LAYOUT[t.targetTile] ?? LAYOUT[nearestCoastTerrain(game, t.x, t.y).tile]
  if (t.coastal && t.age >= TYPHOON.coastalHoldAge) {
    // 平行路径不会永远贴着海岸：几回合后开始缓慢内切，最终大概率登陆
    target = LAYOUT[nearestCoastTerrain(game, t.x, t.y).tile]
  }
  const desired = Math.atan2(target.y - t.y, target.x - t.x) + game.rng.float(-TYPHOON.turnJitter, TYPHOON.turnJitter)
  const maxTurn = t.coastal ? TYPHOON.coastalTurn : TYPHOON.maxTurnPerRound
  t.heading = normalizeAngle(t.heading + clamp(normalizeAngle(desired - t.heading), -maxTurn, maxTurn))
}

/** 沿真实坐标前进；接近海岸时自动登陆，返回是否本回合登陆 */
function moveTyphoon(game: GameApi, t: TyphoonState): boolean {
  steerTyphoon(game, t)
  const range = t.weakening ? TYPHOON.weakenMoveDistance : TYPHOON.moveDistance
  const speed = game.rng.int(range[0], range[1])
  const nx = t.x + Math.cos(t.heading) * speed
  const ny = t.y + Math.sin(t.heading) * speed
  const near = nearestCoastTerrain(game, nx, ny)
  const contactsLand = !isSeaPoint(nx, ny) || near.dist <= TYPHOON.landfallRadius
  if (contactsLand) {
    const landTile = near.tile
    t.landTile = landTile
    t.onLand = true
    t.landTurns = 0
    t.x = LAYOUT[landTile].x
    t.y = LAYOUT[landTile].y
    t.predictedX = null
    t.predictedY = null
    pushTyphoonTrack(t, t.x, t.y)
    return true
  }
  t.x = nx
  t.y = ny
  pushTyphoonTrack(t, nx, ny)
  const look = speed * TYPHOON.predictRounds
  t.predictedX = t.x + Math.cos(t.heading) * look
  t.predictedY = t.y + Math.sin(t.heading) * look
  return false
}

function setTyphoonStrength(t: TyphoonState, value: number): void {
  t.strength = Math.max(0, Math.min(TYPHOON.maxStrength, value)) as TyphoonState['strength']
}

/** 逐级减弱：每回合只降 1 级，降到 0 级后再保留一回合「热带低压」才消散 */
function weakenTyphoon(game: GameApi, t: TyphoonState, onLand: boolean): void {
  const before = t.strength
  t.weakening = true
  setTyphoonStrength(t, before - 1)
  if (t.strength === 0) {
    t.fading = true
    game.log(
      before === 0
        ? '台风能量耗尽，减弱为热带低压，下一回合消散。'
        : `台风${onLand ? '登陆后' : '在海上'}减弱为热带低压，下一回合消散。`,
      null,
    )
  } else {
    game.log(`台风${onLand ? '登陆后' : '在海上'}减弱为 ${t.strength} 级。`, null)
  }
}

/** 按真实路径/中心点到海岸圆牌的距离计算影响范围；只保留沿海地形格。越靠近中心破坏概率越高 */
function typhoonImpact(game: GameApi, t: TyphoonState, ax: number, ay: number, bx: number, by: number): Impact {
  const radius = TYPHOON.influenceRadius[t.strength] ?? 0
  const tiles: number[] = []
  const scales = new Map<number, number>()
  if (radius <= 0) return { tiles, scales, radius }
  // 只在沿海地形格上造成影响：台风不会深入森林/高原/沙漠，也不会打到拍卖行等特殊格
  for (const i of coastTerrainIndexes(game)) {
    const d = distToSegment(LAYOUT[i].x, LAYOUT[i].y, ax, ay, bx, by)
    if (d > radius) continue
    tiles.push(i)
    // 中心附近接近满额，边缘仍保留 35% 的破坏力
    scales.set(i, 0.35 + 0.65 * (1 - d / radius))
  }
  return { tiles, scales, radius }
}

function applyTyphoonImpact(game: GameApi, t: TyphoonState, ax: number, ay: number, bx: number, by: number): void {
  if (t.strength < 1) return
  const impact = typhoonImpact(game, t, ax, ay, bx, by)
  if (!impact.tiles.length) return
  applyTyphoonDamage(game, impact.tiles, t.strength, 1, impact.scales)
  game.log(
    `台风外围影响 ${impact.tiles.length} 个沿海地块（${impact.tiles.slice(0, 3).map(i => `「${game.state.tiles[i].name}」`).join('、')}${impact.tiles.length > 3 ? ' 等' : ''}）`,
    null,
  )
}

async function updateTyphoon(game: GameApi): Promise<void> {
  const s = game.state
  const t = s.typhoon
  if (t) {
    t.age++
    ensureTyphoonPath(t)

    // 0 级热带低压：上一回合已经完成「逐级减弱」，这一回合正式消散
    if (t.fading) {
      await dissipateTyphoon(game)
      return
    }

    if (t.onLand) {
      t.landTurns++
      if (t.strength >= 1) applyTyphoonLandDamage(game, t)
      weakenTyphoon(game, t, true)
      game.emit('typhoon', t)
      game.markChanged()
      return
    }

    // 海上增强：提高概率，绝大多数台风会成长；只在低强度时保留极小的提前减弱概率
    if (!t.weakening && t.strength < TYPHOON.maxStrength && game.rng.chance(TYPHOON.strengthenProb)) {
      setTyphoonStrength(t, t.strength + 1)
    }
    if (!t.weakening && t.strength <= 1 && t.age > 3 && game.rng.chance(TYPHOON.earlyWeakenProb)) {
      t.weakening = true
      game.log(`台风（${t.strength} 级）能量不足，开始减弱。`, null)
    }

    const prevX = t.x
    const prevY = t.y
    const landed = moveTyphoon(game, t)
    const near = nearestCoastTerrain(game, t.x, t.y)
    const nearName = s.tiles[near.tile].name
    const predictedName = t.predictedX !== null && t.predictedY !== null
      ? s.tiles[nearestCoastTerrain(game, t.predictedX, t.predictedY).tile].name
      : nearName
    game.log(
      `台风移至「${nearName}」附近海面（${t.strength} 级${t.coastal && !t.onLand ? '，近岸平行移动' : ''}）${t.weakening ? '，正在减弱' : ''}，预计下一步靠近「${predictedName}」`,
      null,
    )
    game.sfx('wind')

    if (landed) {
      const landTile = t.landTile as number
      game.log(`台风（${t.strength} 级）登陆「${s.tiles[landTile].name}」！`, null)
      applyTyphoonLandDamage(game, t)
      game.emit('typhoon', t)
      game.sfx('thunder')
      game.markChanged()
      return
    }

    // 距离登陆点只有 1~2 回合时，按实际影响半径先影响沿岸地块
    applyTyphoonImpact(game, t, prevX, prevY, t.x, t.y)

    // 东桥受损：按到东桥的实际距离判定
    const nearEastBridge = Math.hypot(t.x - LAYOUT[EAST_BRIDGE].x, t.y - LAYOUT[EAST_BRIDGE].y) < 340
    if (nearEastBridge && game.rng.chance(TYPHOON.eastBridgeDamageProb)) {
      const east = s.tiles[EAST_BRIDGE]
      if (east.bridgeLevel > 0) {
        east.bridgeLevel = (east.bridgeLevel - 1) as 0 | 1 | 2 | 3
        game.log('台风浪涌冲击「东桥」，桥梁受损！')
        addChain(game, 'bridge-repair', null, 1, { bridge: EAST_BRIDGE })
      }
    }

    // 到达生命峰值后进入减弱阶段：先挂上「减弱中」，下一回合开始逐级下降
    if (!t.weakening && t.age >= t.maxLife) {
      t.weakening = true
      game.log(`台风达到巅峰（${t.strength} 级），开始减弱。`, null)
    } else if (t.weakening) {
      weakenTyphoon(game, t, false)
    }

    game.emit('typhoon', t)
    game.markChanged()
  } else if ((s.season === 'summer' || s.season === 'autumn') && game.rng.chance(
    TYPHOON.spawnProb + s.typhoonProbDelta + (s.climate === 'crisis' ? CLIMATE.crisisDisasterProb : 0),
  )) {
    // 生成：0 级热带扰动，在真实海面随机位置生成
    s.typhoon = makeTyphoonState(game, TYPHOON.startStrength as 0)
    game.log('东南近海生成热带扰动（0 级），将在海面上随机移动并逐步增强！', null)
    await game.notice('台风生成', '东南近海生成了热带扰动，将在海面上移动并逐步增强！', '🌀')
    game.sfx('thunder')
    game.emit('typhoon', s.typhoon)
  }
}

/** 登陆破坏：按登陆点周围的真实影响半径计算，但只影响沿海地形格 */
function applyTyphoonLandDamage(game: GameApi, t: TyphoonState): void {
  const base = t.landTile as number
  const baseTile = game.state.tiles[base]
  if (!baseTile || baseTile.type !== 'terrain' || baseTile.terrain !== 'coast') {
    // 极端情况下登陆点落到特殊格上：改用最近的海岸地形格
    t.landTile = nearestCoastTerrain(game, t.x, t.y).tile
  }
  const landTile = t.landTile as number
  const impact = typhoonImpact(game, t, t.x, t.y, t.x, t.y)
  const tiles = new Set<number>([landTile, ...impact.tiles])
  const scales = new Map<number, number>(impact.scales)
  scales.set(landTile, 1)
  applyTyphoonDamage(game, [...tiles], t.strength, 1, scales)
}

function applyTyphoonDamage(
  game: GameApi,
  tiles: number[],
  strength: number,
  probScale = 1,
  distanceScales?: Map<number, number>,
): void {
  const s = game.state
  for (const idx of tiles) {
    const tile = s.tiles[idx]
    // 台风只发生在沿海地形格：不破坏内陆建筑、也不影响桥梁/特殊格
    if (!tile || tile.type !== 'terrain' || tile.terrain !== 'coast') continue
    if (tile.owner === null && tile.buildings.length === 0) continue
    if (tile.owner !== null) {
      // 防波堤：收益不归零（collectOutput 按 protects 判定）+ 建筑受损概率减半
      const breakwater = tile.buildings.some(b => BUILDING_DEFS[b.type]?.protects === 'typhoon')
      const scale = distanceScales?.get(idx) ?? probScale
      const destroyProb = (TYPHOON.destroyProb[strength] ?? 0) * scale * (breakwater ? 0.5 : 1)
      tile.disaster = { kind: 'typhoon', turns: 1 }   // 当回合收益归零
      for (const b of [...tile.buildings]) {
        const res = hitBuilding(game, tile, b, destroyProb, destroyProb, destroyProb)
        if (res === 'destroyed' || res === 'degraded') {
          if (s.typhoon) s.typhoon.damagedBuildings = true
          game.log(`台风摧毁了「${tile.name}」上的建筑！`, tile.owner as number)
        }
      }
    }
  }
}

async function dissipateTyphoon(game: GameApi): Promise<void> {
  const s = game.state
  const t = s.typhoon
  if (!t) return
  s.typhoon = null
  game.log('台风已经消散。')
  game.emit('typhoon', null)
  if (t.damagedBuildings) {
    addChain(game, 'typhoon-rebuild', null, 1, {})
  }
}

// ---------- 季节灾害（文档 7.3）：雪灾/沙尘暴为连续 3 块横扫（含无主空地）；火灾/洪水维持原逻辑 ----------

/** 从指定地形的地块中随机取一段连续横扫；只标记该地形的地块，绝不越界到其他地形。
 *  地形格列表会跳过命运/机会/赌场/拍卖等特殊格，因此这里的“连续”是地形格之间的连续。 */
function sweepDisaster(
  game: GameApi,
  terrain: Terrain,
  kind: 'snow' | 'sandstorm',
  n = 3,
  intensity = 1,
): number[] {
  const s = game.state
  const pool = s.tiles
    .filter(t => t.type === 'terrain' && t.terrain === terrain)
    .map(t => t.index)
  if (!pool.length) return []
  const start = game.rng.int(0, pool.length - 1)
  const swept: number[] = []
  for (let k = 0; k < n; k++) swept.push(pool[(start + k) % pool.length])
  for (const idx of swept) {
    const tile = s.tiles[idx]
    // 灾害持续 2 轮（含发生轮），图标与收益损失同步保留
    tile.disaster = { kind, turns: 2, intensity }
  }
  return swept
}

/** 季节灾害强度：1~3 级（权重 50/35/15），强度越高破坏越大 */
function rollDisasterIntensity(game: GameApi): 1 | 2 | 3 {
  return (game.rng.weighted([...DISASTER_INTENSITY_WEIGHTS]) + 1) as 1 | 2 | 3
}

/** 受灾地块的建筑受损：无对应防灾建筑时按强度概率破损/降级（强度越高破坏越大）。
 *  有对应防灾建筑 → 收益与建筑均免疫；保险由 hitBuilding 内部处理。 */
function damageBuildings(game: GameApi, tileIndexes: number[], kind: DisasterKind, intensity: 1 | 2 | 3): void {
  const probs = {
    1: [0.06, 0.04, 0.02],
    2: [0.1, 0.07, 0.04],
    3: [0.15, 0.1, 0.05],
  }[intensity]
  for (const idx of tileIndexes) {
    const t = game.state.tiles[idx]
    if (t.owner === null || t.buildings.length === 0) continue
    // 有对应防灾建筑：整体免疫，不受损
    const protected_ = t.buildings.some(b => BUILDING_DEFS[b.type].protects === kind)
    if (protected_) continue
    // 临时堤坝卡：洪水对地块收益与建筑的损失一并豁免（与卡牌文案一致）
    if (kind === 'flood' && game.state.players[t.owner]?.status.floodImmune > 0) continue
    for (const b of [...t.buildings]) hitBuilding(game, t, b, probs[0], probs[1], probs[2])
  }
}

async function checkSeasonalDisasters(game: GameApi): Promise<void> {
  const s = game.state
  const def = SEASONS[s.season]
  for (const d of def.disasters) {
    if (s.skipDisaster === d.kind) continue
    let prob = d.prob
    if (d.kind === 'flood') prob += s.floodProbDelta
    // 危机期间灾害概率 +5%
    if (s.climate === 'crisis') prob += CLIMATE.crisisDisasterProb
    if (!game.rng.chance(prob)) continue
    switch (d.kind) {
      case 'snow': {
        // 只在高原地块上横扫（强度 1~3 级：横扫 3/4/5 块；3 级额外摧毁建筑）
        const L = rollDisasterIntensity(game)
        const swept = sweepDisaster(game, 'plateau', 'snow', 2 + L, L)
        // 无温室的地块：建筑按强度概率破损/降级
        damageBuildings(game, swept, 'snow', L)
        game.log(`暴风雪（${L} 级）横扫 ${swept.map(i => `「${s.tiles[i].name}」`).join('、')}，放牧收益归零，无温室的地块建筑可能受损！`, null)
        game.sfx('snow')
        await game.notice('雪灾来袭', `暴风雪（${L} 级）横扫高原「${s.tiles[swept[1] ?? swept[0]].name}」附近连续 ${2 + L} 个地块，收益归零，无温室的地块建筑可能受损！`, '❄️')
        break
      }
      case 'sandstorm': {
        // 只在沙漠地块上随机横扫（强度 1~3 级：横扫 3/4/5 块；1~2 级 -50%，3 级收益归零）
        const L = rollDisasterIntensity(game)
        const swept = sweepDisaster(game, 'desert', 'sandstorm', 2 + L, L)
        // 无防沙林的地块：建筑按强度概率破损/降级
        damageBuildings(game, swept, 'sandstorm', L)
        const effect = L >= 3 ? '收益归零' : '开采效率 -50%'
        game.log(`沙尘暴（${L} 级）横扫 ${swept.map(i => `「${s.tiles[i].name}」`).join('、')}，${effect}！`, null)
        game.sfx('sand')
        await game.notice(
          '沙尘暴来袭',
          `沙尘暴（${L} 级）横扫沙漠「${s.tiles[swept[1] ?? swept[0]].name}」附近连续 ${2 + L} 个地块，${effect}（防沙林可免疫）！`,
          '🌪️',
        )
        break
      }
      case 'flood': {
        // 强度 1~3 级：桥梁受损概率 40/50/60%；3 级收益归零（1~2 级减半）
        const L = rollDisasterIntensity(game)
        const flooded: string[] = []
        for (const idx of FLOOD_TILES) {
          const tile = s.tiles[idx]
          if (tile.owner !== null) {
            if (s.players[tile.owner].status.floodImmune > 0) continue
            tile.disaster = { kind: 'flood', turns: 2, intensity: L }
            flooded.push(tile.name)
          }
        }
        for (const idx of [WEST_BRIDGE, EAST_BRIDGE]) {
          const tile = s.tiles[idx]
          if (tile.bridgeLevel > 0 && game.rng.chance(0.3 + 0.1 * L)) {
            tile.bridgeLevel = (tile.bridgeLevel - 1) as 0 | 1 | 2 | 3
            game.log(`洪水冲毁了「${tile.name}」！`)
            addChain(game, 'bridge-repair', null, 1, { bridge: idx })
          }
        }
        // 无堤坝的地块：建筑按强度概率破损/降级
        damageBuildings(game, FLOOD_TILES, 'flood', L)
        const effect = L >= 3 ? '收益归零' : '收益减半'
        if (flooded.length) {
          game.log(`洪水泛滥（${L} 级），${flooded.length} 个桥头地块受灾（${flooded.slice(0, 3).map(n => `「${n}」`).join('、')}${flooded.length > 3 ? ' 等' : ''}）`, null)
        } else {
          game.log('洪水泛滥，河流水位暴涨（无桥头地块受灾）', null)
        }
        game.sfx('flood')
        await game.notice('洪水泛滥', `洪水（${L} 级）来袭，桥梁两侧${effect}，桥梁可能受损（堤坝可免疫）！`, '🌊')
        break
      }
      case 'fire': {
        // 强度 1~3 级：起火点 1/2/3 个，蔓延相邻森林格概率 30/40/50%
        // 只在森林地形地块上起火/蔓延，不波及森林区内的命运/机会格
        const L = rollDisasterIntensity(game)
        const forest = s.tiles
          .filter(t => t.type === 'terrain' && t.terrain === 'forest')
          .map(t => t.index)
        const forestSet = new Set(forest)
        const pool = game.rng.shuffle([...forest])
        const burn = new Set<number>()
        for (let k = 0; k < L && k < pool.length; k++) {
          const seed = pool[k]
          burn.add(seed)
          for (const idx of [seed - 1, seed + 1]) {
            if (forestSet.has(idx) && game.rng.chance(0.2 + 0.1 * L)) burn.add(idx)
          }
        }
        const burned: string[] = []
        for (const idx of burn) {
          const tile = s.tiles[idx]
          if (tile.owner !== null) {
            tile.disaster = { kind: 'fire', turns: 2, intensity: L }
            burned.push(tile.name)
          }
        }
        // 无防火带的地块：建筑按强度概率破损/降级
        damageBuildings(game, [...burn], 'fire', L)
        if (burned.length) {
          game.log(`森林火灾（${L} 级）！${burned.map(n => `「${n}」`).join('、')}起火，收益归零！`, null)
        } else {
          game.log('森林发生火灾，所幸未波及有主地块', null)
        }
        game.sfx('fire')
        await game.notice('森林火灾', `森林火灾（${L} 级），受灾地块收益归零（防火带可免疫）！`, '🔥')
        break
      }
    }
    game.markChanged()
  }
}
