// ============ Vue 响应式 store：桥接核心 Game 与 UI ============

import { reactive } from 'vue'
import { Game, type GameOptions, type PlayerSetup } from '../core/game'
import { playSfx, setMuted, setVolume as setSfxVolume } from '../core/sfx'
import type { AiDifficulty, GameState, Prompt } from '../core/types'

interface StoreShape {
  game: Game | null
  state: GameState | null
  prompt: Prompt | null
  selectedTile: number
  tileModalOpen: boolean       // 点击地块后在视野中央弹出地块详情/操作窗口
  buildingDetail: { tile: number; buildingId: number } | null
  muted: boolean
  volume: number               // 0~1，持久化到 localStorage
  speed: 'slow' | 'normal' | 'fast'
  aiDifficulty: AiDifficulty
  saveToast: string
  loading: boolean             // 开始游戏 → 棋盘首帧就绪之间的加载遮罩
  /** 资金不足提示：纯 UI 弹层（不走 game.prompt，避免覆盖行动阶段弹窗的应答器导致软锁）。
   *  player 记录发起提示的玩家 id，现金实时从该玩家读取——Toast 停留期间回合可能已推进，
   *  不能直接读 store.state.currentPlayer（那是“当前行动者”，可能已换成 AI） */
  noMoneyToast: { need: number; what: string; player: number } | null
}

const VOLUME_KEY = 'monopoly-volume-v1'
function readVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    if (raw === null) return 0.7
    const v = Number(raw)
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.7
  } catch {
    return 0.7
  }
}
const initialVolume = readVolume()

export const store = reactive<StoreShape>({
  game: null,
  state: null,
  prompt: null,
  selectedTile: -1,
  tileModalOpen: false,
  buildingDetail: null,
  muted: false,
  volume: initialVolume,
  speed: 'normal',
  aiDifficulty: 'normal',
  saveToast: '',
  loading: false,
  noMoneyToast: null,
})
setSfxVolume(initialVolume)

const SPEED_MS = { slow: 1500, normal: 900, fast: 450 } as const
const SAVE_KEY = 'monopoly-save-v2'   // v2：轮数/季节长度字段与新区划地图；旧版本存档自动作废

/** 当前已挂载的事件桥退订函数（切换对局时必须先解绑旧桥，防止旧对局残留 emit 污染新对局） */
let detachBridge: (() => void) | null = null
/** 跟踪对局切换时未到期的定时器句柄，detachGame 统一清理（saveToast 2.2s、loading 兜底 15s） */
let saveToastTimer: ReturnType<typeof setTimeout> | null = null
let loadingFallbackTimer: ReturnType<typeof setTimeout> | null = null
function clearManagedTimers(): void {
  if (saveToastTimer) { clearTimeout(saveToastTimer); saveToastTimer = null }
  if (loadingFallbackTimer) { clearTimeout(loadingFallbackTimer); loadingFallbackTimer = null }
}

/** 为新对局挂载事件桥（startGame / loadGame 共用） */
function attachGame(game: Game): void {
  const offs: (() => void)[] = []
  offs.push(game.on('state-changed', () => {
    const prev = store.state
    // 浅拷贝顶层 + 显式重建 log 数组（log 可能很大、深拷贝耗时，旧版用 structuredClone 全量深拷，
    // 在每步走格时浪费数 ms）。tiles/players/market 等通过引用共享——core 端原地修改后，
    // Vue 深响应式会自动追踪并触发依赖组件重新渲染，无需重新分配嵌套对象。
    store.state = { ...game.state, log: game.state.log.slice() }
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
  }))
  offs.push(game.on('prompt', (p: Prompt) => {
    store.prompt = p
  }))
  offs.push(game.on('prompt-resolved', () => {
    store.prompt = null
  }))
  offs.push(game.on('sfx', (name: any) => playSfx(name)))
  offs.push(game.on('tile-click', (i: number) => {
    store.selectedTile = i
    store.tileModalOpen = true   // 点击地块 → 视野中央弹出地块窗口
  }))
  offs.push(game.on('building-click', (d: { tile: number; buildingId: number }) => {
    store.buildingDetail = d
  }))
  offs.push(game.on('save-ready', (json: string) => {
    localStorage.setItem(SAVE_KEY, json)
    store.saveToast = '已保存'
    if (saveToastTimer) clearTimeout(saveToastTimer)
    saveToastTimer = setTimeout(() => { store.saveToast = ''; saveToastTimer = null }, 2200)
  }))
  // 棋盘场景 create() 完成后发出：等一帧渲染再撤掉加载遮罩，避免闪空白
  offs.push(game.on('board-ready', () => {
    requestAnimationFrame(() => { store.loading = false })
  }))
  detachBridge = () => { for (const f of offs) f(); detachBridge = null }
}

/** 解绑当前事件桥（开新局 / 回菜单前调用） */
function detachGame(): void {
  detachBridge?.()
  detachBridge = null
  clearManagedTimers()
}

export function startGame(setups: PlayerSetup[], seed?: number): void {
  detachGame()   // 先解绑旧对局事件桥，避免旧局残留 emit 覆盖新对局状态
  localStorage.removeItem(SAVE_KEY)   // 新对局替代旧存档
  const game = new Game()
  const opts: GameOptions = {
    speedMs: SPEED_MS[store.speed], seed, aiDifficulty: store.aiDifficulty,
    muted: store.muted,   // 必须传入：Game.start 会用 opts.muted 覆盖此前设置的 game.muted
  }
  game.muted = store.muted
  attachGame(game)

  store.game = game
  store.state = null
  store.prompt = null
  store.selectedTile = -1
  store.tileModalOpen = false
  store.loading = true
  store.noMoneyToast = null
  clearManagedTimers()   // 切到新对局前清掉旧局的 saveToast / loading 兜底定时器
  // 兜底：15 秒后仍未收到 board-ready（极端环境挂起）时撤掉遮罩，避免永久卡在加载中
  loadingFallbackTimer = setTimeout(() => {
    loadingFallbackTimer = null
    if (store.loading && store.game === game) store.loading = false
  }, 15000)
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
  detachGame()   // 先解绑旧对局事件桥，避免旧局残留 emit 污染读档后的新对局
  clearManagedTimers()
  const game = new Game()
  game.muted = store.muted
  attachGame(game)
  store.game = game
  store.state = null
  store.prompt = null
  store.selectedTile = -1
  store.tileModalOpen = false
  store.loading = true
  loadingFallbackTimer = setTimeout(() => {
    loadingFallbackTimer = null
    if (store.loading && store.game === game) store.loading = false
  }, 15000)
  game.restore(json)
}

export function respond(v: any): void {
  store.game?.respond(v)
}

/** 资金不足提示（纯 UI 弹层，需点确定关闭；不进游戏流程，绝不覆盖 pendingPrompt） */
export function showNoMoney(need: number, what: string): void {
  const player = store.state?.currentPlayer ?? -1
  store.noMoneyToast = { need, what, player }
}

export function toggleMute(): void {
  store.muted = !store.muted
  setMuted(store.muted)
  if (store.game) store.game.muted = store.muted
}

/** 0~1 主音量：立即作用于合成器，并持久化到本机 */
export function setVolume(v: number): void {
  const next = Math.max(0, Math.min(1, v))
  store.volume = next
  setSfxVolume(next)
  try { localStorage.setItem(VOLUME_KEY, String(next)) } catch { /* 无痕模式忽略 */ }
}

export function setSpeed(s: 'slow' | 'normal' | 'fast'): void {
  store.speed = s
  if (store.game) store.game.state.speedMs = SPEED_MS[s]
}

export function backToMenu(): void {
  store.game?.stop()
  detachGame()   // 回菜单：解绑事件桥，残余异步 emit 不再写入 store
  store.game = null
  store.state = null
  store.prompt = null
  store.selectedTile = -1
  store.tileModalOpen = false
  store.loading = false
  store.noMoneyToast = null
}
