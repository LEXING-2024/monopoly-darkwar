<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { respond, store } from '../store'
import { RESOURCES } from '../../core/config'
import type { Prompt } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  prompt: Extract<Prompt, { type: 'notice' | 'pay-or-lose' | 'donate' | 'sell-spec' }>
}>()

const specIncome = computed(() => {
  if (props.prompt.type !== 'sell-spec') return 0
  return Math.round(props.prompt.units * props.prompt.price)
})

// AI 回合的通知自动关闭（auto 在发起时刻由 game.notice 确定，人类回合的通知必须点确定）
const autoClose = computed(() => props.prompt.type === 'notice' && props.prompt.auto === true)
let timer: ReturnType<typeof setTimeout> | null = null
onMounted(() => {
  if (autoClose.value) timer = setTimeout(() => respond(null), 2600)
})
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <BaseModal width="min(400px, 92vw)">
    <!-- 通知 -->
    <div v-if="prompt.type === 'notice'">
      <div class="modal-title">{{ prompt.icon }} {{ prompt.title }}</div>
      <div class="modal-body"><p class="big">{{ prompt.text }}</p></div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond(null)">确定</button>
      </div>
    </div>

    <!-- 支付或失去 -->
    <div v-else-if="prompt.type === 'pay-or-lose'">
      <div class="modal-title">⚖️ {{ prompt.title }}</div>
      <div class="modal-body">
        <p class="big">{{ prompt.desc }}</p>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond('pay')">💰 支付 ￥{{ prompt.cost }}</button>
        <button class="btn danger-btn" @click="respond('lose')">{{ prompt.loseDesc }}</button>
      </div>
    </div>

    <!-- 捐款 -->
    <div v-else-if="prompt.type === 'donate'">
      <div class="modal-title">🌉 {{ prompt.title }}</div>
      <div class="modal-body"><p class="big">{{ prompt.desc }}</p></div>
      <div class="modal-actions">
        <button class="btn" @click="respond(0)">不出资</button>
        <button class="btn" @click="respond(200)">出 200</button>
        <button class="btn" @click="respond(500)">出 500</button>
        <button class="btn primary" @click="respond(prompt.target)">包了（{{ prompt.target }}）</button>
      </div>
    </div>

    <!-- 投机资源结算 -->
    <div v-else-if="prompt.type === 'sell-spec'">
      <div class="modal-title">📈 投机资源到期</div>
      <div class="modal-body">
        <p class="big">
          {{ RESOURCES[prompt.resource].icon }} {{ RESOURCES[prompt.resource].name }} ×{{ prompt.units }}，
          当前市价 ￥{{ prompt.price }}（可卖出 ￥{{ specIncome }}）
        </p>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond({ sell: true })">💰 卖出（+{{ specIncome }}）</button>
        <button class="btn" @click="respond({ sell: false })">继续持有</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.big { font-size: 15px; color: #4a3018; line-height: 1.55; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
</style>
