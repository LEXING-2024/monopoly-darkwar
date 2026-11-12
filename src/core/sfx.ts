// ============ WebAudio 合成音效（无外部音频资源） ============
// 主题：烛光木桌 / 羊皮纸沙盘 / 黄铜与木质棋子。
// 音色以「木质 + 钟琴 + 柔和噪声」为主，避免裸方波/锯齿的锐利感；
// 通过主增益 → 轻微饱和 → 高架衰减 → 压缩器 → 混响，让多音叠加时仍然柔和。

import type { SfxName } from './types'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let reverb: ConvolverNode | null = null
let noiseBuffer: AudioBuffer | null = null
let muted = false
let volume = 0.7
const lastPlayed = new Map<SfxName, number>()

/** 高频动作冷却（ms）：避免连续走格/连点按钮时叠成噪音墙 */
const COOLDOWN: Partial<Record<SfxName, number>> = {
  click: 45,
  tick: 26,
  move: 50,
  coin: 38,
  rent: 80,
  dice: 320,
  report: 140,
  build: 70,
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

export function setMuted(m: boolean): void {
  muted = m
  applyMaster()
}

export function setVolume(v: number): void {
  volume = clamp01(v)
  applyMaster()
}

export function getVolume(): number {
  return volume
}

function applyMaster(): void {
  if (!ctx || !master) return
  // 短时间渐变，避免静音/调音量时出现爆音
  master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03)
}

/** 轻柔的软削波，给合成音一点“磁带/木箱”暖度，而不是纯数字味 */
function softClipCurve(drive = 1.15): Float32Array<ArrayBuffer> {
  const n = 2048
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT))
  const norm = Math.tanh(drive)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(drive * x) / norm
  }
  return curve
}

/** 生成柔和衰减的混响脉冲，给木牌/钟琴一点空间感 */
function makeImpulse(c: AudioContext, seconds = 2.0, decay = 2.4): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch)
    for (let i = 0; i < len; i++) {
      const t = i / len
      // 前 15% 保留一点早期反射，尾部平滑衰减
      const early = i < len * 0.15 ? 0.35 : 0.18
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * early
    }
  }
  return buf
}

function makeNoise(c: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.max(1, Math.floor(c.sampleRate * seconds))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()

      master = ctx.createGain()
      master.gain.value = muted ? 0 : volume

      // 主链：轻微饱和 → 高频衰减 → 低通 → 温和压缩
      const shaper = ctx.createWaveShaper()
      shaper.curve = softClipCurve(1.15)
      shaper.oversample = '2x'
      const shelf = ctx.createBiquadFilter()
      shelf.type = 'highshelf'
      shelf.frequency.value = 4200
      shelf.gain.value = -2.5
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 10500
      lowpass.Q.value = 0.35
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -22
      comp.knee.value = 30
      comp.ratio.value = 3
      comp.attack.value = 0.012
      comp.release.value = 0.35
      master.connect(shaper)
      shaper.connect(shelf)
      shelf.connect(lowpass)
      lowpass.connect(comp)
      comp.connect(ctx.destination)

      reverb = ctx.createConvolver()
      reverb.buffer = makeImpulse(ctx, 2.0, 2.4)
      reverb.connect(master)
      noiseBuffer = makeNoise(ctx, 2)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 把一条声音接到主总线：可选声像 + 混响发送量 */
function output(c: AudioContext, node: AudioNode, pan = 0, wet = 0): void {
  if (!master) return
  let out: AudioNode = node
  if (pan !== 0) {
    try {
      const p = c.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p)
      out = p
    } catch {
      // 极老浏览器没有 StereoPanner：直接走单声道
    }
  }
  out.connect(master)
  if (wet > 0 && reverb) {
    const send = c.createGain()
    send.gain.value = wet
    out.connect(send)
    send.connect(reverb)
  }
}

interface ToneOpts {
  type?: OscillatorType
  vol?: number
  delay?: number
  slideTo?: number
  attack?: number
  pan?: number
  wet?: number
  filter?: number
}

function tone(freq: number, dur: number, opts: ToneOpts = {}): void {
  const c = ensure()
  if (!c || !master) return
  const t0 = c.currentTime + (opts.delay ?? 0)
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(Math.max(20, freq), t0)
  if (opts.slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur)
  }
  const peak = Math.max(0.0002, opts.vol ?? 0.08)
  const attack = Math.min(dur * 0.4, opts.attack ?? 0.012)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(peak, t0 + attack)
  // 到 dur 时收尾到接近 0，再停振荡器：避免尾音被硬切造成咔哒
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)

  let node: AudioNode = osc
  if (opts.filter) {
    const f = c.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = opts.filter
    f.Q.value = 0.6
    osc.connect(f)
    node = f
  }
  node.connect(gain)
  output(c, gain, opts.pan ?? 0, opts.wet ?? 0)
  osc.start(t0)
  osc.stop(t0 + dur + 0.12)
}

interface NoiseOpts {
  vol?: number
  delay?: number
  filter?: number
  type?: BiquadFilterType
  q?: number
  attack?: number
  pan?: number
  wet?: number
  rate?: number
}

function noise(dur: number, opts: NoiseOpts = {}): void {
  const c = ensure()
  if (!c || !master || !noiseBuffer) return
  const t0 = c.currentTime + (opts.delay ?? 0)
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  src.playbackRate.value = opts.rate ?? 1
  const filter = c.createBiquadFilter()
  filter.type = opts.type ?? 'lowpass'
  filter.frequency.value = opts.filter ?? 2600
  filter.Q.value = opts.q ?? 0.55
  const gain = c.createGain()
  const peak = Math.max(0.0002, opts.vol ?? 0.06)
  const attack = Math.max(0.001, Math.min(dur * 0.5, opts.attack ?? 0.025))
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.linearRampToValueAtTime(peak, t0 + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter).connect(gain)
  output(c, gain, opts.pan ?? 0, opts.wet ?? 0)
  const offset = Math.random() * Math.max(0, (noiseBuffer.duration - dur - 0.02))
  src.start(t0, offset, dur + 0.02)
}

/** 钟琴/铜铃：基频 + 少量泛音，柔和、有空间感 */
function bell(freq: number, dur: number, vol = 0.08, delay = 0, wet = 0.25, pan = 0): void {
  tone(freq, dur, { type: 'sine', vol, delay, wet, pan, attack: 0.006 })
  tone(freq * 2.01, dur * 0.68, { type: 'sine', vol: vol * 0.34, delay: delay + 0.004, wet: wet * 0.8, pan })
  tone(freq * 3.01, dur * 0.42, { type: 'sine', vol: vol * 0.14, delay: delay + 0.008, wet: wet * 0.6, pan })
}

/** 木琴/马林巴：比纯 sine 更有“木质颗粒”，但不过亮 */
function mallet(freq: number, dur: number, vol = 0.08, delay = 0, wet = 0.14, pan = 0): void {
  tone(freq, dur, { type: 'sine', vol, delay, wet, pan, attack: 0.004, filter: 2600 })
  tone(freq * 2.01, dur * 0.38, { type: 'sine', vol: vol * 0.22, delay: delay + 0.003, wet: wet * 0.6, pan })
  noise(0.025, { vol: vol * 0.16, delay, filter: 1800, wet: wet * 0.4 })
}

/** 木块/桌面敲击：低频主体 + 柔和噪声 */
function wood(freq = 170, dur = 0.09, vol = 0.1, delay = 0, wet = 0.1, pan = 0): void {
  tone(freq, dur, { type: 'triangle', vol, delay, slideTo: freq * 0.74, wet, pan, filter: 1800 })
  noise(dur * 0.55, { vol: vol * 0.3, delay, filter: 1000, wet: wet * 0.5 })
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min)

export function playSfx(name: SfxName): void {
  if (muted || volume <= 0) return
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const gap = COOLDOWN[name] ?? 0
  if (gap > 0 && now - (lastPlayed.get(name) ?? 0) < gap) return
  lastPlayed.set(name, now)
  if (!ensure()) return

  switch (name) {
    case 'click':
      // 纸牌/木牌轻触：比旧版更闷一点
      noise(0.04, { vol: 0.022, filter: 1900, type: 'bandpass', q: 0.7, wet: 0.06 })
      tone(300, 0.045, { type: 'triangle', vol: 0.02, slideTo: 230, filter: 1400 })
      break
    case 'tick':
      noise(0.016, { vol: 0.018, filter: 3600, type: 'highpass' })
      tone(880, 0.025, { type: 'sine', vol: 0.012 })
      break
    case 'ding':
      bell(1046.5, 0.9, 0.09, 0, 0.32)
      break
    case 'coin':
      mallet(988, 0.14, 0.055, 0, 0.16)
      bell(1318.5, 0.3, 0.04, 0.06, 0.22, 0.08)
      break
    case 'move': {
      // 木质棋子轻放：随机音高，连续走格时像一串不重复的木珠
      const base = 165 + Math.random() * 40
      wood(base, 0.075, 0.065, 0, 0.08, rand(-0.12, 0.12))
      tone(base * 1.92, 0.05, { type: 'sine', vol: 0.015, wet: 0.05 })
      break
    }
    case 'card':
      // 羊皮纸抽牌：先纸声，再一声很轻的钟
      noise(0.22, { vol: 0.035, filter: 1500, type: 'bandpass', q: 0.45, wet: 0.1, attack: 0.04 })
      bell(587.3, 0.3, 0.028, 0.04, 0.2)
      break
    case 'build':
      wood(140, 0.11, 0.09, 0, 0.1)
      wood(112, 0.16, 0.07, 0.085, 0.12)
      break
    case 'disaster':
      // 远处闷雷 + 低沉气团，不用刺耳锯齿
      tone(92, 1.0, { type: 'sine', vol: 0.055, slideTo: 48, filter: 420, wet: 0.28 })
      noise(0.8, { vol: 0.04, filter: 520, wet: 0.2 })
      break
    case 'quake':
      tone(54, 1.4, { type: 'sine', vol: 0.12, slideTo: 32, wet: 0.32 })
      noise(1.2, { vol: 0.065, filter: 300, wet: 0.3 })
      noise(0.4, { vol: 0.03, filter: 1100, delay: 0.2, wet: 0.2 })
      break
    case 'thunder':
      noise(1.0, { vol: 0.08, filter: 620, wet: 0.32 })
      tone(64, 0.8, { type: 'sine', vol: 0.045, delay: 0.1, slideTo: 42, filter: 380, wet: 0.28 })
      break
    case 'fire':
      // 柴火噼啪：少量、闷、带气声，不炸耳
      for (let i = 0; i < 5; i++) {
        noise(rand(0.04, 0.08), {
          vol: rand(0.018, 0.032),
          delay: i * 0.09 + rand(0, 0.03),
          filter: rand(1100, 2400),
          type: 'bandpass',
          q: 0.55,
          wet: 0.12,
        })
      }
      noise(0.55, { vol: 0.02, filter: 520, wet: 0.15 })
      break
    case 'rent':
      // 钱袋变轻：柔和的木琴下行
      mallet(1174.7, 0.11, 0.045, 0, 0.14)
      mallet(880, 0.14, 0.04, 0.075, 0.16)
      mallet(698.5, 0.2, 0.035, 0.15, 0.18)
      break
    case 'gavel':
      wood(160, 0.075, 0.1, 0, 0.16)
      wood(128, 0.14, 0.06, 0.09, 0.2)
      break
    case 'dice':
      // 骰子落在木桌上：低 Q 的软碰撞
      for (let i = 0; i < 7; i++) {
        noise(0.03, {
          vol: rand(0.014, 0.028),
          delay: i * 0.06 + rand(0, 0.02),
          filter: rand(1600, 3200),
          type: 'bandpass',
          q: 0.7,
          wet: 0.1,
        })
      }
      tone(180, 0.06, { type: 'sine', vol: 0.02, wet: 0.08 })
      break
    case 'wind':
      noise(1.1, { vol: 0.05, filter: 620, type: 'bandpass', q: 0.45, wet: 0.3, attack: 0.12 })
      tone(190, 0.95, { type: 'sine', vol: 0.022, slideTo: 110, wet: 0.28 })
      break
    case 'snow':
      noise(0.8, { vol: 0.028, filter: 2800, type: 'highpass', wet: 0.3, attack: 0.08 })
      bell(1568, 0.85, 0.024, 0.03, 0.38)
      break
    case 'sand':
      for (let i = 0; i < 7; i++) {
        noise(0.07, {
          vol: rand(0.014, 0.03),
          delay: i * 0.09 + rand(0, 0.025),
          filter: rand(700, 1500),
          type: 'bandpass',
          q: 0.6,
          wet: 0.1,
        })
      }
      noise(0.5, { vol: 0.022, filter: 480, wet: 0.14 })
      break
    case 'flood':
      noise(1.0, { vol: 0.06, filter: 480, wet: 0.24, attack: 0.08 })
      tone(76, 0.85, { type: 'sine', vol: 0.04, delay: 0.08, slideTo: 50, wet: 0.22 })
      break
    case 'season':
      // 季节更替：温暖的四音木琴/钟琴，留长混响
      [880, 1108.7, 1318.5, 1760].forEach((f, i) => mallet(f, 0.5, 0.045, i * 0.15, 0.3))
      break
    case 'report':
      // 木槌盖章 + 一声低铃，而不是刺耳哨声
      wood(150, 0.09, 0.08, 0, 0.14)
      bell(783.99, 0.28, 0.03, 0.06, 0.2)
      break
    case 'chain':
      wood(118, 0.16, 0.09, 0, 0.2)
      wood(88, 0.22, 0.06, 0.18, 0.24)
      break
    case 'dig':
      noise(0.06, { vol: 0.045, filter: 2200, type: 'bandpass', q: 0.8, wet: 0.08 })
      tone(250, 0.07, { type: 'triangle', vol: 0.022, slideTo: 210, filter: 1600 })
      break
    case 'win':
      // 大调琶音 + 低音铺底，温暖收尾
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => bell(f, 0.6 + i * 0.08, 0.05, i * 0.17, 0.34))
      tone(130.8, 1.2, { type: 'sine', vol: 0.03, wet: 0.3 })
      break
    case 'lose':
      // 柔和小调下行，避免失败时更烦躁
      tone(392, 0.3, { type: 'triangle', vol: 0.045, wet: 0.28 })
      tone(329.6, 0.36, { type: 'triangle', vol: 0.04, delay: 0.22, wet: 0.28 })
      tone(261.6, 0.7, { type: 'triangle', vol: 0.038, delay: 0.48, slideTo: 196, wet: 0.32 })
      break
  }
}

// 浏览器自动播放策略：首次手势时创建/恢复 AudioContext；切回前台时也恢复。
if (typeof document !== 'undefined') {
  const unlock = (): void => {
    const c = ensure()
    if (c && c.state === 'suspended') void c.resume()
  }
  document.addEventListener('pointerdown', unlock, { passive: true })
  document.addEventListener('keydown', unlock)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlock()
  })
}
