<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { store } from './ui/store'
import StartScreen from './ui/components/StartScreen.vue'
import TopBar from './ui/components/TopBar.vue'
import BoardCanvas from './ui/components/BoardCanvas.vue'
import PlayerPanel from './ui/components/PlayerPanel.vue'
import ActionBar from './ui/components/ActionBar.vue'
import LogPanel from './ui/components/LogPanel.vue'
import WheelModal from './ui/components/WheelModal.vue'
import CardModal from './ui/components/CardModal.vue'
import LandingModals from './ui/components/LandingModals.vue'
import BidModal from './ui/components/BidModal.vue'
import TradeOfferModal from './ui/components/TradeOfferModal.vue'
import SimpleModals from './ui/components/SimpleModals.vue'
import ChooseModals from './ui/components/ChooseModals.vue'
import GameOverModal from './ui/components/GameOverModal.vue'
import HelpModal from './ui/components/HelpModal.vue'
import OrderResultModal from './ui/components/OrderResultModal.vue'
import BuildingModal from './ui/components/BuildingModal.vue'
import TileModal from './ui/components/TileModal.vue'
import LoadingOverlay from './ui/components/LoadingOverlay.vue'
import NoMoneyModal from './ui/components/NoMoneyModal.vue'
import JoinReportModal from './ui/components/JoinReportModal.vue'
import EliminatedModal from './ui/components/EliminatedModal.vue'
import Icon from './ui/components/Icon.vue'

const inGame = computed(() => !!store.state?.started)
const prompt = computed(() => store.prompt)
const showHelp = ref(false)

// 结束回合悬浮按钮：仅人类玩家行动阶段显示（与 ActionBar 的 myTurn 同条件），
// 固定在棋盘（左侧 70% 区域）右下角，不占用右侧操作栏
const showEndFab = computed(() => {
  const s = store.state
  if (!s) return false
  const p = s.players[s.currentPlayer]
  return !!p && !p.isAI && s.phase === 'action' && (!store.prompt || store.prompt.type === 'action')
})

// 竖屏小屏时提示旋转设备（手机横屏游玩，需求文档 11.8）
const isPortrait = ref(false)
let mq: MediaQueryList | null = null
const updateOrientation = (): void => { isPortrait.value = !!mq?.matches }
onMounted(() => {
  // 竖屏提示：触屏设备竖屏必提示（手机横屏 CSS 宽度可能 >900px，不能只用宽度判断）
  mq = window.matchMedia('(orientation: portrait) and ((pointer: coarse) or (max-width: 900px))')
  updateOrientation()
  mq.addEventListener('change', updateOrientation)
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', updateOrientation)
})
</script>

<template>
  <div class="app">
    <template v-if="inGame">
      <TopBar @open-help="showHelp = true" />
      <div class="main">
        <BoardCanvas class="board" />
        <aside class="panel">
          <div class="panel-scroll">
            <PlayerPanel />
            <ActionBar />
          </div>
          <LogPanel />
        </aside>
      </div>

      <BuildingModal />
      <TileModal />

      <!-- 结束回合：棋盘右下角悬浮按钮 -->
      <button v-if="showEndFab" class="btn primary end-turn-fab" @click="store.game?.endAction()">✔ 结束回合</button>

      <WheelModal v-if="prompt?.type === 'wheel'" :prompt="prompt" />
      <WheelModal v-else-if="prompt?.type === 'order-wheel'" :prompt="prompt" manual points />
      <OrderResultModal v-else-if="prompt?.type === 'order-result'" :prompt="prompt" />
      <CardModal v-else-if="prompt?.type === 'card'" :prompt="prompt" />
      <LandingModals
        v-else-if="prompt && ['buy', 'start-stop', 'casino', 'bridge-cross'].includes(prompt.type)"
        :prompt="prompt"
      />
      <BidModal v-else-if="prompt?.type === 'bid'" :prompt="prompt" />
      <TradeOfferModal v-else-if="prompt?.type === 'trade-offer'" :prompt="prompt" />
      <ChooseModals
        v-else-if="prompt && ['choose-resource', 'choose-tile', 'choose-terrain'].includes(prompt.type)"
        :prompt="prompt"
      />
      <JoinReportModal v-else-if="prompt?.type === 'join-report'" :prompt="prompt" />
      <SimpleModals
        v-else-if="prompt && ['notice', 'pay-or-lose', 'donate', 'sell-spec'].includes(prompt.type)"
        :prompt="prompt"
      />

      <GameOverModal v-if="store.state?.phase === 'gameover' && !prompt" />
      <EliminatedModal v-if="store.eliminated && store.state?.phase !== 'gameover'" />
    </template>
    <StartScreen v-else @show-help="showHelp = true" />
    <HelpModal v-if="showHelp" @close="showHelp = false" />

    <!-- 开始游戏 → 棋盘首帧就绪之间的加载遮罩 -->
    <LoadingOverlay v-if="store.loading" />

    <!-- 资金不足提示：纯 UI 弹层 -->
    <NoMoneyModal />

    <!-- 竖屏旋转提示 -->
    <div v-if="inGame && isPortrait" class="rotate-hint">
      <div class="rotate-card">
        <div class="rotate-icon"><Icon name="phone" :size="42" /></div>
        <div class="rotate-arrow"><Icon name="rotate" :size="30" /></div>
        <p>请将设备旋转至<b>横屏</b>游玩</p>
        <p class="rotate-sub">棋盘与信息面板将并排显示</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 结束回合悬浮按钮：棋盘（左侧 70%）右下角 */
.end-turn-fab {
  position: fixed;
  right: calc(30% + 14px);
  bottom: 14px;
  z-index: 60;
  padding: 10px 20px;
  font-size: 15px;
  font-weight: bold;
}
.rotate-hint {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(20, 12, 4, 0.86);
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(3px);
}
.rotate-card {
  text-align: center;
  color: #f0dca8;
  padding: 30px 40px;
  border: 2px solid #8a6534;
  border-radius: 14px;
  background: linear-gradient(160deg, #4a3218, #2c1c0a);
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.6);
}
.rotate-icon { display: flex; justify-content: center; color: #f0dca8; }
.rotate-arrow {
  display: flex;
  justify-content: center;
  color: #ffd76a;
  animation: spin2 1.6s linear infinite;
  margin: 4px 0 8px;
}
.rotate-card p { margin: 4px 0; font-size: 17px; letter-spacing: 2px; }
.rotate-sub { font-size: 12px; color: #b99a6a; letter-spacing: 1px; }
@keyframes spin2 { to { transform: rotate(360deg); } }
</style>
