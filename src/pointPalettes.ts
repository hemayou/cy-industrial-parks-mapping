export const POINT_PALETTES = [
  { id: 'classic', label: '经典多彩', colors: ['#c53740', '#d26c24', '#258061', '#336fab', '#805da9', '#117b86', '#a44874', '#827025', '#654e42', '#566f78', '#528742', '#b54a2e'] },
  { id: 'tableau', label: '清晰对比 · Tableau', colors: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'] },
  { id: 'dark2', label: '深色出版 · Dark2', colors: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'] },
  { id: 'set2', label: '柔和多彩 · Set2', colors: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'] },
  { id: 'paired', label: '配对对照 · Paired', colors: ['#1f78b4', '#33a02c', '#e31a1c', '#ff7f00', '#6a3d9a', '#b15928', '#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f', '#cab2d6', '#ffff99'] },
  { id: 'okabe-ito', label: '色觉友好 · Okabe–Ito', colors: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00', '#56b4e9', '#f0e442', '#000000'] },
  { id: 'landscape', label: '青绿山水', colors: ['#246e69', '#789e62', '#416f9c', '#b67c44', '#76597f', '#54a99e', '#4b6651', '#ceac62', '#4f587c', '#9e6348'] },
  { id: 'indigo-gold', label: '墨蓝与金', colors: ['#263f69', '#bf8b30', '#3b8199', '#a9633d', '#8873a0', '#3a6757', '#6b88b4', '#d0a869', '#4b5770', '#8e674b'] },
  { id: 'brick', label: '暖灰与岩红', colors: ['#a03e4d', '#d38a53', '#6f708a', '#487c72', '#cfaa65', '#795a66', '#b8594b', '#58748a', '#8b7959', '#bf8290'] },
  { id: 'coast', label: '海岸冷色', colors: ['#266c97', '#2f9581', '#7866a8', '#408aaf', '#427263', '#a76f88', '#698db8', '#58a8a9', '#595c92', '#758956'] },
  { id: 'neon', label: '深底高亮', colors: ['#65dcd1', '#ffb566', '#93abff', '#ff8fa4', '#dcde71', '#dbadfa', '#77d2ff', '#8dec94', '#ffdc80', '#a99bee'] },
] as const;

export type PointPaletteId = (typeof POINT_PALETTES)[number]['id'];

export function pointPalette(id: string | undefined) {
  return POINT_PALETTES.find(palette => palette.id === id) ?? POINT_PALETTES[0];
}
