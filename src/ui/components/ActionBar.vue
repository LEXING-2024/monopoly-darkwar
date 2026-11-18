<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { store } from '../store'
import { ANTITRUST, BRIDGES, BRIDGE_PRICING, MARKET_MANIPULATION, MONOPOLY_WIN, RESOURCES, RESOURCE_ORDER } from '../../core/config'
import { monopolyInfo, monopolyTargets } from '../../core/events'
import type { ResourceType, TradeOffer } from '../../core/types'
import Icon from './Icon.vue'

const s = computed(() => store.state)
const game = computed(() => store.game)
const me = computed(() => (s.value ? s.value.players[s.value.currentPlayer] : null))
const cur = computed(() => (s.value ? s.value.players[s.value.currentPlayer] : null))
const PHASE_LABEL: Record<string, string> = {
  order: '决定顺序', spin: '转动转盘', move: '移动中', landing: '落地结算', action: '行动决策',
}
const phaseLabel = computed(() => (s.value ? PHASE_LABEL[s.value.phase] ?? '对局进行中' : '对局进行中'))
const myTurn = computed(() =>
  !!s.value && !!me.value && !me.value.isAI &&
  s.value.phase === 'action' &&
  (!store.prompt || store.prompt.type === 'action'),
)
/** 达到垄断线、可被举报的玩家（失败保护期内不可举报） */
const reportTargets = computed(() => {
  if (!game.value || !me.value) return []
  return monopolyTargets(game.value, me.value.id).map(id => {
    const m = monopolyInfo(game.value!, id)
    return { id, ...m }
  })
})
const lobbyLevel = computed(() => {
  const mod = me.value?.status.antitrustMod ?? 0
  return Math.max(0, -Math.round(mod / 0.1))
})

// ---- 卖资源 ----
const sell = reactive({ res: 'wood' as ResourceType, units: 1 })
const sellableRes = computed(() =>
  me.value ? RESOURCE_ORDER.filter(r => me.value!.resources[r] > 0) : [],
)
// 某种资源卖光后，下拉选项会消失；把选中项拉回仍持有的资源，避免按钮对空库存无效
watch(sellableRes, list => {
  if (list.length && !list.includes(sell.res)) sell.res = list[0]
})

// ---- 交易 ----
const tradeOpen = ref(false)
const trade = reactive({
  target: 1,
  myCash: 0,
  myTiles: [] as number[],
  myRes: {} as Record<string, number>,
  myResPick: {} as Record<string, boolean>,
  theirCash: 0,
  theirTiles: [] as number[],
  theirRes: {} as Record<string, number>,
  theirResPick: {} as Record<string, boolean>,
})
const tradeTargets = computed(() =>
  s.value ? s.value.players.filter(p => p.alive && p.id !== me.value?.id) : [],
)
const myTileList = computed(() => (s.value ? s.value.tiles.filter(t => t.owner === me.value?.id) : []))
const theirTileList = computed(() =>
  s.value ? s.value.tiles.filter(t => t.owner === trade.target) : [],
)
// 切换交易对象时清空上一家已选的资产，避免把 A 的地块带到 B 的报价里
watch(() => trade.target, () => {
  trade.theirTiles = []
  trade.theirRes = {}
  trade.theirResPick = {}
})

function shortName(name: string): string {
  const m = name.match(/·(\d+)号地/)
  if (m) return `${name.slice(0, name.indexOf('·'))}${m[1]}`
  return name
}

function openTrade(): void {  trade.target = tradeTargets.value[0]?.id ?? 1
  trade.myCash = 0
  trade.myTiles = []
  trade.myRes = {}
  trade.myResPick = {}
  trade.theirCash = 0
  trade.theirTiles = []
  trade.theirRes = {}
  trade.theirResPick = {}
  tradeOpen.value = true
}

/** 数字输入防 NaN：v-model.number 对非法输入（如 "e"）返回原始字符串，
 *  统一收敛为非负有限整数，非法收敛为 0 */
function num(v: unknown): number {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** 交易估值合计：现金 + 地块价格 + 资源市价 */
function tradeValue(tiles: number[], res: Record<string, number>, cash: number): number {
  const st = s.value
  if (!st) return num(cash)
  let v = num(cash)
  for (const i of tiles) {
    const t = st.tiles[i]
    // 建筑随地块移交，估值与 AI / 交易确认弹窗保持同一口径
    if (t) v += t.price + t.buildings.reduce((a, b) => a + b.invested, 0)
  }
  for (const r of RESOURCE_ORDER) v += num(res[r]) * st.market[r]
  return Math.round(v)
}
const tradeSummary = computed(() => {
  const give = tradeValue(trade.myTiles, trade.myRes, trade.myCash)
  const receive = tradeValue(trade.theirTiles, trade.theirRes, trade.theirCash)
  return { give, receive }
})
/** 提交前校验：避免 proposeTrade 静默拒绝后弹窗直接关闭、玩家不知道哪里填错了 */
const tradeError = computed(() => {
  if (!s.value || !me.value) return ''
  if (num(trade.myCash) > me.value.cash) return '你给出的现金超过持有'
  const target = s.value.players[trade.target]
  if (!target) return '交易对象无效'
  if (trade.myTiles.some(i => s.value!.tiles[i].owner !== me.value!.id)) return '你选择的地块已不属于你'
  if (trade.theirTiles.some(i => s.value!.tiles[i].owner !== target.id)) return '对方已不再拥有所选地块'
  if (num(trade.theirCash) > target.cash) return '对方现金不足'
  for (const r of RESOURCE_ORDER) {
    if (trade.myResPick[r] && num(trade.myRes[r]) > Math.floor(me.value.resources[r])) {
      return `你给出的${RESOURCES[r].name}不足`
    }
    if (trade.theirResPick[r] && num(trade.theirRes[r]) > Math.floor(target.resources[r])) {
      return `对方${RESOURCES[r].name}不足`
    }
  }
  return ''
})

function toggle(arr: number[], v: number): void {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}

async function submitTrade(): Promise<void> {
  if (tradeError.value) return
  const pick = (res: Record<string, number>, sel: Record<string, boolean>): Record<string, number> =>
    Object.fromEntries(RESOURCE_ORDER.filter(r => sel[r]).map(r => [r, num(res[r])]))
  const give: TradeOffer = {
    tiles: trade.myTiles, cash: num(trade.myCash),
    resources: pick(trade.myRes, trade.myResPick),
  }
  const receive: TradeOffer = {
    tiles: trade.theirTiles, cash: num(trade.theirCash),
    resources: pick(trade.theirRes, trade.theirResPick),
  }
  await game.value?.proposeTrade(trade.target, give, receive)
  tradeOpen.value = false
}

// ---- 举报 / 游说 / 市场操纵 ----
const reportOpen = ref(false)
const lobbyOpen = ref(false)
const marketOpen = ref(false)
/** 我当前可操纵的资源（份额达门槛） */
const manipulable = computed(() => {
  if (!game.value || !me.value) return []
  return game.value.manipulableResources(me.value.id).map(r => ({
    res: r,
    share: game.value!.resourceShare(me.value!.id, r),
  }))
})
const marketLeft = computed(() => s.value?.ops.market ?? 0)
/** 已达垄断线（70%）的资源——可断供（掐对手现金流），比 50% 的定价权更高一档 */
const blockable = computed(() => {
  if (!game.value || !me.value) return []
  return (RESOURCE_ORDER as readonly ResourceType[])
    .filter(r => game.value!.resourceShare(me.value!.id, r) >= MONOPOLY_WIN.terrainRatio)
    .map(r => ({ res: r, share: game.value!.resourceShare(me.value!.id, r) }))
})
const bridgePriceLeft = computed(() => s.value?.ops.bridgePrice ?? 0)
/** 我拥有的、可提价的桥（已升级且有收费、未关闭） */
const myBridges = computed(() => {
  if (!s.value || !me.value) return []
  return s.value.tiles
    .filter(t => t.type === 'bridge' && t.owner === me.value!.id && t.bridgeLevel >= BRIDGE_PRICING.minLevel && t.bridgeClosed <= 0)
    .map(t => {
      const cfg = BRIDGES[t.index as 18 | 53]
      return { index: t.index, name: t.name, level: t.bridgeLevel, toll: cfg ? cfg.tolls[t.bridgeLevel] : 0 }
    })
})

function doSell(): void {
  const units = Math.min(sell.units, me.value?.resources[sell.res] ?? 0)
  if (units > 0) game.value?.sellResources(sell.res, units)
}

/** 等待窗口：当前行动者是 AI 时在视野中上方（顶部状态栏下方）悬浮显示 */const waiting = computed(() => {
  if (!s.value || !me.value) return null
  if (!me.value.isAI || !me.value.alive) return null
  if (!['spin', 'move', 'landing', 'action'].includes(s.value.phase)) return null
  const phaseText: Record<string, string> = {
    spin: '转动转盘', move: '移动中', landing: '落地结算', action: '行动决策',
  }
  return { name: me.value.name, color: me.value.color, phaseText: phaseText[s.value.phase] ?? '' }
})

</script>

<template>
  <!-- 行动卡片：常驻面板；非己回合显示等待状态，避免右侧留出大片空白 -->
  <div v-if="s && me" class="paper card action-card">
    <div class="card-head">
      <span class="ch-icon"><Icon name="dice" :size="14" /></span>
      <b>行动</b>
      <span class="ch-rule" />
      <span class="ch-meta">{{ myTurn ? '轮到你' : '等待中' }}</span>
    </div>
    <template v-if="myTurn">
      <!-- 行动入口：四块纸牌 -->
      <div class="action-grid">
        <button class="action-tile trade" @click="openTrade">
          <span class="at-icon"><Icon name="trade" :size="17" /></span>
          <span class="at-text"><b>交易</b><i>地块 · 现金 · 资源</i></span>
        </button>
        <button class="action-tile report" @click="reportOpen = !reportOpen">
          <span class="at-icon"><Icon name="report" :size="17" /></span>
          <span class="at-text"><b>反垄断</b><i>举报垄断者</i></span>
        </button>
        <button class="action-tile lobby" @click="lobbyOpen = !lobbyOpen">
          <span class="at-icon"><Icon name="briefcase" :size="17" /></span>
          <span class="at-text"><b>游说</b><i>降低被举报率</i></span>
        </button>
        <button
          v-if="manipulable.length || myBridges.length" class="action-tile market"
          :class="{ spent: marketLeft <= 0 && bridgePriceLeft <= 0 }"
          @click="marketOpen = !marketOpen"
        >
          <span class="at-icon"><Icon name="trade" :size="17" /></span>
          <span class="at-text">
            <b>垄断手段</b>
            <i>{{ blockable.length ? '断供 · 定价 · 设卡' : manipulable.length ? '资源限产 · 价格战' : '桥梁提价设卡' }}</i>
          </span>
        </button>
        <button class="action-tile danger resign" @click="game?.resign()">
          <span class="at-icon"><Icon name="flag" :size="17" /></span>
          <span class="at-text"><b>认输</b><i>退出本局</i></span>
        </button>
      </div>

      <!-- 举报菜单（主动举报制：垄断线 + 联合举报成功率） -->
      <div v-if="reportOpen && myTurn" class="submenu">
        <template v-if="reportTargets.length">
          <div class="menu-tip">举报费 ￥{{ ANTITRUST.reportCost }}/人 · 1人 40% / 2人 70% / 3人+ 90%（AI 可能联合）</div>
          <button
            v-for="t in reportTargets" :key="t.id"
            class="btn small" @click="game?.reportTarget(t.id); reportOpen = false"
          >举报 {{ s.players[t.id].name }}
            <span class="menu-meta">
              单类 {{ Math.round(t.singleRatio * 100) }}% · 全局 {{ Math.round(t.globalRatio * 100) }}% · 桥{{ t.bridges }}
            </span>
          </button>
        </template>
        <div v-else class="menu-tip">暂无玩家达到垄断线（单类地形≥70% / 全局≥50% / 双桥）</div>
        <button class="btn small" @click="reportOpen = false">取消</button>
      </div>

      <!-- 游说菜单（垄断者降低被举报成功率） -->
      <div v-if="lobbyOpen && myTurn" class="submenu">
        <div class="menu-tip">当前游说等级：{{ lobbyLevel }}/3（被举报成功率 -{{ lobbyLevel * 10 }}%）</div>
        <button
          v-for="lv in [1, 2, 3] as const" :key="lv"
          class="btn small" :disabled="lobbyLevel >= 3 || me.cash < ANTITRUST.lobby[lv - 1].cost"
          @click="game?.lobbySelf(lv); lobbyOpen = false"
        >游说 {{ lv }} 级（￥{{ ANTITRUST.lobby[lv - 1].cost }}，成功率 -{{ lv * 10 }}%）</button>
        <button class="btn small" @click="lobbyOpen = false">取消</button>
      </div>

      <!-- 垄断手段菜单（资源定价 + 桥梁设卡） -->
      <div v-if="marketOpen && myTurn" class="submenu">
        <template v-if="manipulable.length">
          <div class="menu-tip">资源定价：持有 ≥{{ MARKET_MANIPULATION.minShare * 100 }}% 的可操纵，每回合 1 次，影响全桌</div>
          <template v-if="marketLeft > 0">
            <div v-for="m in manipulable" :key="m.res" class="market-group">
              <div class="market-group-title">{{ RESOURCES[m.res].icon }} {{ RESOURCES[m.res].name }}（份额 {{ Math.round(m.share * 100) }}%）</div>
              <button
                class="btn small" :disabled="me.cash < MARKET_MANIPULATION.limitCost"
                @click="game?.manipulateMarket(m.res, 'limit'); marketOpen = false"
              >限产抬价（￥{{ MARKET_MANIPULATION.limitCost }}，市价 +{{ (MARKET_MANIPULATION.limitFactor - 1) * 100 }}%，持有者受益）</button>
              <button
                class="btn small danger" :disabled="me.cash < MARKET_MANIPULATION.warCost"
                @click="game?.manipulateMarket(m.res, 'war'); marketOpen = false"
              >价格战（￥{{ MARKET_MANIPULATION.warCost }}，市价 {{ (MARKET_MANIPULATION.warFactor - 1) * 100 }}%，打击卖家·会结仇）</button>
            </div>
          </template>
          <div v-else class="menu-tip">本回合的资源操纵次数已用完</div>
        </template>

        <template v-if="blockable.length">
          <div class="menu-tip">断供（达 {{ MONOPOLY_WIN.terrainRatio * 100 }}% 垄断线）：封锁销路，其他人卖该资源只能拿半价——用于掐断对手现金流</div>
          <template v-if="marketLeft > 0">
            <div v-for="b in blockable" :key="'b' + b.res" class="market-group">
              <div class="market-group-title">{{ RESOURCES[b.res].icon }} {{ RESOURCES[b.res].name }}（份额 {{ Math.round(b.share * 100) }}%）</div>
              <button
                class="btn small danger" :disabled="me.cash < MARKET_MANIPULATION.dumpCost"
                @click="game?.blockSupply(b.res); marketOpen = false"
              >断供（￥{{ MARKET_MANIPULATION.dumpCost }}，他人卖价 ×{{ MARKET_MANIPULATION.dumpFactor }}，持续 {{ MARKET_MANIPULATION.dumpTurns }} 轮）</button>
            </div>
          </template>
          <div v-else class="menu-tip">本回合的操纵次数已用完</div>
        </template>

        <template v-if="myBridges.length">
          <div class="menu-tip">桥梁设卡：提高自己那座桥的过路费，对手可绕行 3 步回避</div>
          <template v-if="bridgePriceLeft > 0">
            <div v-for="b in myBridges" :key="b.index" class="market-group">
              <div class="market-group-title">🌉 {{ b.name }}（{{ b.level }} 级，现收 ￥{{ b.toll }}）</div>
              <button
                class="btn small danger" :disabled="me.cash < BRIDGE_PRICING.cost"
                @click="game?.priceBridge(b.index); marketOpen = false"
              >提价 {{ Math.round((BRIDGE_PRICING.factor - 1) * 100) }}%（￥{{ BRIDGE_PRICING.cost }}，持续 {{ BRIDGE_PRICING.duration }} 轮）</button>
            </div>
          </template>
          <div v-else class="menu-tip">本回合的提价次数已用完</div>
        </template>

        <button class="btn small" @click="marketOpen = false">取消</button>
      </div>

      <!-- 卖资源 -->
      <div v-if="myTurn && sellableRes.length" class="sell-row">
        <select v-model="sell.res" class="mini-input">
          <option v-for="r in sellableRes" :key="r" :value="r">
            {{ RESOURCES[r].name }} ×{{ Math.floor(me.resources[r]) }}（单价 ￥{{ s.market[r] }}）
          </option>
        </select>
        <input v-model.number="sell.units" type="number" min="1" class="mini-input units" />
        <button class="btn small" @click="doSell"><Icon name="coin" :size="13" /> 卖出</button>
      </div>

      <!-- 交易弹窗 -->
      <div v-if="tradeOpen" class="trade-overlay">
        <div class="paper trade-card">
          <div class="trade-head"><Icon name="trade" :size="16" /> 与谁交易？
            <select v-model="trade.target" class="mini-input">
              <option v-for="p in tradeTargets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="trade-cols">
            <!-- 我给出 -->
            <div class="trade-col">
              <div class="col-title">我给出</div>
              <label class="cash-row"><Icon name="coin" :size="13" /> 现金
                <input v-model.number="trade.myCash" type="number" min="0" class="mini-input units" />
              </label>
              <div class="row-title">地块</div>
              <label v-for="t in myTileList" :key="t.index" class="trade-row">
                <input type="checkbox" class="paper-check" :checked="trade.myTiles.includes(t.index)" @change="toggle(trade.myTiles, t.index)" />
                <span class="row-name">{{ shortName(t.name) }}</span>
                <span class="row-meta">￥{{ t.price }}<i v-if="t.buildings.length" class="bldg"><Icon name="building" :size="10" />{{ t.buildings.length }}</i></span>
              </label>
              <div class="row-title">资源</div>
              <label v-for="r in RESOURCE_ORDER" :key="'m' + r" class="trade-row">
                <input type="checkbox" class="paper-check" v-model="trade.myResPick[r]" />
                <span class="row-name" :class="`res-${r}`"><Icon :name="r" :size="13" /> {{ RESOURCES[r].name }}</span>
                <input
                  v-model.number="(trade.myRes[r] as any)" type="number" min="0"
                  :disabled="!trade.myResPick[r]" class="mini-input units" placeholder="0"
                />
                <span class="row-meta">有 {{ Math.floor(me.resources[r]) }}</span>
              </label>
            </div>
            <!-- 对方给出 -->
            <div class="trade-col">
              <div class="col-title">对方给出</div>
              <label class="cash-row"><Icon name="coin" :size="13" /> 现金
                <input v-model.number="trade.theirCash" type="number" min="0" class="mini-input units" />
              </label>
              <div class="row-title">地块</div>
              <label v-for="t in theirTileList" :key="t.index" class="trade-row">
                <input type="checkbox" class="paper-check" :checked="trade.theirTiles.includes(t.index)" @change="toggle(trade.theirTiles, t.index)" />
                <span class="row-name">{{ shortName(t.name) }}</span>
                <span class="row-meta">￥{{ t.price }}<i v-if="t.buildings.length" class="bldg"><Icon name="building" :size="10" />{{ t.buildings.length }}</i></span>
              </label>
              <div class="row-title">资源</div>
              <label v-for="r in RESOURCE_ORDER" :key="'t' + r" class="trade-row">
                <input type="checkbox" class="paper-check" v-model="trade.theirResPick[r]" />
                <span class="row-name" :class="`res-${r}`"><Icon :name="r" :size="13" /> {{ RESOURCES[r].name }}</span>
                <input
                  v-model.number="(trade.theirRes[r] as any)" type="number" min="0"
                  :disabled="!trade.theirResPick[r]" class="mini-input units" placeholder="0"
                />
              </label>
            </div>
          </div>
          <div class="trade-summary">
            <span>我给出 ≈ <b>￥{{ tradeSummary.give }}</b></span>
            <span class="vs">⇄</span>
            <span>对方给出 ≈ <b>￥{{ tradeSummary.receive }}</b></span>
            <span
              class="balance"
              :class="{ good: tradeSummary.receive >= tradeSummary.give, bad: tradeSummary.receive < tradeSummary.give }"
            >{{ tradeSummary.receive >= tradeSummary.give ? '对方可能接受' : '对方可能拒绝' }}</span>
          </div>
          <div class="trade-actions">
            <span v-if="tradeError" class="trade-error">{{ tradeError }}</span>
            <button class="btn primary" :disabled="!!tradeError" @click="submitTrade">提出交易</button>
            <button class="btn" @click="tradeOpen = false">取消</button>
          </div>
        </div>
      </div>
    </template>
    <div v-else class="waiting-card">
      <span class="wait-orbit"><Icon name="compass" :size="26" /></span>
      <b>{{ myTurn ? '轮到你行动' : cur ? `等待 ${cur.name} 行动` : '等待行动' }}</b>
      <i>{{ phaseLabel }} · 先观察市场与地块</i>
      <span class="wait-tip"><Icon name="hourglass" :size="12" /> 资源价格、桥梁与地形垄断都会影响终局</span>
    </div>
  </div>

</template>

<style scoped>
.action-card { padding: 9px 12px 11px; }
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
  margin-bottom: 7px;
  border-bottom: 1px solid rgba(160, 120, 60, 0.3);
}
.ch-icon {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  color: var(--brass-3);
  border: 1px solid rgba(138, 95, 31, 0.45);
  background: rgba(255, 248, 226, 0.55);
}
.card-head b { font-size: 13px; color: var(--ink); letter-spacing: 2px; }
.ch-rule { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(138, 95, 31, 0.35), transparent); }
.ch-meta { font-size: 9.5px; color: var(--ink-4); letter-spacing: 1px; }
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.action-tile {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 7px 8px;
  text-align: left;
  cursor: pointer;
  color: var(--ink);
  border: 1px solid rgba(138, 95, 31, 0.42);
  border-radius: 8px;
  background-image:
    var(--tex-paper),
    linear-gradient(180deg, #fbf2d9, #eedcae);
  background-size: 180px 180px, auto;
  box-shadow: inset 0 1px 0 rgba(255, 253, 244, 0.7), 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: transform 0.1s ease, filter 0.12s ease;
  font-family: inherit;
}
.action-tile:hover { filter: brightness(1.045); transform: translateY(-1px); }
.action-tile:active { transform: translateY(1px); }
.at-icon {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  color: var(--brass-3);
  border: 1px solid rgba(138, 95, 31, 0.35);
  background: radial-gradient(circle at 35% 30%, #fffaf0, #eeddb6);
}
.at-text { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.at-text b { font-size: 12.5px; letter-spacing: 1px; white-space: nowrap; }
.at-text i { font-style: normal; font-size: 9.5px; color: var(--ink-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.action-tile { --act: #8a5f1f; --act-bg: #f6e8c4; --act-line: rgba(138, 95, 31, 0.4); border-left: 3px solid var(--act-line); }
.action-tile.trade { --act: #2e6a46; --act-bg: #e3f0dd; --act-line: #4f8a62; }
.action-tile.report { --act: #a53a2b; --act-bg: #f6e0d6; --act-line: #b65b48; }
.action-tile.lobby { --act: #6a4a8f; --act-bg: #ebe1f2; --act-line: #8b6dab; }
.action-tile.market { --act: #8a5a12; --act-bg: #f6e9c4; --act-line: #b8872c; }
.action-tile.market.spent { opacity: 0.55; filter: grayscale(0.4); }
.market-group { margin: 6px 0; padding-bottom: 5px; border-bottom: 1px dotted rgba(138,95,31,0.35); }
.market-group:last-of-type { border-bottom: 0; }
.market-group-title { font-size: 12px; font-weight: bold; color: #6a4a18; margin-bottom: 4px; }
.market-group .btn { margin: 2px 0; }
.action-tile.danger, .action-tile.resign { color: #7c2118; border-color: rgba(140, 54, 40, 0.42); background-image: var(--tex-paper), linear-gradient(180deg, #f8e4d8, #edc8b8); --act: #8c2a1f; --act-bg: #fae6dc; --act-line: #a94a36; }
.at-icon { color: var(--act); border-color: var(--act-line); background: radial-gradient(circle at 36% 30%, #fffdf6, var(--act-bg)); }
.action-tile:hover { border-left-color: var(--act); }
.waiting-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 3px;
  padding: 10px 4px 6px;
}
.wait-orbit {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: var(--brass-3);
  border: 1px dashed rgba(138, 95, 31, 0.45);
  background: radial-gradient(circle at 40% 34%, rgba(255, 248, 226, 0.75), rgba(232, 208, 154, 0.35));
  animation: orbit 12s linear infinite;
  margin-bottom: 3px;
}
@keyframes orbit { to { transform: rotate(360deg); } }
.waiting-card b { font-size: 13px; color: var(--ink); letter-spacing: 1px; }
.waiting-card i { font-style: normal; font-size: 10.5px; color: var(--ink-3); }
.wait-tip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  padding: 2px 7px;
  font-size: 9.5px;
  color: var(--ink-4);
  border: 1px dashed rgba(138, 95, 31, 0.3);
  border-radius: 6px;
}
/* AI 行动中悬浮窗口：固定在视野中上方（顶部状态栏下方） */
.waiting-window {
  position: fixed;
  left: 50%;
  top: 58px;
  transform: translateX(-50%);
  z-index: 120;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 18px;
  border: 1.5px solid var(--brass-3);
  border-radius: 11px;
  color: var(--ink);
  background-image:
    radial-gradient(ellipse 120px 40px at 24% 0%, rgba(255, 250, 232, 0.5), transparent 70%),
    var(--tex-paper),
    linear-gradient(168deg, #f8ebc8 0%, #eed9a6 55%, #e4cc93 100%);
  background-size: auto, 340px 340px, auto;
  box-shadow:
    inset 0 0 14px rgba(94, 58, 14, 0.18),
    var(--shadow-md);
  pointer-events: none;
  animation: waitIn 0.25s ease-out, waitPulse 1.8s ease-in-out 0.25s infinite;
}
.w-dot {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  flex: none;
}
.w-text { display: inline-flex; align-items: center; gap: 4px; font-size: 13.5px; color: var(--ink); white-space: nowrap; }
@keyframes waitIn { from { opacity: 0; transform: translate(-50%, -8px); } }
@keyframes waitPulse { 50% { filter: brightness(1.05); } }
.hint { font-size: 12px; color: #a08860; padding: 4px 0; }
.tile-detail { border-top: 1px dashed #c9b28a; padding-top: 6px; margin-top: 2px; }
.td-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.rent { color: var(--rise-ink); font-weight: 700; font-size: 13px; }
.td-sub { font-size: 12px; color: #6a4a28; margin-top: 2px; }
.td-bldgs { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
.td-bldg { font-size: 12px; color: #4a3018; display: flex; align-items: center; gap: 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.submenu {
  margin-top: 8px; padding: 9px;
  color: var(--ink);
  background-image:
    radial-gradient(ellipse 120px 60px at 16% 0%, rgba(255, 250, 232, 0.4), transparent 70%),
    var(--tex-paper),
    linear-gradient(168deg, #f6e8c0 0%, #eed9a6 100%);
  background-size: auto, 320px 320px, auto;
  border: 1.5px solid rgba(138, 101, 52, 0.8);
  border-radius: 9px; display: flex; flex-wrap: wrap; gap: 5px;
  box-shadow: inset 0 0 14px rgba(94, 58, 14, 0.18);
}
.sell-row { display: flex; gap: 6px; margin-top: 8px; align-items: center; flex-wrap: wrap; }
/* 手机端：资源下拉占满整行，数量输入+卖出按钮另起一行，无需横向滑动 */
html.is-mobile .sell-row > select { flex: 1 1 100%; }
html.is-mobile .sell-row .units { flex: 1 1 auto; min-width: 60px; }
.buy-btn { animation: buyGlow 1.6s ease-in-out infinite; }
@keyframes buyGlow { 50% { box-shadow: 0 0 10px rgba(217, 165, 61, 0.8); } }
.buy-btn.buy-warn {
  color: #ffe0c0;
  border-color: #8a3a1a;
  background-image:
    radial-gradient(ellipse 60% 42% at 22% 6%, rgba(255, 216, 190, 0.32), transparent 72%),
    linear-gradient(180deg, #c27a3a 0%, #9a5a20 60%, #7d4510 100%);
  animation: warnPulse 1.2s ease-in-out infinite;
}
@keyframes warnPulse { 50% { box-shadow: 0 0 12px rgba(220, 110, 60, 0.85); } }
.menu-tip { font-size: 12px; color: #6a4a28; width: 100%; margin-bottom: 2px; }
.menu-meta { font-size: 11px; color: #8a6a44; margin-left: 6px; }
.btn.small:disabled { opacity: 0.5; cursor: not-allowed; }
.mini-input {
  padding: 5px 8px; border-radius: 6px; border: 1.5px solid var(--brass-3);
  color: var(--ink);
  font-size: 12.5px;
  background-image:
    radial-gradient(ellipse 30px 18px at 86% 20%, rgba(255, 250, 232, 0.4), transparent 70%),
    var(--tex-paper),
    linear-gradient(180deg, #fbf2d6, #eedcaa);
  background-size: auto, 220px 220px, auto;
  box-shadow:
    inset 0 2px 4px rgba(110, 70, 20, 0.26),
    inset 0 -1px 2px rgba(255, 250, 230, 0.5);
}
.mini-input:focus { outline: 2px solid rgba(201, 162, 74, 0.55); outline-offset: 1px; }
.units { width: 76px; }
.trade-overlay {
  position: fixed; inset: 0; background: rgba(30, 18, 8, 0.6);
  display: flex; align-items: center; justify-content: center; z-index: 200; padding: 14px;
}
.trade-card { width: min(720px, 96vw); max-height: 90vh; overflow-y: auto; padding: 18px; }
.trade-head { font-size: 15px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; display: flex; gap: 10px; align-items: center; }
.trade-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.trade-col {
  background-image:
    radial-gradient(ellipse 90px 50px at 14% 0%, rgba(255, 250, 232, 0.42), transparent 70%),
    var(--tex-paper),
    linear-gradient(168deg, #f8ecc8 0%, #efdcab 100%);
  background-size: auto, 300px 300px, auto;
  border: 1px solid rgba(176, 143, 92, 0.85); border-radius: 9px; padding: 9px;
  box-shadow: inset 0 0 12px rgba(120, 80, 25, 0.14);
}
.col-title { font-size: 13px; font-weight: bold; color: #8a5a2b; margin-bottom: 6px; }
.cash-row { display: flex; align-items: center; gap: 6px; font-size: 12px; margin: 3px 0; cursor: pointer; }
.have { color: #a08860; }
.tiles-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
/* 交易行：统一复古复选框 + 名称 + 数量/价格 */
.row-title { font-size: 11.5px; color: #8a6a44; margin: 8px 0 3px; border-bottom: 1px dashed rgba(138, 101, 52, 0.35); padding-bottom: 2px; }
.trade-row {
  display: flex; align-items: center; gap: 7px;
  padding: 3px 6px; margin: 1px 0;
  border-radius: 6px; cursor: pointer; font-size: 12.5px;
}
.trade-row:hover { background: rgba(160, 120, 60, 0.12); }
.trade-row .paper-check { flex: none; }
.row-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #4a3018; }
.row-name.res-wood :deep(.ui-icon) { color: #2e6a3c; }
.row-name.res-beef :deep(.ui-icon) { color: #9a3a2a; }
.row-name.res-oil :deep(.ui-icon) { color: #494238; }
.row-name.res-fish :deep(.ui-icon) { color: #17697a; }
.row-meta { color: #8a6a44; font-size: 11.5px; white-space: nowrap; }
.row-meta .bldg { font-style: normal; margin-left: 5px; }
.trade-row input.mini-input:disabled { opacity: 0.45; }
.trade-summary {
  display: flex; align-items: center; justify-content: center; gap: 10px;
  margin-top: 12px; padding: 7px 10px;
  border: 1.5px dashed #b99a6a; border-radius: 8px;
  font-size: 13px; color: #5a3a1a;
}
.trade-summary .vs { color: #a5711f; font-weight: bold; }
.trade-summary .balance { font-size: 12px; padding: 2px 8px; border-radius: 10px; }
.trade-summary .balance.good { background: var(--fall-soft); color: var(--fall-ink); font-weight: 700; }
.trade-summary .balance.bad { background: var(--rise-soft); color: var(--rise-ink); font-weight: 700; }
.trade-actions { display: flex; gap: 10px; margin-top: 14px; justify-content: flex-end; align-items: center; }
.trade-error { margin-right: auto; color: var(--rise-ink); font-size: 12px; font-weight: 600; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
