import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 相对路径：打包成 APK（Capacitor）时资源从本地 WebView 加载
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
})
