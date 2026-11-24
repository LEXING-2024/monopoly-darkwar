// ============ 破产与终局（文档 2.3） ============

import { ENDGAME, monopolyTerrainRatio, RESOURCES } from './config'
import type { GameApi, Player, ResourceType, Terrain } from './types'

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
  // 任何破产都重置"无人破产"倒计时：危机只惩罚真正的僵局
  s.roundsNoBankruptcy = 0

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

  // 垄断胜利改为轮末统一判定（需连续维持），此处不再即时检查

  // 终局规则
  const alive = s.players.filter(x => x.alive)
  // 破产可能发生在任意玩家回合（罚款、卡牌、举报），不一定经过当前玩家的 endTurn；
  // 只活一人时立刻登记胜者，主循环才能及时收束。
  if (alive.length === 1 && s.winner === null) {
    s.winner = alive[0].id
    s.endReason = 'last-standing'
    game.log(`「${alive[0].name}」淘汰了所有对手，成为最后的生还者！`, alive[0].id)
  }
  if (alive.length <= ENDGAME.pressureAlive && alive.length >= 2 && !s.endgame && s.winner === null) {
    s.endgame = true
    s.roundsNoBankruptcy = 0
    // 银行收回所有无主地块
    for (const t of s.tiles) {
      if (t.owner === null && (t.type === 'terrain' || t.type === 'bridge')) t.seized = true
    }
    // 租金倍率统一由 globalRentMod 按存活人数施加：≤2 人 ×1.5，3 人 ×1.0（压力期不叠租金）。
    // 旧实现又往 rentMods 里塞了一条 ×1.5，实际变成 ×2.25；且 Infinity 存档后会变成 null，
    // 读档后终局加成神秘消失——同一局读档前后强度不一致。
    const rentMod = alive.length <= 2 ? ENDGAME.rentMod : ENDGAME.pressureRentMod
    const endgameText = rentMod > 1
      ? `仅剩 ${alive.length} 名玩家！无主地块被银行收回，所有过路费 ×${rentMod}，资源价格波动加剧！`
      : `仅剩 ${alive.length} 名玩家，进入终局压力期！无主地块被银行收回，连续 ${ENDGAME.crisisTurns} 轮无人破产将触发经济危机。`
    await game.notice('终局对决', endgameText, '⚔️')
  }

  // 人类淘汰：单独事件交给 UI 弹出结算/观战选择（不阻塞游戏主循环）
  if (!p.isAI) {
    game.emit('human-eliminated', {
      playerId,
      rank: s.bankruptOrder.length,
      assets: Math.round(cashToCreditor),
      reason,
    })
  }
  game.markChanged()
}

/** 终局经济危机（连续 6 轮无人破产，存活玩家资产缩水 30%） */
export async function checkCrisis(game: GameApi): Promise<void> {
  const s = game.state
  if (s.winner !== null) return
  const alive = s.players.filter(p => p.alive)
  if (!s.endgame || alive.length < 2 || alive.length > ENDGAME.pressureAlive) return
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
    await game.notice('经济危机', `连续 ${ENDGAME.crisisTurns} 轮无人破产，存活玩家资产按比例缩水 30%，直到分出胜负！`, '📉')
  }
}

/** 地形中文名（垄断冲刺日志用） */
const TERRAIN_NAMES: Record<Terrain, string> = { forest: '森林', plateau: '高原', desert: '沙漠', coast: '沿海' }

/**
 * 垄断状态追踪（不判胜）：垄断不是胜利条件，而是"压制全桌的武器"。
 * 每轮末更新谁在垄断哪类资源、已维持多少轮，供 UI 显示与"断供"等垄断手段判定用。
 * 权重（份额）跌破门槛即清空。胜负仍靠淘汰——用垄断手段把对手现金流逼断、最终破产出局。
 */
export function updateMonopolyStatus(game: GameApi): void {
  const s = game.state
  const terrains: Terrain[] = ['forest', 'plateau', 'desert', 'coast']

  // 找出当前占比最高且越过"垄断线"的玩家+地形（每人只取其最强的那类地形）
  // 门槛按存活人数缩放：4 人局 50%…8 人局 70%，避免小桌几乎无法触发垄断
  const threshold = monopolyTerrainRatio(s.players.length)
  let best: { playerId: number; terrain: Terrain; ratio: number } | null = null
  for (const p of s.players) {
    if (!p.alive) continue
    for (const terrain of terrains) {
      const all = s.tiles.filter(t => t.type === 'terrain' && t.terrain === terrain)
      if (!all.length) continue
      const owned = all.filter(t => t.owner === p.id).length
      const ratio = owned / all.length
      if (ratio >= threshold && (!best || ratio > best.ratio)) {
        best = { playerId: p.id, terrain, ratio }
      }
    }
  }

  // 未达门槛：清空垄断状态
  if (!best) {
    if (s.monopolyHold) s.monopolyHold = null
    return
  }

  const prev = s.monopolyHold
  const same = prev && prev.playerId === best.playerId && prev.terrain === best.terrain
  const rounds = same ? prev!.rounds + 1 : 1
  const firstTime = !same
  s.monopolyHold = { playerId: best.playerId, terrain: best.terrain, rounds }

  // 首次达成时提示全桌（这是"你已被盯上"的信号，也是举报窗口的开启）
  if (firstTime) {
    game.log(`「${s.players[best.playerId].name}」控制了 ${Math.round(best.ratio * 100)}% 的${TERRAIN_NAMES[best.terrain]}资源，形成垄断——可对其发起反垄断举报，或用垄断手段反制`, best.playerId)
  }
}
