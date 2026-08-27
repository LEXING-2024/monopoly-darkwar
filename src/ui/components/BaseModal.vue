<script setup lang="ts">
// ============ 弹窗骨架：遮罩 + 羊皮纸面板（全项目弹窗共用的唯一外壳） ============
// 原 11 个弹窗各自复制此壳（约 40 行/份），现收拢为唯一来源；
// 类名用 bm- 前缀且样式非 scoped，避免与各组件局部 .overlay/.modal 样式冲突。

withDefaults(defineProps<{
  /** 面板宽度（CSS width 值） */
  width?: string
  /** 遮罩黑度 0~1（详情弹窗较浅、流程弹窗较深） */
  dim?: number
  /** 层级：流程弹窗 200，结算弹窗 160，详情弹窗 150 */
  z?: number
  /** 面板内边距 */
  padding?: string
  /** 内容可能超高时启用面板内部滚动（max-height 86vh + 纵向滚动） */
  scroll?: boolean
}>(), {
  width: 'min(380px, 92vw)',
  dim: 0.72,
  z: 200,
  padding: '22px',
})

const emit = defineEmits<{ (e: 'backdrop'): void }>()
</script>

<template>
  <div
    class="bm-overlay"
    :style="{ zIndex: z, background: `rgba(24, 14, 6, ${dim})` }"
    @click.self="$emit('backdrop')"
  >
    <div class="bm-modal" :class="{ 'bm-scroll': scroll }" :style="{ width, padding }">
      <slot />
    </div>
  </div>
</template>

<style>
/* 非 scoped：作为全项目弹窗样式的唯一来源 */
.bm-overlay {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
}
.bm-modal {
  border-radius: 16px;
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
  animation: bm-pop 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.bm-modal.bm-scroll { max-height: 86vh; overflow-y: auto; }
@keyframes bm-pop { from { transform: scale(0.7); opacity: 0; } }
</style>
