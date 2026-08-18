<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'

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
</script>

<template>
  <div class="overlay">
    <!-- 买地 / 买桥 -->
    <div v-if="prompt.type === 'buy' && tile" class="modal">
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
    <div v-else-if="prompt.type === 'bridge-cross'" class="modal">
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
    <div v-else-if="prompt.type === 'start-stop'" class="modal">
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
    <div v-else-if="prompt.type === 'casino'" class="modal">
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
          class="btn primary" :disabled="bet.amount < 100 || bet.amount > prompt.cash"
          @click="respond({ skip: false, bet: Math.floor(bet.amount), choice: bet.choice })"
        >🎲 下注 {{ Math.floor(bet.amount) }}</button>
        <button class="btn" @click="respond({ skip: true })">不下注</button>
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
.warn-text { color: #b0392e; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
.bet-row { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.mini-input {
  width: 110px;
}
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
