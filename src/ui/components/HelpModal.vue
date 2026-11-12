<script setup lang="ts">
import Icon from './Icon.vue'
import { RENT_STALL_MAX, RENT_STALL_PER_ROUND, RENT_STALL_START } from '../../core/config'

const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <div class="overlay" @click.self="emit('close')">
    <div class="rules-modal">
      <span class="orn orn-tl">❧</span>
      <span class="orn orn-tr">❧</span>
      <span class="orn orn-bl">✦</span>
      <span class="orn orn-br">✦</span>

      <div class="rules-scroll">
        <h2 class="r-title"><Icon name="scroll" :size="20" /> 规则说明</h2>
        <div class="flourish">─ ❦ ─</div>

        <div class="body">
          <h4>❖ 目标</h4>
          <p>淘汰所有对手，成为地图上唯一的存活玩家；垄断某类资源全部地块可直接获胜。</p>
          <h4>❖ 对局</h4>
          <p>4~8 人对局（你 + AI，无本地热座），初始资金 ￥15000。开局各自转轮盘点数，点数大者先行。游戏随时可 💾 保存（回合结束后落盘），下次在首页「继续上次对局」。</p>
          <h4>❖ 回合</h4>
          <p><b>1 回合 = 全部玩家各行动一次</b>，顶栏显示当前回合数。转盘决定 0~12 步；空仓格原地不动并抽一张机会卡。落在空地/无主桥时不弹窗，在行动阶段点「🏷️ 购买」按钮买下。经过或停留起点 +1000（春+200/秋+500/冬-200），每圈领当季资源礼包；停在起点可 8 折修理或免费休息（下回合步数 -1）。</p>
          <h4>❖ 地图</h4>
          <p>72 格十字形地图：森林（木材）、高原（牛肉）、沙漠（石油）、沿海（鱼类），各地块价格在分区区间内随机。西桥/东桥可购买、升级收费；<b>冬季河面结冰</b>，可在桥前走冰面绕行（3 步）免交过路费。命运格强制抽卡，机会格可选；赌场押大小（2 倍赔率，转到 0 庄家通吃），拍卖行强制拍卖无主地块。</p>
          <h4>❖ 季节</h4>
          <p><b>开局季节随机</b>，此后按 春→夏→秋→冬 循环。每季持续 <b>10~15 回合随机</b>（无法预判）。春：建造 -20%、洪水；夏：渔业+50%、台风、火灾；秋：牛肉/油价+40%；冬：牛肉+40%、雪灾。每季初触发季节事件。<b>前 10 回合保护期</b>内不触发灾害。</p>
          <h4>❖ 灾害</h4>
          <p>台风在夏、秋两季于东南近海生成并移动，只影响<b>沿海地块</b>；地震全年随机，1 级建筑可被摧毁，2 级建筑在中小震只降级、<b>大震有 25% 概率直接摧毁</b>，3 级建筑只降级，不可防护。沙尘暴只发生在<b>沙漠</b>、雪灾只发生在<b>高原</b>、火灾只发生在<b>森林</b>，洪水只影响<b>桥梁两侧</b>。火灾/地震/雪灾在地块上显示火苗/裂缝/积雪效果（保留 2 回合）。雪灾/沙尘暴/火灾/洪水可用对应防灾建筑免疫。气象站可提前看到台风路径。</p>
          <h4>❖ 建筑</h4>
          <p>每格 2 个建筑位：<b>1 个资源生产位 + 1 个通用位</b>（商业/防灾/科技共用）、同种建筑每格 1 座、最高 3 级：生产建筑须建在对应地形；防灾建筑自动免疫对应灾害；商业建筑不限地形、提升租金；科技建筑全局增益。点击地块上的建筑图标可查看详情、升级或修理。</p>
          <h4>❖ 反垄断举报</h4>
          <p>行动阶段可<b>主动举报</b>达到垄断线的玩家：单类地形 ≥70%、全局地形 ≥50% 或拥有双桥。举报费 ￥300/人，成功率 1 人 40%、2 人 70%、3 人及以上 90%（AI 可能联合）。垄断者可花 300/600/1000 游说，使成功率 -10%/20%/30%。成功则罚款 15%（举报人分奖金）/强制拍卖一块地/产出减半 2 回合；失败后该目标 2 回合内不可再被举报。</p>
          <h4>❖ 博弈</h4>
          <p>玩家间可自由交易地块、资源与现金。点击右侧玩家列表可查看任意玩家的资产。</p>
          <h4>❖ 破产与终局</h4>
          <p>付不起钱时自动半价变卖资产，仍不足则破产出局，资产移交债权人。剩 ≤2 人时无主地块被收回、过路费 +50%；连续 5 回合无人破产触发经济危机（资产 -30%）。<b>反僵持</b>：从第 {{ RENT_STALL_START }} 轮起所有租金每轮 +{{ (RENT_STALL_PER_ROUND * 100).toFixed(1) }}%（最高 +{{ Math.round(RENT_STALL_MAX * 100) }}%），拖得越久决战压力越大。</p>

          <h4>❖ 特色一览</h4>
          <p>
            <b>沙盘暗战</b>：环形地图被河流一分为二，两座桥是交通咽喉，垄断与反垄断围绕它展开。<br />
            <b>四季博弈</b>：开局季节随机，四季轮转改变价格、产出、建造费用与专属灾害。<br />
            <b>动态台风</b>：台风近海生成、沿岸移动、突然转向、登陆消散，气象站可预判路径。<br />
            <b>灾害日历</b>：地震、洪水、沙尘暴、火灾、雪灾各有规律与防灾建筑，行动日志全程可溯。<br />
            <b>局中博弈</b>：联合举报、自由交易、抛售压价——AI 有性格、会记仇、懂报复。<br />
            <b>难度分级</b>：简单 / 正常 / 困难 / 地狱，AI 的预判深度、犯错率与风格随难度变化。
          </p>
        </div>

        <div class="modal-actions">
          <button class="btn close-btn" @click="emit('close')">知道了</button>
        </div>
      </div>

      <div class="seal-mini" title="以富甲天下">富</div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(20, 12, 4, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 18px 16px 26px;
  z-index: 170;
}
.rules-modal {
  position: relative;
  width: min(560px, 94vw);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  padding: 30px 34px 20px;
  transform: rotate(-0.3deg);
  border-radius: 4px 16px 5px 14px / 14px 5px 16px 4px;
  border: 2px solid #7a5a2e;
  background-image:
    /* 污渍线条 */
    var(--tex-paper),
    /* 米花纸纹 */
    var(--tex-paper),
    /* 磨损亮斑 */
    radial-gradient(ellipse 120px 70px at 10% 24%, rgba(255, 250, 232, 0.28), transparent 70%),
    radial-gradient(ellipse 140px 84px at 90% 66%, rgba(255, 248, 226, 0.22), transparent 70%),
    /* 岁月污渍 */
    radial-gradient(ellipse 130px 90px at 14% 80%, rgba(146, 96, 34, 0.14), transparent 72%),
    radial-gradient(ellipse 150px 100px at 86% 12%, rgba(116, 72, 18, 0.12), transparent 72%),
    /* 边缘老化 */
    radial-gradient(ellipse 80% 70% at 50% 48%, transparent 56%, rgba(122, 82, 30, 0.3) 100%),
    /* 泛黄底色 */
    linear-gradient(168deg, #f4e5ba 0%, #eed8a4 42%, #e6ca8e 100%);
  box-shadow:
    inset 0 0 56px rgba(94, 58, 14, 0.35),
    inset 0 0 12px rgba(94, 58, 14, 0.3),
    0 14px 44px rgba(0, 0, 0, 0.6);
}

/* 描金双线框 */
.rules-modal::before {
  content: '';
  position: absolute;
  inset: 9px;
  border: 1.5px solid rgba(126, 84, 30, 0.5);
  border-radius: 3px 13px 4px 11px / 11px 4px 13px 3px;
  pointer-events: none;
}

/* 内容在弹窗内部滚动：边框/角花/火漆印章固定在弹窗框上 */
.rules-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 8px;
  margin-right: -8px;   /* 滚动条贴近右缘 */
}
.rules-scroll::-webkit-scrollbar { width: 8px; }
.rules-scroll::-webkit-scrollbar-thumb {
  background: rgba(122, 82, 30, 0.5);
  border-radius: 6px;
  border: 2px solid rgba(255, 244, 210, 0.25);
}
.rules-scroll::-webkit-scrollbar-track {
  background: rgba(255, 244, 210, 0.12);
  border-radius: 6px;
}

.orn {
  position: absolute;
  font-size: 16px;
  color: #8a5f28;
  opacity: 0.85;
  pointer-events: none;
}
.orn-tl { top: 4px; left: 16px; transform: rotate(8deg); }
.orn-tr { top: 5px; right: 16px; transform: rotate(94deg); }
.orn-bl { bottom: 5px; left: 16px; transform: rotate(-94deg); }
.orn-br { bottom: 6px; right: 16px; transform: rotate(-8deg); }

.r-title { display: flex; align-items: center; justify-content: center; gap: 7px;

  margin: 0;
  text-align: center;
  font-size: 24px;
  letter-spacing: 4px;
  color: #4a2d12;
  text-shadow:
    0 0 3px rgba(74, 45, 18, 0.4),
    1px 1px 0 rgba(255, 240, 200, 0.55),
    2px 3px 4px rgba(64, 34, 0, 0.2);
}
.flourish {
  margin: 6px 0 10px;
  text-align: center;
  color: #8a683c;
  font-size: 13px;
  letter-spacing: 2px;
}

.body h4 {
  color: #7a5426;
  margin: 12px 0 3px;
  font-size: 14.5px;
  letter-spacing: 1px;
  text-shadow: 0 1px 0 rgba(255, 244, 210, 0.6);
}
.body p {
  color: #4a3018;
  font-size: 13px;
  line-height: 1.65;
  margin: 0;
  text-align: justify;
}

.modal-actions { margin-top: 18px; text-align: center; }

/* 木块按钮（与小按钮同款：浓木纹 + 木节 + 划痕 + 污渍，统一圆角） */
.close-btn {
  color: #f2e2bc;
  text-shadow: 0 1px 2px rgba(30, 15, 0, 0.6);
  border-color: #46300e;
  border-radius: 8px;
  --wear: var(--wear-2);
  background-image:
    radial-gradient(ellipse 10px 8px at 84% 70%, rgba(55, 26, 4, 0.55), transparent 75%),
    radial-gradient(ellipse 5px 4px at 84% 70%, rgba(255, 232, 180, 0.28), transparent 75%),
    radial-gradient(ellipse 42% 60% at 28% 18%, rgba(255, 236, 190, 0.28), transparent 70%),
    var(--tex-wood),
    var(--wear),
    linear-gradient(180deg, transparent 0 56%, rgba(28, 12, 0, 0.4) 56% 59%, transparent 59%),
    linear-gradient(180deg, #ac8046 0%, #8a6330 55%, #6f4c20 100%);
  box-shadow:
    inset 0 1px 1px rgba(255, 232, 180, 0.5),
    inset 0 -2px 4px rgba(40, 20, 0, 0.5),
    inset 2px 0 3px rgba(255, 232, 180, 0.14),
    inset -2px 0 4px rgba(40, 20, 0, 0.28),
    0 2px 0 #37230a,
    0 4px 7px rgba(0, 0, 0, 0.42);
}
.close-btn:hover { filter: brightness(1.12); }

/* 迷你火漆印章 */
.seal-mini {
  position: absolute;
  right: 26px;
  bottom: -16px;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  font-weight: bold;
  color: #f2dcb2;
  text-shadow: 0 1px 2px rgba(40, 8, 0, 0.6);
  background: radial-gradient(circle at 34% 30%, #c4533c 0%, #a03020 46%, #7e1f12 100%);
  border-radius: 50% 46% 52% 48% / 50% 52% 46% 50%;
  transform: rotate(-9deg);
  box-shadow:
    inset 0 2px 6px rgba(60, 10, 0, 0.6),
    inset 0 -1px 4px rgba(255, 200, 150, 0.18),
    0 3px 8px rgba(0, 0, 0, 0.5);
}
</style>
