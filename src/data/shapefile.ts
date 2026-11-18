import { unzipSync } from 'fflate';
import { combine, parseDbf, parseShp } from 'shpjs';
import { normalize } from './importer';
import type { ImportOptions, ImportResult } from './importer';

const decoder = new TextDecoder();
const MAX_ARCHIVE = 140 * 1024 * 1024;
const component = /\.(shp|shx|dbf|prj|cpg)$/i;

function parseComponents(entries: Map<string, Uint8Array>, id: string, options: ImportOptions) {
  const dbf = entries.get(`${id}.dbf`);
  const cpg = entries.get(`${id}.cpg`);
  const prj = entries.get(`${id}.prj`);
  const shp = entries.get(`${id}.shp`)!;
  const name = id.split('/').at(-1) || 'Shapefile';
  const encoding = options.encoding || (cpg ? decoder.decode(cpg).trim() : undefined);
  const geometry = parseShp(new Uint8Array(shp).buffer);
  const normalizedEncoding = /^(?:936|CP936|GBK|GB2312)$/i.test(encoding || '') ? 'gb18030' : encoding;
  const attributes = dbf
    ? parseDbf(new Uint8Array(dbf).buffer, new TextEncoder().encode(normalizedEncoding || 'utf-8').buffer)
    : undefined;
  return normalize(combine([geometry, attributes ?? []]), options.crs || (prj ? decoder.decode(prj) : ''), name);
}

function parseEntries(entries: Map<string, Uint8Array>, options: ImportOptions): ImportResult {
  const result: ImportResult = { layers: [], errors: [] };
  const mainFiles = [...entries.keys()].filter(name => name.endsWith('.shp'));
  if (!mainFiles.length) throw new Error('请选择 SHP 文件，或包含 SHP 的 ZIP 文件。');
  for (const name of mainFiles) {
    const id = name.slice(0, -4);
    try {
      const layer = parseComponents(entries, id, options);
      result.layers.push(layer);
    } catch (error) {
      result.errors.push(`${id.split('/').at(-1)}｜${error instanceof Error ? error.message : '文件无法读取'}`);
    }
  }
  return result;
}

export async function readShapefiles(files: File[], options: ImportOptions): Promise<ImportResult> {
  const entries = new Map<string, Uint8Array>();
  for (const file of files.filter(file => component.test(file.name))) {
    entries.set(file.name.toLowerCase(), new Uint8Array(await file.arrayBuffer()));
  }
  return parseEntries(entries, options);
}

export async function readShapeZip(file: File, options: ImportOptions): Promise<ImportResult> {
  let total = 0;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const unzipped = unzipSync(bytes, {
    filter(entry) {
      if (!component.test(entry.name) || entry.name.startsWith('__MACOSX/')) return false;
      total += entry.originalSize;
      if (total > MAX_ARCHIVE) throw new Error('ZIP 解压后的矢量文件超过 140 MB。');
      return true;
    },
  });
  const entries = new Map(Object.entries(unzipped).map(([name, bytes]) => [name.toLowerCase(), bytes]));
  return parseEntries(entries, options);
}
