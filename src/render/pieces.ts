// ============ 玩家棋子（微缩模型质感，弹跳移动） ============

import Phaser from 'phaser'
import { LAYOUT } from '../core/map'
import type { Player } from '../core/types'

function makeShapeTexture(scene: Phaser.Scene, key: string, shape: Player['shape'], color: number): void {
  if (scene.textures.exists(key)) return
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const T = 96   // 纹理边长（显示尺寸 48，2x 高清）
  const c = T / 2
  const R = 42   // 形状外接半径
  const P = (pts: Phaser.Types.Math.Vector2Like[]): void => {
    g.fillStyle(color, 1)
    g.fillPoints(pts, true)
    // 形状自身轮廓的白线描边（深色细边衬底让白线在羊皮纸上显形）
    g.lineStyle(9, 0x3a2410, 0.6).strokePoints(pts, true)
    g.lineStyle(4.5, 0xffffff, 1).strokePoints(pts, true)
  }
  switch (shape) {
    case 'circle': {
      g.fillStyle(color, 1).fillCircle(c, c, R)
      g.lineStyle(9, 0x3a2410, 0.6).strokeCircle(c, c, R)
      g.lineStyle(4.5, 0xffffff, 1).strokeCircle(c, c, R)
      break
    }
    case 'square': {
      g.fillStyle(color, 1).fillRoundedRect(c - R, c - R, R * 2, R * 2, 16)
      g.lineStyle(9, 0x3a2410, 0.6).strokeRoundedRect(c - R, c - R, R * 2, R * 2, 16)
      g.lineStyle(4.5, 0xffffff, 1).strokeRoundedRect(c - R, c - R, R * 2, R * 2, 16)
      break
    }
    case 'triangle': {
      const x1 = c, y1 = c - R + 8, x2 = c - R + 8, y2 = c + R - 6, x3 = c + R - 6, y3 = c + R - 6
      g.fillStyle(color, 1)
      g.fillTriangle(x1, y1, x2, y2, x3, y3)
      g.lineStyle(9, 0x3a2410, 0.6).strokeTriangle(x1, y1, x2, y2, x3, y3)
      g.lineStyle(4.5, 0xffffff, 1).strokeTriangle(x1, y1, x2, y2, x3, y3)
      break
    }
    case 'diamond':
      P([
        { x: c, y: c - R + 6 }, { x: c + R - 6, y: c },
        { x: c, y: c + R - 6 }, { x: c - R + 6, y: c },
      ])
      break
    case 'star': {
      const pts: Phaser.Types.Math.Vector2Like[] = []
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? R : R * 0.45
        const a = -Math.PI / 2 + (k * Math.PI) / 5
        pts.push({ x: c + Math.cos(a) * r, y: c + Math.sin(a) * r })
      }
      P(pts)
      break
    }
    case 'hexagon': {
      const pts: Phaser.Types.Math.Vector2Like[] = []
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 3
        pts.push({ x: c + Math.cos(a) * R, y: c + Math.sin(a) * R })
      }
      P(pts)
      break
    }
    case 'plus': {
      const w = R * 0.36
      P([
        { x: c - w, y: c - R }, { x: c + w, y: c - R }, { x: c + w, y: c - w }, { x: c + R, y: c - w },
        { x: c + R, y: c + w }, { x: c + w, y: c + w }, { x: c + w, y: c + R }, { x: c - w, y: c + R },
        { x: c - w, y: c + w }, { x: c - R, y: c + w }, { x: c - R, y: c - w }, { x: c - w, y: c - w },
      ])
      break
    }
    case 'heart': {
      const pts: Phaser.Types.Math.Vector2Like[] = []
      for (let k = 0; k <= 26; k++) {
        const t = (k / 26) * Math.PI * 2
        const x = 16 * Math.pow(Math.sin(t), 3)
        const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
        pts.push({ x: c + (x * R) / 16, y: c - (y * R) / 16 })
      }
      P(pts)
      break
    }
  }
  // 光泽
  g.fillStyle(0xffffff, 0.35).fillCircle(c - 9, c - 11, 11)
  g.generateTexture(key, T, T)
  g.destroy()
}

export class Piece {
  readonly container: Phaser.GameObjects.Container
  readonly player: Player
  animating = false
  private body: Phaser.GameObjects.Image
  private shadow: Phaser.GameObjects.Image
  private bobTween: Phaser.Tweens.Tween | null = null

  constructor(scene: Phaser.Scene, player: Player, key: string) {
    this.player = player
    const color = Phaser.Display.Color.HexStringToColor(player.color).color
    makeShapeTexture(scene, key, player.shape, color)
    const pos = LAYOUT[player.pos]

    this.shadow = scene.add.image(pos.x, pos.y + 7, 'piece-shadow').setScale(0.5).setAlpha(0.35)
    this.body = scene.add.image(pos.x, pos.y, key).setOrigin(0.5, 0.62).setScale(0.5)
    this.container = scene.add.container(0, 0, [this.shadow, this.body]).setDepth(50)
    this.startBob()
  }

  private startBob(): void {
    // 以当前 y 为基准重建轻微浮动（振幅 4.5px）
    this.bobTween?.destroy()
    this.bobTween = this.body.scene.tweens.add({
      targets: this.body,
      y: this.body.y - 4.5,
      duration: 560,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  setPos(tileIndex: number, offsetX = 0, offsetY = 0): void {
    const p = LAYOUT[tileIndex]
    this.body.setPosition(p.x + offsetX, p.y + offsetY)
    this.shadow.setPosition(p.x + offsetX, p.y + 7)
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

    // 单段抛物线小跳：x 缓动、y 按正弦拱起 15px，一段完成不再分段衔接（更流畅）
    scene.tweens.add({
      targets: this.body,
      x: tx,
      duration: dur,
      ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const t = tw.progress   // 0~1
        this.body.y = sy + (ty - sy) * t - Math.sin(Math.PI * t) * 15
      },
      onComplete: () => {
        this.body.setPosition(tx, ty)
        this.animating = false
        this.startBob()   // 以当前落点为基准重建浮动
        onDone?.()
      },
    })
    // 影子：与棋子同步移动，始终贴地（无拱起），移动全程同步不脱节
    scene.tweens.add({
      targets: this.shadow,
      x: tx, y: groundY,
      duration: dur,
      ease: 'Sine.easeInOut',
      onComplete: () => this.shadow.setPosition(tx, groundY),
    })
  }

  setVisible(v: boolean): void {
    this.container.setVisible(v)
  }

  destroy(): void {
    this.bobTween?.destroy()
    this.container.destroy(true)
  }
}

export function pieceOffsets(count: number, index: number): { x: number; y: number } {
  if (count === 1) return { x: 0, y: 0 }
  const offsets = [
    { x: -12, y: -10 }, { x: 12, y: -10 }, { x: -12, y: 10 }, { x: 12, y: 10 },
  ]
  return offsets[index % offsets.length]
}
