import type { ReactNode } from 'react';
import type { Corner, FontFamily, LineStyle, TextStyle } from './model';

export function Section({ title, children, compact = false }: { title: string; children: ReactNode; compact?: boolean }) {
  return <section className={compact ? 'section compact' : 'section'}><h2>{title}</h2>{children}</section>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Select({ value, onChange, choices }: {
  value: string; onChange: (value: string) => void; choices: Array<{ value: string; label: string }>;
}) {
  return <select value={value} onChange={event => onChange(event.currentTarget.value)}>
    {choices.map(choice => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
  </select>;
}

export function NumberInput({ value, min = 0, max = 100, step = 1, onChange }: {
  value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void;
}) {
  return <input type="number" min={min} max={max} step={step} value={value || ''} onChange={event => {
    const next = event.currentTarget.valueAsNumber;
    onChange(Number.isFinite(next) ? next : 0);
  }} onBlur={() => {
    const next = Math.max(min, Math.min(max, value));
    if (next !== value) onChange(next);
  }} />;
}

export function Color({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return <label className="color-field" title={value}>
    <span>{label}</span>
    <span className="swatch"><input type="color" value={value} onChange={event => onChange(event.currentTarget.value)} /></span>
  </label>;
}

export function Toggle({ checked, onChange, children }: {
  checked: boolean; onChange: (checked: boolean) => void; children: ReactNode;
}) {
  return <label className="toggle">
    <span>{children}</span><input type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.currentTarget.checked)} />
  </label>;
}

export const fontChoices = [{ value: 'Noto Sans SC', label: '思源黑体' }, { value: 'Noto Serif SC', label: '思源宋体' }];
export const cornerChoices = [
  { value: 'tl', label: '左上' }, { value: 'tr', label: '右上' }, { value: 'bl', label: '左下' }, { value: 'br', label: '右下' },
];
export const lineChoices = [
  { value: 'solid', label: '实线' }, { value: 'dashed', label: '虚线' }, { value: 'dotted', label: '点线' },
];
export function FontSelect({ value, onChange }: { value: FontFamily; onChange: (value: FontFamily) => void }) {
  return <Select choices={fontChoices} value={value} onChange={value => onChange(value as FontFamily)} />;
}
export function CornerSelect({ value, onChange }: { value: Corner; onChange: (value: Corner) => void }) {
  return <Select choices={cornerChoices} value={value} onChange={value => onChange(value as Corner)} />;
}
export function LineSelect({ value, onChange }: { value: LineStyle; onChange: (value: LineStyle) => void }) {
  return <Select choices={lineChoices} value={value} onChange={value => onChange(value as LineStyle)} />;
}

export function TextControls({ value, onChange }: { value: TextStyle; onChange: (value: TextStyle) => void }) {
  const set = (patch: Partial<TextStyle>) => onChange({ ...value, ...patch });
  return <div className="control-stack">
    <div className="fields two">
      <Field label="字体"><FontSelect value={value.font} onChange={font => set({ font })} /></Field>
      <Field label="字号（pt）"><NumberInput value={value.size * .75} min={5.25} max={54} step={.25} onChange={pt => set({ size: pt * 4 / 3 })} /></Field>
    </div>
    <div className="fields two">
      <Color label="文字颜色" value={value.color} onChange={color => set({ color })} />
      <Color label="描边颜色" value={value.halo} onChange={halo => set({ halo })} />
    </div>
    <div className="fields two">
      <Field label="描边（像素）"><NumberInput value={value.haloWidth} min={0} max={6} step={0.1} onChange={haloWidth => set({ haloWidth })} /></Field>
      <div className="align-end"><Toggle checked={value.bold} onChange={bold => set({ bold })}>加粗</Toggle></div>
    </div>
  </div>;
}
