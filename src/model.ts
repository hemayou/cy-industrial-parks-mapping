import type { FeatureCollection, Geometry, GeoJsonProperties } from 'geojson';
import { pointPalette } from './pointPalettes';
import type { PointPaletteId } from './pointPalettes';

export type Collection = FeatureCollection<Geometry, GeoJsonProperties>;
export type Bounds = [[number, number], [number, number]];
export type FontFamily = 'Noto Sans SC' | 'Noto Serif SC';
export type Shape = 'circle' | 'square' | 'diamond' | 'triangle';
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export type LineStyle = 'solid' | 'dashed' | 'dotted';
export type PointLabelPlacement = 'auto' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type BasemapId = 'open-light' | 'open-dark' | 'esri-light' | 'esri-dark' | 'esri-streets' | 'esri-topo' | 'carto-light' | 'carto-dark' | 'carto-voyager' | 'tianditu-vector';
export type BasemapGroup = 'roads' | 'water' | 'green' | 'buildings' | 'boundaries' | 'transport' | 'places' | 'shops' | 'other';

export interface TextStyle {
  font: FontFamily;
  size: number;
  bold: boolean;
  color: string;
  halo: string;
  haloWidth: number;
}

export interface PointLabelStyle {
  maxLines: number;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  placement: PointLabelPlacement;
}

export interface PointStyle {
  shape: Shape;
  size: number;
  color: string;
  stroke: string;
  strokeWidth: number;
}

export interface AreaStyle {
  color: string;
  opacity: number;
  stroke: string;
  width: number;
  line: LineStyle;
}

export interface LayerStyle {
  visible: boolean;
  labelField: string;
  categoryField: string;
  numberField: string;
  areaColorField: string;
  text: TextStyle;
  pointLabel: PointLabelStyle;
  point: PointStyle;
  area: AreaStyle;
  categoryPalette: PointPaletteId;
  categories: Record<string, Partial<PointStyle>>;
  categoryOrder: string[];
}

export interface LayerAsset {
  src: string;
  where?: { field: string; equals: string };
}

export interface DataLayer {
  id: string;
  name: string;
  data: Collection;
  fields: string[];
  kinds: { point: boolean; line: boolean; area: boolean };
  style: LayerStyle;
  example?: boolean;
  asset?: LayerAsset;
}

export interface BasemapStyle {
  labels: boolean;
  clipLabelsToBoundary: boolean;
  minor: boolean;
  text: TextStyle;
  groups: Partial<Record<BasemapGroup, boolean>>;
  layerVisibility: Record<string, boolean>;
  labelDensity: Partial<Record<BasemapGroup, number>>;
  layerDensity: Record<string, number>;
  roadColor: string;
  roadColorMinor: string;
}

export interface BoundaryStyle {
  visible: boolean;
  color: string;
  opacity: number;
  width: number;
  line: LineStyle;
}

export interface NormalizedFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MapMargins = Record<'top' | 'right' | 'bottom' | 'left', number | null>;

export interface Layout {
  title: string;
  titleSubtitle: string;
  titleBackground: string;
  titleFrame: NormalizedFrame | null;
  titleVisible: boolean;
  titlePosition: Corner;
  titleFont: FontFamily;
  titleSize: number;
  titleColor: string;
  titleAlign: 'auto' | 'left' | 'center' | 'right';
  titleShadow: boolean;
  titleOutline: boolean;
  legend: boolean;
  legendLayer: string;
  legendMode: 'categories' | 'numbered';
  legendPosition: Corner;
  legendFrame: NormalizedFrame | null;
  legendColumns: number;
  legendFont: FontFamily;
  legendSize: number;
  legendSymbolSize: number;
  legendColor: string;
  legendHeadingFont: FontFamily;
  legendHeadingSize: number;
  legendHeadingColor: string;
  legendBackground: string;
  mapMargins: MapMargins;
  north: boolean;
  northPosition: Corner;
  northSize: number;
  paperColor: string;
}

export interface OutputSpec {
  width: number;
  height: number;
  dpi: number;
  mode: 'paper' | 'pixels';
  paperWidth: number;
  paperHeight: number;
  type: 'png' | 'jpeg';
}

export const DISTRICT_FALLBACK: Bounds = [[116.34472, 39.80746], [116.63915, 40.10948]];
export const BEIJING_BOUNDS: Bounds = [[115.35, 39.38], [117.56, 41.12]];

export const DEFAULT_TEXT: TextStyle = {
  font: 'Noto Sans SC', size: 15, bold: true, color: '#1c2630', halo: '#ffffff', haloWidth: 1.35,
};
export const DEFAULT_LAYER: LayerStyle = {
  visible: true, labelField: '', categoryField: '', numberField: '', areaColorField: '',
  text: { ...DEFAULT_TEXT, size: 16, color: '#202528', haloWidth: 1.65 },
  pointLabel: { maxLines: 1, align: 'center', lineHeight: 1.2, placement: 'auto' },
  point: { shape: 'circle', size: 12, color: '#bd412e', stroke: '#ffffff', strokeWidth: 1.4 },
  area: { color: '#487ba1', opacity: 0.16, stroke: '#487ba1', width: 1.5, line: 'solid' },
  categoryPalette: 'classic', categories: {}, categoryOrder: [],
};
export const DEFAULT_BASEMAP: BasemapStyle = {
  labels: true, clipLabelsToBoundary: false, minor: false, text: { ...DEFAULT_TEXT, size: 17, color: '#273745', haloWidth: 1.6 },
  groups: { shops: false, buildings: false }, layerVisibility: {}, labelDensity: {}, layerDensity: {},
  roadColor: '', roadColorMinor: '',
};
export const DEFAULT_BOUNDARY: BoundaryStyle = { visible: true, color: '#2d5569', opacity: 1, width: 2.3, line: 'solid' };
export const DEFAULT_LAYOUT: Layout = {
  title: '朝阳区科技园区空间分布图', titleSubtitle: '', titleBackground: '#fcfbf8', titleFrame: null, titleVisible: true, titlePosition: 'tl',
  titleFont: 'Noto Serif SC', titleSize: 41, titleColor: '#182d42', titleAlign: 'auto', titleShadow: false, titleOutline: false,
  legend: true, legendLayer: '', legendMode: 'categories', legendPosition: 'bl', legendFrame: null, legendColumns: 1,
  legendFont: 'Noto Sans SC', legendSize: 14, legendSymbolSize: 15, legendColor: '#243644',
  legendHeadingFont: 'Noto Sans SC', legendHeadingSize: 11, legendHeadingColor: '#243644',
  legendBackground: '#ffffff', north: true, northPosition: 'tr', northSize: 46, paperColor: '#f8fafb',
  mapMargins: { top: null, right: null, bottom: null, left: null },
};

export function paperPixels(mm: number, dpi: number): number {
  return Math.round(mm * dpi / 25.4);
}

export const A1: OutputSpec = {
  width: paperPixels(594, 300), height: paperPixels(841, 300), dpi: 300,
  mode: 'paper', paperWidth: 594, paperHeight: 841, type: 'png',
};

export function outputPixels(output: OutputSpec): { width: number; height: number } {
  return output.mode === 'paper'
    ? { width: paperPixels(output.paperWidth, output.dpi), height: paperPixels(output.paperHeight, output.dpi) }
    : { width: Math.round(output.width), height: Math.round(output.height) };
}

export function categoryKey(value: unknown): string {
  return value === null || value === undefined || value === '' ? '（空值）' : String(value);
}

export function pointFeatures(layer: DataLayer) {
  return layer.data.features.filter(({ geometry }) => geometry.type === 'Point' || geometry.type === 'MultiPoint');
}

export function categoryRows(layer: DataLayer): { key: string; count: number; style: PointStyle }[] {
  const { categoryField, categories, categoryOrder, categoryPalette, point } = layer.style;
  const palette = pointPalette(categoryPalette).colors;
  const counts = new Map<string, number>();
  for (const { properties } of pointFeatures(layer)) {
    const key = categoryField ? categoryKey(properties?.[categoryField]) : layer.name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
  const ordered = [...new Set([...categoryOrder.filter(key => counts.has(key)), ...keys])];
  return ordered.map(key => {
    const index = keys.indexOf(key);
    return {
      key, count: counts.get(key) ?? 0,
      style: {
        ...point,
        color: categoryField ? palette[index % palette.length] : point.color,
        ...Object.getOwnPropertyDescriptor(categories, key)?.value,
      },
    };
  });
}

export function numberedRows(layer: DataLayer): { featureIndex: number; number: string; name: string }[] {
  const { numberField, labelField } = layer.style;
  const points = layer.data.features.flatMap(({ geometry, properties }, featureIndex) => {
    if (geometry.type !== 'Point' && geometry.type !== 'MultiPoint') return [];
    return [{ featureIndex, number: String(properties?.[numberField] ?? '').trim(), name: String(properties?.[labelField] ?? '').trim() }];
  });
  const numbers = new Set(points.map(row => row.number));
  const useField = numberField !== '' && !numbers.has('') && numbers.size === points.length;
  const indexed = points.map((row, index) => {
    const number = useField ? row.number : String(index + 1);
    return { ...row, number, name: row.name || `${layer.name} ${number}` };
  });
  return indexed.sort((a, b) => a.number.localeCompare(b.number, 'zh-CN', { numeric: true }));
}

export function defaultLayer(data: Collection, name: string, id: string = crypto.randomUUID(), example = false): DataLayer {
  const fields = [...new Set(data.features.flatMap(feature => Object.keys(feature.properties ?? {})))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  const style = structuredClone(DEFAULT_LAYER);
  style.labelField = fields.find(field => /^(name(_zh)?|名称|园区名称|项目名称|地名)$/i.test(field)) ?? '';
  style.categoryField = fields.find(field => /^(分类|实施时序|产业赛道|阶段|category|phase|type|status|list)$/i.test(field)) ?? '';
  style.areaColorField = fields.find(field => /^(color|colour|color_hex|hex_color|色值)$/i.test(field)) ?? '';
  const geomTypes = new Set<string>(data.features.map(feature => feature.geometry.type));
  return {
    id, name, data, fields, style, example,
    kinds: {
      point: geomTypes.has('Point') || geomTypes.has('MultiPoint'),
      line: geomTypes.has('LineString') || geomTypes.has('MultiLineString'),
      area: geomTypes.has('Polygon') || geomTypes.has('MultiPolygon'),
    },
  };
}

export function extent(data: Collection): Bounds | null {
  let left = Infinity, bottom = Infinity, right = -Infinity, top = -Infinity;
  function visit(value: unknown) {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      left = Math.min(left, value[0]);
      right = Math.max(right, value[0]);
      bottom = Math.min(bottom, value[1]);
      top = Math.max(top, value[1]);
      return;
    }
    for (const part of value) visit(part);
  }
  for (const { geometry } of data.features) {
    if ('coordinates' in geometry) visit(geometry.coordinates);
  }
  return Number.isFinite(left) ? [[left, bottom], [right, top]] : null;
}

export function clampFrame({ x, y, width, height }: NormalizedFrame): NormalizedFrame {
  const w = Math.max(.095, Math.min(1, width));
  const h = Math.max(.025, Math.min(1, height));
  return { x: Math.max(0, Math.min(1 - w, x)), y: Math.max(0, Math.min(1 - h, y)), width: w, height: h };
}
