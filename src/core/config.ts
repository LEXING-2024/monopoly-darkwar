// ============ 数据驱动配置（文档第 3~9、14 章的全部数值） ============

import type { AiDifficulty, ClimateStatus, DisasterKind, Reserve, ResourceType, Season, Terrain } from './types'

// ---------- 通用 ----------
export const TILE_COUNT = 72
export const START_BONUS = 1000
export const INITIAL_CASH = 15000
export const LOG_CAP = 200
export const MAX_TURNS = 4000
/** 前 N 轮保护期：不触发自然灾害与囚徒困境（1 轮 = 全部存活玩家各行动一次） */
export const SAFE_TURNS = 10
/** 每回合操作配额（每位玩家独立计次：进入各自行动阶段时重置）。
 *  人类与 AI 同数：建造 ≤1、升级 ≤1、修理 ≤1、勘探 ≤1、修桥 ≤1。
 *  扣减位置统一：人类 UI 与 AI（act.ts）都走 game.buildAt/upgradeAt/repairAt/exploreAt/repairBridge，配额随当前玩家各自独立，互不共享。
 *  例外：停在起点的「8 折全修」是落脚事件，不占配额 */
export const TURN_OP_LIMITS = { build: 1, upgrade: 1, repair: 1, explore: 1, bridge: 1 } as const
/** 开局租金缓启动：前 N 轮租金从 60% 线性恢复到 100%（保护早期现金流，不增加购买力） */
export const RENT_RAMP_ROUNDS = 20
export const RENT_RAMP_MIN = 0.6
/** 每季持续轮数范围（每季随机抽取，玩家无法预判季节更替时机） */
export const SEASON_LEN_MIN = 10
export const SEASON_LEN_MAX = 15

// ---------- 玩家（支持 2~8 人） ----------
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
  // 文档 4.1：初始产出/回合 100~150（按市价折算 ≈ 1 单位/回合）
  wood: { name: '木材', icon: '🌲', terrain: 'forest', basePrice: 120, baseOutput: 1 },
  beef: { name: '牛肉', icon: '🐄', terrain: 'plateau', basePrice: 100, baseOutput: 1 },
  oil: { name: '石油', icon: '⛽', terrain: 'desert', basePrice: 150, baseOutput: 1 },
  fish: { name: '鱼类', icon: '🐟', terrain: 'coast', basePrice: 130, baseOutput: 1 },
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
    priceBase: 1500, priceStep: 80, rentRatio: 0.9,
    specials: [
      { index: 5, type: 'fate' },
      { index: 10, type: 'chance' },
    ],
  },
  {
    terrain: 'plateau',
    range: [19, 35],
    priceBase: 1900, priceStep: 90, rentRatio: 0.9,
    specials: [{ index: 24, type: 'fate' }],
  },
  {
    terrain: 'desert',
    range: [36, 52],
    priceBase: 2300, priceStep: 100, rentRatio: 0.9,
    specials: [
      { index: 36, type: 'chance' },
      { index: 40, type: 'fate' },
      { index: 42, type: 'casino' },
    ],
  },
  {
    terrain: 'coast',
    range: [54, 71],
    priceBase: 1700, priceStep: 60, rentRatio: 0.9,
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
    upgradeCosts: [0, 1200, 2000], winterIce: true,
  },
  [EAST_BRIDGE]: {
    name: '东桥', price: 2000, tolls: [0, 200, 600, 1200],
    upgradeCosts: [0, 1500, 2500], winterIce: false,
  },
} as const

// 河流沿岸地块（洪水影响，文档 7.3）
export const FLOOD_TILES: number[] = [14, 15, 19, 20, 47, 48, 50, 51]

// ---------- 市场（文档 4.3 / 9） ----------
export const MARKET_WALK = 0.08      // 每回合随机波动 ±8%
export const MARKET_WALK_ENDGAME = 0.16
export const PRICE_CLAMP_MIN = 0.5
export const PRICE_CLAMP_MAX = 2.2
export const BULK_SALE_THRESHOLD = 20  // 单笔 ≥20 单位当笔 -5%（简化供需）
export const BULK_SALE_DISCOUNT = 0.95

// ---------- 景气循环（GDP 驱动，每轮末评估；危机持续 5 轮） ----------
export const CLIMATE = {
  boomDelta: 0.05,           // 轮 GDP 增幅 ≥ +5% → 繁荣
  recessionDelta: -0.03,     // 轮 GDP 跌幅 ≤ -3% → 衰退
  crisisStreak: 2,           // 连续 2 轮衰退 → 危机
  crisisTurns: 5,            // 危机持续轮数（期间锁定，解除后按 GDP 重评）
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
  // 资源生产（+50%/级，文档 8.1）
  { id: 'lumber-mill', name: '伐木场', icon: '🪓', category: 'production', terrain: 'forest', cost: 500, outputMult: 0.5, desc: '木材产出每级 +50%' },
  { id: 'pasture', name: '牧场', icon: '🐄', category: 'production', terrain: 'plateau', cost: 550, outputMult: 0.5, desc: '牛肉产出每级 +50%' },
  { id: 'oil-well', name: '油井', icon: '🛢️', category: 'production', terrain: 'desert', cost: 650, outputMult: 0.5, desc: '石油产出每级 +50%' },
  { id: 'fishing-port', name: '渔港', icon: '⚓', category: 'production', terrain: 'coast', cost: 600, outputMult: 0.5, desc: '鱼类产出每级 +50%' },
  // 防灾
  { id: 'firebreak', name: '防火带', icon: '🧯', category: 'protection', terrain: 'forest', protects: 'fire', cost: 500, desc: '免疫火灾' },
  { id: 'greenhouse', name: '温室', icon: '🏠', category: 'protection', terrain: 'plateau', protects: 'snow', cost: 550, desc: '免疫雪灾' },
  { id: 'sandbelt', name: '防沙林', icon: '🌳', category: 'protection', terrain: 'desert', protects: 'sandstorm', cost: 600, desc: '免疫沙尘暴' },
  { id: 'breakwater', name: '防波堤', icon: '🧱', category: 'protection', terrain: 'coast', protects: 'typhoon', cost: 650, desc: '台风：收益不归零、建筑受损概率减半' },
  { id: 'dam', name: '堤坝', icon: '🏗️', category: 'protection', protects: 'flood', cost: 600, desc: '免疫洪水（河流沿岸）' },
  // 科技（每玩家限 1 座）
  { id: 'weather-station', name: '气象站', icon: '📡', category: 'tech', cost: 1500, maxPerPlayer: 1, desc: '提前 1 回合显示台风路径' },
  { id: 'automation', name: '自动化中心', icon: '🤖', category: 'tech', cost: 1800, maxPerPlayer: 1, desc: '所有资源产出 +25%' },
  { id: 'drone-logistics', name: '无人机物流', icon: '🚁', category: 'tech', cost: 2000, maxPerPlayer: 1, desc: '收取租金 +10%，卖价 +10%' },
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
  maxCount: 1,
  // 成长模型（文档 7.1）：生成时 0 级热带扰动，海上每回合概率 +1 级直至最强 5 级；
  // 任何级别（≥1）都可能登陆，不一定成长到最强
  startStrength: 0,
  maxStrength: 5,
  strengthenProb: 0.55,
  minLife: 5,
  maxLife: 7,
  moveRange: [1, 2] as const,
  turnProb: 0.4,          // 每回合概率改变移动方向——破坏地点不固定
  landfallProb: [0, 0.2, 0.25, 0.3, 0.35, 0.45] as const,  // 按强度 0..5，级别越高越易登陆
  maxLandTurns: 2,
  // 按强度 0..5 的建筑破坏概率：低级别也有破坏性，最强级别几乎必毁
  destroyProb: [0, 0.1, 0.2, 0.4, 0.65, 0.9] as const,
  wideRangeAt: 4,         // ≥4 级登陆时波及 ±2 格，其余 ±1 格
  neighborProbScale: 0.5, // 波及格破坏概率减半（「影响一点点」）
  eastBridgeDamageProb: 0.4,
}

// ---------- 地震（文档 7.2 / 15） ----------
export const QUAKE = {
  baseProb: 0.075,
  manyBuildingsProb: 0.12,
  manyBuildingsCount: 5,
  magnitudeWeights: [50, 35, 15] as const,           // 1/2/3 级
  // 每级：对建筑 1/2/3 级建筑的破坏概率；桥梁破坏概率；租金影响 0/0.5/1
  table: [
    { destroy1: 0.3, degrade2: 0.2, degrade3: 0.1, bridge: 0.1, rentMult: 0 },
    { destroy1: 0.5, degrade2: 0.35, degrade3: 0.2, bridge: 0.3, rentMult: 0.5 },
    { destroy1: 0.8, degrade2: 0.5, degrade3: 0.3, bridge: 0.5, rentMult: 1 },
  ] as const,
}

// ---------- 反垄断（文档 9.3） ----------
// ---------- 反垄断（文档 9.3，玩家主动举报制） ----------
export const ANTITRUST = {
  terrainRatio: 0.7,        // 垄断线：单类地形占比 ≥70%
  globalRatio: 0.5,         // 垄断线：全局地形占比 ≥50%
  reportCost: 300,          // 每位举报人费用
  reportProb: [0, 0.4, 0.7, 0.9],   // 按举报人数：1 人 40%、2 人 70%、3 人及以上 90%
  lobby: [
    { cost: 300, mod: -0.1 }, { cost: 600, mod: -0.2 }, { cost: 1000, mod: -0.3 },
  ] as const,
  lobbyTurns: 5,            // 游说效果持续轮数
  fineRatio: 0.15,          // 罚款 = 垄断地块总值的 15%
  bountyRatio: 0.25,        // 举报人分享罚款的 25%（2026-08 提高博弈机制经济权重）
  cooldownRounds: 2,        // 举报失败后同一目标 2 轮内不可再被举报
  outcomes: ['fine', 'auction', 'output'] as const,
}

// ---------- 囚徒困境（文档 9.4） ----------
export const DILEMMA_EVERY = 5
export const DILEMMA_PAYOFFS = {
  CC: [3000, 3000],
  DC: [4500, -1500],   // 背叛者 / 合作者
  DD: [-800, -800],
} as const

// ---------- 终局（文档 2.3） ----------
export const ENDGAME = {
  rentMod: 1.5,
  crisisTurns: 5,
  crisisRatio: 0.3,
}

// ---------- 卡牌（文档 5.2/5.3，季节加权） ----------
export const SEASON_CARD_WEIGHT = 2   // 对应季节标签权重 ×2

// ---------- AI 难度分级（噪声 / 犯错 / 预判 / 现金安全线，全部可调） ----------
export const AI_DIFFICULTY: Record<AiDifficulty, { label: string; noiseAmp: number; mistakeProb: number; lookahead: number; cashSafety: number }> = {
  easy: { label: '简单', noiseAmp: 0.12, mistakeProb: 0.05, lookahead: 1, cashSafety: 1.0 },
  normal: { label: '正常', noiseAmp: 0.05, mistakeProb: 0.01, lookahead: 1, cashSafety: 0.85 },
  hard: { label: '困难', noiseAmp: 0.02, mistakeProb: 0, lookahead: 2, cashSafety: 0.7 },
  hell: { label: '地狱', noiseAmp: 0.01, mistakeProb: 0, lookahead: 3, cashSafety: 0.6 },
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
