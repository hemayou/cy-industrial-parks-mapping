import type { SymbolLayerSpecification } from 'maplibre-gl';
import type { PointLabelPlacement, PointLabelStyle } from '../model';

const graphemes = new Intl.Segmenter('zh-CN', { granularity: 'grapheme' });
const targetWidth = 12;
const wide = /[\p{Script=Han}\u3000-\u30ff\uff01-\uff60]/u;
const wordChar = /[a-zA-Z0-9.+&-]/;
const opens = /[（(《〈【〔“‘]/;
const closes = /[，。；：、？！）)》〉】〕”’]/;

export function formatPointLabel(raw: unknown, maxLines: number): string {
  const text = raw === undefined || raw === null ? '' : String(raw).replace(/\s+/gu, ' ').trim();
  const limit = Math.min(6, Math.max(1, Math.trunc(maxLines)));
  if (!text || limit === 1) return text;

  const chars = Array.from(graphemes.segment(text), ({ segment }) => segment);
  const widths = [0];
  for (const char of chars) widths.push(widths.at(-1)! + (wide.test(char) ? 1 : char === ' ' ? .36 : .61));
  const total = widths.at(-1)!;
  const rows = Math.min(limit, chars.length, Math.ceil(total / targetWidth));
  if (rows <= 1) return text;

  const lines = [];
  let start = 0;
  for (let row = 0; row < rows - 1; row++) {
    const lastPossible = chars.length - (rows - row - 1);
    const target = widths[start] + (total - widths[start]) / (rows - row);
    let end = start + 1;
    while (end < lastPossible && widths[end] < target) end++;
    let best = end;
    let cost = Infinity;
    for (let next = Math.max(start + 1, end - 3); next <= Math.min(lastPossible, end + 3); next++) {
      const before = chars[next - 1], after = chars[next];
      const penalty = closes.test(after) || opens.test(before) ? 4 :
        wordChar.test(before) && wordChar.test(after) ? 2.1 : before === ' ' || after === ' ' ? -.5 : 0;
      const distance = Math.abs(widths[next] - target) + penalty;
      if (distance < cost) {
        best = next;
        cost = distance;
      }
    }
    lines.push(chars.slice(start, best).join('').trim());
    start = best;
  }
  lines.push(chars.slice(start).join('').trim());
  return lines.filter(Boolean).join('\n');
}

type Fixed = Exclude<PointLabelPlacement, 'auto'>;
type Anchor = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
const placements: Record<Fixed, { anchor: Anchor; offset: [number, number] }> = {
  n: { anchor: 'bottom', offset: [0, -.82] },
  ne: { anchor: 'bottom-left', offset: [.58, -.58] },
  e: { anchor: 'left', offset: [.82, 0] },
  se: { anchor: 'top-left', offset: [.58, .58] },
  s: { anchor: 'top', offset: [0, .82] },
  sw: { anchor: 'top-right', offset: [-.58, .58] },
  w: { anchor: 'right', offset: [-.82, 0] },
  nw: { anchor: 'bottom-right', offset: [-.58, -.58] },
};
const automaticOrder: Fixed[] = ['ne', 'e', 'n', 'se', 's', 'nw', 'w', 'sw'];

export function pointLabelLayout(style: PointLabelStyle): NonNullable<SymbolLayerSpecification['layout']> {
  const typography = {
    // The field contains explicit line breaks. Keep the renderer's width limit above any label.
    'text-max-width': 10000,
    'text-line-height': Math.min(2.5, Math.max(.75, style.lineHeight)),
    'text-justify': style.align,
    'text-padding': 3,
  } as const;
  if (style.placement === 'auto') {
    return {
      ...typography,
      'text-variable-anchor': automaticOrder.map(direction => placements[direction].anchor),
      'text-radial-offset': .82,
    };
  }
  const fixed = placements[style.placement];
  return { ...typography, 'text-anchor': fixed.anchor, 'text-offset': [...fixed.offset] };
}
