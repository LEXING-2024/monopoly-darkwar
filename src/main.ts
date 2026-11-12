import { createApp } from 'vue'
import { Capacitor } from '@capacitor/core'
import App from './App.vue'
import './style.css'

// 开发期调试钩子：便于在控制台/自动化截图脚本中检查对局状态与视觉回归
if (import.meta.env.DEV) {
  void import('./ui/store').then(m => {
    ;(window as unknown as { __store: typeof m.store }).__store = m.store
  })
}

/** 设备类型检测（多信号合并，任一命中即视为移动端）：
 *  1. Capacitor 原生环境（APK 内 WebView）
 *  2. UA 字符串（Android / iPhone / iPad / Mobile）
 *  3. 触屏指针（pointer: coarse，比 UA 更可靠的能力检测）
 *  4. 窄窗口（宽度 ≤900px，桌面浏览器窗口缩窄同样用紧凑布局）
 *  结果挂在 <html class="is-mobile"> 上，各组件据此切换移动端样式；
 *  窗口尺寸变化时重新评估，跟随缩放窗口。 */
function applyDeviceClass(): void {
  const native = Capacitor.isNativePlatform()
  const uaMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const narrow = window.matchMedia('(max-width: 900px)').matches
  document.documentElement.classList.toggle('is-mobile', native || uaMobile || coarse || narrow)
}
applyDeviceClass()
window.addEventListener('resize', applyDeviceClass)

// 运行时错误横幅：白屏/渲染中断时页面底部直接显示错误内容，便于定位
window.addEventListener('error', (e) => {
  let el = document.getElementById('err-overlay')
  if (!el) {
    el = document.createElement('div')
    el.id = 'err-overlay'
    el.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#7a1f10;color:#ffe0c0;' +
      'font:13px/1.6 monospace;padding:10px 14px;white-space:pre-wrap;max-height:40vh;overflow:auto;'
    document.body.appendChild(el)
  }
  el.textContent += (el.textContent ? '\n' : '') + '[error] ' + (e.message || String(e))
})

createApp(App).mount('#app')
