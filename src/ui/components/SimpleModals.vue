<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { respond, store } from '../store'
import { RESOURCES } from '../../core/config'
import type { Prompt } from '../../core/types'

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
  <div class="overlay">
    <!-- 通知 -->
    <div v-if="prompt.type === 'notice'" class="modal">
      <div class="modal-title">{{ prompt.icon }} {{ prompt.title }}</div>
      <div class="modal-body"><p class="big">{{ prompt.text }}</p></div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond(null)">确定</button>
      </div>
    </div>

    <!-- 支付或失去 -->
    <div v-else-if="prompt.type === 'pay-or-lose'" class="modal">
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
    <div v-else-if="prompt.type === 'donate'" class="modal">
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
    <div v-else-if="prompt.type === 'sell-spec'" class="modal">
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
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 200; /* 流程弹窗置顶，高于详情弹窗 */
}
.modal {
  width: min(400px, 92vw); border-radius: 16px; padding: 22px;
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
  text-align: center; animation: pop 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.big { font-size: 15px; color: #4a3018; line-height: 1.55; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
