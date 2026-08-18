<script setup lang="ts">
import { computed } from 'vue'
import { store, respond } from '../store'
import { RESOURCES } from '../../core/config'
import type { Prompt, ResourceType, TradeOffer } from '../../core/types'

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
  for (const t of o.tiles) v += store.state?.tiles[t].price ?? 0
  for (const r of Object.keys(RESOURCES) as ResourceType[]) {
    v += (o.resources[r] ?? 0) * (store.state?.market[r] ?? 0)
  }
  return Math.round(v)
}
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <div class="modal-title">🤝 交易提议</div>
      <div class="modal-body" v-if="from">
        <p class="big">「{{ from.name }}」向你提出交易：</p>
        <div class="cols">
          <div class="col">
            <div class="col-title">你可以获得</div>
            <p v-for="(d, i) in desc(prompt.receive, true)" :key="'r' + i" class="item">{{ d }}</p>
            <p v-if="!desc(prompt.receive, true).length" class="muted">（无）</p>
            <p class="value">≈ {{ offerValue(prompt.receive) }}</p>
          </div>
          <div class="col">
            <div class="col-title">你需要给出</div>
            <p v-for="(d, i) in desc(prompt.give, false)" :key="'g' + i" class="item">{{ d }}</p>
            <p v-if="!desc(prompt.give, false).length" class="muted">（无）</p>
            <p class="value">≈ {{ offerValue(prompt.give) }}</p>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn primary" @click="respond({ accept: true })">✔ 接受</button>
        <button class="btn" @click="respond({ accept: false })">✖ 拒绝</button>
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
  width: min(440px, 92vw); border-radius: 16px; padding: 22px;
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
  animation: pop 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.big { font-size: 15px; color: #4a3018; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
.col {
  background-image:
    radial-gradient(ellipse 44px 26px at 86% 22%, rgba(255, 250, 232, 0.45), transparent 70%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='3' seed='5' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.3' intercept='0.05'/%3E%3CfeFuncG type='linear' slope='0.3' intercept='0.05'/%3E%3CfeFuncB type='linear' slope='0.3' intercept='0.05'/%3E%3CfeFuncA type='linear' slope='0.13'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23m)'/%3E%3C/svg%3E"),
    linear-gradient(180deg, #faf0d0, #eedcaa);
  border: 1px solid #c9b28a; border-radius: 10px; padding: 8px 10px;
}
.col-title { font-size: 13px; font-weight: bold; color: #8a5a2b; }
.item { font-size: 13px; color: #4a3018; margin: 3px 0; }
.muted { font-size: 12px; color: #a08860; }
.value { font-size: 12px; color: #a5711f; font-weight: bold; margin-top: 4px; }
.modal-actions { display: flex; gap: 12px; margin-top: 16px; justify-content: center; }
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
