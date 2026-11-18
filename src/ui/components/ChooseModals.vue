<script setup lang="ts">
import { computed } from 'vue'
import { respond, store } from '../store'
import { RESOURCES } from '../../core/config'
import type { Prompt, Terrain } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{
  prompt: Extract<Prompt, { type: 'choose-resource' | 'choose-tile' | 'choose-terrain' }>
}>()

const isResource = computed(() => props.prompt.type === 'choose-resource')
const isTerrain = computed(() => props.prompt.type === 'choose-terrain')

const TERRAIN_META: Record<Terrain, { name: string; icon: string }> = {
  forest: { name: '森林', icon: '🌲' },
  plateau: { name: '高原', icon: '🐄' },
  desert: { name: '沙漠', icon: '⛽' },
  coast: { name: '沿海', icon: '🐟' },
}
</script>

<template>
  <BaseModal width="md" scroll>
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

        <div v-else-if="isTerrain" class="options">
          <button
            v-for="terrain in prompt.options" :key="terrain"
            class="opt paper-input" @click="respond(terrain)"
          >
            <span class="opt-icon">{{ TERRAIN_META[terrain].icon }}</span>
            {{ TERRAIN_META[terrain].name }}区
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
  </BaseModal>
</template>

<style scoped>
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
</style>
