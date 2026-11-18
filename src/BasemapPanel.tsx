import { ChevronDown, KeyRound, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { StyleSpecification } from 'maplibre-gl';
import type { BasemapGroup, BasemapStyle, BoundaryStyle } from './model';
import { BASEMAPS, GROUPS, baseLayerGroup, groupLabelDensity, isBasemapLabel, labelLayerDensity, providerName } from './map/basemap';
import type { CatalogStyle, ProviderKeys } from './map/basemap';
import { BoundaryControls, Color, Field, Section, Select, TextControls, Toggle } from './controls';

interface Props {
  current: CatalogStyle; raw: StyleSpecification; style: BasemapStyle; boundary: BoundaryStyle;
  keys: ProviderKeys; manualKeys: ProviderKeys; onKeys: (keys: ProviderKeys) => void; onSelect: (entry: CatalogStyle) => void;
  onStyle: (style: BasemapStyle) => void; onBoundary: (style: BoundaryStyle) => void;
  onRetry: () => void; onImportBoundary: () => void;
}

function DensitySlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Field label={`${label} ${value}%`}>
    <input type="range" min={0} max={100} step={1} value={value} aria-label={`${label}密度`}
      onChange={event => onChange(event.currentTarget.valueAsNumber)}
      style={{ minHeight: 23, padding: 0, accentColor: '#2c7c73' }} />
  </Field>;
}

export function BasemapPanel(props: Props) {
  const { current, raw, style, boundary, keys, manualKeys, onKeys, onSelect, onStyle, onBoundary, onRetry } = props;
  const [draft, setDraft] = useState(manualKeys);
  const [credentials, setCredentials] = useState(false);
  const [advanced, setAdvanced] = useState<BasemapGroup>('roads');
  const groups = useMemo(() => {
    const byGroup = new Map<BasemapGroup, typeof raw.layers>();
    for (const layer of raw.layers) {
      if (layer.type === 'background' || (layer.type === 'symbol' && !isBasemapLabel(layer))) continue;
      const group = baseLayerGroup(layer);
      if (!byGroup.has(group)) byGroup.set(group, []);
      byGroup.get(group)!.push(layer);
    }
    return byGroup;
  }, [raw]);
  const patch = (change: Partial<BasemapStyle>) => onStyle({ ...style, ...change });
  const labelGroups = GROUPS.filter(group => groups.get(group.id)?.some(isBasemapLabel));
  const densityEdited = Object.keys(style.labelDensity ?? {}).length > 0 || Object.keys(style.layerDensity ?? {}).length > 0;
  function setLayerDensity(id: string, density: number) {
    const layerVisibility = { ...style.layerVisibility };
    if (density > 0 && layerVisibility[id] === false) delete layerVisibility[id];
    patch({ layerDensity: { ...style.layerDensity, [id]: density }, layerVisibility });
  }
  return <>
    <Section title="矢量底图">
      {(['esri', 'carto', 'open'] as const).map(provider =>
        <div key={provider} className="provider-row">
          <div className="provider-name">{providerName[provider]}</div>
          <div className="base-options">
            {BASEMAPS.filter(entry => entry.provider === provider).map(entry =>
              <button key={entry.id} type="button"
                className={'base-choice' + (current.id === entry.id ? ' selected' : '')}
                aria-pressed={current.id === entry.id} title={`${providerName[provider]} ${entry.theme}`}
                onClick={() => {
                  onSelect(entry);
                  if (provider !== 'open' && !keys[provider]) setCredentials(true);
                }}>
                <span aria-hidden className={`base-sample ${entry.dark ? 'dark' : ''} ${/streets|voyager/.test(entry.slug) ? 'rich' : ''}`}>
                  <i /><b /><em />
                </span>
                <span>{entry.name}</span>
              </button>
            )}
          </div>
        </div>
      )}
      <button onClick={() => setCredentials(!credentials)} className="text-button" aria-expanded={credentials} type="button">
        <KeyRound size={15} /> 底图凭据 <ChevronDown size={13} />
      </button>
      {credentials && <form className="credentials" onSubmit={event => { event.preventDefault(); onKeys(draft); }}>
        <Field label="Esri API key"><input type="password" value={draft.esri} autoComplete="off"
          placeholder={keys.esri ? '工作台已配置' : '输入 Esri API key'}
          onChange={event => setDraft({ ...draft, esri: event.currentTarget.value })} /></Field>
        <Field label="CARTO API key"><input type="password" value={draft.carto} autoComplete="off"
          placeholder={keys.carto ? '工作台已配置' : '输入 CARTO API key'}
          onChange={event => setDraft({ ...draft, carto: event.currentTarget.value })} /></Field>
        <div className="button-row"><button className="button secondary" type="submit">应用凭据</button>
          <button type="button" className="button quiet" onClick={onRetry}><RotateCcw size={14} /> 重试连接</button></div>
      </form>}
    </Section>
    <Section title="底图地名">
      <div className="stack small-gap">
        <Toggle checked={style.labels} onChange={labels => patch({ labels })}>中文地名</Toggle>
        <Toggle checked={style.minor} onChange={minor => patch({ minor })}>显示次要地名</Toggle>
        {labelGroups.length > 0 && <details className="details">
          <summary>分组注记密度</summary>
          <p>分组设为 0% 时隐藏整组。详细图层可设置单层密度。</p>
          <div className="fields two">
            {labelGroups.map(group => <DensitySlider key={group.id} label={group.label}
              value={groupLabelDensity(style, group.id)}
              onChange={value => patch({ labelDensity: { ...style.labelDensity, [group.id]: value } })} />)}
          </div>
          {densityEdited && <button type="button" className="text-button"
            onClick={() => patch({ labelDensity: {}, layerDensity: {} })}>恢复默认密度</button>}
        </details>}
        <TextControls value={style.text} onChange={text => patch({ text })} />
      </div>
    </Section>
    <Section title="底图图层">
      <div className="toggle-grid">
        {GROUPS.filter(group => groups.has(group.id)).map(group =>
          <Toggle key={group.id} checked={style.groups[group.id] !== false}
            onChange={enabled => patch({ groups: { ...style.groups, [group.id]: enabled } })}>{group.label}</Toggle>)}
      </div>
      <div className="fields two">
        <div><Color label="主要道路" value={style.roadColor || (current.dark ? '#777e87' : '#aab4ba')}
          onChange={roadColor => patch({ roadColor })} /></div>
        <div><Color label="其他道路" value={style.roadColorMinor || (current.dark ? '#50555f' : '#d5d9da')}
          onChange={roadColorMinor => patch({ roadColorMinor })} /></div>
      </div>
      {(style.roadColor || style.roadColorMinor) && <button type="button" className="text-button"
        onClick={() => patch({ roadColor: '', roadColorMinor: '' })}>恢复道路默认颜色</button>}
      <details className="details">
        <summary>详细图层</summary>
        <Field label="图层分组"><Select value={advanced} onChange={value => setAdvanced(value as BasemapGroup)}
          choices={GROUPS.map(group => ({ value: group.id, label: group.label }))} /></Field>
        {groups.get(advanced)?.some(isBasemapLabel) && <p>单层密度优先于分组的非零值。设为 0% 隐藏这层注记。</p>}
        <div className="layer-scroll">
          {(groups.get(advanced) ?? []).map(item => isBasemapLabel(item) ?
            <DensitySlider key={item.id} label={item.id} value={labelLayerDensity(item, style)}
              onChange={density => setLayerDensity(item.id, density)} /> :
            <Toggle key={item.id} checked={style.layerVisibility[item.id] ?? item.layout?.visibility !== 'none'}
              onChange={visible => patch({ layerVisibility: { ...style.layerVisibility, [item.id]: visible } })}>
              <span className="layer-id" title={item.id}>{item.id}</span>
            </Toggle>)}
        </div>
      </details>
    </Section>
    <BoundaryControls value={boundary} onChange={onBoundary} onReplace={props.onImportBoundary} />
  </>;
}
