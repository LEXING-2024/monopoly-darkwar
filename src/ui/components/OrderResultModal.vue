<script setup lang="ts">
import { respond } from '../store'
import type { Prompt } from '../../core/types'

defineProps<{ prompt: Extract<Prompt, { type: 'order-result' }> }>()

const medals = ['🥇', '🥈', '🥉', '④']
</script>

<template>
  <div class="overlay">
    <div class="paper order-card">
      <span class="orn orn-tl">❧</span>
      <span class="orn orn-tr">❧</span>
      <span class="orn orn-bl">✦</span>
      <span class="orn orn-br">✦</span>

      <h2 class="o-title">🗺️ 行动顺序</h2>
      <div class="flourish">─ ❦ ─</div>
      <p class="o-sub">按掷出点数从大到小行动，同点数按座位先后</p>

      <div class="order-list">
        <div
          v-for="(p, i) in prompt.order" :key="p.playerId"
          class="order-row" :class="{ first: i === 0 }"
        >
          <span class="medal">{{ medals[i] ?? `${i + 1}` }}</span>
          <span class="token" :style="{ background: p.color }" />
          <span class="name">{{ p.name }}{{ p.isAI ? '（AI）' : '' }}</span>
          <span class="points">🎲 {{ p.value }} 点</span>
        </div>
      </div>

      <div class="actions">
        <button class="btn primary big" @click="respond(null)">开 始 游 戏</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(20, 12, 4, 0.72);
  display: flex; align-items: center; justify-content: center;
  overflow-y: auto; padding: 24px 14px; z-index: 200; /* 流程弹窗置顶 */
}
.order-card {
  position: relative;
  width: min(420px, 94vw);
  margin: auto;
  padding: 26px 28px 30px;
  text-align: center;
  transform: rotate(-0.3deg);
}
.orn {
  position: absolute;
  font-size: 15px;
  color: #8a5f28;
  opacity: 0.85;
  pointer-events: none;
}
.orn-tl { top: 5px; left: 15px; transform: rotate(8deg); }
.orn-tr { top: 6px; right: 15px; transform: rotate(94deg); }
.orn-bl { bottom: 6px; left: 15px; transform: rotate(-94deg); }
.orn-br { bottom: 7px; right: 15px; transform: rotate(-8deg); }
.o-title {
  margin: 0;
  font-size: 24px;
  letter-spacing: 3px;
  color: #4a2d12;
  text-shadow:
    0 0 3px rgba(74, 45, 18, 0.4),
    1px 1px 0 rgba(255, 240, 200, 0.55),
    2px 3px 4px rgba(64, 34, 0, 0.2);
}
.flourish { margin: 5px 0 4px; color: #8a683c; font-size: 13px; letter-spacing: 2px; }
.o-sub { margin: 0 0 12px; font-size: 12px; color: #7d5f38; }
.order-list { display: flex; flex-direction: column; gap: 7px; }
.order-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 12px;
  background-image:
    var(--tex-paper),
    linear-gradient(168deg, #f6e8c0 0%, #eedcaa 100%);
  border: 1.5px solid #b99a6a;
  border-radius: 8px;
  box-shadow: inset 0 0 12px rgba(120, 80, 25, 0.16);
}
.order-row.first {
  border-color: #c9a227;
  box-shadow: inset 0 0 12px rgba(150, 105, 25, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2);
}
.medal { width: 26px; font-size: 17px; flex: none; }
.token { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35); flex: none; }
.name { flex: 1; text-align: left; font-size: 15px; color: #4a3018; font-weight: bold; }
.points { font-size: 14px; color: #a5711f; font-weight: bold; }
.actions { margin-top: 18px; }
</style>
