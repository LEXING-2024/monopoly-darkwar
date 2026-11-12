// ============ Phaser 棋盘场景：沙盘地图 / 棋子 / 特效（程序化绘制，无外部素材） ============

import Phaser from 'phaser'
import boardParchmentUrl from '../../assets/images/board-parchment.webp'
import boardTerrainUrl from '../../assets/images/board-terrain.webp'
import typhoonUrl from '../../assets/images/typhoon.png'
import {
  BOARD, LAYOUT, TILE_SIZE,
} from '../core/map'
import { BUILDING_DEFS, PLAYER_COLORS } from '../core/config'
import { playSfx } from '../core/sfx'
import { Piece, pieceOffsets } from './pieces'
import { paintBoardOverlay } from './boardArt'
import { TILE_ART, drawBuildingBadge, tileArtName } from './tileArt'
import { BIOME } from './palette'
import type { Game } from '../core/game'
import type { DisasterKind, Season, Tile, TyphoonState } from '../core/types'

const TERRAIN_COLORS: Record<string, number> = {
  forest: BIOME.forest.num, plateau: BIOME.plateau.num, desert: BIOME.desert.num, coast: BIOME.coast.num,
}
const TILE_COLORS: Record<Tile['type'], number> = {
  start: 0xa63b2b, terrain: 0x000000, fate: 0x68479a, chance: 0xb87814,
  bridge: 0x406b7a, casino: 0x9f2f3d, auction: 0x6e522a,
}
/** 图案墨色：不同地形/特殊格使用各自的深色描边，而不是一律同一种褐墨 */
const ICON_INK: Record<string, string> = {
  pines: '#244a22', mountains: '#5a3a1d', dunes: '#7c4a10', waves: '#1c5b68',
  gate: '#74251a', hourglass: '#503576', gift: '#8a5410', bridge: '#254e5b',
  dice: '#82262a', gavel: '#543516',
}
const SEASON_TINTS: Record<Season, { color: number; alpha: number }> = {
  spring: { color: 0xa8d8a0, alpha: 0.06 },
  summer: { color: 0xffd98a, alpha: 0.09 },
  autumn: { color: 0xe0a040, alpha: 0.11 },
  winter: { color: 0xb0d0ff, alpha: 0.13 },
}
const DISASTER_STYLE: Record<string, { color: number; ring: number; css: string; icon: string }> = {
  fire: { color: 0xff6a2a, ring: 0xe8521a, css: '#c24016', icon: '火' },
  snow: { color: 0xbfe6f6, ring: 0x4d8ba6, css: '#3a6a91', icon: '雪' },
  sandstorm: { color: 0xd49a3a, ring: 0x8f4f0e, css: '#7a4410', icon: '沙' },
  flood: { color: 0x4b93d8, ring: 0x2f76c0, css: '#1f5f9e', icon: '洪' },
  typhoon: { color: 0x5e8fa3, ring: 0x2d8496, css: '#256171', icon: '风' },
  pollution: { color: 0x7d4b8a, ring: 0x74428a, css: '#55315f', icon: '污' },
  quake: { color: 0x8a6a50, ring: 0x7a5438, css: '#5a3f2a', icon: '震' },
}
/** 灾害贴图基准缩放（128px 纹理显示为 94 世界像素，略大于圆牌以突出灾情） */
const FX_SCALE = 94 / 128

interface TileView {
  tile: Tile
  container: Phaser.GameObjects.Container
  card: Phaser.GameObjects.Image
  glow: Phaser.GameObjects.Image
  icon: Phaser.GameObjects.Image
  ownerRing: Phaser.GameObjects.Arc
  ownerSeal: Phaser.GameObjects.Arc
  buildingTexts: Phaser.GameObjects.GameObject[]
  /** 建筑对象的签名（id/类型/等级/受损），签名不变时无需销毁重建 */
  buildingSig: string
  disasterAura: Phaser.GameObjects.Image
  disasterOverlay: Phaser.GameObjects.Image
  disasterRing: Phaser.GameObjects.Arc
  disasterIcon: Phaser.GameObjects.Text
  disasterBadge: Phaser.GameObjects.Text
  bridgeLevel: Phaser.GameObjects.Text
  closedIcon: Phaser.GameObjects.Text
  price: Phaser.GameObjects.Text
  seized: Phaser.GameObjects.Text
  fx: Phaser.GameObjects.Image
  fxTween: Phaser.Tweens.Tween | null
  /** 当前灾害类型：避免每轮同步都重建动画 */
  fxKind: DisasterKind | null
  disasterRingTween: Phaser.Tweens.Tween | null
  disasterGlowTween: Phaser.Tweens.Tween | null
}

export class BoardScene extends Phaser.Scene {
  core!: Game
  private board!: Phaser.GameObjects.Container
  private parchment!: Phaser.GameObjects.Image
  /** 基准缩放 = 画布宽 / 棋盘宽（棋盘铺满视野），容器尺寸变化时重算 */
  private baseZoom = 0
  private tileViews: TileView[] = []
  private pieces: Piece[] = []
  private iceContainer!: Phaser.GameObjects.Container
  private typhoonView!: Phaser.GameObjects.Container
  private typhoonImg: Phaser.GameObjects.Image | null = null
  private typhoonRing: Phaser.GameObjects.Arc | null = null
  private typhoonTrail!: Phaser.GameObjects.Graphics
  private typhoonLabel!: Phaser.GameObjects.Text
  private predictionLine!: Phaser.GameObjects.Graphics
  /** 台风显示状态：位置补间 + 强度尺寸补间，避免每回合瞬移 */
  private typhoonTargetX = Number.NaN
  private typhoonTargetY = Number.NaN
  private typhoonDisplaySize = 40
  private typhoonTargetSize = 40
  private typhoonSpawned = false
  private typhoonFadingOut = false
  private typhoonMoveTween: Phaser.Tweens.Tween | null = null
  private typhoonFadeTweens: Phaser.Tweens.Tween[] = []
  private seasonOverlay!: Phaser.GameObjects.Rectangle
  private emitter!: Phaser.GameObjects.Particles.ParticleEmitter
  private dragging = false
  /** 受灾地块的视觉标记：灾害发生后保留 2 回合再消失（核心清灾后依然显示） */
  private disasterFx: Map<number, { kind: DisasterKind; untilRound: number }> = new Map()
  /** 踏冰绕行中的玩家：playerId -> 目标格；用于忽略随后到达格的 piece-step，避免瞬移 */
  private iceBypass = new Map<number, number>()

  constructor() {
    super('board')
  }

  init(data: { core: Game }): void {
    this.core = data.core
  }

  /** 预加载外部素材：棋盘底图与台风图（Vite 打包 assets\images\）。
   *  台风图很小，直接预加载，避免首次生成时因运行时加载而短暂不显示。 */
  preload(): void {
    this.load.image('board-parchment-img', boardParchmentUrl)
    this.load.image('board-terrain-img', boardTerrainUrl)
    this.load.image('typhoon-tex', typhoonUrl)
  }

  async create(): Promise<void> {
    // 画布后备分辨率高于棋盘世界尺寸，相机基础缩放 = 画布/棋盘，让棋盘世界铺满视野
    this.baseZoom = Math.min(this.scale.width / BOARD.w, this.scale.height / BOARD.h)
    this.cameras.main.setZoom(this.baseZoom)
    this.scale.on('resize', this.handleResize, this)
    this.drawParchment()
    await this.loadIconTextures()
    this.makeFxTextures()
    this.makeTileUiTextures()
    this.buildTiles()
    this.buildWinterIcePatches()
    this.buildPieces()
    this.buildTyphoon()
    this.buildSeasonFx()
    this.setupCameraControls()
    this.registerCoreEvents()
    this.syncAll()
    // 调试钩子：仅开发构建暴露相机/耗时统计到控制台，避免生产环境悬挂全局变量
    if (import.meta.env.DEV) {
      (window as any).__boardCam = this.cameras.main
      ;(window as any).__boardScene = this
      ;(window as any).__boardStats = {
        canvasW: this.scale.width,
        canvasH: this.scale.height,
        boardZoom: Number(this.baseZoom.toFixed(3)),
        mapPaintMs: (window as any).__mapPaintMs ?? null,
      }
    }
    // 棋盘就绪：加载遮罩等待此信号后撤下
    this.core.emit('board-ready')
  }

  /** 简笔画图标：SVG → Image → CanvasTexture（避开 Phaser SVG 加载器的 data-URI 问题） */
  private loadIconTextures(): Promise<void> {
    // 纹理按显示尺寸 2 倍生成（240×160），最大缩放时依然清晰
    const TW = 240
    const TH = 160
    const jobs = Object.entries(TILE_ART).map(([name, art]) =>
      new Promise<void>((resolve) => {
        // 每个图案用自己的深色墨线：森林墨绿、沙漠赭石、沿海靛青、特殊格各自成色
        const inked = art.replaceAll('#4a3420', ICON_INK[name] ?? '#4a3420')
        const svg = inked.replace('<svg ', `<svg width='${TW}' height='${TH}' `)
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

  /** 地块通用 UI 贴图：圆角色罩、悬停金边（一次生成，72 格复用） */
  private makeTileUiTextures(): void {
    if (!this.textures.exists('tile-tint')) {
      const S = 192
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const ctx = c.getContext('2d')!
      this.roundRectPath(ctx, 6, 6, S - 12, S - 12, 96)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      this.textures.addCanvas('tile-tint', c)
    }
    if (!this.textures.exists('tile-glow')) {
      const S = 208
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const ctx = c.getContext('2d')!
      ctx.shadowColor = 'rgba(255, 214, 122, 0.9)'
      ctx.shadowBlur = 16
      ctx.strokeStyle = 'rgba(255, 232, 168, 0.95)'
      ctx.lineWidth = 7
      this.roundRectPath(ctx, 10, 10, S - 20, S - 20, 100)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(122, 86, 44, 0.75)'
      ctx.lineWidth = 2
      this.roundRectPath(ctx, 10, 10, S - 20, S - 20, 100)
      ctx.stroke()
      this.textures.addCanvas('tile-glow', c)
    }
    if (!this.textures.exists('disaster-aura')) {
      const S = 192
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const ctx = c.getContext('2d')!
      const rg = ctx.createRadialGradient(S / 2, S / 2, S * 0.24, S / 2, S / 2, S * 0.5)
      rg.addColorStop(0, 'rgba(255,255,255,0)')
      rg.addColorStop(0.55, 'rgba(255,255,255,0.06)')
      rg.addColorStop(0.74, 'rgba(255,255,255,0.72)')
      rg.addColorStop(0.9, 'rgba(255,255,255,0.24)')
      rg.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, S, S)
      this.textures.addCanvas('disaster-aura', c)
    }
  }

  /** 冬季桥头薄冰：用轻量 Graphics 画两小片，避免旧贴图造成的发光/横贯冰带 */
  private buildWinterIcePatches(): void {
    this.iceContainer = this.add.container(0, 0).setDepth(7).setVisible(false)
    const g = this.add.graphics()
    const patch = (x: number, y: number, flip: boolean): void => {
      const w = 78
      const h = 38
      g.fillStyle(0xcfeaf0, 0.42)
      g.fillEllipse(x, y, w, h)
      g.lineStyle(2, 0xf2fbff, 0.55)
      g.strokeEllipse(x, y, w, h)
      g.lineStyle(1.2, 0xffffff, 0.5)
      for (let i = -1; i <= 1; i++) {
        g.beginPath()
        g.moveTo(x + i * 16 + (flip ? -8 : 8), y - 9)
        g.lineTo(x + i * 16 + (flip ? -2 : 2), y + 10)
        g.strokePath()
      }
    }
    patch(LAYOUT[18].x + 58, LAYOUT[18].y, false)
    patch(LAYOUT[53].x - 58, LAYOUT[53].y, true)
    this.iceContainer.add(g)
  }

  // ---------- 灾害地块视觉效果（火苗 / 地震裂缝 / 积雪，176×176 纹理，显示 88×88） ----------

  private makeFxTextures(): void {
    const size = 128
    if (!this.textures.exists('fx-fire')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 地面余烬光
      const glow = ctx.createRadialGradient(64, 118, 4, 64, 118, 46)
      glow.addColorStop(0, 'rgba(255, 150, 50, 0.32)')
      glow.addColorStop(1, 'rgba(255, 120, 30, 0)')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, size, size)
      const flame = (cx: number, baseY: number, tipY: number, halfW: number, color: string): void => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.moveTo(cx - halfW, baseY)
        ctx.quadraticCurveTo(cx - halfW * 0.8, baseY - (baseY - tipY) * 0.55, cx, tipY)
        ctx.quadraticCurveTo(cx + halfW * 0.8, baseY - (baseY - tipY) * 0.55, cx + halfW, baseY)
        ctx.closePath()
        ctx.fill()
      }
      // 火焰集中在卡片下半部：不遮挡顶部地名与价格
      flame(52, 124, 92, 18, 'rgba(188, 44, 16, 0.90)')
      flame(72, 124, 82, 19, 'rgba(232, 108, 22, 0.94)')
      flame(90, 124, 88, 16, 'rgba(214, 84, 18, 0.88)')
      flame(66, 124, 100, 10, 'rgba(255, 198, 66, 0.98)')
      flame(84, 124, 96, 8, 'rgba(255, 170, 40, 0.9)')
      // 火星
      ctx.fillStyle = 'rgba(255, 172, 60, 0.85)'
      for (const [ex, ey, r] of [[44, 92, 1.8], [100, 86, 2.1], [78, 70, 1.5], [56, 76, 1.4]] as const) {
        ctx.beginPath()
        ctx.arc(ex, ey, r, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-fire', c)
    }
    if (!this.textures.exists('fx-quake')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 细而分叉的地裂：从中心向外，不触碰卡片边缘
      ctx.strokeStyle = 'rgba(58, 38, 18, 0.85)'
      ctx.lineWidth = 2.4
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const crack = (ang: number, len: number, depth: number): void => {
        let x = size / 2
        let y = size / 2 + 4
        ctx.beginPath()
        ctx.moveTo(x, y)
        const segs = 4 + depth
        for (let k = 0; k < segs; k++) {
          const a = ang + (Math.random() - 0.5) * 0.5
          const step = (len / segs) * (0.7 + Math.random() * 0.6)
          x += Math.cos(a) * step
          y += Math.sin(a) * step * 0.8
          ctx.lineTo(x, y)
        }
        ctx.stroke()
        if (depth > 0) {
          crack(ang + (Math.random() - 0.5) * 0.8, len * 0.5, depth - 1)
          crack(ang - (Math.random() - 0.5) * 0.8, len * 0.45, depth - 1)
        }
      }
      for (const ang of [0.2, 1.1, 1.9, 2.7, 3.6, 4.5, 5.3, 5.9]) crack(ang, 40, 1)
      // 碎屑
      ctx.fillStyle = 'rgba(74, 52, 32, 0.55)'
      for (const [rx, ry, r] of [[52, 50, 2], [74, 58, 1.6], [60, 78, 2.2], [86, 72, 1.4], [44, 70, 1.5]] as const) {
        ctx.beginPath()
        ctx.arc(rx, ry, r, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-quake', c)
    }
    if (!this.textures.exists('fx-snow')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 积雪：底部雪堆（软边，无硬矩形）
      const mound = (cx: number, r: number, baseY: number, color: string): void => {
        ctx.fillStyle = color
        ctx.beginPath()
        ctx.arc(cx, baseY, r, Math.PI, 0)
        ctx.fill()
      }
      mound(30, 24, 122, 'rgba(204, 218, 240, 0.85)')
      mound(64, 32, 126, 'rgba(226, 236, 250, 0.92)')
      mound(98, 26, 122, 'rgba(206, 220, 242, 0.88)')
      mound(48, 17, 118, 'rgba(250, 253, 255, 0.95)')
      mound(84, 19, 120, 'rgba(250, 253, 255, 0.95)')
      // 飘雪
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
      for (const [sx, sy, r] of [[24, 74, 2.6], [46, 58, 2.2], [72, 70, 2.6], [98, 52, 2.1], [110, 84, 2.4], [58, 92, 1.8]] as const) {
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-snow', c)
    }
    if (!this.textures.exists('fx-sand')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 沙尘：底部扬起的黄沙，横向流纹 + 细沙粒（颜色压深，浅色纸牌上也看得清）
      const dust = ctx.createRadialGradient(64, 106, 4, 64, 106, 64)
      dust.addColorStop(0, 'rgba(150, 98, 28, 0.52)')
      dust.addColorStop(0.62, 'rgba(166, 111, 36, 0.26)')
      dust.addColorStop(1, 'rgba(166, 111, 36, 0)')
      ctx.fillStyle = dust
      ctx.fillRect(0, 0, size, size)
      ctx.lineCap = 'round'
      for (let i = 0; i < 11; i++) {
        const y = 84 + i * 4
        const x = 5 + (i % 3) * 11
        ctx.strokeStyle = `rgba(122, 79, 25, ${0.42 - i * 0.022})`
        ctx.lineWidth = 1.6 + (i % 2) * 1.1
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.bezierCurveTo(38, y - 11, 84, y + 9, 124, y - 3)
        ctx.stroke()
      }
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = `rgba(95, 61, 20, ${0.28 - i * 0.025})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(12 + i * 21, 116)
        ctx.quadraticCurveTo(40 + i * 13, 94 - i * 3, 78 + i * 9, 100)
        ctx.stroke()
      }
      ctx.fillStyle = 'rgba(248, 211, 126, 0.95)'
      for (const [sx, sy, r] of [[22, 78, 1.8], [44, 64, 1.2], [70, 72, 2], [94, 58, 1.4], [108, 84, 1.7], [34, 98, 1.2], [84, 100, 1.5]] as const) {
        ctx.beginPath()
        ctx.arc(sx, sy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-sandstorm', c)
    }
    if (!this.textures.exists('fx-flood')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 洪水：下半张卡片积水，水面有横向波纹与泡沫边
      const water = ctx.createLinearGradient(0, 60, 0, 128)
      water.addColorStop(0, 'rgba(82, 152, 206, 0)')
      water.addColorStop(0.42, 'rgba(74, 145, 202, 0.34)')
      water.addColorStop(1, 'rgba(47, 103, 158, 0.62)')
      ctx.fillStyle = water
      ctx.beginPath()
      ctx.moveTo(4, 78)
      ctx.bezierCurveTo(34, 66, 62, 88, 92, 74)
      ctx.bezierCurveTo(108, 68, 118, 74, 124, 70)
      ctx.lineTo(124, 124)
      ctx.lineTo(4, 124)
      ctx.closePath()
      ctx.fill()
      for (let i = 0; i < 7; i++) {
        const y = 82 + i * 6
        ctx.strokeStyle = `rgba(208, 238, 255, ${0.5 - i * 0.045})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(8 + (i % 3) * 9, y)
        ctx.bezierCurveTo(40, y - 4, 72, y + 4, 120 - (i % 2) * 12, y - 2)
        ctx.stroke()
      }
      // 水面碎泡沫
      ctx.fillStyle = 'rgba(236, 249, 255, 0.7)'
      for (const [fx, fy, r] of [[28, 88, 1.5], [56, 100, 1.2], [88, 92, 1.8], [108, 108, 1.2], [46, 114, 1.4]] as const) {
        ctx.beginPath()
        ctx.arc(fx, fy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-flood', c)
    }
    if (!this.textures.exists('fx-typhoon')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 台风：绕卡片中心的风圈 + 斜向雨丝，保留顶部地名区域
      ctx.lineCap = 'round'
      for (let i = 0; i < 4; i++) {
        const r = 27 + i * 10
        ctx.strokeStyle = `rgba(43, 84, 101, ${0.52 - i * 0.08})`
        ctx.lineWidth = 2.8 - i * 0.3
        ctx.beginPath()
        ctx.arc(64, 70, r, -0.6 + i * 0.5, 2.1 + i * 0.5)
        ctx.stroke()
        ctx.strokeStyle = `rgba(222, 248, 255, ${0.4 - i * 0.06})`
        ctx.lineWidth = 1.1
        ctx.beginPath()
        ctx.arc(64, 70, r - 1.4, -0.6 + i * 0.5, 2.1 + i * 0.5)
        ctx.stroke()
      }
      for (let i = 0; i < 13; i++) {
        const x = 16 + (i * 23) % 100
        const y = 40 + (i * 17) % 70
        ctx.strokeStyle = `rgba(36, 74, 92, ${0.26 + (i % 3) * 0.1})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(x + 8, y - 10)
        ctx.lineTo(x - 5, y + 13)
        ctx.stroke()
      }
      this.textures.addCanvas('fx-typhoon', c)
    }
    if (!this.textures.exists('fx-pollution')) {
      const c = document.createElement('canvas')
      c.width = size
      c.height = size
      const ctx = c.getContext('2d')!
      // 污染：底部暗色雾团 + 少量气泡
      for (const [cx, cy, r, a] of [
        [42, 102, 34, 0.32], [70, 112, 40, 0.28], [98, 104, 30, 0.3], [58, 90, 24, 0.2],
      ] as const) {
        const smog = ctx.createRadialGradient(cx, cy, 2, cx, cy, r)
        smog.addColorStop(0, `rgba(58, 50, 38, ${a})`)
        smog.addColorStop(1, 'rgba(58, 50, 38, 0)')
        ctx.fillStyle = smog
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = 'rgba(88, 74, 50, 0.5)'
      for (const [bx, by, r] of [[34, 84, 2], [58, 74, 1.4], [86, 82, 2.2], [104, 96, 1.5]] as const) {
        ctx.beginPath()
        ctx.arc(bx, by, r, 0, Math.PI * 2)
        ctx.fill()
      }
      this.textures.addCanvas('fx-pollution', c)
    }
    // 所有灾害贴图统一裁成圆形：洪水/沙尘不会在圆牌外露出方块边
    for (const key of ['fx-fire', 'fx-quake', 'fx-snow', 'fx-sandstorm', 'fx-flood', 'fx-typhoon', 'fx-pollution']) {
      if (!this.textures.exists(key)) continue
      const tex = this.textures.get(key)
      const src = tex.getSourceImage() as HTMLCanvasElement
      const g = src.getContext('2d') as CanvasRenderingContext2D | null
      if (!g) continue
      g.globalCompositeOperation = 'destination-in'
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(src.width / 2, src.height / 2, src.width / 2 - 2, 0, Math.PI * 2)
      g.fill()
      g.globalCompositeOperation = 'source-over'
      ;(tex as unknown as { refresh: () => void }).refresh()
    }
  }

  /** 当前格子应显示的灾害视觉；灾害发生后保留 2 回合。
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

  /** 棋盘底图：优先用程序化地形软底图 board-terrain.webp，再叠加 Canvas 山体/河流/道路/桥；
   *  素材不可用时回退旧羊皮纸图或程序化纸纹；最后统一叠加柔和晕影 */
  private makeParchmentTexture(): void {
    if (this.textures.exists('parchment')) return
    const { w, h } = BOARD
    // 后备分辨率跟随画布像素密度：1.0~1.5 倍，避免在低端机上生成 3456×2304 的巨型纹理
    const S = Math.max(1, Math.min(1.5, (this.scale.width / w) * 1.1))
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
    // ① 地形底图：新地图使用 board-terrain.webp（程序化生成），旧羊皮纸作为回退
    const terrain = this.textures.exists('board-terrain-img')
      ? this.textures.get('board-terrain-img').getSourceImage() as HTMLImageElement
      : null
    const parchment = this.textures.exists('board-parchment-img')
      ? this.textures.get('board-parchment-img').getSourceImage() as HTMLImageElement
      : null
    const img = terrain ?? parchment
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
    // ②.5 地形叠加：山脉/森林/沙漠/海岸/同一条河/商路/双桥（一次性烘焙进棋盘纹理）
    const mapStart = performance.now()
    paintBoardOverlay(ctx, W / w)
    if (import.meta.env.DEV) (window as any).__mapPaintMs = Math.round(performance.now() - mapStart)
    // ③ 边缘老化晕影（素材图与回退底统一叠加，烘焙柔和大暗角，无硬边暗线）
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72)
    vg.addColorStop(0, 'rgba(58,36,16,0)')
    vg.addColorStop(1, 'rgba(58,36,16,0.20)')
    ctx.fillStyle = vg
    ctx.fillRect(0, 0, W, H)
        // 一次性色彩调整（写入像素，避免每帧 CSS filter 或在 WebGL 上再做一次全屏合成）
    try {
      const img = ctx.getImageData(0, 0, W, H)
      const d = img.data
      // 参考图是低饱和的旧纸水彩；过高的饱和度会把海和树推成塑料色。
      const sat = 1.22
      const contrast = 1.08
      // 1.045 的 gamma 只压中间调，保留雪山高光和纸边，不会把画面压脏。
      const gamma = 1.045
      const grade = (v: number): number => {
        const x = Math.max(0, Math.min(255, (v - 128) * contrast + 128)) / 255
        return Math.pow(x, gamma) * 255
      }
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2]
        const lum = r * 0.2126 + g * 0.7152 + b * 0.0722
        d[i] = grade(lum + (r - lum) * sat)
        d[i + 1] = grade(lum + (g - lum) * sat)
        d[i + 2] = grade(lum + (b - lum) * sat)
      }
      ctx.putImageData(img, 0, 0)
    } catch {
      // 某些低端 WebView 不允许读回画布：保留原色，不影响功能
    }
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

  // ---------- 地块卡片 ----------


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
  private makeCardTexture(i: number, accent: number, w: number, h: number, ribbon: boolean): string {
    const key = `tile-card-${i}`
    if (this.textures.exists(key)) return key
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d')!
    const s = w / 100
    const r = Math.min(w, h) * 0.5
    const accentHex = `#${accent.toString(16).padStart(6, '0')}`

    // 羊皮纸底：中心略亮、边缘泛黄
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#fbf0d2')
    g.addColorStop(0.52, '#f2e0b2')
    g.addColorStop(1, '#e6cc93')
    ctx.fillStyle = g
    this.roundRectPath(ctx, 1.5 * s, 1.5 * s, w - 3 * s, h - 3 * s, r)
    ctx.fill()

    // 米花纸颗粒（少量、低对比）
    for (let k = 0; k < 210 * s; k++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const a = Math.random() * 0.045
      ctx.fillStyle = Math.random() < 0.5 ? `rgba(94,58,14,${a})` : `rgba(255,250,232,${a * 1.4})`
      ctx.fillRect(x, y, 1.2 * s, 1.2 * s)
    }
    // 微污渍
    for (let k = 0; k < 2; k++) {
      const x = Math.random() * w
      const y = Math.random() * h
      const rr = (6 + Math.random() * 8) * s
      const rg = ctx.createRadialGradient(x, y, 0, x, y, rr)
      rg.addColorStop(0, `rgba(116,72,18,${0.035 + Math.random() * 0.035})`)
      rg.addColorStop(1, 'rgba(116,72,18,0)')
      ctx.fillStyle = rg
      ctx.beginPath()
      ctx.arc(x, y, rr, 0, Math.PI * 2)
      ctx.fill()
    }

    // 图标区的柔光底：把地形色晕在卡片中部，让图案有归属色
    ctx.save()
    this.roundRectPath(ctx, 1.5 * s, 1.5 * s, w - 3 * s, h - 3 * s, r)
    ctx.clip()
    const wash = ctx.createRadialGradient(w / 2, h * 0.52, 0, w / 2, h * 0.52, w * 0.46)
    wash.addColorStop(0, `${accentHex}50`)
    wash.addColorStop(0.68, `${accentHex}28`)
    wash.addColorStop(1, `${accentHex}06`)
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, w, h)

    // 中央图标承托圆盘：让图案脱离羊皮纸底色，四大地形各有一块专属色盘
    const plateR = Math.min(w, h) * 0.335
    const pg = ctx.createRadialGradient(w * 0.47, h * 0.41, plateR * 0.10, w * 0.5, h * 0.52, plateR)
    pg.addColorStop(0, 'rgba(255, 253, 244, 0.96)')
    pg.addColorStop(0.58, 'rgba(255, 247, 224, 0.82)')
    pg.addColorStop(0.9, accentHex + '24')
    pg.addColorStop(1, accentHex + '10')
    ctx.fillStyle = pg
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.52, plateR, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = accentHex + 'd8'
    ctx.lineWidth = 2.8 * s
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 246, 218, 0.62)'
    ctx.lineWidth = 1.1 * s
    ctx.beginPath()
    ctx.arc(w * 0.5, h * 0.52, plateR - 4 * s, 0, Math.PI * 2)
    ctx.stroke()

    // 顶部地形色带：同色系明暗渐变 + 极淡织纹
    const band = Math.max(10 * s, h * 0.32)
    const ar = (accent >> 16) & 0xff
    const ag = (accent >> 8) & 0xff
    const ab = accent & 0xff
    const mix = (c: number, target: number, amt: number): number => Math.round(c + (target - c) * amt)
    const topRgb = `rgb(${mix(ar, 255, 0.26)}, ${mix(ag, 255, 0.26)}, ${mix(ab, 255, 0.24)})`
    const botRgb = `rgb(${mix(ar, 35, 0.42)}, ${mix(ag, 28, 0.42)}, ${mix(ab, 18, 0.40)})`
    const bg = ctx.createLinearGradient(0, 0, 0, band)
    bg.addColorStop(0, topRgb)
    bg.addColorStop(1, botRgb)
    ctx.save()
    this.roundRectPath(ctx, 1.5 * s, 1.5 * s, w - 3 * s, h - 3 * s, r)
    ctx.clip()
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, band)
    ctx.strokeStyle = 'rgba(255, 246, 220, 0.09)'
    ctx.lineWidth = 1
    for (let x = -h; x < w + h; x += 11 * s) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x + band, band)
      ctx.stroke()
    }
    ctx.restore()
    // 色带下缘：金线 + 暗影
    ctx.strokeStyle = 'rgba(246, 214, 140, 0.9)'
    ctx.lineWidth = 1.6 * s
    ctx.beginPath()
    ctx.moveTo(2 * s, band - 0.8 * s)
    ctx.lineTo(w - 2 * s, band - 0.8 * s)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(48, 30, 14, 0.5)'
    ctx.lineWidth = 1.2 * s
    ctx.beginPath()
    ctx.moveTo(2 * s, band + 0.9 * s)
    ctx.lineTo(w - 2 * s, band + 0.9 * s)
    ctx.stroke()

    // 价格小纸牌（常驻位置：世界 y=26；零价格地块不绘制）
    if (ribbon) {
      const ribbonW = 62 * s
      const ribbonH = 17 * s
      const ribbonY = (27 + 50) * (h / 100) - ribbonH / 2
      ctx.fillStyle = 'rgba(252, 242, 214, 0.92)'
      ctx.strokeStyle = 'rgba(122, 86, 44, 0.45)'
      ctx.lineWidth = 1.1 * s
      this.roundRectPath(ctx, w / 2 - ribbonW / 2, ribbonY, ribbonW, ribbonH, 4 * s)
      ctx.fill()
      ctx.stroke()
      // 纸牌两端的小圆钉
      ctx.fillStyle = 'rgba(160, 118, 58, 0.7)'
      ctx.beginPath()
      ctx.arc(w / 2 - ribbonW / 2 + 4 * s, ribbonY + ribbonH / 2, 1.6 * s, 0, Math.PI * 2)
      ctx.arc(w / 2 + ribbonW / 2 - 4 * s, ribbonY + ribbonH / 2, 1.6 * s, 0, Math.PI * 2)
      ctx.fill()
    }

    // 内侧磨损光
    const shine = ctx.createLinearGradient(0, h * 0.4, 0, h)
    shine.addColorStop(0, 'rgba(255, 250, 232, 0)')
    shine.addColorStop(1, 'rgba(255, 250, 232, 0.16)')
    ctx.fillStyle = shine
    ctx.fillRect(0, h * 0.4, w, h * 0.6)
    ctx.restore()

    // 地形色外圈：即使缩小成小圆牌，也能靠色环区分地形
    ctx.strokeStyle = accentHex
    ctx.lineWidth = 4.6 * s
    this.roundRectPath(ctx, 3.1 * s, 3.1 * s, w - 6.2 * s, h - 6.2 * s, r * 0.94)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255, 246, 218, 0.68)'
    ctx.lineWidth = 1.2 * s
    this.roundRectPath(ctx, 6.0 * s, 6.0 * s, w - 12 * s, h - 12 * s, r * 0.86)
    ctx.stroke()

    // 双墨线边框 + 四角小饰
    ctx.strokeStyle = 'rgba(58, 38, 20, 0.92)'
    ctx.lineWidth = 2.2 * s
    this.roundRectPath(ctx, 1.6 * s, 1.6 * s, w - 3.2 * s, h - 3.2 * s, r)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(74, 48, 24, 0.34)'
    ctx.lineWidth = 1 * s
    this.roundRectPath(ctx, 4 * s, 4 * s, w - 8 * s, h - 8 * s, r * 0.7)
    ctx.stroke()
    ctx.fillStyle = 'rgba(122, 86, 44, 0.55)'
    for (const [px, py] of [[7 * s, 7 * s], [w - 7 * s, 7 * s], [7 * s, h - 7 * s], [w - 7 * s, h - 7 * s]] as const) {
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(Math.PI / 4)
      ctx.fillRect(-1.8 * s, -1.8 * s, 3.6 * s, 3.6 * s)
      ctx.restore()
    }
    this.textures.addCanvas(key, c)
    return key
  }


  private makeIconTexture(name: string): string {
    return `icon-${name}`   // 纹理在 create() 阶段由 loadIconTextures 通过 Image→CanvasTexture 生成
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
    // 圆牌直径由地图统一给出：80px + 86px 步距，所有格子完整露出
    const size = TILE_SIZE
    const sizeH = TILE_SIZE
    // 卡片始终正向（不随路线旋转），保证文字可读
    const container = this.add.container(pos.x, pos.y).setDepth(10)

    // 灾害光环：在圆牌外圈呼吸发亮，先加到底层，避免盖住地名与价格
    const disasterAura = this.add.image(0, 0, 'disaster-aura')
      .setDisplaySize(size + 8, size + 8).setVisible(false)
    container.add(disasterAura)

    // 卡片体：每张独立生成的羊皮纸纹理（2x 高清；文字/图标为矢量/高清纹理，任何缩放都清晰）
    const color = tile.type === 'terrain' ? (TERRAIN_COLORS[tile.terrain] ?? 0xb09a70) : TILE_COLORS[tile.type]
    const cardKey = this.makeCardTexture(i, color, Math.round(size * 2), Math.round(sizeH * 2), tile.price > 0)
    const card = this.add.image(0, 0, cardKey).setDisplaySize(size, sizeH)
    container.add(card)

    // 色带上的地名（信息一眼可读）
    const label = this.add.text(0, -size * 0.315, this.tileLabel(tile), {
      fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif',
      fontSize: `${Math.round(size * 0.225)}px`, fontStyle: 'bold', color: '#fffaf0',
      stroke: '#2b190b', strokeThickness: 1.2,
    }).setOrigin(0.5).setResolution(2)
    container.add(label)

    // 彩色图案（与地形色带同色系；纹理 240×160）
    const icon = this.add.image(0, size * 0.035, this.makeIconTexture(tileArtName(tile)))
      .setDisplaySize(size * 0.66, size * 0.48)
    container.add(icon)

    // 价格（图标正下方，纸牌纹理上）
    const price = this.add.text(size * 0.045, size * 0.28, tile.price > 0 ? `￥${tile.price}` : '', {
      fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif',
      fontSize: `${Math.round(size * 0.175)}px`, color: '#241204', fontStyle: 'bold',
    }).setOrigin(0.5).setResolution(2)
    container.add(price)

    // 桥等级（价格右侧）
    const bridgeLevel = this.add.text(size * 0.32, size * 0.28, '', {
      fontFamily: 'Georgia, serif', fontSize: `${Math.round(size * 0.15)}px`, color: '#5a3508', fontStyle: 'bold',
    }).setOrigin(0.5).setResolution(2)
    container.add(bridgeLevel)
    const closedIcon = this.add.text(0, 0, '✕', {
      fontSize: `${Math.round(size * 0.30)}px`, color: '#2a1a0c', stroke: '#f5e6c8', strokeThickness: 4,
    }).setOrigin(0.5).setResolution(2).setVisible(false)
    container.add(closedIcon)

    // 灾害覆盖：圆角色罩（贴图 + 动态 tint，比矩形更贴合卡片圆角）
    const disasterOverlay = this.add.image(0, 0, 'tile-tint')
      .setDisplaySize(size - 6, sizeH - 6).setVisible(false)
    container.add(disasterOverlay)
    // 灾害外环：用颜色把整张圆牌圈出来，缩小后也能一眼看到“这块地出事了”
    const disasterRing = this.add.circle(0, 0, size / 2 + 0.5, 0xffffff, 0)
      .setStrokeStyle(4.2, 0xffffff, 0).setVisible(false)
    container.add(disasterRing)
    const disasterIcon = this.add.text(0, 0, '', {
      fontSize: `${Math.round(size * 0.27)}px`, color: '#ffffff', stroke: '#2a1a0c', strokeThickness: 4,
    }).setOrigin(0.5).setResolution(2).setVisible(false)
    container.add(disasterIcon)
    // 灾害类型/强度小徽标：深色底 + 白字，避免与羊皮纸底色混在一起
    const disasterBadge = this.add.text(size * 0.24, size * 0.17, '', {
      fontFamily: 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif', fontSize: `${Math.round(size * 0.18)}px`, fontStyle: 'bold',
      color: '#fffdf4', stroke: '#241306', strokeThickness: 1.8,
      backgroundColor: '#8a4a18', padding: { x: 3, y: 1 },
    }).setOrigin(0.5).setResolution(2).setVisible(false)
    container.add(disasterBadge)
    const seized = this.add.text(0, 0, '✖', {
      fontSize: `${Math.round(size * 0.38)}px`, color: '#7a1710', stroke: '#f8e8c8', strokeThickness: 4,
    }).setOrigin(0.5).setResolution(2).setVisible(false)
    container.add(seized)

    // 灾害视觉贴图（火苗/裂缝/积雪/沙尘/积水/风圈/污染雾，见 syncAll）
    const fx = this.add.image(0, 0, 'fx-fire').setDisplaySize(94, 94).setVisible(false)
    container.add(fx)

    // 所有者：外圈 + 左下火漆印。比原来的小圆点更远就能看清归属
    const ownerRing = this.add.circle(0, 0, size / 2 - 1.5, 0xffffff, 0)
      .setStrokeStyle(3, 0xffffff, 0.95).setVisible(false)
    container.add(ownerRing)
    const ownerSeal = this.add.circle(-size * 0.32, size * 0.29, size * 0.065, 0xffffff, 0)
      .setStrokeStyle(1.4, 0xf8e8c8, 1).setVisible(false)
    container.add(ownerSeal)
    // 徽标始终盖在灾害贴图之上，强度数字不会被火苗/水波遮住
    container.bringToTop(disasterBadge)

    // 建筑徽章（动态，见 syncAll）
    const buildingTexts: Phaser.GameObjects.GameObject[] = []

    // 悬停金边（不改变卡片布局，只在视觉上提亮）
    const glow = this.add.image(0, 0, 'tile-glow').setDisplaySize(size + 10, sizeH + 10)
      .setVisible(false).setAlpha(0)
    container.add(glow)

    // 点击交互（拖拽平移时不触发选中）
    const hit = this.add.rectangle(0, 0, size + 2, sizeH + 2, 0xffffff, 0.001)
    hit.setInteractive({ useHandCursor: true })
    hit.on('pointerover', () => glow.setVisible(true).setAlpha(0.95))
    hit.on('pointerout', () => glow.setVisible(false).setAlpha(0))
    hit.on('pointerup', () => {
      if (this.dragging) return
      this.core.emit('tile-click', i)
      playSfx('click')
    })
    container.add(hit)

    return {
      tile, container, card, glow, icon, ownerRing, ownerSeal, buildingTexts, buildingSig: '',
      disasterAura, disasterOverlay, disasterRing, disasterIcon, disasterBadge, bridgeLevel, closedIcon, price, seized,
      fx, fxTween: null, fxKind: null, disasterRingTween: null, disasterGlowTween: null,
    }
  }

  /** 建筑徽章纹理：类别底色 + 类别色轮廓 + 图标 + 等级圆点（受损版本带裂纹） */
  private makeBuildingTexture(type: string, level: number, damaged: boolean): string {
    const key = `bldg-${type}-${level}-${damaged ? 1 : 0}`
    if (this.textures.exists(key)) return key
    const def = BUILDING_DEFS[type]
    if (!def) return 'bldg-lumber-mill-1-0'
    const c = document.createElement('canvas')
    c.width = 72
    c.height = 72
    const ctx = c.getContext('2d')!
    drawBuildingBadge(ctx, type, def.category, level, damaged)
    this.textures.addCanvas(key, c)
    return key
  }


  // ---------- 棋子 ----------

  private buildPieces(): void {
    if (!this.textures.exists('piece-shadow')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false)
      g.fillStyle(0x000000, 0.5).fillEllipse(48, 24, 88, 40)
      g.generateTexture('piece-shadow', 96, 48)
      g.destroy()
    }
    if (!this.textures.exists('piece-halo')) {
      const S = 128
      const c = document.createElement('canvas')
      c.width = S
      c.height = S
      const ctx = c.getContext('2d')!
      const rg = ctx.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5)
      rg.addColorStop(0, 'rgba(255, 226, 150, 0)')
      rg.addColorStop(0.55, 'rgba(255, 226, 150, 0.10)')
      rg.addColorStop(0.76, 'rgba(255, 214, 112, 0.55)')
      rg.addColorStop(0.88, 'rgba(255, 230, 160, 0.28)')
      rg.addColorStop(1, 'rgba(255, 230, 160, 0)')
      ctx.fillStyle = rg
      ctx.fillRect(0, 0, S, S)
      ctx.strokeStyle = 'rgba(255, 238, 180, 0.75)'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(S / 2, S / 2, S * 0.38, 0, Math.PI * 2)
      ctx.stroke()
      this.textures.addCanvas('piece-halo', c)
    }
    this.core.state.players.forEach((p, i) => {
      this.pieces.push(new Piece(this, p, `piece-${i}-${p.shape}`))
    })
  }

  // ---------- 台风 ----------

  private buildTyphoon(): void {
    // 台风轨迹：画在地块卡片下方，避免遮住沿海卡片文字
    this.typhoonTrail = this.add.graphics().setDepth(9).setVisible(false)
    this.typhoonView = this.add.container(-500, -500).setDepth(80).setVisible(false)
    this.typhoonRing = this.add.circle(0, 0, 28).setStrokeStyle(2.5, 0xbdeff8, 0.5)
    this.typhoonImg = this.add.image(0, 0, 'typhoon-tex').setDisplaySize(56, 56)
    // 标签独立于台风容器，固定在最上层，避免在沿海卡片附近被遮挡
    this.typhoonLabel = this.add.text(0, 0, '', {
      fontFamily: 'KaiTi, STKaiti, SimSun, serif',
      fontSize: '14px', fontStyle: 'bold', color: '#f2fbff', stroke: '#1d3644', strokeThickness: 3,
      backgroundColor: 'rgba(18, 42, 54, 0.78)', padding: { x: 6, y: 2 },
    }).setOrigin(0.5).setResolution(2).setDepth(81).setVisible(false)
    this.typhoonView.add([this.typhoonRing, this.typhoonImg])
    this.predictionLine = this.add.graphics().setDepth(79).setVisible(false)
  }

  /** 把台风图标、风圈和标签放到同一个世界坐标（移动补间每帧调用） */
  private applyTyphoonPose(x: number, y: number, size: number): void {
    this.typhoonDisplaySize = size
    this.typhoonView.setPosition(x, y)
    this.typhoonImg?.setDisplaySize(size, size)
    this.typhoonRing?.setRadius(size * 0.58)
    const lx = Phaser.Math.Clamp(x, 100, BOARD.w - 100)
    const ly = Math.max(34, y - size / 2 - 15)
    this.typhoonLabel.setPosition(lx, ly)
  }

  /** 沿真实轨迹画一条渐隐的风暴尾迹：外层水汽、内层亮线、泡沫点和风羽 */
  private drawTyphoonTrail(t: TyphoonState): void {
    const g = this.typhoonTrail
    // 逻辑上每回合记录一个真实位置；渲染时按约 18px 细分成航迹，虚线/泡沫才不会变成一条长直线
    const pts: { x: number; y: number }[] = []
    for (let i = 1; i < t.path.length; i++) {
      const a = t.path[i - 1]
      const b = t.path[i]
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 18))
      for (let k = 0; k < steps; k++) {
        const f = k / steps
        pts.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f })
      }
    }
    if (t.path.length) pts.push(t.path[t.path.length - 1])
    if (pts.length < 2) {
      if (!this.typhoonFadingOut) {
        g.clear()
        g.setVisible(false)
      }
      return
    }
    g.clear().setVisible(true)
    if (!this.typhoonFadingOut) {
      g.setAlpha(t.fading ? 0.5 : t.onLand ? 0.55 : t.weakening ? 0.8 : 1)
    }
    const n = pts.length
    // ① 外层水汽：深色风暴带 + 浅色水汽，先压出对比再叠亮线
    for (let i = 1; i < n; i++) {
      const f = (i - 1) / Math.max(1, n - 2)
      const a = pts[i - 1]
      const b = pts[i]
      g.lineStyle(34 + 20 * f, 0x1c4b5a, 0.10 + 0.08 * f)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    for (let i = 1; i < n; i++) {
      const f = (i - 1) / Math.max(1, n - 2)
      const a = pts[i - 1]
      const b = pts[i]
      g.lineStyle(24 + 16 * f, 0x69c7d4, 0.10 + 0.10 * f)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    // ② 中层风暴带
    for (let i = 1; i < n; i++) {
      const f = (i - 1) / Math.max(1, n - 2)
      const a = pts[i - 1]
      const b = pts[i]
      g.lineStyle(9 + 6 * f, 0xb7f0f4, 0.18 + 0.2 * f)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    // ③ 内层亮线：做成断续的航迹，避免像一条铁路/边界线
    for (let i = 1; i < n; i++) {
      if (i % 2 === 0) continue
      const f = (i - 1) / Math.max(1, n - 2)
      const a = pts[i - 1]
      const b = pts[i]
      g.lineStyle(4.5 + 3.5 * f, 0xf2ffff, 0.55 + 0.36 * f)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
    // ④ 泡沫点 + 航迹节点：让轨迹在深色海面上也能被看见
    for (let i = 2; i < n; i += 3) {
      const f = (i - 1) / Math.max(1, n - 2)
      g.fillStyle(0xf2feff, 0.5 + 0.35 * f)
      g.fillCircle(pts[i].x, pts[i].y, 2.4 + 2.4 * f)
    }
    for (let i = 6; i < n - 1; i += 6) {
      const f = (i - 1) / Math.max(1, n - 2)
      g.lineStyle(1.6, 0xd8f7ff, 0.3 + 0.3 * f)
      g.strokeCircle(pts[i].x, pts[i].y, 6 + 5 * f)
    }
    // ⑤ 风羽：短斜线沿轨迹两侧展开，像被风撕开的水面
    for (let i = 5; i < n - 1; i += 5) {
      const f = (i - 1) / Math.max(1, n - 2)
      const a = pts[i - 1]
      const b = pts[i + 1]
      const ang = Math.atan2(b.y - a.y, b.x - a.x)
      const nx = Math.cos(ang + Math.PI / 2)
      const ny = Math.sin(ang + Math.PI / 2)
      const len = 8 + 8 * f
      g.lineStyle(1.8, 0xe4fbff, 0.32 + 0.3 * f)
      g.lineBetween(pts[i].x - nx * len, pts[i].y - ny * len, pts[i].x + nx * len, pts[i].y + ny * len)
    }
  }

  private updateTyphoonView(): void {
    const t = this.core.state.typhoon
    if (!t) {
      this.predictionLine.setVisible(false)
      this.fadeTyphoonOut()
      return
    }
    if (!this.typhoonImg || !this.typhoonRing) return

    // 上一股台风正在淡出时又生成了新台风：中止淡出，重新从新位置出现
    if (this.typhoonFadingOut) {
      this.cancelTyphoonFade()
      this.typhoonSpawned = false
    }
    this.typhoonView.setVisible(true).setAlpha(t.fading ? 0.55 : 1)
    this.typhoonLabel.setVisible(true).setAlpha(t.fading ? 0.65 : 1)

    let px: number, py: number
    if (t.onLand && t.landTile !== null) {
      px = LAYOUT[t.landTile].x
      py = LAYOUT[t.landTile].y
    } else {
      px = t.x
      py = t.y
    }
    // 5 级台风半径更大：把显示位置向画布内收，保证不会被画框裁掉
    const typhoonSize = [40, 52, 66, 82, 100, 120][t.strength] ?? 40
    const margin = typhoonSize / 2 + 6
    px = Phaser.Math.Clamp(px, margin, BOARD.w - margin)
    py = Phaser.Math.Clamp(py, margin, BOARD.h - margin)

    this.drawTyphoonTrail(t)
    const positionChanged = !this.typhoonSpawned ||
      Math.hypot(px - this.typhoonTargetX, py - this.typhoonTargetY) > 1
    const sizeChanged = Math.abs(typhoonSize - this.typhoonTargetSize) > 0.5

    if (!this.typhoonSpawned) {
      this.typhoonTargetX = px
      this.typhoonTargetY = py
      this.typhoonTargetSize = typhoonSize
      this.applyTyphoonPose(px, py, typhoonSize)
      this.typhoonSpawned = true
    } else if (positionChanged || sizeChanged) {
      this.animateTyphoonTo(px, py, typhoonSize)
    }

    const label = t.fading
      ? '热带低压 · 消散中'
      : t.strength === 0
        ? '热带扰动 0级'
        : `台风 ${t.strength}级${t.onLand ? ' · 登陆' : ''}${t.weakening ? ' · 减弱中' : ''}`
    this.typhoonLabel.setText(label)

    // 气象站预测路径：从当前真实位置指向未来约两回合的位置
    const hasStation = this.core.state.tiles.some(tile =>
      tile.owner !== null && this.core.state.players[tile.owner].alive &&
      tile.buildings.some(b => b.type === 'weather-station'),
    )
    if (hasStation && t.predictedX !== null && t.predictedY !== null && !t.onLand && !t.fading) {
      const tp = { x: t.predictedX, y: t.predictedY }
      const drawX = this.typhoonView.x
      const drawY = this.typhoonView.y
      this.predictionLine.setVisible(true)
      this.predictionLine.clear()
      this.predictionLine.lineStyle(4, 0xffe08a, 0.9)
      const dash = 11
      const dist = Phaser.Math.Distance.Between(drawX, drawY, tp.x, tp.y)
      const steps = Math.max(2, Math.floor(dist / dash))
      for (let i = 0; i < steps; i += 2) {
        const f0 = i / steps
        const f1 = Math.min(1, (i + 1) / steps)
        this.predictionLine.lineBetween(
          drawX + (tp.x - drawX) * f0, drawY + (tp.y - drawY) * f0,
          drawX + (tp.x - drawX) * f1, drawY + (tp.y - drawY) * f1,
        )
      }
      this.predictionLine.strokePath()
      const a = Math.atan2(tp.y - drawY, tp.x - drawX)
      this.predictionLine.fillStyle(0xffe08a, 0.95)
      this.predictionLine.fillCircle(tp.x, tp.y, 4)
      this.predictionLine.fillTriangle(
        tp.x + Math.cos(a) * 7, tp.y + Math.sin(a) * 7,
        tp.x + Math.cos(a + 2.6) * 17, tp.y + Math.sin(a + 2.6) * 17,
        tp.x + Math.cos(a - 2.6) * 17, tp.y + Math.sin(a - 2.6) * 17,
      )
    } else {
      this.predictionLine.setVisible(false)
    }
  }

  /** 位置/尺寸补间：从当前显示位置平滑滑向新航点，而不是每回合瞬移 */
  private animateTyphoonTo(px: number, py: number, size: number): void {
    const fromX = this.typhoonView.x
    const fromY = this.typhoonView.y
    const fromSize = this.typhoonDisplaySize
    const dist = Math.hypot(px - fromX, py - fromY)
    this.typhoonTargetX = px
    this.typhoonTargetY = py
    this.typhoonTargetSize = size
    this.typhoonMoveTween?.stop()
    const proxy = { k: 0 }
    this.typhoonMoveTween = this.tweens.add({
      targets: proxy,
      k: 1,
      duration: dist < 2 ? 380 : Phaser.Math.Clamp(dist * 8.5, 460, 1500),
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const k = proxy.k
        this.applyTyphoonPose(
          fromX + (px - fromX) * k,
          fromY + (py - fromY) * k,
          fromSize + (size - fromSize) * k,
        )
      },
      onComplete: () => {
        this.applyTyphoonPose(px, py, size)
        this.typhoonMoveTween = null
      },
    })
  }

  /** 台风消散：图标先淡出，海面尾迹再慢慢退去，避免整条路径突然消失 */
  private fadeTyphoonOut(): void {
    if (!this.typhoonSpawned || this.typhoonFadingOut) {
      if (!this.typhoonSpawned) {
        this.typhoonView.setVisible(false)
        this.typhoonLabel.setVisible(false)
        this.typhoonTrail.setVisible(false)
      }
      return
    }
    this.typhoonFadingOut = true
    this.typhoonMoveTween?.stop()
    this.typhoonMoveTween = null
    const fadeIcon = this.tweens.add({
      targets: [this.typhoonView, this.typhoonLabel],
      alpha: 0,
      duration: 650,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.typhoonFadingOut && !this.core.state.typhoon) {
          this.typhoonView.setVisible(false)
          this.typhoonLabel.setVisible(false)
        }
      },
    })
    const fadeTrail = this.tweens.add({
      targets: this.typhoonTrail,
      alpha: 0,
      duration: 1500,
      ease: 'Sine.easeIn',
      onComplete: () => {
        if (this.typhoonFadingOut && !this.core.state.typhoon) {
          this.typhoonTrail.clear().setVisible(false)
          this.typhoonSpawned = false
          this.typhoonFadingOut = false
          this.typhoonTargetX = Number.NaN
          this.typhoonTargetY = Number.NaN
          this.typhoonFadeTweens = []
        }
      },
    })
    this.typhoonFadeTweens = [fadeIcon, fadeTrail]
  }

  private cancelTyphoonFade(): void {
    for (const tw of this.typhoonFadeTweens) tw.stop()
    this.typhoonFadeTweens = []
    this.typhoonFadingOut = false
    this.typhoonView.setAlpha(1)
    this.typhoonLabel.setAlpha(1)
    this.typhoonTrail.setAlpha(1)
  }

  private buildSeasonFx(): void {
    if (this.seasonOverlay = this.add.rectangle(BOARD.w / 2, BOARD.h / 2, BOARD.w, BOARD.h, 16777215, 0).setDepth(90), !this.textures.exists("dot")) {
      const M = this.make.graphics({ x: 0, y: 0 }, false);
      M.fillStyle(16777215, 1).fillCircle(5, 5, 5), M.generateTexture("dot", 10, 10), M.destroy();
    }
    this.emitter = this.add.particles(0, 0, "dot", { lifespan: 6500, quantity: 0, frequency: 420, alpha: { start: 0.8, end: 0 }, scale: { start: 1, end: 0.6 }, emitting: false }).setDepth(91), this.applySeasonFx(this.core.state.season);
  }
  private applySeasonFx(M: Season): void {
    const A = SEASON_TINTS[M];
    this.seasonOverlay.setFillStyle(A.color, A.alpha), this.iceContainer && this.iceContainer.setVisible(M === "winter");
    const R = this.emitter;
    R.stop();
    const L = () => ({ type: "random", source: new Phaser.Geom.Rectangle(0, -20, BOARD.w, 1) });
    M === "spring" ? (R.setConfig({ tint: 16752331, speedY: { min: 16, max: 34 }, speedX: { min: -18, max: 18 }, lifespan: 6200, frequency: 500 }), R.setEmitZone(L() as any), R.start()) : M === "autumn" ? (R.setConfig({ tint: [15245344, 13660208, 11554848], speedY: { min: 22, max: 40 }, speedX: { min: -24, max: 24 }, lifespan: 6500, frequency: 420 }), R.setEmitZone(L() as any), R.start()) : M === "winter" ? (R.setConfig({ tint: 16777215, speedY: { min: 24, max: 46 }, speedX: { min: -14, max: 14 }, lifespan: 7e3, frequency: 200, scale: { start: 0.9, end: 0.5 } }), R.setEmitZone(L() as any), R.start()) : R.stop();
  }
  private setupCameraControls(): void {
    const M = this.cameras.main;
    M.setBounds(0, 0, BOARD.w, BOARD.h);
    let A: { x: number; y: number } | null = null
    let R = 0
    let L = 0
    let d: { d: number; midX: number; midY: number; zoom: number; sx: number; sy: number } | null = null
    const x = () => this.input.pointer1.isDown && this.input.pointer2.isDown, t = (a: any, v: any, o: any) => {
      const r = M.zoom, i = Phaser.Math.Clamp(r * a, this.baseZoom, this.baseZoom * 2.8);
      if (Math.abs(i - r) < 1e-3) return;
      const e = M.scrollX + v / r, n = M.scrollY + o / r;
      M.setZoom(i), M.setScroll(e - v / i, n - o / i);
    };
    this.input.on("wheel", (a: any, v: any, o: any, r: any) => {
      const i = this.input.activePointer;
      t(r > 0 ? 0.9 : 1.1, i.x, i.y);
    }), this.input.on("pointerdown", (a: any) => {
      this.dragging = false, x() ? (d = { d: Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y), midX: (this.input.pointer1.x + this.input.pointer2.x) / 2, midY: (this.input.pointer1.y + this.input.pointer2.y) / 2, zoom: M.zoom, sx: M.scrollX, sy: M.scrollY }, A = null) : (A = { x: a.x, y: a.y }, R = M.scrollX, L = M.scrollY);
    }), this.input.on("pointermove", (a: any) => {
      if (x()) {
        if (!d) return;
        const v = Phaser.Math.Distance.Between(this.input.pointer1.x, this.input.pointer1.y, this.input.pointer2.x, this.input.pointer2.y), o = (this.input.pointer1.x + this.input.pointer2.x) / 2, r = (this.input.pointer1.y + this.input.pointer2.y) / 2;
        if (v < 4) return;
        const i = Phaser.Math.Clamp(d.zoom * (v / d.d), this.baseZoom, this.baseZoom * 2.8), e = d.sx + d.midX / d.zoom, n = d.sy + d.midY / d.zoom;
        M.setZoom(i), M.setScroll(e - o / i, n - r / i);
        return;
      }
      if (a.isDown && A) {
        const v = a.x - A.x, o = a.y - A.y;
        !this.dragging && Math.hypot(v, o) > 5 && (this.dragging = true), this.dragging && M.setScroll(R - v, L - o);
      }
    }), this.input.on("pointerup", () => {
      d = null;
      const a = this.input.pointer1.isDown, v = this.input.pointer2.isDown;
      a && !v ? A = { x: this.input.pointer1.x, y: this.input.pointer1.y } : !a && v ? A = { x: this.input.pointer2.x, y: this.input.pointer2.y } : A = null, R = M.scrollX, L = M.scrollY;
    });
  }
  private registerCoreEvents(): void {
    const M = this.core;
    M.on("state-changed", () => this.syncAll()), M.on("bridge-bypass", (A: any) => this.playIceBypass(A)), M.on("piece-step", (A: any) => {
      const R = this.pieces[A.playerId];
      if (!R) return;
      // 踏冰动画进行中：忽略到达格的 piece-step，等折线动画自己落到对岸
      if (this.iceBypass.has(A.playerId)) {
        if (A.pos === this.iceBypass.get(A.playerId) || R.animating) return;
        this.iceBypass.delete(A.playerId);
      }
      const L = this.core.state.players.map((x: any, t: any) => ({ p: x, i: t })).filter(({ p: x }: any) => x.alive && x.pos === A.pos).findIndex(({ i: x }: any) => x === A.playerId), d = pieceOffsets(this.core.state.players.filter((x: any) => x.alive && x.pos === A.pos).length, Math.max(0, L));
      R.moveTo(A.pos, d.x, d.y), playSfx("move");
    }), M.on("float", (A: any) => {
      this.floatText(A.tile, A.text, A.color, A.offsetY);
    }), M.on("quake", (A: any) => {
      this.playQuake(A);
    }), M.on("season", (A: any) => this.applySeasonFx(A)), M.on("sfx", (A: any) => playSfx(A)), M.on("game-start", () => this.syncAll());
  }
  private floatText(M: number, A: string, R: string, L = -20): void {
    const d = LAYOUT[M], x = this.add.text(d.x, d.y + L, A, { fontFamily: "Microsoft YaHei, PingFang SC, sans-serif", fontSize: "26px", color: R, fontStyle: "bold", stroke: "#2a1a0c", strokeThickness: 4 }).setOrigin(0.5).setResolution(2).setDepth(95);
    this.tweens.add({ targets: x, y: x.y - 50, alpha: 0, duration: 1100, ease: "Cubic.easeOut", onComplete: () => x.destroy() });
  }

  /** 冬季踏冰绕桥：棋子沿桥头冰面折线滑到对岸，而不是瞬移 */
  private playIceBypass(A: { playerId: number; from: number; to: number; bridge: number }): void {
    const piece = this.pieces[A.playerId]
    if (!piece) return
    // 与 buildWinterIcePatches 的冰面位置保持一致：西桥在桥右侧，东桥在桥左侧
    const side = A.bridge < 36 ? 1 : -1
    const mid = { x: LAYOUT[A.bridge].x + 58 * side, y: LAYOUT[A.bridge].y }
    const targetSame = this.core.state.players.filter(p => p.alive && p.pos === A.to)
    const idx = Math.max(0, targetSame.findIndex(p => p.id === A.playerId))
    const off = pieceOffsets(targetSame.length, idx)
    const end = { x: LAYOUT[A.to].x + off.x, y: LAYOUT[A.to].y + off.y }

    this.iceBypass.set(A.playerId, A.to)
    // 冰面被打滑的高光：跟随棋子滑行短暂淡出
    const glow = this.add.ellipse(mid.x, mid.y + 4, 96, 44, 0xdff7ff, 0.38)
      .setDepth(31)
      .setStrokeStyle(2, 0xffffff, 0.7)
    this.tweens.add({
      targets: glow,
      alpha: 0,
      duration: 700,
      delay: 260,
      onComplete: () => glow.destroy(),
    })
    piece.moveAlong([mid, end], () => {
      this.iceBypass.delete(A.playerId)
    })
  }
  private playQuake(M: { affected: number[]; center: number; magnitude: number }): void {
    this.cameras.main.shake(650, 0.011 * M.magnitude);
    const A = this.add.rectangle(BOARD.w / 2, BOARD.h / 2, BOARD.w, BOARD.h, 16726570, 0.18).setDepth(96);
    this.tweens.add({ targets: A, alpha: 0, duration: 500, onComplete: () => A.destroy() });
    for (const R of M.affected) {
      const L = this.tileViews[R];
      if (!L) continue;
      const d = this.add.rectangle(0, 0, TILE_SIZE, TILE_SIZE, 16722458, 0.35).setDepth(20);
      L.container.add(d), this.tweens.add({ targets: d, alpha: 0, duration: 900, onComplete: () => d.destroy() }), L.icon.setY(L.icon.y + 2), this.tweens.add({ targets: L.icon, y: L.icon.y - 2, duration: 120 });
    }
  }
  /** 给灾害加一层会动的视觉：贴图运动 + 外环呼吸 + 外侧光环脉冲 */
  private startDisasterVisual(x: TileView, kind: DisasterKind): void {
    this.stopDisasterVisual(x)
    const style = DISASTER_STYLE[kind]
    x.fxKind = kind
    x.fx.setTexture(`fx-${kind}`).setVisible(true).setScale(FX_SCALE).setAlpha(1).setAngle(0).setPosition(0, 0)
    x.disasterAura.setTint(style.ring).setVisible(true).setAlpha(0.34).setScale(1)
    x.disasterRing.setStrokeStyle(4.2, style.ring, 1).setVisible(true).setAlpha(1)

    // 不同灾害有不同的“动法”：火苗跳动、沙尘横扫、洪水起伏、台风旋转、污染呼吸、地震抖动
    const base = FX_SCALE
    switch (kind) {
      case 'fire':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          scaleX: { from: base * 1.08, to: base * 0.94 },
          scaleY: { from: base * 1.14, to: base * 0.9 },
          alpha: { from: 1, to: 0.82 },
          duration: 240, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
        break
      case 'snow':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          y: { from: 0, to: -4 },
          alpha: { from: 1, to: 0.78 },
          duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
        break
      case 'sandstorm':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          x: { from: -4, to: 4 },
          alpha: { from: 1, to: 0.76 },
          duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
        break
      case 'flood':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          y: { from: 1.5, to: -2.5 },
          alpha: { from: 0.9, to: 1 },
          duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
        break
      case 'typhoon':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          angle: 360,
          duration: 5200, repeat: -1, ease: 'Linear',
        })
        break
      case 'pollution':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          scale: { from: base * 0.92, to: base * 1.08 },
          alpha: { from: 0.72, to: 1 },
          duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        })
        break
      case 'quake':
        x.fxTween = this.tweens.add({
          targets: x.fx,
          x: { from: -2.5, to: 2.5 },
          angle: { from: -2, to: 2 },
          duration: 70, yoyo: true, repeat: -1, repeatDelay: 950, ease: 'Sine.easeInOut',
        })
        break
    }

    x.disasterRingTween = this.tweens.add({
      targets: x.disasterRing,
      alpha: { from: 1, to: 0.42 },
      duration: 760, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
    x.disasterGlowTween = this.tweens.add({
      targets: x.disasterAura,
      alpha: { from: 0.16, to: 0.5 },
      scale: { from: 0.96, to: 1.05 },
      duration: 1050, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    })
  }

  private stopDisasterVisual(x: TileView): void {
    x.fxTween?.destroy()
    x.fxTween = null
    x.disasterRingTween?.destroy()
    x.disasterRingTween = null
    x.disasterGlowTween?.destroy()
    x.disasterGlowTween = null
    x.fxKind = null
    x.fx.setVisible(false).setScale(FX_SCALE).setAlpha(1).setAngle(0).setPosition(0, 0)
    x.disasterAura.setVisible(false).setAlpha(0).setScale(1)
    x.disasterRing.setVisible(false).setAlpha(1)
  }

  private syncAll(): void {
    const M = this.core.state;
    if (!(M != null && M.started)) return;
    for (const x of this.tileViews) {
      const t = M.tiles[x.tile.index];
      if (t.owner !== null) {
        const i = Phaser.Display.Color.HexStringToColor(PLAYER_COLORS[t.owner]).color;
        // 外圈比小圆点醒目：在缩小后的棋盘上也能直接看出这块地属于谁
        x.ownerRing.setVisible(true).setStrokeStyle(3, i, 0.95);
        x.ownerSeal.setVisible(true).setFillStyle(i, 1).setStrokeStyle(1.4, 0xf8e8c8, 1);
      } else {
        x.ownerRing.setVisible(false);
        x.ownerSeal.setVisible(false);
      }
      const a = t.buildings.map((i: any) => `${i.id}:${i.type}:${i.level}:${i.damaged ? 1 : 0}`).join("|");
      a !== x.buildingSig && (x.buildingSig = a, x.buildingTexts.forEach((i: any) => i.destroy()), x.buildingTexts = [], t.buildings.forEach((i: any, e: any) => {
        const n = BUILDING_DEFS[i.type];
        if (!n) return;
        const bs = TILE_SIZE * 0.13
        const l = t.buildings.length === 1 ? 0 : e === 0 ? -TILE_SIZE * 0.14 : TILE_SIZE * 0.14
        const h = this.add.image(l, TILE_SIZE * 0.43, this.makeBuildingTexture(i.type, i.level, !!i.damaged)).setDisplaySize(bs, bs);
        h.setInteractive({ useHandCursor: true }), h.on("pointerover", () => h.setDisplaySize(bs * 1.3, bs * 1.3)), h.on("pointerout", () => h.setDisplaySize(bs, bs)), h.on("pointerup", () => {
          this.dragging || (this.core.emit("building-click", { tile: t.index, buildingId: i.id }), playSfx("click"));
        }), x.container.add(h), x.buildingTexts.push(h);
        const u = this.add.text(0, -TILE_SIZE * 0.64, n.name + (i.level > 1 ? ` Lv${i.level}` : "") + (i.damaged ? "（受损待修）" : ""), { fontSize: "10px", color: "#2a1a0c", stroke: "#f5e6c8", strokeThickness: 3, fontFamily: "KaiTi, STKaiti, SimSun, serif", backgroundColor: "rgba(246, 231, 194, 0.92)", padding: { x: 3, y: 1 } }).setOrigin(0.5).setResolution(2).setVisible(false);
        h.on("pointerover", () => u.setVisible(true)), h.on("pointerout", () => u.setVisible(false)), x.container.add(u), x.buildingTexts.push(u);
      }));
      // 七类灾害都有独立贴图：火苗、裂缝、积雪、沙尘、积水、风圈、污染雾
      const v = this.activeFxKind(t.index)
      if (v) {
        const style = DISASTER_STYLE[v]
        if (x.fxKind !== v) this.startDisasterVisual(x, v)
        // 色罩稍微加重，配合大一圈的贴图/外环/光环，让受灾格远看也能发现
        const overlayAlpha = v === 'snow' ? 0.20
          : v === 'sandstorm' || v === 'flood' || v === 'typhoon' ? 0.30
            : v === 'pollution' ? 0.26 : 0.24
        x.disasterOverlay.setTint(style.color).setAlpha(overlayAlpha).setVisible(true)
        x.disasterIcon.setVisible(false)
        const intensity = t.disaster?.intensity ?? 1
        x.disasterBadge
          .setText(intensity > 1 ? `${style.icon}${intensity}` : style.icon)
          .setBackgroundColor(style.css)
          .setVisible(true)
      } else {
        this.stopDisasterVisual(x)
        x.disasterOverlay.setVisible(false)
        x.disasterIcon.setVisible(false)
        x.disasterBadge.setVisible(false).setBackgroundColor('#8a4a18')
      }
      // 路障只在没有灾害时显示
      if (this.core.state.roadblock === t.index && !v && !t.disaster) {
        x.disasterOverlay.setTint(0xff8c2a).setAlpha(0.42).setVisible(true)
        x.disasterRing.setStrokeStyle(3.6, 0xd96a12, 0.95).setVisible(true)
        x.disasterIcon.setText('\u{1F6A7}').setVisible(true)
        x.disasterBadge.setVisible(false)
      }
      if (t.type === 'bridge') {
        x.bridgeLevel.setText(t.bridgeLevel > 0 ? '\u2160'.repeat(t.bridgeLevel) : '')
        x.closedIcon.setVisible(t.bridgeClosed > 0)
      }
      x.seized.setVisible(t.seized && t.owner === null)
    }
    const A = /* @__PURE__ */ new Map();
    M.players.forEach((x: any, t: any) => {
      if (!x.alive) return;
      const a = A.get(x.pos) ?? [];
      a.push(t), A.set(x.pos, a);
    }), M.players.forEach((x: any, t: any) => {
      const a = this.pieces[t];
      if (!a || (a.setVisible(x.alive), a.setActive(x.alive && t === M.currentPlayer), !x.alive || a.animating)) return;
      const v = A.get(x.pos) ?? [t], o = pieceOffsets(v.length, v.indexOf(t));
      a.setPos(x.pos, o.x, o.y);
    }), this.updateTyphoonView();
  }

  override update(): void {
    // 台风素材缓慢逆时针自转
    // create() 为异步：首帧时 typhoonView 可能尚未创建，必须判空（否则每帧崩溃渲染循环）
    if (this.typhoonView?.visible && this.typhoonImg) {
      // 停用持续旋转：避免硬件性能较弱的机器为一个小图标每帧重绘（台风图标本身仍清晰显示）
    }
  }
}
