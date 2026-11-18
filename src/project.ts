import { A1, DEFAULT_BASEMAP, DEFAULT_BOUNDARY, DEFAULT_LAYER, DEFAULT_LAYOUT, clampFrame } from './model';
import type { BasemapId, BasemapStyle, BoundaryStyle, LayerAsset, LayerStyle, Layout, MapMargins, NormalizedFrame, OutputSpec } from './model';
import { BASEMAPS } from './map/basemap';
import { POINT_PALETTES } from './pointPalettes';

export interface ProjectSettings {
  basemap: BasemapId;
  basemapStyle: BasemapStyle;
  boundaryStyle: BoundaryStyle;
  layout: Layout;
  output: OutputSpec;
}

export interface ProjectLayer extends Partial<LayerAsset> {
  id: string;
  name: string;
  style: LayerStyle;
}
export interface ProjectFile extends ProjectSettings {
  schemaVersion: 1;
  layers: ProjectLayer[];
}

type Values = Record<string, unknown>;
const isObject = (value: unknown): value is Values => !!value && typeof value === 'object' && !Array.isArray(value);
const enumValues: Record<string, string[]> = {
  shape: ['circle', 'square', 'diamond', 'triangle'],
  line: ['solid', 'dashed', 'dotted'],
  align: ['left', 'center', 'right'],
  placement: ['auto', 'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'],
  font: ['Noto Sans SC', 'Noto Serif SC'],
  titleFont: ['Noto Sans SC', 'Noto Serif SC'],
  titleAlign: ['auto', 'left', 'center', 'right'],
  legendFont: ['Noto Sans SC', 'Noto Serif SC'],
  legendHeadingFont: ['Noto Sans SC', 'Noto Serif SC'],
  titlePosition: ['tl', 'tr', 'bl', 'br'], legendPosition: ['tl', 'tr', 'bl', 'br'], northPosition: ['tl', 'tr', 'bl', 'br'],
  legendMode: ['categories', 'numbered'], mode: ['paper', 'pixels'], type: ['png', 'jpeg'],
  categoryPalette: POINT_PALETTES.map(palette => palette.id),
};
const colorKeys = /^(color|halo|stroke|\w*Color\w*|\w*Background)$/;
const rangeByKey: Record<string, [number, number]> = {
  maxLines: [1, 6], lineHeight: [.75, 2.5], size: [1, 72], strokeWidth: [0, 8], haloWidth: [0, 6], opacity: [0, 1], legendColumns: [1, 6],
  gap: [0, 25], leaderRange: [20, 160],
  titleSize: [8, 125], legendSize: [6, 60], legendHeadingSize: [6, 72], legendSymbolSize: [5, 60], northSize: [14, 100],
  dpi: [36, 1200], paperWidth: [30, 2500], paperHeight: [30, 2500],
};

function patch<Defaults extends object>(base: Defaults, value: unknown): Defaults {
  if (!isObject(value)) return structuredClone(base);
  const fields = Object.entries(base).map(([key, initial]) => {
    const next = Object.hasOwn(value, key) ? value[key] : undefined;
    if (typeof initial === 'string' && typeof next === 'string') {
      if (enumValues[key] && !enumValues[key].includes(next)) return [key, initial];
      if (colorKeys.test(key) && !(key.startsWith('roadColor') && !next) && !/^#[a-f\d]{6}$/i.test(next)) return [key, initial];
      return [key, next.slice(0, 250)];
    }
    if (typeof initial === 'number' && typeof next === 'number' && Number.isFinite(next)) {
      const [min, max] = rangeByKey[key] ?? [0, 16384];
      return [key, Math.max(min, Math.min(max, key === 'maxLines' ? Math.round(next) : next))];
    }
    if (typeof initial === 'boolean' && typeof next === 'boolean') return [key, next];
    if (Array.isArray(initial) && Array.isArray(next)) return [key, next.filter(item => typeof item === 'string').slice(0, 2000)];
    if (isObject(initial)) return [key, patch(initial, next)];
    return [key, initial];
  });
  return Object.fromEntries(fields) as Defaults;
}

function booleans(value: unknown) {
  return isObject(value)
    ? Object.fromEntries(Object.entries(value).filter(([, visible]) => typeof visible === 'boolean')) as Record<string, boolean>
    : {};
}

function densityValues(value: unknown): Record<string, number> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .map(([key, density]) => [key, Math.min(100, Math.max(0, Math.round(density)))]));
}

function readFrame(value: unknown): NormalizedFrame | null {
  if (!isObject(value)) return null;
  const { x, y, width, height } = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') return null;
  return [x, y, width, height].every(Number.isFinite) ? clampFrame({ x, y, width, height }) : null;
}

function readMapMargins(value: unknown): MapMargins {
  if (!isObject(value)) return { ...DEFAULT_LAYOUT.mapMargins };
  const amount = (side: keyof MapMargins) => {
    const raw = value[side];
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(2500, Math.max(0, raw)) : null;
  };
  return { top: amount('top'), right: amount('right'), bottom: amount('bottom'), left: amount('left') };
}

export function readProject(value: unknown): ProjectFile {
  if (!isObject(value) || value.schemaVersion !== 1 || !Array.isArray(value.layers)) {
    throw new Error('请选择版本为 1 的出图配置 JSON 文件。');
  }
  const basemap = BASEMAPS.find(style => style.id === value.basemap)?.id ?? 'open-light';
  const base = patch(DEFAULT_BASEMAP, value.basemapStyle);
  if (isObject(value.basemapStyle)) {
    base.groups = { ...base.groups, ...booleans(value.basemapStyle.groups) };
    base.layerVisibility = booleans(value.basemapStyle.layerVisibility);
    base.labelDensity = densityValues(value.basemapStyle.labelDensity);
    base.layerDensity = densityValues(value.basemapStyle.layerDensity);
  }
  const layers = value.layers.slice(0, 60).flatMap(item => {
    if (!isObject(item) || typeof item.name !== 'string' || typeof item.id !== 'string') return [];
    const style = patch(DEFAULT_LAYER, item.style);
    if (isObject(item.style) && isObject(item.style.pointLabel) && isObject(item.style.pointLabel.offsets)) {
      style.pointLabel.offsets = Object.fromEntries(Object.entries(item.style.pointLabel.offsets).flatMap(([key, offset]) => {
        if (!/^\d+:\d+$/.test(key) || !Array.isArray(offset) || offset.length !== 2) return [];
        const [x, y] = offset;
        if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return [];
        return [[key, [x, y] as [number, number]] as const];
      }));
    }
    if (isObject(item.style) && isObject(item.style.categories)) {
      style.categories = Object.fromEntries(Object.entries(item.style.categories).slice(0, 2000)
        .filter(([, point]) => isObject(point)).map(([key, point]) => {
          const clean = patch(DEFAULT_LAYER.point, point);
          return [key, Object.fromEntries(Object.entries(clean).filter(([name]) => Object.hasOwn(point as object, name)))];
        }));
    }
    const src = typeof item.src === 'string' ? item.src : undefined;
    const filter = item.where;
    const where = isObject(filter) && typeof filter.field === 'string' && typeof filter.equals === 'string'
      ? { field: filter.field, equals: filter.equals } : undefined;
    return [{ id: item.id.slice(0, 180), name: item.name.slice(0, 180), style, src, where }];
  });
  const layout = patch(DEFAULT_LAYOUT, value.layout);
  if (isObject(value.layout)) {
    layout.titleFrame = readFrame(value.layout.titleFrame);
    layout.legendFrame = readFrame(value.layout.legendFrame);
    layout.mapMargins = readMapMargins(value.layout.mapMargins);
    if (!Object.hasOwn(value.layout, 'legendHeadingColor')) layout.legendHeadingColor = layout.legendColor;
  }
  return {
    schemaVersion: 1, basemap, basemapStyle: base, layers,
    boundaryStyle: patch(DEFAULT_BOUNDARY, value.boundaryStyle),
    layout, output: patch(A1, value.output),
  };
}
