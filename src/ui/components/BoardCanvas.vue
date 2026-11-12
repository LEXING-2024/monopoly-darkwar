<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Phaser from 'phaser'
import { BoardScene } from '../../render/scene'
import { store } from '../store'

const holder = ref<HTMLDivElement | null>(null)
let phaserGame: Phaser.Game | null = null
let resizeObserver: ResizeObserver | null = null
let resizeTimer: number | undefined
let onVisibility: (() => void) | null = null

/**
 * 画布后备分辨率：不再固定 3840×2560（约 1000 万像素，低端核显每帧填充压力大）。
 * 按「容器 CSS 尺寸 × 设备像素比（封顶 2）× 1.15」自适应，长边封顶 2880（低端机 2048），
 * 既保证 Retina/4K 屏幕清晰，又把常见 1080p 屏的像素量降到原先 40% 左右。
 * 相机基准缩放仍按 fit-to-board 计算，棋盘在任何比例下都完整可见。
 */
function targetSize(cssW: number, cssH: number): { w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8
  const lowEnd = cores <= 4 || mem <= 4
  const maxEdge = lowEnd ? 2048 : 2880
  // 画布严格使用棋盘 3:2 比例：相机铺满，不再在画布内出现上下留白
  const boardAspect = 3 / 2
  let fitW = cssW
  let fitH = fitW / boardAspect
  if (fitH > cssH) {
    fitH = cssH
    fitW = fitH * boardAspect
  }
  fitW = Math.max(320, fitW)
  fitH = Math.max(213, fitH)
  let w = Math.min(maxEdge, Math.max(640, fitW * dpr * 1.12))
  let h = w / boardAspect
  if (h > maxEdge) {
    h = maxEdge
    w = h * boardAspect
  }
  const area = w * h
  if (area > 2_600_000) {
    const k = Math.sqrt(2_600_000 / area)
    w *= k
    h *= k
  }
  return { w: Math.round(w / 2) * 2, h: Math.round(h / 2) * 2 }
}

onMounted(() => {
  if (!holder.value || !store.game) return
  const rect = holder.value.getBoundingClientRect()
  const initial = targetSize(Math.max(320, rect.width), Math.max(200, rect.height))
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: holder.value,
    transparent: false,
    backgroundColor: '#1b1008',
    scale: {
      mode: Phaser.Scale.FIT,
      width: initial.w,
      height: initial.h,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    banner: false,
    // 关闭 MSAA：后备分辨率约为 CSS 尺寸的 2 倍，缩放后锯齿不可见，且省显存
    antialias: false,
    powerPreference: 'high-performance',
    audio: { noAudio: true },
    // 触屏：单指拖动平移、双指捏合缩放（activePointers=2 保证双指可用），APK WebView 同样生效
    input: { activePointers: 2, touch: { capture: true } },
  })
  phaserGame.scene.add('board', BoardScene, true, { core: store.game })

  const fitCanvas = (): void => {
    if (!phaserGame || !holder.value) return
    // 防抖：键盘弹出/收起会让容器尺寸剧烈变化，动画期间反复重建画布同样会撞上 GPU 上限
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!phaserGame || !holder.value) return
      const r = holder.value.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      const { w, h } = targetSize(r.width, r.height)
      if (phaserGame.scale.width !== w || phaserGame.scale.height !== h) {
        phaserGame.scale.setGameSize(w, h)
      }
    }, 180)
  }
  fitCanvas()
  resizeObserver = new ResizeObserver(fitCanvas)
  resizeObserver.observe(holder.value)

  // 切到后台时休眠渲染循环：省电、省 GPU，回来后恢复
  onVisibility = (): void => {
    if (!phaserGame) return
    if (document.hidden) phaserGame.loop.sleep()
    else phaserGame.loop.wake()
  }
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  window.clearTimeout(resizeTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (onVisibility) document.removeEventListener('visibilitychange', onVisibility)
  onVisibility = null
  phaserGame?.destroy(true)
  phaserGame = null
})
</script>

<template>
  <div ref="holder" class="board-holder" />
</template>

<style scoped>
.board-holder {
  min-height: 0;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  /* 透明：画布未铺满处透出木桌底，不出现黑边 */
  background: transparent;
}
.board-holder :deep(canvas) {
  border-radius: 12px;
  /* 轻微提饱和/对比：让地图与卡片的矿物色更饱满（GPU 合成，单层开销很低） */
  /* 饱和度/对比度已一次性烘焙进地图纹理，画布不再每帧做全屏 filter */
  box-shadow:
    0 0 0 1px rgba(52, 34, 16, 0.55),
    0 8px 28px rgba(0, 0, 0, 0.42);
}
</style>
