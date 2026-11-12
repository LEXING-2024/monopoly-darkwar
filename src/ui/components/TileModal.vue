<script setup lang="ts">
import { computed, ref } from 'vue'
import { showNoMoney, store } from '../store'
import { BUILDINGS, RESERVE_MULT, RESOURCES, TERRAIN_RESOURCE } from '../../core/config'
import { canBuild, levelCost, repairCost } from '../../core/buildings'
import { bridgeRepairCost, bridgeToll, exploreCost, tileOutput, tileRent } from '../../core/economy'
import type { Building, ResourceType } from '../../core/types'
import BaseModal from './BaseModal.vue'
import Icon from './Icon.vue'

const s = computed(() => store.state)
const game = computed(() => store.game)
const me = computed(() => (s.value ? s.value.players[s.value.currentPlayer] : null))
const myTurn = computed(() =>
  !!s.value && !!me.value && !me.value.isAI &&
  s.value.phase === 'action' &&
  (!store.prompt || store.prompt.type === 'action'),
)
const selTile = computed(() => {
  if (!s.value || store.selectedTile < 0) return null
  return s.value.tiles[store.selectedTile]
})
/** 本回合操作配额剩余（修理不限） */
const ops = computed(() => s.value?.ops)
/** 建筑位已满（每格最多 2 座）→ 隐藏建造按钮，改为小字提示 */
const slotsFull = computed(() => !!selTile.value && selTile.value.buildings.length >= 2)
/** 玩家当前所站地块（行动阶段可点击购买） */
const standingTile = computed(() => {
  if (!s.value || !me.value) return null
  return s.value.tiles[me.value.pos]
})

const reserves = { rich: '富矿', normal: '普通', poor: '贫矿' } as const
/** 地形地块对应的产出资源（资源分布展示用） */
const selResource = computed(() => {
  const t = selTile.value
  if (!t || t.type !== 'terrain') return null
  return RESOURCES[TERRAIN_RESOURCE[t.terrain]]
})
const selResourceKey = computed(() => {
  const t = selTile.value
  if (!t || t.type !== 'terrain') return 'map'
  return TERRAIN_RESOURCE[t.terrain]
})
/** 自有已勘探地块的储量倍率 */
const selReserveMult = computed(() => {
  const t = selTile.value
  if (!t || t.reserve === 'unknown') return null
  return RESERVE_MULT[t.reserve]
})
/** 自有已勘探地块的当回合产量 */
const selOutput = computed(() => {
  const t = selTile.value
  if (!t || !game.value || !me.value || t.type !== 'terrain' || t.owner !== me.value.id || !t.explored) return null
  return tileOutput(game.value, me.value.id, t)
})

const rentInfo = computed(() => {
  const t = selTile.value
  if (!t || !s.value) return null
  if (t.type === 'terrain' && t.owner !== null && t.owner !== me.value?.id) {
    return `租金 ￥${tileRent(game.value!, t, s.value.players[t.owner])}`
  }
  if (t.type === 'bridge') {
    return `过路费 ￥${bridgeToll(game.value!, t)}${t.bridgeClosed > 0 ? '（关闭中）' : ''}`
  }
  return null
})

// ---- 建造菜单 ----
const buildMenuOpen = ref(false)
/** 可建造列表：现金不足的也显示（点击时统一弹「资金不足」），其余条件不满足才隐藏 */
const buildable = computed(() => {
  if (!selTile.value || !game.value || !me.value) return []
  return BUILDINGS.filter(b => {
    const r = canBuild(game.value!, me.value!.id, selTile.value!, b.id)
    return r.ok || r.reason === '现金不足'
  })
})

/** 资金不足统一弹层（需确认关闭），现金够则直接执行 */
function noMoneyOr(fn: () => void, cost: number, what: string): void {
  if (!me.value || !game.value) return
  if (me.value.cash < cost) {
    showNoMoney(cost, what)
    return
  }
  fn()
}

/** 购买当前落脚地块：购买后地块详情保持显示该地块；现金不足统一弹窗提示 */
function onBuy(): void {
  const t = standingTile.value
  if (!t || !game.value) return
  if (me.value && me.value.cash < t.price) {
    showNoMoney(t.price, `购买「${t.name}」`)
    return
  }
  store.selectedTile = t.index
  game.value.buyCurrentTile()
}

/** 升级建筑（现金不足统一弹窗） */
function onUpgrade(b: Building): void {
  if (!game.value || !selTile.value) return
  const cost = levelCost(game.value, b.type, b.level + 1)
  const name = BUILDINGS.find(x => x.id === b.type)?.name ?? '建筑'
  noMoneyOr(() => game.value?.upgradeAt(selTile.value!.index, b.id), cost, `升级「${name}」`)
}

/** 修理建筑（现金不足统一弹窗） */
function onRepair(buildingId: number): void {
  if (!game.value || !selTile.value || !me.value) return
  const b = selTile.value.buildings.find(x => x.id === buildingId)
  if (!b) return
  const cost = repairCost(game.value, b)
  noMoneyOr(() => game.value?.repairAt(selTile.value!.index, buildingId), cost, '修理')
}

/** 修桥/升级（现金不足统一弹窗） */
function onRepairBridge(): void {
  if (!game.value || !selTile.value || !me.value) return
  noMoneyOr(() => game.value?.repairBridge(selTile.value!.index), bridgeCost.value, '修桥/升级')
}

/** 勘探（现金不足统一弹窗） */
function onExplore(): void {
  if (!game.value || !selTile.value || !me.value) return
  const cost = exploreCost(selTile.value)
  noMoneyOr(() => game.value?.exploreAt(selTile.value!.index), cost, '勘探')
}

/** 买后现金紧张警示：剩余不足 1000 时提醒，防止一口气买空被一次过路费带走 */
const buyWarn = computed(() => {
  const t = standingTile.value
  if (!t || !me.value || t.owner !== null) return false
  const left = me.value.cash - t.price
  return left >= 0 && left < 1000
})

function close(): void {
  store.tileModalOpen = false
}

const bridgeCost = computed(() => {
  const t = selTile.value
  if (!t || t.type !== 'bridge' || t.bridgeLevel >= 3) return 0
  // 与核心/AI 同一口径：升级成本半价（economy.bridgeRepairCost 唯一来源）
  return bridgeRepairCost(t)
})

/** 建造实际费用（含春季 -20%、景气修正），与核心 canBuild/levelCost 完全一致 */
function buildCost(defId: string): number {
  return game.value ? levelCost(game.value, defId, 1) : 0
}
</script>

<template>
  <BaseModal v-if="store.tileModalOpen && selTile" width="md" :dim="0.55" :z="150" @backdrop="close">
      <div class="modal-title"><Icon name="map" :size="18" /> 地块详情</div>
      <div class="modal-body">
        <p class="big"><Icon name="map" :size="15" /> {{ selTile.name }}</p>
        <p class="muted">
          <template v-if="selTile.type === 'terrain'">
            价格 ￥{{ selTile.price }} · 主人：{{ selTile.owner !== null ? s!.players[selTile.owner].name : '无' }}
            <span v-if="rentInfo"> · <b class="rent">{{ rentInfo }}</b></span>
            <template v-if="selTile.owner === me?.id && selResource">
              · 产出：<Icon :name="selResourceKey" :size="13" />{{ selResource.name }}
              <template v-if="selTile.explored">
                · 储量：{{ reserves[selTile.reserve] }}（×{{ selReserveMult }}）
                <template v-if="selOutput !== null"> · 产量 {{ Math.round(selOutput * 10) / 10 }}/回合</template>
              </template>
              <template v-else> · 储量未勘探（勘探费 ￥{{ exploreCost(selTile) }}）</template>
            </template>
            <template v-if="selTile.disaster"> · <Icon name="alert" :size="12" /> 灾害中</template>
          </template>
          <template v-else-if="selTile.type === 'bridge'">
            等级 {{ selTile.bridgeLevel }} / 3 · 主人：{{ selTile.owner !== null ? s!.players[selTile.owner].name : '无' }}
            <span v-if="rentInfo"> · <b class="rent">{{ rentInfo }}</b></span>
          </template>
          <template v-else-if="selTile.type === 'start'">起点：经过 +1000，停留可修理或休息</template>
          <template v-else>功能格</template>
        </p>
        <div v-if="selTile.buildings.length" class="bldgs">
          <div v-for="b in selTile.buildings" :key="b.id" class="bldg">
            <Icon name="building" :size="13" /> {{ BUILDINGS.find(x => x.id === b.type)?.name }} Lv{{ b.level }}
            <button
              v-if="myTurn && selTile.owner === me?.id && b.level < 3"
              class="btn small"
              :disabled="!ops || ops.upgrade <= 0"
              :title="(!ops || ops.upgrade <= 0) ? '本回合升级次数已用完（每回合 1 次）' : ''"
              @click="onUpgrade(b)"
            ><Icon name="arrowUp" :size="11" /> 升级 ￥{{ levelCost(game!, b.type, b.level + 1) }}</button>
            <button
              v-if="myTurn && selTile.owner === me?.id && b.level < 3 && b.damaged"
              class="btn small" :disabled="!ops || ops.repair <= 0" @click="onRepair(b.id)"
            ><Icon name="hammer" :size="11" /> 修理</button>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <div v-if="myTurn && ops" class="ops-line">
          <span class="ops-title">本回合可操作</span>
          <span><Icon name="building" :size="11" /> 建造 {{ ops.build }}</span>
          <span><Icon name="arrowUp" :size="11" /> 升级 {{ ops.upgrade }}</span>
          <span><Icon name="hammer" :size="11" /> 修理 {{ ops.repair }}</span>
          <span><Icon name="pick" :size="11" /> 勘探 {{ ops.explore }}</span>
          <span><Icon name="bridge" :size="11" /> 修桥 {{ ops.bridge }}</span>
        </div>
        <button
          v-if="myTurn && standingTile && standingTile.index === selTile.index &&
                standingTile.owner === null && !standingTile.seized &&
                (standingTile.type === 'terrain' || standingTile.type === 'bridge')"
          class="btn primary" :class="{ 'buy-warn': buyWarn }" @click="onBuy"
        ><Icon name="tag" :size="13" /> 购买{{ standingTile.name }}（￥{{ standingTile.price }}）
          <template v-if="buyWarn">⚠️ 买后余 ￥{{ me!.cash - standingTile.price }}</template>
        </button>
        <button
          v-if="myTurn && selTile.owner === me?.id && selTile.type === 'terrain' && !selTile.explored"
          class="btn" :disabled="!ops || ops.explore <= 0" @click="onExplore"
        ><Icon name="pick" :size="13" /> 勘探（￥{{ exploreCost(selTile) }}）</button>
        <button
          v-if="myTurn && selTile.owner === me?.id && selTile.type === 'terrain' && !slotsFull"
          class="btn" :disabled="!ops || ops.build <= 0" @click="buildMenuOpen = !buildMenuOpen"
        ><Icon name="building" :size="13" /> 建造</button>
        <button
          v-if="myTurn && selTile.type === 'bridge' && selTile.owner === me?.id && selTile.bridgeLevel < 3"
          class="btn" :disabled="!ops || ops.bridge <= 0" @click="onRepairBridge"
        ><Icon name="bridge" :size="13" /> 修桥/升级（￥{{ bridgeCost }}）</button>
        <button class="btn" @click="close">关闭</button>
      </div>

      <p v-if="myTurn && selTile.owner === me?.id && selTile.type === 'terrain' && slotsFull" class="slots-full">
        ⚠️ 建筑位已满（2/2），本格无法再建造
      </p>

      <div v-if="buildMenuOpen && selTile" class="build-menu">
        <div class="menu-tip">每格：资源生产位 ×1 + 通用位 ×1（商业/防灾/科技共用）</div>
        <div v-if="!buildable.length" class="menu-tip">当前没有可建造的建筑（对应位已占用或地形不符）</div>
        <button
          v-for="b in buildable" :key="b.id"
          class="btn small" :disabled="!ops || ops.build <= 0"
          @click="noMoneyOr(() => { game?.buildAt(selTile.index, b.id); buildMenuOpen = false }, buildCost(b.id), `建造「${b.name}」`)"
        ><Icon name="building" :size="11" /> {{ b.name }}（￥{{ buildCost(b.id) }}）</button>
        <button class="btn small" @click="buildMenuOpen = false">取消</button>
      </div>
  </BaseModal>
</template>

<style scoped>
.modal-title { font-size: 20px; font-weight: bold; color: #5a3a1a; margin-bottom: 10px; }
.modal-body { color: #4a3018; }
.big { font-size: 17px; margin: 6px 0; color: #4a3018; }
.muted { font-size: 13px; color: #7a5a38; margin: 4px 0; line-height: 1.6; }
.rent { color: var(--rise-ink); font-weight: 700; }
.bldgs { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.bldg { font-size: 13px; color: #4a3018; display: flex; align-items: center; gap: 6px; justify-content: center; }
.modal-actions { display: flex; gap: 10px; margin-top: 16px; justify-content: center; flex-wrap: wrap; }
.ops-line {
  width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px;
  font-size: 11.5px; color: var(--ink-3); border-top: 1px dashed rgba(160, 120, 60, 0.45);
  padding-top: 8px;
}
.ops-line span { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }
.ops-title { font-weight: bold; color: var(--ink-2); }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.buy-warn { animation: warnPulse 1.2s ease-in-out infinite; }
@keyframes warnPulse { 50% { box-shadow: 0 0 12px rgba(220, 110, 60, 0.85); } }
.build-menu {
  margin-top: 12px; padding: 10px;
  border: 1.5px dashed #b99a6a; border-radius: 10px;
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;
}
.menu-tip { font-size: 12px; color: #8a6a44; width: 100%; }
.slots-full { font-size: 12px; color: #8a6a44; margin-top: 8px; }
</style>
