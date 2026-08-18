<script setup lang="ts">
import { computed } from 'vue'
import { store, respond } from '../store'
import type { Prompt } from '../../core/types'

const props = defineProps<{ prompt: Extract<Prompt, { type: 'card' }> }>()
const isFate = computed(() => props.prompt.category === 'fate')
const player = computed(() => store.state?.players[props.prompt.player] ?? null)
</script>

<template>
  <div class="overlay">
    <div class="card-modal" :class="isFate ? 'fate' : 'chance'">
      <div class="card-top">
        <span class="card-tag">{{ isFate ? '⏳ 命运卡' : '🎁 机会卡' }}</span>
        <span class="card-who" v-if="player">
          <span class="dot" :style="{ background: player.color }" />{{ player.name }}
        </span>
      </div>
      <div class="card-icon">{{ prompt.icon }}</div>
      <div class="card-name">{{ prompt.name }}</div>
      <div class="card-desc">{{ prompt.desc }}</div>
      <div class="card-actions">
        <template v-if="prompt.canDecline">
          <button class="btn primary" @click="respond({ accept: true })">✔ 执行</button>
          <button class="btn" @click="respond({ accept: false })">✖ 放弃</button>
        </template>
        <button v-else class="btn primary" @click="respond({ accept: true })">确定</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 200; /* 流程弹窗置顶，高于详情弹窗 */
}
.card-modal {
  width: min(360px, 92vw); border-radius: 16px; padding: 22px; text-align: center;
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
  animation: pop 0.28s cubic-bezier(0.3, 1.4, 0.5, 1);
}
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
.card-desc { color: #5a3f22; font-size: 14px; line-height: 1.55; margin: 10px 0 16px; }
.card-actions { display: flex; gap: 12px; justify-content: center; }
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
