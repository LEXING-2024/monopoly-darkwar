// ============ 破产与终局（文档 2.3） ============

import { ENDGAME, RESOURCES } from './config'
import type { GameApi, Player, ResourceType } from './types'

/**
 * 强制变卖：资源半价出售、建筑半价折现，直到凑够目标金额。
 * 返回变卖后的现金。
 */
export function forceLiquidate(game: GameApi, playerId: number, target: number): number {
  const p = game.state.players[playerId]
  // 资源半价变卖
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    if (p.cash >= target) break
    const units = p.resources[res]
    if (units <= 0) continue
    const needUnits = Math.ceil((target - p.cash) / (game.state.market[res] * 0.5))
    const sell = Math.min(units, needUnits)
    const income = Math.round(sell * game.state.market[res] * 0.5)
    p.resources[res] -= sell
    p.cash += income
    p.stats.resourceIncome += income   // 金钱流向观测
    game.log(`${p.name} 半价变卖 ${sell} 单位${RESOURCES[res].name}（+${income}）`, playerId)
  }
  // 建筑半价折现（从最贵的开始拆除）
  if (p.cash < target) {
    const owned = game.state.tiles.filter(t => t.owner === playerId)
    const buildings = owned.flatMap(t => t.buildings.map(b => ({ tile: t, b })))
      .sort((x, y) => y.b.invested - x.b.invested)
    for (const { tile, b } of buildings) {
      if (p.cash >= target) break
      const refund = Math.round(b.invested / 2)
      p.cash += refund
      tile.buildings = tile.buildings.filter(x => x.id !== b.id)
      game.log(`${p.name} 折价拆除「${tile.name}」的建筑（+${refund}）`, playerId)
    }
  }
  return p.cash
}

/**
 * 破产结算：资产移交债权人（无债权人则充公）。
 * 建筑半价折现、资源半价变卖后移交现金与地块。
 */
export async function declareBankruptcy(game: GameApi, playerId: number, creditor: number | null, reason: string): Promise<void> {
  const s = game.state
  const p = s.players[playerId]
  if (!p.alive) return
  p.alive = false
  p.stats.timesBankrupt++
  s.bankruptOrder.push(playerId)
  if (s.firstBankruptTurn === null) s.firstBankruptTurn = s.turn

  let cashToCreditor = 0
  // 建筑半价折现
  for (const t of s.tiles) {
    if (t.owner !== playerId) continue
    for (const b of [...t.buildings]) {
      cashToCreditor += Math.round(b.invested / 2)
    }
    t.buildings = []
    t.owner = creditor
    t.disaster = null
  }
  // 资源半价变卖
  for (const res of Object.keys(RESOURCES) as ResourceType[]) {
    const units = p.resources[res]
    if (units > 0) {
      cashToCreditor += Math.round(units * s.market[res] * 0.5)
      p.resources[res] = 0
    }
  }
  p.cash = 0

  if (creditor !== null) {
    const c = s.players[creditor]
    c.cash += cashToCreditor
    c.stats.earned += cashToCreditor
    game.log(`「${p.name}」的全部资产（折现 ${cashToCreditor}）移交给「${c.name}」`)
    await game.notice('破产结算', `「${p.name}」${reason}，宣告破产！全部资产移交「${c.name}」。`, '💸')
  } else {
    game.log(`「${p.name}」${reason}，宣告破产！资产充公。`)
    await game.notice('破产结算', `「${p.name}」${reason}，宣告破产！资产充公。`, '💸')
  }
  game.sfx('lose')
  game.emit('bankrupt', { playerId, creditor })

  // 终局规则
  const alive = s.players.filter(x => x.alive)
  if (alive.length <= 2 && !s.endgame) {
    s.endgame = true
    s.roundsNoBankruptcy = 0
    // 银行收回所有无主地块
    for (const t of s.tiles) {
      if (t.owner === null && (t.type === 'terrain' || t.type === 'bridge')) t.seized = true
    }
    s.rentMods.push({ factor: ENDGAME.rentMod, turns: Infinity, label: '终局对决' })
    await game.notice('终局对决', '存活玩家不超过 2 人！无主地块被银行收回，所有过路费 +50%，资源价格波动加剧！', '⚔️')
  }
  game.markChanged()
}

/** 终局经济危机（连续 5 回合无人破产，双方资产缩水 30%） */
export async function checkCrisis(game: GameApi): Promise<void> {
  const s = game.state
  const alive = s.players.filter(p => p.alive)
  if (!s.endgame || alive.length !== 2) return
  s.roundsNoBankruptcy++
  if (s.roundsNoBankruptcy >= ENDGAME.crisisTurns) {
    s.roundsNoBankruptcy = 0
    for (const p of alive) {
      const lostCash = Math.round(p.cash * ENDGAME.crisisRatio)
      p.cash -= lostCash
      for (const res of Object.keys(RESOURCES) as ResourceType[]) {
        p.resources[res] = Math.floor(p.resources[res] * (1 - ENDGAME.crisisRatio))
      }
      // 资产缩水 30%：建筑有 30% 概率降一级（低级可能被拆除）
      let lostBuildings = 0
      for (const t of game.state.tiles) {
        if (t.owner !== p.id) continue
        for (const b of [...t.buildings]) {
          if (game.rng.chance(ENDGAME.crisisRatio)) {
            lostBuildings++
            if (b.level === 1) t.buildings = t.buildings.filter(x => x.id !== b.id)
            else b.level = (b.level - 1) as 1 | 2 | 3
          }
        }
      }
      game.log(`经济危机！「${p.name}」的资产缩水 30%（现金 -${lostCash}${lostBuildings ? `，${lostBuildings} 座建筑受损` : ''}）`, p.id)
    }
    await game.notice('经济危机', '连续 5 回合无人破产，双方资产按比例缩水 30%，直到分出胜负！', '📉')
  }
}

/** 垄断判决：拥有某类资源全部地块直接胜利 */
export function checkMonopolyVictory(game: GameApi): boolean {
  const s = game.state
  const terrains = ['forest', 'plateau', 'desert', 'coast'] as const
  for (const terrain of terrains) {
    const all = s.tiles.filter(t => t.type === 'terrain' && t.terrain === terrain)
    if (all.length === 0) continue
    for (const p of s.players) {
      if (!p.alive) continue
      if (all.every(t => t.owner === p.id)) {
        s.winner = p.id
        game.log(`「${p.name}」垄断了${terrain}资源，触发垄断判决，直接获胜！`, p.id)
        return true
      }
    }
  }
  return false
}
