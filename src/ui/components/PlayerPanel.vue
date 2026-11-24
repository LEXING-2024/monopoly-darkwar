<script setup lang="ts">
import { computed, ref } from 'vue'
import { store } from '../store'
import { monopolyTerrainRatio, RESOURCES, RESOURCE_ORDER } from '../../core/config'
import { contiguousRun } from '../../core/economy'
import type { ResourceType, Terrain } from '../../core/types'
import Icon from './Icon.vue'

const s = computed(() => store.state)
/** 无本地热座：主信息区固定显示人类玩家自己，AI 行动时不切换 */
const human = computed(() => (s.value ? s.value.players.find(p => !p.isAI) ?? null : null))
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
const cur = computed(() => (s.value ? s.value.players[s.value.currentPlayer] : null))

const TERRAIN_DOT: Record<Terrain, string> = {
  forest: '#5b7f45', plateau: '#a8844f', desert: '#d2a45a', coast: '#5e98a0',
}
function terrainOf(name: string): Terrain {
  if (name.startsWith('森林')) return 'forest'
  if (name.startsWith('高原')) return 'plateau'
  if (name.startsWith('沙漠')) return 'desert'
  return 'coast'
}
function shortTile(name: string): string {
  const m = name.match(/·(\d+)号地/)
  if (m) return `${name.slice(0, name.indexOf('·'))}${m[1]}`
  return name
}
function viewPlayer(id: number): void {
  viewId.value = viewId.value === id ? -1 : id
}
const fmt = (n: number): string => Math.round(n).toLocaleString()

/** 各玩家的最高单地形占比（垄断进度条用），纯 state 计算不依赖 game 实例 */
const TERRAINS: Terrain[] = ['forest', 'plateau', 'desert', 'coast']
const monopolyProgress = computed(() => {
  const map = new Map<number, { ratio: number; terrain: Terrain }>()
  if (!s.value) return map
  const totals: Record<Terrain, number> = { forest: 0, plateau: 0, desert: 0, coast: 0 }
  s.value.tiles.forEach(t => {
    if (t.type === 'terrain' && t.terrain !== 'none') totals[t.terrain as Terrain]++
  })
  for (const p of s.value.players) {
    if (!p.alive) continue
    const owned: Record<Terrain, number> = { forest: 0, plateau: 0, desert: 0, coast: 0 }
    s.value.tiles.forEach(t => {
      if (t.type === 'terrain' && t.owner === p.id && t.terrain !== 'none') owned[t.terrain as Terrain]++
    })
    let best: Terrain = 'forest', ratio = 0
    for (const ter of TERRAINS) {
      const r = totals[ter] ? owned[ter] / totals[ter] : 0
      if (r > ratio) { ratio = r; best = ter }
    }
    map.set(p.id, { ratio, terrain: best })
  }
  return map
})
const TERRAIN_LABEL: Record<Terrain, string> = { forest: '森林', plateau: '高原', desert: '沙漠', coast: '沿海' }
/** 查看对象各连片段长度（≥3 时在资产格上显示"连N"，代表整片开发加成） */
const contiguousMap = computed(() => {
  const map = new Map<number, number>()
  const g = store.game
  if (!g || !viewed.value) return map
  for (const t of viewedTiles.value) {
    if (t.type === 'terrain') map.set(t.index, contiguousRun(g, t))
  }
  return map
})
const hold = computed(() => s.value?.monopolyHold ?? null)
const isCharging = (pid: number): boolean => hold.value?.playerId === pid
/** 垄断线按人数缩放：4 人局 50%…8 人局 70%（与核心判定同一口径） */
const monoLine = computed(() => monopolyTerrainRatio(s.value?.players.length ?? 4))
</script>

<template>
  <div class="paper card player-card" v-if="s && human">
    <div class="card-head">
      <span class="ch-icon"><Icon name="scroll" :size="14" /></span>
      <b>你的账册</b>
      <span class="ch-rule" />
      <span class="ch-meta">现金 · 资产 · 库存</span>
    </div>
    <!-- 本人概览 -->
    <div class="me">
      <span class="token" :style="{ background: human.color }" />
      <div class="me-info">
        <b class="me-name">{{ human.name }}</b>
        <span class="cash"><Icon name="coin" :size="15" /> {{ fmt(human.cash) }} <i>现金</i></span>
      </div>
      <span class="me-pos"><Icon name="map" :size="12" /> {{ human.pos === 0 ? '起点' : `${human.pos} 号地` }}</span>
    </div>
    <div class="badges" v-if="human.status.rentFree > 0 || human.status.insuredTurns > 0 || human.status.antitrustTurns > 0 || human.status.floodImmune > 0 || human.status.moveMod !== 0">
      <span v-if="human.status.rentFree > 0" class="badge"><Icon name="shield" :size="11" /> 免过路费</span>
      <span v-if="human.status.insuredTurns > 0" class="badge"><Icon name="shield" :size="11" /> 保险 {{ human.status.insuredTurns }}</span>
      <span v-if="human.status.antitrustTurns > 0" class="badge"><Icon name="briefcase" :size="11" /> 游说 -{{ Math.min(30, Math.round(-human.status.antitrustMod * 100)) }}%</span>
      <span v-if="human.status.floodImmune > 0" class="badge"><Icon name="wave" :size="11" /> 堤坝</span>
      <span v-if="human.status.moveMod !== 0" class="badge"><Icon name="dice" :size="11" /> 步数{{ human.status.moveMod > 0 ? '+' : '' }}{{ human.status.moveMod }}</span>
    </div>

    <!-- 全员账目 -->
    <div class="players">
      <div
        v-for="p in s.players" :key="p.id"
        class="p-row" :class="{ dead: !p.alive, cur: p.id === s.currentPlayer, viewing: viewId === p.id }"
        :title="`点击查看「${p.name}」的资产`"
        @click="p.alive && viewPlayer(p.id)"
      >
        <span class="p-token" :style="{ background: p.color }" />
        <span class="p-name-wrap">
          <span class="p-name">{{ p.name }}<em v-if="p.isAI">AI</em></span>
          <!-- 垄断进度条：显示该玩家最高单地形占比；到举报线变色，形成垄断时高亮 -->
          <span
            v-if="p.alive && monopolyProgress.get(p.id)"
            class="mono-bar"
            :class="{
              warn: monopolyProgress.get(p.id)!.ratio >= monoLine * 0.9,
              hot: monopolyProgress.get(p.id)!.ratio >= monoLine,
              charging: isCharging(p.id),
            }"
            :title="`${TERRAIN_LABEL[monopolyProgress.get(p.id)!.terrain]}占比 ${Math.round(monopolyProgress.get(p.id)!.ratio * 100)}%（垄断线 ${Math.round(monoLine * 100)}%）${isCharging(p.id) && hold ? ` · 已垄断 ${hold.rounds} 轮，可断供/抬价压制，也可被举报` : ''}`"
          >
            <i class="mono-fill" :style="{ width: `${Math.min(100, monopolyProgress.get(p.id)!.ratio * 100)}%` }" />
            <b class="mono-mark" :style="{ left: `${monoLine * 100}%` }" />
            <em v-if="isCharging(p.id) && hold" class="mono-count">垄断{{ hold.rounds }}</em>
          </span>
        </span>
        <span class="p-tiles" title="持有地块"><Icon name="map" :size="12" />{{ s.tiles.filter(t => t.owner === p.id).length }}</span>
        <span class="p-cash" :class="{ neg: p.alive && p.cash < 0 }">
          <template v-if="p.alive"><Icon name="coin" :size="12" />{{ fmt(p.cash) }}</template>
          <template v-else>出局</template>
        </span>
        <span v-if="cur && p.id === s.currentPlayer" class="p-now">行动中</span>
      </div>
    </div>

    <!-- 资产 -->
    <div class="my-assets" v-if="viewed && viewedTiles.length">
      <div class="asset-head">
        <span><Icon name="building" :size="12" /> {{ viewId >= 0 ? `「${viewed.name}」的资产` : '我的资产' }}</span>
        <span class="asset-count">{{ viewedTiles.length }} 块</span>
      </div>
      <div class="asset-grid">
        <button
          v-for="t in viewedTiles" :key="t.index"
          class="asset-btn" :class="{ sel: store.selectedTile === t.index }"
          :title="`${t.name} · ￥${t.price} · 点击查看详情`"
          @click="store.selectedTile = t.index; store.tileModalOpen = true"
        >
          <span class="dot" :style="{ background: TERRAIN_DOT[terrainOf(t.name)] }" />
          <span class="aname">{{ shortTile(t.name) }}</span>
          <i class="tprice">￥{{ t.price }}</i>
          <span v-if="t.explored" class="reserve" :class="t.reserve">
            {{ t.reserve === 'rich' ? '富' : t.reserve === 'poor' ? '贫' : '普' }}
          </span>
          <!-- 连片角标：连续 ≥3 块时显示，代表整片开发租金加成 -->
          <span
            v-if="(contiguousMap.get(t.index) ?? 0) >= 3" class="contig"
            :title="`连片 ${contiguousMap.get(t.index)} 块 · 该段租金 +${Math.round((contiguousMap.get(t.index)! >= 5 ? 0.5 : contiguousMap.get(t.index)! >= 4 ? 0.4 : 0.25) * 100)}%`"
          >连{{ contiguousMap.get(t.index) }}</span>
          <span class="bldg" v-if="t.buildings.length"><Icon name="building" :size="10" />{{ t.buildings.length }}</span>
          <span v-if="t.disaster" class="dis">⚠</span>
        </button>
      </div>
    </div>

    <div class="asset-empty" v-if="viewed && !viewedTiles.length">
      <span class="ae-icon"><Icon name="map" :size="20" /></span>
      <span><b>尚未置地</b><i>从路边第一块地开始</i></span>
    </div>

    <!-- 资源库存 -->
    <div class="inv">
      <span
        v-for="r in RESOURCE_ORDER" :key="r"
        class="inv-item"
        :class="'res-' + r"
        :title="`${RESOURCES[r as ResourceType].name}：${Math.floor(viewed.resources[r])}`"
      ><Icon :name="r" :size="14" /><b>{{ Math.floor(viewed.resources[r]) }}</b></span>
    </div>
  </div>
</template>

<style scoped>
.player-card { padding: 9px 13px 11px; }
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 6px;
  margin-bottom: 7px;
  border-bottom: 1px solid rgba(160, 120, 60, 0.3);
}
.ch-icon {
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  color: var(--brass-3);
  border: 1px solid rgba(138, 95, 31, 0.45);
  background: rgba(255, 248, 226, 0.55);
}
.card-head b {
  font-size: 13px;
  color: var(--ink);
  letter-spacing: 2px;
  font-weight: bold;
}
.ch-rule { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(138, 95, 31, 0.35), transparent); }
.ch-meta { font-size: 9.5px; color: var(--ink-4); letter-spacing: 1px; }
.me { display: flex; align-items: center; gap: 9px; }
.token {
  width: 36px; height: 36px; border-radius: 50%;
  border: 2px solid #f8ecd0;
  box-shadow:
    inset -2px -3px 5px rgba(0, 0, 0, 0.35),
    inset 2px 2px 4px rgba(255, 255, 255, 0.4),
    0 2px 5px rgba(0, 0, 0, 0.35);
  flex: none;
}
.me-info { display: flex; flex-direction: column; min-width: 0; }
.me-name { font-size: 15px; color: var(--ink); letter-spacing: 0.5px; }
.cash {
  display: inline-flex; align-items: center; gap: 3px;
  color: #8a5a16; font-weight: bold; font-size: 17px;
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}
.cash :deep(.ui-icon) { color: var(--brass-3); }
.cash i { font-style: normal; font-size: 10.5px; color: var(--ink-3); font-family: var(--font-hand); margin-left: 1px; }
.me-pos {
  margin-left: auto; display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; color: var(--ink-3);
  padding: 2px 6px; border-radius: 6px;
  border: 1px solid rgba(138, 95, 31, 0.35);
  background: rgba(255, 248, 226, 0.4);
  white-space: nowrap;
}
.badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 7px; }
.badge {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10.5px; background: rgba(240, 223, 174, 0.7);
  border: 1px solid rgba(201, 162, 74, 0.75); color: #6a4a18;
  border-radius: 8px; padding: 1px 6px;
}
.players {
  margin-top: 8px; border-top: 1px dashed rgba(160, 120, 60, 0.45);
  padding-top: 5px; display: flex; flex-direction: column; gap: 1px;
}
.p-row {
  display: flex; align-items: center; gap: 6px;
  font-size: 12.5px; padding: 3px 6px; border-radius: 7px; cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.12s ease;
}
.p-row:hover { background: rgba(160, 120, 60, 0.13); }
.p-row.cur { background: rgba(255, 215, 106, 0.22); border-left-color: var(--brass-3); }
.p-row.viewing { background: rgba(255, 248, 226, 0.55); outline: 1px solid rgba(201, 162, 74, 0.75); }
.p-row.dead { opacity: 0.5; cursor: default; }
.p-token {
  width: 11px; height: 11px; border-radius: 50%;
  border: 1.5px solid rgba(255, 252, 240, 0.9);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  flex: none;
}
.p-name-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.p-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); }
.p-name em { font-style: normal; font-size: 9.5px; color: var(--ink-3); margin-left: 3px; }
/* 垄断进度条：细条 + 垄断线刻度；达到门槛变色，垄断中显示已维持轮数 */
.mono-bar {
  position: relative; display: block; height: 5px; border-radius: 3px; overflow: visible;
  background: rgba(120, 90, 50, 0.18); border: 1px solid rgba(120, 90, 50, 0.25);
}
.mono-fill {
  position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px;
  background: linear-gradient(90deg, #b9934f, #d9b45f); transition: width 0.3s ease;
}
.mono-bar.warn .mono-fill { background: linear-gradient(90deg, #c98a3a, #e0a53d); }
.mono-bar.hot .mono-fill { background: linear-gradient(90deg, #b3261e, #d9452f); }
.mono-bar.charging { box-shadow: 0 0 0 1px var(--bad), 0 0 5px rgba(179, 38, 30, 0.5); }
.mono-mark {
  position: absolute; top: -2px; width: 1px; height: 9px; background: rgba(160, 100, 40, 0.7);
}
.mono-mark.win { background: var(--bad); }
.mono-count {
  position: absolute; right: -2px; top: 5px; font-size: 8.5px; font-style: normal;
  color: var(--bad); font-weight: bold; line-height: 1;
}
.p-tiles, .p-cash { display: inline-flex; align-items: center; gap: 2px; color: var(--ink-3); font-variant-numeric: tabular-nums; }
.p-cash { font-weight: bold; color: #6a4a18; min-width: 52px; justify-content: flex-end; }
.p-cash.neg { color: var(--bad); }
.p-now {
  font-size: 9.5px; color: #7c5414; background: rgba(255, 219, 128, 0.5);
  border-radius: 6px; padding: 0 5px; white-space: nowrap;
}
.my-assets { margin-top: 8px; }
.asset-head {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; color: var(--ink-3); margin-bottom: 4px;
}
.asset-head span { display: inline-flex; align-items: center; gap: 3px; }
.asset-count { opacity: 0.8; }
.asset-grid { display: flex; flex-wrap: wrap; gap: 4px; }
.asset-btn {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; padding: 3px 7px; border-radius: 7px; cursor: pointer;
  color: var(--ink-2);
  background-image:
    var(--tex-paper),
    linear-gradient(180deg, #fbf1d8, #eedbac);
  background-size: 180px 180px, auto;
  border: 1px solid rgba(138, 95, 31, 0.45);
  box-shadow: inset 0 1px 0 rgba(255, 252, 240, 0.6), 0 1px 2px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
}
.asset-btn:hover { filter: brightness(1.05); transform: translateY(-1px); }
.asset-btn.sel { outline: 1.5px solid var(--brass); filter: brightness(1.06); }
.dot { width: 7px; height: 7px; border-radius: 50%; border: 1px solid rgba(255, 248, 226, 0.7); flex: none; }
.tprice { font-style: normal; color: #7a5418; font-family: var(--font-num); font-size: 10px; }
.reserve.rich { color: #7c5209; font-weight: 800; }
.reserve.poor { color: #695844; font-weight: 600; }
.reserve { font-size: 9.5px; }
.bldg { display: inline-flex; align-items: center; gap: 1px; color: #6a4a18; font-size: 10px; }
/* 连片角标：整片开发的标识，与普通资源角标区分开（金色描边） */
.contig {
  font-size: 9px; font-weight: 700; color: #6a3f06;
  background: linear-gradient(180deg, #ffe6a8, #f0c25c);
  border: 1px solid rgba(150, 100, 20, 0.55);
  border-radius: 4px; padding: 0 3px; line-height: 1.35;
}
.dis { color: var(--rise-ink); font-size: 10px; font-weight: 700; }
.inv {
  display: flex; gap: 5px; margin-top: 8px;
  border-top: 1px dashed rgba(160, 120, 60, 0.45); padding-top: 6px;
}
.inv-item {
  --res-ink: var(--brass-3);
  --res-bg: rgba(255, 248, 226, 0.55);
  --res-line: rgba(138, 95, 31, 0.32);
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 11.5px; color: var(--ink-2);
  background: var(--res-bg);
  border: 1px solid var(--res-line);
  border-radius: 6px; padding: 2px 6px;
}
.inv-item.res-wood { --res-ink: #2e6a3c; --res-bg: #e8f1df; --res-line: #93b481; }
.inv-item.res-beef { --res-ink: #9a3a2a; --res-bg: #f7e6dd; --res-line: #cf9a86; }
.inv-item.res-oil { --res-ink: #494238; --res-bg: #ece5d8; --res-line: #a99a80; }
.inv-item.res-fish { --res-ink: #17697a; --res-bg: #ddf0f1; --res-line: #84bcc4; }
.asset-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 7px 9px;
  border: 1px dashed rgba(138, 95, 31, 0.35);
  border-radius: 8px;
  color: var(--ink-3);
}
.ae-icon {
  display: grid; place-items: center;
  width: 30px; height: 30px; border-radius: 50%;
  color: var(--brass-3);
  background: rgba(255, 248, 226, 0.5);
  border: 1px solid rgba(138, 95, 31, 0.3);
  flex: none;
}
.asset-empty span:last-child { display: flex; flex-direction: column; gap: 1px; }
.asset-empty b { font-size: 11.5px; color: var(--ink-2); font-weight: bold; letter-spacing: 1px; }
.asset-empty i { font-style: normal; font-size: 10px; color: var(--ink-4); }
.inv-item b { font-family: var(--font-num); color: var(--ink); font-weight: bold; }
.inv-item :deep(.ui-icon) { color: var(--res-ink); }
.inv-item b { color: var(--res-ink); }
</style>
