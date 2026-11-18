import { Crosshair, Minus, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AttributionControl, Map as GLMap, Popup, ScaleControl } from 'maplibre-gl';
import type { MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import type { Bounds, DataLayer } from './model';
import { BEIJING_BOUNDS } from './model';
import { ParkDetails, ParkSearch } from './ParkBrowser';
import { installMarkers } from './map/markers';
import { labelClipPath } from './map/labelClip';
import type { PlotScene } from './map/compose';
import { browseParkFeatures, parkLocation } from './map/parkFeatures';
import type { ParkFeature } from './map/parkFeatures';

interface Props {
  scene: PlotScene;
  bounds: Bounds;
  layers: DataLayer[];
  notice?: string;
  status: string;
  example: boolean;
  onFailure: () => void;
}

interface Selection {
  source: string;
  index: number;
  anchor?: [number, number];
}

export function MapCanvas({ scene, bounds, layers, notice, status, example, onFailure }: Props) {
  const { style } = scene;
  const parks = useMemo(() => browseParkFeatures(layers), [layers]);
  const currentParks = useRef(parks.bySource);
  currentParks.current = parks.bySource;
  const [selection, setSelection] = useState<Selection>();
  const [popupContent] = useState(() => document.createElement('div'));
  const selectedPark = selection ? parks.bySource.get(selection.source)?.[selection.index] : undefined;
  const popupAnchor = selectedPark && selection?.anchor;
  const labelsContainer = useRef<HTMLDivElement>(null);
  const foregroundContainer = useRef<HTMLDivElement>(null);
  const currentScene = useRef(scene);
  currentScene.current = scene;
  const mountedPasses = useRef<{
    labels: GLMap; labelStyle: StyleSpecification; foreground?: GLMap; foregroundStyle?: StyleSpecification; sync: () => void;
  } | null>(null);
  const hasClip = Boolean(scene.annotations);
  const hasForeground = Boolean(scene.foreground);
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

  function selectPark(record: ParkFeature) {
    const location = record.pending ? null : parkLocation(record.geometry);
    setSelection({ source: record.source, index: record.index, anchor: location?.anchor });
    const map = liveMap.current;
    if (!map || !location) return;
    if (location.bounds) map.fitBounds(location.bounds, { padding: 75, maxZoom: 15.5, duration: 1050 });
    else map.flyTo({ center: location.anchor, zoom: Math.max(map.getZoom(), 15.5), duration: 1050 });
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

    function hitPark({ point: { x, y } }: MapMouseEvent) {
      const lookup = currentParks.current;
      const { foreground, style } = currentScene.current;
      const pointBox: [[number, number], [number, number]] = [[x - 4, y - 4], [x + 4, y + 4]];
      const fg = mountedPasses.current?.foreground;
      let first: ParkFeature | undefined;
      const passes = fg && foreground ? [{ map: fg, style: foreground }, { map, style }] : [{ map, style }];
      for (const pass of passes) {
        const ids = pass.style.layers.flatMap(layer =>
          'source' in layer && lookup.has(layer.source) && pass.map.getLayer(layer.id) ? [layer.id] : []);
        if (!ids.length) continue;
        for (const hit of pass.map.queryRenderedFeatures(pointBox, { layers: ids })) {
          const record = lookup.get(hit.source)?.[Number(hit.id)];
          if (record?.geometry.type === 'Point' || record?.geometry.type === 'MultiPoint') return record;
          first ??= record;
        }
      }
      return first;
    }

    const onMove = () => setZoom(map.getZoom());
    let lastMouse = 0;
    const onMouse = (event: MapMouseEvent) => {
      if (performance.now() - lastMouse < 90) return;
      lastMouse = performance.now();
      setMouse(`${event.lngLat.lng.toFixed(4)}°E  ${event.lngLat.lat.toFixed(4)}°N`);
      map.getCanvas().style.cursor = hitPark(event) ? 'pointer' : '';
    };
    const onClick = (event: MapMouseEvent) => {
      const record = hitPark(event);
      if (!record) return setSelection(undefined);
      const anchor = record.geometry.type === 'Point' ? parkLocation(record.geometry)?.anchor : event.lngLat.toArray();
      setSelection({ source: record.source, index: record.index, anchor: record.pending ? undefined : anchor });
    };
    map.on('moveend', onMove);
    map.on('mousemove', onMouse);
    map.on('click', onClick);
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

  useEffect(() => {
    const map = liveMap.current;
    if (!map || !popupAnchor) return;
    const popup = new Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false,
      offset: 12, className: 'park-map-popup', maxWidth: 'none' });
    popup.setLngLat(popupAnchor).setDOMContent(popupContent).addTo(map);
    return () => { popup.remove(); };
  }, [popupAnchor, popupContent]);

  useEffect(() => {
    const map = liveMap.current;
    const target = labelsContainer.current;
    const initial = currentScene.current;
    if (!map || !target || !initial.annotations) return;
    const extras: GLMap[] = [];

    function createPass(element: HTMLDivElement, passStyle: StyleSpecification) {
      const layer = new GLMap({
        container: element, style: passStyle, interactive: false, attributionControl: false,
        localIdeographFontFamily: false, renderWorldCopies: false, fadeDuration: 0, maxPitch: 0,
        canvasContextAttributes: { alpha: true },
      });
      extras.push(layer);
      layer.on('error', () => failure.current());
      return layer;
    }

    try {
      const labels = createPass(target, initial.annotations.style);
      const foreground = initial.foreground && foregroundContainer.current
        ? createPass(foregroundContainer.current, initial.foreground)
        : undefined;
      if (foreground) installMarkers(foreground);

      const sync = () => {
        const annotations = currentScene.current.annotations;
        if (!annotations) return;
        target.style.clipPath = `path("${labelClipPath(annotations.polygons, point => map.project(point), annotations.padding)}")`;
        const center = map.getCenter(), zoom = map.getZoom();
        const bearing = map.getBearing(), pitch = map.getPitch(), padding = map.getPadding();
        for (const extra of extras) extra.jumpTo({ center, zoom, bearing, pitch, padding });
      };
      const resize = () => {
        for (const extra of extras) extra.resize();
        sync();
      };
      mountedPasses.current = { labels, labelStyle: initial.annotations.style, foreground, foregroundStyle: initial.foreground, sync };
      map.on('move', sync);
      map.on('resize', resize);
      resize();
      return () => {
        mountedPasses.current = null;
        map.off('move', sync);
        map.off('resize', resize);
        for (const extra of extras) extra.remove();
      };
    } catch {
      mountedPasses.current = null;
      for (const extra of extras) extra.remove();
      failure.current();
    }
  }, [hasClip, hasForeground]);

  useEffect(() => {
    const passes = mountedPasses.current;
    if (!passes || !scene.annotations) return;
    if (passes.labelStyle !== scene.annotations.style) {
      passes.labels.setStyle(scene.annotations.style, { diff: true });
      passes.labelStyle = scene.annotations.style;
    }
    if (passes.foreground && scene.foreground && passes.foregroundStyle !== scene.foreground) {
      passes.foreground.setStyle(scene.foreground, { diff: true });
      passes.foregroundStyle = scene.foreground;
    }
    passes.sync();
  }, [scene]);

  return <main className="map-workspace" aria-label="朝阳区地图编辑区">
    <div ref={container} className="map-canvas" aria-label="可平移缩放的地图" />
    {hasClip && <div ref={labelsContainer} className="map-canvas map-overlay-pass clipped-annotation-pass" aria-hidden="true" />}
    {hasForeground && <div ref={foregroundContainer} className="map-canvas map-overlay-pass" aria-hidden="true" />}
    <div className="map-heading">
      <ParkSearch entries={parks.searchable} onSelect={selectPark} />
      <div className="map-scope">
        <span><i className="scope-dot" />朝阳区全域</span>
        {example && <span className="sample-chip">示例图层</span>}
      </div>
    </div>
    {selectedPark && (popupAnchor && webgl
      ? createPortal(<ParkDetails record={selectedPark} onClose={() => setSelection(undefined)} />, popupContent)
      : <div className="park-unplaced"><ParkDetails record={selectedPark} onClose={() => setSelection(undefined)} /></div>)}
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
    {(!webgl || notice) && <div className="map-alert" role="status">
      {webgl ? notice : '当前浏览器无法使用 WebGL 2。请启用硬件加速后重试。'}
    </div>}
  </main>;
}
