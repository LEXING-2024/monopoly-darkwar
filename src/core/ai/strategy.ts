// ============ AI 状态机：游戏阶段 × 资产排名 → 扩张 / 防守 / 攻击 / 垄断冲刺 ============

import type { AiBrain, GameApi, Player, Terrain } from '../types'
import { monopolyRushInfo } from './brain'
import { totalValue } from '../economy'

/** 游戏阶段：早期（发育）/ 中期 / 后期（终局或幸存者少） */
export function gamePhase(game: GameApi): 'early' | 'mid' | 'late' {
  const s = game.state
  const alive = s.players.filter(p => p.alive).length
  if (s.endgame || alive <= 2) return 'late'
  if (s.totalRound <= 15) return 'early'
  return 'mid'
}

/** 资产排名：0 = 最富，1 = 第二… */
export function rankOf(game: GameApi, playerId: number): number {
  const s = game.state
  const alive = s.players.filter(p => p.alive).sort((a, b) => totalValue(game, b.id) - totalValue(game, a.id))
  return alive.findIndex(p => p.id === playerId)
}

/** 每回合更新策略：阶段 × 排名 × 意图 */
export function updateStrategy(game: GameApi, brain: AiBrain, p: Player): void {
  const s = game.state
  const phase = gamePhase(game)
  const rank = rankOf(game, p.id)
  // 难度行为：monopolyFocus 越高越早开始冲刺（阈值约 0.50~0.68），低难度更晚
  const focus = brain.profile.monopolyFocus ?? 0.6
  const rushThreshold = Math.min(0.72, Math.max(0.45, 0.6 + (0.6 - focus) * 0.25))
  const rush = monopolyRushInfo(s, p.id, rushThreshold)

  let next: AiBrain['strategy'] = brain.strategy
  // 垄断冲刺：某地形已占 ≥50% 且中期以后 → 全力冲刺该地形
  if (phase !== 'early' && rush.rushing) {
    next = 'monopoly'
  } else if (phase === 'early' || rank >= 2) {
    next = 'expand'
  } else if (phase === 'late') {
    next = 'attack'
  } else {
    // 中期：现金紧张或灾害暴露高 → 防守；富且强势 → 攻击；否则保持
    const safety = cashSafetyQuick(s, p.id)
    const strong = p.cash > safety * 3
    next = strong ? 'attack' : p.cash < safety * 1.2 ? 'defend' : (brain.strategy === 'expand' ? 'expand' : 'attack')
  }
  brain.strategy = next
}

/** 快速现金安全估算（避免与 score 循环依赖，策略切换只做粗判） */
function cashSafetyQuick(s: GameApi['state'], playerId: number): number {
  let maxRent = 0
  for (const t of s.tiles) {
    if (t.owner !== null && t.owner !== playerId) maxRent = Math.max(maxRent, t.baseRent)
  }
  return 1500 + maxRent
}

/** 垄断冲刺的目标地形 */
export function rushTarget(brain: AiBrain, s: GameApi['state'], playerId: number): Terrain | null {
  if (brain.strategy !== 'monopoly') return null
  const focus = brain.profile.monopolyFocus ?? 0.6
  const threshold = Math.min(0.72, Math.max(0.45, 0.6 + (0.6 - focus) * 0.25))
  const info = monopolyRushInfo(s, playerId, threshold)
  return info.terrain
}
