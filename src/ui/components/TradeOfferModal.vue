<script setup lang="ts">
import { computed } from 'vue'
import { store, respond } from '../store'
import { RESOURCES } from '../../core/config'
import type { Prompt, ResourceType, TradeOffer } from '../../core/types'
import BaseModal from './BaseModal.vue'

const props = defineProps<{ prompt: Extract<Prompt, { type: 'trade-offer' }> }>()
const from = computed(() => store.state?.players[props.prompt.from] ?? null)

function desc(offer: TradeOffer, tiles: boolean): string[] {
  const parts: string[] = []
  if (offer.cash > 0) parts.push(`💰 ${offer.cash} 现金`)
  if (tiles) {
    for (const t of offer.tiles) {
      const tile = store.state?.tiles[t]
      if (tile) parts.push(`${tile.icon}${tile.name}`)
    }
  }
  for (const r of Object.keys(RESOURCES) as ResourceType[]) {
    const v = offer.resources[r] ?? 0
    if (v > 0) parts.push(`${RESOURCES[r].icon}${RESOURCES[r].name}×${v}`)
  }
  return parts
}

function offerValue(o: TradeOffer): number {
  let v = o.cash
  for (const t of o.tiles) {
    const tile = store.state?.tiles[t]
    if (!tile) continue
    // 与 AI 的 trade 估值口径一致：地价 + 建筑投入（建筑随地块移交）
    v += tile.price + tile.buildings.reduce((a, b) => a + b.invested, 0)
  }
  for (const r of Object.keys(RESOURCES) as ResourceType[]) {
    v += (o.resources[r] ?? 0) * (store.state?.market[r] ?? 0)
  }
  return Math.round(v)
}
</script>

<template>
  <BaseModal width="lg">
      <div class="modal-title">🤝 交易提议</div>
      <div class="modal-body" v-if="from">
        <p class="big">「{{ from.name }}」向你提出交易：</p>
        <div class="cols">
          <div class="col">
            <div class="col-title">你可以获得</div>
            <!-- prompt.give 是提议者付出的资产，即接收方获得的部分 -->
            <p v-for="(d, i) in desc(prompt.give, true)" :key="'g' + i" class="item">{{ d }}</p>
            <p v-if="!desc(prompt.give, true).length" class="muted">（无）</p>
            <p class="value">≈ {{ offerValue(prompt.give) }}</p>
          </div>
          <div class="col">
            <div class="col-title">你需要给出</div>
            <!-- prompt.receive 是提议者索取的资产，即接收方付出的部分 -->
            <p v-for="(d, i) in desc(prompt.receive, false)" :key="'r' + i" class="item">{{ d }}</p>
            <p v-if="!desc(prompt.receive, false).length" class="muted">（无）</p>
            <p class="value">≈ {{ offerValue(prompt.receive) }}</p>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond({ accept: true })">✔ 接受</button>
        <button class="btn" @click="respond({ accept: false })">✖ 拒绝</button>
      </div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.big { font-size: 15px; color: #4a3018; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.col {
  background-image:
    radial-gradient(ellipse 44px 26px at 86% 22%, rgba(255, 250, 232, 0.45), transparent 70%),
    var(--tex-paper),
    linear-gradient(180deg, #faf0d0, #eedcaa);
  border: 1px solid #c9b28a; border-radius: 10px; padding: 8px 10px;
}
.col-title { font-size: 13px; font-weight: bold; color: #8a5a2b; }
.item { font-size: 13px; color: #4a3018; margin: 3px 0; }
.muted { font-size: 12px; color: #a08860; }
.value { font-size: 12px; color: #a5711f; font-weight: bold; margin-top: 4px; }
.modal-actions { display: flex; gap: 12px; margin-top: 16px; justify-content: center; }
</style>
