import type { PointLabelPlacement, PointLabelStyle, TextStyle } from '../model';

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
const directions: Record<Fixed, [number, number]> = {
  n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1],
  s: [0, 1], sw: [-1, 1], w: [-1, 0], nw: [-1, -1],
};
const automaticOrder: Fixed[] = ['ne', 'e', 'n', 'se', 's', 'nw', 'w', 'sw'];

export interface PointLabelMark {
  source: string;
  index: number;
  coordinate: [number, number];
  radius: number;
  label?: { lines: string[]; style: TextStyle; layout: PointLabelStyle };
}

type Pixel = { x: number; y: number };
export type LabelRect = { left: number; top: number; right: number; bottom: number };
type Leader = [Pixel, Pixel];

interface MeasuredLabel {
  lines: string[];
  style: TextStyle;
  layout: PointLabelStyle;
  font: string;
  padding: number;
  lineStep: number;
  width: number;
  height: number;
}

interface MeasuredMark extends Omit<PointLabelMark, 'label'> {
  label?: MeasuredLabel;
}

export interface PlacedPointLabel {
  mark: MeasuredMark;
  label: MeasuredLabel;
  box: LabelRect;
  leader?: Leader;
}

function labelFont(style: TextStyle) {
  return `${style.bold ? 700 : 400} ${style.size}px "${style.font}", "PingFang SC", sans-serif`;
}

export async function preparePointLabelFonts(marks: PointLabelMark[]) {
  const strings = new Map<string, string[]>();
  for (const { label } of marks) {
    if (!label) continue;
    const font = labelFont(label.style);
    const texts = strings.get(font) ?? [];
    texts.push(...label.lines);
    strings.set(font, texts);
  }
  await Promise.all([...strings].map(([font, lines]) => document.fonts.load(font, lines.join(''))));
}

export function measurePointLabels(context: CanvasRenderingContext2D, marks: PointLabelMark[]): MeasuredMark[] {
  const cache = new Map<string, number>();
  return marks.map(({ label, ...mark }) => {
    if (!label) return mark;
    const font = labelFont(label.style);
    context.font = font;
    const padding = label.style.haloWidth + 2;
    const lineStep = label.style.size * Math.min(2.5, Math.max(.75, label.layout.lineHeight));
    const width = Math.max(...label.lines.map(line => {
      const key = font + '\n' + line;
      const measured = cache.get(key) ?? context.measureText(line).width;
      cache.set(key, measured);
      return measured;
    })) + padding * 2;
    const height = label.style.size + (label.lines.length - 1) * lineStep + padding * 2;
    return { ...mark, label: { ...label, font, padding, lineStep, width, height } };
  });
}

export function withinLabelRect(point: Pixel, box: LabelRect) {
  return point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom;
}

function overlap(a: LabelRect, b: LabelRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function cross(box: LabelRect, [start, end]: Leader) {
  let first = 0, last = 1;
  for (const [from, to, min, max] of [[start.x, end.x, box.left, box.right], [start.y, end.y, box.top, box.bottom]]) {
    const delta = to - from;
    if (!delta) {
      if (from < min || from > max) return false;
      continue;
    }
    const enter = (min - from) / delta, exit = (max - from) / delta;
    first = Math.max(first, Math.min(enter, exit));
    last = Math.min(last, Math.max(enter, exit));
    if (first > last) return false;
  }
  return true;
}

function tiles(box: LabelRect, visit: (key: string) => boolean) {
  const size = 56;
  for (let row = Math.floor(box.top / size); row <= Math.floor(box.bottom / size); row++) {
    for (let column = Math.floor(box.left / size); column <= Math.floor(box.right / size); column++) {
      if (visit(row + ':' + column)) return true;
    }
  }
  return false;
}

function candidateBox(center: Pixel, label: MeasuredLabel, distance: number, [dx, dy]: [number, number]): LabelRect {
  const left = center.x + dx * (distance + label.width / 2) - label.width / 2;
  const top = center.y + dy * (distance + label.height / 2) - label.height / 2;
  return { left, top, right: left + label.width, bottom: top + label.height };
}

function leaderFor(center: Pixel, radius: number, box: LabelRect): Leader {
  const end = {
    x: Math.min(box.right, Math.max(box.left, center.x)),
    y: Math.min(box.bottom, Math.max(box.top, center.y)),
  };
  const deltaX = end.x - center.x, deltaY = end.y - center.y;
  const edge = radius / Math.hypot(deltaX, deltaY);
  return [{ x: center.x + deltaX * edge, y: center.y + deltaY * edge }, end];
}

function leaderBox([start, end]: Leader): LabelRect {
  return {
    left: Math.min(start.x, end.x) - 1, right: Math.max(start.x, end.x) + 1,
    top: Math.min(start.y, end.y) - 1, bottom: Math.max(start.y, end.y) + 1,
  };
}

export function placePointLabels(
  marks: MeasuredMark[], project: (coordinate: [number, number]) => Pixel, view: LabelRect,
): PlacedPointLabel[] {
  const boxes = new Map<string, LabelRect[]>();
  function occupy(box: LabelRect) {
    tiles(box, key => {
      const bucket = boxes.get(key) ?? [];
      bucket.push(box);
      boxes.set(key, bucket);
      return false;
    });
  }
  let pending = marks.flatMap(mark => {
    const center = project(mark.coordinate);
    const radius = mark.radius + 1;
    const marker = { left: center.x - radius, top: center.y - radius, right: center.x + radius, bottom: center.y + radius };
    if (!overlap(marker, view)) return [];
    occupy(marker);
    return mark.label && withinLabelRect(center, view) ? [{ mark, label: mark.label, center, marker, radius }] : [];
  });
  const placed: PlacedPointLabel[] = [];
  // Give every location a chance at an adjacent label before using space for leader lines.
  for (const gap of [3, 10, 17, 24, 31]) {
    pending = pending.filter(({ mark, label, center, marker, radius }) => {
      const order = label.layout.placement === 'auto' ? automaticOrder : [label.layout.placement];
      for (const direction of order) {
        const box = candidateBox(center, label, radius + gap, directions[direction]);
        if (box.left < view.left || box.right > view.right || box.top < view.top || box.bottom > view.bottom) continue;
        if (tiles(box, key => boxes.get(key)?.some(existing => overlap(box, existing)) ?? false)) continue;
        const leader = gap > 3 ? leaderFor(center, radius, box) : undefined;
        if (leader) {
          const path = leaderBox(leader);
          if (tiles(path, key => boxes.get(key)?.some(existing => existing !== marker && cross(existing, leader)) ?? false)) continue;
          occupy(path);
        }
        occupy(box);
        placed.push({ mark, label, box, leader });
        return false;
      }
      return true;
    });
    if (!pending.length) break;
  }
  return placed;
}

export function paintPointLabels(context: CanvasRenderingContext2D, labels: PlacedPointLabel[]) {
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const { leader, label } of labels) {
    if (!leader) continue;
    const [start, end] = leader;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.strokeStyle = label.style.halo;
    context.lineWidth = 2.2;
    context.stroke();
    context.strokeStyle = label.style.color;
    context.lineWidth = 1;
    context.stroke();
  }
  context.textBaseline = 'middle';
  for (const { box, label } of labels) {
    const { style, layout, lineStep, padding } = label;
    context.font = label.font;
    context.fillStyle = style.color;
    context.strokeStyle = style.halo;
    context.lineWidth = style.haloWidth * 2;
    context.textAlign = layout.align;
    const x = layout.align === 'left' ? box.left + padding
      : layout.align === 'right' ? box.right - padding : (box.left + box.right) / 2;
    label.lines.forEach((line, index) => {
      const y = box.top + padding + style.size / 2 + lineStep * index;
      if (style.haloWidth > 0) context.strokeText(line, x, y);
      context.fillText(line, x, y);
    });
  }
  context.restore();
}
