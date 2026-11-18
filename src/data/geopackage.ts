import initSqlJs from 'sql.js';
import sqlWasm from 'sql.js/dist/sql-wasm.wasm?url';
import GeoJSON from 'ol/format/GeoJSON.js';
import WKB from 'ol/format/WKB.js';
import type { Feature, Geometry } from 'geojson';
import type { SqlValue } from 'sql.js';
import { knownProjection, normalize } from './importer';
import type { ImportOptions, ImportResult } from './importer';

const wkb = new WKB();
const geojson = new GeoJSON();
let sqlite: ReturnType<typeof initSqlJs> | undefined;
const quoteIdentifier = (value: string) => '"' + value.replaceAll('"', '""') + '"';

function readGeometry(value: SqlValue): Geometry | null {
  if (value === null) return null;
  if (!(value instanceof Uint8Array) || value.length < 8 || value[0] !== 71 || value[1] !== 80 || value[2] !== 0) {
    throw new Error('GeoPackage 包含无效的几何记录。');
  }
  const flags = value[3];
  if ((flags & 0x10) !== 0) return null;
  const offset = [0, 32, 48, 48, 64][(flags >> 1) & 7];
  if (offset === undefined || value.length <= 8 + offset || (flags & 0x20) !== 0) {
    throw new Error('图层含有当前版本无法读取的 GeoPackage 几何扩展。');
  }
  const geom = wkb.readGeometry(value.subarray(8 + offset));
  return geom ? geojson.writeGeometryObject(geom) : null;
}

export async function readGeoPackage(file: File, options: ImportOptions): Promise<ImportResult> {
  sqlite ??= initSqlJs({ locateFile: () => sqlWasm });
  const SQL = await sqlite;
  const database = new SQL.Database(new Uint8Array(await file.arrayBuffer()));
  const result: ImportResult = { layers: [], errors: [] };
  try {
    const contents = database.exec(`
      SELECT g.table_name, g.column_name, c.identifier, s.organization, s.organization_coordsys_id, s.definition
      FROM gpkg_geometry_columns g
      JOIN gpkg_contents c ON c.table_name = g.table_name AND c.data_type = 'features'
      LEFT JOIN gpkg_spatial_ref_sys s ON s.srs_id = g.srs_id
      ORDER BY g.table_name
    `)[0];
    if (!contents?.values.length) throw new Error('GeoPackage 中没有矢量要素表。');
    for (const [table, geomColumn, identifier, organization, code, definition] of contents.values) {
      const name = String(identifier || table);
      try {
        const epsg = `${String(organization).toUpperCase()}:${code}`;
        const crs = options.crs || (knownProjection(epsg) ? epsg : String(definition || ''));
        if (!crs || /^(undefined|unknown)$/i.test(crs)) {
          throw new Error('缺少有效的坐标系定义。请填写源坐标系后重试。');
        }
        const statement = database.prepare(`SELECT * FROM ${quoteIdentifier(String(table))} LIMIT 250001`);
        const features: Feature<Geometry | null>[] = [];
        try {
          while (statement.step()) {
            const { [String(geomColumn)]: binary, ...attributes } = statement.getAsObject();
            const properties = Object.fromEntries(Object.entries(attributes).filter(([, attr]) => !(attr instanceof Uint8Array)));
            features.push({ type: 'Feature', properties, geometry: readGeometry(binary) });
          }
        } finally {
          statement.free();
        }
        result.layers.push(normalize({ type: 'FeatureCollection', features }, crs, name));
      } catch (error) {
        result.errors.push(`${name}｜${error instanceof Error ? error.message : '图层无法读取'}`);
      }
    }
    return result;
  } finally {
    database.close();
  }
}
