<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { store } from '../store'
import { ANTITRUST, RESOURCES, RESOURCE_ORDER } from '../../core/config'
import { monopolyInfo, monopolyTargets } from '../../core/events'
import type { ResourceType, TradeOffer } from '../../core/types'

const s = computed(() => store.state)
const game = computed(() => store.game)
const me = computed(() => (s.value ? s.value.players[s.value.currentPlayer] : null))
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

function openTrade(): void {
  trade.target = tradeTargets.value[0]?.id ?? 1
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

/** 交易估值合计：现金 + 地块价格 + 资源市价 */
function tradeValue(tiles: number[], res: Record<string, number>, cash: number): number {
  const st = s.value
  if (!st) return cash
  let v = cash
  for (const i of tiles) v += st.tiles[i]?.price ?? 0
  for (const r of RESOURCE_ORDER) v += Math.floor(res[r] ?? 0) * st.market[r]
  return Math.round(v)
}
const tradeSummary = computed(() => {
  const give = tradeValue(trade.myTiles, trade.myRes, trade.myCash)
  const receive = tradeValue(trade.theirTiles, trade.theirRes, trade.theirCash)
  return { give, receive }
})

function toggle(arr: number[], v: number): void {
  const i = arr.indexOf(v)
  if (i >= 0) arr.splice(i, 1)
  else arr.push(v)
}

async function submitTrade(): Promise<void> {
  const pick = (res: Record<string, number>, sel: Record<string, boolean>): Record<string, number> =>
    Object.fromEntries(RESOURCE_ORDER.filter(r => sel[r]).map(r => [r, Math.floor(res[r] ?? 0)]))
  const give: TradeOffer = {
    tiles: trade.myTiles, cash: Math.floor(trade.myCash),
    resources: pick(trade.myRes, trade.myResPick),
  }
  const receive: TradeOffer = {
    tiles: trade.theirTiles, cash: Math.floor(trade.theirCash),
    resources: pick(trade.theirRes, trade.theirResPick),
  }
  await game.value?.proposeTrade(trade.target, give, receive)
  tradeOpen.value = false
}

// ---- 举报 / 游说 ----
const reportOpen = ref(false)
const lobbyOpen = ref(false)

function doSell(): void {
  const units = Math.min(sell.units, me.value?.resources[sell.res] ?? 0)
  if (units > 0) game.value?.sellResources(sell.res, units)
}

/** 等待窗口：当前行动者是 AI 时在视野中上方（顶部状态栏下方）悬浮显示 */
const waiting = computed(() => {
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
  <!-- 操作卡片：仅在自己的行动阶段显示；非己回合整个容器隐藏、不占位 -->
  <div v-if="s && me && myTurn" class="paper card">
      <!-- 行动按钮 -->
      <div class="actions">
        <button class="btn" @click="openTrade">🤝 交易</button>
        <button class="btn" @click="reportOpen = !reportOpen">🚨 反垄断举报</button>
        <button class="btn" @click="lobbyOpen = !lobbyOpen">💼 游说</button>
        <button class="btn danger" @click="game?.resign()">🏳️ 认输</button>
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

      <!-- 卖资源 -->
      <div v-if="myTurn && sellableRes.length" class="sell-row">
        <select v-model="sell.res" class="mini-input">
          <option v-for="r in sellableRes" :key="r" :value="r">
            {{ RESOURCES[r].icon }}{{ RESOURCES[r].name }} ×{{ Math.floor(me.resources[r]) }}（单价 ￥{{ s.market[r] }}）
          </option>
        </select>
        <input v-model.number="sell.units" type="number" min="1" class="mini-input units" />
        <button class="btn small" @click="doSell">💰 卖出</button>
      </div>

      <!-- 交易弹窗 -->
      <div v-if="tradeOpen" class="trade-overlay">
        <div class="paper trade-card">
          <div class="trade-head">🤝 与谁交易？
            <select v-model="trade.target" class="mini-input">
              <option v-for="p in tradeTargets" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div class="trade-cols">
            <!-- 我给出 -->
            <div class="trade-col">
              <div class="col-title">我给出</div>
              <label class="cash-row">💰 现金
                <input v-model.number="trade.myCash" type="number" min="0" class="mini-input units" />
              </label>
              <div class="row-title">地块</div>
              <label v-for="t in myTileList" :key="t.index" class="trade-row">
                <input type="checkbox" class="paper-check" :checked="trade.myTiles.includes(t.index)" @change="toggle(trade.myTiles, t.index)" />
                <span class="row-name">{{ t.icon }} {{ t.name }}</span>
                <span class="row-meta">￥{{ t.price }}<i v-if="t.buildings.length" class="bldg">🏗️{{ t.buildings.length }}</i></span>
              </label>
              <div class="row-title">资源</div>
              <label v-for="r in RESOURCE_ORDER" :key="'m' + r" class="trade-row">
                <input type="checkbox" class="paper-check" v-model="trade.myResPick[r]" />
                <span class="row-name">{{ RESOURCES[r].icon }} {{ RESOURCES[r].name }}</span>
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
              <label class="cash-row">💰 现金
                <input v-model.number="trade.theirCash" type="number" min="0" class="mini-input units" />
              </label>
              <div class="row-title">地块</div>
              <label v-for="t in theirTileList" :key="t.index" class="trade-row">
                <input type="checkbox" class="paper-check" :checked="trade.theirTiles.includes(t.index)" @change="toggle(trade.theirTiles, t.index)" />
                <span class="row-name">{{ t.icon }} {{ t.name }}</span>
                <span class="row-meta">￥{{ t.price }}<i v-if="t.buildings.length" class="bldg">🏗️{{ t.buildings.length }}</i></span>
              </label>
              <div class="row-title">资源</div>
              <label v-for="r in RESOURCE_ORDER" :key="'t' + r" class="trade-row">
                <input type="checkbox" class="paper-check" v-model="trade.theirResPick[r]" />
                <span class="row-name">{{ RESOURCES[r].icon }} {{ RESOURCES[r].name }}</span>
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
            <button class="btn primary" @click="submitTrade">提出交易</button>
            <button class="btn" @click="tradeOpen = false">取消</button>
          </div>
        </div>
      </div>
  </div>

  <!-- AI 行动中悬浮窗口（视野中上方、顶部状态栏下方），独立于操作卡片，AI 行动时常显 -->
  <div v-if="waiting" class="waiting-window">
    <span class="w-dot" :style="{ background: waiting.color }" />
    <span class="w-text">🤖 {{ waiting.name }}（AI）{{ waiting.phaseText }}…</span>
  </div>
</template>

<style scoped>
.card { padding: 10px 14px; }
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
  border: 2px solid #8a5a2b;
  border-radius: 22px;
  background-image:
    radial-gradient(ellipse 90px 30px at 24% 12%, rgba(255, 250, 232, 0.5), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncG type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncB type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncA type='linear' slope='0.11'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23m)'/%3E%3C/svg%3E"),
    linear-gradient(168deg, #f4e5ba 0%, #eed8a4 55%, #e6ca8e 100%);
  box-shadow:
    inset 0 0 14px rgba(94, 58, 14, 0.25),
    0 4px 16px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  animation: waitIn 0.25s ease-out, waitPulse 1.6s ease-in-out 0.25s infinite;
}
.w-dot {
  width: 12px; height: 12px; border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  flex: none;
}
.w-text { font-size: 14px; color: #4a3018; white-space: nowrap; }
@keyframes waitIn { from { opacity: 0; transform: translate(-50%, -8px); } }
@keyframes waitPulse { 50% { filter: brightness(1.05); } }
.hint { font-size: 12px; color: #a08860; padding: 4px 0; }
.tile-detail { border-top: 1px dashed #c9b28a; padding-top: 6px; margin-top: 2px; }
.td-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.rent { color: #b0392e; font-weight: bold; font-size: 13px; }
.td-sub { font-size: 12px; color: #6a4a28; margin-top: 2px; }
.td-bldgs { margin-top: 4px; display: flex; flex-direction: column; gap: 3px; }
.td-bldg { font-size: 12px; color: #4a3018; display: flex; align-items: center; gap: 6px; }
.actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.submenu {
  margin-top: 8px; padding: 8px;
  background-image:
    /* 污渍线条 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='300'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.004 0.11' numOctaves='4' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncG type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncB type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncA type='linear' slope='0.1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='500' height='300' filter='url(%23s)'/%3E%3C/svg%3E"),
    /* 米花纸纹 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncG type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncB type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncA type='linear' slope='0.1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23m)'/%3E%3C/svg%3E"),
    /* 边缘老化 */
    radial-gradient(ellipse 80% 70% at 50% 45%, transparent 60%, rgba(122, 82, 30, 0.22) 100%),
    linear-gradient(168deg, #f4e5ba 0%, #eed8a4 45%, #e6ca8e 100%);
  border: 1.5px solid #8a6534;
  border-radius: 8px; display: flex; flex-wrap: wrap; gap: 5px;
  box-shadow: inset 0 0 18px rgba(94, 58, 14, 0.25);
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
  padding: 5px 8px; border-radius: 6px; border: 1.5px solid #8a6534;
  background-image:
    radial-gradient(ellipse 30px 18px at 86% 20%, rgba(255, 250, 232, 0.4), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' seed='5' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.3' intercept='0.05'/%3E%3CfeFuncG type='linear' slope='0.3' intercept='0.05'/%3E%3CfeFuncB type='linear' slope='0.3' intercept='0.05'/%3E%3CfeFuncA type='linear' slope='0.12'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23m)'/%3E%3C/svg%3E"),
    linear-gradient(180deg, #faf0d0, #eedcaa);
  box-shadow:
    inset 0 2px 4px rgba(110, 70, 20, 0.3),
    inset 0 -1px 2px rgba(255, 250, 230, 0.5),
    0 1px 0 rgba(255, 244, 210, 0.4);
  font-size: 13px; color: #4a3018;
}
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
    radial-gradient(ellipse 90px 50px at 14% 16%, rgba(255, 250, 232, 0.4), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncG type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncB type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncA type='linear' slope='0.1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23m)'/%3E%3C/svg%3E"),
    linear-gradient(168deg, #f6e8c0 0%, #efdcab 100%);
  border: 1.5px solid #b99a6a; border-radius: 8px; padding: 8px;
  box-shadow: inset 0 0 14px rgba(120, 80, 25, 0.18);
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
.trade-summary .balance.good { background: rgba(90, 160, 80, 0.18); color: #3d6b30; }
.trade-summary .balance.bad { background: rgba(200, 90, 60, 0.15); color: #a0452c; }
.trade-actions { display: flex; gap: 10px; margin-top: 14px; justify-content: flex-end; }
</style>
