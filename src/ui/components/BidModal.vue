<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'
import BaseModal from './BaseModal.vue'

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
/** 出价有效性：v-model.number 对非法输入（如 "e"、"1e5"）返回原始字符串，
 *  比较运算符会被强制转换绕过 disabled，必须显式校验有限数字 */
const bidValid = computed(() => {
  const b = bid.value
  return typeof b === 'number' && Number.isFinite(b) &&
    b >= props.prompt.minBid && b <= props.prompt.myCash
})

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
  if (!bidValid.value) return
  respond({ pass: false, bid: Math.floor(bid.value as number) })
}

function onPass(): void {
  stopTimer()
  respond({ pass: true })
}
</script>

<template>
  <BaseModal>
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
          class="btn primary" :disabled="!bidValid"
          @click="onBid"
        >出价 {{ bidValid ? Math.floor(Number(bid)) : '—' }}</button>
        <button class="btn pass-btn" @click="onPass">放弃（{{ left }}s）</button>
      </div>
      <p class="countdown-tip">⏳ {{ left }} 秒内未出价将自动放弃，本场拍卖不再询问</p>
  </BaseModal>
</template>

<style scoped>
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
</style>
