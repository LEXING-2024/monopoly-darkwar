<script setup lang="ts">
import { computed, ref } from 'vue'
import { backToMenu, saveGame, store, toggleMute } from '../store'
import { RESOURCES, RESOURCE_ORDER, SEASONS } from '../../core/config'

const emit = defineEmits<{ (e: 'open-help'): void }>()

const s = computed(() => store.state)
const current = computed(() => s.value?.players[s.value.currentPlayer] ?? null)
const season = computed(() => (s.value ? SEASONS[s.value.season] : null))
const typhoon = computed(() => s.value?.typhoon ?? null)
const chains = computed(() => s.value?.chains ?? [])

// GDP 涨跌（股市惯例：红涨绿跌）——较上一轮的创造型总资产（扣除无偿发放）
const gdpTrend = computed(() => {
  if (!s.value) return { arrow: '—', cls: 'gdp-flat', delta: 0, pct: null as number | null }
  const delta = s.value.gdp - s.value.gdpPrev
  const pct = s.value.gdpPrev > 0 ? (delta / s.value.gdpPrev) * 100 : null
  if (delta > 0) return { arrow: '▲', cls: 'gdp-up', delta, pct }
  if (delta < 0) return { arrow: '▼', cls: 'gdp-down', delta, pct }
  return { arrow: '—', cls: 'gdp-flat', delta, pct }
})
const gdpPctText = computed(() => {
  const p = gdpTrend.value.pct
  if (p === null) return ''
  return `${p > 0 ? '+' : ''}${p.toFixed(1)}%`
})
const fmtMoney = (n: number): string => Math.round(n).toLocaleString()

// 景气状态展示（每轮末按 GDP 涨跌评估；危机持续 5 轮）
const CLIMATE_UI: Record<string, { name: string; icon: string; cls: string; tip: string }> = {
  boom: { name: '繁荣', icon: '📈', cls: 'cl-boom', tip: '资源价格 +10%、租金 +10%、建筑费用 -10%' },
  normal: { name: '正常', icon: '☀️', cls: 'cl-normal', tip: '经济平稳，无修正' },
  recession: { name: '衰退', icon: '📉', cls: 'cl-recession', tip: '资源价格 -10%、租金 -10%、建筑费用 +10%' },
  crisis: { name: '危机', icon: '🚨', cls: 'cl-crisis', tip: '灾害概率 +5%、过路费 -20%' },
}
const climateUi = computed(() => (s.value ? CLIMATE_UI[s.value.climate] : null))

// 市场行情（紧凑显示于顶栏）：价格相对基准的涨跌
function trend(res: (typeof RESOURCE_ORDER)[number]): string {
  if (!s.value) return ''
  const price = s.value.market[res]
  const base = RESOURCES[res].basePrice
  const d = price / base
  if (d >= 1.12) return '↑'
  if (d <= 0.88) return '↓'
  return '→'
}
const myTurn = computed(() =>
  !!s.value && !!current.value && !current.value.isAI &&
  (s.value.phase === 'spin' || s.value.phase === 'action') &&
  (!store.prompt || store.prompt.type === 'action'),
)

// 返回首页二次确认
const confirmHome = ref(false)
function onHome(): void {
  if (!confirmHome.value) {
    confirmHome.value = true
    setTimeout(() => { confirmHome.value = false }, 3000)
    return
  }
  backToMenu()
}

// 手机端：常用按钮折叠为一个「☰」，点开展开其余选择（节省顶栏空间）
const menuOpen = ref(false)
// 市场行情详情弹层（点击市场条展开，点外部关闭）
const marketOpen = ref(false)
</script>

<template>
  <header class="topbar">
    <div class="top-left">
      <span class="season-chip" v-if="s">
        {{ season?.icon }} 第{{ s.year }}年 · {{ season?.name }}季
        <span class="season-turn">本季第 {{ s.seasonTurn }}/{{ s.seasonLen }} 回合</span>
      </span>
      <span class="round-chip" v-if="s" title="1 回合 = 全部存活玩家各行动一次">
        第 <b>{{ s.totalRound ?? s.round }}</b> 回合
      </span>
      <span
        v-if="s" class="chip gdp-chip"
        :title="`GDP：全体存活玩家总资产（扣除起点奖励/卡牌补贴等无偿发放），较上轮 ${gdpTrend.delta >= 0 ? '+' : ''}￥${fmtMoney(gdpTrend.delta)}`"
      >GDP ￥{{ fmtMoney(s.gdp) }} <b :class="gdpTrend.cls">{{ gdpTrend.arrow }}<span v-if="gdpPctText" class="gdp-pct"> {{ gdpPctText }}</span></b></span>
      <span
        v-if="climateUi" class="chip climate-chip" :class="climateUi.cls" :title="climateUi.tip"
      >{{ climateUi.icon }} {{ climateUi.name }}<template v-if="s?.climate === 'crisis'"> · 剩{{ s.climateTurns }}轮</template></span>
      <span v-if="s?.phase === 'order'" class="chip order-chip">🎲 决定行动顺序中</span>
      <span v-if="s?.endgame" class="chip warn">⚔️ 终局对决</span>
      <span v-if="typhoon" class="chip typhoon">🌀 台风 {{ typhoon.onLand ? '已登陆' : `${typhoon.strength}级` }}</span>
      <span
        v-for="c in chains" :key="c.id + c.turnsLeft"
        class="chip chain" :title="c.desc"
      >⏳ {{ c.name }}<span class="chain-left"> · 剩{{ c.turnsLeft }}回合</span></span>
      <span
        v-if="s?.seasonEvent"
        class="chip season-event-chip"
        :title="s.seasonEvent.desc"
      >🍀 {{ s.seasonEvent.name }}</span>
    </div>
    <div class="top-market" v-if="s" title="市场行情（点击查看详情）" @click="marketOpen = !marketOpen">
      <span class="market-label">📈</span>
      <span
        v-for="res in RESOURCE_ORDER" :key="res"
        class="market-item"
        :class="{ up: trend(res) === '↑', down: trend(res) === '↓' }"
      >{{ RESOURCES[res].icon }}<span class="m-price">￥{{ s.market[res] }}</span>{{ trend(res) }}</span>
      <!-- 点击展开：完整价格明细（手机端价格内联隐藏，点这里看具体信息） -->
      <div v-if="marketOpen" class="market-backdrop" @click.stop="marketOpen = false"></div>
      <div v-if="marketOpen" class="market-pop">
        <div class="mp-title">📈 市场行情</div>
        <div v-for="res in RESOURCE_ORDER" :key="'p' + res" class="mp-row">
          <span>{{ RESOURCES[res].icon }} {{ RESOURCES[res].name }}</span>
          <span :class="{ up: trend(res) === '↑', down: trend(res) === '↓' }">￥{{ s.market[res] }} {{ trend(res) }}</span>
        </div>
        <div class="mp-hint">相对基准价 ±12% 显示涨跌</div>
      </div>
    </div>
    <div class="top-right">
      <span v-if="store.saveToast" class="save-toast">💾 {{ store.saveToast }}</span>
      <span v-if="myTurn" class="your-turn">▶ 轮到你行动！</span>
      <span
        v-if="current" class="chip player"
        :style="{ background: current.color, color: '#fff' }"
      >{{ current.name }} {{ current.isAI ? '(AI)' : '' }}</span>
      <div class="desktop-actions">
        <button class="icon-btn" @click="saveGame" title="保存对局（当前回合结束后存档）">💾</button>
        <button class="icon-btn" :class="{ danger: confirmHome }" @click="onHome" title="返回首页">
          {{ confirmHome ? '确认返回？' : '🏠' }}
        </button>
        <button class="icon-btn" @click="toggleMute" :title="store.muted ? '开启音效' : '静音'">
          {{ store.muted ? '🔇' : '🔊' }}
        </button>
        <button class="icon-btn" @click="emit('open-help')" title="规则说明">❓</button>
      </div>
      <!-- 手机端：折叠为一个菜单按钮，点开展开其余选择；点菜单外任意处关闭 -->
      <div class="mobile-menu">
        <button class="icon-btn menu-toggle" @click="menuOpen = !menuOpen" title="菜单">☰</button>
        <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false"></div>
        <div v-if="menuOpen" class="menu-pop">
          <button class="menu-item" @click="saveGame(); menuOpen = false">💾 保存对局</button>
          <button class="menu-item" :class="{ danger: confirmHome }" @click="onHome">
            {{ confirmHome ? '⚠️ 确认返回？' : '🏠 返回首页' }}
          </button>
          <button class="menu-item" @click="toggleMute">
            {{ store.muted ? '🔇 开启音效' : '🔊 静音' }}
          </button>
          <button class="menu-item" @click="emit('open-help'); menuOpen = false">❓ 规则说明</button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex; justify-content: space-between; align-items: center; gap: 10px;
  padding: 8px 14px; flex-wrap: wrap;
  background-image:
    /* 木纹年轮细丝 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='180'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.013 0.24' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.5' intercept='0.03'/%3E%3CfeFuncG type='linear' slope='0.5' intercept='0.03'/%3E%3CfeFuncB type='linear' slope='0.5' intercept='0.03'/%3E%3CfeFuncA type='linear' slope='0.16'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='300' height='180' filter='url(%23w)'/%3E%3C/svg%3E"),
    /* 顶部光照 */
    radial-gradient(ellipse 70% 70% at 28% 0%, rgba(255, 236, 190, 0.13), transparent 72%),
    /* 污渍 */
    radial-gradient(ellipse 200px 40px at 78% 90%, rgba(10, 4, 0, 0.4), transparent 75%),
    /* 木底色 */
    linear-gradient(180deg, #5a3a1e, #3d2917);
  border-bottom: 2px solid #2a1a0c;
  color: #f5e6c8;
}
.top-left, .top-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.chip {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.22);
  padding: 4px 10px; border-radius: 20px; font-size: 13px;
}
.season-chip { background: rgba(255, 215, 106, 0.16); border-color: #c9a227; }
.season-turn { opacity: 0.7; font-size: 11px; }
.round-chip {
  background: rgba(255, 215, 106, 0.22);
  border: 1.5px solid #e8c06a;
  padding: 4px 12px; border-radius: 20px; font-size: 13.5px;
}
.round-chip b { font-size: 16px; color: #ffd76a; }
.chip.warn { background: rgba(255, 80, 60, 0.2); border-color: #d94f3d; }
/* GDP 涨跌：红涨绿跌（股市惯例） */
.gdp-chip { background: rgba(255, 215, 106, 0.13); border-color: #c9a227; font-variant-numeric: tabular-nums; }
.gdp-chip b { font-size: 14px; margin-left: 2px; }
.gdp-up { color: #ff5f4d; }
.gdp-down { color: #7fe07a; }
.gdp-flat { color: #c9b28a; }
.gdp-pct { font-size: 11px; opacity: 0.85; }
/* 景气徽章：红涨绿跌（与 GDP 箭头一致） */
.climate-chip { font-weight: bold; }
.climate-chip.cl-boom { background: rgba(255, 95, 77, 0.22); border-color: #ff5f4d; color: #ffb3a6; }
.climate-chip.cl-normal { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.22); }
.climate-chip.cl-recession { background: rgba(110, 190, 110, 0.2); border-color: #7fe07a; color: #b8eab4; }
.climate-chip.cl-crisis {
  background: rgba(200, 30, 30, 0.35); border-color: #ff4a3a; color: #ffd0c8;
  animation: blink 1.1s ease-in-out infinite;
}
.chip.order-chip { background: rgba(255, 215, 106, 0.2); border-color: #e8c06a; animation: blink 1.4s ease-in-out infinite; }
.chip.typhoon { background: rgba(120, 180, 230, 0.18); border-color: #7cb8e6; }
.chip.chain { background: rgba(200, 140, 220, 0.16); border-color: #a76ec9; }
.season-event-chip { background: rgba(160, 210, 120, 0.16); border-color: #8fbf5f; }
/* 顶栏市场行情：紧凑资源价格条 */
.top-market {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px; padding: 3px 10px; font-size: 12.5px;
  margin-left: auto; cursor: pointer; position: relative;
}
.top-market:hover { background: rgba(255, 255, 255, 0.14); }
/* 行情详情弹层 */
.market-backdrop { position: fixed; inset: 0; z-index: 30; }
.market-pop {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;
  min-width: 180px; padding: 10px 12px;
  background: linear-gradient(180deg, #5a3a1e, #3d2917);
  border: 2px solid #2a1a0c; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.mp-title { font-size: 14px; font-weight: bold; color: #ffd76a; margin-bottom: 6px; }
.mp-row {
  display: flex; justify-content: space-between; gap: 14px;
  font-size: 13.5px; padding: 3px 0; color: #f5e6c8;
}
.mp-row .up { color: #ff9d8a; }
.mp-row .down { color: #9be08a; }
.mp-hint { margin-top: 6px; font-size: 11px; color: #b99a6a; }
.market-label { font-size: 13px; }
.market-item { white-space: nowrap; }
.market-item.up { color: #ff9d8a; }
.market-item.down { color: #9be08a; }
.chip.player { border: none; font-weight: bold; }
.your-turn {
  color: #ffd76a; font-weight: bold; font-size: 14px;
  animation: blink 1.4s ease-in-out infinite;
}
.save-toast {
  color: #b9e6a0; font-size: 13px; background: rgba(60, 120, 60, 0.35);
  padding: 3px 10px; border-radius: 12px;
}
@keyframes blink { 50% { opacity: 0.45; } }
.icon-btn {
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.25);
  border-radius: 8px; padding: 3px 8px; font-size: 15px; cursor: pointer;
}
.icon-btn:hover { background: rgba(255,255,255,.18); }
.icon-btn.danger { background: rgba(255, 90, 70, 0.5); border-color: #ff8a6a; }
/* 手机端折叠菜单 */
.mobile-menu { display: none; position: relative; }
.menu-backdrop {
  position: fixed; inset: 0; z-index: 30;
}
.menu-pop {
  position: absolute; right: 0; top: calc(100% + 6px); z-index: 40;
  display: flex; flex-direction: column; gap: 6px; min-width: 156px;
  padding: 8px;
  background: linear-gradient(180deg, #5a3a1e, #3d2917);
  border: 2px solid #2a1a0c; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}
.menu-item {
  background: rgba(255,255,255,.08); border: 1px solid rgba(255,255,255,.25);
  color: #f5e6c8; border-radius: 8px; padding: 7px 12px; font-size: 14px;
  cursor: pointer; text-align: left; white-space: nowrap;
}
.menu-item:hover { background: rgba(255,255,255,.18); }
.menu-item.danger { background: rgba(255, 90, 70, 0.45); border-color: #ff8a6a; }
/* 移动端（html.is-mobile 由 main.ts 设备检测标记）：
   折叠菜单 + 顶栏精简，尽量单行放下。
   检测信号：Capacitor 原生 / UA / 触屏指针 / 窄窗口，任一命中即启用——
   手机横屏 CSS 宽度常超过 900px，纯宽度断点会误判成桌面 UI */
html.is-mobile .desktop-actions { display: none; }
html.is-mobile .mobile-menu { display: inline-flex; }
html.is-mobile .topbar { gap: 6px; padding: 6px 8px; }
html.is-mobile .season-turn { display: none; }        /* 隐藏「本季第X/Y回合」小字 */
html.is-mobile .m-price { display: none; }            /* 市场只留图标+涨跌箭头，不显示价格数字 */
html.is-mobile .chain-left { display: none; }         /* 事件链只留名称，隐藏剩余回合 */
html.is-mobile .chip { padding: 3px 8px; font-size: 12px; }
html.is-mobile .round-chip { padding: 3px 9px; font-size: 12.5px; }
html.is-mobile .top-market { padding: 2px 8px; font-size: 12px; gap: 4px; }
</style>
