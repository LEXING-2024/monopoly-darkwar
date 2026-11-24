// ============ 事件系统：反垄断 / 事件链 / 季节事件（文档 6.3、9.3、10） ============

import {
  ANTITRUST, BRIDGE_MONOPOLY_MIN_LEVELS, BRIDGES, EAST_BRIDGE, monopolyTerrainRatio, SEASON_EVENTS, WEST_BRIDGE,
} from './config'
import { repairCost } from './buildings'
import { keyBreakupTile, totalValue as playerTotalValue } from './economy'
import { applyPriceShock } from './market'
import { remember } from './ai/memory'
import type { ChainState, GameApi } from './types'

// ---------- 反垄断举报（文档 9.3：玩家主动举报制） ----------

export interface MonopolyInfo {
  singleRatio: number   // 单类地形最高占比
  globalRatio: number   // 全局地形占比
  bridges: number       // 拥有桥梁数
  bridgeLevels: number  // 所拥桥梁等级之和（0 级桥不算有效垄断）
}

/** 垄断统计：单类地形占比 / 全局地形占比 / 双桥 */
export function monopolyInfo(game: GameApi, playerId: number): MonopolyInfo {
  const s = game.state
  const owned: Record<string, number> = {}
  const total: Record<string, number> = {}
  for (const t of s.tiles) {
    if (t.type !== 'terrain' || t.terrain === 'none') continue
    total[t.terrain] = (total[t.terrain] ?? 0) + 1
    if (t.owner === playerId) owned[t.terrain] = (owned[t.terrain] ?? 0) + 1
  }
  const singleRatio = Math.max(0, ...Object.keys(total).map(k => (owned[k] ?? 0) / total[k]))
  const ownedTotal = Object.values(owned).reduce((a, b) => a + b, 0)
  const totalAll = Object.values(total).reduce((a, b) => a + b, 0)
  const bridges = s.tiles.filter(t => t.type === 'bridge' && t.owner === playerId).length
  const bridgeLevels = s.tiles
    .filter(t => t.type === 'bridge' && t.owner === playerId)
    .reduce((sum, t) => sum + (t.bridgeLevel ?? 0), 0)
  return { singleRatio, globalRatio: totalAll > 0 ? ownedTotal / totalAll : 0, bridges, bridgeLevels }
}

/** 垄断线：单类地形达到动态门槛（4 人 50%…8 人 70%）、全局地形 ≥50%、
 *  或双桥且两桥总等级 ≥2（0 级桥只是占位，不构成交通垄断）。 */
export function isMonopoly(game: GameApi, playerId: number): boolean {
  const m = monopolyInfo(game, playerId)
  return m.singleRatio >= monopolyTerrainRatio(game.state.players.length) ||
    m.globalRatio >= ANTITRUST.globalRatio ||
    (m.bridges >= 2 && m.bridgeLevels >= BRIDGE_MONOPOLY_MIN_LEVELS)
}

/** 超出垄断线的程度（0 起）：用于举报成功率与罚款随"垄断得多狠"缩放 */
export function monopolyOverage(game: GameApi, playerId: number): number {
  const m = monopolyInfo(game, playerId)
  const terrainThreshold = monopolyTerrainRatio(game.state.players.length)
  const singleOver = m.singleRatio / Math.max(0.01, terrainThreshold) - 1
  const globalOver = m.globalRatio / Math.max(0.01, ANTITRUST.globalRatio) - 1
  const bridgeOver = m.bridges >= 2 && m.bridgeLevels >= BRIDGE_MONOPOLY_MIN_LEVELS ? 0.15 : 0
  return Math.max(0, Math.min(0.6, Math.max(singleOver, globalOver, bridgeOver)))
}

/** 举报成功率（UI 展示与结算共用）：基础人数概率 + 超线加成 - 目标游说 */
export function reportOdds(game: GameApi, targetId: number, joiners: number): number {
  const target = game.state.players[targetId]
  let prob = ANTITRUST.reportProb[Math.min(joiners, 3)]
  prob += monopolyOverage(game, targetId) * ANTITRUST.probOverageBonus
  const lobbyLvl = Math.min(3, Math.max(0, -Math.round(target.status.antitrustMod / 0.1)))
  if (lobbyLvl > 0) prob = Math.max(0, prob - lobbyLvl * 0.1)
  return Math.max(0, Math.min(0.95, prob))
}

/** 可被举报的垄断目标（含失败保护期） */
export function monopolyTargets(game: GameApi, reporterId: number): number[] {
  return game.state.players
    .filter(p => p.alive && p.id !== reporterId)
    .filter(p => p.status.reportCooldown <= 0 && isMonopoly(game, p.id))
    .map(p => p.id)
}

/**
 * 玩家主动发起反垄断举报（可联合，人类也会收到加入邀请）：
 * 发起人缴费 300，其余存活玩家按各自意愿加入（各自缴费 300）；
 * 成功率按人数 40%/70%/90%，叠加"超出垄断线"加成，再减去目标的游说等级；
 * 失败 → 目标 2 轮内不可再被举报；成功 → 罚款 15% / 强制拍卖一块 / 产出减半 2 轮。
 */
export async function reportMonopoly(game: GameApi, reporterId: number, targetId: number): Promise<boolean> {
  const s = game.state
  const reporter = s.players[reporterId]
  const target = s.players[targetId]
  if (!reporter?.alive || !target?.alive) return false
  if (target.status.reportCooldown > 0) {
    game.log(`「${target.name}」近期刚通过审查，${target.status.reportCooldown} 轮内不可再被举报`, reporterId)
    return false
  }
  if (!isMonopoly(game, targetId)) {
    game.log(`「${target.name}」尚未达到垄断线，无法举报`, reporterId)
    return false
  }
  if (reporter.cash < ANTITRUST.reportCost) {
    game.log(`「${reporter.name}」资金不足（￥${reporter.cash}），无法发起举报（需 ￥${ANTITRUST.reportCost}）`, reporterId)
    return false
  }

  // 发起人缴费，其余存活玩家（含人类）都会被询问是否加入联合
  reporter.cash -= ANTITRUST.reportCost
  reporter.stats.spent += ANTITRUST.reportCost
  const joiners: number[] = [reporterId]
  for (const p of s.players) {
    if (p.id === reporterId || p.id === targetId || !p.alive) continue
    if (p.cash < ANTITRUST.reportCost) continue
    const currentProb = reportOdds(game, targetId, joiners.length)
    const ans = await game.prompt<{ join: boolean }>({
      type: 'join-report', player: p.id, target: targetId,
      cost: ANTITRUST.reportCost, currentProb,
    })
    if (ans?.join) {
      p.cash -= ANTITRUST.reportCost
      p.stats.spent += ANTITRUST.reportCost
      joiners.push(p.id)
    }
  }
  // 目标记住每一个举报自己的人（报复依据）
  for (const id of joiners) remember(s, targetId, id, 'report')
  const n = joiners.length
  const prob = reportOdds(game, targetId, n)
  game.log(`反垄断举报：${joiners.map(id => `「${s.players[id].name}」`).join('、')} 联合举报「${target.name}」（${n} 人，成功率 ${Math.round(prob * 100)}%）`)
  game.sfx('click')

  if (!game.rng.chance(prob)) {
    // 失败保护：同一目标 2 轮内不可再被举报
    target.status.reportCooldown = ANTITRUST.cooldownRounds
    await game.notice('举报失败', `对「${target.name}」的举报未获受理！接下来 ${ANTITRUST.cooldownRounds} 轮内不可再举报该玩家。`, '⚖️')
    game.markChanged()
    return false
  }

  await applyPunishment(game, targetId, joiners)
  game.sfx('report')
  await game.notice('举报成功', `「${target.name}」受到反垄断制裁！`, '⚖️')
  game.markChanged()
  return true
}

/** 举报成功的惩罚与后续（罚款 15% / 强制拍卖 / 产出减半 2 轮；对应事件链） */
async function applyPunishment(game: GameApi, targetId: number, joiners: number[]): Promise<void> {
  const s = game.state
  const target = s.players[targetId]
  const outcome = game.rng.pick([...ANTITRUST.outcomes])
  const mono = s.tiles.filter(t => t.owner === targetId && t.type === 'terrain' && t.terrain !== 'none')
  const totalValue = mono.reduce((a, t) => a + t.price, 0)
  switch (outcome) {
    case 'fine': {
      // 罚款随超线幅度上浮：垄断越狠罚得越重（基线 15%，最高 35%）
      const fineRatio = Math.min(0.35, ANTITRUST.fineRatio + monopolyOverage(game, targetId) * ANTITRUST.fineOverageBonus)
      const fine = Math.round((totalValue * fineRatio) / 10) * 10
      await game.pay(targetId, fine, null, '反垄断罚款')
      // 举报奖金：罚款的 25%（ANTITRUST.bountyRatio）由举报人平分
      const bounty = Math.round((fine * ANTITRUST.bountyRatio) / joiners.length / 10) * 10
      for (const id of joiners) {
        if (s.players[id].alive) game.gain(id, bounty, '举报奖金')
      }
      game.log(`举报成功：「${target.name}」因垄断被罚款 ￥${fine}，举报人各分得 ￥${bounty}！`)
      game.sfx('lose')
      // 事件链：股民恐慌（2 轮后租金 -20%）
      addChain(game, 'shareholder-panic', targetId, 2, {})
      break
    }
    case 'auction': {
      // 强制拍卖一块价值最高的地
      const tile = mono.sort((a, b) => b.price - a.price)[0]
      if (tile) {
        game.log(`举报成功：「${target.name}」的「${tile.name}」被强制拍卖！`)
        // 惩罚性拍卖：卖家（被举报的垄断者）不得参与，否则可用半价把自己买回来，惩罚形同虚设
        await game.runAuction(tile.index, Math.round((tile.price / 2) / 10) * 10, { seller: targetId, exclude: targetId })
      }
      // 事件链：反垄断余波（2 轮后举报人获得奖励）
      addChain(game, 'antitrust-aftermath', joiners[0], 2, {})
      break
    }
    case 'output': {
      target.status.outputMods.push({ factor: 0.5, turns: 2, label: '反垄断制裁' })
      game.log(`举报成功：「${target.name}」资源产出减半，持续 2 轮！`)
      game.sfx('lose')
      addChain(game, 'antitrust-aftermath', joiners[0], 2, {})
      break
    }
    case 'breakup': {
      // 结构性救济：优先抽走最长连片段的中点（连片加成直接归零）；
      // 没有连片时改拆其价值最高的地块——拆分总能生效，不会空转。
      const tile = keyBreakupTile(game, targetId) ?? mono.sort((a, b) => b.price - a.price)[0]
      if (!tile) break
      const price = Math.round((tile.price * ANTITRUST.breakupTransferRatio) / 10) * 10
      // 接盘方：资产最弱的存活对手（且付得起半价）；都付不起则收归无主
      const weakest = s.players
        .filter(x => x.alive && x.id !== targetId && x.cash >= price)
        .sort((a, b) => playerTotalValue(game, a.id) - playerTotalValue(game, b.id))[0]
      tile.buildings = []   // 强制剥离：地上建筑一并拆除
      tile.disaster = null
      if (weakest) {
        weakest.cash -= price
        target.cash += price
        tile.owner = weakest.id
        game.log(`反垄断强制拆分：「${target.name}」的连片被劈开，「${tile.name}」作价 ￥${price} 转给最弱的「${weakest.name}」——其连片加成清零！`, targetId)
        game.emit('float', { tile: tile.index, text: '⚖️ 强制拆分', color: '#c9a24a' })
      } else {
        tile.owner = null
        game.log(`反垄断强制拆分：「${target.name}」的「${tile.name}」被收回国有（无人接盘），连片加成清零！`, targetId)
        game.emit('float', { tile: tile.index, text: '⚖️ 收归国有', color: '#c9a24a' })
      }
      game.sfx('lose')
      addChain(game, 'antitrust-aftermath', joiners[0], 2, {})
      break
    }
  }
}

/** 卡牌特殊举报：无需满足垄断线、免举报费，单人成功率固定 40%（与 reportMonopoly 共用失败/成功通知与冷却） */
export async function specialReport(game: GameApi, reporterId: number, targetId: number): Promise<void> {
  const s = game.state
  const reporter = s.players[reporterId]
  const target = s.players[targetId]
  if (!reporter?.alive || !target?.alive) return
  // 失败保护期对特殊举报同样生效（否则卡牌可以绕过 2 轮冷却反复举报）
  if (target.status.reportCooldown > 0) {
    game.log(`「${target.name}」近期刚通过审查，${target.status.reportCooldown} 轮内不可再被举报`, reporterId)
    return
  }
  game.log(`「${reporter.name}」通过特殊渠道对「${target.name}」发起举报！`, reporterId)
  // 单人卡牌举报成功率固定为 ANTITRUST.reportProb[1]（40%），无举报费、无需游说修正
  if (!game.rng.chance(ANTITRUST.reportProb[1])) {
    target.status.reportCooldown = ANTITRUST.cooldownRounds
    await game.notice('举报失败', `对「${target.name}」的举报未获受理！接下来 ${ANTITRUST.cooldownRounds} 轮内不可再举报该玩家。`, '⚖️')
    game.markChanged()
    return
  }
  await applyPunishment(game, targetId, [reporterId])
  await game.notice('举报成功', `「${target.name}」受到反垄断制裁！`, '⚖️')
  game.markChanged()
}

/** 游说：作为垄断者花钱降低被举报成功率（300/600/1000 → -10%/20%/30%，叠加封顶 3 级） */
export function lobby(game: GameApi, playerId: number, level: 1 | 2 | 3): boolean {
  const p = game.state.players[playerId]
  const cfg = ANTITRUST.lobby[level - 1]
  if (p.cash < cfg.cost) return false
  p.cash -= cfg.cost
  p.stats.spent += cfg.cost
  const cur = Math.min(3, Math.max(0, -Math.round(p.status.antitrustMod / 0.1)))
  const next = Math.min(3, cur + level)
  p.status.antitrustMod = -next * 0.1
  p.status.antitrustTurns = ANTITRUST.lobbyTurns
  game.log(`「${p.name}」花费 ￥${cfg.cost} 游说官员，被举报成功率 -${next * 10}%（持续 ${ANTITRUST.lobbyTurns} 轮）`, playerId)
  game.sfx('click')
  game.markChanged()
  return true
}

// ---------- 事件链（文档 10） ----------

export function addChain(game: GameApi, id: string, playerId: number | null, turnsLeft: number, data: Record<string, any> = {}): void {
  const defs: Record<string, Omit<ChainState, 'turnsLeft' | 'playerId' | 'data'>> = {
    'pollution-protest': { id, name: '环保抗议', desc: '石油泄漏引发抗议，需支付 500 罚款或失去一块石油地块' },
    'typhoon-rebuild': { id, name: '灾后重建', desc: '台风过后，可半价修理沿海建筑或领取政府补贴' },
    'quake-fear': { id, name: '余震恐慌', desc: '地震过后人心惶惶，建筑维修费用 +30%' },
    'harvest-crash': { id, name: '粮价暴跌', desc: '丰收过后牛肉价格 -30%' },
    'bridge-repair': { id, name: '紧急抢修', desc: '桥梁受损，玩家可自愿出资，资金不足则桥梁关闭' },
    'shareholder-panic': { id, name: '股民恐慌', desc: '垄断者被罚款，其地块租金 -20%' },
    'antitrust-aftermath': { id, name: '反垄断余波', desc: '举报成功的影响持续发酵，举报人获得奖励' },
  }
  const def = defs[id]
  if (!def) return
  game.state.chains.push({ ...def, turnsLeft, playerId, data })
  game.log(`事件链预告：「${def.name}」将在 ${turnsLeft} 回合后触发`)
  game.emit('chain-warning', { name: def.name, turnsLeft })
}

/** 回合开始时倒计时并触发到期事件链 */
export async function tickChains(game: GameApi): Promise<void> {
  const s = game.state
  for (const chain of [...s.chains]) {
    chain.turnsLeft--
    if (chain.turnsLeft > 0) continue
    s.chains = s.chains.filter(c => c !== chain)
    game.log(`事件链触发：「${chain.name}」！`)
    game.sfx('chain')
    await fireChain(game, chain)
  }
}

async function fireChain(game: GameApi, chain: ChainState): Promise<void> {
  const s = game.state
  switch (chain.id) {
    case 'pollution-protest': {
      const p = s.players[chain.playerId as number]
      if (!p || !p.alive) return
      const choice = await game.prompt<'pay' | 'lose'>({
        type: 'pay-or-lose',
        title: '环保抗议',
        desc: `环保组织抗议你的石油泄漏事件！支付 500 罚款，或失去一块石油地块。`,
        cost: 500, loseDesc: '失去一块石油地块', player: p.id,
      })
      if (choice === 'pay') {
        await game.pay(p.id, 500, null, '环保罚款')
      } else {
        const tiles = s.tiles.filter(t => t.owner === p.id && t.terrain === 'desert')
        if (tiles.length) {
          const t = game.rng.pick(tiles)
          t.owner = null
          t.buildings = []
          game.log(`「${p.name}」的「${t.name}」被环保组织收归国有`, p.id)
        }
      }
      break
    }
    case 'typhoon-rebuild': {
      // 所有拥有受损沿海建筑的玩家依次选择
      const SUBSIDY = 500
      for (const p of s.players) {
        if (!p.alive) continue
        // 只统计真正处于「受损待修」状态的建筑（旧实现按 level<3 判定，
        // 会把完好的低级建筑也算进修理费——玩家付钱却没有任何建筑被修复）
        const damaged = s.tiles.filter(
          t => t.owner === p.id && t.terrain === 'coast' &&
            t.buildings.some(b => b.damaged),
        )
        if (damaged.length === 0) continue
        const totalCost = Math.round(damaged.reduce(
          (sum, t) => sum + t.buildings.reduce((a, b) => a + (b.damaged ? repairCost(game, b) * 0.5 : 0), 0), 0,
        ))
        if (totalCost <= 0) continue
        const choice = await game.prompt<'repair' | 'subsidy'>({
          type: 'pay-or-lose',
          title: '灾后重建',
          desc: `台风损坏了你的沿海建筑。可支付 ${totalCost} 以半价修理，或领取 ${SUBSIDY} 政府补贴（建筑保持受损）。`,
          cost: totalCost, loseDesc: `领取 ${SUBSIDY} 补贴`, player: p.id,
        })
        if (choice === 'repair') {
          await game.pay(p.id, totalCost, null, '灾后重建修理费')
          if (!s.players[p.id].alive) continue   // 支付导致破产：资产已移交，不可再替他人修建筑
          // 修理只清受损标记、保留等级——与 buildings.ts 全局"修理不恢复等级"语义一致
          for (const t of damaged) {
            for (const b of t.buildings) b.damaged = false
          }
          game.log(`「${p.name}」完成灾后重建，沿海建筑受损标记已清除`, p.id)
        } else {
          game.gain(p.id, SUBSIDY, '政府补贴')
        }
      }
      break
    }
    case 'quake-fear': {
      s.repairMods.push({ factor: 1.3, turns: 2, label: '余震恐慌' })
      await game.notice('余震恐慌', '地震过后人心惶惶，接下来 2 回合建筑维修费用 +30%！', '🔧')
      break
    }
    case 'harvest-crash': {
      s.priceMods.push({ resource: 'beef', factor: 0.7, turns: 2, label: '粮价暴跌' })
      applyPriceShock(game, 'beef', 0.7)
      await game.notice('粮价暴跌', '丰收过后市场饱和，牛肉价格 -30%，持续 2 回合！', '📉')
      break
    }
    case 'bridge-repair': {
      const bridge = s.tiles[chain.data.bridge as number]
      if (!bridge || bridge.type !== 'bridge') return
      const cfg = BRIDGES[bridge.index as typeof WEST_BRIDGE | typeof EAST_BRIDGE]
      if (!cfg) return
      const needed = Math.round((cfg.price / 2) / 10) * 10
      let total = 0
      for (const p of s.players.filter(p => p.alive)) {
        const donate = await game.prompt<number>({
          type: 'donate', title: '紧急抢修',
          desc: `「${bridge.name}」受损，需集资 ${needed} 抢修。你愿意出资多少？`,
          target: needed, player: p.id,
        })
        const amount = Math.min(donate, p.cash)
        if (amount > 0) {
          p.cash -= amount
          p.stats.spent += amount
          total += amount
          game.log(`${p.name} 为抢修「${bridge.name}」出资 ${amount}`, p.id)
        }
      }
      if (total >= needed) {
        bridge.bridgeLevel = Math.min(3, bridge.bridgeLevel + 1) as 0 | 1 | 2 | 3
        bridge.bridgeClosed = 0   // 已集资抢修：同时解除此前的关闭状态
        await game.notice('抢修完成', `「${bridge.name}」修复完毕！`, '🌉')
      } else {
        bridge.bridgeClosed = 2
        await game.notice('抢修失败', `资金不足，「${bridge.name}」关闭 2 回合！`, '⛔')
      }
      break
    }
    case 'shareholder-panic': {
      const p = s.players[chain.playerId as number]
      if (p && p.alive) {
        // turns=N+1：个人状态在本回合结束先衰减一次，覆盖接下来 2 个完整轮次
        p.status.rentBonus.push({ factor: 0.8, turns: 3, label: '股民恐慌' })
        game.log(`「${p.name}」受股民恐慌影响，收取租金 -20%（2 回合）`, p.id)
      }
      break
    }
    case 'antitrust-aftermath': {
      const p = s.players[chain.playerId as number]
      if (p && p.alive) {
        game.gain(p.id, 1000, '反垄断余波奖励')
        game.log(`「${p.name}」因举报有功获得 ￥1000 奖励`, p.id)
      }
      break
    }
  }
  game.markChanged()
}

// ---------- 季节事件（文档 6.3） ----------

export function applySeasonEvent(game: GameApi): void {
  const s = game.state
  const pool = SEASON_EVENTS.filter(e => !e.seasons || e.seasons.includes(s.season))
  const ev = game.rng.pick(pool)
  s.seasonEvent = { name: ev.name, desc: ev.desc }
  // 季节事件标注「本季」：持续整个季节（全局修正按轮衰减）。
  // 旧实现固定 3 个「玩家回合」，4~8 人局里连半轮都撑不到，与文案严重不符。
  const turns = Math.max(1, s.seasonLen)
  if (ev.rentMod) s.rentMods.push({ factor: ev.rentMod, turns, label: ev.name })
  if (ev.priceMod) {
    s.priceMods.push({ resource: ev.priceMod.resource, factor: ev.priceMod.factor, turns, label: ev.name })
    // 季节事件开局即体现价格变化，但只施加 25% 强度：
    // 完整冲击会明显缩短对局（4 人局中位从 ~334 压到 ~289），25% 保留方向感且几乎不动节奏。
    applyPriceShock(game, ev.priceMod.resource, 1 + (ev.priceMod.factor - 1) * 0.25)
  }
  if (ev.outputMod) s.outputModsRes.push({ resource: ev.outputMod.resource, factor: ev.outputMod.factor, turns, label: ev.name })
  if (ev.outputModAll) s.outputModAll.push({ factor: ev.outputModAll, turns, label: ev.name })
  if (ev.typhoonProbDelta) s.typhoonProbDelta = ev.typhoonProbDelta
  if (ev.floodProbDelta) s.floodProbDelta = ev.floodProbDelta
  if (ev.skipDisaster) s.skipDisaster = ev.skipDisaster
  game.log(`季节事件：「${ev.name}」——${ev.desc}`)
}

/** 季节更替时重置季节事件状态 */
export function resetSeasonEvent(game: GameApi): void {
  const s = game.state
  s.typhoonProbDelta = 0
  s.floodProbDelta = 0
  s.skipDisaster = null
  s.seasonEvent = null
}
