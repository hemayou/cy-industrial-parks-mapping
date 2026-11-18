import type { RasterSourceSpecification, StyleSpecification } from 'maplibre-gl';

export const tiandituLabelLayer = 'tianditu-labels';

function source(layer: 'vec' | 'cva', tk: string): RasterSourceSpecification {
  const query = 'SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
    `&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles` +
    `&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${encodeURIComponent(tk)}`;
  return {
    type: 'raster',
    tiles: [`https://t0.tianditu.gov.cn/${layer}_w/wmts?${query}`],
    tileSize: 256,
    minzoom: 1,
    maxzoom: 18,
    attribution: '<a href="https://www.tianditu.gov.cn/">天地图</a>',
  };
}

export function tiandituStyle(tk: string): StyleSpecification {
  return {
    version: 8,
    sources: { 'tianditu-base': source('vec', tk), [tiandituLabelLayer]: source('cva', tk) },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#f4f5f4' } },
      { id: 'tianditu-base', type: 'raster', source: 'tianditu-base' },
      { id: tiandituLabelLayer, type: 'raster', source: tiandituLabelLayer },
    ],
  };
}
