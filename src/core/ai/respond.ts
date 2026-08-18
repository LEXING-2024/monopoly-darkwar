// ============ AI 对各类提示的自动回应（效用评分 + 性格 + 噪声 + 预判） ============
// 注意：返回形状必须与各 prompt 调用点契约严格一致

import {
  EAST_BRIDGE, RESOURCES, WEST_BRIDGE,
} from '../config'
import { cardMoney } from '../cards'
import { isMonopoly } from '../events'
import { bridgeToll, tileRent } from '../economy'
import { getBrain } from './brain'
import { brainRng, rollAction, saveBrainRng } from './personality'
import { cashSafetyLine, exploreScore, priceForecast, tileValue } from './score'
import { resourceOutlook } from './anticipate'
import type { GameApi, Prompt, ResourceType, Terrain, TradeOffer } from '../types'

export function aiRespond(game: GameApi, prompt: Prompt): any {
  const s = game.state
  switch (prompt.type) {
    case 'notice': case 'wheel': case 'action': case 'gameover':
      return null
    case 'buy':
      return respondBuy(game, prompt.player, prompt.price)
    case 'card': {
      if (!prompt.canDecline) return { accept: true }
      return { accept: shouldAcceptCard(game, prompt.player, prompt.cardId) }
    }
    case 'choose-resource':
      return chooseResource(game, prompt.player, prompt.options)
    case 'choose-tile':
      return chooseTile(game, prompt.player, prompt.tiles, prompt.cardId)
    case 'start-stop':
      return chooseStartStop(game, prompt.player, prompt.repairCost, prompt.damagedCount)
    case 'casino':
      return chooseCasino(game, prompt.player, prompt.cash)
    case 'bridge-cross': {
      const p = s.players[prompt.player]
      const brain = getBrain(s, p.id)
      const rng = brainRng(brain!)
      // 过路费高 → 绕行；风险承受高 → 更敢省过路费（多花 3 步的机会成本）
      const base = prompt.toll > 500 ? 0.75 : 0.35
      const prob = Math.min(0.95, Math.max(0.05, base + (brain?.profile.riskTolerance ?? 0.5) * 0.2 - 0.1))
      const ans = rng.chance(prob)
      saveBrainRng(brain!, rng)
      return { bypass: ans }
    }
    case 'bid':
      return respondBid(game, prompt.player, prompt.tile, prompt.currentBid, prompt.minBid)
    case 'dilemma':
      return respondDilemma(game, prompt.player, prompt.other)
    case 'trade-offer':
      return { accept: evalTrade(game, prompt.to, prompt.give, prompt.receive) }
    case 'trade-response':
      return { accept: evalTrade(game, prompt.to, prompt.give, prompt.receive) }
    case 'pay-or-lose':
      return respondPayOrLose(game, prompt.player, prompt.title, prompt.cost)
    case 'donate':
      return respondDonate(game, prompt.player, prompt.target)
    case 'sell-spec':
      return respondSellSpec(game, prompt.player, prompt.resource, prompt.price)
    case 'join-report':
      return respondJoinReport(game, prompt.player, prompt.target, prompt.cost, prompt.currentProb)
  }
  return null
}

// ---------- 买地 ----------

function respondBuy(game: GameApi, playerId: number, price: number): { buy: boolean } {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const tile = s.tiles[p.pos]
  const v = tileValue(game, playerId, tile) / Math.max(1, price)
  const safety = cashSafetyLine(game, playerId)
  // 扩张策略更激进买地；防守/高情绪更保守
  const strategyAdj = brain?.strategy === 'expand' ? -0.15 : brain?.strategy === 'defend' ? 0.2 : 0
  const emotionAdj = (brain?.emotion ?? 0) > 0.5 ? 0.1 : 0
  const threshold = 1.15 + strategyAdj + emotionAdj - (brain?.profile.greed ?? 0.5) * 0.15
  // 买后仍须保留安全线的大部分，避免现金枯竭提前破产
  const afford = p.cash - price >= safety * 0.7
  const chosen = rollAction(game, brain!, [
    { value: true, score: afford ? v - threshold : -Infinity },
    { value: false, score: 0 },
  ])
  return { buy: !!chosen }
}

// ---------- 竞拍 ----------

function respondBid(game: GameApi, playerId: number, tileIdx: number, currentBid: number, minBid: number): { pass: boolean; bid?: number } {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const tile = s.tiles[tileIdx]
  // 估值按地价为锚（0.9~1.5 倍 × 贪婪） + 同地形垄断协同溢价；
  // 不能用 tileValue 直接竞价——长期收入现值远高于现金，会导致拍下即现金枯竭破产
  const base = tile.price * (0.9 + (brain?.profile.greed ?? 0.5) * 0.6)
  const sameTerrain = s.tiles.filter(t => t.owner === playerId && t.terrain === tile.terrain).length
  const synergy = brain?.strategy === 'monopoly' ? sameTerrain * tile.price * 0.08 : 0
  const valuation = Math.round(base + synergy)
  const cap = Math.max(0, p.cash - cashSafetyLine(game, playerId) * 0.7)
  if (currentBid >= valuation || cap <= currentBid) return { pass: true }
  const bid = Math.min(Math.max(minBid, currentBid + Math.max(50, Math.round(currentBid * 0.1))), Math.min(valuation, cap))
  return bid > currentBid ? { pass: false, bid } : { pass: true }
}

// ---------- 囚徒困境（EV + 对手历史 + 实力对比 + 情绪） ----------

function respondDilemma(game: GameApi, playerId: number, otherName: string): 'cooperate' | 'betray' {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const other = s.players.find(x => x.name === otherName)
  // 对手背叛概率：历史（一报还一报）优先，无历史按 0.2 + 对手攻击性近似
  let q = 0.2
  if (other) {
    const last = p.dilemmaMem[other.id]?.at(-1)
    if (last === 'D') q = 0.8
    else if (last === 'C') q = 0.1
    else q = 0.2 + other.traits.aggression * 0.15
  }
  const evCoop = q * -1000 + (1 - q) * 2000
  const evBetray = q * -500 + (1 - q) * 3000
  // 敌意（被背叛/被举报过）与情绪推动背叛；合作倾向推动合作
  const grudge = brain && other ? brain.memory.filter(m => m.from === other.id && m.kind !== 'cooperate').length * 150 : 0
  const emotionPush = (brain?.emotion ?? 0) * 400
  const betrayScore = evBetray + grudge + emotionPush + (brain?.profile.aggression ?? 0.5) * 200
  const coopScore = evCoop + (brain?.profile.cooperation ?? 0.5) * 300
  const chosen = rollAction(game, brain!, [
    { value: 'betray' as const, score: betrayScore },
    { value: 'cooperate' as const, score: coopScore },
  ])
  return chosen ?? 'cooperate'
}

// ---------- 交易评估（地块按 tileValue，资源按市价与前景，叠加囤积与敌意） ----------

function evalTrade(game: GameApi, playerId: number, give: TradeOffer, receive: TradeOffer): boolean {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const val = (o: TradeOffer) => {
    let v = o.cash
    for (const t of o.tiles) v += tileValue(game, playerId, s.tiles[t])
    for (const r of Object.keys(RESOURCES) as ResourceType[]) {
      const units = o.resources[r] ?? 0
      if (!units) continue
      // 前景看涨时按更高价估值（囤积价值）
      const f = priceForecast(game, r, Math.max(0, brain?.profile.lookahead ?? 1))
      v += units * s.market[r] * Math.max(0.9, Math.min(1.3, f))
    }
    return v
  }
  // 给出垄断冲刺地形的地块要额外溢价
  let giveV = val(give)
  const target = brain?.strategy === 'monopoly' ? pTargetTerrain(game, playerId) : null
  if (target) {
    for (const t of give.tiles) {
      if (s.tiles[t].terrain === target) giveV *= 1.5
    }
  }
  const receiveV = val(receive)
  // 急需现金时低价贱卖求生；敌意高 → 抬高要价；合作倾向高 → 放宽
  const safety = cashSafetyLine(game, playerId)
  const edge = p.cash < safety ? 0.85 : 1.02 + (brain ? 0.1 * (1 - brain.profile.cooperation) : 0.02)
  return receiveV >= giveV * edge
}

function pTargetTerrain(game: GameApi, playerId: number): Terrain | null {
  const s = game.state
  const counts: Partial<Record<Terrain, number>> = {}
  for (const t of s.tiles) {
    if (t.owner === playerId && t.type === 'terrain' && t.terrain !== 'none') {
      counts[t.terrain] = (counts[t.terrain] ?? 0) + 1
    }
  }
  let best: Terrain | null = null
  let bestN = 0
  for (const k of Object.keys(counts) as Terrain[]) {
    if ((counts[k] ?? 0) > bestN) { bestN = counts[k] ?? 0; best = k }
  }
  return bestN >= 3 ? best : null
}

// ---------- 卡牌接受 ----------

function shouldAcceptCard(game: GameApi, playerId: number, cardId: string): boolean {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const safety = cashSafetyLine(game, playerId)
  const cash = p.cash
  // 卡牌费用与 GDP 挂钩：金额 = 人均 GDP × 比例（与 cards.ts 的 cardMoney 一致）
  const cost = (ratio: number) => cash - cardMoney(game, ratio) >= safety * 0.5
  const lookahead = Math.max(0, brain?.profile.lookahead ?? 1)
  switch (cardId) {
    case 'invest-oilfield': return cost(0.015) && s.tiles.some(t => t.terrain === 'desert' && t.owner === null)
    case 'bridge-share': return cost(0.025) && [WEST_BRIDGE, EAST_BRIDGE].some(i => s.tiles[i].owner !== null && s.tiles[i].owner !== playerId)
    case 'temp-dock': return cost(0.01) && (s.tiles[WEST_BRIDGE].owner !== null || s.tiles[EAST_BRIDGE].owner !== null)
    case 'speculate': return cost(0.06) && priceForecast(game, bestMarketRes(game), lookahead) >= 0.95
    case 'geologist-hire': return cost(0.015) && s.tiles.some(t => t.owner === playerId && t.terrain === 'desert' && !t.explored)
    case 'bribe': return cost(0.02) && isMonopoly(game, playerId)
    case 'market-fair': return cost(0.01) && s.tiles.some(t => t.owner === playerId && t.baseRent > 0)
    case 'temp-dam': return cost(0.015) && (s.season === 'spring' || (lookahead >= 1 && nextIsSpring(s)))
    case 'auction-commission': return cost(0.005) && s.tiles.some(t => t.owner === null && t.type === 'terrain' && !t.seized)
    case 'insurance': {
      // 风险承受低或夏季（台风）→ 更愿买保险
      const risky = s.season === 'summer' || s.season === 'winter'
      return cost(0.01) && (risky || (brain?.profile.riskTolerance ?? 0.5) < 0.4)
    }
    case 'tech-invest': return cost(0.025) && s.tiles.some(t => t.owner === playerId && t.type === 'terrain' && t.buildings.length < 2)
    case 'dump-resources': return Object.values(p.resources).some(v => v > 0)
    case 'water-invest': return cost(0.015)
    case 'land-deal': return cost(0.04) && s.tiles.some(t => t.owner === null && t.type === 'terrain' && !t.seized)
    case 'premium-sale': return Object.values(p.resources).some(v => v >= 5)
    case 'energy-saving': return cost(0.01)
    case 'hire-workers': return cost(0.008)
    case 'informant': return cost(0.008) && s.tiles.some(t => t.owner === playerId && t.type === 'terrain' && !t.explored)
    case 'bodyguard': return cost(0.015) && isMonopoly(game, playerId)
    case 'repair-crew': return cost(0.012) && s.tiles.some(t => t.owner === playerId && t.buildings.some(b => b.level < 3))
    case 'sabotage': return cost(0.02) && s.tiles.some(t => t.owner !== null && t.owner !== playerId && t.buildings.length > 0)
    case 'steal-resources': return cost(0.015) && s.players.some(
      p => p.alive && p.id !== playerId && (Object.keys(RESOURCES) as ResourceType[]).some(r => p.resources[r] > 0),
    )
    case 'roadblock': return cost(0.015) && s.roadblock === null
    case 'incite-defection': {
      const their = s.tiles.filter(t => t.type === 'terrain' && t.owner !== null && t.owner !== playerId)
      return cost(0.03) && their.some(t =>
        s.tiles.some(x => x.type === 'terrain' && x.owner === playerId && x.terrain === t.terrain),
      )
    }
    default: return cost(0)
  }
}

function nextIsSpring(s: GameApi['state']): boolean {
  const order = ['spring', 'summer', 'autumn', 'winter']
  const idx = order.indexOf(s.season)
  return order[(idx + 1) % 4] === 'spring'
}

function bestMarketRes(game: GameApi): ResourceType {
  const s = game.state
  return (Object.keys(RESOURCES) as ResourceType[]).sort((a, b) => s.market[b] - s.market[a])[0]
}

// ---------- 资源选择（按市价 × 前景 × 已有库存） ----------

function chooseResource(game: GameApi, playerId: number, options: ResourceType[]): ResourceType {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const lookahead = Math.max(0, brain?.profile.lookahead ?? 1)
  const scored = options.map(r => ({
    value: r,
    score: s.market[r] * Math.max(0.9, Math.min(1.3, priceForecast(game, r, lookahead))) * (p.resources[r] > 0 ? 1.2 : 1),
  }))
  return rollAction(game, brain!, scored) ?? options[0]
}

// ---------- 地块选择（按卡牌上下文） ----------

function chooseTile(game: GameApi, playerId: number, tiles: number[], cardId: string): number {
  const s = game.state
  const brain = getBrain(s, playerId)
  const scored = tiles.map(i => {
    const t = s.tiles[i]
    let score = 0
    switch (cardId) {
      case 'geologist': case 'geologist-hire': case 'informant':
        // 勘探类：按勘探期望收益（免费勘探尤其选潜力最大的）
        score = Math.max(0, exploreScore(game, playerId, t)) + t.price * 0.01
        break
      case 'tech-invest':
        // 科技建筑：选建造位空余多、产出基础好的
        score = t.price + (2 - t.buildings.length) * 500
        break
      case 'land-deal':
        // 固定 800 收购：选估值溢价最高
        score = tileValue(game, playerId, t) - 800
        break
      case 'auction-commission':
        // 发起拍卖：选性价比最高、值得自己竞拍的地块
        score = tileValue(game, playerId, t) / Math.max(1, t.price)
        break
      default:
        score = t.price
    }
    return { value: i, score }
  })
  return rollAction(game, brain!, scored) ?? tiles[0]
}

// ---------- 起点停留 ----------

function chooseStartStop(game: GameApi, playerId: number, repairCost: number, damagedCount: number): 'repair' | 'rest' | 'skip' {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const safety = cashSafetyLine(game, playerId)
  if (damagedCount > 0 && p.cash - repairCost >= safety * 0.6) return 'repair'
  // 前方风险：1~12 步内敌对地块的期望租金（休息 -1 步可以躲开高租金段）
  const aheadRisk = landingRiskAhead(game, playerId)
  const restScore = aheadRisk - 400 - (p.status.moveMod !== 0 ? 0 : 0)
  const chosen = rollAction(game, brain!, [
    { value: 'skip' as const, score: 0 },
    { value: 'rest' as const, score: restScore },
  ])
  return chosen === 'rest' ? 'rest' : 'skip'
}

function landingRiskAhead(game: GameApi, playerId: number): number {
  const s = game.state
  const p = s.players[playerId]
  let risk = 0
  for (let d = 1; d <= 12; d++) {
    const idx = (p.pos + d) % s.tiles.length
    const t = s.tiles[idx]
    if (t.owner !== null && t.owner !== playerId) {
      const cost = t.type === 'bridge' ? bridgeToll(game, t) : tileRent(game, t, s.players[t.owner])
      risk += cost / 12
    }
  }
  return risk
}

// ---------- 赌场 ----------

function chooseCasino(game: GameApi, playerId: number, cash: number): { skip: boolean; bet?: number; choice?: 'big' | 'small' } {
  const s = game.state
  const brain = getBrain(s, playerId)
  const safety = cashSafetyLine(game, playerId)
  if (cash < safety * 1.5) return { skip: true }
  // 风险承受决定下注比例；情绪高 → 加注
  const bet = Math.min(cash, Math.max(100, Math.round((100 + (brain?.profile.riskTolerance ?? 0.5) * 300 + (brain?.emotion ?? 0) * 200) / 100) * 100))
  const choice = (brain?.profile.aggression ?? 0.5) > 0.6 ? 'big' : 'small'
  return { skip: false, bet, choice }
}

// ---------- 支付或失去 ----------

function respondPayOrLose(game: GameApi, playerId: number, title: string, cost: number): string {
  const s = game.state
  const p = s.players[playerId]
  const safety = cashSafetyLine(game, playerId)
  if (title === '环保抗议') {
    const desert = s.tiles.filter(t => t.owner === playerId && t.terrain === 'desert')
    if (!desert.length) return 'lose'   // 没有石油地块：白嫖
    const avgTile = desert.reduce((a, t) => a + tileValue(game, playerId, t), 0) / desert.length
    return avgTile > cost * 1.5 && p.cash - cost >= safety * 0.5 ? 'pay' : 'lose'
  }
  if (title === '灾后重建') {
    // 半价修理通常划算：只要现金允许就修
    return p.cash - cost >= safety * 0.5 ? 'repair' : 'subsidy'
  }
  if (p.cash < cost) return 'lose'
  return p.cash > cost * 2 ? 'pay' : 'lose'
}

// ---------- 捐款抢修 ----------

function respondDonate(game: GameApi, playerId: number, target: number): number {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const safety = cashSafetyLine(game, playerId)
  const hasBridge = s.tiles.some(t => t.type === 'bridge' && t.owner === playerId)
  if (hasBridge) {
    // 桥主：桥是自己的收入来源，尽力保桥
    return Math.min(target, Math.max(0, Math.round(p.cash - safety)))
  }
  // 非桥主：合作倾向高且现金充裕时象征性出资
  const coop = brain?.profile.cooperation ?? 0.5
  if (coop > 0.6 && p.cash > safety + 1500) return Math.min(target, 400)
  return 0
}

// ---------- 投机资源结算 ----------

function respondSellSpec(game: GameApi, playerId: number, res: ResourceType, price: number): { sell: boolean } {
  const s = game.state
  const brain = getBrain(s, playerId)
  const lookahead = Math.max(0, brain?.profile.lookahead ?? 1)
  const outlook = resourceOutlook(game, res, lookahead)
  // 前景看跌或囤积倾向低 → 卖；看涨且囤积倾向高 → 继续持有
  const sellScore = (outlook <= 0 ? 200 : -200) + (1 - (brain?.profile.hoarding ?? 0.5)) * 300
  const chosen = rollAction(game, brain!, [
    { value: true, score: sellScore },
    { value: false, score: 0 },
  ])
  return { sell: !!chosen }
}

// ---------- 联合举报 ----------

function respondJoinReport(game: GameApi, playerId: number, targetId: number, cost: number, currentProb: number): { join: boolean } {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const safety = cashSafetyLine(game, playerId)
  if (p.cash - cost < safety * 0.5) return { join: false }
  const target = s.players[targetId]
  // 成功后的期望收益：罚款 15% 资产 + 削弱威胁；成本 300
  const targetWealth = target.cash + s.tiles.filter(t => t.owner === targetId).reduce((a, t) => a + t.price, 0)
  const ev = currentProb * targetWealth * 0.05 - cost * 0.5
  const grudgePush = brain ? brain.memory.filter(m => m.from === targetId && m.kind !== 'cooperate').length * 200 : 0
  const coop = (brain?.profile.cooperation ?? 0.5)
  const aggression = (brain?.profile.aggression ?? 0.5)
  const score = ev + grudgePush + (coop * 150 - 75) + aggression * 100
  const chosen = rollAction(game, brain!, [
    { value: true, score },
    { value: false, score: 0 },
  ])
  return { join: !!chosen }
}
