<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'

const props = defineProps<{ prompt: Extract<Prompt, { type: 'bid' }> }>()
const tile = computed(() => store.state?.tiles[props.prompt.tile] ?? null)
const leaderName = computed(() =>
  props.prompt.currentBidder !== null
    ? store.state?.players[props.prompt.currentBidder].name
    : null,
)
/** 地块类型名（拍卖信息展示） */
const TILE_TYPE_NAMES: Record<string, string> = {
  forest: '森林', plateau: '高原', desert: '沙漠', coast: '沿海',
  start: '起点', bridge: '桥梁', fate: '命运格', chance: '机会格', casino: '赌场', auction: '拍卖行',
}
const tileType = computed(() => {
  const t = tile.value
  if (!t) return ''
  if (t.type === 'terrain') return TILE_TYPE_NAMES[t.terrain] ?? ''
  return TILE_TYPE_NAMES[t.type] ?? ''
})
const ownerName = computed(() => {
  const t = tile.value
  if (!t || t.owner === null || !store.state) return '无'
  return store.state.players[t.owner].name
})
const bid = ref(props.prompt.minBid)

// 5 秒倒计时：不操作则自动放弃（放弃后本场拍卖不再询问）
const COUNTDOWN = 5
const left = ref(COUNTDOWN)
let timer: ReturnType<typeof setInterval> | null = null

function stopTimer(): void {
  if (timer) { clearInterval(timer); timer = null }
}

function startTimer(): void {
  stopTimer()
  left.value = COUNTDOWN
  timer = setInterval(() => {
    left.value--
    if (left.value <= 0) {
      stopTimer()
      respond({ pass: true })
    }
  }, 1000)
}

watch(
  () => props.prompt,
  p => {
    bid.value = p.minBid
    startTimer()
  },
  { immediate: true },
)

onBeforeUnmount(stopTimer)

function onBid(): void {
  stopTimer()
  respond({ pass: false, bid: Math.floor(bid.value) })
}

function onPass(): void {
  stopTimer()
  respond({ pass: true })
}
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <div class="modal-title">🔨 {{ prompt.title }}</div>
      <div class="modal-body" v-if="tile">
        <p class="big">{{ tile.icon }} {{ tile.name }}</p>
        <p class="muted">类型：{{ tileType }} · 原价 ￥{{ tile.price }} · 主人：{{ ownerName }}</p>
        <p class="muted">当前价 <b class="gold">{{ prompt.currentBid }}</b>
          <template v-if="leaderName">（{{ leaderName }}）</template>
        </p>
        <p class="muted">你的现金：￥{{ prompt.myCash }}</p>
        <div class="bid-row">
          <span class="muted">出价</span>
          <input
            v-model.number="bid" type="number" :min="prompt.minBid" :max="prompt.myCash"
            class="paper-input mini-input"
          />
        </div>
      </div>
      <div class="modal-actions">
        <button
          class="btn primary" :disabled="bid < prompt.minBid || bid > prompt.myCash"
          @click="onBid"
        >出价 {{ Math.floor(bid) }}</button>
        <button class="btn pass-btn" @click="onPass">放弃（{{ left }}s）</button>
      </div>
      <p class="countdown-tip">⏳ {{ left }} 秒内未出价将自动放弃，本场拍卖不再询问</p>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 200; /* 流程弹窗置顶，高于详情弹窗 */
}
.modal {
  width: min(380px, 92vw); border-radius: 16px; padding: 22px;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='300'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.004 0.11' numOctaves='4' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncG type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncB type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncA type='linear' slope='0.11'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='500' height='300' filter='url(%23s)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncG type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncB type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncA type='linear' slope='0.11'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23m)'/%3E%3C/svg%3E"),
    radial-gradient(ellipse 130px 76px at 8% 30%, rgba(255, 250, 232, 0.26), transparent 70%),
    radial-gradient(ellipse 150px 90px at 90% 62%, rgba(255, 248, 226, 0.2), transparent 70%),
    radial-gradient(ellipse 140px 100px at 12% 80%, rgba(146, 96, 34, 0.14), transparent 72%),
    radial-gradient(ellipse 170px 120px at 88% 12%, rgba(116, 72, 18, 0.12), transparent 72%),
    radial-gradient(ellipse 80% 70% at 50% 48%, transparent 58%, rgba(122, 82, 30, 0.28) 100%),
    linear-gradient(168deg, #f4e5ba 0%, #eed8a4 42%, #e6ca8e 100%);
  border: 3px solid #8a5a2b;
  box-shadow:
    inset 0 0 34px rgba(94, 58, 14, 0.3),
    inset 0 0 10px rgba(94, 58, 14, 0.24),
    0 12px 40px rgba(0, 0, 0, 0.6);
  animation: pop 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.modal-body { color: #4a3018; }
.big { font-size: 17px; margin: 6px 0; }
.muted { font-size: 13px; color: #7a5a38; margin: 4px 0; }
.gold { color: #a5711f; }
.bid-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.mini-input {
  width: 120px;
}
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; }
.pass-btn {
  /* 放弃按钮：浅羊皮纸底 + 深色文字，与深木主按钮形成清晰对比（原深棕字在深木底上几乎不可见） */
  color: #3a2410;
  text-shadow: none;
  font-weight: bold;
  background-image:
    radial-gradient(ellipse 60% 42% at 22% 6%, rgba(255, 248, 226, 0.5), transparent 72%),
    linear-gradient(180deg, #f2e3b8 0%, #e8d5a0 55%, #dcc288 100%);
  border: 2px solid #5d3f22;
}
.countdown-tip {
  margin: 10px 0 0;
  text-align: center;
  font-size: 12px;
  color: #8a6a44;
}
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
