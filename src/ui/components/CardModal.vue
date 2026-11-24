<script setup lang="ts">
import { computed } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ prompt: Extract<Prompt, { type: 'card' }> }>()
const isFate = computed(() => props.prompt.category === 'fate')
const player = computed(() => store.state?.players[props.prompt.player] ?? null)
</script>

<template>
  <BaseModal width="sm">
    <div :class="isFate ? 'fate' : 'chance'">
      <div class="card-top">
        <span class="card-tag">{{ isFate ? '⏳ 命运卡' : '🎁 机会卡' }}</span>
        <span class="card-who" v-if="player">
          <span class="dot" :style="{ background: player.color }" />{{ player.name }}
        </span>
      </div>
      <div class="card-icon">{{ prompt.icon }}</div>
      <div class="card-name">{{ prompt.name }}</div>
      <div class="card-desc">{{ prompt.desc }}</div>
      <div v-if="prompt.cost" class="card-cost">
        费用 <b>￥{{ prompt.cost }}</b>
        <span v-if="prompt.costNote" class="cost-note">{{ prompt.costNote }}</span>
        <span v-else class="cost-note">执行时扣除，资金不足将无法执行</span>
      </div>
      <div class="card-actions">
        <template v-if="prompt.canDecline">
          <button class="btn primary" @click="respond({ accept: true })">✔ 执行</button>
          <button class="btn" @click="respond({ accept: false })">✖ 放弃</button>
        </template>
        <button v-else class="btn primary" @click="respond({ accept: true })">确定</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.card-top { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.card-tag {
  padding: 2px 10px; border-radius: 12px; color: #f2e6c8;
  border: 1px solid rgba(255, 240, 200, 0.4);
}
.fate .card-tag { background: #5b4a8a; }
.chance .card-tag { background: #a3761f; }
.card-who { display: flex; align-items: center; gap: 5px; color: #6a4a28; }
.dot { width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid #fff; display: inline-block; }
.card-icon { font-size: 58px; margin: 10px 0 2px; }
.card-name { color: #4a2d12; font-size: 21px; font-weight: bold; letter-spacing: 1px; }
.card-desc { color: #5a3f22; font-size: 14px; line-height: 1.55; margin: 10px 0 10px; }
.card-cost {
  margin: 0 0 16px; padding: 7px 10px; border-radius: 8px;
  background: rgba(120, 80, 30, 0.08); border: 1px dashed rgba(120, 80, 30, 0.35);
  color: #6a4a28; font-size: 13px; line-height: 1.5;
}
.card-cost b { color: #a3541f; font-size: 15px; }
.cost-note { display: block; color: #8a6a44; font-size: 11px; margin-top: 2px; }
.card-actions { display: flex; gap: 12px; justify-content: center; }
</style>
