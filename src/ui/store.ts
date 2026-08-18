// ============ Vue 响应式 store：桥接核心 Game 与 UI ============

import { reactive } from 'vue'
import { Game, type GameOptions, type PlayerSetup } from '../core/game'
import { playSfx, setMuted } from '../core/sfx'
import type { AiDifficulty, GameState, Prompt } from '../core/types'

interface StoreShape {
  game: Game | null
  state: GameState | null
  prompt: Prompt | null
  selectedTile: number
  tileModalOpen: boolean       // 点击地块后在视野中央弹出地块详情/操作窗口
  buildingDetail: { tile: number; buildingId: number } | null
  muted: boolean
  speed: 'slow' | 'normal' | 'fast'
  aiDifficulty: AiDifficulty
  version: number
  saveToast: string
  loading: boolean             // 开始游戏 → 棋盘首帧就绪之间的加载遮罩
  /** 资金不足提示：纯 UI 弹层（不走 game.prompt，避免覆盖行动阶段弹窗的应答器导致软锁） */
  noMoneyToast: { need: number; what: string; cash: number } | null
}

export const store = reactive<StoreShape>({
  game: null,
  state: null,
  prompt: null,
  selectedTile: -1,
  tileModalOpen: false,
  buildingDetail: null,
  muted: false,
  speed: 'normal',
  aiDifficulty: 'normal',
  version: 0,
  saveToast: '',
  loading: false,
  noMoneyToast: null,
})

const SPEED_MS = { slow: 1500, normal: 900, fast: 450 } as const
const SAVE_KEY = 'monopoly-save-v2'   // v2：轮数/季节长度字段与新区划地图；旧版本存档自动作废

/** 为新对局挂载事件桥（startGame / loadGame 共用） */
function attachGame(game: Game): void {
  game.on('state-changed', () => {
    const prev = store.state
    store.state = structuredClone(game.state)
    store.version++
    // 玩家落位时自动选中当前到达的地块：地块详情优先显示落脚点（购买后也保持显示该地块）
    const ns = store.state
    if (ns && prev?.phase !== 'landing' && ns.phase === 'landing') {
      const p = ns.players[ns.currentPlayer]
      if (p) {
        store.selectedTile = p.pos
        // 人类落位 → 自动弹出地块窗口；AI 落位 → 仅更新选中，不打扰玩家
        if (!p.isAI) store.tileModalOpen = true
      }
    }
  })
  game.on('prompt', (p: Prompt) => {
    store.prompt = p
  })
  game.on('prompt-resolved', () => {
    store.prompt = null
  })
  game.on('sfx', (name: any) => playSfx(name))
  game.on('tile-click', (i: number) => {
    store.selectedTile = i
    store.tileModalOpen = true   // 点击地块 → 视野中央弹出地块窗口
  })
  game.on('building-click', (d: { tile: number; buildingId: number }) => {
    store.buildingDetail = d
  })
  game.on('save-ready', (json: string) => {
    localStorage.setItem(SAVE_KEY, json)
    store.saveToast = '已保存'
    setTimeout(() => { store.saveToast = '' }, 2200)
  })
  // 棋盘场景 create() 完成后发出：等一帧渲染再撤掉加载遮罩，避免闪空白
  game.on('board-ready', () => {
    requestAnimationFrame(() => { store.loading = false })
  })
}

export function startGame(setups: PlayerSetup[], seed?: number): void {
  localStorage.removeItem(SAVE_KEY)   // 新对局替代旧存档
  const game = new Game()
  const opts: GameOptions = { speedMs: SPEED_MS[store.speed], seed, aiDifficulty: store.aiDifficulty }
  game.muted = store.muted
  attachGame(game)

  store.game = game
  store.state = null
  store.prompt = null
  store.selectedTile = -1
  store.tileModalOpen = false
  store.loading = true
  store.noMoneyToast = null
  // 兜底：15 秒后仍未收到 board-ready（极端环境挂起）时撤掉遮罩，避免永久卡在加载中
  setTimeout(() => { if (store.loading && store.game === game) store.loading = false }, 15000)
  void game.start(setups, opts)
}

/** 保存：在下一个回合边界落盘 */
export function saveGame(): void {
  store.game?.requestSave()
}

/** 本地是否有存档 */
export function hasSave(): boolean {
  return !!localStorage.getItem(SAVE_KEY)
}

/** 读取存档继续游戏 */
export function loadGame(): void {
  const json = localStorage.getItem(SAVE_KEY)
  if (!json) return
  const game = new Game()
  game.muted = store.muted
  attachGame(game)
  store.game = game
  store.state = null
  store.prompt = null
  store.selectedTile = -1
  store.tileModalOpen = false
  store.loading = true
  setTimeout(() => { if (store.loading && store.game === game) store.loading = false }, 15000)
  game.restore(json)
}

export function respond(v: any): void {
  store.game?.respond(v)
}

/** 资金不足提示（纯 UI 弹层，需点确定关闭；不进游戏流程，绝不覆盖 pendingPrompt） */
export function showNoMoney(need: number, what: string): void {
  const cash = store.state?.players[store.state.currentPlayer]?.cash ?? 0
  store.noMoneyToast = { need, what, cash }
}

export function toggleMute(): void {
  store.muted = !store.muted
  setMuted(store.muted)
  if (store.game) store.game.muted = store.muted
}

export function setSpeed(s: 'slow' | 'normal' | 'fast'): void {
  store.speed = s
  if (store.game) store.game.state.speedMs = SPEED_MS[s]
}

export function backToMenu(): void {
  store.game?.stop()
  store.game = null
  store.state = null
  store.prompt = null
  store.selectedTile = -1
  store.tileModalOpen = false
  store.loading = false
  store.noMoneyToast = null
}
