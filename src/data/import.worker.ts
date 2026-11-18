import { readGeoJson } from './importer';
import type { ImportOptions, ImportResult } from './importer';

const maxSize = 80 * 1024 * 1024;
const sidecar = /\.(shp|shx|dbf|prj|cpg)$/i;

self.onmessage = async (event: MessageEvent<{ files: File[]; options: ImportOptions }>) => {
  const { files, options } = event.data;
  const result: ImportResult = { layers: [], errors: [] };
  const add = (other: ImportResult) => {
    result.layers.push(...other.layers);
    result.errors.push(...other.errors);
  };
  const errorText = (error: unknown) => error instanceof Error ? error.message : '文件无法读取。';
  if (files.reduce((size, file) => size + file.size, 0) > maxSize) {
    self.postMessage({ layers: [], errors: ['每批文件最多 80 MB。请分批导入。'] } satisfies ImportResult);
    return;
  }
  const shapeParts = files.filter(file => sidecar.test(file.name));
  if (shapeParts.length) {
    try {
      const { readShapefiles } = await import('./shapefile');
      add(await readShapefiles(shapeParts, options));
    } catch (error) {
      result.errors.push(`Shapefile｜${errorText(error)}`);
    }
  }
  for (const file of files.filter(file => !sidecar.test(file.name))) {
    try {
      if (/\.(geojson|json)$/i.test(file.name)) {
        result.layers.push(readGeoJson(await file.text(), file.name.replace(/\.[^.]+$/, ''), options.crs));
      } else if (/\.zip$/i.test(file.name)) {
        const { readShapeZip } = await import('./shapefile');
        add(await readShapeZip(file, options));
      } else if (/\.gpkg$/i.test(file.name)) {
        const { readGeoPackage } = await import('./geopackage');
        add(await readGeoPackage(file, options));
      } else {
        result.errors.push(`${file.name}｜请选择 GeoJSON、Shapefile 或 GeoPackage。`);
      }
    } catch (error) {
      result.errors.push(`${file.name}｜${errorText(error)}`);
    }
  }
  self.postMessage(result);
};
