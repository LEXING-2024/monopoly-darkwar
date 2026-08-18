<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { store, respond } from '../store'
import { playSfx } from '../../core/sfx'
import type { Prompt } from '../../core/types'

const props = defineProps<{
  prompt: Extract<Prompt, { type: 'wheel' }> | Extract<Prompt, { type: 'order-wheel' }>
  manual?: boolean    // 开局顺序：由玩家点击转动
  points?: boolean    // 开局顺序：结果显示"点数"而非"步数"
}>()

const N = 13
const THETA = 360 / N
const CX = 160
const CY = 160
const R = 148
const DURATION = 4000

const rotation = ref(0)
const spinning = ref(false)
const hasSpun = ref(!props.manual)
const done = ref(false)
const result = computed(() => store.state?.wheelResult ?? 0)
const player = computed(() => store.state?.players[props.prompt.player] ?? null)

const sectors = computed(() =>
  Array.from({ length: N }, (_, k) => {
    const a0 = (k * THETA - 90 - THETA / 2) * (Math.PI / 180)
    const a1 = ((k + 1) * THETA - 90 - THETA / 2) * (Math.PI / 180)
    const x0 = CX + R * Math.cos(a0)
    const y0 = CY + R * Math.sin(a0)
    const x1 = CX + R * Math.cos(a1)
    const y1 = CY + R * Math.sin(a1)
    const mid = (k * THETA - 90) * (Math.PI / 180)
    const tx = CX + R * 0.74 * Math.cos(mid)
    const ty = CY + R * 0.74 * Math.sin(mid)
    return {
      k,
      d: `M ${CX} ${CY} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${R} ${R} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`,
      // 每扇区木色微差，模拟手工拼木
      fill: k === 0 ? '#c9a06a' : ['#6b4a2a', '#57391f', '#614227', '#4f351d'][k % 4],
      tx, ty, label: k === 0 ? '空' : `${k}`,
      labelColor: k === 0 ? '#4a3018' : '#e8c06a',
      rot: k * THETA - 90,
    }
  }),
)

let tickTimer: ReturnType<typeof setInterval> | null = null
let endTimer: ReturnType<typeof setTimeout> | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

function startSpin(): void {
  if (spinning.value || done.value) return
  spinning.value = true
  hasSpun.value = true
  playSfx('click')
  // 目标：让结果扇区停在顶部指针处
  const target = 360 * 6 + (360 - result.value * THETA)
  requestAnimationFrame(() => {
    // 双 rAF：确保浏览器先提交「起始角度 0」的渲染帧，再应用目标角度，
    // 否则同一帧内 0→目标 直接生效，transition 不触发——手机上表现为「轮盘不转」
    requestAnimationFrame(() => {
      rotation.value = target
      tickTimer = setInterval(() => playSfx('tick'), DURATION / N)
      // transitionend 在后台标签页/被遮挡窗口/低性能设备上可能不触发，
      // 定时兜底保证转盘必定结束，防止对局卡死
      if (endTimer) clearTimeout(endTimer)
      endTimer = setTimeout(onSpinEnd, DURATION + 400)
    })
  })
}

onMounted(() => {
  if (!props.manual) startSpin()
})

function onSpinEnd(): void {
  if (done.value) return
  done.value = true
  spinning.value = false
  if (tickTimer) clearInterval(tickTimer)
  if (endTimer) clearTimeout(endTimer)
  playSfx('ding')
  // 延迟确认仅供玩家看清结果；回调时校验当前弹窗仍是本转盘，
  // 防止延迟 respond 误关后续弹窗（曾导致自动多走一步/弹窗错乱）
  const p = props.prompt
  closeTimer = setTimeout(() => {
    if (store.prompt === p) respond(null)
  }, 1100)
}

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (endTimer) clearTimeout(endTimer)
  if (closeTimer) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="overlay">
    <div class="wheel-modal">
      <div class="who" v-if="player">
        <span class="dot" :style="{ background: player.color }" />{{ player.name }}{{ points ? ' 掷出点数…' : ' 转动转盘…' }}
      </div>
      <div class="wheel-wrap">
        <svg :width="320" :height="320" viewBox="0 0 320 320">
          <defs>
            <!-- 木纹：横向拉长的条纹噪点（年轮细丝），输出深棕半透明 -->
            <filter id="woodGrain" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.006 0.13" numOctaves="4" seed="9" stitchTiles="stitch" />
              <feColorMatrix type="matrix" values="0.26 0 0 0 0.07  0.19 0 0 0 0.04  0.11 0 0 0 0.01  0 0 0 0.55 0" />
            </filter>
            <!-- 污渍柔化 -->
            <filter id="blur" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <!-- 轮盘径向阴影（外缘做旧） -->
            <radialGradient id="rimShade" cx="50%" cy="44%" r="55%">
              <stop offset="62%" stop-color="rgba(20,8,0,0)" />
              <stop offset="88%" stop-color="rgba(20,8,0,0.5)" />
              <stop offset="100%" stop-color="rgba(20,8,0,0.72)" />
            </radialGradient>
            <clipPath id="wheelClip">
              <circle cx="160" cy="160" r="148" />
            </clipPath>
          </defs>

          <!-- 木轮盘体（整体旋转：扇区、木纹、年轮、污渍、划痕都跟着转） -->
          <g
            :style="{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: '160px 160px',
              transition: `transform ${DURATION}ms cubic-bezier(0.08, 0.7, 0.12, 1)`,
            }"
            @transitionend="onSpinEnd"
          >
            <path
              v-for="sec in sectors" :key="sec.k"
              :d="sec.d" :fill="sec.fill"
              stroke="#2a1a0c" stroke-width="2.5"
            />
            <text
              v-for="sec in sectors" :key="'t' + sec.k"
              :x="sec.tx" :y="sec.ty" text-anchor="middle" dominant-baseline="middle"
              :fill="sec.labelColor" :transform="`rotate(${sec.rot} ${sec.tx} ${sec.ty})`"
              font-family="Georgia, serif" :font-size="sec.k === 0 ? 22 : 20" font-weight="bold"
            >{{ sec.label }}</text>
            <!-- 木纹细丝 + 年轮（随轮盘转动） -->
            <g clip-path="url(#wheelClip)">
              <rect x="0" y="0" width="320" height="320" filter="url(#woodGrain)" />
              <g fill="none" stroke-linecap="round">
                <circle :cx="CX" :cy="CY" r="36" stroke="rgba(255,232,180,0.10)" stroke-width="1.6" />
                <circle :cx="CX" :cy="CY" r="58" stroke="rgba(20,8,0,0.17)" stroke-width="1.4" />
                <circle :cx="CX" :cy="CY" r="82" stroke="rgba(255,232,180,0.08)" stroke-width="1.6" />
                <circle :cx="CX" :cy="CY" r="106" stroke="rgba(20,8,0,0.19)" stroke-width="1.5" />
                <circle :cx="CX" :cy="CY" r="128" stroke="rgba(20,8,0,0.21)" stroke-width="1.6" />
              </g>
            </g>
            <!-- 污渍斑（随轮盘转动，固定在盘面上） -->
            <g filter="url(#blur)" fill="rgba(28,11,2,0.36)">
              <ellipse cx="238" cy="112" rx="26" ry="15" />
              <ellipse cx="82" cy="224" rx="20" ry="12" />
              <ellipse cx="176" cy="252" rx="12" ry="8" />
            </g>
            <!-- 磨损划痕弧线（随轮盘转动） -->
            <g fill="none" stroke-linecap="round">
              <path d="M196,46 A132 132 0 0 1 240,84" stroke="rgba(255,240,200,0.3)" stroke-width="1.6" />
              <path d="M96,116 A126 126 0 0 1 122,146" stroke="rgba(255,240,200,0.26)" stroke-width="1.4" />
              <path d="M258,196 A132 132 0 0 1 240,230" stroke="rgba(255,240,200,0.22)" stroke-width="1.2" />
              <path d="M70,80 A116 116 0 0 1 88,100" stroke="rgba(60,30,5,0.25)" stroke-width="1.3" />
            </g>
            <!-- 中心轴：木毂 + 黄铜钉 -->
            <circle :cx="CX" :cy="CY" r="19" fill="#8a5a2b" stroke="#2a1a0c" stroke-width="2.5" />
            <circle :cx="CX" :cy="CY" r="15" fill="#a5711f" stroke="#5d3f22" stroke-width="2" />
            <circle :cx="CX" :cy="CY" r="5" fill="#e8c06a" />
          </g>

          <!-- 静态层：外缘做旧阴影（径向对称，旋转无差别） -->
          <circle :cx="CX" :cy="CY" :r="R" fill="url(#rimShade)" />
          <!-- 外圈：深木边 + 黄铜嵌线 -->
          <circle :cx="CX" :cy="CY" r="156" fill="none" stroke="#2a1a0c" stroke-width="10" />
          <circle :cx="CX" :cy="CY" r="152" fill="none" stroke="#8a5a2b" stroke-width="3" />
          <circle :cx="CX" :cy="CY" r="143" fill="none" stroke="#c9a227" stroke-width="1.5" opacity="0.6" />

          <!-- 指针：黄铜 -->
          <polygon points="160,10 147,40 173,40" fill="#b9852a" stroke="#5d3f22" stroke-width="2" />
          <circle cx="160" cy="42" r="3" fill="#5d3f22" />
        </svg>
      </div>

      <!-- 开局顺序：点击转动 -->
      <div class="spin-cta" v-if="manual && !spinning && !done">
        <button class="btn big" @click="startSpin">🎲 点击转动转盘</button>
        <p class="hint2">转出点数，决定开局行动顺序</p>
      </div>

      <div class="result" v-if="!spinning && hasSpun">
        <template v-if="points">
          <span v-if="result === 0" class="empty">🎯 空仓格！点数 0</span>
          <span v-else>🎯 点数 {{ result }}</span>
        </template>
        <template v-else>
          <span v-if="result === 0" class="empty">🎯 空仓格！原地不动，抽一张机会卡</span>
          <span v-else>🎲 前进 {{ result }} 步</span>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 200; /* 流程弹窗置顶，高于详情弹窗 */
}
.wheel-modal { text-align: center; }
.who {
  color: #f5e6c8; font-size: 16px; margin-bottom: 10px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; display: inline-block; }
.wheel-wrap { display: inline-block; }
.spin-cta { margin-top: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.hint2 { margin: 0; color: #b99a6a; font-size: 13px; letter-spacing: 1px; }
.result { margin-top: 12px; color: #ffd76a; font-size: 20px; font-weight: bold; min-height: 28px; }
.empty { color: #c9e0a0; }
</style>
