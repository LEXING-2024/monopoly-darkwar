import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径：打包成 APK（Capacitor）时资源从本地 WebView 加载
  base: './',
  server: {
    port: 5173,
    host: true,
    // 截图/模拟脚本与构建产物不参与热更新监听：其中的临时文件在被编辑器写入时
    // 可能处于独占状态，Windows 下会触发 EBUSY 并让整个 dev server 退出
    watch: {
      ignored: [
        '**/scripts/**', '**/dist/**', '**/游戏截图/**', '**/apk/**', '**/android/**',
        // 编辑器/工具写入时产生的临时目录：被独占时监听会抛 EBUSY 直接终止 dev server
        '**/*.tmpdir/**', '**/.*.tmpdir/**', '**/*.tmp',
      ],
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Phaser 单文件约 1.5MB 且极少变动：单独成块，
        // 改玩法代码时只有游戏块失效，浏览器/CDN 缓存仍可复用 Phaser
        manualChunks: { phaser: ['phaser'] },
      },
    },
  },
})
