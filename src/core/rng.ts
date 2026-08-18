// 可注入的随机数生成器（mulberry32），支持固定种子复现

export class RNG {
  private s: number

  constructor(seed?: number) {
    this.s = seed ?? ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0)
  }

  /** 从内部状态恢复（AI 大脑私有随机源随存档保存状态） */
  static fromState(state: number): RNG {
    const r = new RNG(0)
    r.s = state >>> 0
    return r
  }

  /** 当前内部状态（保存用） */
  getState(): number {
    return this.s
  }

  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0
    let t = this.s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max) 均匀浮点 */
  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  /** [min, max] 均匀整数 */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1))
  }

  /** 以 p 概率返回 true */
  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]
  }

  /** 按权重抽取下标 */
  weighted(weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0)
    let r = this.next() * total
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i]
      if (r < 0) return i
    }
    return weights.length - 1
  }

  shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
}
