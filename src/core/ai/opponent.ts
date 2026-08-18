// ============ 对手建模与威胁评估：现金 / 地块分布 / 意图推断 / 威胁值 ============

import { BRIDGES, EAST_BRIDGE, WEST_BRIDGE } from '../config'
import { bridgeToll, tileRent, totalValue } from '../economy'
import type { AiBrain, GameApi, OpponentModel, Terrain } from '../types'
import { grudge, incomeEstimate, monopolyRushInfo } from './brain'
import { betrayalCount, reportCount } from './memory'
import { gamePhase, rankOf } from './strategy'

/** 每回合刷新对手模型快照（公开信息 + 推断） */
export function updateOpponentModels(game: GameApi, playerId: number): void {
  const s = game.state
  const brain = s.aiBrains?.[playerId]
  if (!brain) return
  const me = s.players[playerId]

  for (const other of s.players) {
    if (other.id === playerId) continue
    let m = brain.models.find(x => x.id === other.id)
    if (!m) {
      m = {
        id: other.id, cashEst: 0, terrainCount: {}, totalValueEst: 0, incomeEst: 0,
        monopolyRush: false, desperate: false, tradeCount: 0,
        betrayals: 0, reportsAgainstMe: 0, threat: 0,
      }
      brain.models.push(m)
    }
    if (!other.alive) { m.threat = 0; continue }

    m.cashEst = other.cash
    m.totalValueEst = totalValue(game, other.id)
    m.incomeEst = incomeEstimate(s, other.id)
    const tc: Partial<Record<Terrain, number>> = {}
    for (const t of s.tiles) {
      if (t.owner === other.id && t.terrain !== 'none') {
        tc[t.terrain] = (tc[t.terrain] ?? 0) + 1
      }
    }
    m.terrainCount = tc
    const rush = monopolyRushInfo(s, other.id)
    m.monopolyRush = rush.rushing
    // 急需现金：现金低且收入低（卖资源续命）
    m.desperate = other.cash < 1500 && m.incomeEst < 300
    m.betrayals = betrayalCount(brain, other.id)
    m.reportsAgainstMe = reportCount(brain, other.id)

    // 威胁值：资产规模 + 收入 + 对我可收取的租金/过路费 + 垄断进度 + 敌意
    let v = m.totalValueEst * 0.3 + m.incomeEst * 8
    for (const t of s.tiles) {
      if (t.owner !== other.id || t.owner === me.id) continue
      if (t.type === 'bridge') v += bridgeToll(game, t) * 4
      else v += tileRent(game, t, other) * 2
    }
    const m2 = rush.rushing ? 1.4 : 1
    v *= m2
    v += grudge(brain, other.id) * 500
    m.threat = Math.round(v)
  }
}

/** 威胁排序后的对手列表（最危险在前） */
export function threatsSorted(game: GameApi, playerId: number): number[] {
  const brain = game.state.aiBrains?.[playerId]
  if (!brain) return []
  return [...brain.models]
    .filter(m => m.threat > 0)
    .sort((a, b) => b.threat - a.threat)
    .map(m => m.id)
}

/** 最弱的对手（可乘虚而入：交易压价、困境背叛等） */
export function weakestOpponent(game: GameApi, playerId: number): number | null {
  const brain = game.state.aiBrains?.[playerId]
  if (!brain) return null
  const alive = brain.models.filter(m => game.state.players[m.id]?.alive && m.threat > 0)
  if (!alive.length) return null
  return [...alive].sort((a, b) => a.totalValueEst - b.totalValueEst)[0].id
}
