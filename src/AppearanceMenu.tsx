import { Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Color, Toggle } from './controls';

export interface Appearance {
  color: string;
  mode: 'light' | 'dark' | 'auto';
  blur: number;
  transparent: boolean;
  transparency: number;
}

const preferenceKey = 'cy-map-appearance';
const maxBlur = 42;
const maxTransparency = 66;
const modes = [{ id: 'light', label: '浅色' }, { id: 'dark', label: '深色' }, { id: 'auto', label: '自动' }] as const;
const themes = [
  { name: '潮青', value: '#2c776d' },
  { name: '墨蓝', value: '#385d93' },
  { name: '松绿', value: '#4f754f' },
  { name: '深紫', value: '#69578f' },
  { name: '岩红', value: '#985e56' },
];

export function readAppearance(): Appearance {
  const defaults: Appearance = { color: themes[0].value, mode: 'auto', blur: 18, transparency: 45,
    transparent: !window.matchMedia('(prefers-reduced-transparency: reduce)').matches };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) ?? 'null');
    if (!saved) return defaults;
    return {
      color: typeof saved.color === 'string' && /^#[a-f\d]{6}$/i.test(saved.color) ? saved.color : defaults.color,
      mode: modes.find(mode => mode.id === saved.mode)?.id ?? defaults.mode,
      blur: Number.isFinite(saved.blur) ? Math.min(maxBlur, Math.max(0, Math.round(saved.blur))) : defaults.blur,
      transparent: typeof saved.transparent === 'boolean' ? saved.transparent : defaults.transparent,
      transparency: Number.isFinite(saved.transparency)
        ? Math.min(maxTransparency, Math.max(0, Math.round(saved.transparency))) : defaults.transparency,
    };
  } catch {
    return defaults;
  }
}

export function saveAppearance(value: Appearance) {
  try { localStorage.setItem(preferenceKey, JSON.stringify(value)); } catch { /* The controls also work without storage. */ }
}

export function AppearanceMenu({ appearance, onChange }: {
  appearance: Appearance; onChange: (appearance: Appearance) => void;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const update = (patch: Partial<Appearance>) => onChange({ ...appearance, ...patch });

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);

  return <div className="appearance-menu" ref={container} onKeyDown={event => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      button.current?.focus();
    }
  }}>
    <button ref={button} type="button" className="button dark-button appearance-toggle" aria-label="外观设置" title="外观设置"
      aria-expanded={open} aria-controls="appearance-panel" onClick={() => setOpen(value => !value)}><Settings2 size={18} /></button>
    {open && <section id="appearance-panel" className="appearance-panel" aria-label="外观设置">
      <h2>外观</h2>
      <div className="segmented" role="group" aria-label="界面明暗主题">
        {modes.map(({ id, label }) => <button type="button" key={id} aria-pressed={appearance.mode === id}
          onClick={() => update({ mode: id })}>{label}</button>)}
      </div>
      <Color label="主题色" value={appearance.color} onChange={color => update({ color })} />
      <div className="theme-swatches" role="group" aria-label="主题色预设">
        {themes.map(({ name, value }) => <button key={value} type="button" title={name} aria-label={name}
          aria-pressed={appearance.color === value} style={{ background: value }} onClick={() => update({ color: value })} />)}
      </div>
      <Toggle checked={appearance.transparent} onChange={transparent => update({ transparent })}>透明玻璃</Toggle>
      <label className="field blur-control">
        <span>透明度 <output>{appearance.transparency}%</output></span>
        <input type="range" aria-label="透明度" min={0} max={maxTransparency} step={1} value={appearance.transparency}
          disabled={!appearance.transparent} onChange={event => update({ transparency: event.currentTarget.valueAsNumber })} />
      </label>
      <label className="field blur-control">
        <span>高斯模糊 <output>{appearance.blur} px</output></span>
        <input type="range" aria-label="高斯模糊" min={0} max={maxBlur} step={1} value={appearance.blur}
          disabled={!appearance.transparent} onChange={event => update({ blur: event.currentTarget.valueAsNumber })} />
      </label>
    </section>}
  </div>;
}
