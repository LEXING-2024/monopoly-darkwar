<script setup lang="ts">
import { computed } from 'vue'
import Icon from './Icon.vue'
import { ENDGAME, monopolyTerrainRatio, RENT_STALL_MAX, RENT_STALL_PER_ROUND, RENT_STALL_START } from '../../core/config'
import { store } from '../store'

const emit = defineEmits<{ (e: 'close'): void }>()
/** 垄断线随人数变化：4 人局 50%，8 人局 70% */
const monoLine = computed(() => Math.round(monopolyTerrainRatio(store.state?.players.length ?? 4) * 100))
const totalPlayers = computed(() => store.state?.players.length ?? 4)
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
          <p>淘汰所有对手，成为地图上唯一的存活玩家。<b>垄断不会直接获胜</b>——它是压制全场、逼对手破产的手段，胜负始终靠淘汰。</p>
          <h4>❖ 对局</h4>
          <p>4~8 人对局（你 + AI，无本地热座），初始资金 ￥15000。开局各自转轮盘点数，点数大者先行。游戏随时可 💾 保存（当前玩家行动结束后落盘），下次在首页「继续上次对局」。</p>
          <h4>❖ 回合</h4>
          <p><b>1 回合 = 全部玩家各行动一次</b>，顶栏显示当前回合数。转盘决定 <b>0~12 步</b>（0 约占 4%，1~12 各约 8%）。</p>
          <p>
            落在<b>空地/无主桥</b>不弹窗，在行动阶段点「购买」买下。<br />
            <b>经过或停在起点</b>：+1000（春 +200 / 夏 ±0 / 秋 +500 / 冬 -200），并领取当季资源礼包（春 木材×6 / 夏 鱼×6 / 秋 石油×5 / 冬 牛肉×6）。<br />
            <b>停在起点</b>：可 8 折修理受损建筑，或休息（下回合步数 -1）。<br />
            <b>空仓格（转盘 0）</b>：原地不动并抽一张机会卡。
          </p>
          <h4>❖ 地图</h4>
          <p>72 格环形商路，四大地形区：<b>森林（木材）· 高原（牛肉）· 沙漠（石油）· 沿海（鱼类）</b>，各地块价格在分区区间内随机。河流把地图一分为二，<b>西桥 / 东桥</b>是必经咽喉：可购买、升级至 3 级收费（西桥 100/300/600，东桥 200/600/1200）。桥主可<b>临时提价</b>（×1.5，2 轮）；<b>仅冬季</b>河面结冰时可在桥前踏冰绕行 3 步免交。</p>
          <p>特殊格：<b>命运格</b>强制抽卡；<b>机会格</b>可自行选择是否接受；<b>赌场</b>押大小（猜中 2 倍，转到 0 庄家通吃）；<b>拍卖行</b>随机拍卖一块无主地块（半价起拍）。</p>
          <h4>❖ 季节</h4>
          <p><b>开局季节随机</b>，此后 春→夏→秋→冬 循环，每季持续 <b>10~15 回合</b>（无法预判）。每季初触发季节事件。各季修正：</p>
          <p>
            <b>春</b>：木材价格 +10%、产出 +10%，<b>建造 -20%</b>，起点 +200；灾害：洪水、沙尘暴；礼包 木材×6<br />
            <b>夏</b>：鱼类价格 +50%、产出 +50%，木材价格 +30%，起点 ±0；灾害：沙尘暴、火灾、<b>台风季</b>；礼包 鱼×6<br />
            <b>秋</b>：牛肉价格 +40%、石油价格 +40%，起点 <b>+500</b>；无季节灾害，但<b>仍是台风季</b>；礼包 石油×5<br />
            <b>冬</b>：牛肉价格 <b>-30%</b>、产出 <b>+40%</b>，起点 <b>-200</b>；灾害：雪灾；礼包 牛肉×6；<b>河面结冰可踏冰绕行</b>
          </p>
          <h4>❖ 灾害</h4>
          <p><b>前 10 回合保护期</b>内不触发任何灾害（台风也不生成）。</p>
          <p>
            <b>台风</b>（夏/秋）：东南近海生成，0 级热带扰动 → 逐回合增强至最高 5 级，任意强度都可能登陆；登陆时按强度形成影响范围（半径 100~205），<b>越靠中心破坏越重，只影响沿海地块</b>。气象站可提前 1 回合预判路径。<br />
            <b>地震</b>（全年，约 7.5%/轮；全场建筑 &gt;5 座时升至 12%）：影响连续 3 格。1 级建筑可被摧毁；2 级在中小震只降级、<b>大震有 25% 概率直接摧毁</b>；3 级建筑只降级；当轮该区域租金下降。不可防护。<br />
            <b>火灾</b>（夏，森林）：沿格蔓延，烧毁产出与建筑；<b>洪水</b>（春，桥两侧）：只影响桥头两岸；<b>沙尘暴</b>（春/夏，沙漠及沿线）：连续横扫多格；<b>雪灾</b>（冬，高原）：连续横扫多格。
          </p>
          <p>防灾建筑：<b>防火带</b>（火灾）· <b>温室</b>（雪灾）· <b>防沙林</b>（沙尘暴）· <b>防波堤</b>（台风：收益不归零、建筑受损概率减半，非完全免疫）· <b>堤坝</b>（洪水，须建在桥两侧）。</p>
          <h4>❖ 建筑</h4>
          <p>每格 <b>2 个建筑位</b>：1 个资源生产位 + 1 个通用位（商业/防灾/科技共用）；同种建筑每格限 1 座，<b>最高 3 级</b>。升级视同重建，可顺带修复受损；受损建筑停摆，需修理（停起点 8 折）。</p>
          <p>
            <b>生产</b>（须建在对应地形，每级产出 +50%）：伐木场 ￥650 · 牧场 ￥720 · 油井 ￥850 · 渔港 ￥780<br />
            <b>商业</b>（不限地形，每级提升本格租金）：公寓 +45% ￥900 · 写字楼 +60% ￥1200 · 购物中心 +80% ￥1400<br />
            <b>防灾</b>：防火带 ￥650 · 温室 ￥720 · 防沙林 ￥780 · 防波堤 ￥850 · 堤坝 ￥780<br />
            <b>科技</b>（每玩家限 1 座）：气象站 ￥1950（预判台风）· 自动化中心 ￥2340（全部产出 +25%）· 无人机物流 ￥2600（租金 +10%、卖价 +10%）
          </p>
          <h4>❖ 垄断：四条路线</h4>
          <p><b>垄断不判胜，只解锁压制手段。</b>每条路线都有对应破法：</p>
          <p>
            <b>① 资源份额</b>：某类地形 ≥50% 解锁「限产抬价」（该资源市价 +25%）与「价格战」（市价 -30%，会结仇）；达到垄断线（本局 {{ totalPlayers }} 人，单类地形 ≥{{ monoLine }}%）可「断供」——其他人卖该资源<b>只能拿半价</b>，用于掐断对手现金流。每回合限用 1 次，需付费。<br />
            <b>② 连片地块</b>：同一地形区<b>连续相邻</b> ≥3 块，该段租金 +25%（4 连 +40%、5 连以上 +50%）。散落买地无加成——<b>买在哪里</b>同样重要。<br />
            <b>③ 桥梁咽喉</b>：桥主可花 ￥500 临时提价（过路费 ×1.5，持续 2 轮），全桌过桥者都要多交。<br />
            <b>④ 行业龙头</b>：某类生产建筑（伐木场/牧场/油井/渔港）<b>数量最多</b>且 ≥2 座者，成为该资源行业龙头，卖价 +10%。
          </p>
          <h4>❖ 反垄断：四条破法</h4>
          <p>
            <b>① 举报</b>：对达到垄断线的玩家（本局单类地形 ≥{{ monoLine }}%、全局 ≥50%，或双桥且两桥总等级 ≥2）发起。举报费 ￥300/人，基础成功率 1 人 40%、2 人 70%、3 人及以上 90%；<b>垄断超出线越多，成功率越高</b>。除发起人外，其他存活玩家（含人类）都会收到联合邀请。垄断者可花 300/600/1000 游说降成功率。成功后<b>四选一</b>：罚款 15%（超线越狠罚得越重，最高 35%，举报人分奖金）/ 强制拍卖一块地 / 产出减半 2 回合 / <b>强制拆分</b>（抽走其连片中点地块，半价转给最弱者，连片加成归零）。<br />
            <b>② 抢地截胡</b>：买走对手连片中间那块，让其整段加成失效；也是打断份额垄断的最直接方式。<br />
            <b>③ 抢建同类建筑</b>：超过对手的同类生产建筑数量，夺走「行业龙头」溢价。<br />
            <b>④ 冬季踏冰绕行</b>：仅冬季可在桥前绕行 3 步免交过路费，避开桥主提价。
          </p>
          <h4>❖ 交易与博弈</h4>
          <p>玩家间可自由交易<b>地块、资源、现金</b>。点击右侧玩家列表可查看任意玩家的资产与垄断进度；AI 有性格、会记仇、会报复。</p>
          <h4>❖ 破产与终局</h4>
          <p>
            <b>破产</b>：付不起钱时自动半价变卖资产（建筑折现、资源变卖），仍不足则出局，剩余资产移交债权人（无债权人则充公）。<br />
            <b>终局</b>（存活 ≤{{ ENDGAME.pressureAlive }} 人）：无主地块被银行收回，经济危机倒计时启动；仅剩 2 人时所有租金与过路费 <b>×1.5</b>，市场波动加剧（每轮 ±8%）。<br />
            <b>经济危机</b>：终局后连续 {{ ENDGAME.crisisTurns }} 轮无人破产，存活玩家现金与资源 -30%，建筑各有 30% 概率降级——逼出胜负。<br />
            <b>反僵持</b>：从第 {{ RENT_STALL_START }} 轮起，所有租金每轮 +{{ (RENT_STALL_PER_ROUND * 100).toFixed(1) }}%（最高 +{{ Math.round(RENT_STALL_MAX * 100) }}%）；每有一人出局，全场租金再额外上浮，拖得越久决战压力越大。
          </p>

          <h4>❖ 特色一览</h4>
          <p>
            <b>垄断博弈</b>：资源份额、连片地块、桥梁咽喉、行业龙头——四条垄断路线各有破法，压人与被反制循环往复。<br />
            <b>沙盘暗战</b>：环形地图被河流一分为二，两座桥是交通咽喉，桥主可设卡提价，冬季踏冰才能绕行。<br />
            <b>四季博弈</b>：开局季节随机，四季轮转改变价格、产出、建造费用与专属灾害。<br />
            <b>动态台风</b>：台风近海生成、沿岸移动、突然转向、登陆消散，气象站可预判路径。<br />
            <b>灾害日历</b>：地震、洪水、沙尘暴、火灾、雪灾各有规律与防灾建筑，行动日志全程可溯。<br />
            <b>市场博弈</b>：集中抛售压价、惜售抬价、联合举报、自由交易——供需由全体玩家的行为共同决定。<br />
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
