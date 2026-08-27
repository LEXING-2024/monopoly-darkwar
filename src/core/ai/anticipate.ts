// ============ AI 预判机制：资源前景 ============

import { SEASONS } from '../config'
import type { GameApi, ResourceType } from '../types'
import { nextSeasons } from './score'

/** 资源未来前景：>0 看涨持有，<0 看跌抛售（叠加未来两季修正与囤积倾向） */
export function resourceOutlook(game: GameApi, res: ResourceType, depth: number): number {
  if (depth <= 0) return 0
  const next = nextSeasons(game.state.season, depth)
  let score = 0
  for (let i = 0; i < next.length; i++) {
    const mod = SEASONS[next[i]].priceMod[res] ?? 1
    score += (mod - 1) / (i + 1)   // 越远的影响越小
  }
  return score
}
