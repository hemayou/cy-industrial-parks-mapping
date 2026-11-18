import { Crosshair, Expand, LoaderCircle, Minus, PenLine, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AttributionControl, Map as GLMap, Marker, Popup, ScaleControl } from 'maplibre-gl';
import type { MapMouseEvent, StyleSpecification } from 'maplibre-gl';
import type { Bounds, DataLayer } from './model';
import { BEIJING_BOUNDS } from './model';
import { ParkDetails, ParkSearch } from './ParkBrowser';
import { PointLabelEditor } from './PointLabelEditor';
import type { EditablePoint } from './PointLabelEditor';
import { installMarkers } from './map/markers';
import { labelClipPath } from './map/labelClip';
import type { PlotScene } from './map/compose';
import { browseParkFeatures, parkLocation } from './map/parkFeatures';
import type { ParkFeature } from './map/parkFeatures';
import { measurePointLabels, paintPointLabels, placePointLabels, pointLabelId, preparePointLabelFonts, withinLabelRect } from './map/pointLabels';
import type { PlacedPointLabel, PointLabelMark } from './map/pointLabels';

interface Props {
  scene: PlotScene;
  bounds: Bounds;
  layers: DataLayer[];
  notice?: string;
  status: string;
  example: boolean;
  sidebarCollapsed: boolean;
  onPlaceLabel: (mark: PointLabelMark, offset: [number, number] | null) => void;
  onFailure: () => void;
}

interface Selection {
  source: string;
  index: number;
  anchor?: [number, number];
}

function mapInsets(map: GLMap) {
  const css = getComputedStyle(map.getContainer());
  return {
    left: Number.parseFloat(css.getPropertyValue('--map-inset-left')) || 0,
    top: Number.parseFloat(css.getPropertyValue('--map-controls-top')) || 0,
  };
}

function mapPadding(map: GLMap, margin: number) {
  const { left, top } = mapInsets(map);
  return { left: left + margin, right: margin, top: top + margin, bottom: margin };
}

function mapOffset(map: GLMap): [number, number] {
  const { left, top } = mapInsets(map);
  return [left / 2, top / 2];
}

export function MapCanvas({ scene, bounds, layers, notice, status, example, sidebarCollapsed, onPlaceLabel, onFailure }: Props) {
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
  const labelCanvas = useRef<HTMLCanvasElement>(null);
  const drawnPointLabels = useRef<PlacedPointLabel[]>([]);
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
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState('');
  const [labelEditing, setLabelEditing] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [editablePoints, setEditablePoints] = useState<EditablePoint[]>([]);
  const editing = useRef(labelEditing);
  editing.current = labelEditing;
  const locationMarker = useRef<Marker | null>(null);
  const locationRequest = useRef(0);

  function fit(map: GLMap, region: Bounds) {
    const element = map.getContainer();
    const margin = Math.round(Math.max(18, Math.min(70, Math.min(element.clientWidth, element.clientHeight) * 0.12)));
    map.fitBounds(region, { padding: mapPadding(map, margin), duration: 0, maxZoom: 16 });
  }

  function selectPark(record: ParkFeature) {
    const location = record.pending ? null : parkLocation(record.geometry);
    if (labelEditing) selectLabelFor(record);
    else setSelection({ source: record.source, index: record.index, anchor: location?.anchor });
    const map = liveMap.current;
    if (!map || !location) return;
    if (location.bounds) map.fitBounds(location.bounds, { padding: mapPadding(map, 58), maxZoom: 15.5, duration: 1050 });
    else map.flyTo({ center: location.anchor, zoom: Math.max(map.getZoom(), 15.5), offset: mapOffset(map), duration: 1050 });
  }

  function selectLabelFor(record: ParkFeature, clicked?: { x: number; y: number }) {
    const map = liveMap.current;
    const marks = currentScene.current.points.filter(mark => mark.label && mark.source === record.source && mark.index === record.index);
    if (clicked && map && marks.length > 1) {
      const distance = (mark: PointLabelMark) => {
        const point = map.project(mark.coordinate);
        return Math.hypot(point.x - clicked.x, point.y - clicked.y);
      };
      marks.sort((a, b) => distance(a) - distance(b));
    }
    setSelectedLabel(marks[0] ? pointLabelId(marks[0]) : '');
  }

  function locateUser() {
    const map = liveMap.current;
    if (!map) return;
    if (!window.isSecureContext || !navigator.geolocation) {
      setLocationNotice('请在支持定位的 HTTPS 页面打开地图。');
      return;
    }
    const request = ++locationRequest.current;
    setLocating(true);
    setLocationNotice('正在请求当前位置…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (liveMap.current !== map || locationRequest.current !== request) return;
      const { longitude, latitude } = coords;
      const point: [number, number] = [longitude, latitude];
      const [[west, south], [east, north]] = BEIJING_BOUNDS;
      if (longitude < west || longitude > east || latitude < south || latitude > north) map.setMaxBounds(null);
      if (!locationMarker.current) {
        const element = document.createElement('div');
        element.className = 'position-dot';
        element.setAttribute('role', 'img');
        element.setAttribute('aria-label', '当前位置');
        locationMarker.current = new Marker({ element }).setLngLat(point).addTo(map);
      } else {
        locationMarker.current.setLngLat(point);
      }
      setSelection(undefined);
      setLocating(false);
      setLocationNotice('');
      map.flyTo({ center: point, zoom: 14.5, offset: mapOffset(map), duration: 950 });
    }, error => {
      if (liveMap.current !== map || locationRequest.current !== request) return;
      setLocating(false);
      setLocationNotice(error.code === 1 ? '请在浏览器的站点权限中允许位置访问，再重试。'
        : error.code === 3 ? '定位超时，请重试。' : '暂时无法获取设备位置，请检查定位服务。');
    }, { enableHighAccuracy: true, maximumAge: 60_000, timeout: 12_000 });
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
      const text = drawnPointLabels.current.find(label => withinLabelRect({ x, y }, label.box));
      if (text) {
        const record = lookup.get(text.mark.source)?.[text.mark.index];
        if (record) return { record, anchor: text.mark.coordinate, labelId: pointLabelId(text.mark) };
      }
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
          if (record?.geometry.type === 'Point' || record?.geometry.type === 'MultiPoint') return { record };
          first ??= record;
        }
      }
      return first ? { record: first } : undefined;
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
      const hit = hitPark(event);
      if (editing.current) {
        if (!hit) setSelectedLabel('');
        else if (hit.labelId) setSelectedLabel(hit.labelId);
        else selectLabelFor(hit.record, event.point);
        return;
      }
      if (!hit) return setSelection(undefined);
      const { record } = hit;
      const anchor = hit.anchor ?? (record.geometry.type === 'Point' ? parkLocation(record.geometry)?.anchor : event.lngLat.toArray());
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
      locationMarker.current?.remove();
      locationMarker.current = null;
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

  const hasPointLabels = scene.points.some(mark => mark.label);
  useEffect(() => {
    const map = liveMap.current;
    const canvas = labelCanvas.current;
    const context = canvas?.getContext('2d');
    drawnPointLabels.current = [];
    if (!map || !canvas || !context) {
      if (labelEditing) setEditablePoints([]);
      return;
    }
    let measured = measurePointLabels(context, scene.points);
    let frame = 0;
    let active = true;

    const redraw = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const width = canvas.clientWidth, height = canvas.clientHeight;
        const scale = Math.min(window.devicePixelRatio || 1, 2);
        const pixelsWide = Math.round(width * scale), pixelsHigh = Math.round(height * scale);
        if (canvas.width !== pixelsWide) canvas.width = pixelsWide;
        if (canvas.height !== pixelsHigh) canvas.height = pixelsHigh;
        context.setTransform(scale, 0, 0, scale, 0, 0);
        context.clearRect(0, 0, width, height);
        const { left, top } = mapInsets(map);
        const view = { left: left + 4, top: top + 49, right: width - 4, bottom: height - 5 };
        drawnPointLabels.current = placePointLabels(measured, point => map.project(point), view);
        const labels = drawnPointLabels.current;
        paintPointLabels(context, labelEditing && selectedLabel ? labels.filter(item => pointLabelId(item.mark) !== selectedLabel) : labels);
        if (labelEditing) {
          const laidOut = new Map(labels.map(item => [pointLabelId(item.mark), item]));
          setEditablePoints(measured.flatMap(mark => {
            if (!mark.label) return [];
            const anchor = map.project(mark.coordinate);
            if (!withinLabelRect(anchor, view)) return [];
            const current = laidOut.get(pointLabelId(mark));
            return [{ mark, anchor, view, width: mark.label.width, height: mark.label.height,
              box: current?.box, manual: current?.manual }];
          }));
        }
      });
    };

    redraw();
    map.on('move', redraw);
    map.on('resize', redraw);
    void preparePointLabelFonts(scene.points).then(() => {
      if (!active) return;
      measured = measurePointLabels(context, scene.points);
      redraw();
    }).catch(() => {});
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      map.off('move', redraw);
      map.off('resize', redraw);
    };
  }, [scene.points, sidebarCollapsed, labelEditing, selectedLabel]);

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
    {hasPointLabels && <canvas ref={labelCanvas} className="map-canvas point-annotations" aria-hidden="true" />}
    <div className="map-heading">
      <ParkSearch entries={parks.searchable} onSelect={selectPark} />
      {example && <span className="sample-chip">示例图层</span>}
    </div>
    {selectedPark && (popupAnchor && webgl
      ? createPortal(<ParkDetails record={selectedPark} onClose={() => setSelection(undefined)} />, popupContent)
      : <div className="park-unplaced"><ParkDetails record={selectedPark} onClose={() => setSelection(undefined)} /></div>)}
    <div className="map-navigation">
      <button type="button" aria-label="定位当前位置" title="定位当前位置" aria-busy={locating}
        disabled={!webgl || locating} onClick={locateUser}>
        {locating ? <LoaderCircle size={18} className="spin" /> : <Crosshair size={18} />}
      </button>
      <button type="button" aria-label="返回朝阳区全域" title="返回朝阳区全域" onClick={() => {
        locationRequest.current++;
        setLocating(false);
        setLocationNotice('');
        const map = liveMap.current;
        if (map) {
          map.setMaxBounds(BEIJING_BOUNDS);
          fit(map, bounds);
        }
      }}><Expand size={18} /></button>
      <button type="button" aria-label="放大地图" title="放大地图" onClick={() => liveMap.current?.zoomIn()}><Plus size={19} /></button>
      <button type="button" aria-label="缩小地图" title="缩小地图" onClick={() => liveMap.current?.zoomOut()}><Minus size={19} /></button>
      <button type="button" aria-label={labelEditing ? '退出标注编辑' : '标注编辑'} title={labelEditing ? '退出标注编辑' : '标注编辑'}
        aria-pressed={labelEditing} disabled={!hasPointLabels} onClick={() => {
          setSelection(undefined);
          setSelectedLabel('');
          setLabelEditing(value => !value);
        }}><PenLine size={18} /></button>
    </div>
    {labelEditing && <PointLabelEditor points={editablePoints} selected={selectedLabel} onSelect={setSelectedLabel} onPlace={onPlaceLabel} />}
    {locationNotice && <div className="location-notice" role="status">{locationNotice}</div>}
    <div className="map-status">
      <span>{status}</span>
      <span className="map-coords">{mouse ?? 'WGS84'} <i /> 缩放 {zoom.toFixed(1)}</span>
    </div>
    {(!webgl || notice) && <div className="map-alert" role="status">
      {webgl ? notice : '当前浏览器无法使用 WebGL 2。请启用硬件加速后重试。'}
    </div>}
  </main>;
}
