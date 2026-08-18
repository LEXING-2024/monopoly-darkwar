<script setup lang="ts">
import { computed } from 'vue'
import { respond, store } from '../store'
import { RESOURCES } from '../../core/config'
import type { Prompt } from '../../core/types'

const props = defineProps<{
  prompt: Extract<Prompt, { type: 'choose-resource' | 'choose-tile' }>
}>()

const isResource = computed(() => props.prompt.type === 'choose-resource')
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <div class="modal-title">{{ prompt.title }}</div>
      <div class="modal-body">
        <p class="big">{{ prompt.desc }}</p>

        <div v-if="isResource" class="options">
          <button
            v-for="r in prompt.options" :key="r"
            class="opt paper-input" @click="respond(r)"
          >
            <span class="opt-icon">{{ RESOURCES[r].icon }}</span>
            {{ RESOURCES[r].name }}
            <span class="opt-price">市价 ￥{{ store.state?.market[r] }}</span>
          </button>
        </div>

        <div v-else class="options">
          <button
            v-for="t in prompt.tiles" :key="t"
            class="opt paper-input" @click="respond(t)"
          >
            <span class="opt-icon">{{ store.state?.tiles[t].icon }}</span>
            {{ store.state?.tiles[t].name }}
            <span v-if="store.state?.tiles[t].price" class="opt-price">价格 ￥{{ store.state?.tiles[t].price }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 200; /* 流程弹窗置顶，高于详情弹窗 */
}
.modal {
  width: min(400px, 92vw); max-height: 86vh; overflow-y: auto;
  border-radius: 16px; padding: 22px;
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
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 8px; }
.big { font-size: 14px; color: #4a3018; }
.options { display: flex; flex-direction: column; gap: 7px; margin-top: 12px; }
.opt {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  border-radius: 12px; cursor: pointer;
  cursor: pointer; font-size: 15px; color: #4a3018; transition: all 0.12s;
}
.opt:hover { background: #fff2c8; border-color: #d9a53d; transform: translateY(-1px); }
.opt-icon { font-size: 20px; }
.opt-price { margin-left: auto; font-size: 12px; color: #8a6a44; }
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
