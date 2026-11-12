<script setup lang="ts">
// ============ 弹窗骨架：遮罩 + 羊皮纸面板（全项目弹窗共用的唯一外壳） ============
// 原 11 个弹窗各自复制此壳（约 40 行/份），现收拢为唯一来源；
// 类名用 bm- 前缀且样式非 scoped，避免与各组件局部 .overlay/.modal 样式冲突。

export type ModalWidth = 'sm' | 'md' | 'lg'
/** width 枚举到 CSS 值的映射——比让每个调用者写 'min(400px, 92vw)' 更不易拼错 */
const WIDTH_MAP: Record<ModalWidth, string> = {
  sm: 'min(360px, 92vw)',  // 卡片 / 紧凑弹窗
  md: 'min(400px, 92vw)',  // 默认，绝大多数弹窗
  lg: 'min(440px, 92vw)',  // 内容较长的弹窗（交易/抉择/结算）
}

withDefaults(defineProps<{
  /** 面板宽度（枚举；未指定取 md） */
  width?: ModalWidth
  /** 遮罩黑度 0~1（详情弹窗较浅、流程弹窗较深） */
  dim?: number
  /** 层级：流程弹窗 200，结算弹窗 160，详情弹窗 150 */
  z?: number
  /** 面板内边距 */
  padding?: string
  /** 内容可能超高时启用面板内部滚动（max-height 86vh + 纵向滚动） */
  scroll?: boolean
}>(), {
  width: 'md',
  dim: 0.72,
  z: 200,
  padding: '22px',
})

defineEmits<{ (e: 'backdrop'): void }>()
</script>

<template>
  <div
    class="bm-overlay"
    :style="{ zIndex: z, background: `rgba(24, 14, 6, ${dim})` }"
    @click.self="$emit('backdrop')"
  >
    <div class="bm-modal" :class="{ 'bm-scroll': scroll }" :style="{ width: WIDTH_MAP[width], padding }">
      <slot />
    </div>
  </div>
</template>

<style>
/* 非 scoped：作为全项目弹窗样式的唯一来源 */
.bm-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
}
.bm-modal {
  position: relative;
  border-radius: 15px;
  color: var(--ink);
  background-color: var(--paper-1);
  background-image:
    radial-gradient(ellipse 150px 86px at 10% 8%, rgba(255, 250, 232, 0.34), transparent 70%),
    radial-gradient(ellipse 150px 90px at 92% 88%, rgba(255, 248, 226, 0.22), transparent 70%),
    radial-gradient(ellipse 84% 74% at 50% 46%, transparent 55%, rgba(122, 82, 30, 0.22) 100%),
    var(--tex-paper),
    linear-gradient(168deg, #fbf0d2 0%, #f0ddad 46%, #e6cd99 100%);
  background-size: auto, auto, auto, 340px 340px, auto;
  border: 2px solid var(--brass-3);
  box-shadow:
    inset 0 0 0 1px rgba(255, 246, 214, 0.25),
    inset 0 0 30px rgba(94, 58, 14, 0.24),
    var(--shadow-lg);
  animation: bm-pop 0.24s cubic-bezier(0.3, 1.35, 0.55, 1);
}
/* 内侧细金线 */
.bm-modal::before {
  content: '';
  position: absolute;
  inset: 5px;
  border-radius: 10px;
  border: 1px solid rgba(201, 162, 74, 0.4);
  pointer-events: none;
}
.bm-modal.bm-scroll { max-height: 86vh; overflow-y: auto; }
.bm-modal > * { position: relative; }

/* 弹窗通用排版（各组件仍可覆盖） */
.bm-modal .modal-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 19px;
  font-weight: bold;
  color: #5a3a14;
  letter-spacing: 0.5px;
  margin-bottom: 9px;
  padding-bottom: 7px;
  border-bottom: 1px solid rgba(138, 95, 31, 0.3);
}
.bm-modal .modal-title::first-letter { color: var(--seal); }
.bm-modal .modal-body { color: var(--ink); line-height: 1.6; }
.bm-modal .modal-actions { margin-top: 15px; }

@keyframes bm-pop {
  from { transform: scale(0.86) translateY(6px); opacity: 0; }
}
</style>
