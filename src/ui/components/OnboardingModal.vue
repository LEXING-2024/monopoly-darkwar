<script setup lang="ts">
import { onMounted, ref } from 'vue'
import BaseModal from './BaseModal.vue'

const KEY = 'monopoly-onboarding-v1'
const visible = ref(false)
const step = ref(0)

const pages = [
  {
    icon: '🎯',
    title: '目标：让对手破产',
    body: '垄断不是胜利条件，而是压制全桌的武器。真正的胜负只有一条：把对手的现金流逼断，让他们逐个出局。',
  },
  {
    icon: '🎲',
    title: '一个回合怎么打',
    body: '转盘决定步数 → 落点买地/交租/抽卡 → 进入行动阶段。每回合可建造 1 次、升级 1 次、修理 1 次、勘探 1 次，还能使用垄断手段。',
  },
  {
    icon: '⚖️',
    title: '垄断与反垄断',
    body: '某一地形份额达到门槛（4 人局 50%，8 人局 70%）即可限产抬价、断供、桥梁提价；但垄断者也会被全桌联合举报，超额垄断罚款更重。',
  },
]

onMounted(() => {
  try {
    if (!localStorage.getItem(KEY)) visible.value = true
  } catch { visible.value = true }
})

function next(): void {
  if (step.value < pages.length - 1) { step.value++; return }
  close()
}
function close(): void {
  visible.value = false
  try { localStorage.setItem(KEY, '1') } catch { /* 隐私模式忽略 */ }
}
</script>

<template>
  <BaseModal v-if="visible" width="sm">
    <div class="onboarding">
      <div class="ob-step">新手引导 {{ step + 1 }} / {{ pages.length }}</div>
      <div class="ob-icon">{{ pages[step].icon }}</div>
      <div class="ob-title">{{ pages[step].title }}</div>
      <div class="ob-body">{{ pages[step].body }}</div>
      <div class="ob-dots">
        <span v-for="(_, i) in pages" :key="i" :class="{ active: i === step }" />
      </div>
      <div class="ob-actions">
        <button class="btn" @click="close">跳过</button>
        <button class="btn primary" @click="next">{{ step < pages.length - 1 ? '下一步' : '开始游戏' }}</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.onboarding { text-align: center; }
.ob-step { color: #8a6a44; font-size: 11px; letter-spacing: 2px; }
.ob-icon { font-size: 46px; margin: 8px 0 2px; }
.ob-title { font-size: 20px; font-weight: bold; color: #4a2d12; margin-bottom: 8px; }
.ob-body { color: #5a3f22; font-size: 14px; line-height: 1.75; text-align: left; min-height: 74px; }
.ob-dots { display: flex; gap: 6px; justify-content: center; margin: 12px 0 14px; }
.ob-dots span { width: 8px; height: 8px; border-radius: 50%; background: #d8c19c; }
.ob-dots span.active { background: #a3541f; }
.ob-actions { display: flex; gap: 10px; justify-content: center; }
</style>
