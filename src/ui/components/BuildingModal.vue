<script setup lang="ts">
import { computed } from 'vue'
import { showNoMoney, store } from '../store'
import { BUILDING_DEFS } from '../../core/config'
import { levelCost, repairCost } from '../../core/buildings'

const d = computed(() => store.buildingDetail)
const s = computed(() => store.state)
const me = computed(() => (s.value ? s.value.players[s.value.currentPlayer] : null))
const tile = computed(() => {
  if (!d.value || !s.value) return null
  return s.value.tiles[d.value.tile]
})
const building = computed(() => {
  if (!tile.value || !d.value) return null
  return tile.value.buildings.find(b => b.id === d.value.buildingId) ?? null
})
const def = computed(() => {
  if (!building.value) return null
  return BUILDING_DEFS[building.value.type] ?? null
})
const upgradeCost = computed(() => {
  if (!store.game || !building.value || building.value.level >= 3) return 0
  return levelCost(store.game, building.value.type, building.value.level + 1)
})
const isMine = computed(() => tile.value?.owner === me.value?.id)
const myTurn = computed(() =>
  !!s.value && !!me.value && !me.value.isAI &&
  s.value.phase === 'action' &&
  (!store.prompt || store.prompt.type === 'action'),
)

function close(): void {
  store.buildingDetail = null
}

/** 资金不足统一弹层（需确认关闭），现金够则直接执行 */
function noMoneyOr(fn: () => void, cost: number, what: string): void {
  if (!me.value || !store.game) return
  if (me.value.cash < cost) {
    showNoMoney(cost, what)
    return
  }
  fn()
}

function onUpgrade(): void {
  if (!building.value || !tile.value || !store.game) return
  noMoneyOr(() => {
    store.game?.upgradeAt(tile.value!.index, building.value!.id)
    close()
  }, upgradeCost.value, `升级「${def.value?.name ?? '建筑'}」`)
}

function onRepair(): void {
  if (!building.value || !tile.value || !store.game) return
  noMoneyOr(() => {
    store.game?.repairAt(tile.value!.index, building.value!.id)
    close()
  }, repairCost(store.game, building.value), '修理')
}
</script>

<template>
  <div v-if="d && tile && building && def" class="overlay" @click.self="close">
    <div class="modal">
      <div class="modal-title">
        {{ def.icon }} {{ def.name }}
        <span class="lv" v-if="building.level > 1">Lv{{ building.level }}</span>
      </div>
      <div class="modal-body">
        <p class="big">{{ tile.icon }} {{ tile.name }}</p>
        <p class="muted">{{ def.desc }}</p>
        <p class="muted" v-if="def.category === 'commercial'">商业建筑：不限地形，提升本格租金</p>
        <p class="muted" v-else-if="def.category === 'production'">生产建筑：提升本格资源产出</p>
        <p class="muted" v-else-if="def.category === 'protection'">防灾建筑：本格免受对应灾害影响</p>
        <p class="muted" v-else>科技建筑：全局增益</p>
        <p class="muted">等级 {{ building.level }} / 3 · 主人：{{ tile.owner !== null ? s.players[tile.owner].name : '无' }}</p>
      </div>
      <div class="modal-actions">
        <button
          v-if="myTurn && isMine && building.level < 3"
          class="btn primary" :disabled="(s?.ops.upgrade ?? 0) <= 0"
          :title="(s?.ops.upgrade ?? 0) <= 0 ? '本回合升级次数已用完（每回合 1 次）' : ''"
          @click="onUpgrade"
        >⬆️ 升级（￥{{ upgradeCost }}）</button>
        <button
          v-if="myTurn && isMine && building.level < 3 && building.damaged"
          class="btn"
          :disabled="(s?.ops.repair ?? 0) <= 0"
          :title="(s?.ops.repair ?? 0) <= 0 ? '本回合修理次数已用完（每回合 1 次）' : ''"
          @click="onRepair"
        >🔧 修理（￥{{ repairCost(store.game!, building) }}）</button>
        <button class="btn" @click="close">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 150; /* 详情弹窗：低于流程弹窗 */
}
.modal {
  width: min(360px, 92vw); border-radius: 16px; padding: 22px; text-align: center;
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
.lv {
  font-size: 13px; background: #c9a227; color: #fff8e8; border-radius: 10px;
  padding: 1px 8px; margin-left: 6px; vertical-align: middle;
}
.modal-body { color: #4a3018; }
.big { font-size: 16px; margin: 6px 0; color: #4a3018; }
.muted { font-size: 13px; color: #7a5a38; margin: 4px 0; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
