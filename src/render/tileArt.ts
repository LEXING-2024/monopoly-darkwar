// ============ 地块 / 建筑 / 灾害贴图（程序化绘制，统一墨线 + 矿物色淡彩） ============

import type { Tile } from '../core/types'

const INK = '#4a3420'
const SHADOW = 'rgba(74, 52, 32, 0.16)'

/**
 * 地块图案：48×32 视框，统一 1.6~2px 墨线、2~3 层矿物色。
 * 由 scene.ts 统一按 240×160 2x 生成纹理。
 */
export const TILE_ART: Record<string, string> = {
  // 森林：三棵松树 + 地面投影 + 小鸟
  pines: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='23' cy='28.6' rx='18' ry='2.6' fill='${SHADOW}' stroke='none'/>
    <path d='M12 27.5V20'/><path d='M12 7.5 4.5 19h15z' fill='#5f8b4a'/><path d='M12 12.5 6 21.5h12z' fill='#71a057'/>
    <path d='M32 27.2V21'/><path d='M32 3.6 24.8 15.2h14.4z' fill='#4f7a3f'/><path d='M32 9.6 26.3 18.6h11.4z' fill='#69974f'/>
    <path d='M20.5 27.4V23.5'/><path d='M20.5 16.8 15.5 23.4h10z' fill='#7aa45f'/>
    <path d='M3 29.6h42'/><path d='M37.5 7.2q1.6-1.6 3.2 0q1.6-1.6 3.2 0'/>
  </svg>`,
  // 高原：三重雪山 + 朝阳 + 皴线
  mountains: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='21' ry='2.4' fill='${SHADOW}' stroke='none'/>
    <circle cx='40.5' cy='7' r='3.4' fill='#e0b45c' stroke-width='1.2'/>
    <path d='M3 27.6 13.5 10l6.5 10.2L25 9.5l10.5 18.1z' fill='#b79563'/>
    <path d='M20 27.6 32.5 6.5 45 27.6z' fill='#a37e4c'/>
    <path d='M5.5 27.6 15 13.4l4.6 7.3' stroke-width='1.1' opacity='.55'/>
    <path d='M32.5 6.5 28.4 14.2l3.2-1.1 2.2 2 2.4-2.2 3.2 1.4z' fill='#f8f3e4' stroke-width='1.2'/>
    <path d='M13.5 10 10.8 15l2.2-.8 1.6 1.4 1.7-1.5 2.1.9z' fill='#f8f3e4' stroke-width='1.1'/>
    <path d='M37 19.5 35 24M39.5 22.5 38 25.8M17 20.5 15.4 24.5' stroke-width='1' opacity='.55'/>
    <path d='M2.5 29.8h43'/>
  </svg>`,
  // 沙漠：沙丘 + 油井 + 驼队 + 仙人掌
  dunes: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='21' ry='2.4' fill='${SHADOW}' stroke='none'/>
    <circle cx='9' cy='7.2' r='3.2' fill='#e3b45c' stroke-width='1.2'/>
    <path d='M2.5 23.5q7-6 14-.6t13-1.4 15.5 1.2v7H2.5z' fill='#d9b26c' stroke-width='1.4'/>
    <path d='M2.5 23.5q7-6 14-.6' stroke-width='1.1' opacity='.7'/>
    <path d='M27 22.8q4.5-2.6 8 0' stroke-width='1.2'/>
    <path d='M36 27V17.5M31 27.6V23h-3.4M41 27.6V24h3.4' stroke-width='1.3'/>
    <path d='M31.5 17.5h9v-2h-9z' fill='#8a6534' stroke-width='1.2'/>
    <path d='M36 15.5v-4' stroke-width='1.2'/>
    <path d='M18 26.5q1.5-2.4 4-2.4t2.6 1.6' stroke-width='1.2'/>
    <path d='M24.6 25.7V29M20.6 25.7V29' stroke-width='1.2'/>
    <path d='M6 27.4V20M6 23.6l-2.4-1.6M6 25l2.4-1.8' stroke-width='1.2'/>
    <path d='M2.5 29.8h43'/>
  </svg>`,
  // 沿海：浪花 + 跃鱼 + 小帆船
  waves: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <path d='M2.6 21.6q3.4-3.4 6.8 0t6.8 0 6.8 0 6.8 0 6.8 0 6.8 0' stroke='#5f9aa8' stroke-width='2.4'/>
    <path d='M4.2 26.4q3.2-3 6.4 0t6.4 0 6.4 0 6.4 0 6.4 0 6.4 0' stroke='#7db4bd' stroke-width='1.8'/>
    <path d='M9 13.4c3.2-2.6 8.2-2.4 10.6.8-3.4 3.2-8.4 2.6-10.6-.8z' fill='#cf8a4a' stroke-width='1.4'/>
    <path d='M9 13.4 4.6 11.6M19.6 14.2l4-1.6' stroke-width='1.3'/>
    <circle cx='17.2' cy='13.2' r='.7' fill='${INK}' stroke='none'/>
    <path d='M33.5 17.2h10l-1.6-2.6h-6.8z' fill='#a3765a' stroke-width='1.3'/>
    <path d='M38.5 14.6V5.4l7.4 3.6z' fill='#f4e6c4' stroke-width='1.3'/>
    <path d='M38.5 5.4 38.5 14.6' stroke-width='1.2'/>
    <path d='M3 29.8h42'/>
  </svg>`,
  // 起点：中式牌坊 + 灯笼 + 铜钱
  gate: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='20' ry='2.4' fill='${SHADOW}' stroke='none'/>
    <path d='M10 28V12M38 28V12' stroke-width='2.4'/>
    <path d='M6 12h36' stroke-width='2.2'/>
    <path d='M4 12q3-5 8-5h24q5 0 8 5z' fill='#9a4a34' stroke-width='1.5'/>
    <path d='M9.5 6.6q14.5-3.6 29 0' stroke-width='1.2' fill='none'/>
    <path d='M13 8.2h22v3.4H13z' fill='#e7c87e' stroke-width='1.3'/>
    <path d='M18 16h12v9H18z' fill='#f0dcae' stroke-width='1.4'/>
    <path d='M24 16v9M18 20.5h12' stroke-width='1' opacity='.6'/>
    <circle cx='8' cy='16' r='2.5' fill='#b23a2a' stroke-width='1.2'/><path d='M8 13.5v-1.6' stroke-width='1'/>
    <circle cx='40' cy='16' r='2.5' fill='#b23a2a' stroke-width='1.2'/><path d='M40 13.5v-1.6' stroke-width='1'/>
    <circle cx='24' cy='27.6' r='2.6' fill='#d9b25a' stroke-width='1.2'/><path d='M24 25.4v4.4M21.8 27.6h4.4' stroke-width='1'/>
    <path d='M3 29.8h42'/>
  </svg>`,
  // 命运：铜框沙漏 + 星屑
  hourglass: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='14' ry='2.2' fill='${SHADOW}' stroke='none'/>
    <path d='M16 5.5h16M16 26.5h16' stroke-width='2.4'/>
    <path d='M17 5.5h14v4.6q0 3.6-7 6-7-2.4-7-6z' fill='#cfe0dd' stroke-width='1.3'/>
    <path d='M17 26.5h14v-4.6q0-3.6-7-6-7 2.4-7 6z' fill='#cfe0dd' stroke-width='1.3'/>
    <path d='M19 26.5h10l-5-4.4z' fill='#d9a63c' stroke-width='1.1'/>
    <path d='M24 15.4v3.2' stroke-width='1.1'/>
    <circle cx='24' cy='19.8' r='.8' fill='#d9a63c' stroke='none'/>
    <path d='M12 9.6l1.4 1.4M37 8.6l-1.6 1.2M10 24.4l1.6 1M38.6 22.6l-1.4 1.4' stroke-width='1.1'/>
    <path d='M5 29.8h38'/>
  </svg>`,
  // 机会：福袋 + 铜钱 + 金元宝
  gift: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='17' ry='2.4' fill='${SHADOW}' stroke='none'/>
    <path d='M12 12.4q12-4 24 0l-2.4 13.2q-9.6 3-19.2 0z' fill='#a84432' stroke-width='1.5'/>
    <path d='M12 12.4q12 5 24 0' stroke-width='1.2' opacity='.75'/>
    <path d='M18.5 12.2q5.5-4.4 11 0' stroke='#d9b25a' stroke-width='2'/>
    <path d='M21 12.6q3-2.4 6 0' stroke='#d9b25a' stroke-width='1.4'/>
    <path d='M23.6 17.2h.1M23.7 20.4h.1' stroke='#f3dc9a' stroke-width='2'/>
    <circle cx='34' cy='24.6' r='3.4' fill='#e0b45c' stroke-width='1.3'/><path d='M34 23.2v2.8M32.8 24.6h2.4' stroke-width='1'/>
    <path d='M6.4 24.4q2.6-2.2 5.2 0' stroke='#d9b25a' stroke-width='1.6'/>
    <path d='M4 29.8h40'/>
  </svg>`,
  // 桥：石拱桥 + 水面 + 路灯
  bridge: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <path d='M2.6 24.4q3.4-2.8 6.8 0t6.8 0 6.8 0 6.8 0 6.8 0 6.8 0' stroke='#5f9aa8' stroke-width='2'/>
    <path d='M3.4 27.6q3.2-2.4 6.4 0t6.4 0 6.4 0 6.4 0 6.4 0 6.4 0' stroke='#7db4bd' stroke-width='1.6'/>
    <path d='M4 21q20-14 40 0' stroke-width='2'/>
    <path d='M4 21q20 8 40 0' stroke-width='1.4' fill='#c9ad7e'/>
    <path d='M4 21v3M44 21v3' stroke-width='1.6'/>
    <path d='M13 17.6v4.2M22 14.6v4.4M32 14.8v4.2M41 18v4' stroke-width='1.2'/>
    <path d='M10 12.4v-4M38 12.4v-4' stroke-width='1.1'/>
    <circle cx='10' cy='7.4' r='1.5' fill='#e0b45c' stroke-width='1'/>
    <circle cx='38' cy='7.4' r='1.5' fill='#e0b45c' stroke-width='1'/>
    <path d='M4 29.8h40'/>
  </svg>`,
  // 赌场：骰子 + 纸牌 + 筹码
  dice: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='18' ry='2.4' fill='${SHADOW}' stroke='none'/>
    <rect x='5' y='11' width='13' height='13' rx='2.4' fill='#f4e6c4' stroke-width='1.5' transform='rotate(-8 11.5 17.5)'/>
    <circle cx='9.4' cy='14.4' r='1.1' fill='${INK}' stroke='none'/><circle cx='13.6' cy='18.2' r='1.1' fill='${INK}' stroke='none'/>
    <circle cx='13.6' cy='14.4' r='1.1' fill='${INK}' stroke='none'/><circle cx='9.4' cy='18.2' r='1.1' fill='${INK}' stroke='none'/>
    <rect x='21' y='8' width='13' height='13' rx='2.4' fill='#f4e6c4' stroke-width='1.5' transform='rotate(10 27.5 14.5)'/>
    <circle cx='26' cy='13' r='1.1' fill='${INK}' stroke='none'/><circle cx='31' cy='13' r='1.1' fill='${INK}' stroke='none'/>
    <circle cx='28.5' cy='16.6' r='1.1' fill='${INK}' stroke='none'/>
    <rect x='34' y='14' width='9' height='12' rx='1.6' fill='#efe0b8' stroke-width='1.3' transform='rotate(12 38.5 20)'/>
    <path d='M38.6 17.4l2.4 4.6-2.4 2.4-2.4-2.4z' fill='#b23a2a' stroke='none'/>
    <ellipse cx='9' cy='25.6' rx='3' ry='1.2' fill='#a84432' stroke-width='1.1'/>
    <ellipse cx='9' cy='24.4' rx='3' ry='1.2' fill='#d9b25a' stroke-width='1.1'/>
    <path d='M3 29.8h42'/>
  </svg>`,
  // 拍卖：木槌 + 竞价牌 + 金币
  gavel: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='${INK}' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>
    <ellipse cx='24' cy='28.8' rx='13' ry='2.2' fill='${SHADOW}' stroke='none'/>
    <rect x='7' y='5.5' width='16' height='8.4' rx='2' fill='#a3765a' stroke-width='1.5' transform='rotate(42 15 9.7)'/>
    <path d='M16.6 14.8 23.4 25.2' stroke-width='3'/>
    <path d='M9.6 26.4h11' stroke-width='3'/>
    <path d='M28 26.4h17' stroke-width='2.2'/>
    <path d='M34 26.4v4.4' stroke-width='1.6'/>
    <path d='M30 20.6h8v4.6h-8z' fill='#f0dcae' stroke-width='1.4'/>
    <path d='M31.4 21.8v2.2M36.6 21.8v2.2' stroke-width='1'/>
    <circle cx='41.5' cy='17.4' r='2.6' fill='#e0b45c' stroke-width='1.2'/>
    <path d='M4 29.8h40'/>
  </svg>`,
}

/** 按地块类型/地形选择图案（与 TILE_ART 的键对应） */
export function tileArtName(tile: Tile): string {
  if (tile.type === 'terrain') {
    return ({ forest: 'pines', plateau: 'mountains', desert: 'dunes', coast: 'waves' } as Record<string, string>)[tile.terrain] ?? 'dunes'
  }
  return ({ start: 'gate', fate: 'hourglass', chance: 'gift', bridge: 'bridge', casino: 'dice', auction: 'gavel' } as Record<string, string>)[tile.type] ?? 'gate'
}

// ---------- 建筑徽章 ----------
export type BuildingTone = 'production' | 'protection' | 'tech' | 'commercial'

const TONE: Record<BuildingTone, { line: string; fill: string }> = {
  production: { line: '#4f7a3f', fill: '#dfe8c8' },
  protection: { line: '#3f6f8a', fill: '#d8e6ec' },
  tech: { line: '#6b5a94', fill: '#e3dcef' },
  commercial: { line: '#a5711f', fill: '#f0e1bd' },
}

/** 在 72×72 画布上绘制建筑徽章：外圈 + 类别色内圈 + 墨线图标 + 等级圆点 */
export function drawBuildingBadge(
  ctx: CanvasRenderingContext2D,
  id: string,
  tone: BuildingTone,
  level: number,
  damaged: boolean,
): void {
  const S = 72
  const c = S / 2
  const t = TONE[tone]
  ctx.clearRect(0, 0, S, S)
  // 投影
  ctx.save()
  ctx.fillStyle = 'rgba(60, 38, 16, 0.25)'
  ctx.beginPath()
  ctx.ellipse(c, S - 8, 20, 5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  // 底盘
  ctx.beginPath()
  ctx.arc(c, c - 2, 27, 0, Math.PI * 2)
  ctx.fillStyle = damaged ? '#d8c7ae' : '#f5e7c6'
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = damaged ? '#7a5a3a' : t.line
  ctx.stroke()
  // 内圈
  ctx.beginPath()
  ctx.arc(c, c - 2, 21, 0, Math.PI * 2)
  ctx.fillStyle = damaged ? '#c9b498' : t.fill
  ctx.fill()
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(74, 52, 32, 0.55)'
  ctx.stroke()

  // 图标：统一 28×28 视框，缩放 0.72，居中
  ctx.save()
  ctx.translate(c - 14 * 0.72, c - 2 - 14 * 0.72)
  ctx.scale(0.72, 0.72)
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = '#3a2814'
  ctx.fillStyle = '#3a2814'
  drawBuildingGlyph(ctx, id)
  ctx.restore()

  // 等级圆点
  for (let i = 0; i < 3; i++) {
    const x = c + (i - 1) * 7
    const y = S - 7
    ctx.beginPath()
    ctx.arc(x, y, 2.3, 0, Math.PI * 2)
    ctx.fillStyle = i < level ? t.line : 'rgba(74, 52, 32, 0.22)'
    ctx.fill()
  }
  // 受损裂纹
  if (damaged) {
    ctx.strokeStyle = 'rgba(150, 48, 32, 0.9)'
    ctx.lineWidth = 2.2
    ctx.beginPath()
    ctx.moveTo(c - 12, c - 18)
    ctx.lineTo(c - 5, c - 6)
    ctx.lineTo(c - 10, c + 2)
    ctx.lineTo(c - 2, c + 12)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(60, 20, 10, 0.55)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
}

function drawBuildingGlyph(ctx: CanvasRenderingContext2D, id: string): void {
  switch (id) {
    case 'lumber-mill':
      // 斧头 + 木段
      ctx.beginPath()
      ctx.moveTo(6, 24)
      ctx.lineTo(20, 8)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(18, 3)
      ctx.lineTo(25, 10)
      ctx.lineTo(20, 15)
      ctx.lineTo(13, 8)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(4, 18)
      ctx.lineTo(12, 18)
      ctx.moveTo(3, 22)
      ctx.lineTo(12, 22)
      ctx.stroke()
      break
    case 'pasture':
      // 牛头
      ctx.beginPath()
      ctx.ellipse(14, 15, 8, 7, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(6, 11)
      ctx.quadraticCurveTo(1, 8, 4, 15)
      ctx.moveTo(22, 11)
      ctx.quadraticCurveTo(27, 8, 24, 15)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(11, 14, 1.2, 0, Math.PI * 2)
      ctx.arc(17, 14, 1.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(11, 19)
      ctx.quadraticCurveTo(14, 21, 17, 19)
      ctx.stroke()
      break
    case 'oil-well':
      ctx.beginPath()
      ctx.moveTo(5, 25)
      ctx.lineTo(14, 5)
      ctx.lineTo(23, 25)
      ctx.moveTo(7, 20)
      ctx.lineTo(21, 20)
      ctx.moveTo(10, 13)
      ctx.lineTo(18, 13)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(8, 25)
      ctx.lineTo(20, 10)
      ctx.moveTo(20, 25)
      ctx.lineTo(8, 10)
      ctx.stroke()
      break
    case 'fishing-port':
      ctx.beginPath()
      ctx.moveTo(14, 4)
      ctx.lineTo(14, 24)
      ctx.moveTo(8, 9)
      ctx.lineTo(20, 9)
      ctx.moveTo(9, 8)
      ctx.quadraticCurveTo(14, 14, 14, 18)
      ctx.moveTo(19, 8)
      ctx.quadraticCurveTo(14, 14, 14, 18)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(14, 25, 3.4, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'firebreak':
      ctx.beginPath()
      ctx.moveTo(14, 3)
      ctx.quadraticCurveTo(23, 11, 20, 18)
      ctx.quadraticCurveTo(18, 24, 14, 25)
      ctx.quadraticCurveTo(9, 24, 8, 17)
      ctx.quadraticCurveTo(7, 11, 14, 3)
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(4, 26)
      ctx.lineTo(24, 4)
      ctx.stroke()
      break
    case 'greenhouse':
      ctx.beginPath()
      ctx.moveTo(4, 15)
      ctx.lineTo(14, 6)
      ctx.lineTo(24, 15)
      ctx.lineTo(24, 25)
      ctx.lineTo(4, 25)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(14, 14)
      ctx.lineTo(14, 25)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(14, 20)
      ctx.quadraticCurveTo(8, 15, 9, 10)
      ctx.quadraticCurveTo(15, 12, 14, 20)
      ctx.fill()
      ctx.stroke()
      break
    case 'sandbelt':
      for (const [x, s] of [[7, 0.8], [14, 1], [21, 0.8]] as const) {
        ctx.beginPath()
        ctx.moveTo(x, 25)
        ctx.lineTo(x, 17)
        ctx.moveTo(x - 6 * s, 19)
        ctx.lineTo(x, 10)
        ctx.lineTo(x + 6 * s, 19)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      break
    case 'breakwater':
      ctx.beginPath()
      ctx.moveTo(3, 22)
      ctx.lineTo(8, 22)
      ctx.lineTo(8, 26)
      ctx.moveTo(10, 22)
      ctx.lineTo(15, 22)
      ctx.lineTo(15, 26)
      ctx.moveTo(17, 22)
      ctx.lineTo(22, 22)
      ctx.lineTo(22, 26)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(2, 18)
      ctx.quadraticCurveTo(5, 13, 8, 18)
      ctx.moveTo(12, 15)
      ctx.quadraticCurveTo(15, 10, 18, 15)
      ctx.moveTo(20, 18)
      ctx.quadraticCurveTo(23, 13, 26, 18)
      ctx.stroke()
      break
    case 'dam':
      ctx.beginPath()
      ctx.moveTo(3, 22)
      ctx.lineTo(5, 9)
      ctx.lineTo(23, 9)
      ctx.lineTo(25, 22)
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(7, 20)
      ctx.quadraticCurveTo(10, 15, 14, 20)
      ctx.quadraticCurveTo(18, 15, 21, 20)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(14, 9)
      ctx.lineTo(14, 3)
      ctx.stroke()
      break
    case 'weather-station':
      ctx.beginPath()
      ctx.moveTo(14, 25)
      ctx.lineTo(14, 12)
      ctx.moveTo(8, 25)
      ctx.lineTo(20, 25)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(14, 9, 7, Math.PI * 0.15, Math.PI * 1.05)
      ctx.lineTo(14, 9)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(14, 9, 2, 0, Math.PI * 2)
      ctx.fill()
      break
    case 'automation':
      ctx.beginPath()
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        const r = i % 2 === 0 ? 11 : 7.5
        ctx.lineTo(14 + Math.cos(a) * r, 14 + Math.sin(a) * r)
      }
      ctx.closePath()
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(14, 14, 3.4, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'drone-logistics':
      ctx.beginPath()
      ctx.moveTo(14, 10)
      ctx.lineTo(14, 18)
      ctx.moveTo(6, 8)
      ctx.lineTo(22, 8)
      ctx.moveTo(7, 5)
      ctx.lineTo(7, 11)
      ctx.moveTo(21, 5)
      ctx.lineTo(21, 11)
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(7, 5, 3.2, 0, Math.PI * 2)
      ctx.arc(21, 5, 3.2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.beginPath()
      ctx.rect(10, 18, 8, 6)
      ctx.stroke()
      break
    case 'apartment':
    case 'office':
    case 'mall': {
      const h = id === 'office' ? 23 : id === 'mall' ? 15 : 19
      const w = id === 'mall' ? 24 : 18
      const x = 14 - w / 2
      const y = 26 - h
      ctx.strokeRect(x, y, w, h)
      if (id === 'mall') {
        ctx.beginPath()
        ctx.moveTo(x - 2, y)
        ctx.lineTo(x + w + 2, y)
        ctx.moveTo(x + 2, y + 5)
        ctx.lineTo(x + w - 2, y + 5)
        ctx.moveTo(14, y + 5)
        ctx.lineTo(14, y + h)
        ctx.stroke()
      } else {
        for (let r = 0; r < (id === 'office' ? 3 : 2); r++) {
          for (let c = 0; c < 2; c++) {
            ctx.strokeRect(x + 4 + c * 7, y + 4 + r * 6, 4, 3.4)
          }
        }
        ctx.beginPath()
        ctx.rect(11, 22, 6, 4)
        ctx.stroke()
      }
      break
    }
    default:
      ctx.strokeRect(6, 6, 16, 16)
  }
}
