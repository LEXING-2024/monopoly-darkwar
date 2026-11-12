// ============ AI 全自动多局模拟：验证核心逻辑可完整运行至终局 ============
// 用法：npm run sim [局数]

import { Game } from '../src/core/game'
import type { AiDifficulty } from '../src/core/types'

const GAMES = Number(process.argv[2] ?? 100)
// 用法：npm run sim [局数] [难度 easy|normal|hard|hell] [--gate 最低中位回合] [--players N]
const DIFFICULTY = (process.argv[3] ?? 'normal') as AiDifficulty
const gateIdx = process.argv.indexOf('--gate')
const GATE_MIN = gateIdx >= 0 ? Number(process.argv[gateIdx + 1] ?? 0) : 0
const playersIdx = process.argv.indexOf('--players')
const FIXED_COUNT = playersIdx >= 0 ? Number(process.argv[playersIdx + 1] ?? 0) : 0

interface MoneyFlow {
  earned: number; spent: number; rentCollected: number; rentPaid: number
  resourceIncome: number; startBonus: number; bankIn: number; bankOut: number
  tileSpent: number; buildSpent: number
}

async function runOne(seed: number, count: number): Promise<{
  turns: number; winner: number; error: string | null; bankrupt: number;
  endReason: 'last-standing' | 'monopoly' | 'timeout' | null;
  alive: number; playerCount: number; firstBankrupt: number | null; flow: MoneyFlow | null
}> {
  const game = new Game()
  game.muted = true
  const names = ['阿尔法', '贝塔', '伽马', '德尔塔', '艾普西隆', '泽塔', '伊塔', '西塔']
  const players = names.slice(0, count).map(name => ({ name, isAI: true }))
  try {
    await game.start(players, { speedMs: 0, seed, aiDifficulty: DIFFICULTY })
    const s = game.state
    const flow = { earned: 0, spent: 0, rentCollected: 0, rentPaid: 0, resourceIncome: 0, startBonus: 0, bankIn: 0, bankOut: 0, tileSpent: 0, buildSpent: 0 }
    for (const p of s.players) {
      flow.earned += p.stats.earned
      flow.spent += p.stats.spent
      flow.rentCollected += p.stats.rentCollected
      flow.rentPaid += p.stats.rentPaid
      flow.resourceIncome += p.stats.resourceIncome
      flow.startBonus += p.stats.startBonus
      flow.bankIn += p.stats.bankIn
      flow.bankOut += p.stats.bankOut
      flow.tileSpent += p.stats.tileSpent
      flow.buildSpent += p.stats.buildSpent
    }
    return {
      turns: s.turn, winner: s.winner ?? -1, error: null,
      bankrupt: s.bankruptOrder.length,
      endReason: s.endReason ?? null,
      alive: s.players.filter(p => p.alive).length,
      playerCount: s.players.length,
      firstBankrupt: s.firstBankruptTurn,
      flow,
    }
  } catch (e) {
    return {
      turns: game.state?.turn ?? 0, winner: -2, error: String(e),
      bankrupt: game.state?.bankruptOrder.length ?? 0, endReason: null,
      alive: game.state?.players.filter(p => p.alive).length ?? 0,
      playerCount: game.state?.players.length ?? count,
      firstBankrupt: game.state?.firstBankruptTurn ?? null, flow: null,
    }
  }
}

async function main() {
  const t0 = Date.now()
  let ok = 0
  let failed = 0
  let monopolyWins = 0
  let timeouts = 0
  let lastStandingWins = 0
  const turnCounts: number[] = []
  const firstBankrupts: number[] = []
  const winners = new Map<string, number>()
  const bankruptDist = new Map<number, number>()
  // 按人数分组的终局质量（4/8 人局节奏差异很大，必须分开看）
  const byCount = new Map<number, {
    turns: number[]; lastStanding: number; monopoly: number; timeout: number; aliveAtTimeout: number[]
  }>()
  // 金钱流向汇总（跨全部对局累计）
  const money = {
    earned: 0, spent: 0,
    rentCollected: 0, rentPaid: 0,
    resourceIncome: 0, startBonus: 0, bankIn: 0, bankOut: 0,
    tileSpent: 0, buildSpent: 0,
  }
  console.log(`开始模拟 ${GAMES} 局（4/8 AI 交替，无延迟，难度 ${DIFFICULTY}）...`)

  const CONCURRENCY = 8
  let next = 0
  const timeout = setTimeout(() => {
    console.error(`\n⏰ 卡住超过 180s（卡在第 ${next + 1} 局附近）`)
    process.exit(2)
  }, 180000)

  async function worker() {
    while (next < GAMES) {
      const i = next++
      const count = FIXED_COUNT > 0 ? FIXED_COUNT : (i % 2 === 0 ? 4 : 8)
      const r = await runOne(i * 7919 + 13, count)
      if (r.error) {
        failed++
        console.log(`局 ${i + 1}: ❌ 异常 → ${r.error}`)
      } else {
        ok++
        turnCounts.push(r.turns)
        if (r.endReason === 'monopoly') monopolyWins++
        else if (r.endReason === 'timeout') timeouts++
        else if (r.endReason === 'last-standing') lastStandingWins++
        let bc = byCount.get(r.playerCount)
        if (!bc) {
          bc = { turns: [], lastStanding: 0, monopoly: 0, timeout: 0, aliveAtTimeout: [] }
          byCount.set(r.playerCount, bc)
        }
        bc.turns.push(r.turns)
        if (r.endReason === 'last-standing') bc.lastStanding++
        else if (r.endReason === 'monopoly') bc.monopoly++
        else if (r.endReason === 'timeout') { bc.timeout++; bc.aliveAtTimeout.push(r.alive) }
        if (r.firstBankrupt !== null) firstBankrupts.push(r.firstBankrupt)
        winners.set(String(r.winner), (winners.get(String(r.winner)) ?? 0) + 1)
        bankruptDist.set(r.bankrupt, (bankruptDist.get(r.bankrupt) ?? 0) + 1)
        // 金钱流向汇总
        if (r.flow) {
          for (const k of Object.keys(money) as (keyof typeof money)[]) {
            money[k] += r.flow[k]
          }
        }
        if ((i + 1) % 10 === 0) console.log(`  已完成 ${i + 1}/${GAMES}…`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  clearTimeout(timeout)

  const avg = turnCounts.reduce((a, b) => a + b, 0) / Math.max(1, turnCounts.length)
  const sorted = [...turnCounts].sort((a, b) => a - b)
  const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
  // 用 reduce 替代 Math.min(...arr) 防止大数组栈溢出（GAMES 上万时安全）
  const minTurns = turnCounts.reduce((a, b) => Math.min(a, b), Infinity)
  const maxTurns = turnCounts.reduce((a, b) => Math.max(a, b), -Infinity)
  console.log(`\n完成：${ok}/${GAMES} 局正常结束，${failed} 局异常`)
  console.log(`平均回合数：${avg.toFixed(0)}（最少 ${minTurns}，最多 ${maxTurns}），中位数 ${pct(0.5).toFixed(0)}（P25 ${pct(0.25).toFixed(0)} / P75 ${pct(0.75).toFixed(0)}）`)
  if (firstBankrupts.length) {
    const fb = [...firstBankrupts].sort((a, b) => a - b)
    const fbAvg = firstBankrupts.reduce((a, b) => a + b, 0) / firstBankrupts.length
    const fbp = (p: number) => fb[Math.min(fb.length - 1, Math.floor(fb.length * p))]
    const early = firstBankrupts.filter(t => t <= 100).length
    console.log(`最早破产回合：最少 ${fb[0]} / 中位 ${fbp(0.5).toFixed(0)} / 平均 ${fbAvg.toFixed(0)}；其中 ≤100 回合就有人破产 ${early} 局（${(early / firstBankrupts.length * 100).toFixed(1)}%）`)
  } else {
    console.log('最早破产回合：无（所有对局无人破产）')
  }
  console.log(`终局原因：淘汰至最后一人 ${lastStandingWins} 局 · 垄断判决 ${monopolyWins} 局（${(monopolyWins / Math.max(1, ok) * 100).toFixed(1)}%）· 行动上限 ${timeouts} 局（${(timeouts / Math.max(1, ok) * 100).toFixed(1)}%）`)
  for (const [n, bc] of [...byCount.entries()].sort((a, b) => a[0] - b[0])) {
    const ts = [...bc.turns].sort((a, b) => a - b)
    const med = ts[Math.min(ts.length - 1, Math.floor(ts.length * 0.5))]
    const avgAlive = bc.aliveAtTimeout.length
      ? (bc.aliveAtTimeout.reduce((a, b) => a + b, 0) / bc.aliveAtTimeout.length).toFixed(1)
      : '—'
    console.log(`  ${n} 人局：中位 ${med} · 淘汰 ${bc.lastStanding} / 垄断 ${bc.monopoly} / 超时 ${bc.timeout}（超时平均仍存活 ${avgAlive} 人）`)
  }
  console.log(`胜者分布：${[...winners.entries()].map(([k, v]) => `${k} 号 ${v} 局`).join('，')}`)
  console.log(`破产人数分布：${[...bankruptDist.entries()].map(([k, v]) => `${k} 人破产 ${v} 局`).join('，')}`)
  // 金钱流向构成（全部对局累计）
  const m = money
  const totalIn = m.rentCollected + m.resourceIncome + m.startBonus + m.bankIn
  const otherOut = Math.max(0, m.spent - m.rentPaid - m.tileSpent - m.buildSpent)
  const share = (v: number, base: number) => (base > 0 ? (v / base * 100).toFixed(1) : '0')
  console.log('\n═══ 金钱流向构成（累计） ═══')
  console.log(`收入来源：租金 ${share(m.rentCollected, totalIn)}% · 卖资源 ${share(m.resourceIncome, totalIn)}% · 起点奖励 ${share(m.startBonus, totalIn)}% · 银行其他(卡牌/奖金/补贴) ${share(m.bankIn, totalIn)}%`)
  console.log(`支出去向：租金 ${share(m.rentPaid, m.spent)}% · 买地 ${share(m.tileSpent, m.spent)}% · 建造维护 ${share(m.buildSpent, m.spent)}% · 其他(罚款/游说/卡牌/赌场) ${share(otherOut, m.spent)}%`)
  console.log(`银行净投放：${(m.bankIn - m.bankOut).toLocaleString()}（发放 ${m.bankIn.toLocaleString()} - 回收 ${m.bankOut.toLocaleString()}；正=经济扩张，负=收缩）`)
  console.log(`租金占玩家间流通：${share(m.rentCollected, m.spent)}% 的支出流向其他玩家`)
  console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  // 回合数闸门（中位数抗长尾噪声）：对局整体过短 = 节奏失衡，判定不通过（供 CI/提交前强制检查）
  if (GATE_MIN > 0 && ok > 0 && pct(0.5) < GATE_MIN) {
    console.error(`\n❌ 闸门不通过：中位回合数 ${pct(0.5).toFixed(0)} < 要求 ${GATE_MIN}，对局结束过快，请检查 AI/经济机制改动`)
    process.exit(3)
  }
  process.exit(failed > 0 || ok === 0 ? 1 : 0)
}

void main()
