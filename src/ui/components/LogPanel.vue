<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../store'
import Icon from './Icon.vue'

const logs = computed(() => store.state?.log ?? [])
</script>

<template>
  <div class="paper card log-card">
    <div class="head">
      <span class="h-title"><Icon name="scroll" :size="13" /> 行动日志</span>
      <span class="h-count">{{ logs.length }}</span>
    </div>
    <div class="log-list">
      <div v-for="(l, i) in logs" :key="logs.length - i" class="log-row">
        <span class="turn">{{ l.round ?? l.turn }}</span>
        <span class="txt">{{ l.text }}</span>
      </div>
      <div v-if="!logs.length" class="empty">尚无记录</div>
    </div>
  </div>
</template>

<style scoped>
.log-card {
  padding: 8px 12px 9px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  /* 高度由 style.css 的 .panel > .panel-scroll + .paper.card 按屏幕统一分配（clamp 平滑），
     此处不再设 flex/height，避免与其冲突导致条数忽多忽少 */
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--ink-3);
  border-bottom: 1px dashed rgba(160, 120, 60, 0.45);
  padding-bottom: 4px;
  margin-bottom: 4px;
}
.h-title { display: inline-flex; align-items: center; gap: 4px; letter-spacing: 1px; }
.h-count {
  font-family: var(--font-num);
  font-size: 10px;
  color: var(--ink-4);
  border: 1px solid rgba(138, 95, 31, 0.3);
  border-radius: 5px;
  padding: 0 4px;
}
.log-card::after {
  content: '';
  position: absolute;
  inset: 34px 12px 12px;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    180deg,
    transparent 0,
    transparent 22px,
    rgba(138, 95, 31, 0.09) 22px,
    rgba(138, 95, 31, 0.09) 23px
  );
  -webkit-mask-image: linear-gradient(180deg, transparent, #000 8%, #000 88%, transparent);
  mask-image: linear-gradient(180deg, transparent, #000 8%, #000 88%, transparent);
}
.log-list { position: relative; z-index: 1; overflow-y: auto; font-size: 11.5px; color: #5a3f22; flex: 1; min-height: 0; padding-right: 2px; }
.log-row {
  display: flex;
  gap: 5px;
  padding: 2.5px 0;
  border-bottom: 1px dotted rgba(160, 120, 60, 0.3);
  line-height: 1.45;
}
.log-row:last-child { border-bottom: 0; }
.turn {
  flex: none;
  color: #9a7a48;
  font-family: var(--font-num);
  font-size: 10px;
  min-width: 18px;
  text-align: right;
  padding-top: 1px;
}
.txt { min-width: 0; word-break: break-word; }
.empty { color: var(--ink-4); font-size: 11px; padding: 8px 0; text-align: center; }
/* 移动端同样按屏幕高度平滑分配，避免固定高度导致条数与其他屏幕差异过大 */
html.is-mobile .log-card { height: clamp(132px, 22dvh, 190px); flex: 0 0 auto; min-height: 0; }
</style>
