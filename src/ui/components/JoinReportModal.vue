<script setup lang="ts">
import { computed } from 'vue'
import { respond, store } from '../store'
import type { Prompt } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ prompt: Extract<Prompt, { type: 'join-report' }> }>()
const target = computed(() => store.state?.players[props.prompt.target] ?? null)
const reporter = computed(() => store.state?.players[store.state?.currentPlayer ?? -1] ?? null)
const probText = computed(() => `${Math.round(props.prompt.currentProb * 100)}%`)
</script>

<template>
  <BaseModal width="sm">
    <div class="join-report">
      <div class="jr-tag">⚖️ 联合举报邀请</div>
      <div class="jr-title">要一起举报「{{ target?.name ?? '垄断者' }}」吗？</div>
      <div class="jr-desc">
        <p v-if="reporter">「{{ reporter.name }}」发起了反垄断举报。</p>
        <p>目标当前已构成垄断，联合举报能显著提高成功率。</p>
        <p class="jr-meta">
          分摊费用 <b>￥{{ prompt.cost }}</b> · 当前（未加入）成功率 <b>{{ probText }}</b>
        </p>
        <p class="jr-hint">加入后按联合人数提升成功率；失败后目标会进入保护期，成功你将分得罚款奖金。</p>
      </div>
      <div class="jr-actions">
        <button class="btn primary" @click="respond({ join: true })">加入举报（-￥{{ prompt.cost }}）</button>
        <button class="btn" @click="respond({ join: false })">不参与</button>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.join-report { text-align: center; }
.jr-tag {
  display: inline-block; padding: 2px 12px; border-radius: 12px;
  background: #6d5630; color: #ffe9b0; font-size: 12px; letter-spacing: 1px;
}
.jr-title { margin: 14px 0 8px; font-size: 19px; font-weight: bold; color: #4a2d12; }
.jr-desc { color: #5a3f22; font-size: 13px; line-height: 1.65; }
.jr-desc p { margin: 3px 0; }
.jr-meta { margin-top: 8px !important; padding: 6px 10px; background: rgba(120, 80, 30, 0.08); border-radius: 8px; }
.jr-meta b { color: #a3541f; }
.jr-hint { color: #8a6a44; font-size: 11px; }
.jr-actions { display: flex; gap: 10px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
</style>
