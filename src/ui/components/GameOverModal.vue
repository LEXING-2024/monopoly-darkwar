<script setup lang="ts">
import { computed } from 'vue'
import { store, backToMenu } from '../store'
import { totalValue } from '../../core/economy'
import BaseModal from './BaseModal.vue'

const s = computed(() => store.state)
const winner = computed(() => (s.value ? s.value.players[s.value.winner ?? 0] : null))
const ranking = computed(() => {
  if (!s.value || !store.game) return []
  return [...s.value.players].sort(
    (a, b) => totalValue(store.game!, b.id) - totalValue(store.game!, a.id),
  )
})
const endText = computed(() => {
  switch (s.value?.endReason) {
    case 'timeout': return '行动数达到上限，按总资产判定胜负'
    case 'monopoly': return '垄断判决：集齐整类资源地块，直接获胜'
    default: return '淘汰了所有对手，成为唯一的幸存者'
  }
})
</script>

<template>
  <BaseModal width="lg" :dim="0.78" :z="160" padding="26px" v-if="winner">
      <div class="trophy">🏆</div>
      <div class="winner-name" :style="{ color: winner.color }">{{ winner.name }} 获胜！</div>
      <div class="muted">{{ endText }}</div>

      <div class="rank-list">
        <div
          v-for="(p, i) in ranking" :key="p.id"
          class="rank-row" :class="{ dead: !p.alive }"
        >
          <span class="rank-no">{{ i + 1 }}</span>
          <span class="rank-dot" :style="{ background: p.color }" />
          <span class="rank-name">{{ p.name }}{{ p.isAI ? '(AI)' : '' }}</span>
          <span class="rank-val">资产 {{ store.game ? totalValue(store.game, p.id) : 0 }}</span>
        </div>
      </div>

      <div class="stats muted">共 {{ s?.totalRound ?? s?.round }} 回合 · 第 {{ s?.year }} 年 · {{ s?.season }}季</div>
      <div class="modal-actions">
        <button class="btn primary" @click="backToMenu">返回主菜单</button>
      </div>
  </BaseModal>
</template>

<style scoped>
.trophy { font-size: 64px; }
.winner-name { font-size: 26px; font-weight: bold; margin: 6px 0 2px; }
.muted { font-size: 13px; color: #7a5a38; }
.rank-list { margin: 16px 0 8px; display: flex; flex-direction: column; gap: 5px; }
.rank-row {
  display: flex; align-items: center; gap: 10px; padding: 7px 12px;
  background: #fdf6e3; border: 1px solid #c9b28a; border-radius: 10px; font-size: 14px;
}
.rank-row.dead { opacity: 0.6; }
.rank-no { color: #a5711f; font-weight: bold; }
.rank-dot { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #fff; }
.rank-name { flex: 1; text-align: left; color: #4a3018; }
.rank-val { color: #6a4a28; }
.modal-actions { margin-top: 14px; }
</style>
