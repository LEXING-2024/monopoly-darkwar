<script setup lang="ts">
import { computed } from 'vue'
import { store } from '../store'

const logs = computed(() => store.state?.log ?? [])
</script>

<template>
  <div class="paper card">
    <div class="head">📜 行动日志</div>
    <div class="log-list">
      <div v-for="(l, i) in logs" :key="logs.length - i" class="log-row">
        <span class="turn">[第{{ l.round ?? l.turn }}回合]</span>{{ l.text }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  padding: 10px 14px; display: flex; flex-direction: column; min-height: 0;
  flex: none; height: 170px;   /* 固定高度：日志区始终占满预留空间，条目在内部自上而下填充 */
}
.head { font-size: 12px; color: #8a6a44; margin-bottom: 4px; }
.log-list { overflow-y: auto; font-size: 12px; color: #5a3f22; flex: 1; min-height: 0; }
.log-row { padding: 2px 0; border-bottom: 1px dotted #d9c9a0; }
.turn { color: #b08a50; margin-right: 4px; }
</style>
