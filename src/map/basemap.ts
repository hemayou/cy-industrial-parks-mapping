import type { ExpressionSpecification, LayerSpecification, StyleSpecification, SymbolLayerSpecification } from 'maplibre-gl';
import type { BasemapGroup, BasemapId, BasemapStyle, TextStyle } from '../model';
import { tiandituLabelLayer, tiandituStyle } from './tianditu';

export interface CatalogStyle {
  id: BasemapId;
  name: string;
  theme: string;
  provider: 'esri' | 'carto' | 'tianditu' | 'open';
  slug: string;
  dark: boolean;
}

export const BASEMAPS: CatalogStyle[] = [
  { id: 'esri-light', name: '浅灰画布', theme: 'Light Gray', provider: 'esri', slug: 'light-gray', dark: false },
  { id: 'esri-dark', name: '深灰画布', theme: 'Dark Gray', provider: 'esri', slug: 'dark-gray', dark: true },
  { id: 'esri-streets', name: '街道地图', theme: 'Streets', provider: 'esri', slug: 'streets', dark: false },
  { id: 'carto-light', name: '浅色简图', theme: 'Positron', provider: 'carto', slug: 'positron', dark: false },
  { id: 'carto-dark', name: '深色简图', theme: 'Dark Matter', provider: 'carto', slug: 'dark-matter', dark: true },
  { id: 'carto-voyager', name: '彩色街道', theme: 'Voyager', provider: 'carto', slug: 'voyager', dark: false },
  { id: 'open-light', name: '开放浅色', theme: 'Positron', provider: 'open', slug: 'positron', dark: false },
  { id: 'open-dark', name: '开放深色', theme: 'Dark', provider: 'open', slug: 'dark', dark: true },
  { id: 'tianditu-vector', name: '矢量底图', theme: 'WMTS', provider: 'tianditu', slug: 'vec', dark: false },
];

export const GROUPS: { id: BasemapGroup; label: string }[] = [
  { id: 'roads', label: '道路' }, { id: 'water', label: '水系' },
  { id: 'green', label: '绿地与用地' }, { id: 'transport', label: '铁路与轨道' },
  { id: 'places', label: '行政区与地名' }, { id: 'boundaries', label: '底图区界' },
  { id: 'buildings', label: '建筑' }, { id: 'shops', label: '兴趣点' },
  { id: 'other', label: '其他要素' },
];

export const EMPTY_STYLE: StyleSpecification = {
  version: 8, sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef0ed' } }],
};
export interface ProviderKeys { esri: string; carto: string; tianditu: string }
export const providerName = { esri: 'Esri', carto: 'CARTO', tianditu: '天地图', open: '开放预览' };
export const providerCredential = { esri: 'Esri API key', carto: 'CARTO API key', tianditu: '天地图 tk' };
const openAttribution = '<a href="https://openfreemap.org/">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export function findBasemap(id: BasemapId): CatalogStyle {
  return BASEMAPS.find(item => item.id === id) ?? BASEMAPS.find(item => item.id === 'open-light')!;
}

function styleUrl(entry: CatalogStyle, keys: ProviderKeys): URL {
  if (entry.provider === 'open') return new URL(`https://tiles.openfreemap.org/styles/${entry.slug}`);
  if (entry.provider === 'esri') {
    const url = new URL(`https://basemapstyles-api.arcgis.com/arcgis/rest/services/styles/v2/styles/arcgis/${entry.slug}`);
    url.searchParams.set('language', 'zh-CN');
    url.searchParams.set('token', keys.esri);
    return url;
  }
  const url = new URL(`https://basemaps.cartocdn.com/gl/${entry.slug}-gl-style/style.json`);
  url.searchParams.set('key', keys.carto);
  return url;
}

function addKey(value: string, relativeTo: URL, entry: CatalogStyle, keys: ProviderKeys) {
  const url = new URL(value, relativeTo);
  if (entry.provider === 'esri' && url.hostname.endsWith('.arcgis.com') && !url.searchParams.has('token')) {
    url.searchParams.set('token', keys.esri);
  }
  if (entry.provider === 'carto' && url.hostname.endsWith('.cartocdn.com') && !url.searchParams.has('key')) {
    url.searchParams.set('key', keys.carto);
  }
  return url.toString().replace(/%7B/gi, '{').replace(/%7D/gi, '}');
}

export class BasemapRequestError extends Error {}

export async function fetchBasemap(entry: CatalogStyle, keys: ProviderKeys, signal: AbortSignal): Promise<StyleSpecification> {
  if (entry.provider !== 'open' && !keys[entry.provider]) {
    throw new Error(`请在底图凭据中填写 ${providerCredential[entry.provider]}。`);
  }
  if (entry.provider === 'tianditu') return tiandituStyle(keys.tianditu);
  const url = styleUrl(entry, keys);
  const response = await fetch(url, { signal, credentials: 'omit' });
  const style = await response.json().catch(() => null);
  if (!response.ok || !style || style.error || style.version !== 8 || !Array.isArray(style.layers) || !style.sources) {
    if (entry.provider === 'esri') {
      const code = style?.error?.code;
      if (code === 499) throw new BasemapRequestError('Esri 499。服务没有收到可用的 API key。');
      if (code === 498) throw new BasemapRequestError('Esri 498。API key 无效或已过期。');
      if (response.status === 403 || code === 403) {
        throw new BasemapRequestError('Esri 403。请核对 API key 的 Basemap Styles 权限和来源域名。');
      }
    }
    throw new BasemapRequestError(`${providerName[entry.provider]} 底图连接失败。请核对网络、密钥权限及域名限制。`);
  }
  const output = style as StyleSpecification;
  // Labels and fonts are replaced in the local style. Keep only vector tiles.
  for (const [id, source] of Object.entries(output.sources)) {
    if (source.type !== 'vector') {
      delete output.sources[id];
      continue;
    }
    if (source.url && entry.provider === 'esri' && /\/VectorTileServer(?:\/|\?|$)/i.test(source.url)) {
      const service = new URL(source.url, url);
      service.pathname = service.pathname.replace(/\/$/, '') + '/tile/{z}/{y}/{x}.pbf';
      source.tiles = [addKey(service.href, url, entry, keys)];
      source.minzoom ??= 0;
      source.maxzoom ??= 16;
      delete source.url;
    } else if (source.url) {
      source.url = addKey(source.url, url, entry, keys);
    }
    if (source.tiles) source.tiles = source.tiles.map(tile => addKey(tile, url, entry, keys));
    if (entry.provider === 'esri') {
      source.attribution ||= 'Sources: Esri, TomTom, Garmin, FAO, NOAA, USGS, © OpenStreetMap contributors, and the GIS User Community';
      source.attribution = 'Powered by Esri | ' + source.attribution;
    } else if (entry.provider === 'carto') {
      source.attribution ||= '© OpenStreetMap contributors · © CARTO';
    } else {
      source.attribution ||= openAttribution;
    }
  }
  if (!Object.keys(output.sources).length) throw new Error('所选样式没有可用的矢量切片。');
  output.layers = output.layers.filter(layer => layer.type === 'background' ||
    ('source' in layer && Object.hasOwn(output.sources, layer.source)));
  if (entry.id === 'open-dark' && !output.layers.some(layer => layer.id === 'waterway_line_label')) {
    const label = output.layers.find(layer => layer.type === 'symbol' && layer.id === 'water_name');
    if (label?.type === 'symbol') {
      // Dark labels lake polygons from water_name but shares Positron's named river tiles.
      output.layers.splice(output.layers.indexOf(label) + 1, 0, {
        ...label, id: 'waterway_line_label', 'source-layer': 'waterway', minzoom: 10,
      });
    }
  }
  if (typeof output.sprite === 'string') output.sprite = addKey(output.sprite, url, entry, keys);
  if (Array.isArray(output.sprite)) {
    output.sprite = output.sprite.map(item => ({ ...item, url: addKey(item.url, url, entry, keys) }));
  }
  delete output.glyphs;
  delete output['font-faces'];
  delete output.terrain;
  output.projection = { type: 'mercator' };
  return output;
}

export function baseLayerGroup(layer: LayerSpecification): BasemapGroup {
  const source = 'source-layer' in layer ? layer['source-layer'] ?? '' : '';
  const id = `${layer.id} ${source}`.toLowerCase();
  if (/^place\//.test(id) || /^(?:poi|pois)$/.test(source)) return 'shops';
  if (/\b(?:boundary|boundaries)\b|admin.*line/.test(id)) return 'boundaries';
  if (/buildings?|house.?number|address/.test(id)) return 'buildings';
  if (/water|river|ocean|canal|lake|wetland|reservoir/.test(id)) return 'water';
  if (/rail|railway|transit|subway|tram|ferry/.test(id)) return 'transport';
  if (/road|street|motorway|highway|transportation|freeway|route|bridge|tunnel|service-way|path/.test(id)) return 'roads';
  if (/poi|shops?|amenity|retail|commercial/.test(id)) return 'shops';
  if (/parks?|landuse|landcover|wood|green|grass|vegetation/.test(id)) return 'green';
  if (/places?|cities|city|settlement|suburb|region|province|town|village|neighborhood|populated|localit/.test(id)) return 'places';
  return 'other';
}

const chineseKeys = [
  'name:zh-Hans', 'name:zh-CN', 'name_zh_hans', '_name_zh_s', '_name_zh-cn', '_name_zh_CN',
  '_name_zh', 'name:zh', 'name_zh', 'name_zh_cn', '_name_local',
];
const digitAndPunctuation = '0123456789０１２３４５６７８９ .·、，。－-（）()《》：／/　';
const maxLabelLength = 28;
function han(character: unknown): unknown[] {
  return ['any',
    ['all', ['>=', character, '㐀'], ['<=', character, '䶿']],
    ['all', ['>=', character, '一'], ['<=', character, '鿿']],
    ['all', ['>=', character, '豈'], ['<=', character, '﫿']],
  ];
}

// String comparisons and code-point slices are MapLibre expressions evaluated on the tile.
// Restrict punctuation and numerals to strings that contain Han text.
export function confirmedChinese(value: unknown): ExpressionSpecification {
  const name = ['var', 'n'];
  const length = ['length', name];
  const chars = Array.from({ length: maxLabelLength }, (_, index) => {
    const char = ['slice', name, index, index + 1];
    const ideograph = han(char);
    return { ideograph, allowed: ['any', ['<=', length, index], ideograph, ['in', char, digitAndPunctuation]] };
  });
  return ['let', 'n', ['to-string', value],
    ['case', ['all', ['>', length, 0], ['<=', length, maxLabelLength],
      ['any', ...chars.map(({ ideograph }) => ideograph)],
      ...chars.map(({ allowed }) => allowed),
    ], name, ''],
  ] as unknown as ExpressionSpecification;
}

function referencedNames(value: unknown, fields = new Set<string>()): string[] {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/\{([^{}]+)\}/g)) fields.add(match[1]);
  } else if (Array.isArray(value)) {
    if (value[0] === 'get' && typeof value[1] === 'string') fields.add(value[1]);
    else value.forEach(part => referencedNames(part, fields));
  }
  return [...fields].filter(key => /name|label/i.test(key) && !/\b(en|latin|romanized|global)\b/i.test(key));
}

function chineseText(layer: SymbolLayerSpecification, provider: CatalogStyle['provider']): ExpressionSpecification {
  const keys = [...new Set([...chineseKeys, ...referencedNames(layer.layout?.['text-field']), '_name', 'name'])];
  const fields: unknown[] = keys.map(key => ['get', key]);
  if (provider === 'carto') {
    fields.unshift(
      ['case', ['==', ['get', 'script'], 'Han'], ['get', 'name'], null],
      ['case', ['==', ['get', 'script2'], 'Han'], ['get', 'name2'], null],
      ['case', ['==', ['get', 'script3'], 'Han'], ['get', 'name3'], null],
    );
    // The localized fields still have priority over the script segments.
    fields.unshift(['get', 'name:zh-Hans'], ['get', 'name:zh']);
  }
  return confirmedChinese(['coalesce', ...fields, '']);
}

export function fontStack(text: TextStyle): string[] {
  return [`${text.font.replace(' Variable', '')} ${text.bold ? 'Bold' : 'Regular'}`];
}

const roadMinor = /minor|tertiary|residential|service|unclassified|pedestrian|trail|path|track|local|street[_ -]?label/i;
const routeBadge = /shield|road[_-]ref|junction[_-]ref|\/(?:rectangle|octagon|hexagon|pentagon|[uv]-shaped|secondary hwy)\b/i;
const sparseGroupDensity: Partial<Record<BasemapGroup, number>> = { roads: 35, places: 46, boundaries: 34, water: 32 };
const layerTextCache = new WeakMap<StyleSpecification, Map<string, ExpressionSpecification>>();

export function isBasemapLabel(layer: LayerSpecification): layer is SymbolLayerSpecification {
  return layer.type === 'symbol' && Boolean(layer.layout?.['text-field']) && !routeBadge.test(layer.id);
}

function minimumLabelDensity(layer: SymbolLayerSpecification, group: BasemapGroup): number {
  const id = layer.id;
  if (group === 'roads') {
    if (/path|pedestrian|trail|track/i.test(id)) return 90;
    if (roadMinor.test(id)) return 74;
    if (/roadname_sec|secondary|ramp|alt name/i.test(id)) return 55;
  }
  if (group === 'places' && /suburb|village|hamlet|neighbou?rhood|place_other|settlement[_-]?minor/i.test(id)) return 67;
  if (group === 'water' && /small[_ -](?:river|lake)|ditch|pond|stream|waterfall|island/i.test(id)) return 66;
  return 1;
}

export function groupLabelDensity(settings: BasemapStyle, group: BasemapGroup): number {
  return settings.labelDensity?.[group] ?? (settings.minor ? 84 : sparseGroupDensity[group] ?? 0);
}

export function labelLayerDensity(layer: SymbolLayerSpecification, settings: BasemapStyle, group = baseLayerGroup(layer)): number {
  const override = settings.layerVisibility[layer.id];
  if (override === false) return 0;
  const ownDensity = settings.layerDensity?.[layer.id];
  if (ownDensity !== undefined) return ownDensity;
  const groupDensity = groupLabelDensity(settings, group);
  const minimum = minimumLabelDensity(layer, group);
  if (override === true) return Math.max(groupDensity, minimum, 35);
  return groupDensity >= minimum ? groupDensity : 0;
}

const mainOpenRoads = [
  ['motorway', 1], ['trunk', 1], ['primary', 27], ['secondary', 50], ['tertiary', 66],
] as const;
const localOpenRoads = [
  ['minor', 74], ['service', 80], ['track', 90], ['path', 90],
] as const;
const roadName: ExpressionSpecification = ['to-string', ['coalesce', ['get', 'name:zh-Hans'], ['get', 'name:zh'], ['get', 'name'], '']];
const ringName: ExpressionSpecification = ['any', ...['二环', '三环', '四环', '五环', '六环']
  .map<ExpressionSpecification>(ring => ['in', ring, roadName])];

function tuneOpenLabels(layer: SymbolLayerSpecification, density: number) {
  const source = layer['source-layer'];
  if (source === 'transportation_name') {
    if (layer.id === 'highway-name-major' || layer.id === 'highway_name_other') {
      const thresholds = layer.id === 'highway-name-major' ? mainOpenRoads :
        [...mainOpenRoads.filter(([kind]) => kind !== 'motorway'), ...localOpenRoads];
      const classes = thresholds.filter(([, minimum]) => density >= minimum).map(([kind]) => kind);
      layer.filter = ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false],
        ['match', ['get', 'class'], classes, true, false]];
    }
    layer.layout!['symbol-sort-key'] = ['case', ringName, 0,
      ['match', ['get', 'class'], 'motorway', 1, 'trunk', 2, 'primary', 3, 'secondary', 4, 'tertiary', 5, 6],
    ];
  } else if (source === 'place') {
    if (layer.id === 'label_other' && density < 67) {
      const classes = density < 51 ? ['borough'] : ['borough', 'suburb'];
      layer.filter = ['match', ['get', 'class'], classes, true, false];
    }
    layer.layout!['symbol-sort-key'] = ['number', ['get', 'rank'], 30];
  } else if (source === 'waterway' && density < 66) {
    layer.filter = ['all', layer.filter ?? true,
      ['match', ['get', 'class'], ['river', 'canal'], true, false],
    ] as ExpressionSpecification;
  }
}

export function styleBasemap(original: StyleSpecification, entry: CatalogStyle, settings: BasemapStyle): StyleSpecification {
  if (entry.provider === 'tianditu') {
    return {
      ...original,
      layers: original.layers.map(layer => layer.id === tiandituLabelLayer
        ? { ...layer, layout: { ...layer.layout, visibility: settings.labels ? 'visible' : 'none' } }
        : layer),
    };
  }
  let textFields = layerTextCache.get(original);
  if (!textFields) {
    textFields = new Map(original.layers.flatMap(layer => isBasemapLabel(layer)
      ? [[layer.id, chineseText(layer, entry.provider)]]
      : []));
    layerTextCache.set(original, textFields);
  }
  const layers: LayerSpecification[] = [];
  for (const originalLayer of original.layers) {
    if (originalLayer.type === 'background') {
      layers.push(originalLayer);
      continue;
    }
    const group = baseLayerGroup(originalLayer);
    const layer = { ...originalLayer, layout: { ...originalLayer.layout }, paint: { ...originalLayer.paint } } as LayerSpecification;
    const override = settings.layerVisibility[layer.id];
    if (settings.groups[group] === false || override === false) layer.layout!.visibility = 'none';
    else if (override === true) layer.layout!.visibility = 'visible';

    if (layer.type === 'symbol') {
      const label = textFields.get(layer.id);
      if (!label) continue;
      const minimum = minimumLabelDensity(layer, group);
      const density = labelLayerDensity(layer, settings, group);
      if (!settings.labels || settings.labelDensity?.[group] === 0 || density === 0) layer.layout!.visibility = 'none';
      else if (settings.layerDensity?.[layer.id] !== undefined && settings.groups[group] !== false) layer.layout!.visibility = 'visible';
      for (const key of Object.keys(layer.layout!)) {
        if (key.startsWith('icon-')) delete (layer.layout! as Record<string, unknown>)[key];
      }
      const isPlace = group === 'places' || group === 'boundaries';
      const sizeFactor = minimum > 1 ? 0.8 : isPlace ? 1.04 : 0.87;
      const spacing = 1 - density / 100;
      layer.layout!['text-field'] = label;
      layer.layout!['text-font'] = fontStack(settings.text);
      layer.layout!['text-size'] = Math.max(7, settings.text.size * sizeFactor);
      layer.layout!['text-transform'] = 'none';
      layer.layout!['text-allow-overlap'] = false;
      layer.layout!['text-ignore-placement'] = false;
      delete layer.layout!['text-overlap'];
      layer.layout!['text-padding'] = Math.round(2 + spacing * (isPlace ? 21 : 11));
      if (layer.layout!['symbol-placement'] === 'line' || Array.isArray(layer.layout!['symbol-placement'])) {
        layer.layout!['symbol-spacing'] = Math.round(group === 'water' ? 230 + spacing * 580 : 165 + spacing * 485);
      }
      if (group === 'roads' && typeof layer.minzoom === 'number') {
        const labelZoom = minimum === 1 ? (entry.provider === 'open' ? 9.5 : 10.8) : minimum >= 90 ? 13 : 12;
        layer.minzoom = Math.min(layer.minzoom, labelZoom);
      }
      if (entry.provider === 'open') tuneOpenLabels(layer, density || minimum);
      layer.paint!['text-color'] = settings.text.color;
      layer.paint!['text-halo-color'] = settings.text.halo;
      layer.paint!['text-halo-width'] = settings.text.haloWidth;
      for (const key of Object.keys(layer.paint!)) {
        if (key.startsWith('icon-')) delete (layer.paint! as Record<string, unknown>)[key];
      }
    }
    if (group === 'roads') {
      if (entry.provider === 'open' && layer.type === 'line' && (layer.id === 'highway_minor' || layer.id === 'highway_path')) {
        const path = layer.id === 'highway_path';
        layer.paint!['line-width'] = ['interpolate', ['exponential', 1.45], ['zoom'],
          9, path ? 0.3 : 0.55, 13, path ? 0.53 : 0.92, 16, path ? 1.5 : 3, 20, path ? 10 : 20,
        ];
        layer.paint!['line-color'] = entry.dark ? (path ? '#22272b' : '#2e343a') : (path ? '#e8ebe8' : '#dfe3e2');
      }
      const overrideColor = roadMinor.test(layer.id) ? settings.roadColorMinor : settings.roadColor;
      if (overrideColor) {
        if (layer.type === 'line' && !layer.paint!['line-pattern']) layer.paint!['line-color'] = overrideColor;
        else if (layer.type === 'fill' && !layer.paint!['fill-pattern']) layer.paint!['fill-color'] = overrideColor;
      }
    }
    layers.push(layer);
  }
  return { ...original, layers };
}

export function attributionText(style: StyleSpecification): string[] {
  const labels = new Set<string>();
  for (const source of Object.values(style.sources)) {
    if ((source.type === 'vector' || source.type === 'raster') && source.attribution) {
      const document = new DOMParser().parseFromString(source.attribution, 'text/html');
      labels.add((document.body.textContent || '').trim());
    }
  }
  return [...labels].filter(Boolean);
}
