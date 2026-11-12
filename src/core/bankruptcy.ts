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
  // 剩余现金也属于资产，必须一并移交（旧实现直接清零，等于把破产者手里的现金凭空销毁）
  cashToCreditor += Math.max(0, Math.round(p.cash))
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

  // 资产整体移交后，债权人可能就此凑齐某地形全部地块 → 垄断胜利
  checkMonopolyVictory(game)

  // 终局规则
  const alive = s.players.filter(x => x.alive)
  // 破产可能发生在任意玩家回合（罚款、卡牌、举报），不一定经过当前玩家的 endTurn；
  // 只活一人时立刻登记胜者，主循环才能及时收束。
  if (alive.length === 1 && s.winner === null) {
    s.winner = alive[0].id
    s.endReason = 'last-standing'
    game.log(`「${alive[0].name}」淘汰了所有对手，成为最后的生还者！`, alive[0].id)
  }
  if (alive.length === 2 && !s.endgame && s.winner === null) {
    s.endgame = true
    s.roundsNoBankruptcy = 0
    // 银行收回所有无主地块
    for (const t of s.tiles) {
      if (t.owner === null && (t.type === 'terrain' || t.type === 'bridge')) t.seized = true
    }
    // 终局租金 +50% 由 globalRentMod 依据 endgame 标记统一施加。
    // 旧实现又往 rentMods 里塞了一条 ×1.5，实际变成 ×2.25；且 Infinity 存档后会变成 null，
    // 读档后终局加成神秘消失——同一局读档前后强度不一致。
    await game.notice('终局对决', '仅剩 2 名玩家！无主地块被银行收回，所有过路费 +50%，资源价格波动加剧！', '⚔️')
  }
  game.markChanged()
}

/** 终局经济危机（连续 5 回合无人破产，双方资产缩水 30%） */
export async function checkCrisis(game: GameApi): Promise<void> {
  const s = game.state
  if (s.winner !== null) return
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
  if (s.winner !== null) return false   // 已有胜者：避免后续资产变动覆盖结果
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
