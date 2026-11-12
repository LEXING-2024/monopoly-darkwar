// 导出地图几何给 Python 地形生成脚本（一次性开发工具，不参与游戏运行时）
// 用法：npx tsx scripts/export-layout.ts
import { writeFileSync } from 'node:fs'
import { BOARD, LAYOUT, RIVER_POINTS, SEA_COAST, SEA_POINTS } from '../src/core/map'

const data = {
  board: BOARD,
  tiles: LAYOUT.map((p, i) => ({ i, x: +p.x.toFixed(2), y: +p.y.toFixed(2), angle: +p.angle.toFixed(4) })),
  sea: SEA_POINTS,
  coast: SEA_COAST,
  river: RIVER_POINTS,
}
writeFileSync(new URL('./layout.json', import.meta.url), JSON.stringify(data, null, 2), 'utf8')
console.log('layout.json', LAYOUT.length, 'tiles')
