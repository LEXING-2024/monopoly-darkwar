// ============ Phaser 棋盘场景：沙盘地图 / 棋子 / 特效（程序化绘制，无外部素材） ============

import Phaser from 'phaser'
import boardParchmentUrl from '../../assets/images/board-parchment.webp'
import typhoonUrl from '../../assets/images/typhoon.png'
import {
  BOARD, LAYOUT, SEA_POINTS,
} from '../core/map'
import { BUILDING_DEFS, PLAYER_COLORS } from '../core/config'
import { playSfx } from '../core/sfx'
import { Piece, pieceOffsets } from './pieces'
import type { Game } from '../core/game'
import type { DisasterKind, Season, Tile } from '../core/types'

const TERRAIN_COLORS: Record<string, number> = {
  forest: 0x4a7c46, plateau: 0x8fae5e, desert: 0xd9b96a, coast: 0x8fc9d9,
}
const TILE_COLORS: Record<Tile['type'], number> = {
  start: 0xc9a87c, terrain: 0x000000, fate: 0x5b4a8a, chance: 0xc9a227,
  bridge: 0xa3765a, casino: 0xa3484a, auction: 0x7a6a52,
}
const SEASON_TINTS: Record<Season, { color: number; alpha: number }> = {
  spring: { color: 0xa8d8a0, alpha: 0.06 },
  summer: { color: 0xffd98a, alpha: 0.09 },
  autumn: { color: 0xe0a040, alpha: 0.11 },
  winter: { color: 0xb0d0ff, alpha: 0.13 },
}
const DISASTER_STYLE: Record<string, { color: number; icon: string }> = {
  fire: { color: 0xff6a2a, icon: '火' },
  snow: { color: 0xe8f4ff, icon: '雪' },
  sandstorm: { color: 0xe8d06a, icon: '沙' },
  flood: { color: 0x5a9fe8, icon: '洪' },
  typhoon: { color: 0x9fb8cc, icon: '风' },
  pollution: { color: 0x4a3a2a, icon: '污' },
  quake: { color: 0x6a5648, icon: '震' },
}

interface TileView {
  tile: Tile
  container: Phaser.GameObjects.Container
  card: Phaser.GameObjects.Image
  icon: Phaser.GameObjects.Image
  ownerRing: Phaser.GameObjects.Arc
  buildingTexts: Phaser.GameObjects.Text[]
  disasterOverlay: Phaser.GameObjects.Rectangle
  disasterIcon: Phaser.GameObjects.Text
  bridgeLevel: Phaser.GameObjects.Text
  closedIcon: Phaser.GameObjects.Text
  price: Phaser.GameObjects.Text
  seized: Phaser.GameObjects.Text
  fx: Phaser.GameObjects.Image
  fxTween: Phaser.Tweens.Tween | null
}

export class BoardScene extends Phaser.Scene {
  core!: Game
  private board!: Phaser.GameObjects.Container
  private parchment!: Phaser.GameObjects.Image
  /** 基准缩放 = 画布宽 / 棋盘宽（棋盘铺满视野），容器尺寸变化时重算 */
  private baseZoom = 0
  private tileViews: TileView[] = []
  private pieces: Piece[] = []
  private typhoonView!: Phaser.GameObjects.Container
  private typhoonImg: Phaser.GameObjects.Image | null = null
  private typhoonLoading = false
  private typhoonLabel!: Phaser.GameObjects.Text
  private predictionLine!: Phaser.GameObjects.Graphics
  private seasonOverlay!: Phaser.GameObjects.Rectangle
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private iceContainer!: Phaser.GameObjects.Container
  private dragging = false
  /** 受灾地块的视觉标记：灾害发生后保留 2 回合再消失（核心清灾后依然显示） */
  private disasterFx: Map<number, { kind: DisasterKind; untilRound: number }> = new Map()

  constructor() {
    super('board')
  }

  init(data: { core: Game }): void {
    this.core = data.core
  }

  /** 预加载外部素材：棋盘羊皮纸贴图（Vite 打包 assets\images\）。
   *  台风素材不走预加载——台风首次出现时才按需加载（ensureTyphoonTexture） */
  preload(): void {
    this.load.image('board-parchment-img', boardParchmentUrl)
  }

  async create(): Promise<void> {
    // 画布后备分辨率高于棋盘世界尺寸，相机基础缩放 = 画布/棋盘，让棋盘世界铺满视野
    this.baseZoom = Math.min(this.scale.width / BOARD.w, this.scale.height / BOARD.h)
    this.cameras.main.setZoom(this.baseZoom)
    this.scale.on('resize', this.handleResize, this)
    this.drawParchment()
    this.drawTrack()
    this.buildWinterIce()
    await this.loadIconTextures()
    this.makeFxTextures()
    this.buildTiles()
    this.buildPieces()
    this.buildTyphoon()
    this.buildSeasonFx()
    this.setupCameraControls()
    this.registerCoreEvents()
    this.syncAll()
    // 调试钩子：浏览器控制台可查看相机状态
    ;(window as any).__boardCam = this.cameras.main
    // 棋盘就绪：加载遮罩等待此信号后撤下
    this.core.emit('board-ready')
  }

  /** 简笔画图标：SVG → Image → CanvasTexture（避开 Phaser SVG 加载器的 data-URI 问题） */
  private loadIconTextures(): Promise<void> {
    // 纹理按显示尺寸 2 倍生成（240×160），最大缩放时依然清晰
    const TW = 240
    const TH = 160
    const jobs = Object.entries(BoardScene.ART).map(([name, art]) =>
      new Promise<void>((resolve) => {
        const svg = art.replace('<svg ', `<svg width='${TW}' height='${TH}' `)
        const img = new Image()
        img.onload = () => {
          if (!this.textures.exists(`icon-${name}`)) {
            const tex = this.textures.createCanvas(`icon-${name}`, TW, TH)
            if (tex) {
              const ctx = tex.getContext()
              ctx.clearRect(0, 0, TW, TH)
              ctx.drawImage(img, 0, 0, TW, TH)
              tex.refresh()
            }
          }
          resolve()
        }
        img.onerror = () => resolve()
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      }),
    )
    return Promise.all(jobs).then(() => undefined)
  }

  /** 冬季结冰河流（中央冻河 + 两座桥旁的冰面绕行路），仅冬季显示 */
  private buildWinterIce(): void {
    this.iceContainer = this.add.container(0, 0).setDepth(8).setVisible(false)
    const g = this.add.graphics()
    this.iceContainer.add(g)

    // 三次贝塞尔采样成折线（Phaser Graphics 无曲线接口）
    const bezierPts = (x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number): { x: number; y: number }[] => {
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        const u = 1 - t
        pts.push({
          x: u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1,
          y: u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1,
        })
      }
      return pts
    }
    const strokeCurve = (pts: { x: number; y: number }[]): void => {
      g.beginPath()
      g.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
      g.strokePath()
    }

    // 中央冻河：西北→东南斜贯中央区（层叠冰面 + 冰裂纹）
    g.lineStyle(130, 0x9fc8e8, 0.28)
    strokeCurve(bezierPts(880, 300, 1020, 500, 1080, 760, 1420, 1240))
    g.lineStyle(104, 0xcfe4f8, 0.4)
    strokeCurve(bezierPts(890, 310, 1025, 505, 1085, 758, 1410, 1228))
    g.lineStyle(76, 0xeaf4fc, 0.5)
    strokeCurve(bezierPts(900, 320, 1030, 510, 1090, 756, 1400, 1216))
    g.lineStyle(3, 0xffffff, 0.75)
    for (let i = 0; i < 26; i++) {
      const t = i / 26
      const x = 890 + t * 520
      const y = 310 + t * 910
      const a = Math.atan2(910, 520) + (Math.random() - 0.5) * 1.2
      const l = 26 + Math.random() * 46
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
      g.strokePath()
    }

    // 两座桥旁的冰面绕行路（白色冰道 + 足迹点）
    const bypass = (x0: number, y0: number, x1: number, y1: number, cx: number, cy: number): void => {
      g.lineStyle(9, 0xffffff, 0.85)
      g.beginPath()
      g.moveTo(x0, y0)
      for (let i = 1; i <= 16; i++) {
        const t = i / 16
        const u = 1 - t
        g.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1)
      }
      g.strokePath()
      g.fillStyle(0xd8ecf8, 0.95)
      for (const t of [0.25, 0.5, 0.75]) {
        const u = 1 - t
        const x = u * u * x0 + 2 * u * t * cx + t * t * x1
        const y = u * u * y0 + 2 * u * t * cy + t * t * y1
        g.fillCircle(x, y, 8)
        g.fillCircle(x + 22, y + 8, 5)
      }
    }
    // 西桥（18 位于 (96,768)）：冰面从 17(96,864) 绕右侧至 19(96,672)
    bypass(120, 840, 120, 700, 320, 770)
    // 东桥（53 位于 (2208,672)）：冰面从 52(2208,576) 绕左侧至 54(2208,768)
    bypass(2180, 600, 2180, 745, 1980, 672)
  }

  // ---------- 灾害地块视觉效果（火苗 / 地震裂缝 / 积雪，176×176 纹理，显示 88×88） ----------

  private makeFxTextures(): void {
    const size = 176
    if (!this.textures.exists('fx-fire')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      const flame = (cx: number, baseY: number, tipY: number, halfW: number, color: string): void => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(cx - halfW, baseY)
        ctx.quadraticCurveTo(cx - halfW * 0.72, baseY - (baseY - tipY) * 0.55, cx, tipY)
        ctx.quadraticCurveTo(cx + halfW * 0.72, baseY - (baseY - tipY) * 0.55, cx + halfW, baseY)
        ctx.closePath()
        ctx.fill()
      }
      // 外层深红 + 中层橙 + 内层黄火苗 + 火星
      flame(76, 158, 18, 46, '#d8431e')
      flame(96, 158, 34, 40, '#ff8c2a')
      flame(88, 158, 56, 30, '#ffd23e')
      flame(60, 158, 70, 20, '#ffb02a')
      ctx.fillStyle = 'rgba(255,140,42,0.9)'
      for (const [ex, ey] of [[52, 96], [112, 76], [132, 110], [66, 128], [106, 60]]) {
        ctx.beginPath()
        ctx.arc(ex, ey, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-fire', c)
    }
    if (!this.textures.exists('fx-quake')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 地面裂缝：自中心向外辐射的深色折线
      ctx.strokeStyle = 'rgba(58,36,16,0.88)'
      ctx.lineWidth = 6
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const cx = size / 2
      const cy = size / 2 + 6
      for (const ang of [0.35, 1.5, 2.5, 3.7, 4.7, 5.7]) {
        ctx.beginPath()
        let x = cx
        let y = cy
        ctx.moveTo(x, y)
        const segs = 4 + Math.floor(Math.random() * 3)
        for (let k = 0; k < segs; k++) {
          const step = 14 + Math.random() * 10
          const nx = x + Math.cos(ang) * step + (Math.random() - 0.5) * 12
          const ny = y + Math.sin(ang) * step + (Math.random() - 0.5) * 12
          ctx.lineTo(nx, ny)
          x = nx
          y = ny
        }
        ctx.stroke()
      }
      this.textures.addCanvas('fx-quake', c)
    }
    if (!this.textures.exists('fx-snow')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 积雪：覆盖卡片下部的白色雪堆（多个雪团 + 阴影边 + 飘雪点）
      const mound = (cx: number, r: number, baseY: number): void => {
        ctx.fillStyle = '#f7faff'
        ctx.beginPath()
        ctx.arc(cx, baseY - r, r, Math.PI, 0)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(184,200,232,0.85)'
      ctx.fillRect(8, 118, size - 16, 52)
      mound(40, 34, 158)
      mound(88, 46, 168)
      mound(136, 38, 160)
      ctx.fillStyle = '#ffffff'
      mound(58, 26, 150)
      mound(106, 30, 156)
      ctx.fillStyle = 'rgba(255,255,255,0.95)'
      for (const [sx, sy] of [[30, 96], [64, 84], [112, 92], [148, 104], [92, 66], [130, 58], [48, 60]]) {
        ctx.beginPath()
        ctx.arc(sx, sy, 4.5, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-snow', c)
    }
  }

  /** 当前格子应显示的灾害视觉（火灾/地震/雪灾）；灾害发生后保留 2 回合。
   *  按轮数（totalRound）而非行动数（turn）计——此前用 s.turn + 2 导致图标
   *  只保留约两名玩家的行动过程就消失了 */
  private activeFxKind(i: number): DisasterKind | null {
    const s = this.core.state
    const t = s.tiles[i]
    let kind: DisasterKind | null = null
    if (t.disaster) kind = t.disaster.kind
    else if (s.quake && s.quake.affected.includes(i)) kind = 'quake'
    if (kind) this.disasterFx.set(i, { kind, untilRound: s.totalRound + 2 })
    const rec = this.disasterFx.get(i)
    if (!rec || s.totalRound > rec.untilRound) {
      this.disasterFx.delete(i)
      return null
    }
    return rec.kind
  }

  // ---------- 绘制基础 ----------

  /** 羊皮纸底：优先用素材图（assets/images/board-parchment.webp，等比铺满居中裁切）；
   *  素材不可用时回退程序化生成（1.5x 后备分辨率，颗粒+污渍+斑驳+纤维+折痕+霉点），最后统一叠加柔和晕影 */
  private makeParchmentTexture(): void {
    if (this.textures.exists('parchment')) return
    const { w, h } = BOARD
    const S = 1.5   // 1.5 倍后备分辨率
    let W = w * S
    let H = h * S
    // 超出 GPU 最大纹理尺寸时按比例缩小（老旧显卡兜底），显示时再铺满棋盘
    const gl = (this.renderer as Phaser.Renderer.WebGL.WebGLRenderer)?.gl
    const maxTex = gl ? (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) : 4096
    const cap = Math.min(1, maxTex / W, maxTex / H)
    if (cap < 1) { W = Math.floor(W * cap); H = Math.floor(H * cap) }
    const K = H / 1520   // 相对旧画布（2400×1520 的一半）的尺寸系数，纹理元素随画布等比放大
    const AREA = (W * H) / (2400 * 1520)   // 相对旧画布的面积倍数，颗粒/纤维数量按面积同比（仅回退分支使用）
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    // ① 素材图：等比铺满（cover 裁切，居中）
    const img = this.textures.exists('board-parchment-img')
      ? this.textures.get('board-parchment-img').getSourceImage() as HTMLImageElement
      : null
    if (img && img.complete && img.naturalWidth > 0) {
      const ir = img.naturalWidth / img.naturalHeight
      const cr = W / H
      let dw = W
      let dh = W / ir
      if (dh < H) { dh = H; dw = H * ir }
      ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
    } else {
    // ② 回退：程序化羊皮纸——泛黄底色
    const grad = ctx.createLinearGradient(0, 0, 480 * K, H)
    grad.addColorStop(0, '#f2e3b8')
    grad.addColorStop(0.5, '#ead6a2')
    grad.addColorStop(1, '#dfc48a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)
    // 米花纸颗粒
    for (let i = 0; i < 70000 * AREA; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const a = Math.random() * 0.055
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(94,58,14,${a})` : `rgba(255,250,232,${a * 1.4})`
      ctx.fillRect(x, y, 2.4 * K, 2.4 * K)
    }
    // 横向污渍条纹（拉伸墨痕/水渍）
    for (let i = 0; i < 40; i++) {
      const y = Math.random() * H
      const hh = (4 + Math.random() * 26) * K
      const x = Math.random() * W
      ctx.strokeStyle = `rgba(122,82,30,${0.02 + Math.random() * 0.05})`
      ctx.lineWidth = hh
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.bezierCurveTo(x + 480 * K, y + hh * 0.5, x + 1120 * K, y - hh * 0.4, x + 1760 * K, y + hh * 0.2)
      ctx.stroke()
    }
    // 岁月污渍斑
    for (let i = 0; i < 12; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const r = (72 + Math.random() * 180) * K
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, `rgba(116,72,18,${0.05 + Math.random() * 0.07})`)
      rg.addColorStop(1, 'rgba(116,72,18,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // 手工纸的明暗斑驳（大块柔和的深浅色团）
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const r = (140 + Math.random() * 320) * K
      const light = Math.random() < 0.5
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, light ? 'rgba(255,248,224,0.05)' : 'rgba(96,62,18,0.05)')
      rg.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    // 纸纤维（细短丝线，深浅随机）
    ctx.lineCap = 'round'
    for (let i = 0; i < 900 * AREA; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const ang = Math.random() * Math.PI
      const len = (12 + Math.random() * 52) * K
      const dark = Math.random() < 0.5
      ctx.strokeStyle = dark ? `rgba(94,58,14,${0.03 + Math.random() * 0.05})` : `rgba(255,250,232,${0.04 + Math.random() * 0.05})`
      ctx.lineWidth = (1.2 + Math.random() * 1.6) * K
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len * 0.4)
      ctx.stroke()
    }
    // 纸张折痕（两道长折痕：暗线 + 相邻高光）
    const crease = (x0: number, y0: number, c1x: number, c1y: number, x1: number, y1: number): void => {
      const path = (): void => {
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.quadraticCurveTo(c1x, c1y, x1, y1)
      }
      ctx.strokeStyle = 'rgba(94,58,14,0.10)'
      ctx.lineWidth = 4 * K
      path()
      ctx.stroke()
      ctx.strokeStyle = 'rgba(255,248,224,0.10)'
      ctx.lineWidth = 2.6 * K
      ctx.beginPath()
      ctx.moveTo(x0 + 5 * K, y0)
      ctx.quadraticCurveTo(c1x + 5 * K, c1y, x1 + 5 * K, y1)
      ctx.stroke()
    }
    crease(W * 0.28, -20 * K, W * 0.3, H * 0.5, W * 0.24, H + 20 * K)
    crease(W * 0.74, -20 * K, W * 0.72, H * 0.48, W * 0.78, H + 20 * K)
    // 霉点（foxing，细小棕色斑点簇）
    for (let i = 0; i < 110; i++) {
      const x = Math.random() * W
      const y = Math.random() * H
      const r = (2 + Math.random() * 4) * K
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
      rg.addColorStop(0, `rgba(110,72,20,${0.05 + Math.random() * 0.09})`)
      rg.addColorStop(1, 'rgba(110,72,20,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    }   // 回退分支结束
    // ③ 边缘老化晕影（素材图与回退底统一叠加，烘焙柔和大暗角，无硬边暗线）
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72)
    vg.addColorStop(0, 'rgba(58,36,16,0)')
    vg.addColorStop(1, 'rgba(58,36,16,0.26)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
    this.textures.addCanvas('parchment', c)
  }

  private drawParchment(): void {
    const { w, h } = BOARD
    this.makeParchmentTexture()
    // 纹理若因显卡上限缩小过，仍铺满整个棋盘
    this.parchment = this.add.image(w / 2, h / 2, 'parchment').setDisplaySize(w, h)
  }

  /** 容器尺寸变化（BoardCanvas 按宽高比调整画布）：重算基准缩放——
   *  取宽高两方向能完整放下棋盘的最小缩放（fit-to-board），任何屏幕比例下
   *  棋盘都以最大尺寸完整可见，视野超出棋盘时羊皮纸铺满视野无空隙 */
  private handleResize(): void {
    if (!this.parchment) return   // create() 完成前忽略（create 会用最新尺寸初始化）
    const w = this.scale.width
    const h = this.scale.height
    if (!w || !h) return
    this.baseZoom = Math.min(w / BOARD.w, h / BOARD.h)
    const viewW = w / this.baseZoom
    const viewH = h / this.baseZoom
    const cover = Math.max(viewW / BOARD.w, viewH / BOARD.h, 1)
    this.parchment.setDisplaySize(BOARD.w * cover, BOARD.h * cover)
    if (this.seasonOverlay) this.seasonOverlay.setSize(BOARD.w * cover, BOARD.h * cover)
    const cam = this.cameras.main
    cam.setZoom(this.baseZoom)
    cam.centerOn(BOARD.w / 2, BOARD.h / 2)
  }

  /** 做旧土路：沿 72 格穿行的闭合路带（柔和暖色，无墨线描边/虚线中线，卡片覆盖其上不透出黑线） */
  private drawTrack(): void {
    const g = this.add.graphics().setDepth(9)
    const closed = [...LAYOUT.map(p => ({ x: p.x, y: p.y })), LAYOUT[0]]
    const band = (width: number, color: number, alpha: number): void => {
      g.lineStyle(width, color, alpha)
      g.beginPath()
      g.moveTo(closed[0].x, closed[0].y)
      for (let i = 1; i < closed.length; i++) g.lineTo(closed[i].x, closed[i].y)
      g.strokePath()
    }
    band(104, 0x6b4a2a, 0.10)
    band(96, 0x8a6a3a, 0.10)
  }

  // ---------- 地块卡片 ----------

  /** 简笔画图标（SVG 墨线稿，48×32 视框） */
  private static ART: Record<string, string> = {
    pines: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M13,26 V17 M13,21 L5,13 L21,13 Z M13,13 L7,6 L19,6 Z'/><path d='M32,26 V13 M32,17 L24,8 L40,8 Z M32,8 L27,3 L37,3 Z'/><path d='M6,29 H42'/></svg>",
    mountains: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4,27 L15,9 L25,27'/><path d='M20,27 L30,6 L42,27'/><circle cx='41' cy='6' r='3.2'/><path d='M35,6 H47 M41,1 V11'/><path d='M6,30 H44'/></svg>",
    dunes: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3,24 Q11,16 19,24 T35,24'/><path d='M12,30 Q20,23 28,30'/><path d='M39,28 V18 M39,21 L34,19 M39,22 L44,20'/><circle cx='10' cy='8' r='3.2'/><path d='M4,8 H16 M10,2 V14'/><path d='M6,31 H44'/></svg>",
    waves: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3,10 q3,-3 6,0 t6,0 t6,0'/><path d='M22,16 q3,-3 6,0 t6,0 t6,0'/><path d='M10,25 q2,-2 4,0 t4,0'/><path d='M35,4 Q42,2 45,6 Q42,10 35,8 Q38,6 35,4 Z'/><path d='M45,6 L49,4 M45,6 L49,8'/></svg>",
    house: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6,27 V18 L24,8 L42,18 V27'/><path d='M11,27 V19 H37 V27'/><path d='M22,27 V20 H26 V27'/><path d='M6,31 H42'/></svg>",
    hourglass: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M17,5 H31 M17,27 H31'/><path d='M17,5 V11 Q24,16 31,11 V5 M17,27 V21 Q24,16 31,21 V27'/><path d='M20,5 V10 Q24,13 28,10 V5 M20,27 V22 Q24,19 28,22 V27'/><path d='M14,29 H34'/></svg>",
    gift: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='8' y='14' width='32' height='14' rx='2'/><path d='M8,14 V8 Q24,8 40,14'/><path d='M24,8 V28'/><path d='M18,8 Q21,4 24,8 Q27,12 30,8'/><path d='M5,31 H43'/></svg>",
    bridge: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M4,26 Q24,8 44,26'/><path d='M4,26 V29 H44 V26'/><path d='M12,22 V26 M20,18 V26 M28,18 V26 M36,22 V26'/><path d='M6,29 H42'/></svg>",
    dice: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='6' y='7' width='15' height='15' rx='3'/><circle cx='10.5' cy='11.5' r='1.2' fill='#4a3018'/><circle cx='16.5' cy='17.5' r='1.2' fill='#4a3018'/><circle cx='16.5' cy='11.5' r='1.2' fill='#4a3018'/><circle cx='10.5' cy='17.5' r='1.2' fill='#4a3018'/><rect x='27' y='11' width='15' height='15' rx='3'/><circle cx='31.5' cy='15.5' r='1.2' fill='#4a3018'/><circle cx='37.5' cy='15.5' r='1.2' fill='#4a3018'/><circle cx='34.5' cy='19' r='1.2' fill='#4a3018'/><circle cx='34.5' cy='12.5' r='1.2' fill='#4a3018'/></svg>",
    gavel: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 32' fill='none' stroke='#4a3018' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='6' y='6' width='16' height='10' rx='2' transform='rotate(45 14 11)'/><path d='M19,19 L23,29'/><path d='M28,24 H45'/><path d='M34,24 V29'/></svg>",
  }

  private roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    const rr = Math.min(r, w / 2, h / 2)
    ctx.beginPath()
    ctx.moveTo(x + rr, y)
    ctx.arcTo(x + w, y, x + w, y + h, rr)
    ctx.arcTo(x + w, y + h, x, y + h, rr)
    ctx.arcTo(x, y + h, x, y, rr)
    ctx.arcTo(x, y, x + w, y, rr)
    ctx.closePath()
  }

  /** 每张地块卡片独立生成羊皮纸纹理（颗粒、污渍、双墨线框、顶部地形色带各不相同；2x 高清生成） */
  private makeCardTexture(i: number, accent: number, w: number, h: number): string {
    const key = `tile-card-${i}`
    if (this.textures.exists(key)) return key
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const s = w / 100   // 相对旧纹理（100×92，显示 50×46）的放大系数
    const r = Math.min(w, h) * 0.16
    // 羊皮纸底
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#f9edcc')
    g.addColorStop(0.55, '#f0dfae')
    g.addColorStop(1, '#e5cd95')
    ctx.fillStyle = g
    this.roundRectPath(ctx, 1.5 * s, 1.5 * s, w - 3 * s, h - 3 * s, r)
    ctx.fill()
    // 米花纸颗粒
    for (let k = 0; k < 460 * s * s * (h / 92); k++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const a = Math.random() * 0.05
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(94,58,14,${a})` : `rgba(255,250,232,${a * 1.3})`
      ctx.fillRect(x, y, 1.4 * s, 1.4 * s)
    }
    // 微污渍
    for (let k = 0; k < 3; k++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const rr = (5 + Math.random() * 9) * s
      const rg = ctx.createRadialGradient(x, y, 0, x, y, rr)
      rg.addColorStop(0, `rgba(116,72,18,${0.04 + Math.random() * 0.05})`)
      rg.addColorStop(1, 'rgba(116,72,18,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    }
    // 顶部地形色带
    const band = Math.max(10 * s, h * 0.19)
    ctx.save()
    this.roundRectPath(ctx, 1.5 * s, 1.5 * s, w - 3 * s, h - 3 * s, r)
    ctx.clip()
    ctx.fillStyle = `#${accent.toString(16).padStart(6, '0')}`
    ctx.globalAlpha = 0.9
    ctx.fillRect(0, 0, w, band)
    ctx.restore()
    // 色带下缘墨线
    ctx.strokeStyle = 'rgba(74,48,24,0.5)'
    ctx.lineWidth = 1.2 * s
    ctx.beginPath()
    ctx.moveTo(4 * s, band)
    ctx.lineTo(w - 4 * s, band)
    ctx.stroke()
    // 双墨线边框
    ctx.strokeStyle = '#4a3018'
    ctx.lineWidth = 2.4 * s
    this.roundRectPath(ctx, 1.4 * s, 1.4 * s, w - 2.8 * s, h - 2.8 * s, r)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(74,48,24,0.4)'
    ctx.lineWidth = 1 * s
    this.roundRectPath(ctx, 4.5 * s, 4.5 * s, w - 9 * s, h - 9 * s, r * 0.72)
    ctx.stroke()
    this.textures.addCanvas(key, c)
    return key
  }

  private makeIconTexture(name: string): string {
    return `icon-${name}`   // preload 阶段已通过 load.svg 生成
  }

  private buildTiles(): void {
    this.core.state.tiles.forEach((tile, i) => {
      this.tileViews.push(this.makeTileView(tile, i))
    })
  }

  /** 卡片色带上的短地名（如 森林5、命运、西桥） */
  private tileLabel(tile: Tile): string {
    if (tile.type === 'start') return '起点'
    if (tile.type === 'bridge') return tile.name
    if (tile.type === 'fate') return '命运'
    if (tile.type === 'chance') return '机会'
    if (tile.type === 'casino') return '赌场'
    if (tile.type === 'auction') return '拍卖'
    const m = tile.name.match(/·(\d+)号地/)
    if (m) return `${tile.name.slice(0, tile.name.indexOf('·'))}${m[1]}`
    return tile.name
  }

  private makeTileView(tile: Tile, i: number): TileView {
    const pos = LAYOUT[i]
    const size = 96   // 卡片边长（世界单位）：与格距相等，紧挨排列
    const sizeH = 96
    // 卡片始终正向（不随路线旋转），保证文字可读
    const container = this.add.container(pos.x, pos.y).setDepth(10)

    // 卡片体：每张独立生成的羊皮纸纹理（2x 高清；文字/图标为矢量/高清纹理，任何缩放都清晰）
    const color = tile.type === 'terrain' ? (TERRAIN_COLORS[tile.terrain] ?? 0xb09a70) : TILE_COLORS[tile.type]
    const cardKey = this.makeCardTexture(i, color, Math.round(size * 2), Math.round(sizeH * 2))
    const card = this.add.image(0, 0, cardKey).setDisplaySize(size, sizeH)
    container.add(card)

    // 色带上的地名（信息一眼可读）
    const label = this.add.text(0, -sizeH / 2 + 10, this.tileLabel(tile), {
      fontFamily: 'KaiTi, serif', fontSize: '17px', color: '#fff8e8',
      stroke: '#3a2410', strokeThickness: 3.5,
    }).setOrigin(0.5)
    container.add(label)

    // 简笔画图标
    const artName = tile.type === 'terrain'
      ? ({ forest: 'pines', plateau: 'mountains', desert: 'dunes', coast: 'waves' } as Record<string, string>)[tile.terrain] ?? 'dunes'
      : ({ start: 'house', fate: 'hourglass', chance: 'gift', bridge: 'bridge', casino: 'dice', auction: 'gavel' } as Record<string, string>)[tile.type]
    const icon = this.add.image(0, -5, this.makeIconTexture(artName))
      .setDisplaySize(60, 40)
    container.add(icon)

    // 价格（图标正下方居中，带￥符号）
    const price = this.add.text(0, 26, tile.price > 0 ? `￥${tile.price}` : '', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#2a1a0c', fontStyle: 'bold',
    }).setOrigin(0.5)
    container.add(price)

    // 桥等级（价格右侧）
    const bridgeLevel = this.add.text(34, 26, '', {
      fontFamily: 'Georgia, serif', fontSize: '18px', color: '#5d3a10', fontStyle: 'bold',
    }).setOrigin(0.5)
    container.add(bridgeLevel)
    const closedIcon = this.add.text(0, 0, '✕', {
      fontSize: '30px', color: '#2a1a0c', stroke: '#f5e6c8', strokeThickness: 5,
    }).setOrigin(0.5).setVisible(false)
    container.add(closedIcon)

    // 主人徽记
    const ownerRing = this.add.circle(-size / 2 + 16, -size / 2 + 16, 9, 0xffffff, 0)
      .setStrokeStyle(3.5, 0xffffff, 1).setVisible(false)
    container.add(ownerRing)

    // 建筑图标（动态，见 syncAll）
    const buildingTexts: Phaser.GameObjects.Text[] = []

    // 灾害覆盖
    const disasterOverlay = this.add.rectangle(0, 0, size - 8, sizeH - 8, 0xff0000, 0)
      .setVisible(false)
    container.add(disasterOverlay)
    const disasterIcon = this.add.text(0, 0, '', {
      fontSize: '26px', color: '#ffffff', stroke: '#2a1a0c', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false)
    container.add(disasterIcon)
    const seized = this.add.text(0, 0, '✖', {
      fontSize: '36px', color: '#2a1a0c', stroke: '#f5e6c8', strokeThickness: 5,
    }).setOrigin(0.5).setVisible(false)
    container.add(seized)

    // 灾害视觉贴图（火苗/裂缝/积雪，见 syncAll）
    const fx = this.add.image(0, 0, 'fx-fire').setDisplaySize(88, 88).setVisible(false)
    container.add(fx)

    // 点击交互（拖拽平移时不触发选中）
    const hit = this.add.rectangle(0, 0, size + 4, sizeH + 4, 0xffffff, 0.001)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerup', () => {
      if (this.dragging) return
      this.core.emit('tile-click', i)
      playSfx('click')
    })
    container.add(hit)

    return {
      tile, container, card, icon, ownerRing, buildingTexts,
      disasterOverlay, disasterIcon, bridgeLevel, closedIcon, price, seized,
      fx, fxTween: null,
    }
  }

  // ---------- 棋子 ----------

  private buildPieces(): void {
    if (!this.textures.exists('piece-shadow')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0x000000, 0.5).fillEllipse(48, 24, 88, 40)
      g.generateTexture('piece-shadow', 96, 48)
      g.destroy()
    }
    this.core.state.players.forEach((p, i) => {
      this.pieces.push(new Piece(this, p, `piece-${i}-${p.shape}`))
    })
  }

  // ---------- 台风 ----------

  private buildTyphoon(): void {
    this.typhoonView = this.add.container(-500, -500).setDepth(80).setVisible(false)
    // 台风主体素材在台风首次出现时按需加载，这里只建容器与标签
    this.typhoonLabel = this.add.text(0, -20, '', {
      fontSize: '15px', color: '#e8f4ff', stroke: '#2a4a6a', strokeThickness: 3,
    }).setOrigin(0.5)
    this.typhoonView.add(this.typhoonLabel)
    this.predictionLine = this.add.graphics().setDepth(79).setVisible(false)
  }

  /** 按需加载台风素材：台风首次出现才发起加载，加载完成后立即渲染（不再使用旧的 🌀 图标） */
  private ensureTyphoonTexture(): void {
    if (this.typhoonImg || this.typhoonLoading || this.textures.exists('typhoon-tex')) return
    this.typhoonLoading = true
    this.load.image('typhoon-tex', typhoonUrl)
    this.load.once('complete', () => {
      this.typhoonLoading = false
      if (this.textures.exists('typhoon-tex')) {
        // 显示尺寸约为原地块卡（96）的 1/6，随强度放大（应要求再缩小 3 倍）
        this.typhoonImg = this.add.image(0, 0, 'typhoon-tex').setDisplaySize(16, 16)
        this.typhoonView.add(this.typhoonImg)
        this.updateTyphoonView()
      }
    })
    this.load.once('loaderror', () => { this.typhoonLoading = false })
    this.load.start()
  }

  private updateTyphoonView(): void {
    const t = this.core.state.typhoon
    if (!t) {
      this.typhoonView.setVisible(false)
      this.predictionLine.setVisible(false)
      return
    }
    this.typhoonView.setVisible(true)
    // 台风首次出现：按需加载素材（加载期间先隐藏主体，加载完成自动显示）
    this.ensureTyphoonTexture()
    if (!this.typhoonImg) {
      this.typhoonView.setVisible(false)
      return
    }
    let px: number, py: number
    if (t.onLand && t.landTile !== null) {
      px = LAYOUT[t.landTile].x
      py = LAYOUT[t.landTile].y
    } else {
      const sp = SEA_POINTS[t.seaIndex]
      px = sp.x
      py = sp.y
    }
    this.typhoonView.setPosition(px, py)
    this.typhoonImg.setScale(1 + t.strength * 0.12)
    this.typhoonLabel.setText(`${t.strength} 级`)

    // 气象站预测路径
    const hasStation = this.core.state.tiles.some(tile =>
      tile.owner !== null && this.core.state.players[tile.owner].alive &&
      tile.buildings.some(b => b.type === 'weather-station'),
    )
    if (hasStation && t.predicted !== null && !t.onLand) {
      const tp = SEA_POINTS[t.predicted]
      this.predictionLine.setVisible(true)
      this.predictionLine.clear()
      this.predictionLine.lineStyle(3, 0xffe08a, 0.8)
      const dash = 10
      const dist = Phaser.Math.Distance.Between(px, py, tp.x, tp.y)
      const steps = Math.max(2, Math.floor(dist / dash))
      for (let i = 0; i < steps; i += 2) {
        const f0 = i / steps
        const f1 = Math.min(1, (i + 1) / steps)
        this.predictionLine.lineBetween(
          px + (tp.x - px) * f0, py + (tp.y - py) * f0,
          px + (tp.x - px) * f1, py + (tp.y - py) * f1,
        )
      }
      this.predictionLine.strokePath()
      // 箭头
      const a = Math.atan2(tp.y - py, tp.x - px)
      this.predictionLine.fillStyle(0xffe08a, 0.9)
      this.predictionLine.fillTriangle(
        tp.x + Math.cos(a) * 7, tp.y + Math.sin(a) * 7,
        tp.x + Math.cos(a + 2.6) * 17, tp.y + Math.sin(a + 2.6) * 17,
        tp.x + Math.cos(a - 2.6) * 17, tp.y + Math.sin(a - 2.6) * 17,
      )
    } else {
      this.predictionLine.setVisible(false)
    }
  }

  // ---------- 季节氛围 ----------

  private buildSeasonFx(): void {
    this.seasonOverlay = this.add.rectangle(
      BOARD.w / 2, BOARD.h / 2, BOARD.w, BOARD.h, 0xffffff, 0,
    ).setDepth(90)
    if (!this.textures.exists('dot')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0xffffff, 1).fillCircle(5, 5, 5)
      g.generateTexture('dot', 10, 10)
      g.destroy()
    }
    this.emitter = this.add.particles(0, 0, 'dot', {
      lifespan: 6500,
      quantity: 0,
      frequency: 420,
      alpha: { start: 0.8, end: 0 },
      scale: { start: 1, end: 0.6 },
      emitting: false,
    }).setDepth(91)
    this.applySeasonFx(this.core.state.season)
  }

  private applySeasonFx(season: Season): void {
    const tint = SEASON_TINTS[season]
    this.seasonOverlay.setFillStyle(tint.color, tint.alpha)
    // 冬季显示结冰河流与冰面绕行路
    if (this.iceContainer) this.iceContainer.setVisible(season === 'winter')
    const em = this.emitter
    em.stop()
    const zone = (): any => ({ type: 'random', source: new Phaser.Geom.Rectangle(0, -20, BOARD.w, 1) })
    if (season === 'spring') {
      em.setConfig({ tint: 0xff9ecb, speedY: { min: 16, max: 34 }, speedX: { min: -18, max: 18 }, lifespan: 6200, frequency: 500 })
      em.setEmitZone(zone() as any)
      em.start()
    } else if (season === 'autumn') {
      em.setConfig({ tint: [0xe8a020, 0xd07030, 0xb05020], speedY: { min: 22, max: 40 }, speedX: { min: -24, max: 24 }, lifespan: 6500, frequency: 420 })
      em.setEmitZone(zone() as any)
      em.start()
    } else if (season === 'winter') {
      em.setConfig({ tint: 0xffffff, speedY: { min: 24, max: 46 }, speedX: { min: -14, max: 14 }, lifespan: 7000, frequency: 200, scale: { start: 0.9, end: 0.5 } })
      em.setEmitZone(zone() as any)
      em.start()
    } else {
      em.stop()
    }
  }

  // ---------- 相机：滚轮/双指缩放 + 拖拽平移 ----------

  private setupCameraControls(): void {
    const cam = this.cameras.main
    cam.setBounds(0, 0, BOARD.w, BOARD.h)

    // 单指抓取基准：按下时记录手指位置与相机卷轴，拖动时按「手指位移」1:1 反向移动卷轴——
    // 手指按着的地块始终跟着手指走，手指离开时地块就停在手指离开的位置
    let grab: { x: number; y: number } | null = null
    let grabScrollX = 0
    let grabScrollY = 0
    // 双指基准：第二指落下时记录两指距离/中点/相机状态，移动时以「初始基准」做绝对变换——
    // 两指下的内容始终跟手指同步（缩放 + 中点平移一体），不漂移
    let pinch0: { d: number; midX: number; midY: number; zoom: number; sx: number; sy: number } | null = null

    const twoFingers = (): boolean => this.input.pointer1.isDown && this.input.pointer2.isDown

    /** 以屏幕点 (sx, sy) 为中心缩放（滚轮用，立即生效） */
    const zoomAround = (factor: number, sx: number, sy: number): void => {
      const z0 = cam.zoom
      const z1 = Phaser.Math.Clamp(z0 * factor, this.baseZoom, this.baseZoom * 2.8)
      if (Math.abs(z1 - z0) < 0.001) return
      const wx = cam.scrollX + sx / z0
      const wy = cam.scrollY + sy / z0
      cam.setZoom(z1)
      cam.setScroll(wx - sx / z1, wy - sy / z1)
    }

    // 桌面：滚轮缩放
    this.input.on('wheel', (_p: unknown, _objs: unknown, _dx: number, dy: number) => {
      const p = this.input.activePointer
      zoomAround(dy > 0 ? 0.9 : 1.1, p.x, p.y)
    })

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragging = false
      if (twoFingers()) {
        // 第二根手指落下：记录双指基准
        pinch0 = {
          d: Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y),
          midX: (this.input.pointer1.x + this.input.pointer2.x) / 2,
          midY: (this.input.pointer1.y + this.input.pointer2.y) / 2,
          zoom: cam.zoom, sx: cam.scrollX, sy: cam.scrollY,
        }
        grab = null
      } else {
        // 单指：抓取基准
        grab = { x: p.x, y: p.y }
        grabScrollX = cam.scrollX
        grabScrollY = cam.scrollY
      }
    })

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (twoFingers()) {
        // 双指：缩放 + 中点平移一体（绝对基准变换，跟手不漂移）
        if (!pinch0) return
        const d = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y)
        const midX = (this.input.pointer1.x + this.input.pointer2.x) / 2
        const midY = (this.input.pointer1.y + this.input.pointer2.y) / 2
        if (d < 4) return
        const z1 = Phaser.Math.Clamp(pinch0.zoom * (d / pinch0.d), this.baseZoom, this.baseZoom * 2.8)
        const wx = pinch0.sx + pinch0.midX / pinch0.zoom
        const wy = pinch0.sy + pinch0.midY / pinch0.zoom
        cam.setZoom(z1)
        cam.setScroll(wx - midX / z1, wy - midY / z1)
        return
      }
      // 单指：1:1 跟手平移
      if (p.isDown && grab) {
        const dx = p.x - grab.x
        const dy = p.y - grab.y
        if (!this.dragging && Math.hypot(dx, dy) > 5) this.dragging = true
        if (this.dragging) {
          cam.setScroll(grabScrollX - dx, grabScrollY - dy)
        }
      }
    })

    this.input.on('pointerup', () => {
      pinch0 = null
      // 一根手指抬起后，若另一根仍按着，以它当前位置为新抓取基准继续 1:1 平移
      const r1 = this.input.pointer1.isDown
      const r2 = this.input.pointer2.isDown
      if (r1 && !r2) {
        grab = { x: this.input.pointer1.x, y: this.input.pointer1.y }
      } else if (!r1 && r2) {
        grab = { x: this.input.pointer2.x, y: this.input.pointer2.y }
      } else {
        grab = null
      }
      grabScrollX = cam.scrollX
      grabScrollY = cam.scrollY
    })
  }

  // ---------- 事件与同步 ----------

  private registerCoreEvents(): void {
    const core = this.core
    core.on('state-changed', () => this.syncAll())
    core.on('piece-step', (d: { playerId: number; pos: number }) => {
      const piece = this.pieces[d.playerId]
      if (!piece) return
      const atTile = this.core.state.players
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.alive && p.pos === d.pos)
        .findIndex(({ i }) => i === d.playerId)
      const off = pieceOffsets(
        this.core.state.players.filter(p => p.alive && p.pos === d.pos).length,
        Math.max(0, atTile),
      )
      piece.moveTo(d.pos, off.x, off.y)
      playSfx('move')
    })
    core.on('float', (d: { tile: number; text: string; color: string; offsetY?: number }) => {
      this.floatText(d.tile, d.text, d.color, d.offsetY)
    })
    core.on('quake', (d: { affected: number[]; center: number; magnitude: number }) => {
      this.playQuake(d)
    })
    core.on('season', (season: Season) => this.applySeasonFx(season))
    core.on('sfx', (name: any) => playSfx(name))
    core.on('game-start', () => this.syncAll())
  }

  private floatText(tileIndex: number, text: string, color: string, offsetY = -20): void {
    const pos = LAYOUT[tileIndex]
    const t = this.add.text(pos.x, pos.y + offsetY, text, {
      fontFamily: 'Georgia, serif', fontSize: '26px', color, fontStyle: 'bold',
      stroke: '#2a1a0c', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(95)
    this.tweens.add({
      targets: t, y: t.y - 50, alpha: 0, duration: 1100, ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    })
  }

  private playQuake(d: { affected: number[]; center: number; magnitude: number }): void {
    this.cameras.main.shake(650, 0.011 * d.magnitude)
    // 红闪
    const flash = this.add.rectangle(BOARD.w / 2, BOARD.h / 2, BOARD.w, BOARD.h, 0xff3a2a, 0.18)
      .setDepth(96)
    this.tweens.add({ targets: flash, alpha: 0, duration: 500, onComplete: () => flash.destroy() })
    // 受影响地块闪红 + 建筑下沉
    for (const idx of d.affected) {
      const v = this.tileViews[idx]
      if (!v) continue
      const mark = this.add.rectangle(0, 0, 88, 88, 0xff2a1a, 0.35)
        .setDepth(20)
      v.container.add(mark)
      this.tweens.add({ targets: mark, alpha: 0, duration: 900, onComplete: () => mark.destroy() })
      v.icon.setY(v.icon.y + 2)
      this.tweens.add({ targets: v.icon, y: v.icon.y - 2, duration: 120 })
    }
  }

  /** 全量视觉同步（state-changed 时调用） */
  private syncAll(): void {
    const s = this.core.state
    if (!s?.started) return

    for (const v of this.tileViews) {
      const t = s.tiles[v.tile.index]
      // 主人徽记
      if (t.owner !== null) {
        v.ownerRing.setVisible(true)
        const c = Phaser.Display.Color.HexStringToColor(PLAYER_COLORS[t.owner]).color
        v.ownerRing.setFillStyle(c, 1).setStrokeStyle(1.5, 0xffffff, 1)
      } else {
        v.ownerRing.setVisible(false)
      }
      // 建筑
      v.buildingTexts.forEach(x => x.destroy())
      v.buildingTexts = []
      t.buildings.forEach((b, bi) => {
        // 显示建筑自身图标（防护建筑如 🧯防火带/🏠温室/🌳防沙林/🧱防波堤/🏗️堤坝 一眼可辨），等级 >1 时带数字
        const def = BUILDING_DEFS[b.type] as { icon?: string; name?: string } | undefined
        const txt = this.add.text(-33 + bi * 30, 31, `${def?.icon ?? '▣'}${b.level > 1 ? b.level : ''}`, {
          fontSize: '17px', color: '#4a3018',
        }).setOrigin(0.5)
        txt.setInteractive({ useHandCursor: true })
        txt.on('pointerover', () => txt.setScale(1.3))
        txt.on('pointerout', () => txt.setScale(1))
        // 点击建筑图标：弹出建筑详情（拖拽平移时不触发）
        txt.on('pointerup', () => {
          if (this.dragging) return
          this.core.emit('building-click', { tile: t.index, buildingId: b.id })
          playSfx('click')
        })
        v.container.add(txt)
        v.buildingTexts.push(txt)
        // 受损标记：被灾害降级且未修复的建筑显示 ⚠——自己的红色醒目、他人的灰色可辨（完好建筑不显示任何标记）
        if (b.damaged) {
          const humanId = this.core.state.players.find(p => !p.isAI)?.id ?? -1
          const mine = t.owner === humanId
          const dmg = this.add.text(-33 + bi * 30 + 15, 31 - 13, '⚠', {
            fontSize: '13px',
            color: mine ? '#c0392b' : '#9a9a9a',
            stroke: mine ? '#5d1208' : '#4a4a4a',
            strokeThickness: 2.5,
          }).setOrigin(0.5)
          v.container.add(dmg)
          v.buildingTexts.push(dmg)
        }
        if (def?.name) {
          // 悬停提示建筑名（随 buildingTexts 一并清理）
          const tip = this.add.text(-33 + bi * 30, 31 - 16, def.name + (b.level > 1 ? ` Lv${b.level}` : '') + (b.damaged ? '（受损待修）' : ''), {
            fontSize: '12px', color: '#2a1a0c', stroke: '#f5e6c8', strokeThickness: 3,
            fontFamily: 'KaiTi, serif',
          }).setOrigin(0.5).setVisible(false)
          txt.on('pointerover', () => tip.setVisible(true))
          txt.on('pointerout', () => tip.setVisible(false))
          v.container.add(tip)
          v.buildingTexts.push(tip)
        }
      })
      // 灾害（火/雪/地震有专门贴图效果，保留 2 回合；其余仍用色罩+单字）
      const fxKind = this.activeFxKind(t.index)
      const hasFx = fxKind === 'fire' || fxKind === 'quake' || fxKind === 'snow'
      if (hasFx) {
        v.fx.setTexture(`fx-${fxKind}`).setVisible(true)
        if (fxKind === 'fire') {
          // 火苗摇曳动画
          if (!v.fxTween) {
            v.fxTween = this.tweens.add({
              targets: v.fx,
              scaleY: { from: 1.06, to: 0.86 }, alpha: { from: 1, to: 0.82 },
              duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
            })
          }
        } else {
          v.fxTween?.destroy()
          v.fxTween = null
          v.fx.setScale(1).setAlpha(1)
        }
      } else {
        v.fx.setVisible(false)
        v.fxTween?.destroy()
        v.fxTween = null
        v.fx.setScale(1).setAlpha(1)
      }
      if (fxKind) {
        const style = DISASTER_STYLE[fxKind]
        v.disasterOverlay.setFillStyle(style.color, hasFx ? 0.22 : 0.55).setVisible(true)
        // 强度 ≥2 级时在图标后显示级数（强度越强破坏越大）
        const lv = (t.disaster?.intensity ?? 1)
        v.disasterIcon.setText(lv > 1 ? `${style.icon}${lv}` : style.icon).setVisible(!hasFx)
      } else if (!t.disaster) {
        v.disasterOverlay.setVisible(false)
        v.disasterIcon.setVisible(false)
      }
      // 路障标记：该格有路障时显示 🚧（下一个经过的玩家停住）
      const isRoadblock = this.core.state.roadblock === t.index
      if (isRoadblock && !fxKind && !t.disaster) {
        v.disasterOverlay.setFillStyle(0xff8a2a, 0.45).setVisible(true)
        v.disasterIcon.setText('🚧').setVisible(true)
      }
      // 桥
      if (t.type === 'bridge') {
        v.bridgeLevel.setText(t.bridgeLevel > 0 ? 'Ⅰ'.repeat(t.bridgeLevel) : '')
        v.closedIcon.setVisible(t.bridgeClosed > 0)
      }
      // 充公
      v.seized.setVisible(t.seized && t.owner === null)
    }

    // 棋子位置
    const groups = new Map<number, number[]>()
    s.players.forEach((p, i) => {
      if (!p.alive) return
      const arr = groups.get(p.pos) ?? []
      arr.push(i)
      groups.set(p.pos, arr)
    })
    s.players.forEach((p, i) => {
      const piece = this.pieces[i]
      if (!piece) return
      piece.setVisible(p.alive)
      if (!p.alive || piece.animating) return
      const arr = groups.get(p.pos) ?? [i]
      const off = pieceOffsets(arr.length, arr.indexOf(i))
      piece.setPos(p.pos, off.x, off.y)
    })

    this.updateTyphoonView()
  }

  override update(): void {
    // 台风素材缓慢逆时针自转
    // create() 为异步：首帧时 typhoonView 可能尚未创建，必须判空（否则每帧崩溃渲染循环）
    if (this.typhoonView?.visible && this.typhoonImg) {
      this.typhoonImg.rotation -= 0.006
    }
  }
}
