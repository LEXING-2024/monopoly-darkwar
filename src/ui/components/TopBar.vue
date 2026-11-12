<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { backToMenu, saveGame, setVolume, store, toggleMute } from '../store'
import {
  RENT_STALL_MAX, RENT_STALL_PER_ROUND, RENT_STALL_START,
  RESOURCES, RESOURCE_ORDER, SEASONS,
} from '../../core/config'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'open-help'): void }>()

const s = computed(() => store.state)
const current = computed(() => s.value?.players[s.value.currentPlayer] ?? null)
const season = computed(() => (s.value ? SEASONS[s.value.season] : null))
const seasonIcon = computed(() => s.value?.season ?? 'spring')
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
  boom: { name: '繁荣', icon: 'arrowUp', cls: 'cl-boom', tip: '资源价格 +10%、租金 +10%、建筑费用 -10%' },
  normal: { name: '正常', icon: 'summer', cls: 'cl-normal', tip: '经济平稳，无修正' },
  recession: { name: '衰退', icon: 'arrowDown', cls: 'cl-recession', tip: '资源价格 -10%、租金 -10%、建筑费用 +10%' },
  crisis: { name: '危机', icon: 'alert', cls: 'cl-crisis', tip: '灾害概率 +5%、过路费 -20%' },
}
const climateUi = computed(() => (s.value ? CLIMATE_UI[s.value.climate] : null))

// 反僵持租金加成：对局拖长后从第 START 轮起逐步上涨，顶栏明示当前幅度
const rentStallPct = computed(() => {
  if (!s.value) return 0
  const bonus = Math.min(
    RENT_STALL_MAX,
    Math.max(0, (s.value.totalRound - RENT_STALL_START) * RENT_STALL_PER_ROUND),
  )
  return Math.round(bonus * 100)
})

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
let confirmHomeTimer: ReturnType<typeof setTimeout> | null = null
function onHome(): void {
  if (!confirmHome.value) {
    confirmHome.value = true
    if (confirmHomeTimer) clearTimeout(confirmHomeTimer)
    confirmHomeTimer = setTimeout(() => {
      confirmHome.value = false
      confirmHomeTimer = null
    }, 3000)
    return
  }
  backToMenu()
}
onBeforeUnmount(() => {
  if (confirmHomeTimer) { clearTimeout(confirmHomeTimer); confirmHomeTimer = null }
})

// 手机端：常用按钮折叠为一个「菜单」，点开展开其余选择（节省顶栏空间）
const menuOpen = ref(false)
// 市场行情详情弹层（点击市场条展开，点外部关闭）
const marketOpen = ref(false)

function onVolume(e: Event): void {
  const input = e.target as HTMLInputElement
  setVolume(Number(input.value) / 100)
}
</script>

<template>
  <header class="topbar">
    <div class="brand" v-if="s" aria-label="大富翁·暗战">
      <span class="brand-seal">暗</span>
      <span class="brand-word">商路<em>暗战</em></span>
    </div>
    <div class="top-left">
      <span class="chip season-chip" v-if="s">
        <Icon :name="seasonIcon" :size="14" />
        <span>第{{ s.year }}年 · {{ season?.name }}季</span>
        <span class="season-turn">本季 {{ s.seasonTurn }}/{{ s.seasonLen }} 回合</span>
      </span>
      <span class="chip round-chip" v-if="s" title="1 回合 = 全部存活玩家各行动一次">
        第 <b>{{ s.totalRound ?? s.round }}</b> 回合
      </span>
      <span
        v-if="s" class="chip gdp-chip"
        :title="`GDP：全体存活玩家总资产（扣除起点奖励/卡牌补贴等无偿发放），较上轮 ${gdpTrend.delta >= 0 ? '+' : ''}￥${fmtMoney(gdpTrend.delta)}`"
      ><Icon name="coin" :size="13" /> GDP ￥{{ fmtMoney(s.gdp) }}
        <b class="gdp-arrow" :class="gdpTrend.cls">{{ gdpTrend.arrow }}<span v-if="gdpPctText" class="gdp-pct"> {{ gdpPctText }}</span></b>
      </span>
      <span
        v-if="climateUi" class="chip climate-chip" :class="climateUi.cls" :title="climateUi.tip"
      ><Icon :name="climateUi.icon" :size="13" /> {{ climateUi.name }}<template v-if="s?.climate === 'crisis'"> · 剩{{ s.climateTurns }}轮</template></span>
      <span v-if="s?.phase === 'order'" class="chip order-chip"><Icon name="dice" :size="13" /> 决定行动顺序中</span>
      <span
        v-if="rentStallPct > 0" class="chip stall-chip"
        :title="`对局拖长后市场租金逐步上涨（反僵持机制：第 ${RENT_STALL_START} 轮起每轮 +${(RENT_STALL_PER_ROUND * 100).toFixed(1)}%，上限 +${RENT_STALL_MAX * 100}%）：当前全部租金 +${rentStallPct}%`"
      ><Icon name="flame" :size="13" /> 租金 +{{ rentStallPct }}%</span>
      <span v-if="s?.endgame" class="chip warn"><Icon name="flag" :size="13" /> 终局对决</span>
      <span v-if="typhoon" class="chip typhoon">台风 {{ typhoon.onLand ? '已登陆' : `${typhoon.strength}级` }}</span>
      <span
        v-for="(c, ci) in chains" :key="`${c.id}:${ci}`"
        class="chip chain" :title="c.desc"
      ><Icon name="hourglass" :size="13" /> {{ c.name }}<span class="chain-left"> · 剩{{ c.turnsLeft }}回合</span></span>
      <span
        v-if="s?.seasonEvent"
        class="chip season-event-chip"
        :title="s.seasonEvent.desc"
      ><Icon name="spring" :size="13" /> {{ s.seasonEvent.name }}</span>
    </div>
    <div class="top-market" v-if="s" title="市场行情（点击查看详情）" @click="marketOpen = !marketOpen">
      <span class="market-label"><Icon name="trade" :size="14" /></span>
      <span
        v-for="res in RESOURCE_ORDER" :key="res"
        class="market-item"
        :class="[`res-${res}`, { up: trend(res) === '↑', down: trend(res) === '↓' }]"
      ><span class="res-chip"><Icon :name="res" :size="13" /></span><span class="m-price">￥{{ s.market[res] }}</span><b class="market-trend" :class="{ up: trend(res) === '↑', down: trend(res) === '↓' }">{{ trend(res) }}</b></span>
      <div v-if="marketOpen" class="market-backdrop" @click.stop="marketOpen = false"></div>
      <div v-if="marketOpen" class="market-pop">
        <div class="mp-title"><Icon name="trade" :size="14" /> 市场行情</div>
        <div v-for="res in RESOURCE_ORDER" :key="'p' + res" class="mp-row">
          <span><span class="res-chip" :class="`res-${res}`"><Icon :name="res" :size="13" /></span> {{ RESOURCES[res].name }}</span>
          <span class="mp-val" :class="{ up: trend(res) === '↑', down: trend(res) === '↓' }">￥{{ s.market[res] }} <b class="mp-trend">{{ trend(res) }}</b></span>
        </div>
        <div class="mp-hint">相对基准价 ±12% 显示涨跌 · 红涨绿跌</div>
      </div>
    </div>
    <div class="top-right">
      <span v-if="store.saveToast" class="save-toast"><Icon name="save" :size="13" /> {{ store.saveToast }}</span>
      <span v-if="myTurn" class="your-turn"><Icon name="chevron" :size="13" /> 轮到你行动！</span>
      <span
        v-if="current" class="chip player"
        :style="{ background: current.color, color: '#fff' }"
      >{{ current.name }} {{ current.isAI ? '(AI)' : '' }}</span>
      <div class="desktop-actions">
        <label class="volume-control" title="主音量">
          <Icon name="volume" :size="15" />
          <input
            class="volume-slider" type="range" min="0" max="100" step="1"
            :value="Math.round(store.volume * 100)" @input="onVolume"
            aria-label="主音量"
          />
        </label>
        <button class="icon-btn" @click="saveGame" title="保存对局（当前回合结束后存档）"><Icon name="save" :size="16" /></button>
        <button class="icon-btn" :class="{ danger: confirmHome }" @click="onHome" title="返回首页">
          <template v-if="confirmHome"><span class="confirm-word">返回？</span></template>
          <Icon v-else name="home" :size="16" />
        </button>
        <button class="icon-btn" @click="toggleMute" :title="store.muted ? '开启音效' : '静音'">
          <Icon :name="store.muted ? 'mute' : 'volume'" :size="16" />
        </button>
        <button class="icon-btn" @click="emit('open-help')" title="规则说明"><Icon name="help" :size="16" /></button>
      </div>
      <!-- 手机端：折叠为一个菜单按钮，点开展开其余选择；点菜单外任意处关闭 -->
      <div class="mobile-menu">
        <button class="icon-btn menu-toggle" @click="menuOpen = !menuOpen" title="菜单"><Icon name="menu" :size="17" /></button>
        <div v-if="menuOpen" class="menu-backdrop" @click="menuOpen = false"></div>
        <div v-if="menuOpen" class="menu-pop">
          <button class="menu-item" @click="saveGame(); menuOpen = false"><Icon name="save" :size="15" /> 保存对局</button>
          <button class="menu-item" :class="{ danger: confirmHome }" @click="onHome">
            <Icon name="alert" :size="15" v-if="confirmHome" /><Icon name="home" :size="15" v-else />
            {{ confirmHome ? '确认返回？' : '返回首页' }}
          </button>
          <button class="menu-item" @click="toggleMute">
            <Icon :name="store.muted ? 'volume' : 'mute'" :size="15" />
            {{ store.muted ? '开启音效' : '静音' }}
          </button>
          <label class="menu-volume">
            <Icon name="volume" :size="15" />
            <span>音量</span>
            <input
              class="volume-slider" type="range" min="0" max="100" step="1"
              :value="Math.round(store.volume * 100)" @input="onVolume"
              aria-label="主音量"
            />
          </label>
          <button class="menu-item" @click="emit('open-help'); menuOpen = false"><Icon name="help" :size="15" /> 规则说明</button>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  height: 47px;
  min-height: 47px;
  flex-wrap: nowrap;
  overflow: visible;
  background-color: var(--wood-2);
  background-image:
    linear-gradient(180deg, rgba(255, 236, 190, 0.10), transparent 40%, rgba(0, 0, 0, 0.28)),
    var(--tex-wood);
  background-size: auto, 760px 760px;
  border-bottom: 2px solid #1b0f05;
  box-shadow:
    inset 0 1px 0 rgba(255, 236, 190, 0.22),
    0 2px 8px rgba(0, 0, 0, 0.4);
  color: #f7e8c4;
  position: relative;
  z-index: 20;
}
.topbar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 2px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(226, 192, 112, 0.5), transparent);
  pointer-events: none;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  min-width: 104px;
  white-space: nowrap;
  padding: 3px 9px 3px 4px;
  border-radius: 9px;
  border: 1px solid rgba(201, 162, 74, 0.55);
  background-image:
    linear-gradient(180deg, rgba(255, 236, 190, 0.10), rgba(0, 0, 0, 0.20)),
    var(--tex-wood);
  background-size: auto, 200px 200px;
  box-shadow: inset 0 0 0 1px rgba(255, 240, 200, 0.08), 0 2px 5px rgba(0, 0, 0, 0.35);
}
.brand-seal {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 5px;
  color: #f7e3c2;
  font-size: 15px;
  line-height: 1;
  background: linear-gradient(160deg, #b44234, #7e2419);
  border: 1px solid #5c170f;
  box-shadow: inset 0 1px 0 rgba(255, 220, 190, 0.35), 0 1px 2px rgba(0, 0, 0, 0.4);
}
.brand-word {
  display: flex;
  flex: none;
  flex-direction: column;
  color: #f3dfb4;
  font-size: 11px;
  letter-spacing: 2px;
  line-height: 1.1;
}
.brand-word em {
  font-style: normal;
  font-size: 13px;
  color: #ffe3a2;
  letter-spacing: 3px;
}

/* 顶栏状态：一条连续的纸带，而不是一堆独立小方块 */
.top-left {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  gap: 0;
  padding: 1px 5px;
  border: 1px solid rgba(138, 95, 31, 0.72);
  border-radius: 9px;
  color: var(--ink);
  background-image:
    radial-gradient(ellipse 160px 34px at 16% 0%, rgba(255, 252, 240, 0.55), transparent 70%),
    var(--tex-paper),
    linear-gradient(180deg, #f9edcb, #eedaab);
  background-size: auto, 320px 320px, auto;
  box-shadow:
    inset 0 1px 0 rgba(255, 253, 244, 0.75),
    0 1px 2px rgba(0, 0, 0, 0.30);
}
.top-left .chip {
  background: none;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  padding: 2px 8px;
  color: var(--ink-2);
  font-size: 12px;
}
.top-left .chip + .chip {
  border-left: 1px solid rgba(138, 95, 31, 0.24);
}
.top-left .chip :deep(.ui-icon) { color: var(--brass-3); opacity: 0.9; }
.top-left .season-chip { color: var(--ink); font-weight: bold; }
.top-left::-webkit-scrollbar { display: none; }
.top-left .round-chip { color: #5a3a10; background: none; border-color: transparent; }
.top-left .round-chip b { color: var(--seal); font-size: 14px; }
.top-left .chip.warn,
.top-left .chip.order-chip,
.top-left .chip.typhoon,
.top-left .chip.chain,
.top-left .chip.season-event-chip,
.top-left .chip.stall-chip,
.top-left .climate-chip {
  margin: 2px 3px;
  padding: 1px 7px;
  border-radius: 6px;
  border: 1px solid rgba(138, 95, 31, 0.25);
  background-image: none;
}
.top-left .chip.warn { color: #8c2a1f; background-color: rgba(176, 68, 52, 0.14); }
.top-left .chip.order-chip { color: #6a470e; background-color: rgba(201, 155, 58, 0.18); animation: none; }
.top-left .chip.typhoon { color: #2f6978; background-color: rgba(74, 125, 140, 0.13); }
.top-left .chip.chain { color: #654677; background-color: rgba(122, 88, 144, 0.12); }
.top-left .chip.season-event-chip { color: #4f6a32; background-color: rgba(95, 127, 67, 0.13); }
.top-left .chip.stall-chip { color: #7a4a12; background-color: rgba(217, 141, 60, 0.14); }
.top-left .climate-chip.cl-boom { color: #8e3527; background-color: rgba(217, 119, 101, 0.14); }
.top-left .climate-chip.cl-recession { color: #41652f; background-color: rgba(147, 191, 124, 0.15); }
.top-left .climate-chip.cl-crisis { color: #ffe8e0; background-color: #a13a2c; animation: none; }
.top-left .climate-chip.cl-normal { color: #6a5632; background-color: rgba(228, 205, 156, 0.25); }

.top-right { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: none; }
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 8px;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--ink);
  background-image:
    linear-gradient(180deg, rgba(255, 250, 235, 0.92), rgba(240, 222, 180, 0.86));
  border: 1px solid rgba(138, 95, 31, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 252, 238, 0.7),
    0 1px 2px rgba(0, 0, 0, 0.28);
  white-space: nowrap;
}
.chip :deep(.ui-icon) { color: var(--brass-3); }
.season-chip { background-image: linear-gradient(180deg, #f9e7b4, #e5c479); border-color: #9a6a22; }
.season-turn { opacity: 0.72; font-size: 10.5px; }
.round-chip {
  background-image: linear-gradient(180deg, #f7d889, #dfb44f);
  border-color: #7c5414;
  font-size: 12.5px;
  font-weight: bold;
}
.round-chip b { font-size: 15px; color: #4a2d08; font-family: var(--font-num); }
.chip.warn {
  background-image: linear-gradient(180deg, #d9958a, #b25a4a);
  border-color: #6e2418;
  color: #fff4ea;
}
.chip.stall-chip {
  background-image: linear-gradient(180deg, #f3c17e, #d98d3c);
  border-color: #8a4d15;
}
/* GDP 涨跌：红涨绿跌（股市惯例）。加浅色底 + 更深文字，纸带上也能一眼分辨。 */
.gdp-chip { font-variant-numeric: tabular-nums; }
.gdp-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 43px;
  margin-left: 2px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 12.5px;
  font-weight: 800;
  line-height: 1.45;
}
.gdp-up { color: #fff8ef; background: var(--rise); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22); }
.gdp-down { color: #f2fff5; background: var(--fall); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18); }
.gdp-flat { color: #6b5738; background: rgba(117, 96, 62, 0.10); }
.gdp-pct { font-size: 10px; opacity: 0.95; font-weight: 700; }
/* 景气徽章 */
.climate-chip { font-weight: bold; }
.climate-chip.cl-boom { background-image: linear-gradient(180deg, #f2b6a8, #d97765); border-color: #8e3527; }
.climate-chip.cl-normal { background-image: linear-gradient(180deg, #f4e6c0, #e4cd9c); }
.climate-chip.cl-recession { background-image: linear-gradient(180deg, #c4dfb4, #93bf7c); border-color: #4f7a3d; }
.climate-chip.cl-crisis {
  background-image: linear-gradient(180deg, #c75a4c, #8e2a1e);
  border-color: #4d0e06;
  color: #ffe8e0;
  animation: blink 1.2s ease-in-out infinite;
}
.chip.order-chip { background-image: linear-gradient(180deg, #f7d889, #dfb44f); animation: blink 1.5s ease-in-out infinite; }
.chip.typhoon { background-image: linear-gradient(180deg, #c6dfe7, #9dc2ce); border-color: #4a7d8c; }
.chip.chain { background-image: linear-gradient(180deg, #e0cde8, #c3a7d1); border-color: #7a5890; }
.season-event-chip { background-image: linear-gradient(180deg, #d7e6bf, #b6d092); border-color: #5f7f43; }
/* 顶栏市场行情：紧凑资源价格条 */
.top-market {
  display: flex;
  align-items: center;
  gap: 7px;
  background-image: linear-gradient(180deg, rgba(255, 250, 235, 0.92), rgba(240, 222, 180, 0.88));
  border: 1px solid rgba(138, 95, 31, 0.7);
  border-radius: 9px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--ink);
  margin-left: auto;
  cursor: pointer;
  position: relative;
  box-shadow: inset 0 1px 0 rgba(255, 252, 238, 0.7), 0 1px 2px rgba(0, 0, 0, 0.28);
}
.top-market:hover { filter: brightness(1.06); }
.top-market :deep(.ui-icon) { color: var(--brass-3); }
.market-item { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
/* 资源图标不再共用黄铜色：木/牛/油/鱼各有专属小色牌，远看也能区分 */
.res-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1px solid var(--res-line, rgba(138, 95, 31, 0.55));
  background: var(--res-bg, rgba(255, 248, 226, 0.72));
  color: var(--res-ink, var(--brass-3));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
  flex: none;
}
.market-item.res-wood, .mp-row .res-wood { --res-ink: #2e6a3c; --res-bg: #e4efd9; --res-line: #83a873; }
.market-item.res-beef, .mp-row .res-beef { --res-ink: #9a3a2a; --res-bg: #f6e3da; --res-line: #c98f7a; }
.market-item.res-oil, .mp-row .res-oil { --res-ink: #494238; --res-bg: #e9e2d4; --res-line: #9e9078; }
.market-item.res-fish, .mp-row .res-fish { --res-ink: #17697a; --res-bg: #d9eef0; --res-line: #7ab4bd; }
.market-item .res-chip :deep(.ui-icon) { color: var(--res-ink); opacity: 1; }
.mp-row .res-chip :deep(.ui-icon) { color: var(--res-ink); opacity: 1; }
.market-item.up { color: var(--rise-ink); }
.market-item.down { color: var(--fall-ink); }
.market-item .m-price { font-variant-numeric: tabular-nums; }
.market-trend {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-left: 1px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  color: #76613f;
  background: rgba(117, 96, 62, 0.09);
}
.market-trend.up { color: #fff7ef; background: var(--rise); }
.market-trend.down { color: #f3fff6; background: var(--fall); }
.market-label { display: inline-flex; opacity: 0.8; }
/* 行情详情弹层 */
.market-backdrop { position: fixed; inset: 0; z-index: 30; }
.market-pop {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 40;
  min-width: 196px;
  padding: 11px 14px;
  color: var(--ink);
  border: 1.5px solid var(--brass-3);
  border-radius: 11px;
  background-image:
    radial-gradient(ellipse 120px 60px at 20% 0%, rgba(255, 250, 232, 0.4), transparent 70%),
    var(--tex-paper),
    linear-gradient(168deg, #f8ebc8, #ecd6a1);
  background-size: auto, 340px 340px, auto;
  box-shadow: var(--shadow-lg);
}
.mp-title { display: flex; align-items: center; gap: 5px; font-size: 13.5px; font-weight: bold; color: #5a3a14; margin-bottom: 7px; }
.mp-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  font-size: 13px;
  padding: 3px 0;
  border-bottom: 1px dotted rgba(138, 95, 31, 0.3);
}
.mp-row > span:first-child { display: inline-flex; align-items: center; gap: 5px; }
.mp-val { font-variant-numeric: tabular-nums; font-weight: 700; }
.mp-row .up { color: var(--rise-ink); }
.mp-row .down { color: var(--fall-ink); }
.mp-trend {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 14px;
  height: 14px;
  border-radius: 4px;
  font-size: 11px;
  line-height: 1;
  vertical-align: 1px;
}
.mp-row .up .mp-trend { color: #fff8ef; background: var(--rise); }
.mp-row .down .mp-trend { color: #f2fff5; background: var(--fall); }
.mp-hint { margin-top: 6px; font-size: 10.5px; color: var(--ink-3); }
.chip.player { border: 1px solid rgba(40, 20, 4, 0.55); font-weight: bold; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45); }
.your-turn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #ffe09a;
  font-weight: bold;
  font-size: 13.5px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  animation: blink 1.5s ease-in-out infinite;
}
.save-toast {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #e8f6d8;
  font-size: 12.5px;
  background: rgba(50, 100, 46, 0.55);
  border: 1px solid rgba(150, 200, 130, 0.5);
  padding: 3px 9px;
  border-radius: 8px;
}
@keyframes blink { 50% { opacity: 0.45; } }
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 8px;
  color: #f3e2bd;
  background-image:
    linear-gradient(180deg, rgba(255, 236, 190, 0.18), rgba(0, 0, 0, 0.12)),
    var(--tex-wood);
  background-size: auto, 180px 180px;
  border: 1px solid #3a240c;
  box-shadow: inset 0 1px 0 rgba(255, 236, 190, 0.32), 0 2px 4px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: filter 0.12s ease, transform 0.08s ease;
}
.icon-btn:hover { filter: brightness(1.2); }
.icon-btn:active { transform: translateY(1px); }
.icon-btn.danger { background-image: linear-gradient(180deg, #c46a56, #8a2f20); border-color: #5d1409; }
/* 主音量：桌面端常驻一条窄滑杆，手机端收进菜单 */
.volume-control {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 7px;
  border-radius: 8px;
  color: #f3e2bd;
  background: rgba(30, 18, 6, 0.18);
  border: 1px solid rgba(201, 162, 74, 0.35);
}
.volume-control :deep(.ui-icon) { color: var(--brass-3); opacity: 0.95; }
.volume-slider {
  width: 64px;
  height: 16px;
  margin: 0;
  accent-color: #c9a24a;
  cursor: pointer;
}
.menu-volume {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  color: var(--ink);
  font-size: 13px;
  border: 1px solid rgba(138, 95, 31, 0.5);
  border-radius: 7px;
  background: rgba(255, 248, 226, 0.35);
}
.menu-volume :deep(.ui-icon) { color: var(--brass-3); }
.menu-volume .volume-slider { flex: 1; width: auto; accent-color: #a5711f; }
.confirm-word { font-size: 10px; letter-spacing: -0.5px; white-space: nowrap; }
/* 手机端折叠菜单 */
.mobile-menu { display: none; position: relative; }
.menu-backdrop { position: fixed; inset: 0; z-index: 30; }
.menu-pop {
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  z-index: 40;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 164px;
  padding: 9px;
  color: var(--ink);
  background-image:
    radial-gradient(ellipse 120px 60px at 20% 0%, rgba(255, 250, 232, 0.4), transparent 70%),
    var(--tex-paper),
    linear-gradient(168deg, #f8ebc8, #ecd6a1);
  background-size: auto, 340px 340px, auto;
  border: 1.5px solid var(--brass-3);
  border-radius: 11px;
  box-shadow: var(--shadow-lg);
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 248, 226, 0.35);
  border: 1px solid rgba(138, 95, 31, 0.5);
  color: var(--ink);
  border-radius: 7px;
  padding: 7px 10px;
  font-size: 13.5px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.menu-item:hover { background: rgba(255, 250, 235, 0.6); }
.menu-item.danger { background: rgba(180, 60, 40, 0.85); border-color: #6e1a0e; color: #fff2e8; }
/* 移动端：折叠菜单 + 顶栏精简 */
html.is-mobile .desktop-actions { display: none; }
html.is-mobile .mobile-menu { display: inline-flex; }
html.is-mobile .topbar { gap: 6px; padding: 6px 8px; }
html.is-mobile .season-turn { display: none; }
html.is-mobile .m-price { display: none; }
html.is-mobile .chain-left { display: none; }
html.is-mobile .chip { padding: 2px 7px; font-size: 11.5px; }
html.is-mobile .round-chip { padding: 2px 8px; font-size: 12px; }
html.is-mobile .top-market { padding: 2px 7px; font-size: 11.5px; gap: 4px; }
html.is-mobile .your-turn { font-size: 12px; }
</style>
