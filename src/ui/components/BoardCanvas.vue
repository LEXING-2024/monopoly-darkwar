<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Phaser from 'phaser'
import { BoardScene } from '../../render/scene'
import { store } from '../store'

const holder = ref<HTMLDivElement | null>(null)
let phaserGame: Phaser.Game | null = null
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (!holder.value || !store.game) return
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: holder.value,
    backgroundColor: '#d9c394',
    scale: {
      mode: Phaser.Scale.FIT,
      // 画布后备分辨率 3840×2560（约 3.9 倍 CSS 像素密度），超过 4096 的老显卡会
      // 无法创建渲染目标（Framebuffer Unsupported），故取 4096 以内的最大值；
      // zoom 5/3 补偿显示尺寸（棋盘世界坐标 2304×1536）
      width: 3840,
      height: 2560,
      zoom: 5 / 3,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    banner: false,
    // 关闭 MSAA：4608×3072 的反锯齿后备缓冲会成倍占用显存导致 GL_OUT_OF_MEMORY；
    // 画布以约 4.6 倍像素密度输出，缩放到 CSS 尺寸时锯齿本身不可见
    antialias: false,
    audio: { noAudio: true },
    // 触屏：单指拖动平移、双指捏合缩放（activePointers=2 保证双指可用），APK WebView 同样生效
    input: { activePointers: 2, touch: { capture: true } },
  })
  phaserGame.scene.add('board', BoardScene, true, { core: store.game })

  // 画布按容器实际宽高比自适应（最长边 ≤ 3840×2560，防 GPU 渲染目标上限报
  // Framebuffer Incomplete Attachment）：宽屏（横屏手机）降高度、窄屏降宽度，
  // 画布始终贴合容器铺满无黑边；相机按 fit-to-board 缩放（见 scene.ts handleResize），
  // 任何比例下棋盘都以最大尺寸完整可见。
  let resizeTimer: number | undefined
  const fitCanvas = (): void => {
    if (!phaserGame || !holder.value) return
    // 防抖：键盘弹出/收起会让容器尺寸剧烈变化，动画期间反复重建画布同样会撞上 GPU 上限
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!phaserGame || !holder.value) return
      const r = holder.value.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      const R = r.width / r.height
      // 棋盘宽高比 1.5：更宽的容器降高度贴合，更窄的容器降宽度贴合
      let w: number, h: number
      if (R >= 1.5) {
        w = 3840
        h = Math.max(600, Math.round(3840 / R))
      } else {
        h = 2560
        w = Math.max(600, Math.round(2560 * R))
      }
      if (phaserGame.scale.width !== w || phaserGame.scale.height !== h) {
        phaserGame.scale.setGameSize(w, h)
      }
    }, 150)
  }
  fitCanvas()
  resizeObserver = new ResizeObserver(fitCanvas)
  resizeObserver.observe(holder.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  phaserGame?.destroy(true)
  phaserGame = null
})

onBeforeUnmount(() => {
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
  border-radius: 10px;
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
}
</style>
