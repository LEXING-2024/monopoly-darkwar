<script setup lang="ts">
// 开始游戏后的加载遮罩：点击「开始游戏」立即显示，棋盘首帧就绪后由 board-ready 事件关闭
</script>

<template>
  <div class="overlay">
    <div class="modal">
      <div class="spinner" />
      <div class="title">🗺️ 棋盘加载中…</div>
      <div class="hint">正在铺设沙盘与羊皮纸</div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0; background: rgba(24, 14, 6, 0.72);
  display: flex; align-items: center; justify-content: center; z-index: 220;
}
.modal {
  width: min(320px, 92vw); border-radius: 16px; padding: 30px 22px;
  background-image:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='500' height='300'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.004 0.11' numOctaves='4' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncG type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncB type='linear' slope='0.3' intercept='0.06'/%3E%3CfeFuncA type='linear' slope='0.11'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='500' height='300' filter='url(%23s)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cfilter id='m'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='3' seed='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncG type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncB type='linear' slope='0.34' intercept='0.02'/%3E%3CfeFuncA type='linear' slope='0.11'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='260' height='260' filter='url(%23m)'/%3E%3C/svg%3E"),
    radial-gradient(ellipse 80% 70% at 50% 48%, transparent 58%, rgba(122, 82, 30, 0.28) 100%),
    linear-gradient(168deg, #f4e5ba 0%, #eed8a4 42%, #e6ca8e 100%);
  border: 3px solid #8a5a2b;
  box-shadow:
    inset 0 0 34px rgba(94, 58, 14, 0.3),
    inset 0 0 10px rgba(94, 58, 14, 0.24),
    0 12px 40px rgba(0, 0, 0, 0.6);
  text-align: center; animation: pop 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
/* 木质轮盘式转圈：外圈深木 + 旋转黄铜指针 */
.spinner {
  width: 52px; height: 52px; margin: 0 auto 14px;
  border-radius: 50%;
  border: 6px solid #6f4c20;
  border-top-color: #c9a227;
  box-shadow: inset 0 0 0 3px #8a5a2b;
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.title { font-size: 19px; font-weight: bold; color: #5a3a1a; }
.hint { margin-top: 6px; font-size: 13px; color: #7a5a38; }
@keyframes pop { from { transform: scale(0.7); opacity: 0; } }
</style>
