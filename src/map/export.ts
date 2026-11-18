import { Map as GLMap } from 'maplibre-gl';
import type { MapEventType, StyleSpecification } from 'maplibre-gl';
import type { Bounds, DataLayer, Layout, OutputSpec } from '../model';
import { outputPixels } from '../model';
import { writeDpi } from './dpi';
import { installMarkers } from './markers';
import { paintSheet, planSheet, prepareSheetFonts, renderSheetFrames } from './sheet';

export interface ExportJob {
  style: StyleSpecification;
  bounds: Bounds;
  layers: DataLayer[];
  layout: Layout;
  output: OutputSpec;
  attribution: string[];
}

class GraphicsCapacityError extends Error {}

function awaitMap(map: GLMap) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('底图加载超时。请检查网络或切换底图后重试。')), 55_000);
    const idle = () => finish();
    const onError = (event: MapEventType['error']) => {
      if (location.hostname === '127.0.0.1') {
        console.warn('出图资源', event.error.message.replace(/https?:\/\/[^\s)+]+/g, url => url.split('?')[0]));
      }
      finish(new Error('出图时有地图资源加载失败。请检查底图连接后重试。'));
    };
    const onLost = () => finish(new GraphicsCapacityError('设备图形内存不足，地图画布已断开。'));
    function finish(error?: Error) {
      window.clearTimeout(timer);
      map.off('idle', idle);
      map.off('error', onError);
      map.getCanvas().removeEventListener('webglcontextlost', onLost);
      if (error) reject(error);
      else resolve();
    }
    map.on('idle', idle);
    map.on('error', onError);
    map.getCanvas().addEventListener('webglcontextlost', onLost);
  });
}

function canvasBlob(canvas: HTMLCanvasElement, format: 'png' | 'jpeg') {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('设备无法编码此尺寸的图片，请减小输出像素。')),
      `image/${format}`, format === 'jpeg' ? 0.96 : undefined);
  });
}

export async function renderSheet(job: ExportJob, preview = false) {
  const { style, bounds, layers, layout, attribution, output } = job;
  const { width, height } = outputPixels(output);
  const dpi = Math.round(output.dpi);
  if (![width, height, dpi].every(Number.isFinite) || width < 1 || height < 1 || dpi < 36 || dpi > 1200) {
    throw new Error('请输入有效的像素宽高和 36–1200 DPI。');
  }
  if (!preview && (Math.max(width, height) > 16384 || width * height > 100_000_000)) {
    throw new Error('此设备上的出图范围为单边至多 16384 像素、总计至多一亿像素。');
  }
  const dpiScale = dpi / 96;
  const logicalWidth = width / dpiScale;
  const logicalHeight = height / dpiScale;
  if (Math.min(logicalWidth, logicalHeight) < 240) {
    throw new Error('按当前 DPI 计算的成图版面过小，请增加像素或降低 DPI。');
  }
  await prepareSheetFonts(layout, layers, attribution);

  const canvas = document.createElement('canvas');
  const scale = preview ? Math.min(dpiScale, 800 / Math.max(logicalWidth, logicalHeight)) : dpiScale;
  canvas.width = preview ? Math.round(logicalWidth * scale) : width;
  canvas.height = preview ? Math.round(logicalHeight * scale) : height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('浏览器无法创建导出画布。');
  const plan = planSheet(context, logicalWidth, logicalHeight, layout, layers, attribution);
  const container = document.createElement('div');
  container.className = 'export-map';
  container.style.width = `${Math.round(plan.map.width)}px`;
  container.style.height = `${Math.round(plan.map.height)}px`;
  document.body.appendChild(container);
  let map: GLMap | undefined;
  try {
    const start = async (pixelRatio: number) => {
      try {
        map = new GLMap({
          container, style, attributionControl: false, interactive: false, localIdeographFontFamily: false,
          renderWorldCopies: false, maxPitch: 0, fadeDuration: 0, pixelRatio,
          maxCanvasSize: [16384, 16384],
          canvasContextAttributes: { preserveDrawingBuffer: true, antialias: false },
          center: [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2],
          zoom: 11,
        });
      } catch (error) {
        if (/webgl|图形/i.test(String(error))) throw new GraphicsCapacityError('设备无法创建大幅面地图画布。');
        throw error;
      }
      installMarkers(map);
      const padding = Math.max(25, Math.min(plan.map.width, plan.map.height) * 0.075);
      map.fitBounds(bounds, { duration: 0, padding, maxZoom: 16 });
      await awaitMap(map);
      return map;
    };

    let drawing: GLMap;
    try {
      drawing = await start(scale);
    } catch (error) {
      if (!(error instanceof GraphicsCapacityError) || preview || scale <= 1.3) throw error;
      if (map) {
        (map as GLMap).remove();
        map = undefined;
      }
      drawing = await start(Math.min(scale * 0.73, 2));
    }
    const rendered = drawing.getCanvas();
    const reduced = rendered.width + 3 < container.clientWidth * scale || rendered.height + 3 < container.clientHeight * scale;
    context.scale(canvas.width / logicalWidth, canvas.height / logicalHeight);
    paintSheet(context, logicalWidth, logicalHeight, plan, layout, rendered, preview);
    drawing.remove();
    map = undefined;
    const frames = preview ? await renderSheetFrames(logicalWidth, logicalHeight, scale, plan, layout) : [];
    const format = preview ? 'png' : output.type;
    const blob = await canvasBlob(canvas, format);
    return { blob: preview ? blob : await writeDpi(blob, dpi, format), width, height, reduced, frames };
  } finally {
    map?.remove();
    container.remove();
    canvas.width = canvas.height = 1;
  }
}
