# 素材目录与区分规则

## 目录结构

```
项目根目录\
├── assets\                 # ← 素材总目录
│   ├── images\             # 通用位图（png/jpg/webp）：背景、图标、贴纸
│   │   └── board-parchment.webp   # 棋盘羊皮纸底图（已在用：scene.ts import 打包加载）
│   ├── sprites\            # 精灵/序列帧（棋子贴图、动画帧、粒子贴图）
│   ├── audio\              # 音频文件（mp3/ogg/wav）：bgm、效果音
│   ├── fonts\              # 字体文件（ttf/otf/woff2）
│   └── README.md           # 本说明
├── 游戏截图\               # 宣传截图（9 张，已有，保持不动）
├── public\                 # Vite 静态目录：仅需要固定 URL 直链的素材放这里（如 favicon、robots）
└── src\                    # 代码生成素材（见下）
```

## 区分规则

### 1. 代码生成素材（当前游戏的实际情况——无需文件）

| 素材 | 生成位置 | 区分方式 |
|------|---------|---------|
| 棋盘 / 地块 / 季节贴图 / 灾害特效 | `src/render/scene.ts` | Phaser 矢量绘制（Graphics、渐变、粒子），按场景图层区分 |
| 棋子形状与描边 | `src/render/pieces.ts` | 按玩家形状枚举（shape）区分 |
| UI 羊皮纸 / 木纹 / 纸纹 | 各 Vue 组件内嵌 SVG data-URI（feTurbulence 噪点） | 按组件区分（TileModal/ActionBar/BuildingModal…） |
| 音效 | `src/core/sfx.ts` | WebAudio 实时合成（tone/noise），按 `SfxName` 枚举区分 |
| 宣传截图 | `游戏截图\` | 按编号 01-09 + 内容命名 |

### 2. 文件素材命名规范（将来添加图片/音频时遵循）

- 前缀按用途：`ui-`（界面）、`tile-`（地块）、`piece-`（棋子）、`fx-`（特效）、`bgm-`（背景音乐）、`sfx-`（效果音）、`shot-`（截图）
- 示例：`assets/sprites/piece-car.png`、`assets/audio/bgm-main.ogg`、`assets/images/ui-logo.png`
- 运行时加载：素材放 `assets\` 下，代码里 `import url from '../../assets/images/xxx.webp'`（Vite 打包自动处理，见 scene.ts 的 board-parchment 用法）；仅需要固定 URL 直链的（favicon 等）放 `public\`

## 当前状态（2026-08-15）

- `assets\images\board-parchment.webp` 已在用：棋盘羊皮纸底图（AIGC 素材，4096×4096 webp，scene.ts preload 后等比铺满 + 边缘晕影叠加；加载失败自动回退程序化羊皮纸）。
- 其余视觉/音效仍为**代码实时生成**（棋盘地块/棋子/特效/音效），`assets\` 其余子目录供后续扩展。
- `游戏截图\` 已有 9 张宣传截图（首页/转盘/行动顺序/命运卡/对局全景/交易/规则/灾害总览等）。
