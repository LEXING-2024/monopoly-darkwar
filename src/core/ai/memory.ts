// ============ AI 记忆与情绪：谁举报过我，驱动报复或疏远 ============

import type { AiBrain, GameState } from '../types'
import { getBrain } from './brain'

/** 记录事件到大脑记忆并累加情绪（被攻击 +0.25） */
export function remember(game: GameState, playerId: number, otherId: number, kind: 'report'): void {
  const brain = getBrain(game, playerId)
  if (!brain) return
  brain.memory.push({ kind, from: otherId, turn: game.turn })
  if (brain.memory.length > 40) brain.memory = brain.memory.slice(-40)
  brain.emotion = Math.min(1, brain.emotion + 0.25)
}

/** 对手举报过我的次数 */
export function reportCount(brain: AiBrain, otherId: number): number {
  return brain.memory.filter(m => m.from === otherId && m.kind === 'report').length
}
