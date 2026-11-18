// ============ 玩家棋子（微缩模型质感，弹跳移动） ============

import Phaser from 'phaser'
import { LAYOUT } from '../core/map'
import type { Player } from '../core/types'

/** 把颜色与白/黑混合，得到明暗面 */
function shade(hex: string, amount: number): string {
  const c = Phaser.Display.Color.HexStringToColor(hex)
  const t = amount > 0 ? 255 : 0
  const k = Math.abs(amount)
  const r = Math.round(c.red + (t - c.red) * k)
  const g = Math.round(c.green + (t - c.green) * k)
  const b = Math.round(c.blue + (t - c.blue) * k)
  return `rgb(${r}, ${g}, ${b})`
}

function shapePath(
  ctx: CanvasRenderingContext2D, shape: Player['shape'], c: number, R: number,
): void {
  const path = (): void => { ctx.beginPath() }
  switch (shape) {
    case 'circle':
      path()
      ctx.arc(c, c, R, 0, Math.PI * 2)
      ctx.closePath()
      break
    case 'square':
      path()
      ctx.roundRect(c - R, c - R, R * 2, R * 2, R * 0.32)
      break
    case 'triangle':
      path()
      ctx.moveTo(c, c - R + 6)
      ctx.lineTo(c - R + 6, c + R - 6)
      ctx.lineTo(c + R - 6, c + R - 6)
      ctx.closePath()
      break
    case 'diamond':
      path()
      ctx.moveTo(c, c - R + 5)
      ctx.lineTo(c + R - 5, c)
      ctx.lineTo(c, c + R - 5)
      ctx.lineTo(c - R + 5, c)
      ctx.closePath()
      break
    case 'star': {
      path()
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? R : R * 0.46
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        const x = c + Math.cos(a) * r
        const y = c + Math.sin(a) * r
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      break
    }
    case 'hexagon':
      path()
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 3
        const x = c + Math.cos(a) * R
        const y = c + Math.sin(a) * R
        if (k === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      break
    case 'plus': {
      const w = R * 0.34
      path()
      ctx.moveTo(c - w, c - R)
      ctx.lineTo(c + w, c - R)
      ctx.lineTo(c + w, c - w)
      ctx.lineTo(c + R, c - w)
      ctx.lineTo(c + R, c + w)
      ctx.lineTo(c + w, c + w)
      ctx.lineTo(c + w, c + R)
      ctx.lineTo(c - w, c + R)
      ctx.lineTo(c - w, c + w)
      ctx.lineTo(c - R, c + w)
      ctx.lineTo(c - R, c - w)
      ctx.lineTo(c - w, c - w)
      ctx.closePath()
      break
    }
    case 'heart': {
      path()
      for (let k = 0; k <= 30; k++) {
        const t = (k / 30) * Math.PI * 2
        const x = 16 * Math.pow(Math.sin(t), 3)
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
        const px = c + (x * R) / 16
        const py = c - (y * R) / 16 - 2
        if (k === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      break
    }
  }
}

/** 棋子纹理：垂直渐变 + 内阴影 + 高光 + 墨线/奶油双描边（2x 高清） */
function makeShapeTexture(scene: Phaser.Scene, key: string, shape: Player['shape'], hexColor: string): void {
  if (scene.textures.exists(key)) return
  const T = 96
  const c = document.createElement('canvas')
  c.width = T
  c.height = T
  const ctx = c.getContext('2d')!
  const cx = T / 2
  const cy = T / 2
  const R = 41

  // 底部投影
  ctx.fillStyle = 'rgba(50, 30, 10, 0.20)'
  ctx.beginPath()
  ctx.ellipse(cx, cy + 6, R * 0.92, R * 0.92, 0, 0, Math.PI * 2)
  ctx.fill()

  // 主体渐变
  const g = ctx.createLinearGradient(0, cy - R, 0, cy + R)
  g.addColorStop(0, shade(hexColor, 0.34))
  g.addColorStop(0.48, hexColor)
  g.addColorStop(1, shade(hexColor, -0.36))
  shapePath(ctx, shape, cx, cy)
  ctx.fillStyle = g
  ctx.fill()

  // 内侧明暗 + 高光
  ctx.save()
  shapePath(ctx, shape, cx, cy)
  ctx.clip()
  const inner = ctx.createLinearGradient(0, cy - R * 0.2, 0, cy + R)
  inner.addColorStop(0, 'rgba(255, 255, 255, 0.06)')
  inner.addColorStop(1, 'rgba(30, 12, 0, 0.42)')
  ctx.fillStyle = inner
  ctx.fillRect(0, 0, T, T)
  const gloss = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.42, 1, cx - R * 0.34, cy - R * 0.42, R * 0.72)
  gloss.addColorStop(0, 'rgba(255, 255, 255, 0.55)')
  gloss.addColorStop(1, 'rgba(255, 255, 255, 0)')
  ctx.fillStyle = gloss
  ctx.fillRect(0, 0, T, T)
  ctx.restore()

  // 双描边：深墨外圈 + 奶油内线
  shapePath(ctx, shape, cx, cy)
  ctx.lineWidth = 6.5
  ctx.strokeStyle = 'rgba(48, 28, 10, 0.72)'
  ctx.stroke()
  shapePath(ctx, shape, cx, cy)
  ctx.lineWidth = 2.4
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.92)'
  ctx.stroke()

  // 中心小徽记（玩家首字）
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 27px KaiTi, STKaiti, SimSun, serif'
  ctx.lineWidth = 3.5
  ctx.strokeStyle = 'rgba(40, 20, 6, 0.75)'
  ctx.fillStyle = 'rgba(255, 248, 226, 0.94)'

  scene.textures.addCanvas(key, c)
}

export class Piece {
  readonly container: Phaser.GameObjects.Container
  readonly player: Player
  animating = false
  private body: Phaser.GameObjects.Image
  private shadow: Phaser.GameObjects.Image
  private halo: Phaser.GameObjects.Image
  private bobTween: Phaser.Tweens.Tween | null = null
  private bobState = { v: 0 }
  private baseY = 0
  private haloTween: Phaser.Tweens.Tween | null = null
  private active = false

  constructor(scene: Phaser.Scene, player: Player, key: string) {
    this.player = player
    makeShapeTexture(scene, key, player.shape, player.color)
    const pos = LAYOUT[player.pos]
    this.baseY = pos.y

    this.shadow = scene.add.image(pos.x, pos.y + 7, 'piece-shadow').setScale(0.5).setAlpha(0.4)
    this.halo = scene.add.image(pos.x, pos.y, 'piece-halo').setScale(0.56).setAlpha(0)
    this.body = scene.add.image(pos.x, pos.y, key).setOrigin(0.5, 0.62).setScale(0.5)
    this.container = scene.add.container(0, 0, [this.halo, this.shadow, this.body]).setDepth(50)
    this.startBob()
  }

  private startBob(): void {
    if (this.bobTween) {
      this.bobTween.resume()
      return
    }
    // 常驻浮动：只创建一次，位置变化时改基准 y，避免每次 state-changed 重建 tween
    this.bobTween = this.body.scene.tweens.add({
      targets: this.bobState,
      v: { from: 0, to: -4.5 },
      duration: 560,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        if (!this.animating) this.body.y = this.baseY + this.bobState.v
      },
    })
  }

  /** 当前行动者：脚下金色光环缓慢呼吸 */
  setActive(on: boolean): void {
    if (this.active === on) return
    this.active = on
    this.haloTween?.destroy()
    this.haloTween = null
    if (on) {
      this.halo.setVisible(true)
      this.haloTween = this.halo.scene.tweens.add({
        targets: this.halo,
        alpha: { from: 0.30, to: 0.72 },
        scaleX: { from: 0.56, to: 0.64 },
        scaleY: { from: 0.56, to: 0.64 },
        duration: 1100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    } else {
      this.halo.setAlpha(0).setVisible(false)
    }
  }

  setPos(tileIndex: number, offsetX = 0, offsetY = 0): void {
    const p = LAYOUT[tileIndex]
    this.baseY = p.y + offsetY
    this.body.setPosition(p.x + offsetX, this.baseY + this.bobState.v)
    this.shadow.setPosition(p.x + offsetX, p.y + 7)
    this.halo.setPosition(p.x + offsetX, p.y + 2)
    this.startBob()
  }

  moveTo(tileIndex: number, offsetX = 0, offsetY = 0, onDone?: () => void): void {
    this.animating = true
    this.bobTween?.pause()   // 移动期间暂停待机浮动，避免互相拉扯
    const p = LAYOUT[tileIndex]
    const sx = this.body.x
    const sy = this.body.y
    const tx = p.x + offsetX
    const ty = p.y + offsetY
    const groundY = p.y + 7
    const scene = this.body.scene
    const dur = 170

    // 单段抛物线小跳：x 缓动、y 按正弦拱起 15px
    scene.tweens.add({
      targets: this.body,
      x: tx,
      duration: dur,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const t = tw.progress
        this.body.y = sy + (ty - sy) * t - Math.sin(Math.PI * t) * 15
      },
      onComplete: () => {
        this.body.setPosition(tx, ty)
        this.baseY = ty
        this.animating = false
        this.bobState.v = 0
        this.bobTween?.restart()
        // 落地轻微压扁
        this.body.setScale(0.5, 0.42)
        scene.tweens.add({ targets: this.body, scaleX: 0.5, scaleY: 0.5, duration: 140, ease: 'Back.easeOut' })
        onDone?.()
      },
    })
    // 影子 / 光环与棋子同步平移（两者都必须同时补间 x 与 y：
    // 光环此前只补间 x，y 停在起点，导致纵向坐标不跟随棋子——横向正常、纵向掉队）
    scene.tweens.add({
      targets: this.shadow, x: tx, y: groundY, duration: dur, ease: 'Sine.easeInOut',
    })
    scene.tweens.add({
      targets: this.halo, x: tx, y: p.y + 2, duration: dur, ease: 'Sine.easeInOut',
    })
  }

  /** 沿折线滑行（冬季踏冰绕桥）：从当前位置出发，依次经过 points，终点带偏移坐标 */
  moveAlong(points: { x: number; y: number }[], onDone?: () => void): void {
    if (!points.length) return
    this.animating = true
    this.bobTween?.pause()
    const scene = this.body.scene
    const start = new Phaser.Math.Vector2(this.body.x, this.body.y)
    const curve = new Phaser.Curves.Spline([
      start,
      ...points.map(p => new Phaser.Math.Vector2(p.x, p.y)),
    ])
    const end = points[points.length - 1]
    const proxy = { t: 0 }
    scene.tweens.add({
      targets: proxy,
      t: 1,
      duration: 340,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const p = curve.getPoint(proxy.t)
        this.body.setPosition(p.x, p.y - Math.sin(Math.PI * proxy.t) * 16)
        this.shadow.setPosition(p.x, p.y + 7)
        this.halo.setPosition(p.x, p.y + 2)
      },
      onComplete: () => {
        this.body.setPosition(end.x, end.y)
        this.baseY = end.y
        this.animating = false
        this.bobState.v = 0
        this.bobTween?.restart()
        this.body.setScale(0.5, 0.42)
        scene.tweens.add({ targets: this.body, scaleX: 0.5, scaleY: 0.5, duration: 140, ease: 'Back.easeOut' })
        onDone?.()
      },
    })
  }

  setVisible(v: boolean): void {
    this.container.setVisible(v)
  }

  destroy(): void {
    this.bobTween?.destroy()
    this.haloTween?.destroy()
    this.container.destroy(true)
  }
}

export function pieceOffsets(count: number, index: number): { x: number; y: number } {
  if (count === 1) return { x: 0, y: 0 }
  // ≤4 人沿用经典四宫格；5~8 人扩展到外圈八位，避免多名玩家在同一格完全重叠
  if (count <= 4) {
    const offsets = [
      { x: -12, y: -10 }, { x: 12, y: -10 }, { x: -12, y: 10 }, { x: 12, y: 10 },
    ]
    return offsets[index % offsets.length]
  }
  const ring = [
    { x: 0, y: -15 }, { x: 15, y: -9 }, { x: 16, y: 7 }, { x: 7, y: 15 },
    { x: -7, y: 15 }, { x: -16, y: 7 }, { x: -15, y: -9 }, { x: 0, y: 0 },
  ]
  return ring[index % ring.length]
}
