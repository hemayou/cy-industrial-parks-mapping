import { ArrowDown, ArrowUp, Eye, EyeOff, FileUp, Layers2, Map as MapIcon, Trash2 } from 'lucide-react';
import type { BoundaryStyle, DataLayer, PointLabelPlacement, PointLabelStyle, PointStyle, Shape } from './model';
import { categoryRows } from './model';
import { BoundaryControls, Color, Field, LineSelect, NumberInput, Section, Select, TextControls } from './controls';
import { POINT_PALETTES, pointPalette } from './pointPalettes';

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

const pointPlacements: { value: PointLabelPlacement; label: string }[] = [
  { value: 'auto', label: '自动避让' },
  { value: 'n', label: '上方' }, { value: 'ne', label: '右上' }, { value: 'e', label: '右侧' }, { value: 'se', label: '右下' },
  { value: 's', label: '下方' }, { value: 'sw', label: '左下' }, { value: 'w', label: '左侧' }, { value: 'nw', label: '左上' },
];
const textAlignments = [{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }];
const lineOptions = Array.from({ length: 6 }, (_, index) => ({ value: String(index + 1), label: index ? `最多 ${index + 1} 行` : '单行' }));

function PointLabelControls({ value, onChange }: { value: PointLabelStyle; onChange: (next: PointLabelStyle) => void }) {
  const set = (patch: Partial<PointLabelStyle>) => onChange({ ...value, ...patch });
  return <div className="control-stack">
    <div className="fields two">
      <Field label="园区点名行数"><Select choices={lineOptions} value={String(value.maxLines)} onChange={rows => set({ maxLines: Number(rows) })} /></Field>
      <Field label="标注相对点位"><Select choices={pointPlacements} value={value.placement}
        onChange={placement => set({ placement: placement as PointLabelPlacement })} /></Field>
    </div>
    {value.maxLines > 1 && <div className="fields two">
      <Field label="多行对齐"><Select choices={textAlignments} value={value.align}
        onChange={align => set({ align: align as PointLabelStyle['align'] })} /></Field>
      <Field label="行距（倍）"><NumberInput value={value.lineHeight} min={.75} max={2.5} step={.05}
        onChange={lineHeight => set({ lineHeight })} /></Field>
    </div>}
  </div>;
}

interface Props {
  layers: DataLayer[]; active: DataLayer | undefined; importing: boolean; managed: boolean;
  boundary: BoundaryStyle; boundaryActive: boolean;
  onSelectBoundary: () => void; onBoundary: (value: BoundaryStyle) => void; onReplaceBoundary: () => void;
  onImport: () => void; onRestore: () => void; onSelect: (id: string) => void;
  onUpdate: (layer: DataLayer) => void; onRemove: (id: string) => void;
}

export function LayerPanel({
  layers, active, importing, managed, onImport, onRestore, onSelect, onUpdate, onRemove,
  boundary, boundaryActive, onSelectBoundary, onBoundary, onReplaceBoundary,
}: Props) {
  const change = (patch: Partial<DataLayer['style']>) => active && onUpdate({ ...active, style: { ...active.style, ...patch } });
  const fieldChoices = [{ value: '', label: '选择字段' }, ...active?.fields.map(field => ({ value: field, label: field })) ?? []];
  const rows = active?.kinds.point && active.style.categoryField ? categoryRows(active) : [];
  const hasCustomColors = active && Object.values(active.style.categories).some(category => category.color);

  function changePalette(id: string) {
    if (!active) return;
    const categories = Object.fromEntries(Object.entries(active.style.categories).map(([key, override]) => {
      const style = { ...override };
      delete style.color;
      return [key, style];
    }));
    change({ categoryPalette: pointPalette(id).id, categories });
  }

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
      {!layers.length && <button type="button" className="text-button" onClick={onRestore}>{managed ? '载入默认园区图层' : '载入示例图层'}</button>}
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
        <div className={`dataset ${boundaryActive ? 'active' : ''}`}>
          <button type="button" className="dataset-name" aria-pressed={boundaryActive} onClick={onSelectBoundary}>
            <MapIcon size={15} /><span><strong>朝阳区行政区界</strong><small>成图范围</small></span>
          </button>
          <button type="button" className="icon-button" title={boundary.visible ? '隐藏区界' : '显示区界'}
            aria-label={boundary.visible ? '隐藏朝阳区行政区界' : '显示朝阳区行政区界'}
            onClick={() => onBoundary({ ...boundary, visible: !boundary.visible })}>
            {boundary.visible ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>
      </div>
    </Section>
    {boundaryActive && <BoundaryControls value={boundary} onChange={onBoundary} onReplace={onReplaceBoundary} />}
    {active && !boundaryActive && <>
      <Section title="标注">
        <Field label="名称字段"><Select value={active.style.labelField} choices={fieldChoices} onChange={labelField => change({ labelField })} /></Field>
        {active.style.labelField && <TextControls value={active.style.text} onChange={text => change({ text })} />}
        {active.style.labelField && active.kinds.point && <PointLabelControls value={active.style.pointLabel}
          onChange={pointLabel => change({ pointLabel })} />}
      </Section>
      {active.kinds.point && <Section title="点样式">
        <Field label="分类字段"><Select value={active.style.categoryField} choices={fieldChoices}
          onChange={categoryField => change({ categoryField, categories: {}, categoryOrder: [] })} /></Field>
        <Field label="编号字段"><Select value={active.style.numberField} choices={[{ value: '', label: '自动编号' }, ...fieldChoices.slice(1)]}
          onChange={numberField => change({ numberField })} /></Field>
        <MarkerControls point={active.style.point} onChange={patch => change({ point: { ...active.style.point, ...patch } })} />
        {!!rows.length && <div className="point-palette">
          <Field label="分类色系">
            <select value={hasCustomColors ? '' : active.style.categoryPalette}
              onChange={event => changePalette(event.currentTarget.value)}>
              <option value="" disabled>自定义配色</option>
              {POINT_PALETTES.map(palette => <option key={palette.id} value={palette.id}>{palette.label}</option>)}
            </select>
          </Field>
          <div className="palette-colors" aria-hidden="true">
            {rows.slice(0, 12).map(row => <span key={row.key} style={{ background: row.style.color }} />)}
          </div>
        </div>}
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
