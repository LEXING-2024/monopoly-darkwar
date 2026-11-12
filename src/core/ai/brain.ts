// ============ AI 大脑：创建 / 获取 / 衰减（纯数据，随存档序列化） ============

import type { AiBrain, AiDifficulty, GameState, OpponentModel, Player, ResourceType, Terrain } from '../types'
import type { RNG } from '../rng'
import { makeProfile } from './personality'
import { TERRAIN_RESOURCE, RESOURCES } from '../config'

/** 为所有玩家创建大脑（人类为 null）。种子来自主 RNG，保证同种子对局 AI 行为可复现 */
export function createBrains(players: Player[], difficulty: AiDifficulty, rng: RNG): (AiBrain | null)[] {
  return players.map(p => {
    if (!p.isAI) return null
    return {
      profile: makeProfile(rng, difficulty),
      emotion: 0,
      memory: [],
      models: initModels(players, p.id),
      strategy: 'expand',
      lastTradeTurn: -1000,
      rngState: Math.floor(rng.next() * 0xffffffff) >>> 0,
    }
  })
}

/** 初始对手模型：以当前公开状态做第一次快照 */
function initModels(players: Player[], selfId: number): OpponentModel[] {
  return players
    .filter(p => p.id !== selfId)
    .map(p => ({
      id: p.id,
      cashEst: p.cash,
      terrainCount: {},
      totalValueEst: p.cash,
      incomeEst: 0,
      monopolyRush: false,
      desperate: false,
      tradeCount: 0,
      reportsAgainstMe: 0,
      threat: 0,
    }))
}

/** 获取玩家大脑（非 AI 返回 null） */
export function getBrain(state: GameState, playerId: number): AiBrain | null {
  return state.aiBrains?.[playerId] ?? null
}

/** 每轮衰减：情绪冷却、记忆裁剪 */
export function decayBrain(brain: AiBrain): void {
  brain.emotion = Math.max(0, brain.emotion * 0.8 - 0.02)
  if (brain.memory.length > 40) brain.memory = brain.memory.slice(-40)
}

/** 情绪/记忆驱动的「针对某对手的敌意加成」（0 = 无感，1 = 满腹敌意） */
export function grudge(brain: AiBrain, otherId: number): number {
  const acts = brain.memory.filter(m => m.from === otherId).length
  const score = acts * 0.25 + (acts > 0 ? brain.profile.revenge * 0.2 : 0)
  return Math.min(1, Math.max(0, score))
}

/** 对手在某地形资源上的依赖度：其持有该地形地块数 / 其地形地块总数 */
export function terrainDependence(state: GameState, otherId: number, terrain: Terrain): number {
  const owned = state.tiles.filter(t => t.owner === otherId && t.terrain === terrain).length
  const total = state.tiles.filter(t => t.owner === otherId && t.type === 'terrain').length
  return total > 0 ? owned / total : 0
}

/** 对手资源产出估值（每回合，按市价折算现金） */
export function incomeEstimate(state: GameState, playerId: number): number {
  const p = state.players[playerId]
  if (!p || !p.alive) return 0
  let income = 0
  const produced: Partial<Record<ResourceType, number>> = {}
  for (const t of state.tiles) {
    if (t.owner !== playerId || t.type !== 'terrain') continue
    const res = TERRAIN_RESOURCE[t.terrain as Terrain]
    if (!res) continue
    produced[res] = (produced[res] ?? 0) + RESOURCES[res].baseOutput
  }
  for (const res of Object.keys(produced) as ResourceType[]) {
    income += (produced[res] ?? 0) * state.market[res]
  }
  return income
}

/** 意图推断：是否在冲刺某地形垄断（单地形占比 ≥60%） */
export function monopolyRushInfo(state: GameState, playerId: number): { rushing: boolean; terrain: Terrain | null } {
  const owned: Partial<Record<Terrain, number>> = {}
  const total: Partial<Record<Terrain, number>> = {}
  for (const t of state.tiles) {
    if (t.type !== 'terrain' || t.terrain === 'none') continue
    total[t.terrain] = (total[t.terrain] ?? 0) + 1
    if (t.owner === playerId) owned[t.terrain] = (owned[t.terrain] ?? 0) + 1
  }
  let terrain: Terrain | null = null
  let best = 0
  for (const k of Object.keys(total) as Terrain[]) {
    const r = (owned[k] ?? 0) / (total[k] ?? 1)
    if (r > best) { best = r; terrain = k }
  }
  return { rushing: best >= 0.6, terrain }
}
