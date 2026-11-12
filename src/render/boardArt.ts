// ============ 棋盘地形叠加层：山脉 / 森林 / 沙漠 / 海岸 / 河流 / 商路 / 桥 ============
// 底图是程序化生成的手绘地形（assets/images/board-terrain.webp），
// 这里用 Canvas 叠加清晰的山体、树冠、沙丘、田块、河流与道路，保证：
//   1. 河流是同一条：西侧山泉 → 西桥 → 谷地 → 东桥 → 东南海湾；
//   2. 道路沿 LAYOUT 的蜿蜒环线铺设，桥位与格子完全对齐；
//   3. 地图内没有任何文字；地形色与格子所属区域一致。

import { BOARD, LAYOUT, RIVER_POINTS, SEA_COAST } from '../core/map'

const W = BOARD.w
const H = BOARD.h

type Pt = { x: number; y: number }


function shadeHex(hex: string, f: number): string {
  const v = parseInt(hex.slice(1), 16)
  const r = Math.max(0, Math.min(255, Math.round(((v >> 16) & 255) * f)))
  const g = Math.max(0, Math.min(255, Math.round(((v >> 8) & 255) * f)))
  const b = Math.max(0, Math.min(255, Math.round((v & 255) * f)))
  return `rgb(${r}, ${g}, ${b})`
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function linePath(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
}

function smoothPoints(pts: Pt[], samples = 6): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    for (let k = 0; k < samples; k++) {
      const t = k / samples
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

// ---------- 基础画法 ----------

// 松树改用参考图的厚涂小冠层：一棵树由十层枝盘、针叶和外缘高光组成。
// 生成一次精灵，之后只做缩放贴图，烘焙成本低，也比原来的三角形树更像手绘。
const PINE_PALETTES = [
  { deep: '#132114', dark: '#1c2c19', mid: '#2d4024', light: '#4b5e32', tip: '#7c894c', warm: '#929657' },
  { deep: '#16251a', dark: '#20321f', mid: '#324827', light: '#596b37', tip: '#818d50', warm: '#a2a469' },
  { deep: '#14241b', dark: '#233724', mid: '#3a4d2b', light: '#57673a', tip: '#78854c', warm: '#969d5d' },
  { deep: '#17261a', dark: '#26391f', mid: '#3e5227', light: '#617039', tip: '#899452', warm: '#a7a66b' },
]

interface PineSprite { canvas: HTMLCanvasElement; w: number; h: number }

function createPineSprite(seed: number): PineSprite {
  const VW = 130
  const VH = 212
  const SS = 1.65
  const c = document.createElement('canvas')
  c.width = Math.ceil(VW * SS)
  c.height = Math.ceil(VH * SS)
  const g = c.getContext('2d')!
  g.scale(SS, SS)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const r = mulberry32(seed)
  const pal = PINE_PALETTES[seed % PINE_PALETTES.length]
  const cx = 65 + (r() - 0.5) * 5
  const ground = 197
  const top = 20 + r() * 9
  const tiers = 10
  const treeTopY = top
  const treeH = ground - 22 - top
  const lean = (r() - 0.5) * 0.035

  const trunkGrad = g.createLinearGradient(cx - 3, 0, cx + 4, 0)
  trunkGrad.addColorStop(0, '#39291a')
  trunkGrad.addColorStop(0.5, '#533c25')
  trunkGrad.addColorStop(1, '#24180f')
  g.strokeStyle = trunkGrad
  g.lineWidth = 4.5
  g.beginPath()
  g.moveTo(cx, ground)
  g.quadraticCurveTo(cx + lean * 45, ground * 0.62, cx + lean * 80, top + 18)
  g.stroke()

  const tierData: { t: number; y: number; half: number; wob: number }[] = []
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1)
    const y = ground - 16 - t * (treeH * 0.86)
    const half = (4 + Math.pow(1 - t, 0.78) * (37 + r() * 5)) * (cx < 65 ? 0.96 : 1)
    const wob = (r() - 0.5) * 5
    tierData.push({ t, y, half, wob })
  }

  // 深色树体，由下往上收尖
  const body: [number, number][] = [[cx + lean * 65, treeTopY - 4]]
  for (let i = tiers - 1; i >= 0; i--) {
    const d = tierData[i]
    body.push([cx + d.half * (1 + 0.04 * (r() - 0.5)), d.y - 2 + d.wob * 0.3])
    body.push([cx + d.half * 0.73, d.y + 4.2 + d.wob * 0.2])
    body.push([cx + d.half * 0.48, d.y + 7.5 + d.wob * 0.1])
  }
  for (let i = 0; i < tiers; i++) {
    const d = tierData[i]
    body.push([cx - d.half * 0.5, d.y + 7.4 + d.wob * 0.1])
    body.push([cx - d.half * 0.75, d.y + 4.2 + d.wob * 0.2])
    body.push([cx - d.half * (1 + 0.04 * (r() - 0.5)), d.y - 2 + d.wob * 0.3])
  }
  g.beginPath()
  body.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])))
  g.closePath()
  const bodyGrad = g.createLinearGradient(cx - 36, treeTopY, cx + 26, ground)
  bodyGrad.addColorStop(0, pal.dark)
  bodyGrad.addColorStop(0.55, pal.deep)
  bodyGrad.addColorStop(1, pal.dark)
  g.fillStyle = bodyGrad
  g.fill()

  // 左右枝盘，向阳面更亮，背阴面更深
  const shades = [pal.dark, pal.mid, pal.light]
  for (let i = 0; i < tiers; i++) {
    const d = tierData[i]
    for (const side of [-1, 1]) {
      const count = d.t > 0.78 ? 1 : (r() > 0.4 ? 3 : 2)
      for (let k = 0; k < count; k++) {
        const reach = d.half * (k === 0 ? 0.98 : 0.6 + r() * 0.26)
        const yBase = d.y + 1.5 + (r() - 0.5) * 4 + k * 1.6
        const yTip = yBase - 2 - r() * 6.5
        const tipX = cx + side * reach * (1 - k * 0.08)
        const dip = r() * 4.5
        g.beginPath()
        g.moveTo(cx + side * 2.2, yBase + 3)
        g.quadraticCurveTo(cx + side * reach * 0.34, yBase - 5.2, tipX, yTip)
        g.lineTo(tipX - side * 1.6, yTip + 3.4 + dip)
        g.lineTo(cx + side * reach * 0.69, yBase + 4.8 + dip * 0.35)
        g.lineTo(cx + side * reach * 0.41, yBase + 5.2 + dip * 0.6)
        g.lineTo(cx + side * reach * 0.12, yBase + 6.1)
        g.closePath()
        g.fillStyle = side < 0 ? (k === 0 ? shades[2] : shades[1]) : (k === 0 ? pal.dark : pal.mid)
        g.fill()
        if (side < 0 && k === 0) {
          g.globalAlpha = 0.34
          g.fillStyle = pal.tip
          g.beginPath()
          g.moveTo(cx - 2, yBase + 1.3)
          g.quadraticCurveTo(cx - reach * 0.35, yBase - 5.8, tipX, yTip + 1)
          g.lineTo(tipX + 4, yTip + 3)
          g.lineTo(cx - reach * 0.35, yBase + 1)
          g.closePath()
          g.fill()
          g.globalAlpha = 1
        }
      }
      // 外缘针叶
      const tuftCount = d.t > 0.85 ? 3 : 6
      for (let n = 0; n < tuftCount; n++) {
        const rr = d.half * (0.76 + r() * 0.26)
        const bx = cx + side * rr
        const by = d.y - 1 + (r() - 0.5) * 8
        g.strokeStyle = side < 0 ? pal.light : pal.mid
        g.globalAlpha = 0.24 + r() * 0.25
        g.lineWidth = 0.42 + r() * 0.55
        g.beginPath()
        g.moveTo(bx, by)
        g.lineTo(bx + side * (2 + r() * 7), by - 3 - r() * 8)
        g.stroke()
      }
    }
  }

  // 树梢
  g.globalAlpha = 0.94
  g.fillStyle = pal.mid
  g.beginPath()
  g.moveTo(cx + lean * 70, treeTopY - 3)
  g.lineTo(cx + lean * 65 + 3.2, treeTopY + 16)
  g.lineTo(cx + lean * 60, treeTopY + 27)
  g.lineTo(cx + lean * 66, treeTopY + 21)
  g.lineTo(cx + lean * 74, treeTopY + 35)
  g.lineTo(cx + lean * 64, treeTopY + 44)
  g.lineTo(cx + lean * 70, treeTopY + 48)
  g.lineTo(cx + lean * 57, treeTopY + 58)
  g.closePath()
  g.fill()
  g.globalAlpha = 1

  // 细针叶 / 干笔触
  for (let i = 0; i < 430; i++) {
    const tier = tierData[Math.floor(r() * tierData.length)]
    const side = r() > 0.45 ? -1 : 1
    const reach = tier.half * (0.35 + r() * 0.68)
    const x = cx + side * reach
    const y = tier.y + (r() - 0.5) * 10
    const len = 1.5 + r() * 6.5
    g.strokeStyle = side < 0
      ? (r() > 0.35 ? pal.light : pal.tip)
      : (r() > 0.4 ? pal.deep : pal.mid)
    g.globalAlpha = 0.05 + r() * 0.2
    g.lineWidth = 0.32 + r() * 0.5
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + side * (1 + r() * 5), y - len * 0.55 + r() * 4)
    g.stroke()
  }
  g.globalAlpha = 1
  return { canvas: c, w: VW, h: VH }
}

const PINE_SPRITES: PineSprite[] = Array.from({ length: 8 }, (_, i) => createPineSprite(700 + i * 131))

function drawPine(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, seed: number, alphaMul = 1): void {
  const spr = PINE_SPRITES[Math.abs(seed) % PINE_SPRITES.length]
  const w = h * (spr.w / spr.h)
  const alpha = (0.94 + (seed % 7) * 0.008) * alphaMul
  // 接触阴影收得很小，避免林下出现大片脏阴影
  ctx.fillStyle = 'rgba(42, 38, 22, 0.18)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.07, y + h * 0.012, w * 0.34, Math.max(1, h * 0.045), 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = alpha
  ctx.drawImage(spr.canvas, x - w / 2, y - h * 0.93, w, h)
  ctx.globalAlpha = 1
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, _broadleaf = false): void {
  drawPine(ctx, x, y, s * 1.72, Math.floor(x * 3.1 + y * 5.7))
}

function mountainRidge(
  ctx: CanvasRenderingContext2D, rand: () => number,
  x0: number, x1: number, baseY: number, amp: number,
  fill: string, snow: boolean, dark: boolean,
): void {
  const n = Math.max(3, Math.round((x1 - x0) / 225))
  const step = (x1 - x0) / n
  const peaks: Pt[] = []
  const pts: Pt[] = [{ x: x0, y: baseY }]
  for (let i = 0; i < n; i++) {
    const colX = x0 + i * step
    const colY = baseY - amp * (0.38 + rand() * 0.12)
    pts.push({ x: colX, y: colY })
    const px = colX + step * 0.5
    const py = baseY - amp * (0.48 + rand() * 0.52)
    peaks.push({ x: px, y: py })
    pts.push({ x: px, y: py })
  }
  pts.push({ x: x1, y: baseY - amp * 0.42 })
  pts.push({ x: x1, y: baseY })

  // 地面投影
  ctx.save()
  ctx.translate(38, 40)
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  ctx.fillStyle = 'rgba(18, 14, 8, 0.16)'
  ctx.fill()
  ctx.restore()

  // 山体：由亮到暗的竖向渐变
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  const body = ctx.createLinearGradient(0, baseY - amp, 0, baseY + 20)
  body.addColorStop(0, shadeHex(fill, 1.22))
  body.addColorStop(0.45, fill)
  body.addColorStop(0.82, shadeHex(fill, 0.72))
  body.addColorStop(1, shadeHex(fill, 0.55))
  ctx.fillStyle = body
  ctx.fill()
  ctx.strokeStyle = 'rgba(38, 28, 16, 0.62)'
  ctx.lineWidth = 2
  ctx.stroke()

  // 每个峰：向阳面 / 背阴面 / 雪 / 岩层
  for (let pi = 0; pi < peaks.length; pi++) {
    const p = peaks[pi]
    const h = baseY - p.y
    // 左（向阳）
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x - step * 0.28, baseY)
    ctx.lineTo(p.x - step * 0.04, baseY)
    ctx.closePath()
    ctx.fillStyle = 'rgba(255, 238, 200, 0.17)'
    ctx.fill()
    // 右（背阴）
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + step * 0.34, baseY)
    ctx.lineTo(p.x + step * 0.06, baseY)
    ctx.closePath()
    ctx.fillStyle = dark ? 'rgba(18, 12, 6, 0.34)' : 'rgba(28, 20, 12, 0.25)'
    ctx.fill()
    // 岩层
    ctx.strokeStyle = 'rgba(32, 24, 14, 0.22)'
    ctx.lineWidth = 1
    for (let k = 0; k < 5; k++) {
      ctx.beginPath()
      ctx.moveTo(p.x + 4 + k * 6, p.y + h * (0.18 + k * 0.08))
      ctx.lineTo(p.x - step * 0.18 + k * 4, baseY - 4)
      ctx.stroke()
    }
    // 雪帽（有高差 + 随机，避免一排白帽）
    if (snow && h > amp * 0.52 && rand() > 0.22) {
      const sw = Math.min(step * 0.32, h * 0.34)
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - sw, p.y + h * 0.12)
      ctx.lineTo(p.x - sw * 0.6, p.y + h * 0.2)
      ctx.lineTo(p.x - sw * 0.22, p.y + h * 0.15)
      ctx.lineTo(p.x + sw * 0.18, p.y + h * 0.23)
      ctx.lineTo(p.x + sw * 0.55, p.y + h * 0.16)
      ctx.lineTo(p.x + sw, p.y + h * 0.21)
      ctx.closePath()
      ctx.fillStyle = 'rgba(238, 245, 243, 0.96)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(96, 100, 94, 0.35)'
      ctx.stroke()
      // 雪舌
      ctx.strokeStyle = 'rgba(212, 230, 232, 0.7)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.moveTo(p.x - sw * 0.4, p.y + h * 0.19)
      ctx.quadraticCurveTo(p.x, p.y + h * 0.3, p.x + sw * 0.42, p.y + h * 0.2)
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(p.x, p.y + 2)
      ctx.lineTo(p.x - sw * 0.35, p.y + h * 0.16)
      ctx.stroke()
    }
  }

  // 山脚薄雾
  for (let i = 0; i < 3; i++) {
    const mx = x0 + rand() * (x1 - x0)
    const rg = ctx.createRadialGradient(mx, baseY - 4, 0, mx, baseY - 4, 150 + rand() * 120)
    rg.addColorStop(0, 'rgba(238, 242, 232, 0.10)')
    rg.addColorStop(1, 'rgba(238, 242, 232, 0)')
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.ellipse(mx, baseY - 2, 160, 34, 0, 0, Math.PI * 2)
    ctx.fill()
  }
}

function duneBand(ctx: CanvasRenderingContext2D, rand: () => number, x0: number, x1: number, baseY: number, amp: number, fill: string): void {
  const n = Math.max(3, Math.round((x1 - x0) / 120))
  const step = (x1 - x0) / n
  ctx.beginPath()
  ctx.moveTo(x0, baseY)
  for (let i = 0; i < n; i++) {
    const px = x0 + (i + 0.5) * step
    const py = baseY - amp * (0.3 + rand() * 0.7)
    ctx.quadraticCurveTo(px - step * 0.25, py, px, py)
    ctx.quadraticCurveTo(px + step * 0.34, baseY - amp * 0.05, px + step * 0.5, baseY - amp * 0.08)
  }
  ctx.lineTo(x1, baseY + 36)
  ctx.lineTo(x0, baseY + 36)
  ctx.closePath()
  ctx.fillStyle = fill
  ctx.fill()
  ctx.save()
  ctx.clip()
  const dg = ctx.createLinearGradient(0, baseY - amp, 0, baseY + 36)
  dg.addColorStop(0, 'rgba(255, 238, 196, 0.16)')
  dg.addColorStop(0.5, 'rgba(255, 255, 255, 0)')
  dg.addColorStop(1, 'rgba(92, 60, 22, 0.18)')
  ctx.fillStyle = dg
  ctx.fillRect(x0, baseY - amp - 20, x1 - x0, amp + 70)
  ctx.restore()
  ctx.strokeStyle = 'rgba(122, 88, 44, 0.18)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = 'rgba(100, 68, 32, 0.24)'
  ctx.lineWidth = 1
  for (let i = 0; i < 12; i++) {
    const x = x0 + rand() * (x1 - x0)
    const y = baseY - rand() * 16 + 8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(x + 20, y - 6, x + 40, y)
    ctx.stroke()
  }
}

function field(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: string): void {
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + w, y + 4)
  ctx.lineTo(x + w - 5, y + h)
  ctx.lineTo(x + 3, y + h - 4)
  ctx.closePath()
  ctx.fillStyle = tone
  ctx.fill()
  ctx.strokeStyle = 'rgba(74, 68, 40, 0.45)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.strokeStyle = 'rgba(74, 68, 40, 0.24)'
  ctx.lineWidth = 1
  for (let i = 1; i < 6; i++) {
    ctx.beginPath()
    ctx.moveTo(x + (w / 6) * i, y + 2)
    ctx.lineTo(x + (w / 6) * i - 3, y + h - 2)
    ctx.stroke()
  }
}

// ---------- 地形 ----------

/** 高原上的低矮平顶岩台：不画通长崖线，只用两块台地把高度交代清楚。 */
function plateauShelf(
  ctx: CanvasRenderingContext2D, rand: () => number,
  x: number, baseY: number, w: number, h: number,
): void {
  ctx.save()
  ctx.fillStyle = 'rgba(58, 49, 35, 0.16)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.1, baseY + 3, w * 0.55, h * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()

  const topY = baseY - h
  const face: Pt[] = [
    { x: x - w * 0.52, y: baseY },
    { x: x - w * 0.46, y: topY + h * 0.45 },
    { x: x - w * 0.32, y: topY + h * 0.2 },
    { x: x + w * 0.3, y: topY + h * 0.18 },
    { x: x + w * 0.44, y: topY + h * 0.48 },
    { x: x + w * 0.5, y: baseY },
  ]
  const faceG = ctx.createLinearGradient(0, topY, 0, baseY)
  faceG.addColorStop(0, '#a99372')
  faceG.addColorStop(0.45, '#8b7458')
  faceG.addColorStop(1, '#69563f')
  ctx.fillStyle = faceG
  ctx.beginPath()
  face.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(73, 58, 40, 0.38)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 浅色台地面：不是尖峰，是一块被抬起来的平台
  ctx.fillStyle = 'rgba(210, 198, 169, 0.82)'
  ctx.beginPath()
  ctx.moveTo(x - w * 0.32, topY + h * 0.16)
  ctx.quadraticCurveTo(x - w * 0.08, topY + h * 0.02, x + w * 0.28, topY + h * 0.16)
  ctx.lineTo(x + w * 0.24, topY + h * 0.3)
  ctx.quadraticCurveTo(x, topY + h * 0.2, x - w * 0.29, topY + h * 0.3)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(241, 231, 207, 0.46)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 岩石层理、草缝、坡脚碎石
  for (let i = 0; i < 6; i++) {
    const yy = topY + h * (0.34 + i * 0.1)
    ctx.strokeStyle = `rgba(79, 62, 42, ${0.12 + rand() * 0.1})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x - w * (0.36 + rand() * 0.08), yy)
    ctx.quadraticCurveTo(x, yy + 2, x + w * (0.28 + rand() * 0.12), yy - 1)
    ctx.stroke()
  }
  for (let i = 0; i < 10; i++) {
    const gx = x - w * 0.36 + rand() * w * 0.7
    const gy = topY + h * 0.16 + rand() * 4
    ctx.strokeStyle = 'rgba(93, 107, 67, 0.45)'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(gx, gy)
    ctx.lineTo(gx + (rand() - 0.5) * 2, gy - 3 - rand() * 3)
    ctx.stroke()
  }
  for (let i = 0; i < 12; i++) {
    const gx = x - w * 0.48 + rand() * w * 0.96
    const gy = baseY - rand() * h * 0.15
    ctx.fillStyle = rand() > 0.5 ? 'rgba(112, 93, 67, 0.42)' : 'rgba(189, 168, 132, 0.36)'
    ctx.beginPath()
    ctx.ellipse(gx, gy, 1.5 + rand() * 4, 1 + rand() * 2, rand(), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 高原前缘的岩坎：用厚重的岩壁和坡脚碎石，明确“高原”高度。 */
function plateauCliff(
  ctx: CanvasRenderingContext2D, rand: () => number,
  x0: number, x1: number, topY: number, baseY: number,
): void {
  const top: Pt[] = []
  const bottom: Pt[] = []
  for (let x = x0; x <= x1; x += 14) {
    const t = (x - x0) / (x1 - x0)
    const ty = topY + Math.sin(t * 9 + 0.6) * 5 + Math.sin(t * 23 + 1.7) * 2.5
    top.push({ x, y: ty })
    bottom.push({ x, y: baseY + Math.sin(t * 11 + 2.2) * 5 + rand() * 2 })
  }
  const face = [...top, ...bottom.slice().reverse()]
  const g = ctx.createLinearGradient(0, topY, 0, baseY)
  g.addColorStop(0, '#b8a584')
  g.addColorStop(0.18, '#9d8768')
  g.addColorStop(0.62, '#7d674d')
  g.addColorStop(1, '#5c4b37')
  ctx.fillStyle = g
  ctx.beginPath()
  face.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(66, 51, 34, 0.42)'
  ctx.lineWidth = 1
  ctx.stroke()

  // 浅色岩唇
  ctx.strokeStyle = 'rgba(234, 220, 191, 0.48)'
  ctx.lineWidth = 2
  ctx.beginPath()
  top.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y - 1) : ctx.moveTo(p.x, p.y - 1)))
  ctx.stroke()

  // 竖向岩层 / 裂缝
  for (let i = 0; i < 34; i++) {
    const x = x0 + rand() * (x1 - x0)
    const yy = topY + 3 + rand() * (baseY - topY - 5)
    ctx.strokeStyle = `rgba(70, 53, 35, ${0.10 + rand() * 0.14})`
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(x, yy)
    ctx.quadraticCurveTo(x + 1, yy + 4, x - 1, yy + 6 + rand() * 5)
    ctx.stroke()
  }
  // 坡脚阴影 + 碎石
  const sh = ctx.createLinearGradient(0, baseY - 2, 0, baseY + 18)
  sh.addColorStop(0, 'rgba(49, 42, 30, 0.20)')
  sh.addColorStop(1, 'rgba(49, 42, 30, 0)')
  ctx.fillStyle = sh
  ctx.fillRect(x0 - 4, baseY - 2, x1 - x0 + 8, 22)
  for (let i = 0; i < 26; i++) {
    const x = x0 + rand() * (x1 - x0)
    const y = baseY + rand() * 14
    ctx.fillStyle = rand() > 0.5 ? 'rgba(105, 89, 66, 0.42)' : 'rgba(185, 166, 131, 0.36)'
    ctx.beginPath()
    ctx.ellipse(x, y, 1.2 + rand() * 3.2, 0.8 + rand() * 1.7, rand(), 0, Math.PI * 2)
    ctx.fill()
  }
  // 坎顶草丛
  ctx.strokeStyle = 'rgba(99, 110, 68, 0.55)'
  ctx.lineWidth = 0.8
  for (let i = 0; i < 22; i++) {
    const x = x0 + rand() * (x1 - x0)
    const y = topY + 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 4 - rand() * 4)
    ctx.stroke()
  }
}

function paintMountains(ctx: CanvasRenderingContext2D, rand: () => number): void {
  // 雪山本体已烘焙进 board-terrain.webp。这里只补山脚的接触影、
  // 低处雪沫和少量林线，让山体不是一张悬空的贴图。
  const contact = ctx.createLinearGradient(0, 610, 0, 870)
  contact.addColorStop(0, 'rgba(62, 54, 40, 0.15)')
  contact.addColorStop(0.38, 'rgba(71, 64, 47, 0.085)')
  contact.addColorStop(1, 'rgba(71, 64, 47, 0)')
  ctx.fillStyle = contact
  ctx.fillRect(0, 610, 1420, 260)

  // 高原前缘的柔和落影：不画线，用一条很宽的明暗过渡交代高度
  const plateauShadow = ctx.createLinearGradient(0, 690, 0, 850)
  plateauShadow.addColorStop(0, 'rgba(70, 60, 43, 0)')
  plateauShadow.addColorStop(0.42, 'rgba(70, 60, 43, 0.10)')
  plateauShadow.addColorStop(0.72, 'rgba(70, 60, 43, 0.05)')
  plateauShadow.addColorStop(1, 'rgba(70, 60, 43, 0)')
  ctx.fillStyle = plateauShadow
  ctx.fillRect(100, 690, 1350, 160)

  // 山脚被风吹薄的雪沫，低对比、只留在岩石一侧
  for (let i = 0; i < 28; i++) {
    const x = 300 + rand() * 1070
    const y = 625 + rand() * 72
    const rx = 8 + Math.random() * 38
    if (Math.sin(x * 0.013 + y * 0.021) < -0.1) continue
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
    g.addColorStop(0, 'rgba(245, 241, 230, 0.22)')
    g.addColorStop(0.6, 'rgba(238, 231, 214, 0.10)')
    g.addColorStop(1, 'rgba(238, 231, 214, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, rx, rx * 0.28, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // 从高原草甸长上来的树线：压住山体下缘，制造“山在林中”的层次。
  const nearRoad = (x: number, y: number, d: number): boolean => LAYOUT.some(p => Math.hypot(p.x - x, p.y - y) < d)
  const nearWater = (x: number, y: number, d: number): boolean => {
    for (let i = 0; i < RIVER_POINTS.length; i += 2) {
      const p = RIVER_POINTS[i]
      if (Math.hypot(p.x - x, p.y - y) < d) return true
    }
    return false
  }
  // 两条树带夹住山脚：上带长在雪线下的碎石坡，下带接河岸与林地。
  // 中间的河会自然留出一条横向缺口，不会出现整齐的树墙。
  for (const band of [{ y0: 600, y1: 690, n: 46 }, { y0: 760, y1: 870, n: 86 }]) {
    for (let i = 0; i < band.n; i++) {
      const x = 200 + rand() * 1210
      const y = band.y0 + rand() * (band.y1 - band.y0)
      if (nearRoad(x, y, 74) || nearWater(x, y, 54)) continue
      if (x > 1120 && y > 855) continue
      const h = 25 + rand() * 18 + Math.max(0, (y - 800) * 0.08)
      drawPine(ctx, x, y, h, Math.floor(rand() * 100000))
    }
  }
}

/** 林间低山：不抢雪山的戏，用同一套灰绿岩色和松林压住山脚。 */
function forestHill(
  ctx: CanvasRenderingContext2D,
  rand: () => number,
  cx: number,
  baseY: number,
  w: number,
  h: number,
  alpha: number,
): void {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const n = 5
  const step = w / n
  const peaks: { x: number; y: number; h: number }[] = []
  for (let i = 0; i < n; i++) {
    const px = x0 + step * (i + 0.5) + (rand() - 0.5) * step * 0.18
    const ph = h * (0.48 + rand() * 0.42)
    peaks.push({ x: px, y: baseY - ph, h: ph })
  }
  const outline: Pt[] = [{ x: x0, y: baseY }]
  for (let i = 0; i < peaks.length; i++) {
    const p = peaks[i]
    if (i === 0) outline.push({ x: x0 + step * 0.16, y: baseY - p.h * 0.35 })
    outline.push({ x: p.x - step * 0.2, y: baseY - p.h * 0.62 })
    outline.push({ x: p.x, y: p.y })
    outline.push({ x: p.x + step * 0.28, y: baseY - p.h * 0.48 })
  }
  outline.push({ x: x1 - step * 0.12, y: baseY - h * 0.2 })
  outline.push({ x: x1, y: baseY })

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(44, 41, 27, 0.20)'
  ctx.beginPath()
  ctx.ellipse(cx + w * 0.04, baseY + 6, w * 0.52, h * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()

  const g = ctx.createLinearGradient(0, baseY - h, 0, baseY + 10)
  g.addColorStop(0, '#817f63')
  g.addColorStop(0.38, '#666b51')
  g.addColorStop(0.78, '#4b553f')
  g.addColorStop(1, '#414a36')
  ctx.fillStyle = g
  ctx.beginPath()
  outline.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(47, 49, 37, 0.42)'
  ctx.lineWidth = 1.1
  ctx.stroke()

  // 受光面：左上方向的一层窄亮边；右侧压暗，避免又变成平面剪影。
  for (const p of peaks) {
    ctx.fillStyle = 'rgba(190, 180, 149, 0.13)'
    ctx.beginPath()
    ctx.moveTo(p.x, p.y + 3)
    ctx.lineTo(p.x - step * 0.22, baseY - p.h * 0.45)
    ctx.lineTo(p.x - step * 0.06, baseY - p.h * 0.5)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(29, 35, 28, 0.16)'
    ctx.beginPath()
    ctx.moveTo(p.x + 1, p.y + 6)
    ctx.lineTo(p.x + step * 0.28, baseY - p.h * 0.5)
    ctx.lineTo(p.x + step * 0.08, baseY - p.h * 0.5)
    ctx.closePath()
    ctx.fill()
  }

  // 岩层、苔藓和山脚碎林：统一在灰绿/灰棕范围里
  ctx.lineCap = 'round'
  for (let i = 0; i < 9; i++) {
    const p = peaks[i % peaks.length]
    const yy = p.y + p.h * (0.18 + rand() * 0.5)
    ctx.strokeStyle = `rgba(52, 55, 40, ${0.15 + rand() * 0.12})`
    ctx.lineWidth = 0.7 + rand() * 0.6
    ctx.beginPath()
    ctx.moveTo(p.x - step * (0.1 + rand() * 0.18), yy)
    ctx.quadraticCurveTo(p.x, yy + 6, p.x + step * (0.12 + rand() * 0.2), yy + 3)
    ctx.stroke()
  }
  for (let i = 0; i < 26; i++) {
    const x = x0 + rand() * w
    const y = baseY - rand() * h * 0.34
    ctx.fillStyle = rand() > 0.45 ? 'rgba(78, 91, 60, 0.20)' : 'rgba(151, 145, 112, 0.15)'
    ctx.beginPath()
    ctx.ellipse(x, y, 4 + rand() * 13, 1.5 + rand() * 3, rand(), 0, Math.PI * 2)
    ctx.fill()
  }

  // 山脚薄雾，让林间山从树冠里“长出来”
  const mist = ctx.createLinearGradient(0, baseY - 8, 0, baseY + 26)
  mist.addColorStop(0, 'rgba(226, 220, 201, 0.18)')
  mist.addColorStop(1, 'rgba(226, 220, 201, 0)')
  ctx.fillStyle = mist
  ctx.fillRect(x0 - 30, baseY - 8, w + 60, 36)

  // 山坡上的小松树：让林间山也是“有林的”，不是一块灰三角
  for (let i = 0; i < 7; i++) {
    const tx = x0 + w * (0.12 + rand() * 0.76)
    const slope = baseY - h * (0.3 + rand() * 0.42)
    drawPine(ctx, tx, slope, 13 + rand() * 10, Math.floor(rand() * 100000))
  }
  ctx.restore()
}

function paintForest(ctx: CanvasRenderingContext2D, rand: () => number): void {
  // 林间低山：藏在树冠后面，只露出柔和的山脊，不抢主雪山。
  forestHill(ctx, rand, 330, 1190, 410, 145, 0.55)
  forestHill(ctx, rand, 640, 1400, 430, 235, 0.62)
  forestHill(ctx, rand, 690, 1365, 360, 100, 0.48)
  forestHill(ctx, rand, 1000, 1310, 240, 78, 0.42)

  // 林地底色：用几块不规则的暗绿晕染，比旧版圆球状林冠更自然。
  const floor = ctx.createRadialGradient(520, 1080, 120, 560, 1100, 650)
  floor.addColorStop(0, 'rgba(38, 55, 33, 0.24)')
  floor.addColorStop(0.55, 'rgba(48, 67, 40, 0.15)')
  floor.addColorStop(1, 'rgba(48, 67, 40, 0)')
  ctx.fillStyle = floor
  ctx.fillRect(0, 640, 1140, 880)
  for (let i = 0; i < 16; i++) {
    const cx = 120 + rand() * 900
    const cy = 850 + rand() * 520
    const rx = 100 + rand() * 250
    const ry = 45 + rand() * 100
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx)
    g.addColorStop(0, i % 3 === 0 ? 'rgba(91, 104, 58, 0.08)' : 'rgba(30, 47, 30, 0.13)')
    g.addColorStop(1, 'rgba(30, 47, 30, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, rx, ry, rand() * 0.7 - 0.35, 0, Math.PI * 2)
    ctx.fill()
  }

  // 林下地表：细碎苔草和暗色斑块，填掉大树之间的空白色块。
  for (let i = 0; i < 460; i++) {
    const x = 55 + rand() * 1035
    const y = 745 + rand() * 690
    if (Math.hypot(x - 760, y - 1190) < 70) continue
    if (Math.hypot(x - 1210, y - 1050) < 165) continue
    ctx.fillStyle = rand() > 0.45 ? 'rgba(55, 77, 40, 0.18)' : 'rgba(119, 128, 77, 0.16)'
    ctx.beginPath()
    ctx.ellipse(x, y, 1.5 + rand() * 5, 0.7 + rand() * 2, rand(), 0, Math.PI * 2)
    ctx.fill()
  }

  const clusters = [
    { cx: 300, cy: 975, rx: 190, ry: 105, n: 92, hMin: 28, hMax: 46 },
    { cx: 600, cy: 915, rx: 165, ry: 82, n: 66, hMin: 25, hMax: 43 },
    { cx: 840, cy: 1010, rx: 135, ry: 92, n: 50, hMin: 24, hMax: 40 },
    { cx: 310, cy: 1190, rx: 205, ry: 125, n: 104, hMin: 27, hMax: 45 },
    { cx: 610, cy: 1260, rx: 205, ry: 100, n: 98, hMin: 26, hMax: 44 },
    { cx: 875, cy: 1210, rx: 145, ry: 85, n: 52, hMin: 24, hMax: 39 },
    { cx: 445, cy: 1085, rx: 150, ry: 82, n: 56, hMin: 25, hMax: 41 },
    { cx: 730, cy: 1080, rx: 155, ry: 92, n: 64, hMin: 24, hMax: 40 },
    { cx: 930, cy: 1290, rx: 115, ry: 70, n: 42, hMin: 24, hMax: 40 },
    { cx: 980, cy: 970, rx: 95, ry: 64, n: 28, hMin: 24, hMax: 38 },
    { cx: 720, cy: 1380, rx: 150, ry: 42, n: 30, hMin: 24, hMax: 38 },
    { cx: 210, cy: 860, rx: 120, ry: 45, n: 28, hMin: 22, hMax: 35 },
  ]

  const trees: { x: number; y: number; h: number; seed: number }[] = []
  const tooClose = (x: number, y: number, d: number): boolean => {
    for (const p of LAYOUT) {
      const dx = p.x - x
      const dy = p.y - y
      if (dx * dx + dy * dy < d * d) return true
    }
    return false
  }
  const nearRiver = (x: number, y: number, d: number): boolean => {
    for (let i = 0; i < RIVER_POINTS.length; i += 2) {
      const p = RIVER_POINTS[i]
      const dx = p.x - x
      const dy = p.y - y
      if (dx * dx + dy * dy < d * d) return true
    }
    return false
  }

  for (const c of clusters) {
    let made = 0
    let guard = 0
    const r = mulberry32(1709 + c.cx * 3 + c.cy)
    while (made < c.n && guard < c.n * 18) {
      guard++
      const a = r() * Math.PI * 2
      const rad = Math.sqrt(r()) * (r() > 0.93 ? 1.16 : 1)
      const x = c.cx + Math.cos(a) * c.rx * rad
      const y = c.cy + Math.sin(a) * c.ry * rad
      if (x < 60 || x > 1090 || y < 730 || y > 1438) continue
      if (tooClose(x, y, 73) || nearRiver(x, y, 58)) continue
      if (Math.hypot(x - 760, y - 1190) < 98) continue
      if (Math.hypot(x - 1210, y - 1050) < 175) continue
      const edge = Math.min(1.2, rad)
      const h = (c.hMin + r() * (c.hMax - c.hMin)) * (1.08 - edge * 0.16) * 1.7
      trees.push({ x, y, h, seed: Math.floor(r() * 100000) })
      made++
    }
  }

  // 散落外缘，让林线碎一点，不是整齐的椭圆边界
  for (let i = 0; i < 28; i++) {
    const c = clusters[Math.floor(rand() * clusters.length)]
    const a = rand() * Math.PI * 2
    const x = c.cx + Math.cos(a) * c.rx * (1.02 + rand() * 0.26)
    const y = c.cy + Math.sin(a) * c.ry * (1.04 + rand() * 0.3)
    if (x < 70 || x > 1090 || y < 745 || y > 1440) continue
    if (tooClose(x, y, 74) || nearRiver(x, y, 60)) continue
    trees.push({ x, y, h: 28 + rand() * 22, seed: Math.floor(rand() * 100000) })
  }

  // 林间小湖：缩小，水色也压灰
  const lakeX = 760
  const lakeY = 1190
  const lg = ctx.createRadialGradient(lakeX - 15, lakeY - 10, 3, lakeX, lakeY, 48)
  lg.addColorStop(0, 'rgba(134, 168, 158, 0.55)')
  lg.addColorStop(1, 'rgba(58, 96, 98, 0.62)')
  ctx.fillStyle = lg
  ctx.strokeStyle = 'rgba(59, 84, 75, 0.5)'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.ellipse(lakeX, lakeY, 44, 18, 0.18, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // 林下蕨类与低草，只沿边缘点少量
  for (let i = 0; i < 95; i++) {
    const c = clusters[Math.floor(rand() * clusters.length)]
    const a = rand() * Math.PI * 2
    const x = c.cx + Math.cos(a) * c.rx * (0.75 + rand() * 0.4)
    const y = c.cy + Math.sin(a) * c.ry * (0.78 + rand() * 0.4)
    if (tooClose(x, y, 64) || nearRiver(x, y, 50) || Math.hypot(x - lakeX, y - lakeY) < 62) continue
    ctx.strokeStyle = rand() > 0.5 ? 'rgba(83, 107, 59, 0.34)' : 'rgba(118, 123, 76, 0.28)'
    ctx.lineWidth = 0.9
    for (let k = 0; k < 3; k++) {
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.quadraticCurveTo(x - 3 + k * 3, y - 5, x - 7 + k * 7, y - 8 - rand() * 4)
      ctx.stroke()
    }
  }

  // 林间小树：低对比、先画，填住大树之间的空隙，让森林成“片”而不是散点。
  for (let i = 0; i < 190; i++) {
    const c = clusters[Math.floor(rand() * clusters.length)]
    const a = rand() * Math.PI * 2
    const x = c.cx + Math.cos(a) * c.rx * (0.25 + rand() * 0.78)
    const y = c.cy + Math.sin(a) * c.ry * (0.28 + rand() * 0.78)
    if (x < 60 || x > 1090 || y < 745 || y > 1435) continue
    if (tooClose(x, y, 70) || nearRiver(x, y, 52)) continue
    if (Math.hypot(x - 760, y - 1190) < 92) continue
    if (Math.hypot(x - 1210, y - 1050) < 175) continue
    drawPine(ctx, x, y, 25 + rand() * 18, Math.floor(rand() * 100000), 0.62)
  }

  // 按 y 排序，形成前树压后树的层次；每棵都带一点接触阴影。
  trees.sort((a, b) => a.y - b.y)
  for (const t of trees) drawPine(ctx, t.x, t.y, t.h, t.seed)
}


function desertScrub(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, s: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(65, 51, 30, 0.16)'
  ctx.beginPath()
  ctx.ellipse(x + s * 0.2, y + 1, s * 0.75, s * 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(88, 83, 52, 0.66)'
  ctx.lineWidth = 1
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.27
    const reach = s * (0.6 + rand() * 0.4)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.quadraticCurveTo(
      x + Math.cos(a) * reach * 0.3, y + Math.sin(a) * reach * 0.5,
      x + Math.cos(a) * reach, y + Math.sin(a) * reach * 0.9,
    )
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(125, 115, 72, 0.55)'
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.ellipse(
      x + (rand() - 0.5) * s * 0.95,
      y - rand() * s * 0.55,
      1.4 + rand() * 2.6,
      1.1 + rand() * 2,
      rand(), 0, Math.PI * 2,
    )
    ctx.fill()
  }
  // 少量金色干草穗，让沙地点缀不是一团灰绿
  ctx.strokeStyle = 'rgba(164, 139, 87, 0.48)'
  ctx.lineWidth = 0.7
  for (let i = 0; i < 3; i++) {
    const gx = x + (rand() - 0.5) * s * 0.8
    ctx.beginPath()
    ctx.moveTo(gx, y)
    ctx.lineTo(gx + (rand() - 0.5) * 2, y - s * (0.55 + rand() * 0.35))
    ctx.stroke()
  }
  ctx.restore()
}

function desertButte(
  ctx: CanvasRenderingContext2D, rand: () => number,
  x: number, baseY: number, w: number, h: number,
): void {
  ctx.save()
  ctx.fillStyle = 'rgba(47, 32, 16, 0.18)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.1, baseY + 3, w * 0.56, h * 0.10, 0, 0, Math.PI * 2)
  ctx.fill()

  // 塌积坡：从岩体脚向四周铺开，和沙丘自然接上
  const talus = ctx.createRadialGradient(x + 4, baseY - h * 0.06, 2, x + 4, baseY - h * 0.06, w * 0.64)
  talus.addColorStop(0, 'rgba(198, 174, 132, 0.46)')
  talus.addColorStop(0.68, 'rgba(205, 183, 142, 0.22)')
  talus.addColorStop(1, 'rgba(205, 183, 142, 0)')
  ctx.fillStyle = talus
  ctx.beginPath()
  ctx.ellipse(x + 4, baseY, w * 0.68, h * 0.28, 0, 0, Math.PI * 2)
  ctx.fill()

  // 平顶方山：顶面要平、侧壁分階，不是圆馒头
  const body: Pt[] = [
    { x: x - w * 0.54, y: baseY },
    { x: x - w * 0.46, y: baseY - h * 0.32 },
    { x: x - w * 0.37, y: baseY - h * 0.58 },
    { x: x - w * 0.29, y: baseY - h * 0.82 },
    { x: x - w * 0.2, y: baseY - h * 0.9 },
    { x: x + w * 0.18, y: baseY - h * 0.89 },
    { x: x + w * 0.27, y: baseY - h * 0.73 },
    { x: x + w * 0.34, y: baseY - h * 0.49 },
    { x: x + w * 0.5, y: baseY },
  ]
  const bg = ctx.createLinearGradient(0, baseY - h, 0, baseY)
  bg.addColorStop(0, '#d2b480')
  bg.addColorStop(0.38, '#b18a5b')
  bg.addColorStop(1, '#795636')
  ctx.fillStyle = bg
  ctx.beginPath()
  body.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(78, 54, 30, 0.42)'
  ctx.lineWidth = 1.2
  ctx.stroke()

  // 平顶盖岩：比圆包更像风化台地
  ctx.fillStyle = 'rgba(240, 220, 180, 0.74)'
  ctx.beginPath()
  ctx.moveTo(x - w * 0.24, baseY - h * 0.84)
  ctx.lineTo(x - w * 0.17, baseY - h * 0.95)
  ctx.lineTo(x + w * 0.14, baseY - h * 0.94)
  ctx.lineTo(x + w * 0.22, baseY - h * 0.83)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(95, 67, 39, 0.40)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.strokeStyle = 'rgba(75, 53, 31, 0.28)'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(x - w * 0.24, baseY - h * 0.82)
  ctx.lineTo(x + w * 0.22, baseY - h * 0.81)
  ctx.stroke()

  // 左侧受光、右侧背光
  ctx.fillStyle = 'rgba(245, 222, 178, 0.34)'
  ctx.beginPath()
  ctx.moveTo(x - w * 0.32, baseY)
  ctx.lineTo(x - w * 0.22, baseY - h * 0.92)
  ctx.lineTo(x - w * 0.06, baseY - h * 0.95)
  ctx.lineTo(x - w * 0.1, baseY)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(54, 36, 21, 0.30)'
  ctx.beginPath()
  ctx.moveTo(x + w * 0.16, baseY)
  ctx.lineTo(x + w * 0.24, baseY - h * 0.77)
  ctx.lineTo(x + w * 0.34, baseY - h * 0.5)
  ctx.lineTo(x + w * 0.48, baseY)
  ctx.closePath()
  ctx.fill()

  // 风化层理：断续、带一点弧度
  for (let i = 1; i < 6; i++) {
    const yy = baseY - h * (0.14 + i * 0.13)
    ctx.strokeStyle = `rgba(83, 56, 31, ${0.20 + rand() * 0.12})`
    ctx.lineWidth = 0.9 + rand() * 0.7
    ctx.beginPath()
    ctx.moveTo(x - w * (0.34 + rand() * 0.1), yy)
    ctx.quadraticCurveTo(x, yy + 2 + rand() * 3, x + w * (0.28 + rand() * 0.14), yy - 1)
    ctx.stroke()
  }

  // 崖面的竖向风蚀缝
  for (let i = 0; i < 5; i++) {
    const xx = x - w * 0.2 + i * w * 0.11
    ctx.strokeStyle = `rgba(92, 64, 38, ${0.10 + rand() * 0.10})`
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.moveTo(xx, baseY - h * 0.12)
    ctx.quadraticCurveTo(xx + 2, baseY - h * 0.4, xx - 1, baseY - h * (0.62 + rand() * 0.18))
    ctx.stroke()
  }

  // 基脚碎石、枯草、小块阴影
  for (let i = 0; i < 18; i++) {
    const rx = x + (rand() - 0.5) * w * 1.1
    const ry = baseY - rand() * h * 0.16
    ctx.fillStyle = rand() > 0.5 ? 'rgba(105, 81, 52, 0.48)' : 'rgba(191, 165, 120, 0.44)'
    ctx.beginPath()
    ctx.ellipse(rx, ry, 1.3 + rand() * 3.4, 0.9 + rand() * 1.7, rand(), 0, Math.PI * 2)
    ctx.fill()
  }
  desertScrub(ctx, rand, x + w * 0.38, baseY - 2, 9 + rand() * 5)
  desertScrub(ctx, rand, x - w * 0.46, baseY - 1, 7 + rand() * 4)
  ctx.restore()
}

function desertCracks(ctx: CanvasRenderingContext2D, rand: () => number, x: number, y: number, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(214, 193, 151, 0.18)'
  ctx.beginPath()
  ctx.ellipse(x, y, w * 0.5, h * 0.5, -0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(111, 84, 51, 0.18)'
  ctx.lineWidth = 0.7
  for (let i = 0; i < 5; i++) {
    const sx = x - w * 0.34 + rand() * w * 0.55
    const sy = y - h * 0.28 + rand() * h * 0.4
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + 5 + rand() * 8, sy + (rand() - 0.5) * 5)
    ctx.lineTo(sx + 9 + rand() * 10, sy + (rand() - 0.3) * 9)
    ctx.stroke()
  }
  ctx.restore()
}

function desertHoodoo(ctx: CanvasRenderingContext2D, x: number, baseY: number, w: number, h: number): void {
  ctx.save()
  ctx.fillStyle = 'rgba(52, 37, 20, 0.15)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.3, baseY + 2, w * 0.9, h * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()
  const g = ctx.createLinearGradient(x - w * 0.5, 0, x + w * 0.5, 0)
  g.addColorStop(0, '#bd9b6b')
  g.addColorStop(0.55, '#92704a')
  g.addColorStop(1, '#62472e')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.moveTo(x - w * 0.48, baseY)
  ctx.lineTo(x - w * 0.3, baseY - h * 0.78)
  ctx.lineTo(x - w * 0.22, baseY - h)
  ctx.lineTo(x + w * 0.3, baseY - h * 0.96)
  ctx.lineTo(x + w * 0.38, baseY - h * 0.7)
  ctx.lineTo(x + w * 0.52, baseY)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(71, 49, 29, 0.45)'
  ctx.lineWidth = 0.9
  ctx.stroke()
  ctx.fillStyle = 'rgba(226, 204, 164, 0.35)'
  ctx.beginPath()
  ctx.ellipse(x + w * 0.05, baseY - h * 0.96, w * 0.3, h * 0.055, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function paintDesert(ctx: CanvasRenderingContext2D, rand: () => number): void {
  // 沙丘只在雪山右侧；现在压深一档，让沙色和草甸分开。
  const haze = ctx.createRadialGradient(1560, 610, 60, 1560, 610, 570)
  haze.addColorStop(0, 'rgba(215, 188, 132, 0.16)')
  haze.addColorStop(1, 'rgba(215, 188, 132, 0)')
  ctx.fillStyle = haze
  ctx.fillRect(1050, 180, 1254, 900)

  // 沙漠与高原/海岸交界的柔化色带
  const edge = ctx.createLinearGradient(1450, 0, 1740, 0)
  edge.addColorStop(0, 'rgba(189, 162, 105, 0)')
  edge.addColorStop(0.55, 'rgba(189, 162, 105, 0.10)')
  edge.addColorStop(1, 'rgba(189, 162, 105, 0)')
  ctx.fillStyle = edge
  ctx.fillRect(1450, 220, 290, 760)

  duneBand(ctx, rand, 1610, 2280, 340, 68, 'rgba(208, 182, 128, 0.36)')
  duneBand(ctx, rand, 1640, 2260, 442, 92, 'rgba(196, 165, 106, 0.33)')
  duneBand(ctx, rand, 1660, 2230, 548, 76, 'rgba(183, 150, 92, 0.30)')
  duneBand(ctx, rand, 1680, 2210, 640, 58, 'rgba(168, 134, 79, 0.27)')
  duneBand(ctx, rand, 1640, 2260, 738, 44, 'rgba(182, 151, 96, 0.22)')

  desertButte(ctx, rand, 1750, 440, 108, 44)
  desertButte(ctx, rand, 2030, 565, 82, 32)
  desertButte(ctx, rand, 1850, 765, 96, 38)

  desertCracks(ctx, rand, 1690, 610, 92, 36)
  desertCracks(ctx, rand, 2080, 790, 74, 32)
  desertCracks(ctx, rand, 1590, 520, 68, 28)

  // 稀疏灌木、石块和干裂纹：只做点缀，别把沙海塞满
  for (let i = 0; i < 54; i++) {
    const x = 1580 + rand() * 660
    const y = 300 + rand() * 660
    if (Math.hypot(x - 1750, y - 420) < 75 || Math.hypot(x - 2020, y - 540) < 70) continue
    desertScrub(ctx, rand, x, y, 9 + rand() * 8)
  }
  for (let i = 0; i < 38; i++) {
    const x = 1600 + rand() * 620
    const y = 330 + rand() * 620
    ctx.fillStyle = rand() > 0.45 ? 'rgba(105, 81, 50, 0.44)' : 'rgba(188, 160, 113, 0.38)'
    ctx.beginPath()
    ctx.ellipse(x, y, 1.5 + rand() * 4.6, 1 + rand() * 2.2, rand(), 0, Math.PI * 2)
    ctx.fill()
  }
  // 偶发的石块簇
  for (let c = 0; c < 9; c++) {
    const cx = 1600 + rand() * 600
    const cy = 350 + rand() * 560
    for (let i = 0; i < 4; i++) {
      const x = cx + (rand() - 0.5) * 26
      const y = cy + (rand() - 0.5) * 12
      ctx.fillStyle = rand() > 0.5 ? 'rgba(120, 95, 61, 0.52)' : 'rgba(202, 176, 128, 0.40)'
      ctx.beginPath()
      ctx.ellipse(x, y, 2 + rand() * 5, 1.2 + rand() * 2.6, rand(), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // 沙丘脊线上的细风纹
  for (let i = 0; i < 34; i++) {
    const x = 1580 + rand() * 640
    const y = 350 + rand() * 600
    const ln = 22 + rand() * 58
    ctx.strokeStyle = `rgba(112, 84, 49, ${0.15 + rand() * 0.11})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x - ln * 0.5, y)
    ctx.quadraticCurveTo(x, y - 4 - rand() * 4, x + ln * 0.5, y)
    ctx.stroke()
  }
}


function fieldWash(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tone: string): void {
  const pts: Pt[] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const k = 0.82 + ((i * 37) % 11) / 40
    pts.push({ x: x + w / 2 + Math.cos(a) * (w / 2) * k, y: y + h / 2 + Math.sin(a) * (h / 2) * k })
  }
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
  const g = ctx.createLinearGradient(x, y, x + w, y + h)
  g.addColorStop(0, 'rgba(255, 246, 200, 0.12)')
  g.addColorStop(0.55, 'rgba(255, 255, 255, 0)')
  g.addColorStop(1, 'rgba(44, 66, 26, 0.14)')
  ctx.fillStyle = tone
  ctx.fill()
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(74, 84, 42, 0.10)'
  ctx.lineWidth = 1
  for (let k = 1; k <= 3; k++) {
    ctx.beginPath()
    ctx.moveTo(x + w * k / 4, y + 6)
    ctx.quadraticCurveTo(x + w * k / 4 + 8, y + h / 2, x + w * k / 4 - 4, y + h - 6)
    ctx.stroke()
  }
}

function paintCoast(ctx: CanvasRenderingContext2D, rand: () => number): void {
  fieldWash(ctx, 1160, 880, 230, 108, 'rgba(170, 180, 110, 0.20)')
  fieldWash(ctx, 1410, 905, 235, 116, 'rgba(158, 169, 98, 0.19)')
  fieldWash(ctx, 1240, 990, 190, 96, 'rgba(183, 188, 119, 0.17)')
  for (let i = 0; i < 14; i++) {
    tree(ctx, 1100 + rand() * 260, 780 + rand() * 90, 10 + rand() * 8, true)
  }
  ctx.fillStyle = 'rgba(76, 98, 56, 0.16)'
  for (let i = 0; i < 18; i++) {
    const x = 1120 + rand() * 420
    const y = 820 + rand() * 180
    ctx.beginPath()
    ctx.ellipse(x, y, 3 + rand() * 5, 2 + rand() * 3, rand(), 0, Math.PI * 2)
    ctx.fill()
  }
}


function paintSea(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const seaCoast: Pt[] = SEA_COAST.map(p => ({ x: p.x, y: p.y }))
  const closed: Pt[] = [...seaCoast, { x: W, y: H }]
  const traceCoast = (): void => {
    ctx.beginPath()
    ctx.moveTo(seaCoast[0].x, seaCoast[0].y)
    for (const p of seaCoast.slice(1)) ctx.lineTo(p.x, p.y)
  }

  // 沙滩：不再是一条厚亮边，而是湿沙 + 干沙两层很薄的过渡
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(202, 185, 146, 0.50)'
  ctx.lineWidth = 58
  traceCoast()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(232, 216, 177, 0.34)'
  ctx.lineWidth = 21
  ctx.stroke()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(closed[0].x, closed[0].y)
  for (const p of closed.slice(1)) ctx.lineTo(p.x, p.y)
  ctx.closePath()
  ctx.clip()

  // 参考图的海是灰青水彩，不是高饱和蓝绿；保留原来更好的大湾构图。
  const sg = ctx.createLinearGradient(1280, 660, 2304, 1536)
  sg.addColorStop(0, 'rgba(109, 151, 147, 0.92)')
  sg.addColorStop(0.34, 'rgba(74, 117, 118, 0.95)')
  sg.addColorStop(0.7, 'rgba(52, 91, 98, 0.97)')
  sg.addColorStop(1, 'rgba(38, 72, 80, 0.98)')
  ctx.fillStyle = sg
  ctx.fillRect(900, 480, 1404, 1056)

  // 大水彩晕：让海面深浅不是一条直线
  for (let i = 0; i < 22; i++) {
    const x = 1300 + rand() * 980
    const y = 660 + rand() * 830
    const r = 90 + rand() * 250
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, i % 3 === 0 ? 'rgba(189, 206, 193, 0.075)' : 'rgba(26, 55, 63, 0.07)')
    g.addColorStop(1, 'rgba(26, 55, 63, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * (0.35 + rand() * 0.3), rand() * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // 近岸浅水：多层很薄的灰青，贴合沙滩
  const shallow = (width: number, color: string): void => {
    ctx.strokeStyle = color
    ctx.lineWidth = width
    traceCoast()
    ctx.stroke()
  }
  shallow(112, 'rgba(174, 196, 184, 0.15)')
  shallow(68, 'rgba(190, 207, 192, 0.13)')
  shallow(32, 'rgba(211, 220, 204, 0.10)')

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 潮汐长带：参考图里最像手绘海面的元素
  for (let i = 0; i < 9; i++) {
    const y = 760 + i * 82 + rand() * 36
    const x = 1430 + rand() * 90
    ctx.strokeStyle = `rgba(204, 219, 207, ${0.055 + rand() * 0.05})`
    ctx.lineWidth = 1.2 + rand() * 1.8
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.bezierCurveTo(x + 110, y - 34 - rand() * 22, x + 250, y + 28, x + 390 + rand() * 160, y - 16)
    ctx.stroke()
  }

  // 浪不要全都横着排：方向、长度都打散，避免平涂海面出现“扫描线”。
  for (let i = 0; i < 9; i++) {
    const x = 1450 + rand() * 760
    const y = 820 + rand() * 610
    const w = 180 + rand() * 220
    const ang = -0.22 + rand() * 0.44
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    ctx.strokeStyle = `rgba(218, 230, 217, ${0.045 + rand() * 0.04})`
    ctx.lineWidth = 1.2 + rand() * 1.1
    ctx.beginPath()
    ctx.moveTo(-w / 2, 0)
    ctx.quadraticCurveTo(0, -10, w / 2, 0)
    ctx.stroke()
    ctx.restore()
  }
  for (let i = 0; i < 78; i++) {
    const x = 1260 + rand() * 1040
    const y = 660 + rand() * 850
    const w = 12 + rand() * 34
    const ang = -0.55 + rand() * 1.1
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(ang)
    ctx.strokeStyle = `rgba(221, 233, 220, ${0.05 + rand() * 0.07})`
    ctx.lineWidth = 0.7 + rand() * 0.4
    ctx.beginPath()
    ctx.moveTo(-w / 2, 0)
    ctx.quadraticCurveTo(0, -3 - rand() * 3, w / 2, 0)
    ctx.stroke()
    ctx.restore()
  }
  // 很淡的反光，只放在外海
  for (let i = 0; i < 7; i++) {
    const x = 1700 + rand() * 540
    const y = 930 + rand() * 350
    const g = ctx.createLinearGradient(x, y, x + 180, y + 25)
    g.addColorStop(0, 'rgba(220, 229, 214, 0)')
    g.addColorStop(0.5, 'rgba(220, 229, 214, 0.06)')
    g.addColorStop(1, 'rgba(220, 229, 214, 0)')
    ctx.strokeStyle = g
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 180, y + 25 + rand() * 30)
    ctx.stroke()
  }

  // 外海更深，压住右下角
  const deep = ctx.createLinearGradient(1540, 1020, 2304, 1536)
  deep.addColorStop(0, 'rgba(20, 44, 53, 0)')
  deep.addColorStop(0.62, 'rgba(20, 44, 53, 0.11)')
  deep.addColorStop(1, 'rgba(15, 34, 42, 0.26)')
  ctx.fillStyle = deep
  ctx.fillRect(900, 600, 1404, 936)

  // 海面细小的干笔颗粒
  for (let i = 0; i < 260; i++) {
    const x = 1250 + rand() * 1050
    const y = 650 + rand() * 880
    ctx.fillStyle = rand() > 0.45 ? 'rgba(222, 233, 218, 0.05)' : 'rgba(24, 51, 60, 0.045)'
    ctx.beginPath()
    ctx.ellipse(x, y, 0.8 + rand() * 2.2, 0.5 + rand() * 0.8, rand(), 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // 海岸线：湿沙、墨线、断续泡沫
  ctx.strokeStyle = 'rgba(198, 177, 134, 0.64)'
  ctx.lineWidth = 13
  traceCoast()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(58, 88, 82, 0.42)'
  ctx.lineWidth = 3.2
  traceCoast()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(46, 70, 65, 0.36)'
  ctx.lineWidth = 1
  traceCoast()
  ctx.stroke()
  ctx.strokeStyle = 'rgba(238, 239, 222, 0.46)'
  ctx.lineWidth = 1.8
  ctx.setLineDash([14, 20])
  traceCoast()
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(236, 240, 225, 0.16)'
  for (let i = 0; i < 150; i++) {
    const p = seaCoast[Math.floor(rand() * (seaCoast.length - 1))]
    const x = p.x + (rand() - 0.5) * 34
    const y = p.y + (rand() - 0.5) * 22
    ctx.beginPath()
    ctx.arc(x, y, 0.8 + rand() * 2.2, 0, Math.PI * 2)
    ctx.fill()
  }

  // 海面不再画漩涡；保留潮汐带和细浪，避免抢走航线和台风标记的注意力。
}

function riverWidth(t: number): number {
  // 仍然保持细河，但不做等宽水管：宽度随弧长呼吸，下游略宽。
  return 24 + t * 26 + Math.sin(t * 18 + 0.7) * 3.4 + Math.sin(t * 41 + 2.2) * 1.6
}

/** 沿河道切线取法线，生成一侧的岸线；side=1 左岸，side=-1 右岸。 */
function riverBank(
  pts: { x: number; y: number; t?: number }[],
  side: 1 | -1,
  extra = 0,
  shiftX = 0,
  shiftY = 0,
): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const t = p.t ?? i / (pts.length - 1)
    const w = riverWidth(t) + extra
    // 岸线不该是一条光滑平行线：细微抖动 + 宽度摆动会打碎“蓝色水管”感。
    const jitter = Math.sin(i * 1.73 + side * 2.3) * 2.5 + Math.sin(i * 0.39 + side) * 1.1
    const lateral = side * w * 0.5 + jitter
    out.push({
      x: p.x + nx * lateral + shiftX,
      y: p.y + ny * lateral + shiftY,
    })
  }
  return out
}

function riverPolygonPath(ctx: CanvasRenderingContext2D, left: Pt[], right: Pt[]): void {
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
  ctx.closePath()
}

function paintRiver(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const pts = RIVER_POINTS
  const left = riverBank(pts, 1)
  const right = riverBank(pts, -1)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // 1) 草岸 + 湿沙：只留很窄的一条，不能再像沿河的土路/铁路。
  const bLeft = riverBank(pts, 1, 4, 0, 0)
  const bRight = riverBank(pts, -1, 3, 1, 1)
  ctx.fillStyle = 'rgba(92, 100, 66, 0.30)'
  riverPolygonPath(ctx, bLeft, bRight)
  ctx.fill()
  const wLeft = riverBank(pts, 1, 2.2, 0, 0)
  const wRight = riverBank(pts, -1, 1.6, 0.8, 1)
  ctx.fillStyle = 'rgba(169, 155, 113, 0.24)'
  riverPolygonPath(ctx, wLeft, wRight)
  ctx.fill()

  // 很窄的一侧岸影：只留 3~4px 的暗边，不形成沿河棕带。
  const shade = riverBank(pts, 1, 0, 1, 2)
  ctx.strokeStyle = 'rgba(48, 44, 30, 0.18)'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(shade[0].x, shade[0].y)
  for (let i = 1; i < shade.length; i++) ctx.lineTo(shade[i].x, shade[i].y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(48, 44, 30, 0.07)'
  ctx.lineWidth = 15
  ctx.stroke()

  // 几段露出的河岸土坎：有高度、有阴影，打断光滑的平行岸线。
  for (const tt of [0.19, 0.36, 0.57, 0.78]) {
    const idx = Math.round(tt * (pts.length - 1))
    const p = pts[idx]
    const prev = pts[Math.max(0, idx - 1)]
    const next = pts[Math.min(pts.length - 1, idx + 1)]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const w = riverWidth(p.t ?? tt)
    const cx = p.x - nx * (w * 0.5 + 2)
    const cy = p.y - ny * (w * 0.5 + 2)
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(Math.atan2(ty, tx))
    ctx.fillStyle = 'rgba(89, 69, 44, 0.58)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 12, 3.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(220, 207, 170, 0.38)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(-9, -2)
    ctx.quadraticCurveTo(0, -4, 10, -2)
    ctx.stroke()
    ctx.restore()
  }

  // 2) 单侧岸影已经收进水体内部（见下方 clip），不再在岸上拖一条宽棕带。

  // 3) 水体：沿河道方向的灰绿水彩；靠岸处更暗。
  const waterGrad = ctx.createLinearGradient(60, 760, 2200, 880)
  waterGrad.addColorStop(0, 'rgba(87, 111, 101, 0.99)')
  waterGrad.addColorStop(0.42, 'rgba(70, 95, 90, 0.99)')
  waterGrad.addColorStop(0.74, 'rgba(58, 82, 84, 0.99)')
  waterGrad.addColorStop(1, 'rgba(50, 73, 79, 0.99)')
  riverPolygonPath(ctx, left, right)
  ctx.fillStyle = waterGrad
  ctx.fill()

  // 4) 内侧河岸的暗部 + 对岸浅水高光，形成轻微透视/下凹感。
  ctx.save()
  riverPolygonPath(ctx, left, right)
  ctx.clip()

  // 光从西北来：南岸（left）内侧压暗，北岸（right）保留浅水亮边。
  ctx.strokeStyle = 'rgba(30, 55, 59, 0.38)'
  ctx.lineWidth = 8
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(216, 227, 206, 0.38)'
  ctx.lineWidth = 2.4
  ctx.beginPath()
  ctx.moveTo(right[0].x, right[0].y)
  for (let i = 1; i < right.length; i++) ctx.lineTo(right[i].x, right[i].y)
  ctx.stroke()

  // 两岸浅水边 + 中央深槽，让河床有横向剖面，而不是一桶平涂颜料。
  ctx.strokeStyle = 'rgba(188, 203, 183, 0.20)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(right[0].x, right[0].y)
  for (let i = 1; i < right.length; i++) ctx.lineTo(right[i].x, right[i].y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(188, 203, 183, 0.13)'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(33, 58, 61, 0.13)'
  ctx.lineWidth = 9
  ctx.beginPath()
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    if (i === 0) ctx.moveTo(p.x + 1, p.y + 2)
    else ctx.lineTo(p.x + 1, p.y + 2)
  }
  ctx.stroke()



  // 贴着水面的暗/亮反光，像树影和天光落在同一条河里。
  for (let i = 5; i < pts.length - 5; i += 3) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const t = p.t ?? i / (pts.length - 1)
    const w = riverWidth(t)
    const off = Math.sin(i * 1.91) * w * 0.3
    const ln = 5 + ((i * 7) % 13)
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(23, 48, 50, 0.14)' : 'rgba(207, 220, 201, 0.15)'
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(p.x + nx * off - (tx / len) * ln, p.y + ny * off - (ty / len) * ln)
    ctx.lineTo(p.x + nx * (off + 2) + (tx / len) * ln, p.y + ny * (off + 2) + (ty / len) * ln)
    ctx.stroke()
  }

  // 顺流与横流交错的细小水纹，让水面读起来是“水”，不是描边色带。
  for (let i = 0; i < 34; i++) {
    const idx = 8 + Math.floor(rand() * (pts.length - 18))
    const p = pts[idx]
    const prev = pts[idx - 1]
    const next = pts[idx + 1]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const t = p.t ?? idx / (pts.length - 1)
    const w = riverWidth(t)
    const lateral = (rand() - 0.5) * w * 0.62
    const along = (rand() - 0.5) * 10
    const x = p.x + nx * lateral + (tx / len) * along
    const y = p.y + ny * lateral + (ty / len) * along
    const ln = 2.5 + rand() * 5.5
    ctx.strokeStyle = rand() > 0.42 ? `rgba(212, 224, 204, ${0.10 + rand() * 0.09})` : `rgba(30, 54, 57, ${0.08 + rand() * 0.06})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(x - (tx / len) * ln, y - (ty / len) * ln)
    ctx.quadraticCurveTo(x + nx * 1.4, y + ny * 1.4, x + (tx / len) * ln, y + (ty / len) * ln)
    ctx.stroke()
  }

  // 河湾深水潭 + 靠岸浅水，打破一条均匀蓝带的平面感。
  for (const [tt, side, rad] of [
    [0.14, -1, 13], [0.31, 1, 10], [0.48, -1, 15],
    [0.66, 1, 11], [0.82, -1, 14],
  ] as const) {
    const idx = Math.max(1, Math.min(pts.length - 2, Math.round(tt * (pts.length - 1))))
    const p = pts[idx]
    const prev = pts[idx - 1]
    const next = pts[idx + 1]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const cx = p.x + nx * rad * 0.18 * side
    const cy = p.y + ny * rad * 0.18 * side
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
    g.addColorStop(0, 'rgba(39, 68, 71, 0.20)')
    g.addColorStop(1, 'rgba(39, 68, 71, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, rad, rad * 0.55, Math.atan2(ty, tx), 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 8; i < pts.length - 8; i += 14) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const lx = p.x + nx * 6
    const ly = p.y + ny * 6
    ctx.fillStyle = 'rgba(198, 212, 191, 0.075)'
    ctx.beginPath()
    ctx.ellipse(lx, ly, 8, 2.4, Math.atan2(ty, tx), 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 20; i < pts.length - 20; i += 36) {
    const p = pts[i]
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 24)
    g.addColorStop(0, 'rgba(204, 217, 197, 0.09)')
    g.addColorStop(1, 'rgba(204, 217, 197, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(p.x, p.y, 24, 7, Math.atan2(ty, tx), 0, Math.PI * 2)
    ctx.fill()
  }

  // 南岸树林映在水里的暗绿色倒影，河在森林边不再像一条贴上去的蓝带。
  for (let i = 10; i < pts.length - 10; i += 5) {
    const p = pts[i]
    if (p.x > 1180) continue
    const prev = pts[i - 1]
    const next = pts[i + 1]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const t = p.t ?? i / (pts.length - 1)
    const w = riverWidth(t)
    const off = w * 0.28 + Math.sin(i * 2.7) * w * 0.1
    const x = p.x + nx * off
    const y = p.y + ny * off
    const g = ctx.createRadialGradient(x, y, 0, x, y, 16)
    g.addColorStop(0, 'rgba(34, 59, 44, 0.30)')
    g.addColorStop(1, 'rgba(34, 59, 44, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, 17, 5.2, Math.atan2(ty, tx), 0, Math.PI * 2)
    ctx.fill()
  }

  // 不是整齐的等距波纹，而是顺着水流方向、长短不一的浅水痕。
  for (let i = 10; i < pts.length - 14; i += 5) {
    const p = pts[i]
    const prev = pts[Math.max(0, i - 1)]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const t = p.t ?? i / (pts.length - 1)
    const lateral = (Math.sin(i * 2.31) * 0.5 + Math.sin(i * 0.73) * 0.25) * riverWidth(t) * 0.55
    const cx = p.x + nx * lateral
    const cy = p.y + ny * lateral
    const half = 4 + ((i * 7) % 13)
    ctx.strokeStyle = `rgba(214, 225, 204, ${0.12 + (i % 5) * 0.02})`
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(cx - (tx / len) * half, cy - (ty / len) * half)
    ctx.quadraticCurveTo(cx + nx * 2.5, cy + ny * 2.5, cx + (tx / len) * half, cy + (ty / len) * half)
    ctx.stroke()
  }

  // 河心小沙洲 / 浅滩
  for (const tt of [0.22, 0.53, 0.76]) {
    const p = pts[Math.round(tt * (pts.length - 1))]
    const a = pts[Math.max(0, Math.round(tt * (pts.length - 1)) - 1)]
    const b = pts[Math.min(pts.length - 1, Math.round(tt * (pts.length - 1)) + 1)]
    const ang = Math.atan2(b.y - a.y, b.x - a.x)
    ctx.fillStyle = 'rgba(176, 161, 116, 0.68)'
    ctx.beginPath()
    ctx.ellipse(p.x + Math.cos(ang + 0.9) * 4, p.y + Math.sin(ang + 0.9) * 4, 7, 2.1, ang, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(232, 224, 200, 0.22)'
    ctx.lineWidth = 0.8
    ctx.stroke()
  }

  // 一处小砾石洲：打断连续的蓝色带，也提供尺度参照
  {
    const idx = Math.round(0.52 * (pts.length - 1))
    const p = pts[idx]
    const prev = pts[idx - 1]
    const next = pts[idx + 1]
    const ang = Math.atan2(next.y - prev.y, next.x - prev.x)
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    ctx.save()
    ctx.translate(p.x + nx * 3, p.y + ny * 3)
    ctx.rotate(ang)
    ctx.fillStyle = 'rgba(157, 143, 104, 0.82)'
    ctx.beginPath()
    ctx.ellipse(0, 0, 19, 4.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(71, 60, 42, 0.42)'
    ctx.lineWidth = 0.9
    ctx.stroke()
    ctx.strokeStyle = 'rgba(93, 105, 62, 0.5)'
    ctx.lineWidth = 0.8
    for (let k = 0; k < 6; k++) {
      ctx.beginPath()
      ctx.moveTo(-11 + k * 4, -1)
      ctx.lineTo(-12 + k * 4, -4 - (k % 3) * 2)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(227, 235, 216, 0.42)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(0, 0, 22, 6.5, 0, 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(0, 0, 22, 6.5, 0, Math.PI * 1.15, Math.PI * 1.85)
    ctx.stroke()
    ctx.restore()
  }

  // 三处浅滩急流：碎石 + 断开的白色水花，给河流一个“流动方向”。
  for (const tt of [0.18, 0.46, 0.71]) {
    const idx = Math.round(tt * (pts.length - 1))
    const p = pts[idx]
    const prev = pts[Math.max(0, idx - 1)]
    const next = pts[Math.min(pts.length - 1, idx + 1)]
    const ang = Math.atan2(next.y - prev.y, next.x - prev.x)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(ang)
    for (let k = 0; k < 5; k++) {
      const dx = -9 + k * 4.5
      ctx.strokeStyle = `rgba(222, 231, 209, ${0.18 + (k % 3) * 0.035})`
      ctx.lineWidth = 0.9
      ctx.beginPath()
      ctx.moveTo(dx - 3, -3 + (k % 2) * 2)
      ctx.quadraticCurveTo(dx, -6, dx + 4, -2 + (k % 2) * 2)
      ctx.stroke()
    }
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = 'rgba(91, 81, 60, 0.55)'
      ctx.beginPath()
      ctx.ellipse(-6 + k * 7, 3 + (k % 2) * 2, 2.4, 1.4, 0.2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  ctx.restore()

  // 5) 水线：一条深青细边；再补一条右岸土坎和左岸干沙唇，
  //    让两岸不是同一圈黑边。
  ctx.strokeStyle = 'rgba(44, 68, 65, 0.50)'
  ctx.lineWidth = 1.1
  riverPolygonPath(ctx, left, right)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(89, 70, 45, 0.54)'
  ctx.lineWidth = 2.8
  ctx.beginPath()
  ctx.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(215, 200, 164, 0.46)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(right[0].x, right[0].y)
  for (let i = 1; i < right.length; i++) ctx.lineTo(right[i].x, right[i].y)
  ctx.stroke()

  // 岸边礁石 / 芦苇 / 小范围塌岸：贴近水线，允许草叶压进水面，
  // 这样河岸不是一条干净的平行线。
  for (let i = 10; i < pts.length - 14; i += 8) {
    const p = pts[i]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const ang = Math.atan2(next.y - p.y, next.x - p.x) + Math.PI / 2
    const side = i % 2 === 0 ? 1 : -1
    const bx = p.x + Math.cos(ang) * (18 + rand() * 5) * side
    const by = p.y + Math.sin(ang) * (18 + rand() * 5) * side

    if (i % 40 === 10) {
      // 塌岸：小块深土 + 亮边，给河岸一个高度
      ctx.fillStyle = 'rgba(79, 65, 43, 0.52)'
      ctx.beginPath()
      ctx.ellipse(bx, by + 1, 6 + rand() * 5, 2 + rand() * 2, ang, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = 'rgba(203, 188, 151, 0.35)'
      ctx.lineWidth = 0.8
      ctx.stroke()
    }

    ctx.fillStyle = 'rgba(93, 83, 60, 0.52)'
    ctx.beginPath()
    ctx.ellipse(bx, by, 2.2 + rand() * 3.2, 1.2 + rand() * 2, rand(), 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(77, 95, 53, 0.70)'
    ctx.lineWidth = 0.9
    for (let k = 0; k < 4; k++) {
      ctx.beginPath()
      ctx.moveTo(bx + k * 1.7 - 2, by)
      ctx.quadraticCurveTo(bx + k * 1.7 + 1, by - 4, bx + k * 1.7 + 0.5, by - 7 - rand() * 6)
      ctx.stroke()
    }
  }

  // 贴水面的草叶：几簇从岸上垂进水里，打断过于干净的水岸线。
  for (let i = 8; i < pts.length - 10; i += 13) {
    const p = pts[i]
    const next = pts[Math.min(pts.length - 1, i + 1)]
    const prev = pts[Math.max(0, i - 1)]
    const tx = next.x - prev.x
    const ty = next.y - prev.y
    const len = Math.hypot(tx, ty) || 1
    const nx = -ty / len
    const ny = tx / len
    const side = i % 2 === 0 ? 1 : -1
    const t = p.t ?? i / (pts.length - 1)
    const w = riverWidth(t)
    const bx = p.x + nx * side * (w * 0.5 + 1)
    const by = p.y + ny * side * (w * 0.5 + 1)
    ctx.strokeStyle = 'rgba(67, 87, 49, 0.64)'
    ctx.lineWidth = 0.9
    for (let k = 0; k < 4; k++) {
      const spread = (k - 1.5) * 1.7
      ctx.beginPath()
      ctx.moveTo(bx + (tx / len) * spread, by + (ty / len) * spread)
      ctx.quadraticCurveTo(
        bx - nx * side * 2 + (tx / len) * spread * 1.4,
        by - ny * side * 2 + (ty / len) * spread * 1.4,
        bx - nx * side * (4 + rand() * 4) + (tx / len) * spread * 1.7,
        by - ny * side * (4 + rand() * 4) + (ty / len) * spread * 1.7,
      )
      ctx.stroke()
    }
  }

  // 水里露头的石头：只点几处，给平滑水带增加尺度参照
  for (const i of [42, 88, 132, 176, 214]) {
    const p = pts[i]
    if (!p) continue
    const prev = pts[Math.max(0, i - 2)]
    const next = pts[Math.min(pts.length - 1, i + 2)]
    const ang = Math.atan2(next.y - prev.y, next.x - prev.x)
    const nx = -Math.sin(ang)
    const ny = Math.cos(ang)
    const off = Math.sin(i * 3.7) * 3
    const sx = p.x + nx * off
    const sy = p.y + ny * off
    ctx.fillStyle = 'rgba(64, 61, 47, 0.62)'
    ctx.beginPath()
    ctx.ellipse(sx, sy, 2.6 + rand() * 2.6, 1.3 + rand() * 1.6, ang, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(210, 213, 190, 0.36)'
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.arc(sx - 0.5, sy - 0.5, 1.6 + rand() * 1.2, Math.PI, Math.PI * 1.8)
    ctx.stroke()
  }
  ctx.restore()

  // 源头：小泉眼，不规则石岸
  const s = pts[0]
  ctx.save()
  const spring = ctx.createRadialGradient(s.x + 4, s.y, 1, s.x + 4, s.y, 20)
  spring.addColorStop(0, 'rgba(76, 111, 101, 0.90)')
  spring.addColorStop(1, 'rgba(50, 71, 61, 0.72)')
  ctx.fillStyle = spring
  ctx.beginPath()
  ctx.moveTo(s.x - 14, s.y + 2)
  ctx.quadraticCurveTo(s.x - 10, s.y - 12, s.x + 2, s.y - 11)
  ctx.quadraticCurveTo(s.x + 14, s.y - 10, s.x + 17, s.y + 1)
  ctx.quadraticCurveTo(s.x + 10, s.y + 11, s.x - 2, s.y + 10)
  ctx.quadraticCurveTo(s.x - 13, s.y + 9, s.x - 14, s.y + 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(44, 62, 51, 0.58)'
  ctx.lineWidth = 1.2
  ctx.stroke()
  ctx.strokeStyle = 'rgba(211, 223, 206, 0.48)'
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(s.x - 4 + i * 4, s.y - 9)
    ctx.quadraticCurveTo(s.x - 1 + i * 4, s.y - 2, s.x + 3 + i * 4, s.y + 2)
    ctx.stroke()
  }
  ctx.restore()

  // 入海口：河海交汇的浅滩，不用完整椭圆盖住海面
  const e = pts[pts.length - 1]
  ctx.save()
  const estuary = ctx.createRadialGradient(e.x + 20, e.y + 13, 2, e.x + 20, e.y + 13, 42)
  estuary.addColorStop(0, 'rgba(94, 129, 119, 0.76)')
  estuary.addColorStop(1, 'rgba(58, 92, 96, 0)')
  ctx.fillStyle = estuary
  ctx.beginPath()
  ctx.ellipse(e.x + 20, e.y + 13, 44, 22, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = 'rgba(214, 225, 204, 0.25)'
  ctx.lineWidth = 0.9
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.moveTo(e.x + 2 + i * 10, e.y + 5)
    ctx.quadraticCurveTo(e.x + 15 + i * 12, e.y + 15, e.x + 28 + i * 13, e.y + 10)
    ctx.stroke()
  }
  ctx.restore()
}

// ---------- 道路 / 桥 ----------

function paintRoad(ctx: CanvasRenderingContext2D): void {
  const pts = smoothPoints(LAYOUT.map(p => ({ x: p.x, y: p.y })), 6)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // 道路压到卡片下面：不露边、不画中心线，避免海边出现“铁轨”。
  ctx.strokeStyle = 'rgba(38, 26, 14, 0.24)'
  ctx.lineWidth = 86
  linePath(ctx, pts)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(186, 158, 110, 0.80)'
  ctx.lineWidth = 72
  ctx.stroke()
  ctx.strokeStyle = 'rgba(210, 184, 136, 0.38)'
  ctx.lineWidth = 58
  ctx.stroke()
  ctx.restore()

  for (const p of LAYOUT) {
    ctx.fillStyle = 'rgba(206, 178, 132, 0.28)'
    ctx.strokeStyle = 'rgba(80, 58, 30, 0.25)'
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.arc(p.x, p.y, 52, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}

function bridge(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  ctx.fillStyle = 'rgba(20, 24, 18, 0.45)'
  roundRect(ctx, -98, -82, 196, 164, 24)
  ctx.fill()
  ctx.fillStyle = 'rgba(138, 126, 104, 0.98)'
  ctx.strokeStyle = 'rgba(50, 36, 20, 0.9)'
  ctx.lineWidth = 3
  roundRect(ctx, -88, -72, 176, 144, 14)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(186, 170, 134, 0.95)'
  roundRect(ctx, -74, -58, 148, 116, 9)
  ctx.fill()
  ctx.strokeStyle = 'rgba(90, 66, 36, 0.4)'
  ctx.lineWidth = 1.4
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath()
    ctx.moveTo(-70, i * 14)
    ctx.lineTo(70, i * 14)
    ctx.stroke()
  }
  for (const yy of [-64, 64]) {
    ctx.fillStyle = 'rgba(150, 124, 86, 0.98)'
    ctx.strokeStyle = 'rgba(54, 38, 20, 0.8)'
    roundRect(ctx, -84, yy - 7, 168, 14, 4)
    ctx.fill()
    ctx.stroke()
    for (let i = -4; i <= 4; i++) {
      ctx.fillStyle = 'rgba(190, 164, 120, 0.95)'
      ctx.beginPath()
      ctx.arc(i * 20, yy, 5.5, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.strokeStyle = 'rgba(92, 74, 48, 0.55)'
  ctx.lineWidth = 5
  for (const xx of [-38, 38]) {
    ctx.beginPath()
    ctx.arc(xx, 0, 22, Math.PI * 1.05, Math.PI * 1.95)
    ctx.stroke()
  }
  for (const xx of [-70, 70]) {
    ctx.fillStyle = 'rgba(238, 206, 120, 0.95)'
    ctx.beginPath()
    ctx.arc(xx, -56, 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // 桥头石墩 / 灯柱
  ctx.fillStyle = 'rgba(146, 122, 88, 0.98)'
  ctx.strokeStyle = 'rgba(52, 36, 18, 0.85)'
  ctx.lineWidth = 1.8
  for (const [bx, by] of [[-88, -64], [88, -64], [-88, 64], [88, 64]] as const) {
    ctx.beginPath()
    ctx.rect(bx - 9, by - 12, 18, 24)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = 'rgba(238, 206, 120, 0.95)'
    ctx.beginPath()
    ctx.arc(bx, by - 16, 4.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(146, 122, 88, 0.98)'
  }
  // 桥洞：让河从桥下穿过（卡片盖住中间，两侧可见水面与石拱）
  for (const side of [-1, 1] as const) {
    const yy = side * 80
    ctx.fillStyle = 'rgba(24, 40, 40, 0.62)'
    ctx.beginPath()
    ctx.ellipse(0, yy, 46, 11, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(170, 220, 218, 0.35)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(0, yy - 2, 38, 6, 0, Math.PI * 0.08, Math.PI * 0.92)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(58, 44, 26, 0.7)'
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.arc(0, yy, 48, Math.PI * 1.04, Math.PI * 1.96)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(174, 154, 118, 0.85)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(0, yy, 54, Math.PI * 1.06, Math.PI * 1.94)
    ctx.stroke()
  }
  ctx.restore()
}

// ---------- 细节 / 收尾 ----------


function paintHeartland(ctx: CanvasRenderingContext2D, rand: () => number): void {
  const lakeX = 1210
  const lakeY = 1050
  const lakeG = ctx.createRadialGradient(lakeX - 50, lakeY - 40, 20, lakeX, lakeY, 190)
  lakeG.addColorStop(0, 'rgba(134, 165, 153, 0.76)')
  lakeG.addColorStop(0.55, 'rgba(84, 128, 126, 0.78)')
  lakeG.addColorStop(1, 'rgba(55, 92, 96, 0.84)')
  ctx.save()
  ctx.fillStyle = lakeG
  ctx.strokeStyle = 'rgba(44, 82, 88, 0.45)'
  ctx.lineWidth = 2.2
  ctx.beginPath()
  ctx.moveTo(lakeX - 160, lakeY - 18)
  ctx.bezierCurveTo(lakeX - 120, lakeY - 86, lakeX - 14, lakeY - 104, lakeX + 62, lakeY - 66)
  ctx.bezierCurveTo(lakeX + 148, lakeY - 24, lakeX + 164, lakeY + 42, lakeX + 92, lakeY + 70)
  ctx.bezierCurveTo(lakeX + 18, lakeY + 98, lakeX - 88, lakeY + 76, lakeX - 138, lakeY + 42)
  ctx.bezierCurveTo(lakeX - 172, lakeY + 20, lakeX - 170, lakeY + 2, lakeX - 160, lakeY - 18)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(112, 134, 82, 0.95)'
  ctx.strokeStyle = 'rgba(64, 82, 46, 0.6)'
  ctx.lineWidth = 1.3
  ctx.beginPath()
  ctx.ellipse(lakeX + 30, lakeY - 6, 34, 16, -0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  tree(ctx, lakeX + 30, lakeY - 3, 18)
  ctx.strokeStyle = 'rgba(230, 246, 240, 0.28)'
  ctx.lineWidth = 1.2
  for (let i = 0; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(lakeX - 70 + i * 30, lakeY + 20 - i * 5)
    ctx.quadraticCurveTo(lakeX - 40 + i * 30, lakeY + 14 - i * 5, lakeX - 10 + i * 30, lakeY + 20 - i * 5)
    ctx.stroke()
  }
  for (let i = 0; i < 18; i++) {
    const x = lakeX - 155 + rand() * 45
    const y = lakeY + 25 + rand() * 45
    ctx.strokeStyle = 'rgba(90, 108, 60, 0.7)'
    ctx.lineWidth = 1.1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 2, y - 10 - rand() * 8)
    ctx.stroke()
  }
  ctx.restore()

  for (let i = 0; i < 6; i++) {
    const x = 900 + rand() * 650
    const y = 850 + rand() * 350
    const r = 160 + rand() * 180
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, i % 2 ? 'rgba(190, 202, 110, 0.07)' : 'rgba(56, 88, 46, 0.07)')
    g.addColorStop(1, 'rgba(56, 88, 46, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  for (let i = 0; i < 7; i++) {
    const x = 900 + rand() * 500
    const y = 900 + rand() * 280
    if (Math.hypot(x - lakeX, y - lakeY) < 210) continue
    tree(ctx, x, y, 12 + rand() * 9, rand() < 0.25)
  }
}


function paintCloudShadows(ctx: CanvasRenderingContext2D, rand: () => number): void {
  ctx.save()
  for (let i = 0; i < 13; i++) {
    const x = 100 + rand() * 2100
    const y = 120 + rand() * 1200
    const rx = 180 + rand() * 320
    const ry = 60 + rand() * 140
    const g = ctx.createRadialGradient(x, y, 0, x, y, rx)
    g.addColorStop(0, 'rgba(30, 24, 14, 0.13)')
    g.addColorStop(0.7, 'rgba(30, 24, 14, 0.06)')
    g.addColorStop(1, 'rgba(30, 24, 14, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, rand() * 0.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function paintFrame(ctx: CanvasRenderingContext2D): void {
  ctx.save()
  ctx.strokeStyle = 'rgba(40, 28, 14, 0.55)'
  ctx.lineWidth = 8
  ctx.strokeRect(4, 4, W - 8, H - 8)
  ctx.strokeStyle = 'rgba(186, 146, 74, 0.55)'
  ctx.lineWidth = 2
  ctx.strokeRect(16, 16, W - 32, H - 32)
  ctx.strokeStyle = 'rgba(40, 28, 14, 0.28)'
  ctx.lineWidth = 1
  ctx.strokeRect(24, 24, W - 48, H - 48)
  ctx.strokeStyle = 'rgba(186, 146, 74, 0.55)'
  ctx.lineWidth = 2.4
  const corner = (x: number, y: number, sx: number, sy: number): void => {
    ctx.beginPath()
    ctx.moveTo(x + sx * 40, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + sy * 40)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x + sx * 58, y + sy * 6)
    ctx.quadraticCurveTo(x + sx * 8, y + sy * 6, x + sx * 6, y + sy * 58)
    ctx.stroke()
  }
  corner(34, 34, 1, 1)
  corner(W - 34, 34, -1, 1)
  corner(34, H - 34, 1, -1)
  corner(W - 34, H - 34, -1, -1)
  ctx.restore()
}

/** 主入口：在已绘制的地形底图上叠加河流、道路、桥与装饰 */
export function paintBoardOverlay(ctx: CanvasRenderingContext2D, k: number): void {
  const rand = mulberry32(0x51ee7b2)
  ctx.save()
  ctx.scale(k, k)

  paintMountains(ctx, rand)
  paintDesert(ctx, rand)
  paintCoast(ctx, rand)
  paintForest(ctx, rand)
  paintHeartland(ctx, rand)
  paintSea(ctx, rand)
  paintCloudShadows(ctx, rand)

  paintRiver(ctx, rand)
  paintRoad(ctx)
  bridge(ctx, LAYOUT[18].x, LAYOUT[18].y, LAYOUT[18].angle)
  bridge(ctx, LAYOUT[53].x, LAYOUT[53].y, LAYOUT[53].angle)

  // 西北暖阳
  const sun = ctx.createRadialGradient(420, 260, 60, 420, 260, 1750)
  sun.addColorStop(0, 'rgba(255, 232, 172, 0.16)')
  sun.addColorStop(0.45, 'rgba(255, 232, 172, 0.05)')
  sun.addColorStop(1, 'rgba(255, 232, 172, 0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, W, H)
  // 东南冷影
  const cool = ctx.createLinearGradient(200, 200, W, H)
  cool.addColorStop(0, 'rgba(32, 56, 62, 0)')
  cool.addColorStop(0.62, 'rgba(32, 56, 62, 0.03)')
  cool.addColorStop(1, 'rgba(24, 40, 46, 0.14)')
  ctx.fillStyle = cool
  ctx.fillRect(0, 0, W, H)
  // 暗角
  const vignette = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1450)
  vignette.addColorStop(0, 'rgba(24, 16, 8, 0)')
  vignette.addColorStop(0.7, 'rgba(24, 16, 8, 0.035)')
  vignette.addColorStop(1, 'rgba(24, 16, 8, 0.18)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, W, H)
  paintFrame(ctx)
  ctx.restore()
}
