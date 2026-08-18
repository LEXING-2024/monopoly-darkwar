// ============ WebAudio 合成音效（无外部音频资源） ============

import type { SfxName } from './types'

let ctx: AudioContext | null = null
let muted = false

export function setMuted(m: boolean): void {
  muted = m
}

function ac(): AudioContext | null {
  if (muted) return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      ctx = new AC()
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12,
  delay = 0, slideTo?: number,
): void {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

function noise(dur: number, vol = 0.15, delay = 0, lowpass = 6000): void {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + delay
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
  const src = c.createBufferSource()
  src.buffer = buffer
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = lowpass
  const gain = c.createGain()
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(gain).connect(c.destination)
  src.start(t0)
}

// 音频解锁：浏览器自动播放策略/切后台会挂起 AudioContext，导致个别音效无声；
// 回到页面或任意点击时恢复，避免「音效丢失」
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', () => { if (ctx && ctx.state === 'suspended') void ctx.resume() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') void ctx.resume()
  })
}

export function playSfx(name: SfxName): void {
  if (muted) return
  switch (name) {
    case 'click':
      noise(0.05, 0.1, 0, 2500)
      break
    case 'tick':
      tone(900, 0.04, 'square', 0.05)
      break
    case 'ding':
      tone(1250, 0.5, 'sine', 0.14)
      tone(1875, 0.35, 'sine', 0.07, 0.03)
      break
    case 'coin':
      tone(880, 0.09, 'square', 0.08)
      tone(1320, 0.18, 'square', 0.08, 0.09)
      break
    case 'move':
      // 落子声：短促木敲 + 上滑音（每步随机微调音高，连续多步时每一步都清晰可辨）
      noise(0.045, 0.1, 0, 1100)
      tone(170 + Math.floor(Math.random() * 4) * 15, 0.09, 'sine', 0.16, 0, 120)
      break
    case 'card':
      noise(0.12, 0.1, 0, 3200)
      tone(520, 0.1, 'triangle', 0.06, 0.04)
      break
    case 'build':
      tone(220, 0.08, 'square', 0.12)
      tone(180, 0.1, 'square', 0.12, 0.14)
      break
    case 'disaster':
      tone(120, 0.6, 'sawtooth', 0.1, 0, 60)
      noise(0.5, 0.06, 0.05, 800)
      break
    case 'quake':
      tone(70, 0.9, 'sawtooth', 0.16, 0, 40)
      noise(0.9, 0.14, 0, 500)
      break
    case 'thunder':
      noise(0.9, 0.18, 0, 700)
      tone(90, 0.7, 'sawtooth', 0.08, 0.05, 50)
      break
    case 'fire':
      for (let i = 0; i < 6; i++) noise(0.05, 0.06, i * 0.07, 4000)
      break
    case 'rent':
      // 钱袋变轻：金币叮当声下行
      tone(1320, 0.08, 'square', 0.07)
      tone(880, 0.12, 'square', 0.06, 0.08)
      break
    case 'gavel':
      // 拍卖落锤：短促木槌敲击
      tone(150, 0.07, 'square', 0.16)
      tone(120, 0.08, 'square', 0.12, 0.12)
      break
    case 'dice':
      // 骰子滚动：细碎碰撞
      for (let i = 0; i < 8; i++) noise(0.03, 0.06, i * 0.06, 5000)
      break
    case 'wind':
      // 风声：低频呼啸（台风移动）
      noise(0.8, 0.1, 0, 1100)
      tone(220, 0.7, 'sine', 0.04, 0.1, 120)
      break
    case 'snow':
      // 雪灾：高冷风鸣
      noise(0.7, 0.07, 0, 3200)
      tone(1560, 0.6, 'sine', 0.05, 0.05, 1100)
      break
    case 'sand':
      // 沙尘暴：沙粒摩擦
      for (let i = 0; i < 7; i++) noise(0.08, 0.06, i * 0.1, 900)
      break
    case 'flood':
      // 洪水：低沉水流涌动
      noise(0.8, 0.11, 0, 500)
      tone(90, 0.7, 'sine', 0.07, 0.1, 55)
      break
    case 'dilemma':
      // 囚徒困境：悬疑双音
      tone(330, 0.3, 'triangle', 0.08)
      tone(466, 0.3, 'triangle', 0.08, 0.18)
      break
    case 'season':
      // 季节更替：钟琴三音
      tone(880, 0.3, 'sine', 0.09)
      tone(1108, 0.3, 'sine', 0.09, 0.16)
      tone(1318, 0.45, 'sine', 0.09, 0.32)
      break
    case 'report':
      // 举报：短促哨声
      tone(1560, 0.09, 'square', 0.07)
      tone(1560, 0.09, 'square', 0.07, 0.16)
      break
    case 'chain':
      // 事件链触发：鼓点两击
      tone(140, 0.12, 'square', 0.13)
      tone(110, 0.16, 'square', 0.12, 0.18)
      break
    case 'dig':
      // 勘探：凿石
      noise(0.06, 0.1, 0, 3500)
      tone(280, 0.07, 'square', 0.08, 0.03)
      break
    case 'win':
      tone(523, 0.15, 'square', 0.1)
      tone(659, 0.15, 'square', 0.1, 0.14)
      tone(784, 0.3, 'square', 0.1, 0.28)
      break
    case 'lose':
      tone(392, 0.2, 'sawtooth', 0.09)
      tone(311, 0.2, 'sawtooth', 0.09, 0.18)
      tone(262, 0.4, 'sawtooth', 0.09, 0.36)
      break
  }
}
