import type { DataLayer, Layout, MapMargins, OutputSpec } from './model';
import { A1, DEFAULT_LAYOUT, outputPixels } from './model';
import { Color, CornerSelect, Field, FontSelect, NumberInput, Section, Select, Toggle } from './controls';

export function LayoutPanel({ layout, layers, output, onLayout, onOutput }: {
  layout: Layout; layers: DataLayer[]; output: OutputSpec; onLayout: (value: Layout) => void; onOutput: (value: OutputSpec) => void;
}) {
  const patch = (change: Partial<Layout>) => onLayout({ ...layout, ...change });
  const layerList = layers.filter(layer => layer.kinds.point && layer.style.visible);
  return <>
    <Section title="画幅"><OutputControls value={output} onChange={onOutput} /></Section>
    <Section title="图名">
      <Toggle checked={layout.titleVisible} onChange={titleVisible => patch({ titleVisible })}>显示图名</Toggle>
      <Field label="图名文字"><input type="text" maxLength={130} value={layout.title}
        onChange={event => patch({ title: event.currentTarget.value })} /></Field>
      <Field label="副标题"><input type="text" maxLength={110} value={layout.titleSubtitle}
        onChange={event => patch({ titleSubtitle: event.currentTarget.value })} /></Field>
      <TitleTypography layout={layout} onChange={patch} />
      <Field label="位置"><CornerSelect value={layout.titlePosition} onChange={titlePosition => patch({ titlePosition, titleFrame: null })} /></Field>
      <Color label="图名框背景" value={layout.titleBackground} onChange={titleBackground => patch({ titleBackground })} />
    </Section>
    <Section title="图例">
      <Toggle checked={layout.legend} onChange={legend => patch({ legend })}>显示图例</Toggle>
      <Field label="呈现方式"><Select value={layout.legendMode}
        choices={[{ value: 'categories', label: '分类图例' }, { value: 'numbered', label: '图上编号和侧边名录' }]}
        onChange={legendMode => patch({ legendMode: legendMode as Layout['legendMode'] })} /></Field>
      <Field label="图例图层"><Select value={layerList.some(layer => layer.id === layout.legendLayer) ? layout.legendLayer : ''}
        choices={[{ value: '', label: '第一个可见的点图层' }, ...layerList.map(layer => ({ value: layer.id, label: layer.name }))]}
        onChange={legendLayer => patch({ legendLayer })} /></Field>
      <LegendHeadingTypography layout={layout} onChange={patch} />
      <div className="fields two">
        <Field label="位置"><CornerSelect value={layout.legendPosition} onChange={legendPosition => patch({ legendPosition, legendFrame: null })} /></Field>
        <Field label="分栏数"><NumberInput min={1} max={6} value={layout.legendColumns} onChange={value => patch({ legendColumns: Math.max(1, Math.min(6, Math.trunc(value))) })} /></Field>
      </div>
      <div className="fields two">
        <Field label="字体"><FontSelect value={layout.legendFont} onChange={legendFont => patch({ legendFont })} /></Field>
        <Field label="字号（pt）"><NumberInput value={layout.legendSize} min={6} max={60} onChange={legendSize => patch({ legendSize })} /></Field>
      </div>
      <Field label="符号大小（pt）"><NumberInput value={layout.legendSymbolSize} min={5} max={60} onChange={legendSymbolSize => patch({ legendSymbolSize })} /></Field>
      <div className="fields two">
        <Color label="图例文字" value={layout.legendColor} onChange={legendColor => patch({ legendColor })} />
        <Color label="图例背景" value={layout.legendBackground} onChange={legendBackground => patch({ legendBackground })} />
      </div>
    </Section>
    <Section title="地图框边距"><MapMarginControls value={layout.mapMargins} onChange={mapMargins => patch({ mapMargins })} /></Section>
    <Section title="指北针">
      <Toggle checked={layout.north} onChange={north => patch({ north })}>显示指北针</Toggle>
      <div className="fields two">
        <Field label="位置"><CornerSelect value={layout.northPosition} onChange={northPosition => patch({ northPosition })} /></Field>
        <Field label="大小（pt）"><NumberInput value={layout.northSize} min={14} max={100} onChange={northSize => patch({ northSize })} /></Field>
      </div>
      <Color label="纸面背景" value={layout.paperColor} onChange={paperColor => patch({ paperColor })} />
    </Section>
  </>;
}

type TypographyProps = { layout: Layout; onChange: (change: Partial<Layout>) => void };

export function TitleTypography({ layout, onChange }: TypographyProps) {
  return <div className="control-stack">
    <div className="fields two">
      <Field label="标题字体"><FontSelect value={layout.titleFont} onChange={titleFont => onChange({ titleFont })} /></Field>
      <Field label="主标题字号（pt）"><NumberInput value={layout.titleSize} min={8} max={125} onChange={titleSize => onChange({ titleSize })} /></Field>
    </div>
    <div className="fields two">
      <Field label="标题对齐"><Select value={layout.titleAlign}
        choices={[{ value: 'auto', label: '自动' }, { value: 'left', label: '左对齐' },
          { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }]}
        onChange={titleAlign => onChange({ titleAlign: titleAlign as Layout['titleAlign'] })} /></Field>
      <Color label="标题颜色" value={layout.titleColor} onChange={titleColor => onChange({ titleColor })} />
    </div>
    <div className="fields two">
      <Toggle checked={layout.titleShadow} onChange={titleShadow => onChange({ titleShadow })}>标题阴影</Toggle>
      <Toggle checked={layout.titleOutline} onChange={titleOutline => onChange({ titleOutline })}>标题描边</Toggle>
    </div>
  </div>;
}

export function LegendHeadingTypography({ layout, onChange }: TypographyProps) {
  return <div className="control-stack">
    <div className="fields two">
      <Field label="图例标题字体"><FontSelect value={layout.legendHeadingFont}
        onChange={legendHeadingFont => onChange({ legendHeadingFont })} /></Field>
      <Field label="图例标题字号（pt）"><NumberInput value={layout.legendHeadingSize} min={6} max={72}
        onChange={legendHeadingSize => onChange({ legendHeadingSize })} /></Field>
    </div>
    <Color label="图例标题颜色" value={layout.legendHeadingColor}
      onChange={legendHeadingColor => onChange({ legendHeadingColor })} />
  </div>;
}

const marginLabels = [['top', '上边距'], ['bottom', '下边距'], ['left', '左边距'], ['right', '右边距']] as const;

export function MapMarginControls({ value, onChange }: { value: MapMargins; onChange: (value: MapMargins) => void }) {
  return <div className="control-stack">
    <div className="fields two">
      {marginLabels.map(([side, label]) => <Field key={side} label={label + '（mm）'}>
        <input type="number" min={0} max={2500} step={0.5} placeholder="自动" value={value[side] ?? ''}
          onChange={event => {
            const raw = event.currentTarget.valueAsNumber;
            onChange({ ...value, [side]: Number.isFinite(raw) ? Math.min(2500, Math.max(0, raw)) : null });
          }} />
      </Field>)}
    </div>
    {Object.values(value).some(amount => amount !== null) &&
      <button type="button" className="text-button" onClick={() => onChange({ ...DEFAULT_LAYOUT.mapMargins })}>恢复自动边距</button>}
  </div>;
}

export function OutputControls({ value, onChange }: { value: OutputSpec; onChange: (value: OutputSpec) => void }) {
  const patch = (change: Partial<OutputSpec>) => onChange({ ...value, ...change });
  const size = outputPixels(value);
  const millimeters = value.dpi > 0 ? [size.width * 25.4 / value.dpi, size.height * 25.4 / value.dpi] : [0, 0];
  return <div className="control-stack">
    <div className="segmented">
      <button type="button" aria-pressed={value.mode === 'paper'} onClick={() => patch({ mode: 'paper', paperWidth: Math.round(millimeters[0]), paperHeight: Math.round(millimeters[1]) })}>印刷尺寸</button>
      <button type="button" aria-pressed={value.mode === 'pixels'} onClick={() => patch({ mode: 'pixels', ...size })}>像素宽高</button>
    </div>
    <div className="fields two">
      {value.mode === 'paper' ? <>
        <Field label="宽（毫米）"><NumberInput value={value.paperWidth} min={30} max={2500} onChange={paperWidth => patch({ paperWidth })} /></Field>
        <Field label="高（毫米）"><NumberInput value={value.paperHeight} min={30} max={2500} onChange={paperHeight => patch({ paperHeight })} /></Field>
      </> : <>
        <Field label="宽（像素）"><NumberInput value={value.width} min={240} max={16384} onChange={width => patch({ width })} /></Field>
        <Field label="高（像素）"><NumberInput value={value.height} min={240} max={16384} onChange={height => patch({ height })} /></Field>
      </>}
    </div>
    <div className="fields two">
      <Field label="DPI"><NumberInput value={value.dpi} min={36} max={1200} onChange={dpi => patch({ dpi })} /></Field>
      <Field label="格式"><Select value={value.type} choices={[{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }]}
        onChange={type => patch({ type: type as OutputSpec['type'] })} /></Field>
    </div>
    <div className="sheet-size">
      <span>{size.width} × {size.height} px</span>
      <span>{millimeters[0].toFixed(1)} × {millimeters[1].toFixed(1)} mm</span>
    </div>
    <div className="button-row">
      <button className="text-button" type="button" onClick={() => onChange({ ...A1, type: value.type })}>A1 竖版 · 300 DPI</button>
      <button className="text-button" type="button" onClick={() => patch({ mode: 'paper', paperWidth: 841, paperHeight: 1189, dpi: 240 })}>A0 竖版 · 240 DPI</button>
    </div>
  </div>;
}
