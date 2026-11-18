import type { Feature, Geometry, GeoJsonProperties, Position } from 'geojson';
import proj4 from 'proj4';
import type { Collection } from '../model';

export interface ImportOptions { crs: string; encoding: string }
export interface ImportedLayer { name: string; data: Collection; skipped: number }
export interface ImportResult { layers: ImportedLayer[]; errors: string[] }

const MAX_FEATURES = 250_000;

proj4.defs('EPSG:4490', '+proj=longlat +ellps=GRS80 +no_defs');
for (const [code, meridian, falseEasting] of [
  [4526, 114, 38500000], [4527, 117, 39500000], [4528, 120, 40500000],
  [4547, 114, 500000], [4548, 117, 500000], [4549, 120, 500000],
]) {
  proj4.defs(`EPSG:${code}`, `+proj=tmerc +lat_0=0 +lon_0=${meridian} +k=1 +x_0=${falseEasting} +y_0=0 +ellps=GRS80 +units=m +no_defs`);
}

export function knownProjection(code: string) {
  const value = code.trim().toUpperCase();
  return /^EPSG:\d+$/.test(value) && Boolean(proj4.defs(value));
}

function positionMapper(crs: string) {
  const source = crs.trim();
  const localWkt = /499945[,.]0*|499945\s*\]/i.test(source) && /299970[,.]0*|299970\s*\]/i.test(source);
  if (localWkt || /BJ[_ -]?LOCAL|北京地方|北京城建独立/i.test(source)) {
    throw new Error('请先将北京地方坐标数据转换为 WGS84，再导入文件。');
  }
  let transform: { forward: (position: number[]) => number[] } | undefined;
  if (source && source.toUpperCase() !== 'EPSG:4326' && !/CRS:?84$/i.test(source)) {
    try {
      transform = proj4(knownProjection(source) ? source.toUpperCase() : source, 'EPSG:4326');
    } catch {
      throw new Error('坐标系无法识别。请填写 EPSG 编号、WKT 或 PROJ 定义，也可先转换为 WGS84。');
    }
  }
  return (coords: unknown): Position => {
    if (!Array.isArray(coords) || coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
      throw new Error('图层含有无效坐标。');
    }
    const pair = transform ? transform.forward([coords[0], coords[1]]) : [coords[0], coords[1]];
    if (!pair.every(Number.isFinite) || Math.abs(pair[0]) > 180 || Math.abs(pair[1]) > 85.051129) {
      throw new Error('坐标超出地图范围。请核对坐标系、经纬度顺序或 Shapefile 的 PRJ 文件。');
    }
    return pair;
  };
}

function mapGeometry(geometry: Geometry, move: (coords: unknown) => Position): Geometry[] {
  if (geometry.type === 'GeometryCollection') {
    return geometry.geometries.flatMap(child => mapGeometry(child, move));
  }
  let transformed: Geometry;
  switch (geometry.type) {
    case 'Point': transformed = { type: geometry.type, coordinates: move(geometry.coordinates) }; break;
    case 'MultiPoint':
    case 'LineString':
      transformed = { type: geometry.type, coordinates: geometry.coordinates.map(move) };
      break;
    case 'MultiLineString':
    case 'Polygon':
      transformed = { type: geometry.type, coordinates: geometry.coordinates.map(line => line.map(move)) };
      break;
    case 'MultiPolygon':
      transformed = { type: geometry.type, coordinates: geometry.coordinates.map(polygon => polygon.map(ring => ring.map(move))) };
      break;
    default: throw new Error('图层含有当前版本无法读取的几何类型。');
  }
  return 'coordinates' in transformed && transformed.coordinates.length ? [transformed] : [];
}

export function normalize(raw: unknown, source: string, name: string): ImportedLayer {
  if (!raw || typeof raw !== 'object' || !('type' in raw)) throw new Error('文件缺少有效的 GeoJSON 结构。');
  const typed = raw as Collection | Feature | Geometry;
  const rawFeatures = typed.type === 'FeatureCollection'
    ? typed.features
    : typed.type === 'Feature' ? [typed] : [{ type: 'Feature' as const, properties: {}, geometry: typed }];
  if (!Array.isArray(rawFeatures) || rawFeatures.length > MAX_FEATURES) throw new Error('单图层最多可导入 25 万个要素。');
  const move = positionMapper(source);
  const features: Feature<Geometry, GeoJsonProperties>[] = [];
  let skipped = 0;
  for (const feature of rawFeatures) {
    if (!feature || feature.type !== 'Feature') throw new Error('文件包含无效的要素记录。');
    if (!feature.geometry) {
      skipped++;
      continue;
    }
    const props = feature.properties && typeof feature.properties === 'object' && !Array.isArray(feature.properties)
      ? feature.properties : {};
    mapGeometry(feature.geometry, move).forEach(geometry => {
      features.push({ type: 'Feature', properties: props, geometry });
    });
    if (features.length > MAX_FEATURES) throw new Error('拆分后超出单图层要素上限。');
  }
  if (!features.length) throw new Error('文件中没有可显示的点、线或面。');
  return { name, data: { type: 'FeatureCollection', features }, skipped };
}

export function readGeoJson(text: string, name: string, crs = ''): ImportedLayer {
  const raw = JSON.parse(text.replace(/^\ufeff/, ''));
  const legacyProjection = raw?.crs?.properties?.name;
  const projection = typeof legacyProjection === 'string'
    ? legacyProjection.replace(/^urn:ogc:def:crs:EPSG:.*:/i, 'EPSG:')
    : '';
  return normalize(raw, crs || projection || 'EPSG:4326', name);
}
