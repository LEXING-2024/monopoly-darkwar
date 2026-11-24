<script setup lang="ts">
import { computed } from 'vue'
import { backToMenu, setSpeed, store } from '../store'
import BaseModal from './BaseModal.vue'

const data = computed(() => store.eliminated!)
const player = computed(() => store.state?.players[data.value.playerId] ?? null)
const alive = computed(() => store.state?.players.filter(p => p.alive).length ?? 0)

function spectate(): void {
  store.eliminated = null
  setSpeed('fast')
}
</script>

<template>
  <BaseModal width="sm">
    <div class="eliminated">
      <div class="el-icon">💸</div>
      <div class="el-title">你已出局</div>
      <div class="el-sub" v-if="player">「{{ player.name }}」{{ data.reason }}</div>
      <div class="el-stats">
        <div><span>最终排名</span><b>第 {{ data.rank }} 名</b></div>
        <div><span>移交资产</span><b>￥{{ data.assets }}</b></div>
        <div><span>场上剩余</span><b>{{ alive }} 人</b></div>
      </div>
      <p class="el-hint">你仍可以快进观战，看这场博弈的结局。</p>
      <div class="el-actions">
        <button class="btn primary" @click="spectate">快进观战</button>
        <button class="btn" @click="backToMenu">返回主页</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.eliminated { text-align: center; }
.el-icon { font-size: 48px; margin-top: 2px; }
.el-title { font-size: 23px; font-weight: bold; color: #4a2d12; letter-spacing: 2px; margin: 4px 0; }
.el-sub { color: #7a5430; font-size: 13px; margin-bottom: 12px; }
.el-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  padding: 10px; border-radius: 10px; background: rgba(120, 80, 30, 0.08);
}
.el-stats div { display: flex; flex-direction: column; gap: 3px; }
.el-stats span { color: #8a6a44; font-size: 11px; }
.el-stats b { color: #a3541f; font-size: 16px; }
.el-hint { color: #8a6a44; font-size: 12px; margin: 12px 0 14px; }
.el-actions { display: flex; gap: 10px; justify-content: center; }
</style>
