import { Compass, Download, FileCog, FileUp, Layers3, Map as MapIcon, PanelTop, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import { BasemapPanel } from './BasemapPanel';
import { LayerPanel } from './LayerPanel';
import { LayoutPanel } from './LayoutPanel';
import { MapCanvas } from './MapCanvas';
import { ExportDialog, downloadBlob } from './ExportDialog';
import { Field, Select } from './controls';
import { A1, DEFAULT_BASEMAP, DEFAULT_BOUNDARY, DEFAULT_LAYOUT, DISTRICT_FALLBACK, defaultLayer, extent } from './model';
import type { BasemapStyle, BoundaryStyle, Collection, DataLayer, Layout, OutputSpec } from './model';
import { attributionText, EMPTY_STYLE, fetchBasemap, findBasemap, providerName, styleBasemap } from './map/basemap';
import type { CatalogStyle, ProviderKeys } from './map/basemap';
import { composeStyle } from './map/compose';
import { readGeoJson } from './data/importer';
import type { ImportOptions, ImportResult } from './data/importer';
import { readProject } from './project';
import type { ProjectFile, ProjectLayer } from './project';

type Tab = 'base' | 'layers' | 'layout';
const openedMap = findBasemap('open-light');
const defaultBoundaryPath = '/data/chaoyang-osm.geojson';
const boundaryLayerId = 'cy-district-style';
const emptyKeys: ProviderKeys = { esri: '', carto: '' };
const tabs = [{ id: 'base', label: '底图', icon: MapIcon }, { id: 'layers', label: '图层', icon: Layers3 }, { id: 'layout', label: '版式', icon: PanelTop }] as const;

async function assetGeoJson(path: string, label: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${label}读取失败。`);
  return readGeoJson(await response.text(), label).data;
}

async function configuredLayer(layer: ProjectLayer): Promise<DataLayer> {
  const url = new URL(layer.src!, window.location.origin);
  if (url.origin !== window.location.origin || !/\.(geojson|json)$/i.test(url.pathname)) {
    throw new Error('配置内的图层须为同站点的 GeoJSON 文件。');
  }
  const source = await assetGeoJson(url.pathname, layer.name);
  const where = layer.where;
  const features = where
    ? source.features.filter(feature => feature.properties?.[where.field] === where.equals)
    : source.features;
  if (!features.length) throw new Error(`${layer.name}缺少匹配的要素。`);
  return {
    ...defaultLayer({ ...source, features }, layer.name, layer.id || crypto.randomUUID(), layer.id.startsWith('demo-')),
    style: layer.style,
    asset: { src: url.pathname, where },
  };
}

async function initialLayers(): Promise<{ layers: DataLayer[]; managed: boolean }> {
  const response = await fetch('/workspace-data/project.json');
  if (response.status === 404 || (response.ok && response.headers.get('content-type')?.includes('text/html'))) {
    return { layers: await exampleLayers(), managed: false };
  }
  if (!response.ok) throw new Error('默认园区图层配置加载失败。');
  const config = readProject(await response.json());
  const managed = config.layers.filter(layer => layer.src);
  if (!managed.length || managed.some(layer => !layer.src!.startsWith('/workspace-data/'))) {
    throw new Error('默认园区图层配置缺少有效的加载路径。');
  }
  return { layers: await Promise.all(managed.map(configuredLayer)), managed: true };
}

async function exampleLayers() {
  const [points, areas] = await Promise.all([
    assetGeoJson('/data/example-parks.geojson', '示例园区'),
    assetGeoJson('/data/example-areas.geojson', '示例片区'),
  ]);
  const parks = defaultLayer(points, '示例园区', 'demo-parks', true);
  parks.style.labelField = '园区名称';
  parks.style.categoryField = '实施时序';
  parks.style.numberField = '编号';
  parks.style.categories = {
    实施项目: { color: '#a72f3f' }, 储备项目: { color: '#d57029' }, 谋划项目: { color: '#16735c' },
  };
  parks.style.categoryOrder = ['实施项目', '储备项目', '谋划项目'];
  return [parks, defaultLayer(areas, '示例片区', 'demo-areas', true)];
}

export function App() {
  const [tab, setTab] = useState<Tab>('base');
  const [selected, setSelected] = useState(openedMap);
  const [loaded, setLoaded] = useState<{ entry: CatalogStyle; raw: StyleSpecification }>({ entry: openedMap, raw: EMPTY_STYLE });
  const [manualKeys, setManualKeys] = useState<ProviderKeys>(emptyKeys);
  const [managedKeys, setManagedKeys] = useState<ProviderKeys>(emptyKeys);
  const keys = { esri: manualKeys.esri || managedKeys.esri, carto: manualKeys.carto || managedKeys.carto };
  const [load, setLoad] = useState<'loading' | 'ready' | 'failed' | 'key'>('loading');
  const [retry, setRetry] = useState(0);
  const [baseStyle, setBaseStyle] = useState<BasemapStyle>(structuredClone(DEFAULT_BASEMAP));
  const [boundaryStyle, setBoundaryStyle] = useState<BoundaryStyle>({ ...DEFAULT_BOUNDARY });
  const [boundary, setBoundary] = useState<Collection | null>(null);
  const [boundaryName, setBoundaryName] = useState('朝阳区开放参考区界 © OpenStreetMap');
  const [layers, setLayers] = useState<DataLayer[]>([]);
  const [managed, setManaged] = useState(false);
  const [activeId, setActiveId] = useState('demo-parks');
  const [layout, setLayout] = useState<Layout>({ ...DEFAULT_LAYOUT });
  const [output, setOutput] = useState<OutputSpec>({ ...A1 });
  const [modal, setModal] = useState(false);
  const [importMode, setImportMode] = useState<'layers' | 'boundary' | null>(null);
  const [importing, setImporting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [notices, setNotices] = useState('');
  const [options, setOptions] = useState<ImportOptions>({ crs: '', encoding: '' });
  const [tileFailed, setTileFailed] = useState(false);
  const fileField = useRef<HTMLInputElement>(null);
  const configField = useRef<HTMLInputElement>(null);
  const importDialog = useRef<HTMLDialogElement>(null);
  const worker = useRef<Worker | null>(null);
  const fileJob = useRef(0);
  const allowInitialLayers = useRef(true);

  useEffect(() => {
    assetGeoJson(defaultBoundaryPath, '朝阳区区界').then(data => {
      setBoundary(existing => existing ?? data);
    }).catch(error => setProblems(previous => [...previous, error.message]));

    initialLayers().then(initial => {
      setManaged(initial.managed);
      if (allowInitialLayers.current) setLayers(current => current.length ? current : initial.layers);
    }).catch(error => setProblems(previous => [...previous, error.message]));

    const controller = new AbortController();
    fetch('/_workspace/basemap-keys', {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).then(async response => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return;
      const values = await response.json();
      setManagedKeys({
        esri: typeof values?.esri === 'string' ? values.esri.trim() : '',
        carto: typeof values?.carto === 'string' ? values.carto.trim() : '',
      });
    }).catch(() => {});
    return () => {
      controller.abort();
      worker.current?.terminate();
    };
  }, []);

  const relevantKey = selected.provider === 'open' ? '' : keys[selected.provider];
  useEffect(() => {
    const cancellation = new AbortController();
    setTileFailed(false);
    if (selected.provider !== 'open' && !relevantKey) {
      setLoad('key');
      return () => cancellation.abort();
    }
    setLoad('loading');
    const timeout = window.setTimeout(() => {
      cancellation.abort();
      setLoad('failed');
      setProblems(['底图连接超时。请检查网络后重试。']);
    }, 17_000);
    fetchBasemap(selected, keys, cancellation.signal).then(raw => {
      if (!cancellation.signal.aborted) {
        setLoaded({ entry: selected, raw });
        setLoad('ready');
        setProblems([]);
      }
    }).catch(() => {
      if (!cancellation.signal.aborted) {
        setLoad('failed');
        setProblems([`${providerName[selected.provider]} 底图连接失败。请核对网络及密钥权限。`]);
      }
    }).finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      cancellation.abort();
    };
  }, [selected, relevantKey, retry]);

  useEffect(() => {
    if (importMode) importDialog.current?.showModal();
  }, [importMode]);

  const active = layers.find(layer => layer.id === activeId) ?? layers[0];
  const bounds = useMemo(() => boundary ? extent(boundary) ?? DISTRICT_FALLBACK : DISTRICT_FALLBACK, [boundary]);
  const example = layers.some(layer => layer.example && layer.style.visible);
  const adjustedBase = useMemo(() => styleBasemap(loaded.raw, loaded.entry, baseStyle), [loaded, baseStyle]);
  const style = useMemo(() => composeStyle({ base: adjustedBase, overlays: layers, boundary, boundaryStyle, layout }),
    [adjustedBase, layers, boundary, boundaryStyle, layout.legendLayer, layout.legendMode]);
  const attribution = useMemo(() => [
    ...attributionText(loaded.raw),
    ...(boundaryStyle.visible && boundary ? [boundaryName] : []),
    ...(example ? ['专题数据为示例'] : []),
  ], [loaded.raw, boundaryStyle.visible, boundary, boundaryName, example]);

  function chooseBasemap(entry: CatalogStyle) {
    if (selected.id === entry.id) return;
    setSelected(entry);
    const samePalette = selected.dark === entry.dark;
    setBaseStyle(value => ({
      ...value, layerVisibility: {}, layerDensity: {},
      text: samePalette ? value.text : {
        ...value.text,
        color: value.text.color === (selected.dark ? '#e2e8ec' : DEFAULT_BASEMAP.text.color)
          ? (entry.dark ? '#e2e8ec' : DEFAULT_BASEMAP.text.color) : value.text.color,
        halo: value.text.halo === (selected.dark ? '#151d29' : DEFAULT_BASEMAP.text.halo)
          ? (entry.dark ? '#151d29' : DEFAULT_BASEMAP.text.halo) : value.text.halo,
      },
    }));
  }

  function openImport(mode: 'layers' | 'boundary') {
    if (importing) return;
    setOptions({ crs: '', encoding: '' });
    setImportMode(mode);
    setProblems([]);
    setNotices('');
  }

  function importFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.currentTarget.files ?? []);
    if (!files.length || !importMode) return;
    const mode = importMode;
    event.currentTarget.value = '';
    setImporting(true);
    setImportMode(null);
    setProblems([]);
    const currentJob = ++fileJob.current;
    const currentWorker = new Worker(new URL('./data/import.worker.ts', import.meta.url), { type: 'module' });
    worker.current = currentWorker;
    const timeout = window.setTimeout(() => {
      dispose();
      setProblems(['读取超时。可缩小单次导入文件后重试。']);
    }, 60_000);
    function dispose() {
      window.clearTimeout(timeout);
      currentWorker.terminate();
      worker.current = null;
      setImporting(false);
    }
    currentWorker.onmessage = (response: MessageEvent<ImportResult>) => {
      if (fileJob.current !== currentJob) return;
      dispose();
      const { layers: imported, errors } = response.data;
      setProblems(errors);
      if (mode === 'boundary') {
        const matches = imported.map(item => ({
          ...item, data: {
            type: 'FeatureCollection' as const,
            features: item.data.features.filter(feature => feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon'),
          },
        })).filter(item => item.data.features.length);
        if (!matches.length) setProblems(previous => [...previous, '区界文件需包含朝阳区的面要素。']);
        else {
          setBoundary({ type: 'FeatureCollection', features: matches.flatMap(item => item.data.features) });
          setBoundaryName('行政区界由使用者提供');
          setBoundaryStyle(value => ({ ...value, visible: true }));
          setNotices('已替换朝阳区区界与成图范围。');
        }
        return;
      }
      if (imported.length) {
        allowInitialLayers.current = false;
        const additional = imported.map(item => defaultLayer(item.data, item.name));
        setLayers(value => [...value.filter(item => !item.example), ...additional]);
        setActiveId(additional[0].id);
        setTab('layers');
        const skipped = imported.reduce((count, item) => count + item.skipped, 0);
        setNotices(`已导入 ${imported.length} 个图层${skipped ? `，跳过 ${skipped} 个空几何` : ''}。`);
      }
    };
    currentWorker.onerror = () => {
      dispose();
      setProblems(['文件解析失败。请核对文件格式后重试。']);
    };
    currentWorker.postMessage({ files, options });
  }

  async function loadInitialLayers() {
    try {
      allowInitialLayers.current = true;
      const initial = await initialLayers();
      setManaged(initial.managed);
      setLayers(current => current.length ? current : initial.layers);
      setActiveId(initial.layers[0]?.id ?? '');
    } catch (error) {
      setProblems([error instanceof Error ? error.message : '默认图层加载失败。']);
    }
  }

  function saveProject() {
    const project: ProjectFile = {
      schemaVersion: 1, basemap: selected.id, basemapStyle: baseStyle, boundaryStyle, layout, output,
      layers: layers.map(({ id, name, style, example, asset }) => ({
        id, name, style, ...(asset ?? (example ? { src: id === 'demo-parks' ? '/data/example-parks.geojson' : '/data/example-areas.geojson' } : {})),
      })),
    };
    downloadBlob(new Blob([JSON.stringify(project, null, 2) + '\n'], { type: 'application/json' }), '出图配置.json');
    setSettingsOpen(false);
    setNotices('出图配置已保存。');
  }

  async function applyProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    setSettingsOpen(false);
    setProblems([]);
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('配置 JSON 最大为 3 MB。');
      const config = readProject(JSON.parse(await file.text()));
      const additions: DataLayer[] = [];
      const effects = new Map<string, DataLayer['style']>();
      const missing: string[] = [];
      for (const layer of config.layers) {
        const current = layers.find(item => item.id === layer.id) ?? layers.find(item => item.name === layer.name);
        if (current) {
          effects.set(current.id, layer.style);
        } else if (layer.src) {
          additions.push(await configuredLayer(layer));
        } else missing.push(layer.name);
      }
      allowInitialLayers.current = false;
      setSelected(findBasemap(config.basemap));
      setBaseStyle(config.basemapStyle);
      setBoundaryStyle(config.boundaryStyle);
      setLayout({
        ...config.layout,
        legendLayer: layers.find(layer => layer.name === config.layers.find(item => item.id === config.layout.legendLayer)?.name)?.id ?? config.layout.legendLayer,
      });
      setOutput(config.output);
      setLayers(current => [
        ...current.filter(layer => !layer.example || effects.has(layer.id)).map(layer => ({
          ...layer, style: effects.get(layer.id) ?? layer.style,
        })),
        ...additions,
      ]);
      if (missing.length) setProblems([`请先导入这些本地文件，再应用配置：${missing.join('、')}。`]);
      setNotices('已应用出图配置。');
    } catch (error) {
      setProblems([error instanceof Error ? error.message : '无法应用配置。']);
    }
  }

  const status = load === 'loading' ? '正在连接矢量底图'
    : load === 'key' ? `请填写 ${providerName[selected.provider]} API key`
    : load === 'failed' || tileFailed ? '底图连接待重试' : `${providerName[loaded.entry.provider]} · ${loaded.entry.name}`;

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand">
        <span className="brand-logo"><Compass size={23} strokeWidth={1.6} /></span>
        <div><h1>朝阳园产业园区地图</h1><div className="brand-area">北京市朝阳区</div></div>
      </div>
      <div className="head-actions">
        <button className="button secondary dark-button import-head" type="button" onClick={() => openImport('layers')} disabled={importing}><FileUp size={16} /> 导入数据</button>
        <div className="project-menu">
          <button className="button secondary dark-button" type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}><FileCog size={16} /> 配置</button>
          {settingsOpen && <div className="menu-panel"><button type="button" onClick={saveProject}>保存出图配置</button>
            <button type="button" onClick={() => configField.current?.click()}>应用出图配置</button></div>}
        </div>
        <button className="button primary export-head" type="button" onClick={() => setModal(true)}
          disabled={load !== 'ready' || tileFailed || !boundary}><Download size={17} /> 预览与导出</button>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar" aria-label="制图设置">
        <nav className="tabs" aria-label="制图设置页">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            <Icon size={17} strokeWidth={1.75} />{label}</button>)}
        </nav>
        <div className="panel">
          {tab === 'base' && <BasemapPanel current={selected} raw={loaded.raw} style={baseStyle} boundary={boundaryStyle}
            keys={keys} manualKeys={manualKeys} onKeys={value => {
              setManualKeys({ esri: value.esri.trim(), carto: value.carto.trim() });
              setRetry(index => index + 1);
            }} onSelect={chooseBasemap} onStyle={setBaseStyle} onBoundary={setBoundaryStyle}
            onRetry={() => setRetry(index => index + 1)} onImportBoundary={() => openImport('boundary')} />}
          {tab === 'layers' && <LayerPanel layers={layers} active={active} importing={importing} managed={managed}
            onImport={() => openImport('layers')} onRestore={() => void loadInitialLayers()} onSelect={setActiveId}
            boundary={boundaryStyle} boundaryActive={activeId === boundaryLayerId}
            onSelectBoundary={() => setActiveId(boundaryLayerId)} onBoundary={setBoundaryStyle}
            onReplaceBoundary={() => openImport('boundary')}
            onUpdate={value => setLayers(current => current.map(item => item.id === value.id ? value : item))}
            onRemove={id => { allowInitialLayers.current = false; setLayers(current => current.filter(layer => layer.id !== id)); }} />}
          {tab === 'layout' && <LayoutPanel layout={layout} layers={layers} output={output} onLayout={setLayout} onOutput={setOutput} />}
        </div>
      </aside>
      <MapCanvas style={style} bounds={bounds} blocked={load === 'failed' || tileFailed} status={status}
        example={example} onFailure={() => setTileFailed(true)} />
    </div>
    {(problems.length > 0 || notices) && <div className={`toast ${problems.length ? 'problem' : ''}`} role="status">
      <div>{problems.length ? problems.map((problem, index) => <p key={index}>{problem}</p>) : notices}</div>
      <button type="button" className="icon-button" aria-label="关闭提示" onClick={() => { setNotices(''); setProblems([]); }}><X size={17} /></button>
    </div>}
    {importMode && <dialog ref={importDialog} className="import-dialog" onCancel={() => setImportMode(null)}>
      <header className="dialog-header"><h2>{importMode === 'boundary' ? '替换朝阳区区界' : '导入本地矢量'}</h2>
        <button type="button" aria-label="关闭导入" className="icon-button" onClick={() => setImportMode(null)}><X size={20} /></button>
      </header>
      <div className="import-options">
        <p>支持 GeoJSON、GeoPackage 和 Shapefile。可选择 ZIP，或一次选中同名的 SHP、DBF、PRJ、CPG 等文件。</p>
        {importMode === 'boundary' && <p>请选择只含朝阳区的面数据，成图范围会按该区界重设。</p>}
        <Field label="源坐标系（可选）"><input placeholder="自动识别，或填写 EPSG 编号 / WKT" value={options.crs}
          onChange={event => setOptions(value => ({ ...value, crs: event.currentTarget.value }))} /></Field>
        <Field label="Shapefile 文字编码"><Select value={options.encoding} onChange={encoding => setOptions(value => ({ ...value, encoding }))}
          choices={[{ value: '', label: '自动识别' }, { value: 'utf-8', label: 'UTF-8' }, { value: 'gb18030', label: 'GB18030 / GBK' }]} /></Field>
        <button type="button" className="button primary" onClick={() => fileField.current?.click()}><FileUp size={16} /> 选择文件</button>
      </div>
    </dialog>}
    <input ref={fileField} type="file" aria-label="矢量文件" hidden multiple
      accept=".geojson,.json,.zip,.shp,.shx,.dbf,.prj,.cpg,.gpkg" onChange={importFiles} />
    <input ref={configField} type="file" aria-label="出图配置文件" hidden accept=".json" onChange={event => void applyProject(event)} />
    {modal && <ExportDialog job={{ style, bounds, layers, layout, output, attribution }} onOutput={setOutput} onLayout={setLayout} onClose={() => setModal(false)} />}
  </div>;
}
