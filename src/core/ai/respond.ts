// ============ AI 对各类提示的自动回应（效用评分 + 性格 + 噪声 + 预判） ============
// 注意：返回形状必须与各 prompt 调用点契约严格一致

import {
  EAST_BRIDGE, RESOURCES, TERRAIN_RESOURCE, WEST_BRIDGE,
} from '../config'
import { cardCost } from '../cards'
import { isMonopoly } from '../events'
import { bridgeToll, tileRent } from '../economy'
import { getBrain } from './brain'
import { brainRng, rollAction, saveBrainRng } from './personality'
import { cashSafetyLine, exploreScore, priceForecast, tileValue } from './score'
import { resourceOutlook } from './anticipate'
import type { AiBrain, GameApi, Prompt, ResourceType, Terrain, TradeOffer } from '../types'

/** 交易估值权衡：低于 0.85（接受 ≥ 对方价值的 85%）= 急需现金贱卖；高于 1（要求对方多付）= 索价；
 *  合作倾向低时提高门槛（防吃亏），合作倾向高时降低门槛（促成交易） */
const EVAL_TRADE_DESPERATE_EDGE = 0.85
const EVAL_TRADE_NORMAL_EDGE = 1.02
const EVAL_TRADE_HOSTILITY_PER_COOPERATION = 0.1

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
      return chooseResource(game, prompt.player, prompt.options, prompt.cardId)
    case 'choose-terrain':
      return chooseTerrain(game, prompt.player, prompt.options, prompt.cardId)
    case 'choose-tile':
      return chooseTile(game, prompt.player, prompt.tiles, prompt.cardId)
    case 'start-stop':
      return chooseStartStop(game, prompt.player, prompt.repairCost, prompt.damagedCount)
    case 'casino':
      return chooseCasino(game, prompt.player, prompt.cash)
    case 'bridge-cross': {
      const p = s.players[prompt.player]
      const brain = getBrain(s, p.id)
      const rng = brainRng(brain as AiBrain)
      // 绕行要付出"多走 3 步"的真实机会成本，所以只有过路费真的贵才值得绕：
      // 小额过路费（<300）绕行是亏的，不绕；提价后的高额才考虑回避。
      const t = prompt.toll
      const base = t >= 800 ? 0.7 : t >= 500 ? 0.45 : t >= 300 ? 0.2 : 0.05
      const prob = Math.min(0.95, Math.max(0.02, base + (brain?.profile.riskTolerance ?? 0.5) * 0.15 - 0.075))
      const ans = rng.chance(prob)
      saveBrainRng(brain as AiBrain, rng)
      return { bypass: ans }
    }
    case 'bid':
      return respondBid(game, prompt.player, prompt.tile, prompt.currentBid, prompt.minBid)
    case 'trade-offer':
    case 'trade-response':
      // evalTrade 的语义是「评估者付出 give、换回 receive」；prompt 里的 give/receive
      // 是以提议者为视角的（give=提议者付出）。对接收方必须交换，否则 AI 会接受亏本交易、
      // 拒绝有利交易（历史 bug）。
      return { accept: evalTrade(game, prompt.to, prompt.receive, prompt.give) }
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

// ---------- 交易评估（地块按 tileValue，资源按市价与前景，叠加囤积与敌意） ----------

function evalTrade(game: GameApi, playerId: number, give: TradeOffer, receive: TradeOffer): boolean {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  // 交易中的地块按「可变现价值」估算（地价 + 建筑投入），而不是 tileValue 的长期收益现值：
  // 前者与玩家在交易面板看到的估值一致，也是 AI 出价（1.1×地价等）的锚点；
  // 用长期现值会让任何现金收购都显得“亏本”，AI 之间永远谈不成交易。
  const liquidValue = (o: TradeOffer) => {
    let v = o.cash
    for (const t of o.tiles) {
      const tile = s.tiles[t]
      v += tile.price + tile.buildings.reduce((a, b) => a + b.invested, 0)
    }
    return v
  }
  const val = (o: TradeOffer) => {
    let v = liquidValue(o)
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
  const edge = p.cash < safety
    ? EVAL_TRADE_DESPERATE_EDGE
    : EVAL_TRADE_NORMAL_EDGE +
      (brain ? EVAL_TRADE_HOSTILITY_PER_COOPERATION * (1 - brain.profile.cooperation) : 0.02)
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
  // 费用统一走 cardCost（目标型卡按基础上限估，实际结算只会更便宜）
  const cost = (cardId: string) => cash - cardCost(game, cardId) >= safety * 0.5
  const canPay = (amount: number) => cash - amount >= safety * 0.5
  const lookahead = Math.max(0, brain?.profile.lookahead ?? 1)
  switch (cardId) {
    case 'invest-oilfield': return cost('invest-oilfield') && s.tiles.some(t => t.terrain === 'desert' && t.owner === null)
    case 'bridge-share': return cost('bridge-share') && [WEST_BRIDGE, EAST_BRIDGE].some(i => s.tiles[i].owner !== null && s.tiles[i].owner !== playerId)
    case 'temp-dock': return cost('temp-dock') && (s.tiles[WEST_BRIDGE].owner !== null || s.tiles[EAST_BRIDGE].owner !== null)
    case 'speculate': {
      const res = bestMarketRes(game)
      return canPay(Math.round((s.market[res] * 0.5 * 10) / 10) * 10) && priceForecast(game, res, lookahead) >= 0.95
    }
    case 'geologist-hire': return cost('geologist-hire') && s.tiles.some(t => t.owner === playerId && t.terrain === 'desert' && !t.explored)
    case 'bribe': return cost('bribe') && isMonopoly(game, playerId)
    case 'market-fair': return cost('market-fair') && s.tiles.some(t => t.owner === playerId && t.baseRent > 0)
    case 'temp-dam': return cost('temp-dam') && (s.season === 'spring' || (lookahead >= 1 && nextIsSpring(s)))
    case 'auction-commission': return cost('auction-commission') && s.tiles.some(t => t.owner === null && t.type === 'terrain' && !t.seized)
    case 'insurance': {
      // 风险承受低 / 高灾害季（夏季台风 / 冬季雪灾）→ 更愿买保险
      const risky = s.season === 'summer' || s.season === 'winter'
      return cost('insurance') && (risky || (brain?.profile.riskTolerance ?? 0.5) < 0.4)
    }
    case 'tech-invest': return cost('tech-invest') && s.tiles.some(t => t.owner === playerId && t.type === 'terrain' && t.buildings.length < 2)
    case 'dump-resources': return Object.values(p.resources).some(v => v > 0)
    case 'water-invest': return cost('water-invest')
    case 'land-deal': return cost('land-deal') && s.tiles.some(t => t.owner === null && t.type === 'terrain' && !t.seized)
    case 'premium-sale': return Object.values(p.resources).some(v => v >= 5)
    case 'energy-saving': return cost('energy-saving')
    case 'hire-workers': return cost('hire-workers')
    case 'informant': return cost('informant') && s.tiles.some(t => t.owner === playerId && t.type === 'terrain' && !t.explored)
    case 'bodyguard': return cost('bodyguard') && isMonopoly(game, playerId)
    case 'repair-crew': return cost('repair-crew') && s.tiles.some(t => t.owner === playerId && t.buildings.some(b => b.damaged))
    case 'sabotage': return cost('sabotage') && s.tiles.some(t => t.owner !== null && t.owner !== playerId && t.buildings.length > 0)
    case 'steal-resources': return cost('steal-resources') && s.players.some(
      p => p.alive && p.id !== playerId && (Object.keys(RESOURCES) as ResourceType[]).some(r => p.resources[r] > 0),
    )
    case 'roadblock': return cost('roadblock') && s.roadblock === null
    case 'incite-defection': {
      const their = s.tiles.filter(t => t.type === 'terrain' && t.owner !== null && t.owner !== playerId)
      return cost('incite-defection') && their.some(t =>
        s.tiles.some(x => x.type === 'terrain' && x.owner === playerId && x.terrain === t.terrain),
      )
    }
    default: return true
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

// ---------- 资源选择（按市价 × 前景 × 已有库存；伤害卡按"对手暴露最多"） ----------

function chooseResource(game: GameApi, playerId: number, options: ResourceType[], cardId?: string): ResourceType {
  const s = game.state
  const p = s.players[playerId]
  const brain = getBrain(s, playerId)
  const lookahead = Math.max(0, brain?.profile.lookahead ?? 1)
  // 行业崩盘：选对手持有生产地块最多的资源，打击面最大（自己免疫，不计自己的地块）
  if (cardId === 'market-crash') {
    const scored = options.map(r => ({
      value: r,
      score: opponentExposure(game, playerId, r),
    }))
    return rollAction(game, brain!, scored) ?? options[0]
  }
  const scored = options.map(r => ({
    value: r,
    score: s.market[r] * Math.max(0.9, Math.min(1.3, priceForecast(game, r, lookahead))) * (p.resources[r] > 0 ? 1.2 : 1),
  }))
  return rollAction(game, brain!, scored) ?? options[0]
}

/** 对手在某资源上的暴露度：对手持有的该地形地块数 × 基础产出 × 市价（不含自己） */
function opponentExposure(game: GameApi, playerId: number, res: ResourceType): number {
  let score = 0
  for (const t of game.state.tiles) {
    if (t.type !== 'terrain' || t.owner === null || t.owner === playerId) continue
    if (!game.state.players[t.owner]?.alive) continue
    if (TERRAIN_RESOURCE[t.terrain as Terrain] === res) score += game.state.market[res]
  }
  return score
}

/** 地形选择（灾害卡：选对手暴露最多的地形区） */
function chooseTerrain(game: GameApi, playerId: number, options: Terrain[], cardId: string): Terrain {
  const brain = getBrain(game.state, playerId)
  const scored = options.map(terrain => {
    const res = TERRAIN_RESOURCE[terrain]
    return {
      value: terrain,
      // 暴风雪/沙尘暴：暴露度即对手在该地形的产出价值
      score: opponentExposure(game, playerId, res),
    }
  })
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
  const grudgePush = brain ? brain.memory.filter(m => m.from === targetId).length * 200 : 0
  const coop = (brain?.profile.cooperation ?? 0.5)
  const aggression = (brain?.profile.aggression ?? 0.5)
  // 难度行为：联合举报意愿高则更愿意分摊成本，低则除非有私怨基本不参与
  const appetite = brain?.profile.jointReportAppetite ?? 0.5
  const score = ev + grudgePush + (coop * 150 - 75) + aggression * 100 + (appetite - 0.5) * 300
  const chosen = rollAction(game, brain!, [
    { value: true, score },
    { value: false, score: 0 },
  ])
  return { join: !!chosen }
}
