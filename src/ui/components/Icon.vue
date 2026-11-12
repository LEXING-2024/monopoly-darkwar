<script setup lang="ts">
// ============ 统一图标（内联 SVG，24×24 线性风格） ============
// 全项目图标唯一来源：描边统一 1.8、圆角端点，颜色跟随 currentColor。
// 使用方式：<Icon name="save" :size="16" />
import { computed } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })

const PATHS: Record<string, string> = {
  // 通用界面
  save: `<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h7V4"/><path d="M8 20v-6h8v6"/>`,
  home: `<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-5.5h5V20"/>`,
  volume: `<path d="M4 9.5h3L12 5v14l-5-4.5H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.8 6a8.5 8.5 0 0 1 0 12"/>`,
  mute: `<path d="M4 9.5h3L12 5v14l-5-4.5H4z"/><path d="m16.5 9 5 6M21.5 9l-5 6"/>`,
  help: `<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.2.9-1.2 1.9"/><path d="M12 17h.01"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  close: `<path d="m6 6 12 12M18 6 6 18"/>`,
  chevron: `<path d="m9 6 6 6-6 6"/>`,
  check: `<path d="m4.5 12.5 5 5 10-11"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  minus: `<path d="M5 12h14"/>`,
  arrowUp: `<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>`,
  arrowDown: `<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>`,
  arrowRight: `<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>`,
  swap: `<path d="M4 8h14"/><path d="m14 4 4 4-4 4"/><path d="M20 16H6"/><path d="m10 12-4 4 4 4"/>`,
  // 资源 / 季节
  wood: `<path d="M12 4 7 11h3l-3 5h10l-3-5h3z"/><path d="M12 16v4"/>`,
  beef: `<path d="M6 9c0-2.2 2.7-4 6-4s6 1.8 6 4c0 1.4-.8 2.2-1.6 3.4C15.6 13.4 14 15 14 17h-4c0-2-1.6-3.6-2.4-4.6C6.8 11.2 6 10.4 6 9Z"/><path d="M9.5 9h.01M14.5 9h.01"/>`,
  oil: `<path d="M6 20V9l4-4h7v15"/><path d="M6 20h12"/><path d="M10 9h3M10 13h3M10 17h3"/><path d="M17 5V3"/>`,
  fish: `<path d="M3 12c3-4 7-5.5 11-3.5L20 6l-2 6 2 6-6-2.5C10 17.5 6 16 3 12Z"/><path d="M7 12h.01"/>`,
  spring: `<circle cx="12" cy="12" r="3"/><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"/>`,
  summer: `<circle cx="12" cy="12" r="4.5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>`,
  autumn: `<path d="M5 19c1-5 3-9 8-12 2 4 1 9-3 12"/><path d="M8 16c2-1.5 4-2.5 6-3"/>`,
  winter: `<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="m9.5 5 2.5 2 2.5-2M9.5 19l2.5-2 2.5 2"/>`,
  // 状态 / 灾害
  flame: `<path d="M12 3c1.8 3.6 5.5 5.6 5.5 9.8A5.5 5.5 0 0 1 6.5 13c0-2.2 1.1-3.7 2.3-5 .3 1.5 1 2.3 1.9 2.8C11 9.4 11.4 6.6 12 3Z"/><path d="M12 20c-1.7 0-3-1.2-3-2.8 0-1.8 1.7-3 3-4.7 1.3 1.7 3 2.9 3 4.7 0 1.6-1.3 2.8-3 2.8Z"/>`,
  wave: `<path d="M3 10q3-3 6 0t6 0 6 0"/><path d="M3 15q3-3 6 0t6 0 6 0"/><path d="M3 20q3-3 6 0t6 0 6 0"/>`,
  quake: `<path d="m4 8 4 4-3 3 5 1-2 5"/><path d="m14 4-2 7 4 2-2 7"/>`,
  wind: `<path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 15h15a3 3 0 1 1-3 3"/><path d="M3 12h8"/>`,
  sand: `<path d="M3 16q4-4 8 0t8 0"/><path d="M5 12q3-3 6 0t6 0"/><circle cx="18" cy="6" r="2"/>`,
  snow: `<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>`,
  rain: `<path d="M6 14a5 5 0 0 1 .8-9.9A6 6 0 0 1 18.5 6 4 4 0 0 1 18 14Z"/><path d="M8 18v2M12 18v3M16 18v2"/>`,
  alert: `<path d="M12 4 21 20H3Z"/><path d="M12 10v4M12 17h.01"/>`,
  shield: `<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6Z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>`,
  // 行动 / 信息
  coin: `<circle cx="12" cy="12" r="8.5"/><path d="M9 8.5h6M9 15.5h6M12 7v10"/><path d="M9 12h6"/>`,
  map: `<path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z"/><path d="M9 4v13.5M15 6.5V20"/>`,
  scroll: `<path d="M6 4h12a2 2 0 0 1 2 2v1H8V6a2 2 0 1 0-4 0v12a2 2 0 0 0 2 2h12"/><path d="M8 9h12v9a2 2 0 0 1-2 2H8"/><path d="M11 13h6M11 16h4"/>`,
  trade: `<path d="M4 8h13l-3-3M20 16H7l3 3"/><path d="M17 5v3M7 19v-3"/>`,
  report: `<path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6Z"/><path d="M12 8v4M12 15h.01"/>`,
  briefcase: `<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5h6v2M3.5 12h17M10 12v2h4v-2"/>`,
  flag: `<path d="M6 21V4"/><path d="M6 4h11l-2 3.5L17 11H6"/>`,
  hourglass: `<path d="M6 3h12M6 21h12"/><path d="M7.5 3v4.5c0 2.5 4.5 3.5 4.5 4.5S7.5 14.5 7.5 17v4M16.5 3v4.5c0 2.5-4.5 3.5-4.5 4.5s4.5 2.5 4.5 4.5v4"/>`,
  dice: `<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 9h.01M15 15h.01M15 9h.01M9 15h.01M12 12h.01"/>`,
  users: `<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.8M17.5 14.2c2.1.8 3.5 2.8 3.5 5.3"/>`,
  building: `<path d="M4 21V8l6-3 6 3v13"/><path d="M16 21V11l4 2v8"/><path d="M7 10h.01M10 10h.01M7 14h.01M10 14h.01M12 21v-4h2v4M3 21h18"/>`,
  hammer: `<path d="M14 4l6 6"/><path d="M10 8l6 6"/><path d="M3 21l8-8"/><path d="M15 3l6 6-3 3-6-6z"/>`,
  pick: `<path d="M4 20 20 4"/><path d="M13 3c3 0 6 3 6 6"/><path d="M7 17c-3 0-4-1-4-1s1-1 1-4"/><path d="M4 20l4-1"/>`,
  bridge: `<path d="M3 17q9-10 18 0"/><path d="M3 17v4h18v-4"/><path d="M9 12v8M15 12v8"/>`,
  tag: `<path d="M3 12V4h8l9 9-7 7z"/><circle cx="7.5" cy="8" r="1.2"/>`,
  phone: `<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>`,
  rotate: `<path d="M20 11a8 8 0 1 0-2.3 6.7"/><path d="M20 5v6h-6"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>`,
}

const path = computed(() => PATHS[props.name] ?? PATHS.help)
</script>

<template>
  <svg
    class="ui-icon" :width="size" :height="size" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    v-html="path"
  />
</template>

<style scoped>
.ui-icon {
  display: inline-block;
  vertical-align: -0.16em;
  flex: none;
  overflow: visible;
}
</style>
