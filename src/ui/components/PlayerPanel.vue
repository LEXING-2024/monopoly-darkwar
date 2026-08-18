<script setup lang="ts">
import { computed, ref } from 'vue'
import { store } from '../store'
import { RESOURCES } from '../../core/config'
import type { ResourceType } from '../../core/types'

const s = computed(() => store.state)
/** 无本地热座：主信息区固定显示人类玩家自己，AI 行动时不切换 */
const human = computed(() => (s.value ? s.value.players.find(p => !p.isAI) ?? null : null))
const current = computed(() => (s.value ? s.value.players[s.value.currentPlayer] ?? null : null))
const viewId = ref(-1)
const viewed = computed(() => {
  if (!s.value || !human.value) return null
  const id = viewId.value >= 0 ? viewId.value : human.value.id
  return s.value.players[id] ?? human.value
})
const viewedTiles = computed(() => {
  if (!s.value || !viewed.value) return []
  return s.value.tiles.filter(t => t.owner === viewed.value!.id)
})

function viewPlayer(id: number): void {
  viewId.value = viewId.value === id ? -1 : id
}
</script>

<template>
  <div class="paper card" v-if="s && human">
    <div class="me">
      <span class="token" :style="{ background: human.color }" />
      <div class="me-info">
        <b>{{ human.name }}</b>
        <span class="cash">💰 {{ human.cash }} <i>现金</i></span>
      </div>
      <div class="badges">
        <span v-if="human.status.rentFree > 0" class="badge">免过路费</span>
        <span v-if="human.status.insuredTurns > 0" class="badge">🛡️保险</span>
        <span v-if="human.status.antitrustTurns > 0" class="badge">💼游说 -{{ (-human.status.antitrustMod * 100).toFixed(0) }}%</span>
        <span v-if="human.status.floodImmune > 0" class="badge">🏗️堤坝</span>
        <span v-if="human.status.moveMod !== 0" class="badge">步数{{ human.status.moveMod > 0 ? '+' : '' }}{{ human.status.moveMod }}</span>
      </div>
    </div>

    <div class="players">
      <div
        v-for="p in s.players" :key="p.id"
        class="p-row" :class="{ dead: !p.alive, cur: p.id === s.currentPlayer, viewing: viewId === p.id }"
        :title="`点击查看「${p.name}」的资产`"
        @click="p.alive && viewPlayer(p.id)"
      >
        <span class="p-token" :style="{ background: p.color }" />
        <span class="p-name">{{ p.name }}{{ p.isAI ? '(AI)' : '' }}</span>
        <span class="p-tiles">🗺️{{ s.tiles.filter(t => t.owner === p.id).length }}</span>
        <span class="p-cash">{{ p.alive ? `💰${p.cash}` : '💀出局' }}</span>
      </div>
    </div>

    <div class="my-assets" v-if="viewed && viewedTiles.length">
      <div class="asset-head">{{ viewId >= 0 ? `「${viewed.name}」的资产` : '我的资产（点击玩家查看他人资产）' }}</div>
      <div class="asset-grid">
        <button
          v-for="t in viewedTiles" :key="t.index"
          class="asset-btn" :class="{ sel: store.selectedTile === t.index }"
          @click="store.selectedTile = t.index; store.tileModalOpen = true"
        >
          {{ t.icon }} {{ t.name }}<i class="tprice">￥{{ t.price }}</i>
          <span v-if="t.explored" class="reserve" :class="t.reserve">
            {{ t.reserve === 'rich' ? '富' : t.reserve === 'poor' ? '贫' : '普' }}
          </span>
          <span class="bldg" v-for="b in t.buildings" :key="b.id">🏗️{{ b.level }}</span>
          <span v-if="t.disaster" class="dis">⚠️</span>
        </button>
      </div>
    </div>

    <div class="inv">
      <span
        v-for="(r, k) in viewed.resources" :key="k"
        class="inv-item"
        :title="RESOURCES[k as ResourceType].name"
      >{{ RESOURCES[k as ResourceType].icon }}{{ Math.floor(r) }}</span>
    </div>
  </div>
</template>

<style scoped>
.card { padding: 12px 14px; }
.me { display: flex; align-items: center; gap: 10px; }
.token { width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 2px 5px rgba(0,0,0,.35); flex: none; }
.me-info { display: flex; flex-direction: column; }
.cash { color: #a5711f; font-weight: bold; font-size: 17px; }
.cash i { font-style: normal; font-size: 11px; color: #8a6a44; }
.badges { display: flex; gap: 4px; flex-wrap: wrap; margin-left: auto; }
.badge { font-size: 11px; background: #f0dfae; border: 1px solid #c9a227; color: #6a4a18; border-radius: 10px; padding: 1px 7px; }
.players { margin-top: 10px; border-top: 1px dashed #c9b28a; padding-top: 8px; display: flex; flex-direction: column; gap: 3px; }
.p-row { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 2px 6px; border-radius: 8px; cursor: pointer; }
.p-row:hover { background: rgba(160, 120, 60, 0.14); }
.p-row.cur { background: rgba(255, 215, 106, 0.22); }
.p-row.viewing { outline: 2px solid #d9a53d; }
.p-row.dead { opacity: 0.5; text-decoration: line-through; cursor: default; }
.p-token { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid #fff; flex: none; }
.p-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.p-cash { font-weight: bold; color: #6a4a18; }
.my-assets { margin-top: 8px; }
.asset-head { font-size: 12px; color: #8a6a44; margin-bottom: 4px; }
.asset-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.asset-btn {
  font-size: 12px; padding: 3px 8px; border-radius: 7px; cursor: pointer;
  color: #f7e7c0; text-shadow: 0 1px 1px rgba(30, 15, 0, 0.6);
  background-image:
    /* 木节 */
    radial-gradient(ellipse 6px 5px at 84% 70%, rgba(55, 26, 4, 0.5), transparent 75%),
    /* 木纹 */
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='120'%3E%3Cfilter id='w'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.015 0.26' numOctaves='3' seed='9' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.42' intercept='0.04'/%3E%3CfeFuncG type='linear' slope='0.42' intercept='0.04'/%3E%3CfeFuncB type='linear' slope='0.42' intercept='0.04'/%3E%3CfeFuncA type='linear' slope='0.3'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='200' height='120' filter='url(%23w)'/%3E%3C/svg%3E"),
    /* 独有磨损（污渍斑+划痕，各按钮略有不同） */
    var(--wear, var(--wear-1)),
    linear-gradient(180deg, #ac8046 0%, #8a6330 55%, #6f4c20 100%);
  border: 1px solid #46300e;
  box-shadow:
    inset 0 1px 1px rgba(255, 232, 180, 0.4),
    inset 0 -2px 3px rgba(40, 20, 0, 0.45),
    0 1px 0 #37230a;
}
.asset-btn:nth-child(4n+2) { --wear: var(--wear-2); }
.asset-btn:nth-child(4n+3) { --wear: var(--wear-3); }
.asset-btn:nth-child(4n) { --wear: var(--wear-4); }
.asset-btn.sel { outline: 2px solid #d9a53d; filter: brightness(1.18); }
.tprice { font-style: normal; color: #8a5a2b; font-size: 11px; margin-left: 2px; }
.reserve.rich { color: #b8860b; font-weight: bold; }
.reserve.poor { color: #7a7a7a; }
.bldg { color: #8a5a2b; }
.dis { color: #d94f3d; }
.inv { display: flex; gap: 8px; margin-top: 8px; font-size: 14px; }
.inv-item { color: #4a3018; }
</style>
