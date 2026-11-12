// ============ 游戏核心：回合状态机与全部 API（纯 TS，无 DOM 依赖） ============

import {
  CLIMATE, CLIMATE_MODS, CLIMATE_NAMES, EAST_BRIDGE, INITIAL_CASH, LOG_CAP, MAX_TURNS,
  PLAYER_COLORS, PLAYER_SHAPES, RESOURCES, SEASON_CARD_WEIGHT, SEASON_LEN_MAX,
  SEASON_LEN_MIN, SEASON_ORDER, SEASONS, START_BONUS, START_REPAIR_DISCOUNT,
  TILE_COUNT, TURN_OP_LIMITS, WEST_BRIDGE,
} from './config'
import { CHANCE_DECK, FATE_DECK, type CardDef } from './cards'
import { RNG } from './rng'
import { createTiles, LAYOUT, SEA_POINTS, nearestCoast } from './map'
import { updateMarket, sellUnitPrice, settleMarketPressure, recordSale } from './market'
import {
  bridgeRepairCost, bridgeToll, collectOutput, gdpValue, tileRent, totalValue,
} from './economy'
import { updateDisasters } from './disasters'
import {
  applySeasonEvent, lobby, reportMonopoly, resetSeasonEvent,
  tickChains,
} from './events'
import { build, explore, repair, repairCost, upgrade } from './buildings'
import { checkCrisis, checkMonopolyVictory, declareBankruptcy, forceLiquidate } from './bankruptcy'
import { aiAct, aiRespond } from './ai'
import type {
  AiDifficulty, CasinoBet, GameApi, GameState, Player, PlayerShape, Prompt, ResourceType, SfxName, Tile, TradeOffer, TyphoonState,
} from './types'
import { createBrains } from './ai/brain'

export interface PlayerSetup {
  name: string
  isAI: boolean
  shape?: PlayerShape
}

export interface GameOptions {
  speedMs?: number
  seed?: number
  muted?: boolean
  aiDifficulty?: AiDifficulty
}

type Listener = (data: any) => void

export class Game implements GameApi {
  state!: GameState
  /** 本次移动中已结算桥过路费（经过与落桥统一在移动途中收费，避免落点重复收费） */
  private bridgeTollPaid = false
  rng!: RNG
  pendingPrompt: Prompt | null = null
  muted = false

  private listeners = new Map<string, Set<Listener>>()
  private resolver: ((v: any) => void) | null = null
  private fateDeck: CardDef[] = []
  private chanceDeck: CardDef[] = []
  private stopped = false
  private pendingSave = false

  // ---------- 事件 ----------

  on(event: string, cb: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(cb)
    return () => this.listeners.get(event)?.delete(cb)
  }

  emit(event: string, data?: any): void {
    this.listeners.get(event)?.forEach(cb => {
      try { cb(data) } catch (e) { console.error(`[game] listener error on "${event}"`, e) }
    })
  }

  markChanged(): void {
    this.emit('state-changed')
  }

  // ---------- 工具 ----------

  sleep(ms?: number): Promise<void> {
    const t = ms ?? this.state.speedMs
    if (!t || t <= 0) return Promise.resolve()
    return new Promise(res => setTimeout(res, t))
  }

  log(text: string, playerId: number | null = null): void {
    const s = this.state
    s.log.unshift({ turn: s.turn, round: s.totalRound ?? s.round, text, playerId })
    if (s.log.length > LOG_CAP) s.log.length = LOG_CAP
    this.markChanged()
  }

  sfx(name: SfxName): void {
    if (!this.muted) this.emit('sfx', name)
  }

  isHuman(p: number): boolean {
    const player = this.state.players[p]
    return !!player && !player.isAI
  }

  rollDie(): number {
    // 每次转动使用一个全新的随机种子：种子本身从当前随机流派生，
    // 保证单次转动彼此独立，同时整局序列仍可复现（模拟器对比依赖此特性）
    const seed = this.rng.int(0, 0x7fffffff)
    const rng = new RNG(seed)
    // 空仓格(0)概率约 4%：25 格中占 1 格；1~12 各占 2 格均匀分布
    const roll = rng.int(1, 25)
    return roll === 25 ? 0 : ((roll + 1) >> 1)
  }

  // ---------- 人类交互 ----------

  async prompt<T = any>(p: Prompt): Promise<T> {
    const pid = (p as { player?: number }).player ?? (p as { to?: number }).to ?? -1
    const player = pid >= 0 ? this.state.players[pid] : null
    if (player && player.isAI) {
      if (this.state.speedMs > 0) await this.sleep(Math.max(100, this.state.speedMs * 0.35))
      return aiRespond(this, p) as T
    }
    this.pendingPrompt = p
    this.emit('prompt', p)
    this.markChanged()
    return new Promise<T>(resolve => { this.resolver = resolve })
  }

  respond(v: any): void {
    if (!this.resolver) return
    const r = this.resolver
    this.resolver = null
    this.pendingPrompt = null
    this.emit('prompt-resolved')
    r(v)
  }

  /** 通知弹窗（有人类时展示，全 AI 时跳过）。
   *  auto 在「发起时刻」确定：AI 回合的通知自动关闭；人类回合的通知必须点确定。
   *  不再由 UI 读取实时 currentPlayer，避免回合推进后误判导致人类回合弹窗自动消失 */
  async notice(title: string, text: string, icon?: string): Promise<void> {
    const hasHuman = this.state.players.some(p => p.alive && !p.isAI)
    if (!hasHuman) return
    const auto = !!this.state.players[this.state.currentPlayer]?.isAI
    await this.prompt({ type: 'notice', title, text, icon, player: -1, auto })
  }

  /** 资金不足提示由 UI 层弹层处理（store.showNoMoney），不再走游戏流程——
   *  走 prompt() 会覆盖行动阶段弹窗的应答器，导致「结束回合」软锁（历史 bug） */

  // ---------- 金钱 ----------

  async pay(playerId: number, amount: number, to: number | null, label: string): Promise<void> {
    const s = this.state
    const p = s.players[playerId]
    if (!p || !p.alive || amount <= 0) return
    amount = Math.round(amount)
    if (p.cash >= amount) {
      this.transfer(playerId, to, amount, label)
      return
    }
    // 现金不足：强制变卖
    forceLiquidate(this, playerId, amount)
    if (p.cash >= amount) {
      this.transfer(playerId, to, amount, label)
      this.log(`${p.name} 现金不足，被迫变卖资产以支付 ${label}`, playerId)
      this.sfx('lose')
      return
    }
    // 仍不足：破产
    await declareBankruptcy(this, playerId, to, `无法支付${label}`)
  }

  private transfer(from: number, to: number | null, amount: number, label: string): void {
    const s = this.state
    const p = s.players[from]
    p.cash -= amount
    p.stats.spent += amount
    if (to === null) p.stats.bankOut += amount   // 流向银行（罚款/卡牌费等）
    let suffix = ''
    if (to !== null) {
      const c = s.players[to]
      c.cash += amount
      c.stats.earned += amount
      suffix = `，支付给「${c.name}」`
    }
    this.log(`${p.name} ${label}：-${amount}${suffix}`, from)
    this.markChanged()
  }

  gain(playerId: number, amount: number, label: string): void {
    const p = this.state.players[playerId]
    if (!p || !p.alive || amount <= 0) return
    amount = Math.round(amount)
    p.cash += amount
    p.stats.earned += amount
    p.stats.bankIn += amount   // 银行发放（卡牌/奖金/补贴等）
    this.log(`${p.name} ${label}：+${amount}`, playerId)
    this.sfx('coin')
    this.markChanged()
  }

  // ---------- 卡牌 ----------

  private drawCard(cat: 'fate' | 'chance'): CardDef {
    const s = this.state
    let deck = cat === 'fate' ? this.fateDeck : this.chanceDeck
    if (deck.length === 0) {
      const fresh = cat === 'fate' ? FATE_DECK : CHANCE_DECK
      deck = this.rng.shuffle(fresh)
      if (cat === 'fate') this.fateDeck = deck
      else this.chanceDeck = deck
    }
    // 季节加权（文档 5.4）
    const weights = deck.map(c => (c.seasons?.includes(s.season) ? SEASON_CARD_WEIGHT : 1))
    const idx = this.rng.weighted(weights)
    const card = deck.splice(idx, 1)[0]
    s.deckLeft[cat] = deck.length
    return card
  }

  async drawFate(playerId: number): Promise<void> {
    const card = this.drawCard('fate')
    const p = this.state.players[playerId]
    this.log(`「${p.name}」抽到命运卡：${card.name}`, playerId)
    this.sfx('card')
    await this.prompt({
      type: 'card', cardId: card.id, category: 'fate',
      name: card.name, desc: card.desc, icon: card.icon,
      canDecline: false, player: playerId,
    })
    await card.effect(this, playerId)
    // 卡牌可能改变地块归属（收购/策反/征用等），需立即检查垄断胜利
    checkMonopolyVictory(this)
    this.markChanged()
  }

  async drawChance(playerId: number, forced = false): Promise<void> {
    const card = this.drawCard('chance')
    const p = this.state.players[playerId]
    this.log(`「${p.name}」抽到机会卡：${card.name}`, playerId)
    this.sfx('card')
    if (!forced) {
      const res = await this.prompt<{ accept: boolean }>({
        type: 'card', cardId: card.id, category: 'chance',
        name: card.name, desc: card.desc, icon: card.icon,
        canDecline: true, player: playerId,
      })
      if (!res?.accept) {
        this.log(`「${p.name}」放弃了机会卡`, playerId)
        return
      }
    } else {
      await this.prompt({
        type: 'card', cardId: card.id, category: 'chance',
        name: card.name, desc: card.desc, icon: card.icon,
        canDecline: false, player: playerId,
      })
    }
    await card.effect(this, playerId)
    // 卡牌可能改变地块归属（收购/策反/征用等），需立即检查垄断胜利
    checkMonopolyVictory(this)
    this.markChanged()
  }

  // ---------- 拍卖 ----------

  async runAuction(tileIndex: number, startPrice: number, opts: { exclude?: number; seller?: number } = {}): Promise<number | null> {
    const s = this.state
    const tile = s.tiles[tileIndex]
    let current = Math.round(startPrice)
    let leader: number | null = null
    const order = s.players.filter(p => p.alive && p.id !== opts.exclude)
    const startIdx = Math.max(0, order.findIndex(p => p.id === s.currentPlayer) + 1)
    const rotated = [...order.slice(startIdx), ...order.slice(0, startIdx)]

    this.log(`「${tile.name}」开始拍卖，底价 ${current}`)
    await this.notice('拍卖开始', `「${tile.name}」开始拍卖！底价 ${current}。`, '🔨')

    // 放弃即退出本轮拍卖（不再被询问），直到剩下最后一名出价者。
    // 当前最高出价者跳过：既避免自己抬自己的价，也让「其余人全部放弃」成为终止条件。
    const passed = new Set<number>()
    while (rotated.some(p => p.alive && !passed.has(p.id) && p.id !== leader)) {
      for (const p of [...rotated]) {
        if (!p.alive || passed.has(p.id) || p.id === leader) continue
        const minBid = leader === null ? current : Math.max(current + 50, Math.round((current * 1.05) / 10) * 10)
        const ans = await this.prompt<{ pass: boolean; bid?: number }>({
          type: 'bid', title: `拍卖「${tile.name}」`, tile: tileIndex,
          currentBid: current, currentBidder: leader, minBid,
          myCash: p.cash, canPass: true, player: p.id,
        })
        if (!ans?.pass && ans?.bid && ans.bid >= minBid && ans.bid <= p.cash) {
          current = ans.bid
          leader = p.id
          this.log(`「${p.name}」出价 ${ans.bid}`)
          this.sfx('coin')
          this.markChanged()
        } else {
          passed.add(p.id)
          this.log(`「${p.name}」放弃出价`, p.id)
          this.sfx('click')
          this.markChanged()
        }
      }
    }

    if (leader === null) {
      this.log(`「${tile.name}」流拍`)
      this.markChanged()
      return null
    }
    const buyer = s.players[leader]
    await this.pay(leader, current, opts.seller ?? null, `拍下「${tile.name}」`)
    if (!buyer.alive) {
      // 破产流拍：地块保持原状
      this.markChanged()
      return null
    }
    tile.owner = leader
    this.log(`「${tile.name}」以 ${current} 成交，由「${buyer.name}」拍得`)
    this.sfx('gavel')
    this.sfx('coin')
    this.markChanged()
    checkMonopolyVictory(this)
    if (this.state.winner !== null) this.endAction()
    return leader
  }

  // ---------- 行动 API（UI / AI 调用） ----------

  buyCurrentTile(): void {
    const s = this.state
    const p = s.players[s.currentPlayer]
    const tile = s.tiles[p.pos]
    if (tile.owner !== null) return
    if (p.cash < tile.price) {
      // 资金不足：明确提示，避免点击购买后无任何反馈
      this.log(`「${p.name}」资金不足（￥${p.cash}），未能购买「${tile.name}」（￥${tile.price}）`, p.id)
      this.sfx('lose')
      return
    }
    p.cash -= tile.price
    p.stats.spent += tile.price
    p.stats.tileSpent += tile.price   // 金钱流向观测
    tile.owner = p.id
    this.log(`「${p.name}」买下了「${tile.name}」（-${tile.price}）`, p.id)
    this.emit('float', { tile: tile.index, text: `-${tile.price}`, color: '#7fe07a' })
    this.sfx('coin')
    this.markChanged()
    checkMonopolyVictory(this)
    // 胜利发生在行动阶段：立刻结束本回合，避免人类还要手动点“结束回合”
    if (this.state.winner !== null) this.endAction()
  }

  buildAt(tileIndex: number, defId: string): boolean {
    const s = this.state
    const p = s.players[s.currentPlayer]
    if (s.ops.build <= 0) return false
    if (!build(this, p.id, tileIndex, defId)) return false
    s.ops.build--
    this.markChanged()   // build 内部已 emit，再刷一次让 UI 看到配额减少
    return true
  }

  upgradeAt(tileIndex: number, buildingId: number): boolean {
    const s = this.state
    const p = s.players[s.currentPlayer]
    if (s.ops.upgrade <= 0) return false
    if (!upgrade(this, p.id, tileIndex, buildingId)) return false
    s.ops.upgrade--
    this.markChanged()
    return true
  }

  repairAt(tileIndex: number, buildingId: number): boolean {
    const s = this.state
    const p = s.players[s.currentPlayer]
    if (s.ops.repair <= 0) return false
    if (!repair(this, p.id, tileIndex, buildingId)) return false
    s.ops.repair--
    this.markChanged()
    return true
  }

  exploreAt(tileIndex: number): boolean {
    const s = this.state
    const p = s.players[s.currentPlayer]
    if (s.ops.explore <= 0) return false
    if (!explore(this, p.id, tileIndex)) return false
    s.ops.explore--
    this.markChanged()
    return true
  }

  /** 修桥（桥主）：费用统一走 economy.bridgeRepairCost（升级成本半价） */
  repairBridge(tileIndex: number): boolean {
    const s = this.state
    const p = s.players[s.currentPlayer]
    const tile = s.tiles[tileIndex]
    if (tile.type !== 'bridge' || tile.owner !== p.id || tile.bridgeLevel >= 3) return false
    if (s.ops.bridge <= 0) return false
    const cost = bridgeRepairCost(tile)
    if (p.cash < cost) return false
    p.cash -= cost
    p.stats.spent += cost
    p.stats.buildSpent += cost   // 金钱流向观测
    tile.bridgeLevel = (tile.bridgeLevel + 1) as 0 | 1 | 2 | 3
    tile.bridgeClosed = 0
    s.ops.bridge--
    this.log(`「${p.name}」修复「${tile.name}」（-${cost}）`, p.id)
    this.sfx('build')
    this.markChanged()
    return true
  }

  /** 卖资源换现金 */
  sellResources(res: ResourceType, units: number): boolean {
    const s = this.state
    const p = s.players[s.currentPlayer]
    units = Math.floor(units)
    if (units <= 0 || p.resources[res] < units) return false
    const price = sellUnitPrice(this, p.id, res, units)
    const income = Math.round(units * price)
    p.resources[res] -= units
    p.cash += income
    p.stats.earned += income
    p.stats.resourceIncome += income   // 金钱流向观测
    // 所有玩家的大额抛售都计入供给压力：人类玩家不再能无限量、无成本地砸盘
    recordSale(this, res, units)
    this.log(`「${p.name}」卖出 ${units} 单位${RESOURCES[res].name}（+${income}）`, p.id)
    this.sfx('coin')
    this.markChanged()
    return true
  }

  lobbySelf(level: 1 | 2 | 3): boolean {
    return lobby(this, this.state.currentPlayer, level)
  }

  async reportTarget(targetId: number): Promise<boolean> {
    const ok = await reportMonopoly(this, this.state.currentPlayer, targetId)
    // 举报/强制拍卖可能直接产生垄断胜者
    if (this.state.winner !== null) this.endAction()
    return ok
  }

  /** 主动认输 */
  async resign(): Promise<void> {
    const p = this.state.players[this.state.currentPlayer]
    await declareBankruptcy(this, p.id, null, '主动认输')
    if (this.pendingPrompt?.type === 'action') this.respond('done')
  }

  /** 玩家间交易 */
  async proposeTrade(to: number, give: TradeOffer, receive: TradeOffer): Promise<boolean> {
    const s = this.state
    const from = s.currentPlayer
    const fromP = s.players[from]
    const toP = s.players[to]
    if (!toP.alive) return false
    // 校验
    for (const t of give.tiles) if (s.tiles[t].owner !== from) return false
    for (const t of receive.tiles) if (s.tiles[t].owner !== to) return false
    if (give.cash > fromP.cash || receive.cash > toP.cash) return false
    for (const r of Object.keys(RESOURCES) as ResourceType[]) {
      if ((give.resources[r] ?? 0) > fromP.resources[r]) return false
      if ((receive.resources[r] ?? 0) > toP.resources[r]) return false
    }
    const ans = await this.prompt<{ accept: boolean }>({
      type: 'trade-offer', from, to, give, receive,
    })
    if (!ans?.accept) {
      this.log(`「${toP.name}」拒绝了「${fromP.name}」的交易提议`)
      this.markChanged()
      return false
    }
    // 执行
    for (const t of give.tiles) s.tiles[t].owner = to
    for (const t of receive.tiles) s.tiles[t].owner = from
    for (const r of Object.keys(RESOURCES) as ResourceType[]) {
      const g = give.resources[r] ?? 0
      const rc = receive.resources[r] ?? 0
      if (g > 0) { fromP.resources[r] -= g; toP.resources[r] += g }
      if (rc > 0) { toP.resources[r] -= rc; fromP.resources[r] += rc }
    }
    fromP.cash -= give.cash
    toP.cash += give.cash
    toP.cash -= receive.cash
    fromP.cash += receive.cash
    this.log(`「${fromP.name}」与「${toP.name}」达成交易`)
    this.sfx('coin')
    this.markChanged()
    checkMonopolyVictory(this)
    if (this.state.winner !== null) this.endAction()
    return true
  }

  /** 结束行动阶段 */
  endAction(): void {
    if (this.pendingPrompt?.type === 'action') {
      this.respond('done')
    }
  }

  // ---------- 主循环 ----------

  async start(setups: PlayerSetup[], opts: GameOptions = {}): Promise<void> {
    this.stopped = false
    this.rng = new RNG(opts.seed)
    this.muted = opts.muted ?? false
    const speedMs = opts.speedMs ?? 900

    const s: GameState = {
      started: true,
      phase: 'order',
      turn: 0,
      round: 0,
      totalRound: 0,
      // 开局季节随机（四季任一），此后按 春→夏→秋→冬 顺序循环
      season: SEASON_ORDER[this.rng.int(0, SEASON_ORDER.length - 1)],
      seasonTurn: 0,
      seasonLen: 0,
      year: 1,
      currentPlayer: 0,
      wheelResult: null,
      turnOrder: [],
      orderRolls: [],
      players: [],
      tiles: createTiles(this.rng),
      market: { wood: 120, beef: 100, oil: 150, fish: 130 },
      rentMods: [],
      bridgeTollMods: [],
      repairMods: [],
      outputModAll: [],
      outputModsRes: [],
      priceMods: [],
      typhoon: null,
      typhoonProbDelta: 0,
      floodProbDelta: 0,
      skipDisaster: null,
      quake: null,
      chains: [],
      endgame: false,
      roundsNoBankruptcy: 0,
      firstBankruptTurn: null,
      winner: null,
      endReason: null,
      bankruptOrder: [],
      log: [],
      casinoBets: [],
      speculation: [],
      seasonEvent: null,
      deckLeft: { fate: FATE_DECK.length, chance: CHANCE_DECK.length },
      speedMs,
      aiBrains: [],
      aiDifficulty: (opts.aiDifficulty ?? 'normal') as AiDifficulty,
      marketPressure: { wood: 0, beef: 0, oil: 0, fish: 0 },
      ops: { ...TURN_OP_LIMITS },
      gdp: 0,
      gdpPrev: 0,
      climate: 'normal',
      climateTurns: 0,
      recessionStreak: 0,
      roadblock: null,
    }
    this.state = s

    s.players = setups.map((st, i) => this.makePlayer(i, st))
    s.aiBrains = createBrains(s.players, s.aiDifficulty, this.rng)
    // GDP 基线：开局资产（首轮涨跌相对开局比较，避免从 0 起算出现虚假暴涨）
    s.gdp = this.gdpNow()
    s.gdpPrev = s.gdp
    this.fateDeck = this.rng.shuffle(FATE_DECK)
    this.chanceDeck = this.rng.shuffle(CHANCE_DECK)

    this.log(`游戏开始！${s.players.map(p => `「${p.name}」${p.isAI ? '(AI)' : '(玩家)'}`).join('、')}`)
    this.emit('game-start')
    this.markChanged()

    try {
      // 开局：转动轮盘决定行动顺序
      await this.runOrderPhase()

      // 首季长度随机抽取（10~15 轮，此后每季重新抽取，无法预判）
      s.seasonLen = this.rng.int(SEASON_LEN_MIN, SEASON_LEN_MAX)
      // 首季同样触发季节事件（旧实现只在 advanceSeason 里调用，开局第一季永远没有事件）
      applySeasonEvent(this)
      s.currentPlayer = s.turnOrder[0] ?? 0
      await this.runMainLoop()
    } catch (e) {
      console.error('[game] 运行时错误', e)
      throw e
    }
  }

  /** 主循环：1 轮 = 全部存活玩家各行动一次；季节按轮数随机更替，灾害每轮触发一次 */
  private async runMainLoop(): Promise<void> {
    const s = this.state
    while (this.aliveCount() > 1 && s.winner === null && s.turn < MAX_TURNS && !this.stopped) {
      // 新一轮开始
      s.round++
      s.totalRound++
      if (s.round > s.seasonLen) {
        await this.advanceSeason()   // 内部把 round/seasonTurn 置为 1（新季节首轮）
      } else {
        s.seasonTurn = s.round
      }
      // 市场供给压力结算：上轮净卖出量压价后清零
      settleMarketPressure(this)

      // 景气价格修正：繁荣/衰退在轮首对资源价格一次性乘算（避免按玩家回合重复叠加）
      const climatePrice = CLIMATE_MODS[s.climate].price
      if (climatePrice !== 1) {
        for (const res of Object.keys(RESOURCES) as ResourceType[]) {
          s.market[res] = Math.round(s.market[res] * climatePrice)
        }
      }

      // 市场价格每轮只更新一次：随机游走 + 均值回归。旧实现按玩家行动更新，
      // 4~8 人局里同一轮价格会跳 4~8 次，玩家无法判断「什么时候卖」。
      updateMarket(this)

      // 每轮一次的灾害与事件链
      await updateDisasters(this)
      await tickChains(this)

      // 从 currentPlayer 起按行动顺序旋转遍历：新局从首行动者开始，
      // 读档则从存档时的下一位行动者继续（避免整轮重放）
      const startIdx = Math.max(0, s.turnOrder.indexOf(s.currentPlayer))
      for (let k = 0; k < s.turnOrder.length; k++) {
        const id = s.turnOrder[(startIdx + k) % s.turnOrder.length]
        if (s.winner !== null || this.aliveCount() <= 1 || this.stopped) break
        const p = s.players[id]
        if (!p || !p.alive) continue
        await this.runTurn(p)
        // 存档请求：在本回合边界落盘（下一行动者回合开始前）
        if (this.pendingSave && !this.stopped) {
          this.pendingSave = false
          s.currentPlayer = this.nextPlayerAfter(id)
          s.phase = 'spin'
          s.wheelResult = null
          this.emit('save-ready', JSON.stringify(s))
        }
      }

      // 一轮结束：行动顺序回到本局开局顺序。若按「上轮末位玩家」作为下一轮起点
      // （读档恢复用的轮转逻辑），会造成上轮最后行动的玩家连续行动两次——末尾连续两轮都是自己
      s.currentPlayer = s.turnOrder[0] ?? 0

      // 轮末：终局经济危机按「轮」结算（旧实现放在每个玩家的 endTurn 里，
      // 2 人终局每 5 个行动就缩水一次，实际是 2.5 轮而非文案的 5 轮）
      if (s.winner === null && !this.stopped) await checkCrisis(this)

      // 轮末：全局修正按轮衰减（卡牌/事件链/季节事件）
      this.decayRoundMods()

      // 轮末：游说效果与举报保护期按轮衰减
      for (const p of s.players) {
        if (p.status.antitrustTurns > 0) {
          p.status.antitrustTurns--
          if (p.status.antitrustTurns === 0) p.status.antitrustMod = 0
        }
        if (p.status.reportCooldown > 0) p.status.reportCooldown--
      }

      // 轮末 GDP 统计：与上轮对比，顶栏箭头显示涨跌
      s.gdpPrev = s.gdp
      s.gdp = this.gdpNow()
      this.updateClimate()
      this.markChanged()
    }
    // 主动停止（返回主菜单）：不要伪造胜者/终局事件
    if (this.stopped) return
    const alive = s.players.filter(p => p.alive)
    if (s.winner === null) {
      const winner = [...alive].sort((a, b) => totalValue(this, b.id) - totalValue(this, a.id))[0]
      s.winner = winner?.id ?? 0
      // 行动数达到上限：按总资产判定；否则是最后一人（非当前玩家破产时不会经过 endTurn 的胜者登记）
      s.endReason = s.turn >= MAX_TURNS ? 'timeout' : (alive.length === 1 ? 'last-standing' : null)
    } else {
      // 垄断判决时通常仍有多名玩家存活；淘汰至只剩一人则是最后生还
      s.endReason = alive.length > 1 ? 'monopoly' : 'last-standing'
    }
    s.phase = 'gameover'
    const winner = s.players[s.winner]
    const reasonText = s.endReason === 'timeout' ? '（行动数达到上限，按总资产判定）'
      : s.endReason === 'monopoly' ? '（垄断判决）' : ''
    this.log(`游戏结束！「${winner.name}」获胜！${reasonText}`)
    this.sfx('win')
    this.emit('game-over', s.winner)
    this.markChanged()
  }

  /** 当前 GDP：总资产扣除银行无偿发放（起点奖励/卡牌补贴等「没有创造」的印钞），只计真实经济 */
  private gdpNow(): number {
    const windfall = this.state.players.reduce(
      (sum, p) => sum + (p.stats.bankIn ?? 0) + (p.stats.startBonus ?? 0),
      0,
    )
    return gdpValue(this) - windfall
  }

  /** 轮末景气评估：按 GDP 涨跌幅判定繁荣/正常/衰退；连续衰退转危机（持续 5 轮锁定） */
  private updateClimate(): void {
    const s = this.state
    const prev = s.climate
    if (s.climate === 'crisis') {
      // 危机期间锁定，倒计时结束解除（下一轮再按 GDP 重评）
      s.climateTurns--
      if (s.climateTurns <= 0) s.climate = 'normal'
    } else {
      const rel = s.gdpPrev > 0 ? (s.gdp - s.gdpPrev) / s.gdpPrev : 0
      if (rel >= CLIMATE.boomDelta) {
        s.climate = 'boom'
        s.recessionStreak = 0
      } else if (rel <= CLIMATE.recessionDelta) {
        s.recessionStreak++
        if (s.recessionStreak >= CLIMATE.crisisStreak) {
          s.climate = 'crisis'
          s.climateTurns = CLIMATE.crisisTurns
          s.recessionStreak = 0
        } else {
          s.climate = 'recession'
        }
      } else {
        s.climate = 'normal'
        s.recessionStreak = 0
      }
    }
    if (s.climate !== prev) {
      this.log(`经济景气：${CLIMATE_NAMES[s.climate]}！${s.climate === 'crisis' ? `（持续 ${s.climateTurns} 轮）` : ''}`)
      this.emit('climate', s.climate)
      this.sfx(s.climate === 'crisis' ? 'lose' : s.climate === 'boom' ? 'coin' : 'click')
    }
  }

  /** 轮末衰减全局修正（租金/过路费/修理费/产出/价格）：每轮只减一次，与玩家数量无关 */
  private decayRoundMods(): void {
    const s = this.state
    const decay = <T extends { turns: number }>(arr: T[]): T[] =>
      arr.filter(m => { m.turns--; return m.turns > 0 })
    s.rentMods = decay(s.rentMods)
    s.bridgeTollMods = decay(s.bridgeTollMods)
    s.repairMods = decay(s.repairMods)
    s.outputModAll = decay(s.outputModAll)
    s.outputModsRes = decay(s.outputModsRes)
    s.priceMods = decay(s.priceMods)
  }

  /** 行动顺序中 id 之后的下一位存活玩家（用于存档边界） */
  private nextPlayerAfter(id: number): number {
    const s = this.state
    const order = [...s.turnOrder]
    const idx = order.indexOf(id)
    for (let k = 1; k <= order.length; k++) {
      const cand = order[(idx + k) % order.length]
      if (s.players[cand]?.alive) return cand
    }
    return id
  }

  /** 季节更替：四季循环，每季轮数在 10~15 之间随机抽取 */
  private async advanceSeason(): Promise<void> {
    const s = this.state
    const idx = SEASON_ORDER.indexOf(s.season)
    s.season = SEASON_ORDER[(idx + 1) % SEASON_ORDER.length]
    if (s.season === 'spring') s.year++
    // 换季发生在「新季节第 1 轮」的开头；直接置 1，避免显示「本季第 0/N 回合」
    // 以及每季多打一轮（旧实现先置 0、由调用方之后才加到 1，首轮被重复计数）。
    s.round = 1
    s.seasonTurn = 1
    s.seasonLen = this.rng.int(SEASON_LEN_MIN, SEASON_LEN_MAX)
    resetSeasonEvent(this)
    applySeasonEvent(this)
    this.emit('season', s.season)
    this.sfx('season')
    this.log(`—— 第 ${s.year} 年 · ${SEASONS[s.season].name}季 ——`)
    await this.notice('季节更替', `第 ${s.year} 年 · ${SEASONS[s.season].name}季到来！${s.seasonEvent ? `【${s.seasonEvent.name}】${s.seasonEvent.desc}` : ''}`, SEASONS[s.season].icon)
  }

  stop(): void {
    this.stopped = true
    if (this.resolver) {
      const r = this.resolver
      this.resolver = null
      this.pendingPrompt = null
      r(null)
    }
  }

  // ---------- 存档 / 读档 ----------

  /** 请求存档：在下一个回合边界（某位玩家行动结束后）落盘，保证存档状态干净可恢复 */
  requestSave(): void {
    this.pendingSave = true
  }

  /** 从存档恢复：状态整体替换，从主循环继续（当前行动者重新开始其回合） */
  restore(json: string): void {
    // 先初始化主随机源：旧存档缺少 aiBrains 时，下方兜底 createBrains 需要 this.rng
    this.rng = new RNG()
    const saved = JSON.parse(json) as GameState
    // 旧版本存档缺字段兜底
    saved.round = saved.round ?? 0
    saved.totalRound = saved.totalRound ?? saved.round ?? 0
    // runMainLoop 顶部会 ++ 回当前值（读档从回合中段继续，避免多计一轮）
    saved.round = Math.max(0, saved.round - 1)
    saved.totalRound = Math.max(0, saved.totalRound - 1)
    saved.seasonLen = saved.seasonLen ?? SEASON_LEN_MIN
    saved.seasonTurn = saved.seasonTurn ?? 0
    saved.aiDifficulty = (saved.aiDifficulty ?? 'normal') as AiDifficulty
    saved.firstBankruptTurn = saved.firstBankruptTurn ?? null
    saved.endReason = saved.endReason ?? null
    saved.marketPressure = saved.marketPressure ?? { wood: 0, beef: 0, oil: 0, fish: 0 }
    saved.ops = saved.ops ?? { ...TURN_OP_LIMITS }
    // v1.0.2 前存档是单个 casinoBet 槽位：迁移为数组，避免读档丢注
    const legacyBet = (saved as GameState & { casinoBet?: CasinoBet | null }).casinoBet
    saved.casinoBets = saved.casinoBets ?? (legacyBet ? [legacyBet] : [])
    delete (saved as Partial<GameState> & { casinoBet?: CasinoBet | null }).casinoBet
    if (!saved.aiBrains || saved.aiBrains.length !== saved.players.length) {
      saved.aiBrains = createBrains(saved.players, saved.aiDifficulty, this.rng)
    }
    for (const p of saved.players) {
      p.status.reportCooldown = p.status.reportCooldown ?? 0
      p.resources = p.resources ?? { wood: 0, beef: 0, oil: 0, fish: 0 }
      p.stats.resourceIncome = p.stats.resourceIncome ?? 0
      p.stats.startBonus = p.stats.startBonus ?? 0
      p.stats.bankIn = p.stats.bankIn ?? 0
      p.stats.bankOut = p.stats.bankOut ?? 0
      p.stats.tileSpent = p.stats.tileSpent ?? 0
      p.stats.buildSpent = p.stats.buildSpent ?? 0
    }
    this.stopped = false
    this.state = saved
    // 旧存档无 GDP 字段：按当前口径重建首值并保持持平（避免首轮涨跌失真）
    if (!this.state.gdp) this.state.gdp = this.gdpNow()
    if (!this.state.gdpPrev) this.state.gdpPrev = this.state.gdp
    // 旧存档缺景气/路障字段兜底
    this.state.climate = this.state.climate ?? 'normal'
    this.state.climateTurns = this.state.climateTurns ?? 0
    this.state.recessionStreak = this.state.recessionStreak ?? 0
    this.state.roadblock = this.state.roadblock ?? null
    // 旧存档的台风没有轨迹 / 减弱字段：补齐，避免读档后轨迹为空或无法消散
    if (this.state.typhoon) {
      const t = this.state.typhoon as TyphoonState & { seaIndex?: number; dir?: number; predicted?: number }
      // 旧存档只有固定航线索引：迁移成真实海面坐标，之后按新自由路径继续
      if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) {
        const n = SEA_POINTS.length
        const legacy = Math.max(0, Math.min(n - 1, (t.seaIndex ?? 0) | 0))
        const sp = SEA_POINTS[legacy]
        t.x = sp.x
        t.y = sp.y
      }
      if (!Number.isFinite(t.targetTile)) t.targetTile = nearestCoast(t.x, t.y).tile
      if (!Number.isFinite(t.heading)) {
        const p = LAYOUT[t.targetTile] ?? LAYOUT[nearestCoast(t.x, t.y).tile]
        t.heading = Math.atan2(p.y - t.y, p.x - t.x)
      }
      t.coastal = t.coastal ?? false
      t.predictedX = Number.isFinite(t.predictedX) ? (t.predictedX as number) : null
      t.predictedY = Number.isFinite(t.predictedY) ? (t.predictedY as number) : null
      t.weakening = t.weakening ?? false
      t.fading = t.fading ?? false
      if (t.onLand && t.landTile !== null) {
        t.x = LAYOUT[t.landTile].x
        t.y = LAYOUT[t.landTile].y
      }
      if (!Array.isArray(t.path) || t.path.length === 0) t.path = [{ x: t.x, y: t.y }]
    }
    this.state.started = true
    this.state.phase = 'spin'
    this.state.wheelResult = null
    this.rng = new RNG()
    this.fateDeck = this.rng.shuffle(FATE_DECK)
    this.chanceDeck = this.rng.shuffle(CHANCE_DECK)
    this.emit('game-start')
    this.markChanged()
    void this.runMainLoop().catch(e => {
      console.error('[game] 运行时错误', e)
      throw e
    })
  }

  private makePlayer(i: number, st: PlayerSetup): Player {
    return {
      id: i,
      name: st.name || `玩家${i + 1}`,
      isAI: st.isAI,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      shape: st.shape ?? PLAYER_SHAPES[i % PLAYER_SHAPES.length],
      cash: INITIAL_CASH,
      pos: 0,
      alive: true,
      laps: 0,
      resources: { wood: 0, beef: 0, oil: 0, fish: 0 },
      status: {
        moveMod: 0, rentFree: 0, insuredTurns: 0, floodImmune: 0,
        antitrustMod: 0, antitrustTurns: 0, reportCooldown: 0,
        outputMods: [], rentBonus: [], bridgeShare: [],
      },
      traits: {
        aggression: 0.3 + this.rng.float(0, 0.7),
        greed: 0.3 + this.rng.float(0, 0.7),
      },
      stats: {
        earned: 0, spent: 0, rentPaid: 0, rentCollected: 0, timesBankrupt: 0,
        resourceIncome: 0, startBonus: 0, bankIn: 0, bankOut: 0, tileSpent: 0, buildSpent: 0,
      },
    }
  }

  private aliveCount(): number {
    return this.state.players.filter(p => p.alive).length
  }

  /** 开局：每位玩家依次转轮盘得点数（人类点击转动、AI 自动），按点数从大到小决定行动顺序 */
  private async runOrderPhase(): Promise<void> {
    const s = this.state
    const hasHuman = s.players.some(p => !p.isAI)
    const rolls: { id: number; value: number }[] = []
    for (const p of [...s.players]) {
      const value = this.rollDie()
      rolls.push({ id: p.id, value })
      s.orderRolls.push({ playerId: p.id, value })
      s.wheelResult = value
      this.log(`「${p.name}」掷出点数 ${value}`)
      this.markChanged()
      if (!p.isAI) {
        await this.prompt({ type: 'order-wheel', player: p.id })
      } else {
        await this.sleep(s.speedMs > 0 ? Math.max(120, Math.round(s.speedMs * 0.6)) : 0)
      }
      this.sfx('ding')
    }
    // 点数从大到小排序；同点数按原座位顺序（sort 稳定）
    const sorted = [...rolls].sort((a, b) => b.value - a.value)
    s.turnOrder = sorted.map(r => r.id)
    this.log(`行动顺序：${sorted.map((r, i) => `${i + 1}.「${s.players[r.id].name}」(${r.value}点)`).join('，')}`)
    this.emit('order-decided', sorted.map(r => ({ playerId: r.id, value: r.value })))
    this.markChanged()
    if (hasHuman) {
      await this.prompt({
        type: 'order-result', player: -1,
        order: sorted.map(r => {
          const pl = s.players[r.id]
          return { playerId: pl.id, name: pl.name, color: pl.color, value: r.value, isAI: pl.isAI }
        }),
      })
    }
    s.wheelResult = null
    this.markChanged()
  }

  private async runTurn(p: Player): Promise<void> {
    const s = this.state
    s.turn++
    s.currentPlayer = p.id
    s.phase = 'spin'
    s.wheelResult = null

    if (!p.alive || this.stopped) return

    // 转盘
    s.wheelResult = this.rollDie()
    this.log(`「${p.name}」转动转盘：${s.wheelResult} 步`, p.id)
    if (!p.isAI) {
      await this.prompt({ type: 'wheel', player: p.id })
    } else {
      await this.sleep()
    }
    if (!p.alive || this.stopped) return

    // 赌场下注结算：只结算/清理本玩家的注（其他玩家尚未到回合的注必须保留，
    // 旧实现无条件清空 casinoBet，导致除最后下注者外所有赌注永远不结算）
    if (s.casinoBets.length) {
      for (const bet of s.casinoBets.filter(b => b.player === p.id)) this.resolveCasino(p, bet)
      s.casinoBets = s.casinoBets.filter(b =>
        b.player !== p.id && !!s.players[b.player]?.alive,
      )
    }

    // 空仓格：原地 + 机会卡
    let steps = s.wheelResult + p.status.moveMod
    p.status.moveMod = 0
    if (steps <= 0) {
      if (s.wheelResult === 0) {
        await this.notice('空仓格', `「${p.name}」转到了空仓格，原地不动，抽一张机会卡作为补偿！`, '🎯')
        await this.drawChance(p.id)
      }
    } else {
      s.phase = 'move'
      this.markChanged()   // 阶段切换只需刷新一次 UI；逐格刷新由 piece-step 事件驱动
      await this.doMove(p, steps)
      if (!p.alive || this.stopped) return
      s.phase = 'landing'
      this.markChanged()
      await this.resolveLanding(p)
    }
    if (!p.alive || this.stopped || s.winner !== null) return

    // 行动阶段（全体玩家操作配额重置：建造 1 / 升级 1 / 修理 1 / 勘探 1 / 修桥 1）
    s.ops = { ...TURN_OP_LIMITS }
    s.phase = 'action'
    if (!p.isAI) {
      await this.prompt({ type: 'action', player: p.id })
    } else {
      await aiAct(this, p.id)
    }
    if (!p.alive || this.stopped || s.winner !== null) return

    // 回合结束
    await this.endTurn(p)
  }

  private async doMove(p: Player, steps: number): Promise<void> {
    const s = this.state
    const stepMs = s.speedMs > 0 ? Math.max(140, Math.round(s.speedMs * 0.45)) : 0
    this.bridgeTollPaid = false
    for (let i = 0; i < steps; i++) {
      if (!p.alive || this.stopped) return
      p.pos = (p.pos + 1) % TILE_COUNT
      if (p.pos === 0) {
        p.laps++
        const bonus = this.startBonus()
        p.cash += bonus
        p.stats.earned += bonus
        p.stats.startBonus += bonus   // 金钱流向观测
        // 周游礼包
        const gift = SEASONS[s.season].lapGift
        p.resources[gift.resource] += gift.units
        this.log(`「${p.name}」经过起点 +${bonus}，获得${gift.units} 单位${RESOURCES[gift.resource].name}`, p.id)
        this.emit('float', { tile: 0, text: `+${bonus}`, color: '#ffd76a' })
        this.sfx('coin')
      }
      // 路障：经过的玩家被拦住停在此格（触发后路障消失）
      if (s.roadblock !== null && p.pos === s.roadblock) {
        const rb = s.roadblock
        s.roadblock = null
        this.log(`「${p.name}」被路障拦住，停在「${s.tiles[rb].name}」！`, p.id)
        this.emit('float', { tile: rb, text: '🚧 路障', color: '#ffb066' })
        this.emit('roadblock', null)
        this.markChanged()
        break
      }
      // 踏上桥前格：前方桥梁收费时，付过路费正常过桥；
      // 仅冬季河流结冰可选踏冰绕行（多花 3 步免过路费），其他季节无此策略
      if (p.pos === WEST_BRIDGE - 1 || p.pos === EAST_BRIDGE - 1) {
        const bridgeIdx = p.pos === WEST_BRIDGE - 1 ? WEST_BRIDGE : EAST_BRIDGE
        const bridge = s.tiles[bridgeIdx]
        const owner = bridge.owner !== null ? s.players[bridge.owner] : null
        if (owner && owner.id !== p.id && owner.alive && p.status.rentFree <= 0) {
          const toll = bridgeToll(this, bridge)
          if (toll > 0 && steps - i - 1 >= 3 && s.season === 'winter') {
            const bypass = await this.askBridgeCross(p, bridgeIdx, toll)
            if (bypass) {
              const from = p.pos
              p.pos = bridgeIdx + 1
              i += 2   // 绕行共走 3 步（本步 + 额外 2 步）
              // 先发动画事件：渲染层立刻进入 animating，随后 log 触发的 syncAll 才不会把棋子瞬移到对岸
              this.emit('bridge-bypass', { playerId: p.id, from, to: p.pos, bridge: bridgeIdx })
              this.log(`「${p.name}」踏冰绕行避开「${bridge.name}」，免交过路费 ${toll}（绕行 3 步，多花 1 步）`, p.id)
              this.emit('float', { tile: bridgeIdx, text: '🧊 踏冰绕行', color: '#a8d8ff' })
              this.sfx('ding')
            }
          }
        }
      }
      // 踏上桥梁：向桥主交过路费（经过与停靠统一在此结算，落点不再重复收费）
      if (p.pos === WEST_BRIDGE || p.pos === EAST_BRIDGE) {
        const bridge = s.tiles[p.pos]
        const owner = bridge.owner !== null ? s.players[bridge.owner] : null
        if (owner && owner.id !== p.id && owner.alive) {
          await this.payBridgeToll(p, bridge)
        }
      }
      this.emit('piece-step', { playerId: p.id, pos: p.pos })
      // 注意：此处不调用 markChanged。piece-step 事件已驱动 Phaser 场景更新棋子层；
      // 跨步真正改变状态的位置（过路费 / 起点奖励 / 路障）都通过 log() → markChanged 自行触发。
      // 每步多调一次会导致 store.structuredClone 整 GameState 12 次/移动，是移动端卡顿主因。
      await this.sleep(stepMs)
    }
  }

  /** 桥前绕行询问（人类弹窗，AI 由 aiRespond 决策） */
  private async askBridgeCross(p: Player, bridgeIdx: number, toll: number): Promise<boolean> {
    const ans = await this.prompt<{ bypass: boolean }>({
      type: 'bridge-cross', player: p.id, bridge: bridgeIdx, toll,
    })
    return !!ans?.bypass
  }

  /** 结算桥过路费：免过路费在此消耗；关闭中免费；股份分成；付费后置 bridgeTollPaid 防落桥重复收费 */
  private async payBridgeToll(p: Player, tile: Tile): Promise<void> {
    const s = this.state
    if (p.status.rentFree > 0) {
      p.status.rentFree--
      this.log(`「${p.name}」免交「${tile.name}」过路费`, p.id)
      return
    }
    const toll = bridgeToll(this, tile)
    if (toll <= 0) return   // 桥梁关闭中，免费通行
    this.bridgeTollPaid = true
    await this.pay(p.id, toll, tile.owner as number, `支付「${tile.name}」过路费`)
    if (!p.alive) return
    this.sfx('rent')
    p.stats.rentPaid += toll
    const owner = s.players[tile.owner as number]
    owner.stats.rentCollected += toll
    // 地块浮动提示：付款方绿字、收款方红字（错位显示避免重叠）
    this.emit('float', { tile: tile.index, text: `-${toll}`, color: '#7fe07a' })
    this.emit('float', { tile: tile.index, text: `+${toll}`, color: '#ff5f4d', offsetY: -64 })
    // 股份分成：桥主现金不足时跳过分成，避免 owner.cash 扣成负数；双方均记 stats
    const shareholders = s.players.filter(x =>
      x.alive && x.id !== tile.owner &&
      x.status.bridgeShare.some(sh => sh.bridge === tile.index && sh.turns > 0),
    )
    for (const sh of shareholders) {
      const cut = Math.round(toll * 0.3)
      if (owner.cash < cut) continue
      owner.cash -= cut
      sh.cash += cut
      // 股份分成是玩家间转移而非银行发放：只调整租金归属统计。
      // 旧实现记入 bankIn/bankOut，会让 GDP 口径把这笔转移误当成印钞扣掉。
      owner.stats.rentCollected -= cut
      sh.stats.rentCollected += cut
      this.log(`「${sh.name}」分得「${tile.name}」过路费 ${cut}（桥梁股份）`, sh.id)
    }
  }

  private startBonus(): number {
    const s = this.state
    let bonus = START_BONUS + SEASONS[s.season].startBonusMod
    if (s.quake?.startHalf && s.quake.turns > 0) bonus = Math.round(bonus / 2)
    return bonus
  }

  private resolveCasino(p: Player, bet: CasinoBet): void {
    const s = this.state
    const r = s.wheelResult as number
    let win: boolean
    if (r === 0) win = false
    else if (bet.choice === 'big') win = r >= 7
    else win = r <= 6
    if (win) {
      // 押注本金已在 casino 弹窗落地时扣除；这里只补齐净收益（赢得 2 倍 = 本金 1 倍 + 净利润 1 倍）
      const profit = bet.amount
      p.cash += profit
      p.stats.earned += profit
      // 赌场净盈利来自银行：计入 bankIn，GDP 口径才能扣掉这笔无中生有的钱
      p.stats.bankIn += profit
      this.log(`赌场：「${p.name}」押${bet.choice === 'big' ? '大' : '小'} ${bet.amount}，转到 ${r}，赢得 ${profit}！`, p.id)
      this.sfx('dice')
      this.sfx('win')
    } else {
      // 输：本金已在落地时扣除，无需再扣；否则会扣两次（"庄家通吃"原本是只吃掉已扣本金）
      this.log(`赌场：「${p.name}」押${bet.choice === 'big' ? '大' : '小'} ${bet.amount}，转到 ${r}，庄家通吃！`, p.id)
      this.sfx('dice')
      this.sfx('lose')
    }
  }

  private async resolveLanding(p: Player): Promise<void> {
    const s = this.state
    const tile = s.tiles[p.pos]

    switch (tile.type) {
      case 'terrain': {
        if (tile.owner === null) {
          if (tile.seized) {
            this.log(`「${tile.name}」已被银行收回，不可购买`)
          } else if (p.cash < tile.price) {
            this.log(`「${p.name}」资金不足（￥${p.cash}），无法购买「${tile.name}」（￥${tile.price}）`, p.id)
          } else if (p.isAI) {
            // AI 直接弹窗决策
            const ans = await this.prompt<{ buy: boolean }>({
              type: 'buy', tile: tile.index, price: tile.price, player: p.id,
            })
            if (ans?.buy) this.buyCurrentTile()
          } else {
            // 人类玩家：不弹窗打断，行动阶段可在操作栏点击「购买」当前地块
            this.log(`「${tile.name}」可购买（￥${tile.price}），可在本回合行动阶段点击购买`, p.id)
          }
        } else if (tile.owner !== p.id) {
          await this.payRent(p, tile)
        }
        break
      }
      case 'bridge': {
        if (tile.owner === null) {
          // 无主桥梁：可购买（资金不足时直接提示跳过）
          if (p.cash < tile.price) {
            this.log(`「${p.name}」资金不足（￥${p.cash}），无法购买「${tile.name}」（￥${tile.price}）`, p.id)
          } else if (p.isAI) {
            const ans = await this.prompt<{ buy: boolean }>({
              type: 'buy', tile: tile.index, price: tile.price, player: p.id,
            })
            if (ans?.buy) this.buyCurrentTile()
          } else {
            this.log(`「${tile.name}」可购买（￥${tile.price}），可在本回合行动阶段点击购买`, p.id)
          }
        } else if (tile.owner !== p.id) {
          if (this.bridgeTollPaid) {
            // 移动途中已结算过路费（经过或免交），落桥不重复收费
          } else {
            // 兜底：非步行（如传送）直接落桥时在此结算
            await this.payBridgeToll(p, tile)
            if (!p.alive) return
            if (!this.bridgeTollPaid) this.log(`「${tile.name}」关闭中，免交过路费`)
          }
        }
        break
      }
      case 'fate':
        await this.drawFate(p.id)
        break
      case 'chance':
        await this.drawChance(p.id)
        break
      case 'casino': {
        const ans = await this.prompt<{ skip: boolean; bet?: number; choice?: 'big' | 'small' }>({
          type: 'casino', player: p.id, cash: p.cash,
        })
        if (!ans?.skip && ans.bet && ans.choice && ans.bet <= p.cash) {
          p.cash -= ans.bet            // 押注即时扣款（输赢都基于已扣本金结算；下注时 BetModal 内部已校验输入合法）
          p.stats.spent += ans.bet
          p.stats.bankOut += ans.bet   // 本金流入庄家（银行）
          s.casinoBets.push({ player: p.id, amount: ans.bet, choice: ans.choice })
          this.log(`「${p.name}」在赌场下注 ${ans.bet}，押${ans.choice === 'big' ? '大' : '小'}`, p.id)
        }
        break
      }
      case 'auction': {
        const free = s.tiles.filter(t =>
          (t.type === 'terrain' || t.type === 'bridge') && t.owner === null && !t.seized,
        )
        if (free.length === 0) {
          this.log('拍卖行：已无无主地块')
        } else {
          const t = this.rng.pick(free)
          await this.runAuction(t.index, Math.round((t.price / 2) / 10) * 10)
        }
        break
      }
      case 'start': {
        // 停靠起点：修理受损建筑（8 折）或休息（下回合 -1 步）；仅受损建筑可修，非升级通道
        const damaged: { tile: Tile; cost: number }[] = []
        for (const t of s.tiles) {
          if (t.owner !== p.id) continue
          const total = t.buildings.reduce((a, b) => a + (b.damaged ? Math.round((repairCost(this, b) * START_REPAIR_DISCOUNT) / 10) * 10 : 0), 0)
          if (total > 0) damaged.push({ tile: t, cost: total })
        }
        const repairTotal = damaged.reduce((a, d) => a + d.cost, 0)
        const ans = await this.prompt<'repair' | 'rest' | 'skip'>({
          type: 'start-stop', player: p.id,
          repairCost: repairTotal, damagedCount: damaged.reduce((a, d) => a + d.tile.buildings.filter(b => b.damaged).length, 0),
          restPenalty: true,
        })
        if (ans === 'repair' && repairTotal > 0 && p.cash >= repairTotal) {
          p.cash -= repairTotal
          p.stats.spent += repairTotal
          p.stats.buildSpent += repairTotal   // 金钱流向观测
          for (const d of damaged) {
            for (const b of d.tile.buildings) {
              if (b.damaged) b.damaged = false   // 修理只恢复收益，不恢复等级
            }
          }
          this.log(`「${p.name}」在起点以 8 折修理了所有受损建筑（-${repairTotal}）`, p.id)
          this.sfx('build')
        } else if (ans === 'repair') {
          // 兜底：UI 已禁用不可支付的修理按钮；若仍收到请求，明确提示而不是静默无反应
          this.log(`「${p.name}」现金不足，无法支付起点修理费 ￥${repairTotal}`, p.id)
        } else if (ans === 'rest') {
          p.status.moveMod -= 1
          this.log(`「${p.name}」在起点小屋休息，下回合移动 -1`, p.id)
        }
        break
      }
    }
    this.markChanged()
  }

  private async payRent(p: Player, tile: Tile): Promise<void> {
    const s = this.state
    const owner = s.players[tile.owner as number]
    if (p.status.rentFree > 0) {
      p.status.rentFree--
      this.log(`「${p.name}」免交过路费`, p.id)
      return
    }
    const rent = tileRent(this, tile, owner)
    if (rent <= 0) return
    await this.pay(p.id, rent, owner.id, `支付「${tile.name}」租金`)
    if (p.alive) {
      p.stats.rentPaid += rent
      owner.stats.rentCollected += rent
      this.sfx('rent')
      // 地块浮动提示：付款方绿字、收款方红字（错位显示避免重叠）
      this.emit('float', { tile: tile.index, text: `-${rent}`, color: '#7fe07a' })
      this.emit('float', { tile: tile.index, text: `+${rent}`, color: '#ff5f4d', offsetY: -64 })
    }
  }

  private async endTurn(p: Player): Promise<void> {
    const s = this.state

    // 资源产出
    const gains = collectOutput(this, p.id)
    const parts = (Object.keys(RESOURCES) as ResourceType[])
      .filter(r => (gains[r] ?? 0) > 0)
      .map(r => `${RESOURCES[r].icon}${Math.round(gains[r]! * 10) / 10}`)
    if (parts.length) this.log(`「${p.name}」本回合产出：${parts.join(' ')}`, p.id)

    // 状态衰减
    const st = p.status
    st.rentFree = Math.max(0, st.rentFree - 1)
    st.insuredTurns = Math.max(0, st.insuredTurns - 1)
    st.floodImmune = Math.max(0, st.floodImmune - 1)
    st.outputMods = st.outputMods.filter(m => { m.turns--; return m.turns > 0 })
    st.rentBonus = st.rentBonus.filter(m => { m.turns--; return m.turns > 0 })
    st.bridgeShare = st.bridgeShare.filter(sh => { sh.turns--; return sh.turns > 0 })

    // 全局修正不在此衰减：它们按「轮」计时（见 runMainLoop 轮末 decayRoundMods），
    // 旧实现放在每个玩家的 endTurn 里，会让同一条「持续 2 回合」的全局效果
    // 在 4~8 人局中只持续 1/4~1/8 轮，且强度随人数漂移。
    // 个人状态（产出/租金加成、免过路费、桥梁股份）仍按「自己的回合」衰减。

    // 投机资源结算
    for (const spec of [...s.speculation]) {
      if (spec.player !== p.id) continue
      spec.turns--
      if (spec.turns <= 0) {
        s.speculation = s.speculation.filter(x => x !== spec)
        const res = await this.prompt<{ sell: boolean }>({
          type: 'sell-spec', player: p.id, resource: spec.resource,
          units: spec.units, price: s.market[spec.resource],
        })
        if (res?.sell && p.alive) {
          // 按"实际卖出量"结算：若玩家中途被偷/抛售导致实际持有 < 申报量，只能卖出持有的部分
          // 避免先前"按 spec.units 全额付钱"导致的印钞漏洞
          const sellUnits = Math.min(spec.units, p.resources[spec.resource])
          const income = Math.round(sellUnits * s.market[spec.resource])
          p.resources[spec.resource] -= sellUnits
          p.cash += income
          p.stats.earned += income
          this.log(`「${p.name}」按市价卖出投机资源，获利 ${income}`, p.id)
        } else if (p.alive) {
          this.log(`「${p.name}」继续持有投机资源`, p.id)
        }
      }
    }

    // 胜利检查
    if (this.aliveCount() === 1 && s.winner === null) {
      const winner = s.players.find(x => x.alive)!
      s.winner = winner.id
      this.log(`「${winner.name}」淘汰了所有对手！`, winner.id)
    }
    if (s.winner !== null) {
      s.phase = 'gameover'
      this.sfx('win')
    }
    this.markChanged()
  }
}
