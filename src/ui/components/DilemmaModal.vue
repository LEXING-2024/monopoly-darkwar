<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'

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
  <div class="overlay">
    <div class="modal">
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
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 200; /* 流程弹窗置顶，高于详情弹窗 */
}
.modal {
  width: min(420px, 92vw); border-radius: 16px; padding: 22px;
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
  text-align: center; animation: pop 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
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
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
