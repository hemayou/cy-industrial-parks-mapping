import type { Geometry, GeoJsonProperties } from 'geojson';
import type { Bounds, DataLayer } from '../model';
import { extent } from '../model';

const nameFields = ['园区名称', '项目名称', '名称', 'NAME', 'name_zh', 'name', '地名'];
const fieldLabels = [
  ['实施时序', ['LIST', '实施时序', '阶段', 'phase']],
  ['产业分类', ['INDUSTRY', '产业分类', '产业类型', '行业']],
  ['产业赛道', ['TRACK', '产业赛道']],
  ['属地街乡', ['TOWN', '属地街乡', '属地', '街乡', '街道']],
  ['项目地址', ['ADDRESS', '项目地址', '园区地址', '地址']],
  ['定位精度', ['PRECISION', '定位精度']],
  ['定位备注', ['LOCATION_NOTE', '定位备注']],
  ['地理编码层级', ['LEVEL', '地理编码层级']],
  ['编号', ['编号', '项目编号']],
  ['区块来源', ['source_type']],
] as const;
const internalFields = /^(?:__cy_.*|id|fid|objectid|wgs_lng|wgs_lat|gcj_lng|gcj_lat|merged|zone_id|color|parts)$/i;

export function overlaySourceId(layerId: string) { return `overlay-${layerId}`; }

interface AttributeRow { label: string; value: string }
export interface ParkFeature {
  source: string;
  index: number;
  name: string;
  layerName: string;
  geometry: Geometry;
  details: AttributeRow[];
  pending: boolean;
}
export interface SearchEntry {
  record: ParkFeature;
  key: string;
  fields: { key: string; value: string }[];
}

function fieldText(value: unknown) {
  return typeof value === 'string' ? value.trim()
    : typeof value === 'number' && Number.isFinite(value) ? String(value)
    : typeof value === 'boolean' ? (value ? '是' : '否') : '';
}

function fieldsOf(properties: GeoJsonProperties, layer: DataLayer, index: number) {
  const attributes = new Map(Object.entries(properties ?? {}).flatMap(([key, value]) => {
    const text = fieldText(value);
    return text ? [[key.toLowerCase(), { label: key, value: text }] as const] : [];
  }));
  const titles = [...nameFields, layer.style.labelField];
  const rawName = titles.map(key => attributes.get(key.toLowerCase())?.value).find(Boolean);
  const used = new Set(titles.map(key => key.toLowerCase()));
  const details: AttributeRow[] = fieldLabels.flatMap(([label, names]) => {
    const keys = names.map(key => key.toLowerCase());
    keys.forEach(key => used.add(key));
    const value = keys.map(key => attributes.get(key)?.value).find(Boolean);
    return value ? [{ label, value }] : [];
  });
  for (const [key, row] of attributes) {
    if (!used.has(key) && !internalFields.test(key)) details.push(row);
  }
  return { name: rawName ?? `${layer.name} ${index + 1}`, details };
}

const searchKey = (value: string) => value.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function browseParkFeatures(layers: DataLayer[]) {
  const bySource = new Map<string, ParkFeature[]>();
  const searchable: SearchEntry[] = [];
  for (const layer of layers) {
    const source = overlaySourceId(layer.id);
    const records = layer.data.features.map(({ properties, geometry }, index) => {
      const { name, details } = fieldsOf(properties, layer, index);
      const pending = details.some(row => row.label === '定位精度' && /仅区县级|需人工核对|位置待核/.test(row.value));
      const record = { source, index, name, layerName: layer.name, geometry, details, pending };
      searchable.push({ record, key: searchKey(name), fields: details.map(({ value }) => ({ key: searchKey(value), value })) });
      return record;
    });
    bySource.set(source, records);
  }
  return { bySource, searchable };
}

export function searchParkFeatures(entries: SearchEntry[], query: string) {
  const terms = query.trim().split(/\s+/).map(searchKey).filter(Boolean);
  if (!terms.length) return [];
  const joined = terms.join('');
  return entries.flatMap(({ record, key, fields }) => {
    if (!terms.every(term => key.includes(term) || fields.some(field => field.key.includes(term)))) return [];
    const rank = key === joined ? 0 : key.startsWith(joined) ? 1 : key.includes(joined) ? 2 : 3;
    const matching = fields.filter(field => terms.some(term => field.key.includes(term))).map(field => field.value);
    const context = matching.length ? matching : record.details.filter(row =>
      ['属地街乡', '产业分类', '产业赛道', '实施时序'].includes(row.label)).map(row => row.value);
    return [{ record, rank, summary: [...new Set(context)].slice(0, 2).join(' · ') || record.layerName }];
  }).sort((a, b) => a.rank - b.rank || Number(a.record.pending) - Number(b.record.pending));
}

type MapPosition = [number, number];

export function parkLocation(geometry: Geometry): { anchor: MapPosition; bounds?: Bounds } | null {
  if (geometry.type === 'Point') return { anchor: [geometry.coordinates[0], geometry.coordinates[1]] };
  const bounds = extent({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry, properties: null }] });
  if (!bounds) return null;
  const [min, max] = bounds;
  return { anchor: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], bounds };
}
