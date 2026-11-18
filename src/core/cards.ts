// ============ 命运 / 机会卡牌（文档 5.2 / 5.3，命运 24 张 + 机会 20 张） ============

import {
  BUILDING_DEFS, EAST_BRIDGE, RESOURCES, SAFE_TURNS, TILE_COUNT, WEST_BRIDGE,
} from './config'
import { makeTyphoonState } from './disasters'
import { addChain, monopolyInfo, specialReport } from './events'
import { rollReserve, totalValue } from './economy'
import { applyPriceShock } from './market'
import { newBuildingId } from './buildings'
import type { DisasterKind, GameApi, ResourceType, Season, Terrain, Tile } from './types'

/** 可选地形区列表（灾害卡让玩家选目标区域） */
const TERRAIN_CHOICES: Terrain[] = ['forest', 'plateau', 'desert', 'coast']
const TERRAIN_LABEL: Record<Terrain, string> = { forest: '森林', plateau: '高原', desert: '沙漠', coast: '沿海' }

/** 给指定地形区里「除抽卡者外的存活对手」地块施加灾害；抽卡者地块免疫。返回受影响地块数 */
function hitOpponentTerrain(game: GameApi, playerId: number, terrain: Terrain, kind: DisasterKind, turns: number): number {
  let count = 0
  for (const t of game.state.tiles) {
    if (t.type !== 'terrain' || t.terrain !== terrain) continue
    if (t.owner === null || t.owner === playerId) continue    // 无主地块与抽卡者免疫
    if (!game.state.players[t.owner]?.alive) continue
    t.disaster = { kind, turns }
    count++
  }
  return count
}

export interface CardDef {
  id: string
  name: string
  desc: string
  icon: string
  seasons?: Season[]
  cost?: number
  /** 抽卡阶段的有效性判定：返回 false 的卡本局当前不进入抽取池（避免抽到无效卡再发保底补偿） */
  available?: (game: GameApi, playerId: number) => boolean
  effect: (game: GameApi, playerId: number) => Promise<void>
}

const ownerTiles = (game: GameApi, pid: number) => game.state.tiles.filter(t => t.owner === pid)
const terrainTilesOf = (game: GameApi, pid: number, terrain: string) =>
  ownerTiles(game, pid).filter(t => t.type === 'terrain' && t.terrain === terrain)

/** 卡牌金钱与总财富挂钩：金额 = 人均总财富 × 比例（人均下限 5000，金额下限 100，取整到 10）。
 *  奖励与罚款随经济规模浮动——早期少、后期多，避免固定数值在后期无关痛痒。 */
export function cardMoney(game: GameApi, ratio: number): number {
  const alive = game.state.players.filter(p => p.alive).length || 1
  const perCapita = Math.max(5000, game.state.totalWealth / alive)
  return Math.max(100, Math.round((perCapita * ratio) / 10) * 10)
}

// ---------------- 命运卡（强制） ----------------

export const FATE_DECK: CardDef[] = [
  {
    id: 'flood-bridge', name: '洪水冲毁桥梁', icon: '🌊', seasons: ['spring'],
    desc: '随机一座桥梁受损，过路费暂时翻倍，持续 2 回合。',
    effect: async (game) => {
      const s = game.state
      const idx = game.rng.chance(0.5) ? WEST_BRIDGE : EAST_BRIDGE
      s.bridgeTollMods.push({ factor: 2, turns: 2, label: '桥梁受损' })
      const bridge = s.tiles[idx]
      if (bridge.bridgeLevel > 0 && game.rng.chance(0.5)) {
        bridge.bridgeLevel = (bridge.bridgeLevel - 1) as 0 | 1 | 2 | 3
      }
      game.log(`洪水冲击「${bridge.name}」，过路费翻倍（2 回合）！`)
    },
  },
  {
    id: 'new-oilfield', name: '发现新油田', icon: '⛽',
    desc: '你的一块沙漠地块资源储量提升为富矿。',
    effect: async (game, pid) => {
      const tiles = terrainTilesOf(game, pid, 'desert')
      if (tiles.length) {
        const t = game.rng.pick(tiles)
        t.explored = true
        t.reserve = 'rich'
        game.log(`「${t.name}」发现富矿油田！`, pid)
      } else {
        game.gain(pid, cardMoney(game, 0.01), '发现新油田（无沙漠地块）')
      }
    },
  },
  {
    id: 'market-crash', name: '行业崩盘', icon: '📉',
    desc: '选一种资源，所有对手的该资源产出减半 2 回合，你自己不受影响。',
    effect: async (game, pid) => {
      const res = await game.prompt<ResourceType>({
        type: 'choose-resource', title: '行业崩盘',
        desc: '选择要打击的资源（所有对手该资源产出减半 2 回合，你免疫）',
        options: Object.keys(RESOURCES) as ResourceType[], player: pid, cardId: 'market-crash',
      })
      // 产出修正是按玩家存的：只给对手加，抽卡者不加入 → 天然免疫
      let hit = 0
      for (const p of game.state.players) {
        if (!p.alive || p.id === pid) continue
        p.status.outputMods.push({ factor: 0.5, turns: 2, label: `行业崩盘·${RESOURCES[res].name}` })
        hit++
      }
      game.log(`行业崩盘！${RESOURCES[res].name}产出对 ${hit} 名对手减半（2 回合），你独善其身`, pid)
    },
  },
  {
    id: 'subsidy', name: '政府补贴', icon: '💰',
    desc: '获得人均总财富 的 3%（随经济规模浮动）。',
    effect: async (game, pid) => { game.gain(pid, cardMoney(game, 0.03), '政府补贴') },
  },
  {
    id: 'blizzard', name: '暴风雪来袭', icon: '❄️', seasons: ['winter'],
    desc: '选一片地形区，该区所有对手当回合收益归零，你在该区的地块免疫。',
    effect: async (game, pid) => {
      const terrain = await game.prompt<Terrain>({
        type: 'choose-terrain', title: '暴风雪来袭',
        desc: '选择暴风雪席卷的地形区（该区对手收益归零 1 回合，你的地块免疫）',
        options: TERRAIN_CHOICES, player: pid, cardId: 'blizzard',
      })
      const hit = hitOpponentTerrain(game, pid, terrain, 'snow', 1)
      game.log(`暴风雪席卷${TERRAIN_LABEL[terrain]}区，${hit} 块对手地块收益归零（你免疫）！`, pid)
    },
  },
  {
    id: 'harvest', name: '丰收年', icon: '🌾', seasons: ['autumn'],
    desc: '所有玩家资源产出 +20%，持续 2 回合。',
    effect: async (game) => {
      game.state.outputModAll.push({ factor: 1.2, turns: 2, label: '丰收年' })
      // 事件链同样受开局保护期约束：前 10 回合不出现
      if (game.state.totalRound > SAFE_TURNS) {
        addChain(game, 'harvest-crash', null, 2, {})
      }
      game.log('丰收年！所有产出 +20%（2 回合）')
    },
  },
  {
    id: 'antitrust-now', name: '匿名举报', icon: '⚖️',
    desc: '无需满足垄断线，即可对垄断度最高的玩家发起一次特殊举报（成功率 40%）。',
    effect: async (game, pid) => {
      // (imported statically at top)
      const others = game.state.players.filter(p => p.alive && p.id !== pid)
      if (!others.length) return
      const target = others.sort((a, b) => {
        const ma = monopolyInfo(game, a.id)
        const mb = monopolyInfo(game, b.id)
        return (mb.singleRatio + mb.globalRatio) - (ma.singleRatio + ma.globalRatio)
      })[0]
      await specialReport(game, pid, target.id)
    },
  },
  {
    id: 'bridge-upgrade', name: '桥梁维护完成', icon: '🌉',
    desc: '你拥有的一座桥免费升级一级（无可升级的桥时此卡不会抽到）。',
    available: (game, pid) => ownerTiles(game, pid).some(t => t.type === 'bridge' && t.bridgeLevel < 3),
    effect: async (game, pid) => {
      const bridges = ownerTiles(game, pid).filter(t => t.type === 'bridge' && t.bridgeLevel < 3)
      if (!bridges.length) return   // 兜底：available 过滤后理论上不会到这里
      const b = game.rng.pick(bridges)
      b.bridgeLevel = (b.bridgeLevel + 1) as 1 | 2 | 3
      game.log(`「${b.name}」维护完成，升级为 ${b.bridgeLevel} 级！`, pid)
    },
  },
  {
    id: 'sandstorm-alert', name: '沙尘暴警报', icon: '🌪️',
    desc: '选一片地形区，该区所有对手收益减半，你在该区的地块免疫。',
    effect: async (game, pid) => {
      const terrain = await game.prompt<Terrain>({
        type: 'choose-terrain', title: '沙尘暴警报',
        desc: '选择沙尘暴横扫的地形区（该区对手收益减半 1 回合，你的地块免疫）',
        options: TERRAIN_CHOICES, player: pid, cardId: 'sandstorm-alert',
      })
      const hit = hitOpponentTerrain(game, pid, terrain, 'sandstorm', 1)
      game.log(`沙尘暴横扫${TERRAIN_LABEL[terrain]}区，${hit} 块对手地块收益减半（你免疫）`, pid)
    },
  },
  {
    id: 'charity', name: '慈善捐赠', icon: '🎗️',
    desc: '捐出人均总财富 的 1.5%，下回合免交过路费。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.015), null, '慈善捐赠')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.rentFree = Math.max(game.state.players[pid].status.rentFree, 2)
        game.log('善有善报，下回合免交过路费', pid)
      }
    },
  },
  {
    id: 'oil-spill', name: '石油泄漏', icon: '🛢️',
    desc: '你的沙漠地块收益归零 1 回合，污染指数上升。',
    effect: async (game, pid) => {
      const tiles = terrainTilesOf(game, pid, 'desert')
      if (tiles.length) {
        const t = game.rng.pick(tiles)
        t.disaster = { kind: 'pollution', turns: 1 }
        game.log(`「${t.name}」发生石油泄漏！`, pid)
        // 事件链同样受开局保护期约束：前 10 回合不出现
        if (game.state.totalRound > SAFE_TURNS) {
          addChain(game, 'pollution-protest', pid, 2, {})
        }
      }
    },
  },
  {
    id: 'wallet', name: '捡到钱包', icon: '👛',
    desc: '获得人均总财富 的 1.5%（随经济规模浮动）。',
    effect: async (game, pid) => { game.gain(pid, cardMoney(game, 0.015), '捡到钱包') },
  },
  {
    id: 'tax-audit', name: '突击查税', icon: '🧾',
    desc: '二选一：缴纳人均总财富 的 2% 税款，或失去你价值最低的一块地块。',
    effect: async (game, pid) => {
      const s = game.state
      const tax = cardMoney(game, 0.02)
      const choice = await game.prompt<'pay' | 'lose'>({
        type: 'pay-or-lose', title: '突击查税',
        desc: `税务稽查登门！支付 ${tax} 税款，或失去你价值最低的一块地块。`,
        cost: tax, loseDesc: '失去价值最低的地块', player: pid,
      })
      if (choice === 'pay') {
        await game.pay(pid, tax, null, '查税罚款')
      } else {
        // 优先查封无建筑地块（价值最低），否则按地价最低
        const empty = ownerTiles(game, pid).filter(t => t.type === 'terrain' && t.buildings.length === 0)
        const pool = empty.length ? empty : ownerTiles(game, pid).filter(t => t.type === 'terrain')
        if (!pool.length) {
          game.gain(pid, tax, '查税豁免')
          game.log('无地块可查封，税务人员悻悻而去', pid)
          return
        }
        const t = pool.sort((a, b) => a.price - b.price)[0]
        t.owner = null
        t.buildings = []
        game.log(`「${t.name}」被查封抵税`, pid)
      }
      game.markChanged()
    },
  },
  {
    id: 'recession', name: '经济萧条', icon: '📉',
    desc: '你的租金收入 -30%，持续 3 回合。',
    effect: async (game, pid) => {
      // 个人租金状态在「自己的回合结束」衰减；turns=N+1 才覆盖 N 个完整轮次
      game.state.players[pid].status.rentBonus.push({ factor: 0.7, turns: 4, label: '经济萧条' })
      game.log('经济萧条，你的租金收入 -30%（3 回合）', pid)
    },
  },
  {
    id: 'lucky', name: '特别好运', icon: '🍀',
    desc: '获得一张随机机会卡。',
    effect: async (game, pid) => { await game.drawChance(pid, true) },
  },
  {
    id: 'forced-swap', name: '被迫搬迁', icon: '🏚️',
    desc: '你的一块地块被强制与随机玩家交换。',
    effect: async (game, pid) => {
      const s = game.state
      const mine = ownerTiles(game, pid).filter(t => t.type === 'terrain' || t.type === 'bridge')
      if (!mine.length) return
      const others = s.players.filter(p => p.alive && p.id !== pid)
      if (!others.length) return
      const other = game.rng.pick(others)
      const theirs = ownerTiles(game, other.id).filter(t => t.type === 'terrain' || t.type === 'bridge')
      if (!theirs.length) return
      const a = game.rng.pick(mine)
      const b = game.rng.pick(theirs)
      a.owner = other.id
      b.owner = pid
      game.log(`被迫搬迁：「${a.name}」与「${other.name}」的「${b.name}」互换`, pid)
    },
  },
  {
    id: 'festival', name: '节日庆典', icon: '🎉',
    desc: '你获得人均总财富 的 2% 节日礼金，并免除一次过路费。',
    effect: async (game, pid) => {
      game.gain(pid, cardMoney(game, 0.02), '节日庆典')
      game.state.players[pid].status.rentFree = Math.max(game.state.players[pid].status.rentFree, 2)
    },
  },
  {
    id: 'typhoon-alert', name: '台风警报', icon: '🌀', seasons: ['summer', 'autumn'],
    desc: '东南近海生成一股台风（1 级），将在海上逐步增强（保护期内或已有台风时此卡不会抽到）。',
    // 保护期内不生成台风、场上已有台风时也不再生成 → 这两种情况不进抽取池
    available: (game) => !game.state.typhoon && game.state.totalRound > SAFE_TURNS,
    effect: async (game) => {
      const s = game.state
      if (s.typhoon) return   // 兜底：available 过滤后理论上不会到这里
      s.typhoon = makeTyphoonState(game, 1)
      game.log('台风警报：东南近海生成台风（1 级），将在海上逐步增强！')
      game.sfx('thunder')
      game.emit('typhoon', s.typhoon)
    },
  },
  {
    id: 'geologist', name: '地质学家来访', icon: '⛏️',
    desc: '免费勘探你的一块地块。',
    effect: async (game, pid) => {
      const unk = ownerTiles(game, pid).filter(t => t.type === 'terrain' && !t.explored)
      if (unk.length) {
        const t = unk.length === 1 ? unk[0] : game.state.tiles[
          await game.prompt<number>({
            type: 'choose-tile', title: '地质学家来访',
            desc: '免费勘探哪块地块？', tiles: unk.map(x => x.index), player: pid, cardId: 'geologist',
          })
        ]
        // (imported statically at top)
        t.explored = true
        t.reserve = rollReserve(game)
        game.log(`免费勘探「${t.name}」完成`, pid)
      }
    },
  },
  {
    id: 'bank-rate', name: '银行加息', icon: '🏦',
    desc: '所有对手向银行缴纳人均总财富 的 0.5%，你免交。',
    effect: async (game, pid) => {
      for (const p of [...game.state.players]) {
        if (p.alive && p.id !== pid) await game.pay(p.id, cardMoney(game, 0.005), null, '银行加息')
      }
      game.log('银行加息！所有对手缴纳利息，你独善其身', pid)
    },
  },
  {
    id: 'traffic', name: '交通拥堵', icon: '🚧',
    desc: '你下回合移动步数 -2。',
    effect: async (game, pid) => {
      game.state.players[pid].status.moveMod -= 2
      game.log('交通拥堵，下回合移动 -2', pid)
    },
  },
  {
    id: 'celebrity', name: '名人来访', icon: '🌟',
    desc: '你收取的租金 +50%，持续 2 回合。',
    effect: async (game, pid) => {
      // turns=N+1：抵消本回合结束时的第一次衰减，覆盖接下来 N 个完整轮次
      game.state.players[pid].status.rentBonus.push({ factor: 1.5, turns: 3, label: '名人来访' })
      game.log('名人来访，租金 +50%（2 回合）', pid)
    },
  },
  {
    id: 'strike', name: '工人罢工', icon: '✊',
    desc: '你本回合资源产出 -50%。',
    effect: async (game, pid) => {
      game.state.players[pid].status.outputMods.push({ factor: 0.5, turns: 1, label: '工人罢工' })
      game.log('工人罢工，本回合产出减半', pid)
    },
  },
  {
    id: 'requisition', name: '土地征用', icon: '📜',
    desc: '银行以 1.2 倍价格强制收购你的一块地块。',
    effect: async (game, pid) => {
      const mine = terrainTilesOf(game, pid, 'forest')
        .concat(terrainTilesOf(game, pid, 'plateau'))
        .concat(terrainTilesOf(game, pid, 'desert'))
        .concat(terrainTilesOf(game, pid, 'coast'))
      if (mine.length) {
        const t = game.rng.pick(mine)
        const price = Math.round((t.price * 1.2) / 10) * 10
        t.owner = null
        t.buildings = []
        game.gain(pid, price, '土地征用补偿')
        game.log(`「${t.name}」被征用，补偿 ${price}`, pid)
      }
    },
  },
  {
    id: 'rain', name: '天降甘霖', icon: '🌧️',
    desc: '清除你所有地块上的灾害，并获得人均总财富 的 2%。',
    effect: async (game, pid) => {
      for (const t of ownerTiles(game, pid)) t.disaster = null
      game.gain(pid, cardMoney(game, 0.02), '天降甘霖')
    },
  },
]

// ---------------- 机会卡（可选择是否执行） ----------------

export const CHANCE_DECK: CardDef[] = [
  {
    id: 'invest-oilfield', name: '投资油田', icon: '🛢️', cost: 300,
    desc: '支付人均总财富 的 1.5%，立即获得一块未拥有的沙漠地块（若有）。',
    effect: async (game, pid) => {
      const free = game.state.tiles.filter(t => t.type === 'terrain' && t.terrain === 'desert' && t.owner === null && !t.seized)
      if (!free.length) { game.log('没有无主的沙漠地块了') ; return }
      await game.pay(pid, cardMoney(game, 0.015), null, '投资油田')
      if (!game.state.players[pid].alive) return
      const t = game.rng.pick(free)
      t.owner = pid
      game.log(`「${game.state.players[pid].name}」获得「${t.name}」`, pid)
    },
  },
  {
    id: 'bridge-share', name: '收购桥梁股份', icon: '🌉', cost: 500,
    desc: '支付人均总财富 的 2.5%，某座桥的过路费收入你分得 30%，持续 3 回合。',
    effect: async (game, pid) => {
      const bridges = [WEST_BRIDGE, EAST_BRIDGE].filter(i => game.state.tiles[i].owner !== null && game.state.tiles[i].owner !== pid)
      if (!bridges.length) { game.log('没有可收购股份的桥梁'); return }
      await game.pay(pid, cardMoney(game, 0.025), null, '收购桥梁股份')
      if (!game.state.players[pid].alive) return
      const b = game.rng.pick(bridges)
      // turns=N+1：个人状态在本回合结束时先衰减一次，需补偿才能覆盖 N 个完整轮次
      game.state.players[pid].status.bridgeShare.push({ bridge: b, turns: 4 })
      game.log(`「${game.state.players[pid].name}」获得「${game.state.tiles[b].name}」30% 过路费分成（3 回合）`, pid)
    },
  },
  {
    id: 'temp-dock', name: '修建临时码头', icon: '⛵', cost: 200,
    desc: '支付人均总财富 的 1%，下次过河免过路费。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.01), null, '临时码头')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.rentFree = Math.max(game.state.players[pid].status.rentFree, 2)
      }
    },
  },
  {
    id: 'speculate', name: '投机资源', icon: '📈',
    desc: '选择一种资源，以当前市场价 50% 买入 10 单位，下回合可按当时价格卖出。',
    effect: async (game, pid) => {
      const res = await game.prompt<ResourceType>({
        type: 'choose-resource', title: '投机资源',
        desc: '选择要投机的资源（半价买入 10 单位）',
        options: ['wood', 'beef', 'oil', 'fish'], player: pid,
      })
      const cost = Math.round((game.state.market[res] * 0.5 * 10) / 10) * 10
      if (game.state.players[pid].cash < cost) { game.log('现金不足，放弃投机'); return }
      game.state.players[pid].cash -= cost
      game.state.players[pid].stats.spent += cost
      game.state.players[pid].resources[res] += 10
      // turns=2：本回合结束时先减到 1，下一个自己的回合结束时才到期结算，
      // 这样才是「下回合按当时价格卖出」。turns=1 会在抽到卡的当回合立刻按原价卖掉，
      // 等于无风险稳赚 50%。
      game.state.speculation.push({ player: pid, resource: res, units: 10, turns: 2 })
      game.log(`「${game.state.players[pid].name}」半价囤入 10 单位${RESOURCES[res].name}`, pid)
    },
  },
  {
    id: 'geologist-hire', name: '聘请地质学家', icon: '🧑‍🔬', cost: 300,
    desc: '支付人均总财富 的 1.5%，揭示一块沙漠地块的储量和类型。',
    effect: async (game, pid) => {
      const unk = terrainTilesOf(game, pid, 'desert').filter(t => !t.explored)
      if (!unk.length) { game.log('没有待勘探的沙漠地块'); return }
      await game.pay(pid, cardMoney(game, 0.015), null, '聘请地质学家')
      if (!game.state.players[pid].alive) return
      const t = unk.length === 1 ? unk[0] : game.state.tiles[
        await game.prompt<number>({
          type: 'choose-tile', title: '聘请地质学家',
          desc: '勘探哪块沙漠地块？', tiles: unk.map(x => x.index), player: pid, cardId: 'geologist-hire',
        })
      ]
      t.explored = true
      t.reserve = rollReserve(game)
      game.log(`「${t.name}」勘探完成`, pid)
    },
  },
  {
    id: 'bribe', name: '买通官员', icon: '💼', cost: 400,
    desc: '支付人均总财富 的 2%，临时大幅降低你被举报的成功率。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.02), null, '买通官员')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.antitrustMod -= 1
        game.state.players[pid].status.antitrustTurns = Math.max(game.state.players[pid].status.antitrustTurns, 1)
      }
    },
  },
  {
    id: 'market-fair', name: '开办集市', icon: '🏪', cost: 200,
    desc: '支付人均总财富 的 1%，你收取的租金 +50%，持续到你的下回合结束。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.01), null, '开办集市')
      if (game.state.players[pid].alive) {
        // turns=1 会在本回合结束时立刻过期——而租金只在对手回合收取，等于完全无效。
        // 设为 2 才能覆盖接下来一整轮对手的行动。
        game.state.players[pid].status.rentBonus.push({ factor: 1.5, turns: 2, label: '开办集市' })
      }
    },
  },
  {
    id: 'temp-dam', name: '建造临时堤坝', icon: '🏗️', cost: 300,
    desc: '支付人均总财富 的 1.5%，接下来 3 轮你的桥梁两侧地块不受洪水影响。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.015), null, '临时堤坝')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.floodImmune = 3
      }
    },
  },
  {
    id: 'auction-commission', name: '拍卖行委托', icon: '🔨', cost: 100,
    desc: '支付人均总财富 的 0.5%，选择一块无主地块进入拍卖（底价半价）。',
    effect: async (game, pid) => {
      const free = game.state.tiles.filter(t => (t.type === 'terrain' || t.type === 'bridge') && t.owner === null && !t.seized)
      if (!free.length) { game.log('没有无主地块'); return }
      await game.pay(pid, cardMoney(game, 0.005), null, '拍卖行委托')
      if (!game.state.players[pid].alive) return
      const t = free.length === 1 ? free[0] : game.state.tiles[
        await game.prompt<number>({
          type: 'choose-tile', title: '拍卖行委托',
          desc: '选择要拍卖的无主地块', tiles: free.map(x => x.index), player: pid, cardId: 'auction-commission',
        })
      ]
      await game.runAuction(t.index, Math.round((t.price / 2) / 10) * 10, {})
    },
  },
  {
    id: 'insurance', name: '购买保险', icon: '🛡️', cost: 200,
    desc: '支付人均总财富 的 1%，接下来 2 轮你的地块受灾害时，损失由银行承担。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.01), null, '购买保险')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.insuredTurns = Math.max(game.state.players[pid].status.insuredTurns, 2)
      }
    },
  },
  {
    id: 'tech-invest', name: '投资科技', icon: '🤖', cost: 500,
    desc: '支付人均总财富 的 2.5%，获得一个随机科技建筑图纸（免费建造）。',
    effect: async (game, pid) => {
      const myTiles = ownerTiles(game, pid).filter(t => t.type === 'terrain' && t.buildings.length < 2)
      if (!myTiles.length) { game.log('没有可建造的地块'); return }
      await game.pay(pid, cardMoney(game, 0.025), null, '投资科技')
      if (!game.state.players[pid].alive) return
      const techs = ['weather-station', 'automation', 'drone-logistics'].filter(tid => {
        const def = BUILDING_DEFS[tid]
        if (!def.maxPerPlayer) return true
        const owned = game.state.tiles.filter(
          t => t.owner === pid && t.buildings.some(b => b.type === tid),
        ).length
        return owned < def.maxPerPlayer
      })
      if (!techs.length) { game.gain(pid, cardMoney(game, 0.025), '科技图纸退款'); return }
      const tid = game.rng.pick(techs)
      const tile = myTiles.length === 1 ? myTiles[0] : game.state.tiles[
        await game.prompt<number>({
          type: 'choose-tile', title: '投资科技',
          desc: `获得图纸：${BUILDING_DEFS[tid].name}，建在哪块地上？`, tiles: myTiles.map(x => x.index), player: pid, cardId: 'tech-invest',
        })
      ]
      // invested 记录真实造价：它参与资产估值与破产半价折现，旧实现写死 500 会严重低估
      tile.buildings.push({ id: newBuildingId(game), type: tid, level: 1, invested: BUILDING_DEFS[tid].cost })
      game.log(`免费建成了${BUILDING_DEFS[tid].icon}${BUILDING_DEFS[tid].name}！`, pid)
    },
  },
  {
    id: 'dump-resources', name: '抛售资源', icon: '📦',
    desc: '立即以市场价卖出你所有指定资源，不压价。',
    effect: async (game, pid) => {
      const p = game.state.players[pid]
      const options = (Object.keys(RESOURCES) as ResourceType[]).filter(r => p.resources[r] > 0)
      if (!options.length) return
      const res = await game.prompt<ResourceType>({
        type: 'choose-resource', title: '抛售资源',
        desc: '选择要全部卖出的资源', options, player: pid,
      })
      const units = p.resources[res]
      const price = game.state.market[res]
      const income = Math.round(units * price)
      p.resources[res] = 0
      p.cash += income
      p.stats.earned += income
      game.log(`「${p.name}」抛售 ${units} 单位${RESOURCES[res].name}，获得 ${income}`, pid)
    },
  },
  {
    id: 'water-invest', name: '投资水利', icon: '💧', cost: 300,
    desc: '支付人均总财富 的 1.5%，你收取的租金 +30%，持续 3 回合。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.015), null, '投资水利')
      if (game.state.players[pid].alive) {
        // turns=N+1：覆盖接下来 3 个完整轮次（个人状态在本回合结束先衰减一次）
        game.state.players[pid].status.rentBonus.push({ factor: 1.3, turns: 4, label: '投资水利' })
      }
    },
  },
  {
    id: 'land-deal', name: '收购地皮', icon: '🏞️', cost: 800,
    desc: '支付人均总财富 的 4%，获得一块你选择的未拥有地块。',
    effect: async (game, pid) => {
      const free = game.state.tiles.filter(t => t.type === 'terrain' && t.owner === null && !t.seized)
      if (!free.length) { game.log('没有无主地块'); return }
      await game.pay(pid, cardMoney(game, 0.04), null, '收购地皮')
      if (!game.state.players[pid].alive) return
      const t = free.length === 1 ? free[0] : game.state.tiles[
        await game.prompt<number>({
          type: 'choose-tile', title: '收购地皮',
          desc: '选择要收购的地块', tiles: free.map(x => x.index), player: pid, cardId: 'land-deal',
        })
      ]
      t.owner = pid
      game.log(`「${game.state.players[pid].name}」获得「${t.name}」`, pid)
    },
  },
  {
    id: 'premium-sale', name: '高价收购', icon: '💎',
    desc: '立即以 1.3 倍市价卖出 5 单位指定资源（若有）。',
    effect: async (game, pid) => {
      const p = game.state.players[pid]
      const options = (Object.keys(RESOURCES) as ResourceType[]).filter(r => p.resources[r] >= 5)
      if (!options.length) return
      const res = await game.prompt<ResourceType>({
        type: 'choose-resource', title: '高价收购',
        desc: '选择要卖出的资源（5 单位，1.3 倍价）', options, player: pid,
      })
      const income = Math.round(5 * game.state.market[res] * 1.3)
      p.resources[res] -= 5
      p.cash += income
      p.stats.earned += income
      game.log(`「${p.name}」以 1.3 倍价卖出 5 单位${RESOURCES[res].name}，获得 ${income}`, pid)
    },
  },
  {
    id: 'energy-saving', name: '节能改造', icon: '💡', cost: 200,
    desc: '支付人均总财富 的 1%，资源产出 +20%，持续 3 回合。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.01), null, '节能改造')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.outputMods.push({ factor: 1.2, turns: 3, label: '节能改造' })
      }
    },
  },
  {
    id: 'hire-workers', name: '雇佣劳工', icon: '👷', cost: 150,
    desc: '支付人均总财富 的 0.8%，资源产出 +30%，持续 2 回合。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.008), null, '雇佣劳工')
      if (game.state.players[pid].alive) {
        game.state.players[pid].status.outputMods.push({ factor: 1.3, turns: 2, label: '雇佣劳工' })
      }
    },
  },
  {
    id: 'informant', name: '情报贩子', icon: '🕵️', cost: 150,
    desc: '支付人均总财富 的 0.8%，免费勘探你所有未勘探地块。',
    effect: async (game, pid) => {
      const unk = ownerTiles(game, pid).filter(t => t.type === 'terrain' && !t.explored)
      if (!unk.length) { game.log('没有待勘探地块'); return }
      await game.pay(pid, cardMoney(game, 0.008), null, '情报贩子')
      if (!game.state.players[pid].alive) return
      for (const t of unk) {
        t.explored = true
        t.reserve = rollReserve(game)
      }
      game.log(`情报贩子揭示了 ${unk.length} 块地块的储量`, pid)
    },
  },
  {
    id: 'bodyguard', name: '保镖护送', icon: '💂', cost: 300,
    desc: '支付人均总财富 的 1.5%，被举报成功率 -20%，持续 3 轮。',
    effect: async (game, pid) => {
      await game.pay(pid, cardMoney(game, 0.015), null, '保镖护送')
      if (game.state.players[pid].alive) {
        const p = game.state.players[pid]
        p.status.antitrustMod -= 0.2
        p.status.antitrustTurns = Math.max(p.status.antitrustTurns, 3)
      }
    },
  },
  {
    id: 'repair-crew', name: '维修队', icon: '🔧', cost: 250,
    desc: '支付人均总财富 的 1.2%，免费修理你的一座受损建筑。',
    effect: async (game, pid) => {
      // 只修复「受损待修」建筑（damaged），不能把完好低级建筑当成修理目标白升一级
      const hasTarget = ownerTiles(game, pid).some(t => t.buildings.some(b => b.damaged))
      if (!hasTarget) { game.log('没有受损建筑'); return }
      await game.pay(pid, cardMoney(game, 0.012), null, '维修队')
      if (!game.state.players[pid].alive) return
      // 现金不足支付会强制变卖拆除建筑（pay 内部路径），必须按支付后的状态重新选取
      const damaged = ownerTiles(game, pid).filter(t => t.buildings.some(b => b.damaged))
      if (!damaged.length) { game.log('维修队抵达，但建筑已因变卖拆除', pid); return }
      const t = game.rng.pick(damaged)
      const b = t.buildings.find(x => x.damaged)!
      b.damaged = false   // 与全局修理语义一致：只恢复收益，不提升等级
      game.log(`维修队修复了「${t.name}」的${BUILDING_DEFS[b.type].name}，恢复收益`, pid)
    },
  },
  {
    id: 'sabotage', name: '破坏建筑', icon: '💣', cost: 400,
    desc: '支付人均总财富 的 2%，指定对手的一座建筑降 1 级（1 级建筑受损停摆）。',
    effect: async (game, pid) => {
      const s = game.state
      await game.pay(pid, cardMoney(game, 0.02), null, '破坏建筑')
      if (!s.players[pid].alive) return
      // 支付可能触发强制变卖，按当前状态重新找目标
      const targets = s.tiles.filter(
        t => t.owner !== null && t.owner !== pid && t.buildings.length > 0,
      )
      if (!targets.length) { game.log('没有可破坏的对手建筑', pid); return }
      let t: Tile
      if (s.players[pid].isAI) {
        // AI 挑总资产最高的对手中投入最大的建筑地块
        const leader = s.players
          .filter(p => p.alive && p.id !== pid)
          .sort((a, b) => totalValue(game, b.id) - totalValue(game, a.id))[0]
        const opts = targets.filter(x => x.owner === leader?.id)
        t = (opts.length ? opts : targets).sort(
          (a, b) =>
            b.buildings.reduce((x, y) => x + y.invested, 0) - a.buildings.reduce((x, y) => x + y.invested, 0),
        )[0]
      } else {
        const idx = await game.prompt<number>({
          type: 'choose-tile', title: '破坏建筑',
          desc: '选择要破坏的对手建筑地块（建筑降 1 级）',
          tiles: targets.map(x => x.index), player: pid, cardId: 'sabotage',
        })
        t = s.tiles[idx]
      }
      if (!t || t.owner === null || t.owner === pid || t.buildings.length === 0) {
        game.log('破坏目标已失效', pid)
        return
      }
      const b = game.rng.pick(t.buildings)
      if (b.level === 1) {
        b.damaged = true   // 1 级建筑受损停摆（产出/租金归零，需修理）
      } else {
        b.level = (b.level - 1) as 1 | 2 | 3
      }
      game.log(`「${s.players[pid].name}」破坏了「${s.players[t.owner as number].name}」在「${t.name}」的建筑！`, pid)
      game.sfx('fire')
      game.markChanged()
    },
  },
  {
    id: 'steal-resources', name: '偷取资源', icon: '🎭', cost: 300,
    desc: '支付人均总财富 的 1.5%，随机获得对手某种资源的 30%。',
    effect: async (game, pid) => {
      const s = game.state
      await game.pay(pid, cardMoney(game, 0.015), null, '偷取资源')
      if (!s.players[pid].alive) return
      const others = s.players.filter(p =>
        p.alive && p.id !== pid && (Object.keys(RESOURCES) as ResourceType[]).some(r => p.resources[r] > 0),
      )
      if (!others.length) { game.log('没有可偷取的资源', pid); return }
      const victim = game.rng.pick(others)
      const options = (Object.keys(RESOURCES) as ResourceType[]).filter(r => victim.resources[r] > 0)
      const r = game.rng.pick(options)
      const units = Math.max(1, Math.floor(victim.resources[r] * 0.3))
      victim.resources[r] -= units
      s.players[pid].resources[r] += units
      game.log(`「${s.players[pid].name}」从「${victim.name}」处偷取了 ${units} 单位${RESOURCES[r].name}！`, pid)
      game.sfx('card')
      game.markChanged()
    },
  },
  {
    id: 'roadblock', name: '放置路障', icon: '🚧', cost: 300,
    desc: '支付人均总财富 的 1.5%，在任意格子放置路障，下一个经过的玩家被拦住停住（路障消失）。',
    effect: async (game, pid) => {
      const s = game.state
      if (s.roadblock !== null) { game.log('场上已有路障，无法再放置', pid); return }
      await game.pay(pid, cardMoney(game, 0.015), null, '放置路障')
      if (!s.players[pid].alive) return
      let idx: number
      if (s.players[pid].isAI) {
        // AI 放在总资产最高的对手前进方向 2~10 格处
        const rivals = s.players.filter(p => p.alive && p.id !== pid)
        const target = rivals.sort((a, b) => totalValue(game, b.id) - totalValue(game, a.id))[0] ?? s.players[pid]
        idx = (target.pos + game.rng.int(2, 10)) % TILE_COUNT
      } else {
        idx = await game.prompt<number>({
          type: 'choose-tile', title: '放置路障',
          desc: '选择放置路障的格子（下一个经过的玩家停住）',
          tiles: s.tiles.map(t => t.index), player: pid, cardId: 'roadblock',
        })
      }
      s.roadblock = idx
      game.log(`「${s.players[pid].name}」在「${s.tiles[idx].name}」放置了路障！`, pid)
      game.markChanged()
    },
  },
  {
    id: 'incite-defection', name: '策反地块', icon: '🕊️', cost: 600,
    desc: '支付人均总财富 的 3%，迫使对手与你交换一块同地形地块（建筑随地块移交）。',
    effect: async (game, pid) => {
      const s = game.state
      await game.pay(pid, cardMoney(game, 0.03), null, '策反地块')
      if (!s.players[pid].alive) return
      const their = s.tiles.filter(t => t.type === 'terrain' && t.owner !== null && t.owner !== pid)
      if (!their.length) { game.log('没有可策反的对手地块', pid); return }
      let t: Tile
      if (s.players[pid].isAI) {
        // AI 挑总资产最高的对手最值钱的地块
        const leader = s.players
          .filter(p => p.alive && p.id !== pid)
          .sort((a, b) => totalValue(game, b.id) - totalValue(game, a.id))[0]
        const opts = their.filter(x => x.owner === leader?.id)
        t = (opts.length ? opts : their).sort((a, b) => b.price - a.price)[0]
      } else {
        const idx = await game.prompt<number>({
          type: 'choose-tile', title: '策反地块',
          desc: '选择要策反的对手地块（对方被迫交换）',
          tiles: their.map(x => x.index), player: pid, cardId: 'incite-defection',
        })
        t = s.tiles[idx]
      }
      if (!t || t.owner === null || t.owner === pid) { game.log('策反目标已失效', pid); return }
      // 自己的同地形地块
      const mine = s.tiles.filter(x => x.type === 'terrain' && x.owner === pid && x.terrain === t.terrain)
      if (!mine.length) { game.log('你没有同地形地块可交换', pid); return }
      let u: Tile
      if (s.players[pid].isAI) {
        u = mine.sort((a, b) => a.price - b.price)[0]   // 交出最不值钱的
      } else {
        const idx2 = await game.prompt<number>({
          type: 'choose-tile', title: '策反地块',
          desc: `选择你用来交换的同地形地块（与「${t.name}」交换）`,
          tiles: mine.map(x => x.index), player: pid, cardId: 'incite-defection',
        })
        u = s.tiles[idx2]
      }
      if (!u || u.owner !== pid) { game.log('交换地块无效', pid); return }
      const foe = t.owner as number
      t.owner = pid
      u.owner = foe
      game.log(`「${s.players[pid].name}」策反成功：与「${s.players[foe].name}」交换了「${t.name}」和「${u.name}」！`, pid)
      game.sfx('card')
      game.markChanged()
    },
  },
]
