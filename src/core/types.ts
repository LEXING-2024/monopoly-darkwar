// ============ 全局类型定义（纯数据，无任何运行时依赖） ============

export type Terrain = 'forest' | 'plateau' | 'desert' | 'coast'
export type ResourceType = 'wood' | 'beef' | 'oil' | 'fish'
export type TileType = 'start' | 'terrain' | 'fate' | 'chance' | 'bridge' | 'casino' | 'auction'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Reserve = 'rich' | 'normal' | 'poor'
export type DisasterKind = 'fire' | 'snow' | 'sandstorm' | 'flood' | 'typhoon' | 'quake' | 'pollution'
export type PlayerShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'plus' | 'heart'
export type GamePhase = 'idle' | 'order' | 'spin' | 'move' | 'landing' | 'action' | 'gameover'
export type SfxName =
  | 'click' | 'coin' | 'ding' | 'tick' | 'card' | 'disaster'
  | 'quake' | 'thunder' | 'fire' | 'win' | 'lose' | 'move' | 'build'
  | 'rent' | 'gavel' | 'dice' | 'wind' | 'snow' | 'sand' | 'flood'
  | 'season' | 'report' | 'chain' | 'dig'

export interface TilePos { x: number; y: number; angle: number }

// ============ 地图 ============

export interface Tile {
  index: number
  type: TileType
  terrain: Terrain | 'none'
  name: string
  price: number
  baseRent: number
  owner: number | null
  reserve: Reserve | 'unknown'
  explored: boolean
  buildings: Building[]
  bridgeLevel: 0 | 1 | 2 | 3
  bridgeClosed: number        // 桥梁关闭剩余回合
  disaster: { kind: DisasterKind; turns: number; intensity?: number } | null
  seized: boolean             // 终局被银行收回，不可购买
  icon: string
}

export interface Building {
  id: number
  type: string                // 建筑定义 id
  level: 1 | 2 | 3
  invested: number            // 累计投入（破产/估值用）
  damaged?: boolean           // 被灾害降级且未修复（地图显示受损标记）
}

// ============ 玩家 ============

export interface OutputMod {
  factor: number
  turns: number
  label: string
  /** 仅 bridgeTollMods 使用：限定作用于哪座桥（不填 = 全局，兼容旧数据） */
  bridge?: number
}

export interface PlayerStatus {
  moveMod: number             // 下次移动修正（休息 -1）
  rentFree: number            // 免过路费剩余回合
  insuredTurns: number        // 保险剩余回合
  floodImmune: number         // 洪水免疫剩余回合
  antitrustMod: number        // 游说等级（负值：-0.1/-0.2/-0.3 = 举报成功率 -10%/20%/30%）
  antitrustTurns: number      // 游说效果剩余轮数
  reportCooldown: number      // 被举报失败后的保护轮数（期间不可再被举报）
  outputMods: OutputMod[]     // 资源产出修正
  rentBonus: OutputMod[]      // 收取租金加成
  bridgeShare: { bridge: number; turns: number }[]  // 桥梁过路费分成
}

export interface Player {
  id: number
  name: string
  isAI: boolean
  color: string
  shape: PlayerShape
  cash: number
  pos: number
  alive: boolean
  laps: number
  resources: Record<ResourceType, number>
  status: PlayerStatus
  traits: { aggression: number; greed: number }
  stats: {
    earned: number
    spent: number
    rentPaid: number
    rentCollected: number
    timesBankrupt: number
    // 金钱流向明细（经济平衡观测用）
    resourceIncome: number   // 卖资源所得（含破产变卖）
    startBonus: number       // 起点奖励（经过起点 + 季节修正）
    bankIn: number           // 银行发放（卡牌/奖金/补贴等）
    bankOut: number          // 支付给银行（罚款/游说/卡牌费等）
    tileSpent: number        // 买地支出（含桥）
    buildSpent: number       // 建造/升级/修理/修桥支出
  }
}

// ============ AI 大脑（难度 / 性格 / 记忆 / 对手建模，纯 JSON 可序列化） ============

export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'hell'
export type AiStrategy = 'expand' | 'defend' | 'attack' | 'monopoly'

/** AI 性格 + 难度参数：性格 0~1 开局随机生成，噪声/犯错/预判/现金安全线由难度决定 */
export interface AiProfile {
  aggression: number      // 进攻性：举报/背叛/竞价激进
  riskTolerance: number   // 风险承受：低现金储备、高风险投资
  cooperation: number     // 合作倾向：联盟、交易让步
  hoarding: number        // 囤积倾向：资源惜售、现金储备高
  revenge: number         // 报复倾向：被背叛/被举报后的报复权重
  greed: number           // 贪婪：买地/竞价估值上限
  noiseAmp: number        // 决策噪声幅度（难度）
  mistakeProb: number     // 犯错概率：随机动作替代最优（难度）
  lookahead: number       // 预判深度 0~2（难度）
  cashSafety: number      // 现金安全线系数（难度）
}

export interface AiMemoryEntry {
  kind: 'report' | 'pricewar'
  from: number            // 对方玩家 id
  turn: number            // 发生时的行动计数
}

/** 对手模型：每轮快照 + 意图推断 + 威胁值 */
export interface OpponentModel {
  id: number
  cashEst: number
  terrainCount: Partial<Record<Terrain, number>>
  totalValueEst: number
  incomeEst: number       // 每回合资源产出估值
  monopolyRush: boolean   // 意图：冲刺垄断（某地形占比高）
  desperate: boolean      // 意图：急需现金（现金低且收入高）
  tradeCount: number
  reportsAgainstMe: number
  threat: number          // 威胁值
}

/** 单个 AI 玩家的大脑状态（人类玩家为 null） */
export interface AiBrain {
  profile: AiProfile
  emotion: number         // 0~1 情绪值：被攻击累加、每轮衰减；高情绪更激进、可能非理性
  memory: AiMemoryEntry[]
  models: OpponentModel[]
  strategy: AiStrategy
  lastTradeTurn: number
  rngState: number        // 脑私有随机源状态（mulberry32 内部状态，随存档保存保证确定性）
}

// ============ 动态状态 ============

export interface TyphoonState {
  strength: 0 | 1 | 2 | 3 | 4 | 5   // 0 级=热带扰动（生成初始），海上逐步增强
  /** 台风中心的真实世界坐标：在海洋区域内自由移动，不再绑定固定航点 */
  x: number
  y: number
  /** 当前航向（弧度，屏幕坐标：0=东，π/2=南） */
  heading: number
  /** 本次台风的目标登陆地块；朝它缓慢转向 */
  targetTile: number
  /** 是否尝试与海岸线平行移动（仍会缓慢内切，最终大概率登陆） */
  coastal: boolean
  age: number
  maxLife: number
  onLand: boolean
  landTile: number | null
  landTurns: number
  /** 气象站预测点（世界坐标） */
  predictedX: number | null
  predictedY: number | null
  damagedBuildings: boolean  // 是否造成过建筑损坏（灾后重建事件链）
  /** 实际走过的轨迹（世界坐标，生成点开始；登陆时补上登陆点） */
  path: { x: number; y: number }[]
  /** 已进入减弱阶段：不再增强、不再登陆，每回合下降 1 级 */
  weakening: boolean
  /** 已降到 0 级热带低压：本回合残留显示，下一回合正式消散 */
  fading: boolean
}

export interface QuakeState {
  center: number
  magnitude: 1 | 2 | 3
  turns: number
  affected: number[]
  startHalf: boolean          // 起点为中心时当回合奖励减半
}

export interface ChainState {
  id: string
  name: string
  desc: string
  turnsLeft: number
  playerId: number | null
  data: Record<string, any>
}

/** 垄断速胜冲刺状态：某玩家对某地形连续达标的轮数（不足则清空） */
export interface MonopolyHold {
  playerId: number
  terrain: Terrain
  rounds: number
}

export interface LogEntry {
  turn: number     // 行动计数
  round: number    // 回合数（1 回合 = 全员各行动一次），日志按此标注
  text: string
  playerId: number | null
}

export interface CasinoBet {
  player: number
  amount: number
  choice: 'big' | 'small'
}

export interface Speculation {
  player: number
  resource: ResourceType
  units: number
  turns: number
}

/** 全体玩家每回合操作配额剩余（进入行动阶段重置） */
export interface TurnOps {
  build: number
  upgrade: number
  repair: number
  explore: number
  bridge: number
  market: number        // 市场操纵：每回合 1 次
  bridgePrice: number   // 桥梁提价：每回合 1 次
}

/** 经济景气状态（每轮按总财富涨跌评估；危机持续 5 轮后解除重评） */
export type ClimateStatus = 'boom' | 'normal' | 'recession' | 'crisis'

export interface GameState {
  started: boolean
  phase: GamePhase
  turn: number                 // 全局行动计数（每次玩家行动 +1）
  round: number                // 本季已进行的轮数（换季归零）：全部存活玩家各行动一次 = 1 轮
  totalRound: number           // 全局总轮数（跨季节累计，用于展示）
  season: Season
  seasonTurn: number           // 本季已进行的轮数
  seasonLen: number            // 本季持续轮数（10~15 随机，每季重新抽取）
  year: number
  currentPlayer: number
  wheelResult: number | null
  turnOrder: number[]          // 行动顺序（玩家 id，开局按点数决定）
  orderRolls: { playerId: number; value: number }[]  // 开局顺序掷点记录
  players: Player[]
  tiles: Tile[]
  market: Record<ResourceType, number>
  rentMods: OutputMod[]        // 全局租金修正（卡牌/事件链；终局 ×1.5 由 endgame 标记单独施加）
  bridgeTollMods: OutputMod[]  // 桥梁过路费修正
  repairMods: OutputMod[]      // 修理费用修正
  outputModAll: OutputMod[]    // 全体产出修正
  outputModsRes: { resource: ResourceType; factor: number; turns: number; label: string }[]
  priceMods: { resource: ResourceType; factor: number; turns: number; label: string }[]
  typhoon: TyphoonState | null
  typhoonProbDelta: number     // 季节事件：台风概率加成
  floodProbDelta: number       // 季节事件：洪水概率加成
  skipDisaster: DisasterKind | null
  quake: QuakeState | null
  chains: ChainState[]
  endgame: boolean             // 存活 ≤2 人终局规则
  roundsNoBankruptcy: number   // 终局连续无人破产轮数
  firstBankruptTurn: number | null   // 首个玩家破产时的行动计数（模拟观察节奏用）
  winner: number | null
  /** 终局原因：淘汰至最后一人 / 垄断判决 / 行动数上限按资产判定 */
  endReason: 'last-standing' | 'monopoly' | 'timeout' | null
  /** 垄断速胜冲刺进度：连续达标者；轮末更新，达标中断即清空 */
  monopolyHold: MonopolyHold | null
  bankruptOrder: number[]
  log: LogEntry[]
  /** 待结算的赌场下注：每位玩家在自己下一次转盘后结算（多人先后下注不会互相覆盖） */
  casinoBets: CasinoBet[]
  speculation: Speculation[]
  seasonEvent: { name: string; desc: string } | null
  deckLeft: { fate: number; chance: number }
  speedMs: number
  aiBrains: (AiBrain | null)[]        // 每玩家 AI 大脑（人类为 null），随存档保存
  aiDifficulty: AiDifficulty          // 本局 AI 难度（开局统一选择）
  marketPressure: Record<ResourceType, number>  // 本轮各资源净卖出量（轮首结算压力后清零）
  /** 断供：垄断者封锁某资源销路，其他人卖出只能拿半价（轮末递减） */
  supplyBlocks: { resource: ResourceType; playerId: number; turns: number }[]
  ops: TurnOps                    // 人类每回合操作配额剩余（进入行动阶段重置，修理不限）
  totalWealth: number             // 总财富：全体存活玩家总资产（轮末统计）
  totalWealthPrev: number         // 上一轮总财富（顶栏涨跌箭头对比用）
  climate: ClimateStatus          // 经济景气状态（轮末按总财富涨跌评估）
  climateTurns: number            // 危机剩余轮数（解除后重新评估）
  recessionStreak: number         // 连续衰退轮数（累计达标转危机）
  roadblock: number | null        // 路障所在格（下一个经过的玩家停住，随后消失）
}

// ============ 人类交互提示 ============

export interface TradeOffer {
  tiles: number[]
  resources: Partial<Record<ResourceType, number>>
  cash: number
}

export type Prompt =
  | { type: 'wheel'; player: number }
  | { type: 'order-wheel'; player: number }
  | { type: 'order-result'; order: { playerId: number; name: string; color: string; value: number; isAI: boolean }[]; player: number }
  | { type: 'notice'; title: string; text: string; icon?: string; player: number; auto?: boolean }
  | { type: 'buy'; tile: number; price: number; player: number }
  | { type: 'card'; cardId: string; category: 'fate' | 'chance'; name: string; desc: string; icon: string; canDecline: boolean; player: number }
  | { type: 'choose-resource'; title: string; desc: string; options: ResourceType[]; player: number; cardId?: string }
  | { type: 'choose-tile'; title: string; desc: string; tiles: number[]; player: number; cardId: string }
  | { type: 'choose-terrain'; title: string; desc: string; options: Terrain[]; player: number; cardId: string }
  | { type: 'join-report'; player: number; target: number; cost: number; currentProb: number }
  | { type: 'start-stop'; player: number; repairCost: number; damagedCount: number; restPenalty: boolean }
  | { type: 'casino'; player: number; cash: number }
  | { type: 'bridge-cross'; player: number; bridge: number; toll: number }
  | { type: 'bid'; title: string; tile: number; currentBid: number; currentBidder: number | null; minBid: number; myCash: number; canPass: boolean; player: number }
  | { type: 'trade-offer'; from: number; to: number; give: TradeOffer; receive: TradeOffer }
  | { type: 'trade-response'; from: number; to: number; give: TradeOffer; receive: TradeOffer }
  | { type: 'pay-or-lose'; title: string; desc: string; cost: number; loseDesc: string; player: number }
  | { type: 'donate'; title: string; desc: string; target: number; player: number }
  | { type: 'sell-spec'; player: number; resource: ResourceType; units: number; price: number }
  | { type: 'action'; player: number }
  | { type: 'gameover'; winner: number; player: number }

// ============ Game API（供各系统模块调用，由 Game 类实现） ============

export interface RNGLike {
  next(): number
  float(min: number, max: number): number
  int(min: number, max: number): number
  chance(p: number): boolean
  pick<T>(arr: readonly T[]): T
  weighted(weights: number[]): number
  shuffle<T>(arr: T[]): T[]
}

export interface GameApi {
  state: GameState
  rng: RNGLike
  prompt<T = any>(p: Prompt): Promise<T>
  emit(event: string, data?: any): void
  log(text: string, playerId?: number | null): void
  notice(title: string, text: string, icon?: string): Promise<void>
  sfx(name: SfxName): void
  sleep(ms?: number): Promise<void>
  // 支付：现金不足时自动变卖，仍不足则破产。返回是否破产（false=支付成功或已处理）
  pay(player: number, amount: number, to: number | null, label: string): Promise<void>
  gain(player: number, amount: number, label: string): void
  runAuction(tile: number, startPrice: number, opts?: { exclude?: number; seller?: number }): Promise<number | null>
  drawFate(player: number): Promise<void>
  drawChance(player: number, forced?: boolean): Promise<void>
  markChanged(): void
  isHuman(p: number): boolean
  rollDie(): number
  // 行动 API（UI 与 AI 共用）
  buyCurrentTile(): void
  buildAt(tileIndex: number, defId: string): boolean
  upgradeAt(tileIndex: number, buildingId: number): boolean
  repairAt(tileIndex: number, buildingId: number): boolean
  exploreAt(tileIndex: number): boolean
  repairBridge(tileIndex: number): boolean
  sellResources(res: ResourceType, units: number): boolean
  resourceShare(playerId: number, res: ResourceType): number
  manipulableResources(playerId: number): ResourceType[]
  manipulateMarket(res: ResourceType, kind: 'limit' | 'war'): boolean
  blockSupply(res: ResourceType): boolean
  priceBridge(tileIndex: number): boolean
  lobbySelf(level: 1 | 2 | 3): boolean
  reportTarget(targetId: number): Promise<boolean>
  resign(): Promise<void>
  proposeTrade(to: number, give: TradeOffer, receive: TradeOffer): Promise<boolean>
}
