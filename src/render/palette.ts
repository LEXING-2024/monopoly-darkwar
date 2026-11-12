// ============ 棋盘配色（地图 / 地块卡片 / UI 强调色共用同一套） ============
// 原则：中等明度、较高辨识度，四大地形冷暖拉开，避免“灰成一片”。

export interface BiomeColor {
  /** 卡片色带 / 地图主色（CSS） */
  base: string
  /** 受光面（山脊、树冠、沙丘顶） */
  light: string
  /** 背光面 / 墨线阴影 */
  dark: string
  /** 卡片纹理用的数值色 */
  num: number
}

export const BIOME: Record<'forest' | 'plateau' | 'desert' | 'coast', BiomeColor> = {
  // 卡片色带要能在缩小后仍一眼分辨：绿 / 赭 / 金 / 青，四色明度拉开
  forest: { base: '#477038', light: '#82a45d', dark: '#2b4a25', num: 0x477038 },
  plateau: { base: '#8b5f36', light: '#c09464', dark: '#5a3b21', num: 0x8b5f36 },
  desert: { base: '#cf8b32', light: '#edc06b', dark: '#98601d', num: 0xcf8b32 },
  coast: { base: '#2f7580', light: '#6ba5a8', dark: '#1f505b', num: 0x2f7580 },
}
