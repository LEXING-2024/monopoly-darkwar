<script setup lang="ts">
import { computed } from 'vue'
import { store, backToMenu } from '../store'
import { totalValue } from '../../core/economy'

const s = computed(() => store.state)
const winner = computed(() => (s.value ? s.value.players[s.value.winner ?? 0] : null))
const ranking = computed(() => {
  if (!s.value || !store.game) return []
  return [...s.value.players].sort(
    (a, b) => totalValue(store.game!, b.id) - totalValue(store.game!, a.id),
  )
})
</script>

<template>
  <div class="overlay">
    <div class="modal" v-if="winner">
      <div class="trophy">🏆</div>
      <div class="winner-name" :style="{ color: winner.color }">{{ winner.name }} 获胜！</div>
      <div class="muted">垄断了整个沙盘，成为唯一的幸存者</div>

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
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.78);
  display: flex; align-items: center; justify-content: center; z-index: 160;
}
.modal {
  width: min(430px, 92vw); border-radius: 16px; padding: 26px;
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
  text-align: center; animation: pop 0.4s cubic-bezier(0.3, 1.4, 0.5, 1);
}
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
@keyframes pop { from { transform: scale(0.6); opacity: 0; } }
</style>
