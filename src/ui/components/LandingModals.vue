<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  prompt: Extract<Prompt, { type: 'buy' | 'start-stop' | 'casino' | 'bridge-cross' }>
}>()

const tile = computed(() => (props.prompt.type === 'buy' ? store.state?.tiles[props.prompt.tile] : null))
const bridgeName = computed(() => (props.prompt.type === 'bridge-cross' ? store.state?.tiles[props.prompt.bridge].name : ''))
const isWinter = computed(() => store.state?.season === 'winter')

// 赌场
const bet = reactive({ amount: 200, choice: 'big' as 'big' | 'small' })
watch(
  () => props.prompt,
  p => {
    if (p.type === 'casino') bet.amount = Math.min(200, p.cash)
  },
  { immediate: true },
)
/** 下注有效性：v-model.number 对非法输入（如 "e"、"1e5"）返回原始字符串，
 *  比较运算符会被强制转换绕过 disabled，必须显式校验有限数字 */
const betValid = computed(() => {
  if (props.prompt.type !== 'casino') return false
  const a = bet.amount
  return typeof a === 'number' && Number.isFinite(a) && a >= 100 && a <= props.prompt.cash
})
function onBet(): void {
  if (!betValid.value) return
  respond({ skip: false, bet: Math.floor(bet.amount), choice: bet.choice })
}
</script>

<template>
  <BaseModal>
    <!-- 买地 / 买桥 -->
    <div v-if="prompt.type === 'buy' && tile">
      <div class="modal-title">{{ tile.type === 'bridge' ? '🌉 桥梁出售' : '🏞️ 空地出售' }}</div>
      <div class="modal-body">
        <p class="big">{{ tile.icon }} {{ tile.name }}</p>
        <p class="muted">价格 <b class="gold">￥{{ prompt.price }}</b> 现金</p>
        <p class="muted" v-if="tile.type === 'terrain'">基础租金 ￥{{ tile.baseRent }} / 回合产出资源可出售</p>
        <p class="muted" v-else>购买后过路费归桥主，可升级提高收费</p>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond({ buy: true })">✔ 购买</button>
        <button class="btn" @click="respond({ buy: false })">放弃</button>
      </div>
    </div>

    <!-- 桥前绕行：付过路费过桥，或绕行多花 3 步免过路费（冬季为踏冰） -->
    <div v-else-if="prompt.type === 'bridge-cross'">
      <div class="modal-title">{{ isWinter ? '🧊 河面结冰' : '🌉 桥前收费' }}</div>
      <div class="modal-body">
        <p class="big">{{ bridgeName }}</p>
        <p class="muted">前方「{{ bridgeName }}」收取过路费 <b class="gold">￥{{ prompt.toll }}</b>，你可以：</p>
        <p class="muted">{{ isWinter ? '🧊 踏冰绕行' : '🛤️ 绕行' }}（<b class="gold">3 步</b>）：免交过路费，多花 1 步路程。</p>
        <p class="muted">或正常过桥：支付过路费 ￥{{ prompt.toll }}。</p>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond({ bypass: true })">{{ isWinter ? '🧊 踏冰绕行' : '🛤️ 绕行（3 步）' }}</button>
        <button class="btn" @click="respond({ bypass: false })">付过路费过桥</button>
      </div>
    </div>

    <!-- 起点停留 -->
    <div v-else-if="prompt.type === 'start-stop'">
      <div class="modal-title">🏠 停靠起点</div>
      <div class="modal-body">
        <p class="muted">可在起点小屋休整：</p>
        <p v-if="prompt.damagedCount > 0" class="big">
          🔧 8 折修理全部受损建筑（{{ prompt.damagedCount }} 座，共 {{ prompt.repairCost }}）
        </p>
        <p v-else class="muted">🔧 没有受损建筑需要修理</p>
        <p class="muted">🛌 免费休息：下回合移动步数 -1</p>
      </div>
      <div class="modal-actions">
        <button
          v-if="prompt.damagedCount > 0" class="btn primary"
          @click="respond('repair')"
        >🔧 修理（{{ prompt.repairCost }}）</button>
        <button class="btn" @click="respond('rest')">🛌 休息</button>
        <button class="btn" @click="respond('skip')">跳过</button>
      </div>
    </div>

    <!-- 赌场 -->
    <div v-else-if="prompt.type === 'casino'">
      <div class="modal-title">🎰 赌场</div>
      <div class="modal-body">
        <p class="muted">下注猜你下次转盘结果：</p>
        <p class="muted">押「大」= 7~12 步，押「小」= 1~6 步，赔率 2 倍</p>
        <p class="muted warn-text">转到空仓格(0)，庄家通吃！</p>
        <div class="bet-row">
          <span class="muted">下注金额</span>
          <input v-model.number="bet.amount" type="number" :min="100" :max="prompt.cash" step="100" class="paper-input mini-input" />
        </div>
        <div class="bet-row">
          <span class="muted">押注</span>
          <button class="btn small" :class="{ active: bet.choice === 'big' }" @click="bet.choice = 'big'">大（7~12）</button>
          <button class="btn small" :class="{ active: bet.choice === 'small' }" @click="bet.choice = 'small'">小（1~6）</button>
        </div>
      </div>
      <div class="modal-actions">
        <button
          class="btn primary" :disabled="!betValid"
          @click="onBet"
        >🎲 下注 {{ betValid ? Math.floor(Number(bet.amount)) : '—' }}</button>
        <button class="btn" @click="respond({ skip: true })">不下注</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.modal-body { color: #4a3018; }
.big { font-size: 17px; margin: 6px 0; }
.muted { font-size: 13px; color: #7a5a38; margin: 4px 0; }
.gold { color: #a5711f; }
.warn-text { color: #b0392e; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
.bet-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.mini-input {
  width: 110px;
}
</style>
