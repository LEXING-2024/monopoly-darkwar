<script setup lang="ts">
import { computed } from 'vue'
import { showNoMoney, store } from '../store'
import { BUILDING_DEFS } from '../../core/config'
import { levelCost, repairCost } from '../../core/buildings'
import BaseModal from './BaseModal.vue'
import Icon from './Icon.vue'

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
  <BaseModal v-if="d && tile && building && def" width="sm" :z="150" @backdrop="close">
      <div class="modal-title">
        <Icon name="building" :size="18" /> {{ def.name }}
        <span class="lv" v-if="building.level > 1">Lv{{ building.level }}</span>
      </div>
      <div class="modal-body">
        <p class="big"><Icon name="map" :size="14" /> {{ tile.name }}</p>
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
        ><Icon name="arrowUp" :size="13" /> 升级（￥{{ upgradeCost }}）</button>
        <button
          v-if="myTurn && isMine && building.level < 3 && building.damaged"
          class="btn"
          :disabled="(s?.ops.repair ?? 0) <= 0"
          :title="(s?.ops.repair ?? 0) <= 0 ? '本回合修理次数已用完（每回合 1 次）' : ''"
          @click="onRepair"
        ><Icon name="hammer" :size="13" /> 修理（￥{{ repairCost(store.game!, building) }}）</button>
        <button class="btn" @click="close">关闭</button>
      </div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.lv {
  font-size: 13px; background: #c9a227; color: #fff8e8; border-radius: 10px;
  padding: 1px 8px; margin-left: 6px; vertical-align: middle;
}
.modal-body { color: #4a3018; }
.big { font-size: 16px; margin: 6px 0; color: #4a3018; }
.muted { font-size: 13px; color: #7a5a38; margin: 4px 0; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
.modal-actions .btn { white-space: nowrap; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
