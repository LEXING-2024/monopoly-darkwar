// ============ AI 预判机制：下一季节灾害风险与资源前景，调整当前决策 ============

import { SEASONS } from '../config'
import type { GameApi, ResourceType, Season, Terrain, Tile } from '../types'
import { nextSeasons, disasterRisk, priceForecast } from './score'

/** 未来 depth 季中「该地形受灾的期望概率」汇总（供防灾建筑提前建造决策） */
export function terrainDangerAhead(game: GameApi, terrain: Terrain, depth: number): number {
  const seasons = nextSeasons(game.state.season, Math.max(1, depth))
  let p = 0
  for (const season of seasons) {
    for (const d of SEASONS[season].disasters) {
      switch (d.kind) {
        case 'fire': if (terrain === 'forest') p += d.prob; break
        case 'snow': if (terrain === 'plateau') p += d.prob; break
        case 'sandstorm': p += d.prob * (3 / 72); break
        case 'flood': p += 0; break   // 洪水按沿岸格判定，见 disasterRisk
      }
    }
    if (season === 'summer' && terrain === 'coast') p += 0.15 * 0.35   // 台风近似
  }
  return Math.min(0.9, p)
}

/** 地块未来受灾风险（复用 score 的逐格计算） */
export function tileDangerAhead(game: GameApi, playerId: number, tile: Tile, depth: number): number {
  return disasterRisk(game, tile, Math.max(0, depth))
}

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

/** 灾害对应地形的建筑防护需求（当前季 + 未来季） */
export function protectionNeed(game: GameApi, playerId: number, tile: Tile): number {
  const brain = (game.state.aiBrains?.[playerId] ?? null)
  const depth = Math.max(0, brain?.profile.lookahead ?? 1)
  return tileDangerAhead(game, playerId, tile, depth)
}

export type { Season }
