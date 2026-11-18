<script setup lang="ts">
import { reactive, ref } from 'vue'
import { hasSave, loadGame, startGame, store, setSpeed } from '../store'
import { AI_DIFFICULTY, AI_DIFFICULTY_ORDER } from '../../core/config'
import Icon from './Icon.vue'

const emit = defineEmits<{ (e: 'show-help'): void }>()

// 单人 + AI（无本地热座）：第一位固定为人类，其余为 AI
const players = reactive([
  { name: '你', isAI: false },
  { name: '阿尔法', isAI: true },
  { name: '贝塔', isAI: true },
  { name: '伽马', isAI: true },
  { name: '德尔塔', isAI: true },
  { name: '艾普西隆', isAI: true },
  { name: '泽塔', isAI: true },
  { name: '伊塔', isAI: true },
])

const count = reactive({ value: 4 })
const saved = ref(hasSave())
const difficulty = reactive({ value: store.aiDifficulty })

const shapes = ['circle', 'square', 'triangle', 'diamond', 'star', 'hexagon', 'plus', 'heart']
const colors = ['#d94f3d', '#3d7fd9', '#3da35d', '#d9a53d', '#9a5bd0', '#d95a9a', '#40b8b0', '#c07a3a']

function begin(): void {
  store.aiDifficulty = difficulty.value
  const setups = players.slice(0, count.value).map((p, i) => ({
    name: p.name.trim() || (p.isAI ? `AI·${i + 1}` : `玩家${i + 1}`),
    isAI: p.isAI,
  }))
  startGame(setups)
}

function resume(): void {
  loadGame()
}
</script>

<template>
  <div class="start-screen">
    <div class="parchment">
      <!-- 手绘海图装饰层 -->
      <svg class="map-art" viewBox="0 0 540 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <!-- 波特兰航线（罗盘引线，中部保持清淡不干扰内容） -->
        <g fill="none" stroke="#5d421f" stroke-width="0.7" opacity="0.15">
          <line x1="0" y1="0" x2="540" y2="600" />
          <line x1="540" y1="0" x2="0" y2="600" />
          <line x1="150" y1="180" x2="40" y2="40" />
          <line x1="150" y1="180" x2="30" y2="420" />
          <line x1="150" y1="180" x2="340" y2="28" />
          <line x1="150" y1="180" x2="110" y2="600" />
          <line x1="400" y1="480" x2="530" y2="300" />
          <line x1="400" y1="480" x2="530" y2="600" />
          <line x1="400" y1="480" x2="200" y2="604" />
          <line x1="400" y1="480" x2="510" y2="60" />
        </g>

        <!-- 手绘内框（断续墨线）+ 四角卷草 -->
        <rect x="14" y="14" width="512" height="572" fill="none" stroke="#5d421f" stroke-width="1" opacity="0.4" stroke-dasharray="6 2 2 2" rx="6" />
        <rect x="20" y="20" width="500" height="560" fill="none" stroke="#5d421f" stroke-width="0.7" opacity="0.26" stroke-dasharray="2 3" rx="4" />
        <g fill="none" stroke="#5d421f" stroke-width="1.1" opacity="0.45" stroke-linecap="round">
          <path d="M16,36 Q16,23 29,21 M23,41 Q23,29 34,27" />
          <path d="M524,36 Q524,23 511,21 M517,41 Q517,29 506,27" />
          <path d="M16,564 Q16,577 29,579 M23,559 Q23,571 34,573" />
          <path d="M524,564 Q524,577 511,579 M517,559 Q517,571 506,573" />
        </g>

        <!-- 罗盘玫瑰（右上） -->
        <g stroke="#5d421f" stroke-width="1.2" opacity="0.62" stroke-linejoin="round">
          <circle cx="452" cy="100" r="28" fill="none" />
          <circle cx="452" cy="100" r="23" fill="none" opacity="0.75" />
          <g class="compass-needle">
            <path d="M452,66 L460,100 L452,134 L444,100 Z" fill="#5d421f" fill-opacity="0.5" />
            <path d="M426,100 L452,92 L478,100 L452,108 Z" fill="#5d421f" fill-opacity="0.3" />
            <path d="M443,91 L452,100 L461,109 L452,118 Z" fill="none" opacity="0.8" />
            <path d="M461,91 L452,100 L443,109 L452,82 Z" fill="none" opacity="0.8" />
          </g>
          <path d="M452,66 L452,60 M452,134 L452,140 M426,100 L420,100 M478,100 L484,100" stroke-width="0.9" />
          <!-- 刻度环 -->
          <g stroke-width="0.7" opacity="0.6">
            <line x1="452" y1="66" x2="452" y2="62" /><line x1="452" y1="134" x2="452" y2="138" />
            <line x1="422" y1="100" x2="418" y2="100" /><line x1="482" y1="100" x2="486" y2="100" />
            <line x1="430.8" y1="78.8" x2="428" y2="76" /><line x1="473.2" y1="78.8" x2="476" y2="76" />
            <line x1="430.8" y1="121.2" x2="428" y2="124" /><line x1="473.2" y1="121.2" x2="476" y2="124" />
          </g>
          <!-- 北向鸢尾花饰 -->
          <path d="M452,44 C458,50 458,60 452,66 C446,60 446,50 452,44 Z" fill="#5d421f" fill-opacity="0.65" stroke="none" />
          <line x1="447" y1="54" x2="457" y2="54" stroke-width="0.8" />
        </g>
        <text x="452" y="40" text-anchor="middle" font-size="11" fill="#5d421f" opacity="0.65" font-family="'KaiTi','STKaiti',serif">北</text>

        <!-- 山脉（左上，带皴线阴影） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.4" opacity="0.6" stroke-linejoin="round" stroke-linecap="round">
          <path d="M52,128 L70,88 L88,128" />
          <path d="M78,128 L102,66 L126,128" />
          <path d="M112,128 L132,94 L152,128" />
          <path d="M140,128 L156,106 L172,128" />
          <path d="M34,132 C60,122 130,124 174,130" stroke-width="1" />
        </g>
        <g stroke="#5d421f" stroke-width="0.9" opacity="0.42" stroke-linecap="round">
          <path d="M76,96 l7,7 M82,108 l7,7 M88,120 l6,6" />
          <path d="M106,80 l7,7 M110,92 l7,7 M115,104 l7,7 M119,116 l6,6" />
          <path d="M136,100 l6,6 M141,112 l6,6" />
          <path d="M160,112 l5,5 M164,122 l4,4" />
          <path d="M98,74 l4,-4 l4,4 M66,94 l3,-3 l3,3 M128,100 l3,-3 l3,3" stroke-width="1" />
        </g>
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.5">
          <path d="M148,120 l4,-8 l4,8 Z" /><line x1="152" y1="120" x2="152" y2="124" />
          <path d="M162,118 l4,-8 l4,8 Z" /><line x1="166" y1="118" x2="166" y2="122" />
        </g>
        <!-- 源头小湖 -->
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.55">
          <ellipse cx="60" cy="112" rx="12" ry="5.5" />
          <path d="M52,112 q4,-3 8,0 M56,115 q4,-2 8,0" stroke-width="0.8" opacity="0.7" />
        </g>
        <text x="34" y="124" font-size="11" fill="#5d421f" opacity="0.6" font-family="'KaiTi','STKaiti',serif" letter-spacing="1">高原 · 西北</text>

        <!-- 比例尺 -->
        <g stroke="#5d421f" stroke-width="1" opacity="0.5">
          <line x1="40" y1="150" x2="128" y2="150" />
          <line x1="40" y1="146" x2="40" y2="154" /><line x1="70" y1="147" x2="70" y2="153" />
          <line x1="100" y1="147" x2="100" y2="153" /><line x1="128" y1="146" x2="128" y2="154" />
        </g>
        <text x="134" y="154" font-size="9.5" fill="#5d421f" opacity="0.55" font-family="'KaiTi','STKaiti',serif">十里</text>

        <!-- 河流（源自西北湖，横贯北缘，折沿东缘入海） -->
        <g fill="none" stroke="#5d421f" stroke-width="2.4" opacity="0.5" stroke-linecap="round">
          <path d="M60,112 C82,98 106,78 136,66 C166,54 200,48 232,46 C264,46 300,48 336,50 C372,52 396,58 420,70 C434,80 442,94 446,112 C450,136 451,166 450,196 C449,226 450,240 452,258 C454,296 454,340 450,378 C446,414 436,450 424,474" />
          <path d="M62,115 C84,101 108,82 138,70 C168,58 202,52 232,50 C264,50 300,52 336,54 C371,56 394,62 417,73 C431,82 438,94 442,112 C446,136 447,166 446,196 C445,226 446,240 448,258 C450,296 450,340 446,378 C442,414 432,448 420,472" stroke-width="1" opacity="0.6" />
        </g>
        <g stroke="#5d421f" stroke-width="0.9" opacity="0.4" stroke-linecap="round">
          <line x1="120" y1="58" x2="120" y2="66" /><line x1="150" y1="52" x2="150" y2="60" />
          <line x1="182" y1="48" x2="182" y2="56" /><line x1="214" y1="47" x2="214" y2="55" />
          <line x1="248" y1="47" x2="248" y2="55" /><line x1="282" y1="49" x2="282" y2="57" />
          <line x1="316" y1="51" x2="316" y2="59" /><line x1="350" y1="54" x2="350" y2="62" />
          <line x1="384" y1="60" x2="384" y2="68" /><line x1="408" y1="68" x2="408" y2="76" />
          <line x1="432" y1="86" x2="432" y2="94" /><line x1="440" y1="106" x2="440" y2="114" />
          <line x1="456" y1="140" x2="448" y2="144" /><line x1="456" y1="170" x2="448" y2="174" />
          <line x1="456" y1="200" x2="448" y2="204" /><line x1="456" y1="288" x2="448" y2="292" />
          <line x1="454" y1="322" x2="446" y2="326" /><line x1="450" y1="356" x2="442" y2="360" />
          <line x1="444" y1="386" x2="436" y2="390" /><line x1="436" y1="412" x2="428" y2="416" />
        </g>
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M160,44 l7,4 l-7,4" />
          <path d="M288,45 l7,4 l-7,4" />
          <path d="M456,238 l4,7 l-4,7" />
          <path d="M452,342 l4,7 l-4,7" />
        </g>
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.42" stroke-linecap="round">
          <path d="M424,474 C436,498 444,516 450,536" />
          <path d="M424,474 C428,498 430,516 431,534" />
          <path d="M424,474 C419,496 416,514 414,530" />
        </g>
        <!-- 西桥（北缘） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.3" opacity="0.6" stroke-linecap="round">
          <path d="M250,52 Q262,40 274,52" />
          <line x1="255" y1="54" x2="255" y2="60" /><line x1="262" y1="52" x2="262" y2="59" /><line x1="269" y1="54" x2="269" y2="60" />
          <line x1="248" y1="56" x2="244" y2="56" /><line x1="276" y1="56" x2="280" y2="56" />
        </g>
        <text x="244" y="38" font-size="10.5" fill="#5d421f" opacity="0.6" font-family="'KaiTi','STKaiti',serif">西桥</text>
        <!-- 东桥（东缘） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.3" opacity="0.6" stroke-linecap="round">
          <path d="M440,260 Q452,250 464,260" />
          <line x1="445" y1="262" x2="445" y2="268" /><line x1="452" y1="260" x2="452" y2="267" /><line x1="459" y1="262" x2="459" y2="268" />
          <line x1="438" y1="264" x2="434" y2="264" /><line x1="466" y1="264" x2="470" y2="264" />
        </g>
        <text x="466" y="256" font-size="10.5" fill="#5d421f" opacity="0.6" font-family="'KaiTi','STKaiti',serif">东桥</text>
        <text x="352" y="70" font-size="10.5" fill="#5d421f" opacity="0.5" font-family="'KaiTi','STKaiti',serif">河流</text>

        <!-- 森林（左下，针阔混交） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.2" opacity="0.55" stroke-linejoin="round" stroke-linecap="round">
          <path d="M42,556 l-7,-11 l5,-6 l-8,-8 l14,0 l-8,8 l5,6 Z" /><line x1="46" y1="556" x2="46" y2="564" />
          <path d="M70,566 l-7,-11 l5,-6 l-8,-8 l14,0 l-8,8 l5,6 Z" /><line x1="74" y1="566" x2="74" y2="574" />
          <path d="M118,558 l-7,-11 l5,-6 l-8,-8 l14,0 l-8,8 l5,6 Z" /><line x1="122" y1="558" x2="122" y2="566" />
          <path d="M146,576 l-6,-10 l4,-5 l-7,-7 l13,0 l-7,7 l4,5 Z" /><line x1="149" y1="576" x2="149" y2="583" />
          <path d="M56,586 a8,8 0 0,1 16,0" /><line x1="64" y1="586" x2="64" y2="594" />
          <path d="M96,544 a9,9 0 0,1 18,0" /><line x1="105" y1="544" x2="105" y2="553" />
          <path d="M136,588 a7,7 0 0,1 14,0" /><line x1="143" y1="588" x2="143" y2="595" />
          <path d="M88,576 a7,7 0 0,1 14,0" /><line x1="95" y1="576" x2="95" y2="583" />
          <path d="M158,548 a8,8 0 0,1 16,0" /><line x1="166" y1="548" x2="166" y2="556" />
          <path d="M126,528 a8,8 0 0,1 16,0" /><line x1="134" y1="528" x2="134" y2="536" />
          <path d="M60,590 l-5,3 M100,548 l-6,3 M140,592 l-5,3 M92,580 l-5,3 M162,552 l-5,3 M130,532 l-5,3" stroke-width="0.9" opacity="0.6" />
        </g>
        <!-- 小鹿 -->
        <g fill="none" stroke="#5d421f" stroke-width="1.2" opacity="0.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M28,532 C32,523 44,522 48,530" />
          <path d="M48,530 L52,520" />
          <path d="M52,520 l-5,-5 M52,520 l3,-6" />
          <line x1="34" y1="530" x2="34" y2="541" /><line x1="42" y1="530" x2="42" y2="541" />
          <path d="M28,532 l-3,4" stroke-width="1" />
        </g>
        <text x="32" y="484" font-size="11" fill="#5d421f" opacity="0.6" font-family="'KaiTi','STKaiti',serif" letter-spacing="1">森林 · 西南</text>

        <!-- 沙漠沙丘（右缘，带皴线） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.2" opacity="0.55" stroke-linecap="round">
          <path d="M428,372 Q458,350 494,366" />
          <path d="M442,356 Q468,340 504,354" />
          <path d="M456,340 Q480,328 510,338" />
          <path d="M470,328 Q490,320 512,326" />
          <path d="M448,380 l5,4 M466,364 l5,4 M486,366 l5,4 M476,352 l4,4 M496,346 l4,4 M488,332 l4,3" stroke-width="0.8" opacity="0.45" />
        </g>
        <g fill="none" stroke="#5d421f" stroke-width="1.1" opacity="0.55" stroke-linecap="round">
          <path d="M502,330 L502,306 M502,314 l-8,-4 M502,318 l8,-5" />
          <path d="M524,320 L524,300 M524,306 l6,-4" />
        </g>
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.5">
          <ellipse cx="448" cy="384" rx="6" ry="4" />
          <ellipse cx="516" cy="372" rx="5" ry="3.5" />
        </g>
        <text x="396" y="394" font-size="11" fill="#5d421f" opacity="0.6" font-family="'KaiTi','STKaiti',serif" letter-spacing="1">沙漠 · 东北</text>

        <!-- 近海波浪（右下，密集浪花） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.1" opacity="0.5" stroke-linecap="round">
          <path d="M392,462 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0" />
          <path d="M400,480 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0" />
          <path d="M392,500 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0" />
          <path d="M398,518 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0" />
          <path d="M390,538 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0" />
          <path d="M396,558 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0 q9,-7 18,0" />
        </g>
        <g fill="#5d421f" opacity="0.45">
          <circle cx="430" cy="456" r="1.4" /><circle cx="466" cy="456" r="1.4" /><circle cx="502" cy="456" r="1.4" />
          <circle cx="418" cy="494" r="1.4" /><circle cx="454" cy="494" r="1.4" /><circle cx="490" cy="494" r="1.4" />
          <circle cx="424" cy="532" r="1.4" /><circle cx="460" cy="532" r="1.4" />
          <circle cx="434" cy="552" r="1.4" /><circle cx="470" cy="552" r="1.4" />
        </g>
        <!-- 双桅帆船 -->
        <g fill="none" stroke="#5d421f" stroke-width="1.3" opacity="0.62" stroke-linejoin="round" stroke-linecap="round">
          <path d="M470,506 Q488,522 512,506 L507,502 L475,502 Z" />
          <line x1="478" y1="504" x2="505" y2="504" stroke-width="0.9" />
          <line x1="484" y1="506" x2="500" y2="506" stroke-width="0.7" opacity="0.7" />
          <line x1="483" y1="502" x2="483" y2="478" />
          <line x1="499" y1="502" x2="499" y2="470" />
          <path d="M483,478 Q472,486 478,498" stroke-width="1.4" />
          <path d="M483,480 Q490,486 486,498" stroke-width="1" opacity="0.7" />
          <path d="M499,470 Q510,479 504,496" stroke-width="1.4" />
          <path d="M499,472 Q506,479 502,496" stroke-width="1" opacity="0.7" />
          <path d="M499,470 L489,472 L499,476 Z" fill="#5d421f" fill-opacity="0.6" stroke="none" />
          <line x1="475" y1="502" x2="466" y2="496" />
          <path d="M470,508 C460,512 454,515 450,517 M508,508 C514,511 520,514 525,516" stroke-width="0.9" opacity="0.5" />
        </g>
        <!-- 鲸尾 -->
        <g fill="none" stroke="#5d421f" stroke-width="1.2" opacity="0.55" stroke-linecap="round" stroke-linejoin="round">
          <path d="M420,488 C412,478 406,474 412,466" />
          <path d="M420,488 C428,478 434,474 428,466" />
          <path d="M416,478 L424,478" stroke-width="0.9" />
          <path d="M404,498 q4,4 8,0 M424,498 q4,4 8,0" stroke-width="0.9" />
        </g>
        <!-- 小岛椰树 -->
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.55" stroke-linecap="round">
          <path d="M506,456 Q518,446 530,456" />
          <line x1="514" y1="456" x2="514" y2="448" /><path d="M514,448 l-6,-1 M514,448 l5,-3 M514,448 l-1,-5" stroke-width="0.9" />
          <line x1="522" y1="456" x2="522" y2="450" /><path d="M522,450 l-5,-2 M522,450 l5,-2 M522,450 l0,-4" stroke-width="0.8" />
        </g>
        <text x="386" y="592" font-size="11" fill="#5d421f" opacity="0.6" font-family="'KaiTi','STKaiti',serif" letter-spacing="1">近海 · 东南</text>

        <!-- 寻宝虚线路线（左缘，锚标+宝藏叉） -->
        <g fill="none" stroke="#5d421f" stroke-width="1.2" opacity="0.5" stroke-linecap="round">
          <path d="M48,240 C66,270 36,300 54,330 S28,390 46,420" stroke-dasharray="1 7" />
        </g>
        <g stroke="#5d421f" stroke-width="1.3" opacity="0.55" stroke-linecap="round">
          <path d="M54,324 L64,314 M54,314 L64,324" />
          <path d="M46,414 L56,404 M46,404 L56,414" />
        </g>
        <g fill="none" stroke="#5d421f" stroke-width="1.1" opacity="0.55" stroke-linecap="round">
          <path d="M46,226 L50,226 M48,214 L48,226" />
          <circle cx="48" cy="210" r="4" />
          <path d="M44,228 L52,228 M44,232 L52,232" stroke-width="0.9" />
        </g>
        <text x="34" y="370" font-size="10" fill="#5d421f" opacity="0.5" font-family="'KaiTi','STKaiti',serif" transform="rotate(-90 34 370)" text-anchor="middle">寻宝路线</text>

        <!-- 飞鸟（标题右侧天空） -->
        <g fill="none" stroke="#5d421f" stroke-width="1" opacity="0.4" stroke-linecap="round">
          <path d="M356,80 q4,-4 8,0 q4,-4 8,0" />
          <path d="M382,70 q4,-4 8,0 q4,-4 8,0" />
          <path d="M410,82 q4,-4 8,0 q4,-4 8,0" />
          <path d="M392,94 q3,-3 6,0 q3,-3 6,0" />
        </g>
      </svg>

      <!-- 描金双线框 -->
      <span class="frame-line frame-outer" />
      <span class="frame-line frame-inner" />
      <!-- 四角饰 -->
      <span class="orn orn-tl">❧</span>
      <span class="orn orn-tr">❧</span>
      <span class="orn orn-bl">✦</span>
      <span class="orn orn-br">✦</span>

      <header class="paper-head">
        <div class="emblem" title="大富翁·暗战" aria-hidden="true">
          <svg viewBox="0 0 56 48" class="hat">
            <ellipse cx="28" cy="41" rx="18" ry="4.2" fill="rgba(74,45,18,0.20)" />
            <path d="M15 18c0-3 2-5 5-5h16c3 0 5 2 5 5l-2 4H17z" fill="#2c1a0c" />
            <path d="M13 22h30c3 0 6 2.4 6 5.2S46 33 43 33H13c-3 0-6-2.4-6-5.8S10 22 13 22z" fill="#3a2410" />
            <path d="M14 23h28c2 0 4 1.4 4 3.4S44 30 42 30H14c-2 0-4-1.6-4-3.6S12 23 14 23z" fill="#4a3018" />
            <path d="M17 17.5h22l-1.4 3H18.4z" fill="#c9a24a" />
            <path d="M13.5 24.5h29" stroke="#c9a24a" stroke-width="1.1" stroke-linecap="round" opacity=".85" />
            <path d="M18 33h4l-1 8h-2zM34 33h4l-1 8h-2z" fill="#2c1a0c" opacity=".55" />
          </svg>
        </div>
        <div class="cartouche">
          <h1 class="title">
            <span class="ch c0">大</span><span class="ch c1">富</span><span class="ch c2">翁</span>
          </h1>
          <div class="subtitle-row">
            <span class="rule-line" />· 暗战 ·<span class="rule-line" />
          </div>
        </div>
        <p class="tagline">四季轮转 · 垄断反制 · 桥梁咽喉 · 局中博弈</p>
      </header>

      <div class="flourish">─ ❦ ─</div>

      <div class="player-count">
        <span class="label"><Icon name="users" :size="13" /> 玩家数量</span>
        <div class="count-row">
          <button
            v-for="n in [4, 5, 6, 7, 8]" :key="n"
            class="btn small count-btn" :class="{ active: count.value === n }"
            @click="count.value = n"
          >{{ n }} 人</button>
        </div>
      </div>

      <div class="setup-list">
        <div v-for="(p, i) in players.slice(0, count.value)" :key="i" class="setup-row" :style="{ '--pc': colors[i] }">
          <span class="shape-dot" :class="'shape-' + shapes[i]" />
          <input v-model="p.name" class="name-input" maxlength="8" />
          <span class="role-tag" :class="{ human: !p.isAI }">{{ p.isAI ? 'AI' : '你' }}</span>
        </div>
      </div>

      <div class="options-row">
        <span class="label"><Icon name="gear" :size="13" /> AI 难度</span>
        <button
          v-for="d in AI_DIFFICULTY_ORDER" :key="d"
          class="btn small" :class="{ active: difficulty.value === d }"
          @click="difficulty.value = d"
        >{{ AI_DIFFICULTY[d].label }}</button>
      </div>

      <div class="options-row">
        <span class="label"><Icon name="hourglass" :size="13" /> 动画速度</span>
        <button
          v-for="s in [['slow', '慢'], ['normal', '正常'], ['fast', '快']] as const" :key="s[0]"
          class="btn small" :class="{ active: store.speed === s[0] }"
          @click="setSpeed(s[0])"
        >{{ s[1] }}</button>
      </div>

      <button v-if="saved" class="btn resume-btn" @click="resume"><Icon name="scroll" :size="15" /> 继续上次对局</button>
      <button class="btn primary begin-btn" @click="begin">开 始 游 戏</button>

      <!-- 烛光里的浮尘（轻量装饰，6 个元素） -->
      <span v-for="n in 6" :key="'dust' + n" class="dust" :class="'dust-' + n" aria-hidden="true" />

      <!-- 火漆印章（左上角） -->
      <div class="wax-seal" title="以富甲天下">富</div>
    </div>

    <!-- 屏幕右下角规则按钮（圆形 i） -->
    <button class="info-btn" title="游戏规则" aria-label="游戏规则" @click="emit('show-help')">i</button>
  </div>
</template>

<style scoped>
/* ---------- 背景：烛光下的实木桌面 ---------- */
.start-screen {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: flex-start;   /* 配合 .parchment margin:auto 居中；内容超高（4~8 人）时可滚动 */
  justify-content: center;
  padding: 26px;
  overflow-x: hidden;
  overflow-y: auto;
  background-color: var(--wood-3);
  background-image:
    /* 四角暗角 */
    radial-gradient(ellipse 96% 78% at 50% 46%, transparent 44%, rgba(0, 0, 0, 0.66) 100%),
    /* 烛光（桌面中央偏上被照亮） */
    radial-gradient(ellipse 56% 42% at 50% 34%, rgba(255, 198, 120, 0.20), transparent 70%),
    /* 斜向光泽 */
    linear-gradient(115deg, rgba(255, 236, 190, 0.08) 0%, transparent 34%),
    /* 桌面明暗 */
    linear-gradient(180deg, rgba(92, 58, 26, 0.18), rgba(28, 15, 5, 0.44)),
    /* 木纹 */
    var(--tex-wood);
  background-size: auto, auto, auto, auto, 900px 900px;
}

/* 羊皮纸在桌面上投下的椭圆阴影 */
.start-screen::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(660px, 90vw);
  height: 340px;
  transform: translate(-50%, 46%);
  background: radial-gradient(ellipse, rgba(0, 0, 0, 0.55), transparent 66%);
  filter: blur(16px);
  z-index: 0;
  pointer-events: none;
}

/* ---------- 羊皮纸旧地图 ---------- */
.parchment {
  position: relative;
  z-index: 1;
  max-width: 540px;
  width: 100%;
  margin: auto;          /* 居中；屏幕放不下时随页面滚动 */
  padding: 38px 36px 46px;
  text-align: center;
  transform: rotate(-0.4deg);
  border-radius: 4px 18px 5px 14px / 14px 5px 17px 4px;
  border: 2px solid #7a5a2e;
  background-color: var(--paper-1);
  background-image:
    /* 轻微磨损（被摩挲掉的亮斑） */
    radial-gradient(ellipse 130px 76px at 8% 30%, rgba(255, 250, 232, 0.30), transparent 70%),
    radial-gradient(ellipse 160px 96px at 92% 58%, rgba(255, 248, 226, 0.24), transparent 70%),
    radial-gradient(ellipse 96px 62px at 56% 86%, rgba(255, 250, 230, 0.22), transparent 70%),
    /* 岁月污渍 */
    radial-gradient(ellipse 140px 100px at 12% 18%, rgba(146, 96, 34, 0.16), transparent 72%),
    radial-gradient(ellipse 170px 120px at 88% 76%, rgba(116, 72, 18, 0.14), transparent 72%),
    /* 边缘老化 */
    radial-gradient(ellipse 80% 70% at 50% 45%, transparent 58%, rgba(122, 82, 30, 0.30) 100%),
    /* 纸纹 */
    var(--tex-paper),
    /* 泛黄底色 */
    linear-gradient(168deg, #fbf0d2 0%, #f0dcaa 42%, #e5c98f 100%);
  background-size: auto, auto, auto, auto, auto, auto, 420px 420px, auto;
  box-shadow:
    inset 0 0 64px rgba(94, 58, 14, 0.38),
    inset 0 0 14px rgba(94, 58, 14, 0.32),
    0 14px 44px rgba(0, 0, 0, 0.6),
    0 3px 10px rgba(0, 0, 0, 0.5);
}

/* 地图装饰层与内容分层 */
.map-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
  border-radius: 4px 18px 5px 14px / 14px 5px 17px 4px;
  overflow: hidden;
}
.parchment > :not(.map-art):not(.frame-line):not(.orn):not(.wax-seal):not(.dust) {
  position: relative;
  z-index: 1;
}

/* 描金双线框 */
.frame-line {
  position: absolute;
  z-index: 2;
  pointer-events: none;
  border: 1.5px solid rgba(126, 84, 30, 0.55);
}
.frame-outer { inset: 9px; border-radius: 3px 15px 4px 12px / 12px 4px 14px 3px; }
.frame-inner { inset: 13px; border: 1px solid rgba(126, 84, 30, 0.28); border-radius: 2px 13px 3px 11px / 11px 3px 12px 2px; }

/* 四角饰 */
.orn {
  position: absolute;
  z-index: 2;
  font-size: 17px;
  color: #8a5f28;
  opacity: 0.85;
  pointer-events: none;
}
.orn-tl { top: 2px; left: 16px; transform: rotate(8deg); }
.orn-tr { top: 3px; right: 16px; transform: rotate(94deg); }
.orn-bl { bottom: 3px; left: 16px; transform: rotate(-94deg); }
.orn-br { bottom: 4px; right: 16px; transform: rotate(-8deg); }

/* ---------- 标题（手绘墨迹风） ---------- */
.emblem {
  display: block;
  width: 54px;
  height: 46px;
  margin: 0 auto 2px;
  transform: rotate(-6deg);
  filter: drop-shadow(2px 3px 3px rgba(70, 40, 0, 0.35));
}
.hat { width: 100%; height: 100%; }
.cartouche {
  position: relative;
  display: inline-block;
  padding: 10px 30px 14px;
  transform: rotate(-0.5deg);
}
.cartouche::before,
.cartouche::after {
  content: '';
  position: absolute;
  pointer-events: none;
}
.cartouche::before {
  inset: 0;
  border: 2px solid rgba(107, 74, 38, 0.55);
  border-radius: 10px 24px 12px 22px / 22px 12px 24px 10px;
  transform: rotate(-0.8deg);
}
.cartouche::after {
  inset: 5px;
  border: 1px solid rgba(107, 74, 38, 0.32);
  border-radius: 8px 20px 9px 18px / 18px 9px 20px 8px;
  transform: rotate(0.6deg);
}
.title {
  margin: 0;
  font-size: 38px;
  letter-spacing: 4px;
  color: #4a2d12;
  font-weight: bold;
  /* 墨迹洇染 */
  text-shadow:
    0 0 3px rgba(74, 45, 18, 0.45),
    1px 1px 0 rgba(255, 240, 200, 0.55),
    2px 3px 4px rgba(64, 34, 0, 0.22);
}
/* 逐字手写抖动 */
.ch { display: inline-block; }
.c0 { transform: rotate(-3deg) translateY(2px); }
.c1 { transform: rotate(2.5deg) translateY(-2px) scale(1.04); }
.c2 { transform: rotate(-2deg) translateY(1px); }
.subtitle-row {
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #6d4c24;
  font-size: 16px;
  letter-spacing: 4px;
}
.rule-line {
  display: inline-block;
  width: 40px;
  height: 0;
  border-top: 1.5px solid #a8814a;
  position: relative;
}
.rule-line::before,
.rule-line::after {
  content: '';
  position: absolute;
  top: -3px;
  width: 5px;
  height: 5px;
  border: 1.5px solid #a8814a;
  transform: rotate(45deg);
}
.rule-line::before { left: -7px; }
.rule-line::after { right: -7px; }
.tagline {
  margin: 8px 0 0;
  color: #7d5f38;
  font-size: 13px;
  letter-spacing: 2px;
}
.flourish {
  margin: 14px 0 6px;
  color: #8a683c;
  font-size: 14px;
  letter-spacing: 2px;
}

/* ---------- 表单 ---------- */
.player-count {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 5px; margin: 12px 0 6px;
}
.count-row { display: flex; justify-content: center; gap: 6px; flex-wrap: wrap; }
.count-btn { padding: 4px 10px; font-size: 12.5px; }
.label {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 12.5px; color: #63461f; letter-spacing: 1px;
}
.label :deep(.ui-icon) { color: var(--brass-3); }
.setup-list { display: flex; flex-direction: column; gap: 9px; margin: 8px auto 16px; max-width: 380px; }
.setup-row { display: flex; align-items: center; gap: 10px; position: relative; }
.role-tag {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10.5px;
  line-height: 1.45;
  padding: 1px 7px;
  border-radius: 7px;
  background: rgba(120, 90, 40, 0.12);
  border: 1px solid rgba(153, 122, 74, 0.7);
  color: #6a4a18;
  pointer-events: none;
}
.role-tag.human { background: rgba(255, 215, 106, 0.3); border-color: #c9a227; font-weight: bold; }
.resume-btn {
  width: 78%; margin-bottom: 10px; font-size: 15.5px; padding: 10px; letter-spacing: 3px;
}
.resume-btn:hover { filter: brightness(1.12); }
.shape-dot {
  width: 18px; height: 18px; background: var(--pc); flex: none;
  border: 2px solid rgba(255, 250, 235, 0.9); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}
.shape-circle { border-radius: 50%; }
.shape-triangle { clip-path: polygon(50% 0, 100% 100%, 0 100%); border-radius: 0; }
.shape-diamond { transform: rotate(45deg); width: 14px; height: 14px; margin: 2px; }
.shape-star { clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%); border-radius: 0; }
.shape-hexagon { clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%); border-radius: 0; }
.shape-plus { clip-path: polygon(35% 0, 65% 0, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0 65%, 0 35%, 35% 35%); border-radius: 0; }
.shape-heart { clip-path: polygon(50% 90%, 8% 50%, 0 28%, 16% 8%, 38% 8%, 50% 24%, 62% 8%, 84% 8%, 100% 28%, 92% 50%); border-radius: 0; }

/* 小按钮沿用全局 .btn 木牌样式，仅保留尺寸 */
.btn.small { border-radius: 8px; }

/* 输入框：羊皮纸内凹 */
.name-input {
  flex: 1;
  min-width: 0;
  padding: 8px 48px 8px 12px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--brass-3);
  background-image:
    radial-gradient(ellipse 44px 26px at 86% 22%, rgba(255, 250, 232, 0.45), transparent 70%),
    var(--tex-paper),
    linear-gradient(180deg, #fbf2d6, #eedcaa);
  background-size: auto, 220px 220px, auto;
  box-shadow:
    inset 0 2px 5px rgba(110, 70, 20, 0.28),
    inset 0 -1px 2px rgba(255, 250, 230, 0.55);
  font-size: 15px;
  color: var(--ink);
  font-family: inherit;
}
.name-input:focus {
  outline: 2px solid rgba(201, 162, 74, 0.55);
  outline-offset: 1px;
  filter: brightness(1.03);
}
.options-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 4px 0 20px; flex-wrap: wrap; }
.seed-label { margin-left: 12px; }
.seed-input {
  width: 104px; padding: 6px 9px;
  border-radius: 5px;
  border: 1.5px solid #8a6534;
  background-image:
    radial-gradient(ellipse 30px 18px at 84% 20%, rgba(255, 250, 232, 0.4), transparent 70%),
    var(--tex-paper),
    linear-gradient(180deg, #faf0d0, #eedcaa);
  box-shadow:
    inset 0 2px 4px rgba(110, 70, 20, 0.3),
    inset 0 -1px 2px rgba(255, 250, 230, 0.5),
    0 1px 0 rgba(255, 244, 210, 0.4);
  color: #4a2e10;
  font-family: inherit;
}

/* ---------- 开始按钮：黄铜主按钮 + 更宽的点击面 ---------- */
.begin-btn {
  width: 78%;
  font-size: 21px;
  padding: 14px;
  letter-spacing: 9px;
  text-indent: 9px;
  border-radius: 11px;
}
/* ---------- 火漆印章（左上角，做旧手绘风） ---------- */
.wax-seal {
  position: absolute;
  z-index: 3;
  left: 18px;
  top: -22px;
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 25px;
  font-weight: bold;
  color: #f2dcb2;
  text-shadow: 0 1px 2px rgba(40, 8, 0, 0.6);
  background-image:
    /* 蜡面颗粒 */
    var(--tex-paper),
    /* 蜡体明暗 */
    radial-gradient(circle at 32% 26%, rgba(255, 208, 160, 0.4), transparent 48%),
    radial-gradient(circle at 66% 78%, rgba(60, 8, 0, 0.45), transparent 60%),
    radial-gradient(circle at 34% 30%, #b8553c 0%, #9c2f1e 48%, #74190e 100%);
  background-size: 140px 140px, auto, auto, auto;
  border-radius: 52% 44% 55% 46% / 48% 55% 43% 53%;
  transform: rotate(-10deg);
  box-shadow:
    inset 0 3px 8px rgba(60, 10, 0, 0.65),
    inset 0 -2px 5px rgba(255, 200, 150, 0.2),
    0 4px 10px rgba(0, 0, 0, 0.55);
}
/* 蜡面裂纹 */
.wax-seal::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    radial-gradient(ellipse 7px 3px at 22% 66%, transparent 55%, rgba(40, 8, 0, 0.7) 56% 62%, transparent 63%),
    radial-gradient(ellipse 9px 4px at 70% 28%, transparent 55%, rgba(40, 8, 0, 0.55) 56% 62%, transparent 63%),
    radial-gradient(ellipse 6px 3px at 52% 88%, transparent 58%, rgba(40, 8, 0, 0.5) 59% 65%, transparent 66%);
  pointer-events: none;
}
/* 边缘滴痕 */
.wax-seal::after {
  content: '';
  position: absolute;
  left: 38px;
  bottom: -9px;
  width: 7px;
  height: 10px;
  background: radial-gradient(ellipse at 50% 15%, #9c2f1e, #74190e 70%);
  border-radius: 55% 55% 60% 45% / 70% 70% 40% 30%;
  box-shadow: inset 0 -2px 3px rgba(40, 8, 0, 0.5);
  transform: rotate(4deg);
}

/* ---------- 右下角规则按钮（圆形 i，木圈+羊皮纸面） ---------- */
.info-btn {
  position: absolute;
  z-index: 3;
  right: 22px;
  bottom: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  cursor: pointer;
  font-family: 'Georgia', 'Times New Roman', serif;
  font-style: italic;
  font-weight: bold;
  font-size: 23px;
  color: #4a2d10;
  border: 2px solid #5f4213;
  background-image:
    radial-gradient(circle at 32% 26%, rgba(255, 246, 215, 0.9), rgba(255, 246, 215, 0) 46%),
    var(--tex-paper),
    linear-gradient(180deg, #ecd8a4 0%, #d6b87c 55%, #c2a25e 100%);
  background-size: auto, 200px 200px, auto;
  box-shadow:
    inset 0 2px 3px rgba(255, 246, 215, 0.85),
    inset 0 -3px 5px rgba(90, 55, 10, 0.4),
    inset 0 0 10px rgba(120, 80, 25, 0.25),
    0 3px 7px rgba(0, 0, 0, 0.55),
    0 1px 2px rgba(0, 0, 0, 0.4);
  text-shadow: 0 1px 0 rgba(255, 244, 210, 0.55);
  transition: transform 0.1s, filter 0.15s;
}
/* 木纹外圈 */
.info-btn::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: 50%;
  z-index: -1;
  background-image:
    radial-gradient(circle at 32% 26%, rgba(255, 236, 190, 0.3), transparent 62%),
    var(--tex-wood),
    linear-gradient(180deg, #ac8046 0%, #7d5a2c 60%, #63441d 100%);
  background-size: auto, 180px 180px, auto;
  box-shadow:
    0 3px 7px rgba(0, 0, 0, 0.55),
    0 1px 2px rgba(0, 0, 0, 0.4),
    inset 0 1px 1px rgba(255, 232, 180, 0.5);
}
.info-btn:hover { filter: brightness(1.12); }
.info-btn:active {
  transform: translateY(2px);
  box-shadow:
    inset 0 2px 6px rgba(90, 55, 10, 0.5),
    0 1px 3px rgba(0, 0, 0, 0.4);
}

/* ---------- 轻量动效：罗盘指针微摆、浮尘、羊皮纸入场 ---------- */
.compass-needle {
  transform-origin: 452px 100px;
  animation: needleSway 11s ease-in-out infinite;
}
@keyframes needleSway {
  0%, 100% { transform: rotate(-2.2deg); }
  50% { transform: rotate(2.6deg); }
}
.parchment { animation: paperIn 0.45s ease-out both; }
@keyframes paperIn { from { opacity: 0; } }
.dust {
  position: absolute;
  z-index: 1;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 246, 208, 0.85), rgba(255, 238, 180, 0) 70%);
  opacity: 0.55;
  pointer-events: none;
  animation: dustFloat 10s ease-in-out infinite;
}
.dust-1 { left: 9%; top: 64%; animation-delay: -1.2s; animation-duration: 9s; }
.dust-2 { left: 86%; top: 30%; animation-delay: -3.4s; animation-duration: 12s; }
.dust-3 { left: 74%; top: 72%; animation-delay: -5.1s; animation-duration: 11s; }
.dust-4 { left: 18%; top: 22%; animation-delay: -2.3s; animation-duration: 13s; }
.dust-5 { left: 54%; top: 12%; animation-delay: -6.6s; animation-duration: 10s; }
.dust-6 { left: 44%; top: 84%; animation-delay: -4.2s; animation-duration: 12.5s; }
@keyframes dustFloat {
  0%, 100% { transform: translate3d(0, 0, 0); opacity: 0.18; }
  30% { opacity: 0.6; }
  50% { transform: translate3d(12px, -22px, 0); opacity: 0.45; }
  70% { opacity: 0.55; }
}

/* ---------- 小屏适配 ---------- */
@media (max-width: 480px) {
  .start-screen {
    overflow-y: auto;    /* 极矮屏幕允许滚动，避免内容被裁剪 */
  }
  .start-screen::before { display: none; }  /* 隐藏地面阴影，防止撑出滚动 */
  .parchment { padding: 28px 22px 38px; }
  .title { font-size: 30px; letter-spacing: 2px; }
  .tagline { font-size: 11.5px; letter-spacing: 1px; }
  .info-btn { right: 14px; bottom: 12px; }
  .wax-seal { left: 12px; top: -18px; width: 48px; height: 48px; font-size: 22px; }
}

/* ---------- 横屏/矮视口适配（手机横屏菜单一屏显示；4 人开局无需滚动） ---------- */
@media (max-height: 800px) {
  .start-screen {
    padding: 26px 10px 10px;
    align-items: flex-start;   /* 内容超高时顶部对齐，避免被裁切 */
  }
  .start-screen::before { display: none; }  /* 隐藏地面阴影，防止其变换框撑出滚动 */
  .parchment { padding: 14px 24px 28px; }
  .emblem { font-size: 26px; margin-bottom: 0; }
  .title { font-size: 24px; letter-spacing: 2px; }
  .cartouche { padding: 6px 22px 9px; }
  .subtitle-row { font-size: 13px; margin-top: 3px; }
  .tagline { font-size: 11px; letter-spacing: 1px; margin-top: 4px; }
  .flourish { margin: 6px 0 2px; }
  .player-count { margin: 6px 0; }
  .setup-list { gap: 6px; margin-bottom: 8px; }
  .options-row { margin-bottom: 10px; }
  .begin-btn { padding: 9px; font-size: 17px; letter-spacing: 7px; }
  .name-input { padding: 5px 44px 5px 10px; font-size: 14px; }
  .wax-seal {
    left: 10px;
    top: -16px;
    width: 40px;
    height: 40px;
    font-size: 18px;
  }
}

/* 极矮视口（<400px 高）：再压缩 */
@media (max-height: 400px) {
  .subtitle-row, .tagline, .flourish { display: none; }
  .start-screen { padding: 14px 10px 6px; }
  .wax-seal {
    left: 8px;
    top: -12px;
    width: 32px;
    height: 32px;
    font-size: 15px;
  }
  .parchment { padding: 8px 20px 18px; }
  .setup-list { gap: 3px; margin-bottom: 4px; }
  .player-count { margin: 3px 0; }
  .options-row { margin-bottom: 6px; }
  .begin-btn { padding: 7px; font-size: 15px; letter-spacing: 6px; }
}
</style>
