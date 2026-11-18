import type { ExpressionSpecification, FilterSpecification, LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import type { BoundaryStyle, Collection, DataLayer, Layout, LineStyle, PointStyle, TextStyle } from '../model';
import { categoryKey, categoryRows, numberedRows } from '../model';
import { fontStack } from './basemap';
import { mapFontFaces } from './fonts';
import { markerId } from './markers';
import { formatPointLabel, pointLabelLayout } from './pointLabels';

export function lineDash(line: LineStyle) {
  if (line === 'dashed') return [3, 2];
  if (line === 'dotted') return [0.7, 1.7];
  return undefined;
}
const byType = (type: 'Point' | 'LineString' | 'Polygon') => ['==', ['geometry-type'], type] as FilterSpecification;

function labels(
  id: string, source: string, text: TextStyle, value: ExpressionSpecification, type: 'Point' | 'LineString' | 'Polygon',
): SymbolLayerSpecification {
  return {
    id, source, type: 'symbol', filter: byType(type),
    layout: {
      'text-field': value,
      'text-font': fontStack(text),
      'text-size': text.size,
      'text-max-width': 12,
      'text-padding': 3,
      'text-line-height': 1.19,
      'text-variable-anchor': ['top', 'right', 'bottom', 'left', 'top-right', 'bottom-left'],
      'text-radial-offset': type === 'Point' ? 0.82 : 0,
      ...(type === 'LineString' ? { 'symbol-placement': 'line-center', 'text-rotation-alignment': 'map' } : {}),
    },
    paint: { 'text-color': text.color, 'text-halo-color': text.halo, 'text-halo-width': text.haloWidth },
  };
}

const FIELD_SYMBOL = '__cy_symbol';
const FIELD_SIZE = '__cy_size';
const FIELD_NUMBER = '__cy_number';
const FIELD_NUMBER_COLOR = '__cy_num_color';
const FIELD_POINT_LABEL = '__cy_point_label';
const FIELD_FILL = '__cy_fill';

export interface PlotOptions {
  base: StyleSpecification;
  overlays: DataLayer[];
  boundary: Collection | null;
  boundaryStyle: BoundaryStyle;
  layout: Layout;
}

export function activeLegendLayer(overlays: DataLayer[], layout: Layout) {
  const choices = overlays.filter(layer => layer.style.visible && layer.kinds.point);
  return choices.find(item => item.id === layout.legendLayer) ?? choices[0];
}

export function numberedPointStyle(style: PointStyle, number: string): PointStyle {
  return { ...style, shape: 'circle', size: Math.max(style.size, 24, 15 + number.length * 6) };
}

export function readableInk(background: string): string {
  const rgb = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(background);
  if (!rgb) return '#ffffff';
  const channels = rgb.slice(1).map(value => Number.parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? '#172432' : '#ffffff';
}

export function indexedPointStyle(layer: DataLayer) {
  const styles = new Map(categoryRows(layer).map(entry => [entry.key, entry.style]));
  return (properties: Record<string, unknown> | null) => {
    const key = layer.style.categoryField ? categoryKey(properties?.[layer.style.categoryField]) : layer.name;
    return styles.get(key) ?? layer.style.point;
  };
}

function layerSources(overlays: DataLayer[], numberedLayerId: string | undefined) {
  const sources: StyleSpecification['sources'] = {};
  for (const layer of overlays) {
    if (!layer.style.visible) continue;
    const numbered = layer.id === numberedLayerId;
    const numberByIndex = numbered ? new Map(numberedRows(layer).map(row => [row.featureIndex, row.number])) : new Map<number, string>();
    const pointStyle = indexedPointStyle(layer);
    const data: Collection = {
      type: 'FeatureCollection',
      features: layer.data.features.map((feature, index) => {
        if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
          const raw = feature.properties?.[layer.style.areaColorField];
          const fill = typeof raw === 'string' && /^#[a-f\d]{6}$/i.test(raw) ? raw : layer.style.area.color;
          return { ...feature, properties: { ...feature.properties, [FIELD_FILL]: fill } };
        }
        if (feature.geometry.type !== 'Point' && feature.geometry.type !== 'MultiPoint') return feature;
        const number = numberByIndex.get(index);
        const paint = pointStyle(feature.properties);
        const marker = number === undefined ? paint : numberedPointStyle(paint, number);
        return {
          ...feature,
          properties: {
            ...feature.properties,
            [FIELD_SYMBOL]: markerId(marker), [FIELD_SIZE]: marker.size,
            [FIELD_NUMBER]: number ?? '', [FIELD_NUMBER_COLOR]: readableInk(paint.color),
            [FIELD_POINT_LABEL]: layer.style.labelField
              ? formatPointLabel(feature.properties?.[layer.style.labelField], layer.style.pointLabel.maxLines) : '',
          },
        };
      }),
    };
    sources[`overlay-${layer.id}`] = { type: 'geojson', data, maxzoom: 17 };
  }
  return sources;
}

export function composeStyle({ base, overlays, boundary, boundaryStyle, layout }: PlotOptions): StyleSpecification {
  const legend = activeLegendLayer(overlays, layout);
  const numbered = layout.legendMode === 'numbered' ? legend?.id : undefined;
  const sources = { ...base.sources, ...layerSources(overlays, numbered) };
  const shapes: LayerSpecification[] = [];
  const symbols: LayerSpecification[] = [];
  for (const layer of overlays) {
    if (!layer.style.visible) continue;
    const id = `overlay-${layer.id}`;
    const { area, labelField, text } = layer.style;
    const dash = lineDash(area.line);
    const linePaint = { 'line-color': area.stroke, 'line-width': area.width, ...(dash ? { 'line-dasharray': dash } : {}) };
    if (layer.kinds.area) {
      shapes.push(
        { id: `${id}-fill`, type: 'fill', source: id, filter: byType('Polygon'),
          paint: { 'fill-color': ['get', FIELD_FILL], 'fill-opacity': area.opacity } },
        { id: `${id}-outline`, type: 'line', source: id, filter: byType('Polygon'),
          layout: { 'line-join': 'round' }, paint: linePaint },
      );
    }
    if (layer.kinds.line) shapes.push({ id: `${id}-line`, type: 'line', source: id, filter: byType('LineString'), paint: linePaint });
    if (layer.kinds.point) {
      symbols.push({
        id: `${id}-marker`, type: 'symbol', source: id, filter: byType('Point'),
        layout: {
          'icon-image': ['get', FIELD_SYMBOL],
          'icon-size': ['/', ['number', ['get', FIELD_SIZE], 12], 44],
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
        },
      });
    }
    if (labelField) {
      const labelText: ExpressionSpecification = ['to-string', ['coalesce', ['get', labelField], '']];
      if (layer.kinds.area) symbols.push(labels(`${id}-area-label`, id, text, labelText, 'Polygon'));
      if (layer.kinds.line) symbols.push(labels(`${id}-line-label`, id, text, labelText, 'LineString'));
      if (layer.kinds.point && numbered !== layer.id) {
        symbols.push({
          id: `${id}-point-label`, type: 'symbol', source: id, filter: byType('Point'),
          layout: {
            ...pointLabelLayout(layer.style.pointLabel),
            'text-field': ['get', FIELD_POINT_LABEL], 'text-font': fontStack(text), 'text-size': text.size,
          },
          paint: { 'text-color': text.color, 'text-halo-color': text.halo, 'text-halo-width': text.haloWidth },
        });
      }
    }
    if (numbered === layer.id && layer.kinds.point) {
      symbols.push({
        id: `${id}-number`, type: 'symbol', source: id, filter: byType('Point'),
        layout: {
          'text-field': ['get', FIELD_NUMBER], 'text-font': ['Noto Sans SC Bold'], 'text-size': Math.min(24, Math.max(12, text.size * 0.82)),
          'text-allow-overlap': true, 'text-ignore-placement': true, 'text-anchor': 'center', 'text-max-width': 20,
        },
        paint: { 'text-color': ['get', FIELD_NUMBER_COLOR] },
      });
    }
  }

  if (boundary && boundaryStyle.visible) {
    const dash = lineDash(boundaryStyle.line);
    sources['cy-district'] = { type: 'geojson', data: boundary };
    shapes.push({
      id: 'cy-district-line', type: 'line', source: 'cy-district',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': boundaryStyle.color, 'line-opacity': boundaryStyle.opacity, 'line-width': boundaryStyle.width, ...(dash ? { 'line-dasharray': dash } : {}) },
    });
  }
  const baseShapes = base.layers.filter(layer => layer.type !== 'symbol');
  const baseText = base.layers.filter(layer => layer.type === 'symbol');
  return { ...base, sources, 'font-faces': mapFontFaces(), layers: [...baseShapes, ...shapes, ...baseText, ...symbols] };
}
