// ============ AI 性格生成 + 决策噪声（难度分级体现于此） ============

import { AI_DIFFICULTY } from '../config'
import type { AiDifficulty, AiProfile, AiBrain, GameApi } from '../types'
import { RNG } from '../rng'

/** 按难度 + 随机生成性格：难度决定噪声/犯错/预判/现金安全线，性格值在难度内随机保证个性差异 */
export function makeProfile(rng: RNG, difficulty: AiDifficulty): AiProfile {
  const d = AI_DIFFICULTY[difficulty]
  // 性格 0.2~1.0 连续分布（保留浮点精度；之前量化到 0.01 步长纯属无意义损耗）
  const rand = (): number => 0.2 + rng.next() * 0.8
  return {
    aggression: rand(),
    riskTolerance: rand(),
    cooperation: rand(),
    hoarding: rand(),
    revenge: rand(),
    greed: rand(),
    noiseAmp: d.noiseAmp,
    mistakeProb: d.mistakeProb,
    lookahead: d.lookahead,
    cashSafety: d.cashSafety,
  }
}

/** 大脑私有随机源（读取并写回 rngState，保证随存档的确定性） */
export function brainRng(brain: AiBrain): RNG {
  return RNG.fromState(brain.rngState)
}

export function saveBrainRng(brain: AiBrain, rng: RNG): void {
  brain.rngState = rng.getState()
}

/** 从候选动作中按分数选择：加噪声扰动 + 难度犯错概率（随机选一个动作替代最优） */
export function rollAction<T>(
  game: GameApi, brain: AiBrain,
  scored: { value: T; score: number }[],
): T | null {
  if (!scored.length) return null
  const rng = brainRng(brain)
  // 犯错：随机选一个动作（休闲 AI 的不稳定性来源）
  if (brain.profile.mistakeProb > 0 && rng.chance(brain.profile.mistakeProb)) {
    const picked = rng.pick(scored)
    saveBrainRng(brain, rng)
    return picked.value
  }
  const noisy = scored.map(c => ({
    value: c.value,
    // 噪声幅度与分数区间成正比（难度越低越不理性）
    score: c.score + rng.float(-brain.profile.noiseAmp, brain.profile.noiseAmp) * Math.max(1, Math.abs(c.score)),
  }))
  noisy.sort((a, b) => b.score - a.score)
  saveBrainRng(brain, rng)
  return noisy[0].value
}

