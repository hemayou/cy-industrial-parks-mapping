import { ArrowDown, ArrowUp, Eye, EyeOff, FileUp, Layers2, Trash2 } from 'lucide-react';
import type { DataLayer, PointStyle, Shape } from './model';
import { categoryRows } from './model';
import { Color, Field, LineSelect, NumberInput, Section, Select, TextControls } from './controls';

const shapes = [
  { value: 'circle', label: '圆形' }, { value: 'square', label: '方形' },
  { value: 'diamond', label: '菱形' }, { value: 'triangle', label: '三角形' },
];

function MarkerControls({ point, onChange }: { point: PointStyle; onChange: (value: Partial<PointStyle>) => void }) {
  return <div className="control-stack">
    <div className="fields two">
      <Field label="形状"><Select choices={shapes} value={point.shape}
        onChange={shape => onChange({ shape: shape as Shape })} /></Field>
      <Field label="大小（像素）"><NumberInput value={point.size} min={3} max={60} onChange={size => onChange({ size: Math.max(1, size) })} /></Field>
    </div>
    <div className="fields two">
      <Color label="填充颜色" value={point.color} onChange={color => onChange({ color })} />
      <Color label="描边颜色" value={point.stroke} onChange={stroke => onChange({ stroke })} />
    </div>
    <Field label="描边（像素）"><NumberInput value={point.strokeWidth} min={0} max={8} step={0.1}
      onChange={strokeWidth => onChange({ strokeWidth })} /></Field>
  </div>;
}

interface Props {
  layers: DataLayer[]; active: DataLayer | undefined; importing: boolean;
  onImport: () => void; onExample: () => void; onSelect: (id: string) => void;
  onUpdate: (layer: DataLayer) => void; onRemove: (id: string) => void;
}

export function LayerPanel({ layers, active, importing, onImport, onExample, onSelect, onUpdate, onRemove }: Props) {
  const change = (patch: Partial<DataLayer['style']>) => active && onUpdate({ ...active, style: { ...active.style, ...patch } });
  const fieldChoices = [{ value: '', label: '选择字段' }, ...active?.fields.map(field => ({ value: field, label: field })) ?? []];
  const rows = active?.kinds.point && active.style.categoryField ? categoryRows(active) : [];
  function move(key: string, offset: number) {
    const order = rows.map(row => row.key);
    const oldIndex = order.indexOf(key);
    const end = oldIndex + offset;
    if (end < 0 || end >= order.length) return;
    [order[oldIndex], order[end]] = [order[end], order[oldIndex]];
    change({ categoryOrder: order });
  }
  return <>
    <Section title="专题图层">
      <button className="import-tile" type="button" onClick={onImport} disabled={importing}>
        <span className="import-icon"><FileUp size={20} /></span>
        <span><strong>{importing ? '正在读取文件' : '导入本地矢量文件'}</strong><small>GeoJSON、Shapefile、GeoPackage</small></span>
      </button>
      {!layers.length && <button type="button" className="text-button" onClick={onExample}>载入示例图层</button>}
      <div className="dataset-list">
        {layers.map(layer =>
          <div key={layer.id} className={`dataset ${layer.id === active?.id ? 'active' : ''}`}>
            <button type="button" className="dataset-name" onClick={() => onSelect(layer.id)}>
              <Layers2 size={15} /><span><strong>{layer.name}</strong><small>{layer.data.features.length} 个要素</small></span>
            </button>
            <button type="button" className="icon-button" title={layer.style.visible ? '隐藏图层' : '显示图层'}
              aria-label={`${layer.style.visible ? '隐藏' : '显示'}${layer.name}`}
              onClick={() => onUpdate({ ...layer, style: { ...layer.style, visible: !layer.style.visible } })}>
              {layer.style.visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button type="button" className="icon-button" title="移除图层" aria-label={`移除${layer.name}`}
              onClick={() => onRemove(layer.id)}><Trash2 size={15} /></button>
          </div>)}
      </div>
    </Section>
    {active && <>
      <Section title="标注">
        <Field label="名称字段"><Select value={active.style.labelField} choices={fieldChoices} onChange={labelField => change({ labelField })} /></Field>
        {active.style.labelField && <TextControls value={active.style.text} onChange={text => change({ text })} />}
      </Section>
      {active.kinds.point && <Section title="点样式">
        <Field label="分类字段"><Select value={active.style.categoryField} choices={fieldChoices}
          onChange={categoryField => change({ categoryField, categories: {}, categoryOrder: [] })} /></Field>
        <Field label="编号字段"><Select value={active.style.numberField} choices={[{ value: '', label: '自动编号' }, ...fieldChoices.slice(1)]}
          onChange={numberField => change({ numberField })} /></Field>
        <MarkerControls point={active.style.point} onChange={patch => change({ point: { ...active.style.point, ...patch } })} />
        {!!rows.length && <div className="class-list">
          {rows.map((row, index) => <details key={row.key} className="category-detail">
            <summary>
              <span className={`marker-dot ${row.style.shape}`} style={{ background: row.style.color }} />
              <span>{row.key}</span><small>{row.count}</small>
            </summary>
            <div className="category-settings">
              <MarkerControls point={row.style} onChange={patch => change({
                categories: { ...active.style.categories, [row.key]: {
                  ...Object.getOwnPropertyDescriptor(active.style.categories, row.key)?.value, ...patch,
                }},
              })} />
              <div className="button-row">
                <button type="button" className="button quiet" disabled={index === 0}
                  onClick={() => move(row.key, -1)}><ArrowUp size={14} /> 上移</button>
                <button type="button" className="button quiet" disabled={index === rows.length - 1}
                  onClick={() => move(row.key, 1)}><ArrowDown size={14} /> 下移</button>
              </div>
            </div>
          </details>)}
        </div>}
      </Section>}
      {(active.kinds.area || active.kinds.line) && <Section title={active.kinds.area ? '区块与边线' : '线样式'}>
        {active.kinds.area && <Field label="填色字段（十六进制颜色）"><Select
          value={active.style.areaColorField}
          choices={[{ value: '', label: '统一填色' }, ...fieldChoices.slice(1)]}
          onChange={areaColorField => change({ areaColorField })} /></Field>}
        {active.kinds.area && <div className="fields two">
          <Color label="默认填色" value={active.style.area.color} onChange={color => change({ area: { ...active.style.area, color } })} />
          <Field label="不透明度（%）"><NumberInput value={Math.round(active.style.area.opacity * 100)}
            onChange={value => change({ area: { ...active.style.area, opacity: value / 100 } })} /></Field>
        </div>}
        <div className="fields two">
          <Color label="边线颜色" value={active.style.area.stroke} onChange={stroke => change({ area: { ...active.style.area, stroke } })} />
          <Field label="线宽"><NumberInput min={0.5} max={18} step={0.1} value={active.style.area.width}
            onChange={width => change({ area: { ...active.style.area, width } })} /></Field>
        </div>
        <Field label="线型"><LineSelect value={active.style.area.line}
          onChange={line => change({ area: { ...active.style.area, line } })} /></Field>
      </Section>}
    </>}
  </>;
}
