import type { DataLayer, FontFamily, Layout, NormalizedFrame, PointStyle } from '../model';
import { categoryRows, numberedRows } from '../model';
import { activeLegendLayer, indexedPointStyle, numberedPointStyle, readableInk } from './compose';
import { drawMarker } from './markers';

export interface Rect { x: number; y: number; width: number; height: number }
interface LegendRow { text: string; marker: PointStyle; number?: string }
interface MeasuredRow extends LegendRow { lines: string[]; height: number }
export type FrameKind = 'title' | 'legend';
export interface SheetFrameImage { kind: FrameKind; frame: NormalizedFrame; blob: Blob }
interface SheetPlan {
  map: Rect;
  title: { box: Rect; lines: string[]; subtitle: string[] } | null;
  legend: { box: Rect; columns: MeasuredRow[][]; columnWidth: number; heading: string[]; rowsY: number } | null;
  footer: string[];
  margin: number;
}

const pointToCss = 96 / 72;
const mmToCss = 96 / 25.4;
const creditFontSize = 9;
export const fontCss = (font: FontFamily, size: number, weight = 400) =>
  `${weight} ${size * pointToCss}px "${font}", "PingFang SC", "Microsoft YaHei", sans-serif`;

function sheetCredit(attribution: string[]) {
  // The Esri relief and vector credits start with the same publisher line.
  const esriPrefix = 'Powered by Esri | Sources: Esri, ';
  let hasEsriPrefix = false;
  return attribution.filter(Boolean).map(line => {
    if (!line.startsWith(esriPrefix)) return line;
    const credit = hasEsriPrefix ? line.slice(esriPrefix.length) : line;
    hasEsriPrefix = true;
    return credit;
  }).join(' · ');
}

function wrapText(context: CanvasRenderingContext2D, value: string, width: number): string[] {
  const rows: string[] = [];
  let line = '';
  for (const char of value) {
    if (char === '\n') {
      rows.push(line);
      line = '';
    } else if (line && context.measureText(line + char).width > width) {
      rows.push(line);
      line = char.trimStart();
    } else {
      line += char;
    }
  }
  if (line) rows.push(line);
  return rows.length ? rows : [''];
}

function legendRows(layers: DataLayer[], layout: Layout): LegendRow[] {
  const layer = activeLegendLayer(layers, layout);
  if (!layer || !layout.legend) return [];
  if (layout.legendMode !== 'numbered') {
    return categoryRows(layer).map(row => ({ text: row.key, marker: row.style }));
  }
  const styleFor = indexedPointStyle(layer);
  return numberedRows(layer).map(row => {
    const style = styleFor(layer.data.features[row.featureIndex]?.properties ?? null);
    return { text: row.name, number: row.number, marker: numberedPointStyle(style, row.number) };
  });
}

function legendTitle(layout: Layout) {
  return layout.legendMode === 'numbered' ? '项目名录' : '分类图例';
}

export async function prepareSheetFonts(layout: Layout, layers: DataLayer[], attribution: string[]) {
  const legendText = legendRows(layers, layout).map(row => row.text + (row.number ?? '')).join('');
  await Promise.all([
    document.fonts.load(fontCss(layout.titleFont, layout.titleSize, 700), layout.title + layout.titleSubtitle || '制图'),
    document.fonts.load(fontCss(layout.legendFont, layout.legendSize), legendText || '图例'),
    document.fonts.load(fontCss(layout.legendHeadingFont, layout.legendHeadingSize, 700), legendTitle(layout)),
    document.fonts.load(fontCss('Noto Sans SC', 11, 700), '北0123456789'),
    document.fonts.load(fontCss('Noto Sans SC', creditFontSize), sheetCredit(attribution)),
  ]);
}

export function planSheet(
  context: CanvasRenderingContext2D, width: number, height: number, layout: Layout, layers: DataLayer[], attribution: string[],
): SheetPlan {
  const margin = Math.max(17, Math.min(width, height) * 0.031);
  const usableWidth = width - margin * 2;
  const gap = Math.max(10, margin * 0.34);
  let top = margin;
  let bottom = height - margin;

  context.font = fontCss('Noto Sans SC', creditFontSize);
  const credit = sheetCredit(attribution);
  const footer = credit ? wrapText(context, credit, usableWidth) : [];
  if (footer.length) bottom -= footer.length * 17 + gap;

  let title: SheetPlan['title'] = null;
  if (layout.titleVisible && layout.title.trim()) {
    const textSize = layout.titleSize * pointToCss;
    const padding = Math.max(12, textSize * .46);
    const frame = layout.titleFrame;
    context.font = fontCss(layout.titleFont, layout.titleSize, 700);
    const idealWidth = context.measureText(layout.title.trim()).width + padding * 2;
    const boxWidth = frame
      ? Math.min(width, Math.max(110, frame.width * width))
      : Math.min(usableWidth, Math.max(idealWidth, usableWidth * .44));
    const lines = wrapText(context, layout.title.trim(), Math.max(45, boxWidth - padding * 2));
    context.font = fontCss(layout.titleFont, layout.titleSize * .57, 700);
    const subtitle = layout.titleSubtitle.trim()
      ? wrapText(context, layout.titleSubtitle.trim(), Math.max(45, boxWidth - padding * 2))
      : [];
    const contentHeight = lines.length * textSize * 1.18 + subtitle.length * textSize * .77 + padding * 2;
    const titleHeight = Math.max(contentHeight, frame ? frame.height * height : 0);
    if (titleHeight > height - margin) throw new Error('图名框超过画幅，请减小字号或减少文字。');
    if (frame) {
      title = {
        box: { x: Math.min(width - boxWidth, frame.x * width), y: Math.min(height - titleHeight, frame.y * height), width: boxWidth, height: titleHeight },
        lines, subtitle,
      };
    } else {
      const upper = layout.titlePosition.startsWith('t');
      const right = layout.titlePosition.endsWith('r');
      title = { box: { x: right ? width - margin - boxWidth : margin, y: upper ? top : bottom - titleHeight, width: boxWidth, height: titleHeight }, lines, subtitle };
      if (upper) top += titleHeight + gap;
      else bottom -= titleHeight + gap;
    }
  }

  let mapX = margin;
  let mapWidth = usableWidth;
  let legend: SheetPlan['legend'] = null;
  const rows = legendRows(layers, layout);
  if (rows.length) {
    const numbered = layout.legendMode === 'numbered';
    const symbolSize = layout.legendSymbolSize * pointToCss;
    const textLine = layout.legendSize * pointToCss * 1.28;
    const padding = 15;
    const rowGap = 8;
    const columnCount = Math.min(Math.max(1, Math.floor(layout.legendColumns)), rows.length);
    const rowCount = Math.ceil(rows.length / columnCount);
    const isRight = layout.legendPosition.endsWith('r');
    const isTop = layout.legendPosition.startsWith('t');
    context.font = fontCss(layout.legendFont, layout.legendSize);
    const frame = layout.legendFrame;
    const maximumLegendWidth = frame ? Math.min(width, frame.width * width) : numbered ? usableWidth * 0.43 : usableWidth;
    const idealWidth = Math.max(...rows.map(row => context.measureText(row.text).width)) + symbolSize + 27;
    const titleFont = fontCss(layout.legendHeadingFont, layout.legendHeadingSize, 700);
    const titleText = legendTitle(layout);
    context.font = titleFont;
    const titleColumn = (context.measureText(titleText).width + 2) / columnCount;
    const availableColumn = (maximumLegendWidth - padding * 2) / columnCount;
    const columnWidth = frame ? availableColumn : Math.min(availableColumn, Math.max(100, idealWidth, titleColumn));
    const textWidth = columnWidth - symbolSize - 22;
    if (textWidth < 24) throw new Error('画幅内的单栏图例太窄，请减少栏数、减小字号或加宽画幅。');
    const boxWidth = columnWidth * columnCount + padding * 2;
    const heading = wrapText(context, titleText, boxWidth - padding * 2);
    const rowsY = 21 + heading.length * layout.legendHeadingSize * pointToCss * 1.25;
    context.font = fontCss(layout.legendFont, layout.legendSize);
    const columns = Array.from({ length: columnCount }, (_, column) =>
      rows.slice(column * rowCount, (column + 1) * rowCount).map(row => {
        const lines = wrapText(context, row.text, textWidth);
        return { ...row, lines, height: Math.max(symbolSize, lines.length * textLine) + rowGap };
      }),
    );
    const contentHeight = Math.max(...columns.map(column => column.reduce((sum, row) => sum + row.height, 0))) + rowsY + 8;
    const boxHeight = Math.max(contentHeight, frame ? frame.height * height : 0);
    const availableHeight = frame ? height : bottom - top - (numbered ? 0 : 165);
    if (boxHeight > availableHeight) {
      throw new Error('当前图例超出画幅。请增加图例栏数、减小字号或扩大画幅。');
    }
    legend = {
      box: frame
        ? { x: Math.min(width - boxWidth, frame.x * width), y: Math.min(height - boxHeight, frame.y * height), width: boxWidth, height: boxHeight }
        : { x: isRight ? width - margin - boxWidth : margin, y: isTop ? top : bottom - boxHeight, width: boxWidth, height: boxHeight },
      columns, columnWidth, heading, rowsY,
    };
    if (!frame) {
      if (numbered) {
        if (!isRight) mapX += boxWidth + gap;
        mapWidth -= boxWidth + gap;
      } else if (isTop) {
        top += boxHeight + gap;
      } else {
        bottom -= boxHeight + gap;
      }
    }

  }
  const edges = layout.mapMargins;
  const x = edges.left === null ? mapX : edges.left * mmToCss;
  const y = edges.top === null ? top : edges.top * mmToCss;
  const right = edges.right === null ? mapX + mapWidth : width - edges.right * mmToCss;
  const lower = edges.bottom === null ? bottom : height - edges.bottom * mmToCss;
  const map = { x, y, width: right - x, height: lower - y };
  if (map.width < 150 || map.height < 150) throw new Error('地图框空间不足，请减小边距、调整版位或加大画幅。');
  return { map, title, legend, footer, margin };
}

function paintTitle(context: CanvasRenderingContext2D, planFrame: SheetPlan['title'], layout: Layout) {
  if (!planFrame) return;
  const { box, lines, subtitle } = planFrame;
  const textSize = layout.titleSize * pointToCss;
  const padding = Math.max(12, textSize * .46);
  context.save();
  context.fillStyle = layout.titleBackground;
  context.fillRect(box.x, box.y, box.width, box.height);
  context.strokeStyle = '#35424a';
  context.lineWidth = 1.2;
  context.strokeRect(box.x + .65, box.y + .65, box.width - 1.3, box.height - 1.3);
  context.textBaseline = 'top';
  context.fillStyle = layout.titleColor;
  context.strokeStyle = readableInk(layout.titleColor);
  context.lineJoin = 'round';
  const pixelScale = layout.titleShadow ? context.getTransform().a : 1;
  const mainAlign = layout.titleAlign === 'auto' ? 'left' : layout.titleAlign;
  const captionAlign = layout.titleAlign === 'auto' ? 'right' : layout.titleAlign;
  function paintLines(values: string[], size: number, align: CanvasTextAlign, top: number, step: number) {
    const x = align === 'center' ? box.x + box.width / 2
      : align === 'right' ? box.x + box.width - padding : box.x + padding;
    context.textAlign = align;
    context.font = fontCss(layout.titleFont, size, 700);
    context.lineWidth = Math.max(1, size * .065);
    for (const [index, line] of values.entries()) {
      const y = top + index * step;
      if (layout.titleShadow) {
        context.shadowColor = '#172c4080';
        context.shadowBlur = Math.max(1.5, size * .12) * pixelScale;
        context.shadowOffsetY = Math.max(1, size * .08) * pixelScale;
        context.fillText(line, x, y);
        context.shadowColor = '#00000000';
      }
      if (layout.titleOutline) context.strokeText(line, x, y);
      context.fillText(line, x, y);
    }
  }
  paintLines(lines, layout.titleSize, mainAlign, box.y + padding, textSize * 1.18);
  const captionY = box.y + box.height - padding - subtitle.length * textSize * .77;
  paintLines(subtitle, layout.titleSize * .57, captionAlign, captionY, textSize * .77);
  context.restore();
}

function paintLegend(context: CanvasRenderingContext2D, planFrame: SheetPlan['legend'], layout: Layout) {
  context.textBaseline = 'top';
  if (planFrame) {
    const { box, columns, columnWidth, heading, rowsY } = planFrame;
    context.fillStyle = layout.legendBackground;
    context.fillRect(box.x, box.y, box.width, box.height);
    context.strokeStyle = '#a1afb8';
    context.strokeRect(box.x, box.y, box.width, box.height);
    context.textAlign = 'left';
    context.font = fontCss(layout.legendHeadingFont, layout.legendHeadingSize, 700);
    context.fillStyle = layout.legendHeadingColor;
    const headingLine = layout.legendHeadingSize * pointToCss * 1.25;
    heading.forEach((line, index) => context.fillText(line, box.x + 15, box.y + 11 + index * headingLine));
    const symbolSize = layout.legendSymbolSize * pointToCss;
    const textLine = layout.legendSize * pointToCss * 1.28;
    columns.forEach((column, columnIndex) => {
      let y = box.y + rowsY;
      const x = box.x + 15 + columnIndex * columnWidth;
      for (const row of column) {
        const markerSize = row.number ? Math.max(symbolSize, row.number.length * symbolSize / 2) : symbolSize * .83;
        const mid = y + Math.max(symbolSize, textLine) / 2;
        drawMarker(context, x + symbolSize / 2, mid, markerSize, row.marker);
        if (row.number) {
          context.font = fontCss('Noto Sans SC', layout.legendSymbolSize * .58, 700);
          context.fillStyle = readableInk(row.marker.color);
          context.textAlign = 'center';
          context.textBaseline = 'middle';
          context.fillText(row.number, x + symbolSize / 2, mid, markerSize * .84);
        }
        context.textAlign = 'left';
        context.textBaseline = 'top';
        context.fillStyle = layout.legendColor;
        context.font = fontCss(layout.legendFont, layout.legendSize);
        row.lines.forEach((line, i) => context.fillText(line, x + symbolSize + 12, y + i * textLine));
        y += row.height;
      }
    });
  }

}

// The preview image omits title and legend; those canvases follow the user's drag live.
export async function renderSheetFrames(
  width: number, height: number, scale: number, plan: SheetPlan, layout: Layout,
): Promise<SheetFrameImage[]> {
  const items: SheetFrameImage[] = [];
  const kinds = ['title', 'legend'] as const;
  for (const kind of kinds) {
    const element = plan[kind];
    if (!element) continue;
    const { box } = element;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(scale * box.width));
    canvas.height = Math.max(1, Math.round(scale * box.height));
    const context = canvas.getContext('2d');
    if (!context) continue;
    context.scale(canvas.width / box.width, canvas.height / box.height);
    context.translate(-box.x, -box.y);
    if (kind === 'title') paintTitle(context, plan.title, layout);
    else paintLegend(context, plan.legend, layout);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve));
    if (blob) items.push({
      kind, blob,
      frame: { x: box.x / width, y: box.y / height, width: box.width / width, height: box.height / height },
    });
  }
  return items;
}

export function paintSheet(
  context: CanvasRenderingContext2D, width: number, height: number,
  plan: SheetPlan, layout: Layout, deferFrames = false,
) {
  context.strokeStyle = '#8d9ba5';
  context.lineWidth = 1;
  context.strokeRect(plan.map.x, plan.map.y, plan.map.width, plan.map.height);

  if (!deferFrames) {
    paintTitle(context, plan.title, layout);
    paintLegend(context, plan.legend, layout);
  }

  if (layout.north) {
    const size = layout.northSize * pointToCss;
    const inset = Math.max(11, plan.margin * .29);
    const right = layout.northPosition.endsWith('r');
    const top = layout.northPosition.startsWith('t');
    const x = right ? plan.map.x + plan.map.width - inset - size / 2 : plan.map.x + inset + size / 2;
    const y = top ? plan.map.y + inset : plan.map.y + plan.map.height - inset - size * 1.58;
    context.fillStyle = '#ffffff';
    context.fillRect(x - size * .5, y, size, size * 1.56);
    context.strokeStyle = '#a1afb8';
    context.strokeRect(x - size * .5, y, size, size * 1.56);
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.font = fontCss('Noto Sans SC', layout.northSize * .34, 700);
    context.fillStyle = '#182d42';
    context.fillText('北', x, y + size * .08);
    context.beginPath();
    context.moveTo(x, y + size * .44);
    context.lineTo(x + size * .3, y + size * 1.37);
    context.lineTo(x, y + size * 1.19);
    context.lineTo(x - size * .3, y + size * 1.37);
    context.closePath();
    context.fill();
  }

  context.textAlign = 'right';
  context.textBaseline = 'top';
  context.font = fontCss('Noto Sans SC', creditFontSize);
  context.fillStyle = '#384d5e';
  const y = height - plan.margin - plan.footer.length * 17;
  plan.footer.forEach((line, index) => context.fillText(line, width - plan.margin, y + index * 17));
}
