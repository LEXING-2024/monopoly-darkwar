// ============ 自然灾害系统：地震 / 台风 / 季节灾害（文档 7） ============

import {
  BUILDING_DEFS, CLIMATE, DISASTER_INTENSITY_WEIGHTS, EAST_BRIDGE, FLOOD_TILES, QUAKE, SAFE_TURNS, SEASONS, START_INDEX, TILE_COUNT, TYPHOON, WEST_BRIDGE,
} from './config'
import { SEA_POINTS } from './map'
import type { Building, DisasterKind, GameApi, Tile, TyphoonState } from './types'

const QUAKE_NAMES = { 1: '小震', 2: '中震', 3: '大震' } as const

/** 建筑受损：低级可摧毁、高级降级。返回 'destroyed' | 'degraded' | 'insured' | 'ok' */
export function hitBuilding(
  game: GameApi, tile: Tile, b: Building,
  destroyProb: number, degrade2Prob: number, degrade3Prob: number,
): 'destroyed' | 'degraded' | 'insured' | 'ok' {
  const owner = game.state.players[tile.owner as number]
  const prob = b.level === 1 ? destroyProb : b.level === 2 ? degrade2Prob : degrade3Prob
  if (!game.rng.chance(prob)) return 'ok'
  // 保险：损失由银行承担
  if (owner && owner.status.insuredTurns > 0) {
    game.log(`${owner.name} 的建筑有保险庇护，损失由银行承担`, owner.id)
    return 'insured'
  }
  if (b.level === 1) {
    tile.buildings = tile.buildings.filter(x => x.id !== b.id)
    return 'destroyed'
  }
  b.level = (b.level - 1) as 1 | 2 | 3
  b.damaged = true   // 受损未修复：地图显示受损标记，修理/升级后清除
  return 'degraded'
}

/** 每回合灾害更新（回合开始时调用） */
export async function updateDisasters(game: GameApi): Promise<void> {
  // 前 10 轮保护期：不触发任何自然灾害（台风也不生成），仅做状态清理
  if (game.state.totalRound > SAFE_TURNS) {
    await checkEarthquake(game)
    await updateTyphoon(game)
    await checkSeasonalDisasters(game)
  }
  // 状态清理
  const s = game.state
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
      const res = hitBuilding(game, tile, b, t.destroy1, t.degrade2, t.degrade3)
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
    const { addChain } = await import('./events')
    addChain(game, 'quake-fear', null, 2, {})
  }
  if (bridges.length > 0) {
    const { addChain } = await import('./events')
    addChain(game, 'bridge-repair', null, 1, { bridge: bridges[0] })
  }
}

// ---------- 台风（文档 7.1：海上成长 / 随机路径 / 任意级别登陆 / 登陆波及） ----------

async function updateTyphoon(game: GameApi): Promise<void> {
  const s = game.state
  const t = s.typhoon
  if (t) {
    t.age++
    if (t.onLand) {
      t.landTurns++
      applyTyphoonLandDamage(game, t)
      // 陆上 1~2 回合消散
      if (t.landTurns >= TYPHOON.maxLandTurns || game.rng.chance(0.4)) {
        await dissipateTyphoon(game)
        return
      }
    } else {
      // 海上增强：概率 +1 级直至最强；未必都能成长到高等级
      if (t.strength < TYPHOON.maxStrength && game.rng.chance(TYPHOON.strengthenProb)) {
        t.strength = (t.strength + 1) as 0 | 1 | 2 | 3 | 4 | 5
      }
      // 路径：每回合可能改变移动方向——破坏地点不固定
      let turned = false
      if (game.rng.chance(TYPHOON.turnProb)) {
        t.dir = (t.dir * -1) as 1 | -1
        turned = true
      }
      const step = game.rng.int(TYPHOON.moveRange[0], TYPHOON.moveRange[1])
      let next = t.seaIndex + t.dir * step
      if (next < 0 || next >= SEA_POINTS.length) {
        t.dir = (t.dir * -1) as 1 | -1
        next = Math.min(Math.max(next, 0), SEA_POINTS.length - 1)
      }
      t.seaIndex = next
      // 气象站预测：下回合大致位置
      t.predicted = Math.min(Math.max(t.seaIndex + t.dir, 0), SEA_POINTS.length - 1)
      // 移动与转向写进行动日志
      const nearName = s.tiles[SEA_POINTS[t.seaIndex].tiles[0]].name
      const predictedName = s.tiles[SEA_POINTS[t.predicted].tiles[0]].name
      game.log(
        `台风${turned ? '改变方向，' : ''}移至「${nearName}」附近近海（${t.strength} 级），预计下一步靠近「${predictedName}」`,
        null,
      )
      game.sfx('wind')
      // 登陆：任意级别（≥1）都可能登陆，级别越高概率越大；低级别登陆也有其级别对应的破坏力
      if (t.strength >= 1 && game.rng.chance(TYPHOON.landfallProb[t.strength])) {
        const candidates = SEA_POINTS[t.seaIndex].tiles
        t.onLand = true
        t.landTile = game.rng.pick(candidates)
        t.landTurns = 0
        game.log(`台风（${t.strength} 级）登陆「${s.tiles[t.landTile].name}」！`, null)
        applyTyphoonLandDamage(game, t)
        game.emit('typhoon', s.typhoon)
        game.sfx('thunder')
        game.markChanged()
      } else {
        // 海上外围：≥2 级才影响最近沿海格（轻扰动无破坏力）
        if (t.strength >= 2) {
          const affected = typhoonAffectedTiles(game, t.seaIndex)
          applyTyphoonDamage(game, affected, t.strength, TYPHOON.neighborProbScale)
          if (affected.length) {
            game.log(`台风外围影响 ${affected.length} 个沿海地块（${affected.slice(0, 3).map(i => `「${s.tiles[i].name}」`).join('、')}${affected.length > 3 ? ' 等' : ''}）`, null)
          }
        }
        // 东桥受损
        if (t.seaIndex <= 1 && game.rng.chance(TYPHOON.eastBridgeDamageProb)) {
          const east = s.tiles[EAST_BRIDGE]
          if (east.bridgeLevel > 0) {
            east.bridgeLevel = (east.bridgeLevel - 1) as 0 | 1 | 2 | 3
            game.log('台风浪涌冲击「东桥」，桥梁受损！')
            const { addChain } = await import('./events')
            addChain(game, 'bridge-repair', null, 1, { bridge: EAST_BRIDGE })
          }
        }
        game.emit('typhoon', s.typhoon)
        game.markChanged()
      }
    }
    if (t.age >= t.maxLife) {
      await dissipateTyphoon(game)
      return
    }
  } else if ((s.season === 'summer' || s.season === 'autumn') && game.rng.chance(
    TYPHOON.spawnProb + s.typhoonProbDelta + (s.climate === 'crisis' ? CLIMATE.crisisDisasterProb : 0),
  )) {
    // 生成：0 级热带扰动，在海上逐步成长
    const seaIndex = game.rng.int(0, SEA_POINTS.length - 1)
    s.typhoon = {
      strength: TYPHOON.startStrength as 0,
      seaIndex,
      dir: game.rng.chance(0.5) ? 1 : -1,
      age: 1,
      maxLife: game.rng.int(TYPHOON.minLife, TYPHOON.maxLife),
      onLand: false,
      landTile: null,
      landTurns: 0,
      predicted: null,
      damagedBuildings: false,
    }
    game.log('东南近海生成热带扰动（0 级），将在海上移动并可能逐步增强！', null)
    await game.notice('台风生成', '东南近海生成了热带扰动，将在海上移动并逐步增强！', '🌀')
    game.sfx('thunder')
    game.emit('typhoon', s.typhoon)
  }
}

/** 登陆破坏：登陆地块 + 相邻波及格（≥4 级波及 ±2 格，波及格破坏概率减半，低级别也有其级别对应的破坏性） */
function applyTyphoonLandDamage(game: GameApi, t: TyphoonState): void {
  const base = t.landTile as number
  const reach = t.strength >= TYPHOON.wideRangeAt ? 2 : 1
  const affected = new Set<number>([base])
  for (let k = 1; k <= reach; k++) {
    affected.add((base + k) % TILE_COUNT)
    affected.add((base + TILE_COUNT - k) % TILE_COUNT)
  }
  for (const idx of affected) {
    applyTyphoonDamage(game, [idx], t.strength, idx === base ? 1 : TYPHOON.neighborProbScale)
  }
}

function typhoonAffectedTiles(game: GameApi, seaIndex: number): number[] {
  const base = SEA_POINTS[seaIndex].tiles
  const set = new Set<number>()
  for (const b of base) {
    set.add(b)
    set.add((b + 1) % 72)
    set.add((b + 71) % 72)
  }
  return [...set].filter(i => game.state.tiles[i].terrain === 'coast')
}

function applyTyphoonDamage(game: GameApi, tiles: number[], strength: number, probScale = 1): void {
  const s = game.state
  const destroyProb = (TYPHOON.destroyProb[strength] ?? 0) * probScale
  for (const idx of tiles) {
    const tile = s.tiles[idx]
    if (tile.owner === null && tile.buildings.length === 0) continue
    if (tile.owner !== null) {
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
    const { addChain } = await import('./events')
    addChain(game, 'typhoon-rebuild', null, 1, {})
  }
}

// ---------- 季节灾害（文档 7.3）：雪灾/沙尘暴为连续 3 块横扫（含无主空地）；火灾/洪水维持原逻辑 ----------

/** 环形地图上从 center 起连续横扫 n 个地块（首尾相接），标记其中全部地形地块（含无主空地，仅视觉与日志也生效） */
function sweepDisaster(game: GameApi, center: number, kind: 'snow' | 'sandstorm', n = 3, intensity = 1): number[] {
  const s = game.state
  const swept: number[] = []
  for (let k = 0; k < n; k++) swept.push((center + k) % TILE_COUNT)
  for (const idx of swept) {
    const tile = s.tiles[idx]
    // 灾害持续 2 轮（含发生轮），图标与收益损失同步保留
    if (tile.type === 'terrain') tile.disaster = { kind, turns: 2, intensity }
  }
  return swept
}

/** 季节灾害强度：1~3 级（权重 50/35/15），强度越高破坏越大 */
function disasterIntensity(game: GameApi): 1 | 2 | 3 {
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
        // 以随机高原地块为起点横扫（强度 1~3 级：横扫 3/4/5 块；3 级额外摧毁建筑）
        const L = disasterIntensity(game)
        const centers = s.tiles.map((t, i) => (t.type === 'terrain' && t.terrain === 'plateau' ? i : -1)).filter(i => i >= 0)
        const swept = sweepDisaster(game, game.rng.pick(centers), 'snow', 2 + L, L)
        // 无温室的地块：建筑按强度概率破损/降级
        damageBuildings(game, swept, 'snow', L)
        game.log(`暴风雪（${L} 级）横扫 ${swept.map(i => `「${s.tiles[i].name}」`).join('、')}，放牧收益归零，无温室的地块建筑可能受损！`, null)
        game.sfx('snow')
        await game.notice('雪灾来袭', `暴风雪（${L} 级）横扫「${s.tiles[swept[1]].name}」附近连续 ${2 + L} 个地块，收益归零，无温室的地块建筑可能受损！`, '❄️')
        break
      }
      case 'sandstorm': {
        // 随机横扫（强度 1~3 级：横扫 3/4/5 块；1~2 级 -50%，3 级收益归零）
        const L = disasterIntensity(game)
        const center = game.rng.int(0, TILE_COUNT - 1)
        const swept = sweepDisaster(game, center, 'sandstorm', 2 + L, L)
        // 无防沙林的地块：建筑按强度概率破损/降级
        damageBuildings(game, swept, 'sandstorm', L)
        const effect = L >= 3 ? '收益归零' : '开采效率 -50%'
        game.log(`沙尘暴（${L} 级）横扫 ${swept.map(i => `「${s.tiles[i].name}」`).join('、')}，${effect}！`, null)
        game.sfx('sand')
        await game.notice(
          '沙尘暴来袭',
          `沙尘暴（${L} 级）横扫「${s.tiles[center].name}」附近连续 ${2 + L} 个地块，${effect}（防沙林可免疫）！`,
          '🌪️',
        )
        break
      }
      case 'flood': {
        // 强度 1~3 级：桥梁受损概率 40/50/60%；3 级收益归零（1~2 级减半）
        const L = disasterIntensity(game)
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
            const { addChain } = await import('./events')
            addChain(game, 'bridge-repair', null, 1, { bridge: idx })
          }
        }
        // 无堤坝的地块：建筑按强度概率破损/降级
        damageBuildings(game, FLOOD_TILES, 'flood', L)
        const effect = L >= 3 ? '收益归零' : '收益减半'
        if (flooded.length) {
          game.log(`洪水泛滥（${L} 级），${flooded.length} 个沿岸地块受灾（${flooded.slice(0, 3).map(n => `「${n}」`).join('、')}${flooded.length > 3 ? ' 等' : ''}）`, null)
        } else {
          game.log('洪水泛滥，河流水位暴涨（无沿岸地块受灾）', null)
        }
        game.sfx('flood')
        await game.notice('洪水泛滥', `洪水（${L} 级）来袭，沿岸${effect}，桥梁可能受损（堤坝可免疫）！`, '🌊')
        break
      }
      case 'fire': {
        // 强度 1~3 级：起火点 1/2/3 个，蔓延相邻森林格概率 30/40/50%
        const L = disasterIntensity(game)
        const pool = game.rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
        const burn = new Set<number>()
        for (let k = 0; k < L; k++) {
          const seed = pool[k]
          burn.add(seed)
          for (const idx of [seed - 1, seed + 1]) {
            if (idx >= 1 && idx <= 15 && game.rng.chance(0.2 + 0.1 * L)) burn.add(idx)
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
