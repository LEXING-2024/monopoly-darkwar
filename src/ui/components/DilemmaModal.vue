<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ prompt: Extract<Prompt, { type: 'dilemma' }> }>()
const me = computed(() => store.state?.players[props.prompt.player] ?? null)
const chosen = ref<'cooperate' | 'betray' | null>(null)

let closeTimer: ReturnType<typeof setTimeout> | null = null

function pick(c: 'cooperate' | 'betray'): void {
  if (chosen.value) return
  chosen.value = c
  // 延迟确认让玩家看到自己的选择；回调时校验当前弹窗仍是本困境弹窗，
  // 防止延迟 respond 误关后续弹窗（与 WheelModal 同类问题）
  const p = props.prompt
  closeTimer = setTimeout(() => {
    if (store.prompt === p) respond(c)
  }, 450)
}

onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <BaseModal width="min(420px, 92vw)">
      <div class="modal-title">🤝 囚徒困境</div>
      <div class="modal-body">
        <p v-if="me" class="big">
          <span class="dot" :style="{ background: me.color }" />{{ me.name }} 与 {{ prompt.other }} 共同开发新资源
        </p>
        <table class="matrix">
          <tbody>
            <tr><th></th><th>对方合作</th><th>对方背叛</th></tr>
            <tr><th>你合作</th><td class="good">各 +2000</td><td class="bad">你 -1000 / 对方 +3000</td></tr>
            <tr><th>你背叛</th><td class="good">你 +3000 / 对方 -1000</td><td class="mid">各 -500</td></tr>
          </tbody>
        </table>
        <p class="muted">双方同时选择，结果公布前互不可见</p>
      </div>
      <div class="modal-actions">
        <button
          class="btn primary" :class="{ picked: chosen === 'cooperate' }"
          :disabled="!!chosen" @click="pick('cooperate')"
        >🤝 合作</button>
        <button
          class="btn danger-btn" :class="{ picked: chosen === 'betray' }"
          :disabled="!!chosen" @click="pick('betray')"
        >😈 背叛</button>
      </div>
      <div v-if="chosen" class="locked">已选择{{ chosen === 'cooperate' ? '合作' : '背叛' }}，等待对方…</div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.big { font-size: 16px; margin: 6px 0; color: #4a3018; display: flex; align-items: center; justify-content: center; gap: 7px; }
.dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; display: inline-block; }
.matrix { margin: 10px auto; border-collapse: collapse; font-size: 12.5px; }
.matrix th, .matrix td { border: 1px solid #b99a6a; padding: 5px 9px; }
.matrix th { background: #e8d8b0; color: #5a3a1a; }
.good { color: #2e7d46; } .bad { color: #b0392e; } .mid { color: #8a6a44; }
.muted { font-size: 12px; color: #7a5a38; }
.modal-actions { display: flex; gap: 14px; margin-top: 14px; justify-content: center; }
.picked { outline: 3px solid #ffd76a; }
.locked { margin-top: 10px; color: #a5711f; font-size: 13px; }
</style>
