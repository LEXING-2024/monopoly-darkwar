// ============ 全难度回合数闸门：四个难度各跑 N 局，中位回合数不得低于各自地板 ============
// 用法：npm run sim:gate [每难度局数，默认 100]
// 地板 = 各难度实测中位数 × 0.7（随 AI 调优更新），只拦截恶性回退，不把长度当硬指标——
// 难度越高博弈越精彩，对局稍短或更长都属正常。

import { execSync } from 'node:child_process'

const GAMES = process.argv[2] ?? '500'
// 2026-11 恢复原版节奏后最近实测中位：easy 276 / normal 291 / hard 309 / hell 308。
// 地板按实测中位留出安全余量，只拦截恶性回退（对局被压得过短），不把长度当硬指标。
const FLOORS: Record<string, number> = {
  easy: 250,
  normal: 255,
  hard: 245,
  hell: 240,
}

let failed = false
for (const [difficulty, floor] of Object.entries(FLOORS)) {
  console.log(`\n======== 难度 ${difficulty}（中位地板 ${floor}） ========`)
  try {
    execSync(`npx tsx scripts/simulate.ts ${GAMES} ${difficulty} --gate ${floor}`, { stdio: 'inherit' })
  } catch (e: any) {
    if (e?.status === 3) {
      failed = true   // 闸门不通过：继续跑其余难度
    } else {
      process.exit(e?.status ?? 1)
    }
  }
}
console.log(failed ? '\n❌ 闸门判定：不通过（存在对局过短的难度）' : '\n✅ 闸门判定：全部难度通过')
process.exit(failed ? 1 : 0)
