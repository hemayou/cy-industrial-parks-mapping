import { Crosshair, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AttributionControl, Map as GLMap, ScaleControl } from 'maplibre-gl';
import type { MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import type { Bounds } from './model';
import { BEIJING_BOUNDS } from './model';
import { installMarkers } from './map/markers';

interface Props {
  style: StyleSpecification;
  bounds: Bounds;
  blocked: boolean;
  status: string;
  example: boolean;
  onFailure: () => void;
}

export function MapCanvas({ style, bounds, blocked, status, example, onFailure }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const liveMap = useRef<GLMap | null>(null);
  const activeStyle = useRef(style);
  const firstBounds = useRef(bounds);
  const failure = useRef(onFailure);
  failure.current = onFailure;
  const [zoom, setZoom] = useState(11);
  const [mouse, setMouse] = useState<string>();
  const [webgl, setWebgl] = useState(true);

  function fit(map: GLMap, region: Bounds) {
    const element = map.getContainer();
    const padding = Math.round(Math.max(18, Math.min(70, Math.min(element.clientWidth, element.clientHeight) * 0.12)));
    map.fitBounds(region, { padding, duration: 0, maxZoom: 16 });
  }

  useEffect(() => {
    if (!container.current) return;
    let map: GLMap;
    try {
      map = new GLMap({
        container: container.current, style: activeStyle.current, localIdeographFontFamily: false,
        renderWorldCopies: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
        maxPitch: 0, maxBounds: BEIJING_BOUNDS, minZoom: 7.1, maxZoom: 18,
        center: [116.492, 39.961], zoom: 10.8,
        attributionControl: false, fadeDuration: 120,
      });
    } catch {
      setWebgl(false);
      return;
    }
    liveMap.current = map;
    installMarkers(map);
    map.touchZoomRotate.disableRotation();
    map.addControl(new AttributionControl({ compact: true, customAttribution: '开放参考区界 © OpenStreetMap' }), 'bottom-right');
    map.addControl(new ScaleControl({ maxWidth: 114, unit: 'metric' }), 'bottom-left');
    const onMove = () => setZoom(map.getZoom());
    let lastMouse = 0;
    const onMouse = (event: MapMouseEvent) => {
      if (performance.now() - lastMouse < 90) return;
      lastMouse = performance.now();
      setMouse(`${event.lngLat.lng.toFixed(4)}°E  ${event.lngLat.lat.toFixed(4)}°N`);
    };
    map.on('moveend', onMove);
    map.on('mousemove', onMouse);
    map.on('error', event => {
      if (location.hostname === '127.0.0.1') {
        console.warn('地图资源', event.error.message.replace(/https?:\/\/[^\s)+]+/g, url => url.split('?')[0]));
      }
      failure.current();
    });
    fit(map, firstBounds.current);
    return () => {
      liveMap.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    if (activeStyle.current !== style) {
      activeStyle.current = style;
      if (liveMap.current) liveMap.current.setStyle(style, { diff: true });
    }
  }, [style]);

  useEffect(() => {
    if (liveMap.current) fit(liveMap.current, bounds);
  }, [bounds]);

  return <main className="map-workspace" aria-label="朝阳区地图编辑区">
    <div ref={container} className="map-canvas" aria-label="可平移缩放的地图" />
    <div className="map-heading">
      <div><span className="scope-dot" />朝阳区全域</div>
      {example && <span className="sample-chip">示例图层</span>}
    </div>
    <div className="map-navigation">
      <button type="button" aria-label="定位朝阳区全域" title="定位朝阳区全域"
        onClick={() => liveMap.current && fit(liveMap.current, bounds)}><Crosshair size={18} /></button>
      <button type="button" aria-label="放大地图" title="放大地图" onClick={() => liveMap.current?.zoomIn()}><Plus size={19} /></button>
      <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => liveMap.current?.zoomOut()}><Minus size={19} /></button>
    </div>
    <div className="map-status">
      <span>{status}</span>
      <span className="map-coords">{mouse ?? 'WGS84'} <i /> 缩放 {zoom.toFixed(1)}</span>
    </div>
    {(!webgl || blocked) && <div className="map-alert" role="status">
      {webgl ? '底图连接失败。可在底图面板重试或切换样式。' : '当前浏览器无法使用 WebGL 2。请启用硬件加速后重试。'}
    </div>}
  </main>;
}
