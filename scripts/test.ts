// 轻量自测：不引入测试框架，直接跑关键规则断言（npm test）
import assert from 'node:assert/strict'
import { RNG } from '../src/core/rng'
import { monopolyTerrainRatio, RENT_PER_ELIMINATION } from '../src/core/config'
import { cardCost, isPaidCard, CARD_BY_ID, FATE_DECK, CHANCE_DECK } from '../src/core/cards'
import { contiguousRun, globalRentMod } from '../src/core/economy'
import { declareBankruptcy } from '../src/core/bankruptcy'
import type { GameApi } from '../src/core/types'

let passed = 0
function test(name: string, fn: () => void | Promise<void>): void {
  const done = (): void => { passed++; console.log(`✓ ${name}`) }
  const r = fn()
  if (r instanceof Promise) {
    // 顶层串行由 run() 负责；这里只收集 promise
    pending.push(r.then(done))
  } else done()
}
const pending: Promise<void>[] = []

// 1) RNG 状态恢复：读档后序列必须一致
test('RNG.fromState 延续同一序列', () => {
  const a = new RNG(123456)
  a.next()
  const state = a.getState()
  const expected = [a.next(), a.next(), a.next()]
  const b = RNG.fromState(state)
  assert.deepEqual([b.next(), b.next(), b.next()], expected)
})
test('RNG 同种子完全复现', () => {
  const a = new RNG(777)
  const b = new RNG(777)
  for (let i = 0; i < 20; i++) assert.equal(a.next(), b.next())
})

// 2) 垄断门槛随人数缩放
test('垄断门槛：4 人 50%，8 人 70%', () => {
  assert.equal(monopolyTerrainRatio(4), 0.5)
  assert.equal(monopolyTerrainRatio(8), 0.7)
  assert.ok(monopolyTerrainRatio(3) <= 0.7)
})

// 3) 卡牌费用：基础按人均财富，目标型按价值封顶
function fakeGame(playersAlive: number, totalWealth: number, extra: Record<string, any> = {}): any {
  const players = Array.from({ length: playersAlive }, (_, i) => ({
    id: i, alive: i < playersAlive, isAI: true, cash: 15000,
    resources: { wood: 0, beef: 0, oil: 0, fish: 0 },
    stats: { earned: 0, spent: 0, rentPaid: 0, rentCollected: 0, timesBankrupt: 0,
      resourceIncome: 0, startBonus: 0, bankIn: 0, bankOut: 0, tileSpent: 0, buildSpent: 0 },
  }))
  return {
    state: {
      players, totalWealth, totalRound: 30, season: 'summer', endgame: false,
      climate: 'normal', rentMods: [], tiles: [], market: { wood: 100, beef: 100, oil: 100, fish: 100 },
      ...extra,
    },
    log() {}, emit() {}, markChanged() {}, sfx() {}, notice: async () => {},
  }
}
test('卡牌费用按人均财富计算', () => {
  const g = fakeGame(4, 300000)
  // 人均 75000；水利 1.5% = 1125 → 取整到 10 为 1130
  assert.equal(cardCost(g, 'water-invest'), 1130)
  assert.equal(cardCost(g, 'charity'), 1130)
  assert.equal(cardCost(g, 'lucky'), 0)
  assert.equal(isPaidCard('lucky'), false)
})
test('收购地皮费用按地价 105% 封顶', () => {
  const g = fakeGame(4, 300000)
  assert.equal(cardCost(g, 'land-deal', 1000), 1050)
  assert.equal(cardCost(g, 'steal-resources', 500), 350)
  assert.equal(cardCost(g, 'sabotage', 600), 300)
  assert.equal(cardCost(g, 'incite-defection', 1000), 900)
  assert.equal(cardCost(g, 'speculate'), 500)   // 市价 100 × 50% × 10 单位
})
test('牌堆 id 全部能回查到定义', () => {
  assert.equal(FATE_DECK.length, 25)
  assert.equal(CHANCE_DECK.length, 24)
  for (const c of [...FATE_DECK, ...CHANCE_DECK]) assert.ok(CARD_BY_ID.get(c.id), `missing ${c.id}`)
  assert.equal(CARD_BY_ID.size, FATE_DECK.length + CHANCE_DECK.length, '牌堆存在重复 id')
})

// 4) 保护期内灾害卡不可用
test('前 10 回合灾害卡不进抽取池', () => {
  const blizzard = CARD_BY_ID.get('blizzard')!
  assert.equal(blizzard.available!(fakeGame(4, 100000, { totalRound: 10 }), 0), false)
  assert.equal(blizzard.available!(fakeGame(4, 100000, { totalRound: 11 }), 0), true)
  const sandstorm = CARD_BY_ID.get('sandstorm-alert')!
  assert.equal(sandstorm.available!(fakeGame(4, 100000, { totalRound: 3 }), 0), false)
})
test('灾害卡季节标签与灾害类型一致', () => {
  assert.deepEqual(CARD_BY_ID.get('blizzard')!.seasons, ['winter'])
  assert.deepEqual(CARD_BY_ID.get('sandstorm-alert')!.seasons, ['spring', 'summer'])
  assert.deepEqual(CARD_BY_ID.get('typhoon-alert')!.seasons, ['summer', 'autumn'])
  for (const c of [...FATE_DECK, ...CHANCE_DECK]) {
    if (c.disaster) assert.ok(c.seasons?.length, `${c.id} 缺少季节标签`)
  }
})

// 5) 连片计算
test('连片地块长度：连续 5 格返回 5', () => {
  const g = fakeGame(4, 100000)
  g.state.tiles = Array.from({ length: 5 }, (_, i) => ({
    index: i, type: 'terrain', terrain: 'forest', owner: 0,
  }))
  assert.equal(contiguousRun(g, g.state.tiles[2]), 5)
  g.state.tiles[2].owner = 1
  assert.equal(contiguousRun(g, g.state.tiles[2]), 1)
})

// 6) 淘汰租金加速
test('每淘汰一人租金上浮', () => {
  const g = fakeGame(4, 100000)
  // 4 人局 1 人出局：全场上浮 RENT_PER_ELIMINATION
  g.state.players[3].alive = false
  assert.ok(Math.abs(globalRentMod(g) - (1 + RENT_PER_ELIMINATION)) < 1e-9)
  g.state.endgame = true
  // 4 人局出局 1 人 → 3 人压力期，使用较轻的 pressureRentMod
  assert.ok(Math.abs(globalRentMod(g) - (1 + RENT_PER_ELIMINATION) * 1.0) < 1e-9)
  g.state.players[2].alive = false   // 只剩 2 人 → 完整终局加成
  assert.ok(Math.abs(globalRentMod(g) - (1 + 2 * RENT_PER_ELIMINATION) * 1.5) < 1e-9)
})

// 7) 破产：资产移交、重置危机倒计时、人类出局事件
test('破产资产移交与出局事件', async () => {
  const g = fakeGame(4, 100000) as unknown as GameApi & { events: string[] }
  g.events = []
  g.emit = (name: string) => { g.events.push(name) }
  const p0 = g.state.players[0]
  p0.cash = 100
  p0.isAI = false
  p0.resources.wood = 10
  g.state.bankruptOrder = []
  g.state.firstBankruptTurn = null
  g.state.roundsNoBankruptcy = 2
  g.state.endgame = false
  g.state.winner = null
  g.state.tiles = [{
    index: 1, type: 'terrain', terrain: 'forest', owner: 0, price: 1000,
    buildings: [{ id: 1, type: 'sawmill', level: 1, invested: 400 }], disaster: null,
    seized: false, name: '森林·1号地', buildings2: undefined,
  }] as any
  await declareBankruptcy(g, 0, 1, '测试破产')
  assert.equal(p0.alive, false)
  assert.equal(g.state.tiles[0].owner, 1)
  assert.equal(g.state.tiles[0].buildings.length, 0)
  // 折现：建筑 200 + 木材 10×100×0.5=500 + 现金 100 = 800
  assert.equal(g.state.players[1].cash, 15000 + 800)
  assert.equal(p0.cash, 0)
  assert.equal(g.state.roundsNoBankruptcy, 0)
  // 4 人局出局 1 人 → 存活 3 人，触发终局压力
  assert.equal(g.state.endgame, true)
  assert.ok(g.events.includes('bankrupt'))
  assert.ok(g.events.includes('human-eliminated'))
})

void Promise.all(pending).then(() => {
  console.log(`\n全部通过：${passed} 项`)
}).catch(err => {
  console.error('\n测试失败：', err)
  process.exitCode = 1
})
