// ============ 数据驱动配置（文档第 3~9、14 章的全部数值） ============

import type { AiDifficulty, ClimateStatus, DisasterKind, Reserve, ResourceType, Season, Terrain } from './types'

// ---------- 通用 ----------
export const TILE_COUNT = 72
export const START_BONUS = 1000
export const INITIAL_CASH = 15000
export const LOG_CAP = 200
export const MAX_TURNS = 4000
/** 前 N 轮保护期：不触发自然灾害（1 轮 = 全部存活玩家各行动一次） */
export const SAFE_TURNS = 10
/** 每回合操作配额（每位玩家独立计次：进入各自行动阶段时重置）。
 *  人类与 AI 同数：建造 ≤1、升级 ≤1、修理 ≤1、勘探 ≤1、修桥 ≤1。
 *  扣减位置统一：人类 UI 与 AI（act.ts）都走 game.buildAt/upgradeAt/repairAt/exploreAt/repairBridge，配额随当前玩家各自独立，互不共享。
 *  例外：停在起点的「8 折全修」是落脚事件，不占配额 */
export const TURN_OP_LIMITS = { build: 1, upgrade: 1, repair: 1, explore: 1, bridge: 1, market: 1, bridgePrice: 1 } as const
/** 开局租金缓启动：前 N 轮租金从 60% 线性恢复到 100%（保护早期现金流，不增加购买力） */
export const RENT_RAMP_ROUNDS = 20
export const RENT_RAMP_MIN = 0.6
/** 反僵持：对局拖长后租金逐步上涨，迫使玩家正面对决（只影响后期，不改变开局节奏）。
 *  从第 START 轮起每轮 +PER_ROUND，最高 +MAX；例如 55 轮起、1.5%/轮、封顶 400%。
 *  只影响 300+ 轮的长局，正常节奏（中位 <100 轮）几乎不受影响。 */
export const RENT_STALL_START = 55
export const RENT_STALL_PER_ROUND = 0.015
export const RENT_STALL_MAX = 4.0
/** 每季持续轮数范围（每季随机抽取，玩家无法预判季节更替时机） */
export const SEASON_LEN_MIN = 10
export const SEASON_LEN_MAX = 15

// ---------- 玩家（支持 4~8 人；2~3 人仅供旧存档/内部模拟） ----------
export const PLAYER_COLORS = [
  '#d94f3d', '#3d7fd9', '#3da35d', '#d9a53d',
  '#9a5bd0', '#d95a9a', '#40b8b0', '#c07a3a',
]
export const PLAYER_SHAPES = [
  'circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'plus', 'heart',
] as const

// ---------- 资源（文档 4.1） ----------
export interface ResourceDef {
  name: string
  icon: string
  terrain: Terrain
  basePrice: number
  baseOutput: number   // 每地块每回合产出单位
}

export const RESOURCES: Record<ResourceType, ResourceDef> = {
  // 单地块基础产出 0.5 单位/回合；建采集建筑后每级 +50%，L3 为 1.25 单位/回合
  wood: { name: '木材', icon: '🌲', terrain: 'forest', basePrice: 120, baseOutput: 0.5 },
  beef: { name: '牛肉', icon: '🐄', terrain: 'plateau', basePrice: 100, baseOutput: 0.5 },
  oil: { name: '石油', icon: '⛽', terrain: 'desert', basePrice: 150, baseOutput: 0.5 },
  fish: { name: '鱼类', icon: '🐟', terrain: 'coast', basePrice: 130, baseOutput: 0.5 },
}

export const RESOURCE_ORDER: ResourceType[] = ['wood', 'beef', 'oil', 'fish']

export const TERRAIN_RESOURCE: Record<Terrain, ResourceType> = {
  forest: 'wood', plateau: 'beef', desert: 'oil', coast: 'fish',
}

// ---------- 季节（文档 6.2 / 14 附录） ----------
export interface SeasonDef {
  name: string
  icon: string
  priceMod: Partial<Record<ResourceType, number>>   // 市场价格修正
  outputMod: Partial<Record<ResourceType, number>>  // 产出修正
  buildCostMod: number
  startBonusMod: number
  disasters: { kind: DisasterKind; prob: number }[]
  typhoonSeason: boolean
  lapGift: { resource: ResourceType; units: number }
  particles: 'petal' | 'glow' | 'leaf' | 'snow'
}

export const SEASONS: Record<Season, SeasonDef> = {
  spring: {
    name: '春', icon: '🌸',
    priceMod: { wood: 1.1 },
    outputMod: { wood: 1.1 },
    buildCostMod: 0.8, startBonusMod: 200,
    disasters: [
      { kind: 'flood', prob: 0.225 },
      { kind: 'sandstorm', prob: 0.225 },
    ],
    typhoonSeason: false,
    lapGift: { resource: 'wood', units: 6 },
    particles: 'petal',
  },
  summer: {
    name: '夏', icon: '☀️',
    priceMod: { fish: 1.5, wood: 1.3 },
    outputMod: { fish: 1.5 },
    buildCostMod: 1, startBonusMod: 0,
    disasters: [
      { kind: 'sandstorm', prob: 0.225 },
      { kind: 'fire', prob: 0.225 },
    ],
    typhoonSeason: true,
    lapGift: { resource: 'fish', units: 6 },
    particles: 'glow',
  },
  autumn: {
    name: '秋', icon: '🍂',
    priceMod: { beef: 1.4, oil: 1.4 },
    outputMod: {},
    buildCostMod: 1, startBonusMod: 500,
    disasters: [],
    typhoonSeason: true,
    lapGift: { resource: 'oil', units: 5 },
    particles: 'leaf',
  },
  winter: {
    name: '冬', icon: '❄️',
    priceMod: { beef: 0.7 },
    outputMod: { beef: 1.4 },
    buildCostMod: 1, startBonusMod: -200,
    disasters: [{ kind: 'snow', prob: 0.225 }],
    typhoonSeason: false,
    lapGift: { resource: 'beef', units: 6 },
    particles: 'snow',
  },
}

export const SEASON_ORDER: Season[] = ['spring', 'summer', 'autumn', 'winter']

// ---------- 地图分区（文档 3.2） ----------
// 64~71 的八块无主地块分别并入各自地形区的末尾（森林/高原/沙漠/沿海各 +2 块），
// 使每个地形区在其地图区域内连片延伸，不再存在无属性地块。
export interface ZoneDef {
  terrain: Terrain
  range: [number, number]     // 含端点
  priceBase: number
  priceStep: number
  specials: { index: number; type: 'fate' | 'chance' | 'casino' | 'auction' }[]
  rentRatio: number
}

export const ZONES: ZoneDef[] = [
  {
    terrain: 'forest',
    range: [1, 17],
    priceBase: 1725, priceStep: 92, rentRatio: 0.55,
    specials: [
      { index: 5, type: 'fate' },
      { index: 10, type: 'chance' },
    ],
  },
  {
    terrain: 'plateau',
    range: [19, 35],
    priceBase: 2185, priceStep: 104, rentRatio: 0.55,
    specials: [{ index: 24, type: 'fate' }],
  },
  {
    terrain: 'desert',
    range: [36, 52],
    priceBase: 2645, priceStep: 115, rentRatio: 0.55,
    specials: [
      { index: 36, type: 'chance' },
      { index: 40, type: 'fate' },
      { index: 42, type: 'casino' },
    ],
  },
  {
    terrain: 'coast',
    range: [54, 71],
    priceBase: 1955, priceStep: 69, rentRatio: 0.55,
    specials: [
      { index: 54, type: 'auction' },
      { index: 59, type: 'chance' },
    ],
  },
]

export const START_INDEX = 0
export const WEST_BRIDGE = 18
export const EAST_BRIDGE = 53

// ---------- 桥梁（文档 3.4） ----------
export const BRIDGES = {
  [WEST_BRIDGE]: {
    name: '西桥', price: 1500, tolls: [0, 100, 300, 600],
    upgradeCosts: [0, 1200, 2000],
  },
  [EAST_BRIDGE]: {
    name: '东桥', price: 2000, tolls: [0, 200, 600, 1200],
    upgradeCosts: [0, 1500, 2500],
  },
} as const
/** 修桥费用折扣：修桥 = 该级升级成本 × 此系数（核心/AI/UI 共用同一口径，见 economy.bridgeRepairCost） */
export const BRIDGE_REPAIR_DISCOUNT = 0.5

/** 桥梁定价权（交通咽喉垄断）：桥主可临时提高自己那座桥的过路费，全桌过桥者都要多交。
 *  反制手段：① 四季可选"绕行"（多走 3 步免过路费）② 垄断举报 ③ 抢桥。
 *  每回合限 1 次，且桥需已升级（空桥 0 级收费为 0，提价无意义）。 */
export const BRIDGE_PRICING = {
  factor: 1.5,      // 过路费 ×1.5
  duration: 2,      // 持续 2 轮
  cost: 500,        // 提价成本（打点/设卡）
  minLevel: 1,      // 桥至少 1 级（有基础收费）才能提价
} as const

// 桥梁两侧地块（洪水只影响桥头两岸，文档 7.3）
export const FLOOD_TILES: number[] = [17, 19, 52, 54]

// ---------- 市场（文档 4.3 / 9） ----------
export const MARKET_WALK = 0.04      // 每轮随机波动 ±4%（每轮只更新一次）
export const MARKET_WALK_ENDGAME = 0.08
export const MARKET_REVERT = 0.04    // 每轮向「基准价 × 季节/卡牌修正」回归 4%，防止价格钉死在夹逼边界
export const PRICE_CLAMP_MIN = 0.5
export const PRICE_CLAMP_MAX = 2.2
export const BULK_SALE_THRESHOLD = 20  // 单笔 ≥20 单位当笔 -5%（简化供需）
export const BULK_SALE_DISCOUNT = 0.95

// ---------- 景气循环（总财富驱动，每轮末评估；危机持续 5 轮） ----------
export const CLIMATE = {
  boomDelta: 0.05,           // 轮总财富增幅 ≥ +5% → 繁荣
  recessionDelta: -0.03,     // 轮总财富跌幅 ≤ -3% → 衰退
  crisisStreak: 2,           // 连续 2 轮衰退 → 危机
  crisisTurns: 5,            // 危机持续轮数（期间锁定，解除后按总财富重评）
  crisisDisasterProb: 0.05,  // 危机期间灾害概率 +5%
  crisisBridgeToll: 0.8,     // 危机期间过路费 ×0.8
} as const
/** 各状态修正：资源价格 / 租金 / 建筑费用（正常=1；危机走专项修正） */
export const CLIMATE_MODS: Record<ClimateStatus, { price: number; rent: number; buildCost: number }> = {
  boom: { price: 1.1, rent: 1.1, buildCost: 0.9 },
  normal: { price: 1, rent: 1, buildCost: 1 },
  recession: { price: 0.9, rent: 0.9, buildCost: 1.1 },
  crisis: { price: 1, rent: 1, buildCost: 1 },
}
export const CLIMATE_NAMES: Record<ClimateStatus, string> = {
  boom: '繁荣', normal: '正常', recession: '衰退', crisis: '危机',
}

// ---------- 勘探（文档 4.2） ----------
export const EXPLORE_COST_RATIO = 0.10  // 地价 10%
export const RESERVE_MULT: Record<Reserve, number> = { rich: 1.6, normal: 1.0, poor: 0.6 }
export const RESERVE_WEIGHTS: [Reserve, number][] = [
  ['rich', 25], ['normal', 50], ['poor', 25],
]

// ---------- 建筑（文档 8） ----------
export type BuildingCategory = 'production' | 'protection' | 'tech' | 'commercial'

export interface BuildingDef {
  id: string
  name: string
  icon: string
  category: BuildingCategory
  terrain?: Terrain
  protects?: DisasterKind
  cost: number
  outputMult?: number   // 每级产出加成
  rentMult?: number     // 每级租金加成
  maxPerPlayer?: number
  desc: string
}

export const BUILDINGS: BuildingDef[] = [
  // 资源生产（+50%/级；基础产出 0.5，L3 合计 1.25 单位/回合）
  { id: 'lumber-mill', name: '伐木场', icon: '🪓', category: 'production', terrain: 'forest', cost: 650, outputMult: 0.5, desc: '木材产出每级 +50%' },
  { id: 'pasture', name: '牧场', icon: '🐄', category: 'production', terrain: 'plateau', cost: 720, outputMult: 0.5, desc: '牛肉产出每级 +50%' },
  { id: 'oil-well', name: '油井', icon: '🛢️', category: 'production', terrain: 'desert', cost: 850, outputMult: 0.5, desc: '石油产出每级 +50%' },
  { id: 'fishing-port', name: '渔港', icon: '⚓', category: 'production', terrain: 'coast', cost: 780, outputMult: 0.5, desc: '鱼类产出每级 +50%' },
  // 防灾
  { id: 'firebreak', name: '防火带', icon: '🧯', category: 'protection', terrain: 'forest', protects: 'fire', cost: 650, desc: '免疫火灾' },
  { id: 'greenhouse', name: '温室', icon: '🏠', category: 'protection', terrain: 'plateau', protects: 'snow', cost: 720, desc: '免疫雪灾' },
  { id: 'sandbelt', name: '防沙林', icon: '🌳', category: 'protection', terrain: 'desert', protects: 'sandstorm', cost: 780, desc: '免疫沙尘暴' },
  { id: 'breakwater', name: '防波堤', icon: '🧱', category: 'protection', terrain: 'coast', protects: 'typhoon', cost: 850, desc: '台风：收益不归零、建筑受损概率减半' },
  { id: 'dam', name: '堤坝', icon: '🏗️', category: 'protection', protects: 'flood', cost: 780, desc: '免疫洪水（桥梁两侧）' },
  // 科技（每玩家限 1 座）
  { id: 'weather-station', name: '气象站', icon: '📡', category: 'tech', cost: 1950, maxPerPlayer: 1, desc: '提前 1 回合显示台风路径' },
  { id: 'automation', name: '自动化中心', icon: '🤖', category: 'tech', cost: 2340, maxPerPlayer: 1, desc: '所有资源产出 +25%' },
  { id: 'drone-logistics', name: '无人机物流', icon: '🚁', category: 'tech', cost: 2600, maxPerPlayer: 1, desc: '收取租金 +10%，卖价 +10%' },
  // 商业/住宅（提升租金；系数经模拟调优：3 级封顶 ≈3.4 倍，避免一次过路费清空对手现金）
  { id: 'apartment', name: '公寓', icon: '🏢', category: 'commercial', cost: 900, rentMult: 0.45, desc: '本格租金每级 +45%' },
  { id: 'office', name: '写字楼', icon: '🏬', category: 'commercial', cost: 1200, rentMult: 0.6, desc: '本格租金每级 +60%' },
  { id: 'mall', name: '购物中心', icon: '🛍️', category: 'commercial', cost: 1400, rentMult: 0.8, desc: '本格租金每级 +80%' },
]

export const BUILDING_DEFS: Record<string, BuildingDef> = Object.fromEntries(
  BUILDINGS.map(b => [b.id, b]),
)

export const BUILD_SLOTS = 2
export const MAX_BUILDING_LEVEL = 3
export const UPGRADE_COST_RATIO = [0.8, 1.0]   // L1→L2、L2→L3 占基础成本比例
export const REPAIR_COST_RATIO = 0.6           // 修理 = 该级建造成本 60%
export const START_REPAIR_DISCOUNT = 0.8       // 停在起点 8 折

// ---------- 台风（文档 7.1） ----------
export const TYPHOON = {
  spawnProb: 0.1875,
  // 成长模型：生成时 0 级热带扰动，海上每回合概率 +1 级直至最强 5 级；
  // 提高增强概率与寿命，绝大多数台风在减弱前就会增强并登陆
  startStrength: 0,
  maxStrength: 5,
  strengthenProb: 0.78,
  earlyWeakenProb: 0.025,   // 低强度时很小的提前减弱概率；大部分仍会增强
  minLife: 10,
  maxLife: 15,
  // 自由海面移动：每回合约 80~108px；减弱期减速
  moveDistance: [80, 108] as const,
  weakenMoveDistance: [46, 66] as const,
  // 航向每回合最多只转约 45°，不会出现瞬间掉头；近岸平行路径再缓慢内切
  maxTurnPerRound: Math.PI / 4,
  coastalTurn: Math.PI / 4,
  turnJitter: 0.18,
  // 路径随机性：生成时不要直奔登陆点；每回合有概率自由偏转，避免“一条直线”
  initialTurnJitter: 0.85,
  wanderProb: 0.38,
  wanderTurn: 0.65,
  coastalHoldAge: 5,
  parallelProb: 0.10,
  // 随机海洋生成：离最近海岸圆牌至少 220px，避免贴着岸边凭空出现
  spawnMinDist: 220,
  spawnMaxDist: 680,
  spawnEdgeMargin: 90,
  // 登陆判定与真实影响范围（世界像素；按强度 0..5）
  landfallRadius: 64,
  influenceRadius: [0, 100, 125, 150, 175, 205] as const,
  predictRounds: 2,
  // 按强度 0..5 的建筑破坏概率：低级别也有破坏性，最强级别几乎必毁
  destroyProb: [0, 0.1, 0.2, 0.4, 0.65, 0.9] as const,
  eastBridgeDamageProb: 0.4,
  maxPathPoints: 120,
} as const


// ---------- 地震（文档 7.2 / 15） ----------
export const QUAKE = {
  baseProb: 0.075,
  manyBuildingsProb: 0.12,
  manyBuildingsCount: 5,
  magnitudeWeights: [50, 35, 15] as const,           // 1/2/3 级
  // 每级：对 1 级建筑的摧毁率、对 2 级建筑的降级率/摧毁率、对 3 级建筑的降级率；桥梁破坏概率；租金影响
  table: [
    { destroy1: 0.3, destroy2: 0, degrade2: 0.2, degrade3: 0.1, bridge: 0.1, rentMult: 0 },
    { destroy1: 0.5, destroy2: 0, degrade2: 0.35, degrade3: 0.2, bridge: 0.3, rentMult: 0.5 },
    { destroy1: 0.8, destroy2: 0.25, degrade2: 0.5, degrade3: 0.3, bridge: 0.5, rentMult: 1 },
  ] as const,
}

// ---------- 反垄断（文档 9.3，玩家主动举报制） ----------
export const ANTITRUST = {
  terrainRatio: 0.7,        // 垄断线基线上限（实际按人数缩放，见 monopolyTerrainRatio）
  globalRatio: 0.5,         // 垄断线：全局地形占比 ≥50%
  reportCost: 300,          // 每位举报人费用
  reportProb: [0, 0.4, 0.7, 0.9],   // 按举报人数：1 人 40%、2 人 70%、3 人及以上 90%
  /** 超出垄断线部分的成功率加成：按超线比例（0~1）× 该值附加，满线最多 +25% */
  probOverageBonus: 0.25,
  /** 超出垄断线部分的罚款加成：按超线比例（0~0.6）× 该值附加，最高封顶 35% */
  fineOverageBonus: 0.35,
  lobby: [
    { cost: 300, mod: -0.1 }, { cost: 600, mod: -0.2 }, { cost: 1000, mod: -0.3 },
  ] as const,
  lobbyTurns: 5,            // 游说效果持续轮数
  fineRatio: 0.15,          // 罚款 = 垄断地块总值的 15%（超线部分另加，见 fineOverageBonus）
  bountyRatio: 0.25,        // 举报人分享罚款的 25%（2026-08 提高博弈机制经济权重）
  cooldownRounds: 2,        // 举报失败后同一目标 2 轮内不可再被举报
  outcomes: ['fine', 'auction', 'output', 'breakup'] as const,
  /** 强制拆分（结构性救济）：从垄断者最长的连片段中抽走中点地块，
   *  半价转给最弱的存活对手——直接摧毁其连片加成，比罚款更"对症"。 */
  breakupTransferRatio: 0.5,   // 转让作价 = 地价 × 50%
}

/** 垄断线随人数缩放：4 人 50%、5 人 55%、6 人 60%、7 人 65%、8 人 70%。
 *  8 人局沿用旧基线 70%；小桌地块少、达成途径单一，门槛必须下调，
 *  否则 4 人局只有"等对手破产后继承地块"才能摸到垄断线。 */
export function monopolyTerrainRatio(playerCount: number): number {
  const n = Math.max(2, Math.min(8, playerCount))
  return Math.min(0.7, Math.max(0.5, 0.5 + (n - 4) * 0.05))
}

/** 双桥垄断的附加条件：两桥总等级 ≥ 2（避免刚买下 0 级桥就获得垄断资格）。
 *  桥梁本身 0 级不收费，必须实际投入升级，桥权才算真正的"咽喉"。 */
export const BRIDGE_MONOPOLY_MIN_LEVELS = 2

// ---------- 终局（文档 2.3） ----------
export const ENDGAME = {
  rentMod: 1.5,
  crisisTurns: 5,
  crisisRatio: 0.3,
}

/** AI 估值口径常数（从 act.ts 的硬编码迁入，便于统一调参） */
export const AI_EVAL = {
  upgradeHorizon: 80,        // 升级回本视野（轮）
  visitsPerOpponent: 6,      // 每名对手每轮经过某地块的期望次数
  exploreHorizon: 60,        // 勘探收益折算视野（轮）
}

/** 资源市场操纵：垄断某资源地形达门槛后，可在行动阶段主动操纵该资源市价（影响全桌）。
 *  限产抬价利好所有持有该资源的人、抬高建厂成本；价格战精准打击对手但会结仇。每回合限 1 次。 */
export const MARKET_MANIPULATION = {
  minShare: 0.5,          // 触发门槛：持有某资源地形 ≥50%
  limitCost: 400,         // 限产成本
  limitFactor: 1.25,      // 限产：该资源市价 +25%（全桌）
  warCost: 600,           // 价格战成本
  warFactor: 0.7,         // 价格战：该资源市价 -30%（全桌）
  duration: 1,            // 效果持续轮数
  /** 断供（精准打击）：垄断者封锁该资源销路，其他人卖出只能拿到半价，自己不受影响。
   *  用来掐断对手现金流——逼其低价变现、资金链断裂，最终破产出局。 */
  dumpCost: 800,          // 断供成本
  dumpFactor: 0.5,        // 他人卖价 ×0.5
  dumpTurns: 2,           // 断供持续轮数（放血要持续才疼）
} as const

/** 行业龙头（产业链垄断）：某类生产建筑（伐木场/牧场/油井/渔港）数量最多的玩家
 *  即该资源的"行业龙头"，卖该资源时享有溢价——与"地块份额"不同维度：
 *  份额靠买地，龙头靠建厂。 */
export const INDUSTRY_LEADER = {
  sellBonus: 1.1,      // 龙头卖该资源 +10%
  minBuildings: 2,     // 至少拥有 2 座同类生产建筑才算龙头（避免一座就称王）
} as const

/** 连片地块（整片开发）：同地形区内连续相邻的地块达到一定长度，该段租金加成。
 *  现实对应：整片开发、商圈效应、地块整合溢价。
 *  博弈点：对手可买断你连片中间的一块"截胡"，让整段加成失效。 */
export const CONTIGUOUS_BONUS = {
  /** 连续段长度 → 租金加成（取满足的最高档；5 块及以上封顶） */
  tiers: [
    { run: 5, bonus: 0.5 },
    { run: 4, bonus: 0.4 },
    { run: 3, bonus: 0.25 },
  ] as { run: number; bonus: number }[],
} as const

/** 垄断线（非胜利条件）：某玩家对某类地形的占比达到此值即"形成垄断"。
 *  垄断不直接获胜，而是解锁压制全桌的手段（限产/价格战/断供），
 *  同时招致反垄断举报——胜负仍靠淘汰对手。
 *  注意：实际门槛按人数缩放，业务代码统一调用 monopolyTerrainRatio(玩家数)，
 *  此常量仅作 8 人局基线 / 旧存档兼容。 */
export const MONOPOLY_WIN = {
  terrainRatio: 0.7,
} as const

// ---------- 卡牌（文档 5.2/5.3，季节加权） ----------
export const SEASON_CARD_WEIGHT = 2   // 对应季节标签权重 ×2

// ---------- AI 难度分级（噪声 / 犯错 / 预判 / 现金安全线 / 行为倾向，全部可调） ----------
export const AI_DIFFICULTY: Record<AiDifficulty, {
  label: string
  noiseAmp: number
  mistakeProb: number
  lookahead: number
  cashSafety: number
  /** 垄断冲刺倾向：越高越早锁定某地形冲刺（0~1） */
  monopolyFocus: number
  /** 联合举报倾向：越高越愿意加入别人的举报（0~1） */
  jointReportAppetite: number
}> = {
  easy: { label: '简单', noiseAmp: 0.12, mistakeProb: 0.05, lookahead: 1, cashSafety: 1.0, monopolyFocus: 0.3, jointReportAppetite: 0.2 },
  normal: { label: '正常', noiseAmp: 0.05, mistakeProb: 0.01, lookahead: 1, cashSafety: 0.85, monopolyFocus: 0.6, jointReportAppetite: 0.5 },
  hard: { label: '困难', noiseAmp: 0.02, mistakeProb: 0, lookahead: 2, cashSafety: 0.7, monopolyFocus: 0.85, jointReportAppetite: 0.8 },
  hell: { label: '地狱', noiseAmp: 0.01, mistakeProb: 0, lookahead: 3, cashSafety: 0.6, monopolyFocus: 1, jointReportAppetite: 1 },
}
export const AI_DIFFICULTY_ORDER: AiDifficulty[] = ['easy', 'normal', 'hard', 'hell']

// ---------- 市场供给压力（大量抛售压价、囤积惜售推价，有界微调） ----------
/** 单笔卖出达到此规模才形成价格压力（仅 AI 刻意抛售/操纵路径记录） */
export const MARKET_PRESSURE_THRESHOLD = 15
/** 每净卖出 1 单位资源，轮首价格下压幅度（可调） */
export const MARKET_PRESSURE_COEF = 0.004

// 季节灾害强度：1~3 级（权重 50/35/15），强度越高破坏越大
export const DISASTER_INTENSITY_WEIGHTS = [50, 35, 15] as const

// ---------- 季节事件卡（文档 6.3，每季初随机一条） ----------
export interface SeasonEventDef {
  name: string
  desc: string
  seasons?: Season[]
  rentMod?: number                 // 全局租金
  priceMod?: { resource: ResourceType; factor: number }
  outputMod?: { resource: ResourceType; factor: number }   // 单资源产出
  outputModAll?: number            // 全体产出
  typhoonProbDelta?: number
  floodProbDelta?: number
  skipDisaster?: DisasterKind
}

export const SEASON_EVENTS: SeasonEventDef[] = [
  // ---- 春：6 正 / 3 负 ----
  { name: '春日集市', desc: '本季租金 +10%', seasons: ['spring'], rentMod: 1.1 },
  { name: '春雨绵绵', desc: '本季木材价格上涨 10%', seasons: ['spring'], priceMod: { resource: 'wood', factor: 1.1 } },
  { name: '全民植树', desc: '本季木材产出 +15%', seasons: ['spring'], outputMod: { resource: 'wood', factor: 1.15 } },
  { name: '枯水期', desc: '本季洪水概率 -10%', seasons: ['spring'], floodProbDelta: -0.1 },
  { name: '万物复苏', desc: '本季所有产出 +10%', seasons: ['spring'], outputModAll: 1.1 },
  { name: '油菜花开', desc: '本季牛肉价格上涨 10%', seasons: ['spring'], priceMod: { resource: 'beef', factor: 1.1 } },
  { name: '河水暴涨', desc: '本季洪水概率 +10%', seasons: ['spring'], floodProbDelta: 0.1 },
  { name: '倒春寒', desc: '本季木材产出 -20%', seasons: ['spring'], outputMod: { resource: 'wood', factor: 0.8 } },
  { name: '梅雨连绵', desc: '本季所有产出 -10%', seasons: ['spring'], outputModAll: 0.9 },
  // ---- 夏：5 正 / 3 负 ----
  { name: '渔汛到来', desc: '本季鱼类价格上涨 15%', seasons: ['summer'], priceMod: { resource: 'fish', factor: 1.15 } },
  { name: '海鲜盛宴', desc: '本季鱼类产出 +20%', seasons: ['summer'], outputMod: { resource: 'fish', factor: 1.2 } },
  { name: '旅游旺季', desc: '本季租金 +10%', seasons: ['summer'], rentMod: 1.1 },
  { name: '瓜果飘香', desc: '本季牛肉产出 +15%', seasons: ['summer'], outputMod: { resource: 'beef', factor: 1.15 } },
  { name: '海风清凉', desc: '本季木材产出 +15%', seasons: ['summer'], outputMod: { resource: 'wood', factor: 1.15 } },
  { name: '酷暑难耐', desc: '本季石油产出 -20%', seasons: ['summer'], outputMod: { resource: 'oil', factor: 0.8 } },
  { name: '台风季临近', desc: '本季台风生成概率 +10%', seasons: ['summer'], typhoonProbDelta: 0.1 },
  { name: '烈日灼灼', desc: '本季木材产出 -20%', seasons: ['summer'], outputMod: { resource: 'wood', factor: 0.8 } },
  // ---- 秋：6 正 / 4 负 ----
  { name: '大丰收', desc: '本季所有产出 +10%', seasons: ['autumn'], outputModAll: 1.1 },
  { name: '油价大涨', desc: '本季石油价格上涨 15%', seasons: ['autumn'], priceMod: { resource: 'oil', factor: 1.15 } },
  { name: '牛肉热潮', desc: '本季牛肉价格上涨 15%', seasons: ['autumn'], priceMod: { resource: 'beef', factor: 1.15 } },
  { name: '秋高气爽', desc: '本季租金 +10%', seasons: ['autumn'], rentMod: 1.1 },
  { name: '水产丰收', desc: '本季鱼类价格上涨 15%', seasons: ['autumn'], priceMod: { resource: 'fish', factor: 1.15 } },
  { name: '木材旺季', desc: '本季木材价格上涨 10%', seasons: ['autumn'], priceMod: { resource: 'wood', factor: 1.1 } },
  { name: '油价暴跌', desc: '本季石油价格 -20%', seasons: ['autumn'], priceMod: { resource: 'oil', factor: 0.8 } },
  { name: '消费疲软', desc: '本季租金 -10%', seasons: ['autumn'], rentMod: 0.9 },
  { name: '秋旱', desc: '本季石油产出 -20%', seasons: ['autumn'], outputMod: { resource: 'oil', factor: 0.8 } },
  { name: '秋雨绵长', desc: '本季所有产出 -10%', seasons: ['autumn'], outputModAll: 0.9 },
  // ---- 冬：4 正 / 3 负 ----
  { name: '暖冬', desc: '本季不发生雪灾', seasons: ['winter'], skipDisaster: 'snow' },
  { name: '寒冬凛冽', desc: '本季牛肉产出 +20%', seasons: ['winter'], outputMod: { resource: 'beef', factor: 1.2 } },
  { name: '冰雪节', desc: '本季租金 +10%', seasons: ['winter'], rentMod: 1.1 },
  { name: '冰鲜贸易', desc: '本季鱼类价格上涨 15%', seasons: ['winter'], priceMod: { resource: 'fish', factor: 1.15 } },
  { name: '牛价低迷', desc: '本季牛肉价格 -20%', seasons: ['winter'], priceMod: { resource: 'beef', factor: 0.8 } },
  { name: '寒潮来袭', desc: '本季所有产出 -10%', seasons: ['winter'], outputModAll: 0.9 },
  { name: '油井冻结', desc: '本季石油产出 -20%', seasons: ['winter'], outputMod: { resource: 'oil', factor: 0.8 } },
]
