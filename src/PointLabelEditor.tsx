import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { pointLabelId } from './map/pointLabels';
import type { LabelRect, PointLabelMark } from './map/pointLabels';

type Pixel = { x: number; y: number };

export interface EditablePoint {
  mark: PointLabelMark;
  anchor: Pixel;
  width: number;
  height: number;
  box?: LabelRect;
  manual?: boolean;
  view: LabelRect;
}

interface Drag {
  id: string;
  pointer: Pixel;
  center: Pixel;
}

export function PointLabelEditor({ points, selected, onSelect, onPlace }: {
  points: EditablePoint[];
  selected: string;
  onSelect: (id: string) => void;
  onPlace: (mark: PointLabelMark, offset: [number, number] | null) => void;
}) {
  const [draft, setDraft] = useState<{ id: string; center: Pixel }>();
  const drag = useRef<Drag | null>(null);
  const active = points.find(item => pointLabelId(item.mark) === selected);
  const unplaced = points.filter(item => !item.box);
  const placed = points.filter(item => item.box);
  const label = active?.mark.label;
  const center = active && (draft?.id === selected ? draft.center : centerFor(active));
  const labelName = label?.lines.join(' ') ?? '';
  const option = ({ mark }: EditablePoint) => <option key={pointLabelId(mark)} value={pointLabelId(mark)}>
    {mark.label?.lines.join(' ')}
  </option>;

  function move(event: PointerEvent<HTMLButtonElement>, done = false) {
    const current = drag.current;
    if (!active || !current || current.id !== selected) return;
    const dx = event.clientX - current.pointer.x, dy = event.clientY - current.pointer.y;
    const next = { x: current.center.x + dx, y: current.center.y + dy };
    if (!done) {
      setDraft({ id: selected, center: next });
      return;
    }
    drag.current = null;
    setDraft(undefined);
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      onPlace(active.mark, [Math.round(next.x - active.anchor.x), Math.round(next.y - active.anchor.y)]);
    }
  }

  return <>
    <section className="label-editor-panel" aria-label="标注编辑">
      <h2>标注编辑</h2>
      {points.length ? <>
        <label className="field">
          <span>选择标注</span>
          <select value={active ? selected : ''} onChange={event => onSelect(event.currentTarget.value)}>
            <option value="">点选要素或选择名称</option>
            {!!unplaced.length && <optgroup label={`尚未显示（${unplaced.length}）`}>{unplaced.map(option)}</optgroup>}
            {!!placed.length && <optgroup label="已显示">{placed.map(option)}</optgroup>}
          </select>
        </label>
        <p>{active?.mark.offset && !active.manual ? '当前手动位置有冲突，请把文字拖到空位。'
          : active ? '拖动文字，或用方向键微调。' : '选择点位或文字后，可拖动标注。'}</p>
        {active?.mark.offset && <button type="button" className="text-button" onClick={() => onPlace(active.mark, null)}>恢复此标注的自动位置</button>}
      </> : <p>当前视野内没有可编辑的点位标注。</p>}
    </section>
    {active && center && label && <>
      <div className="label-edit-guide" aria-hidden="true" style={guideStyle(active, center)} />
      <button type="button" className="label-edit-handle" aria-label={`移动标注 ${labelName}`}
        style={{ left: center.x, top: center.y, width: active.width, minHeight: active.height,
          fontFamily: label.style.font, fontSize: label.style.size, lineHeight: label.layout.lineHeight,
          textAlign: label.layout.align, fontWeight: label.style.bold ? 700 : 400 }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: selected, pointer: { x: event.clientX, y: event.clientY }, center };
        }}
        onPointerMove={event => move(event)}
        onPointerUp={event => move(event, true)}
        onPointerCancel={() => { drag.current = null; setDraft(undefined); }}
        onKeyDown={event => {
          const delta: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
          };
          const direction = delta[event.key];
          if (!direction) return;
          event.preventDefault();
          const step = event.shiftKey ? 8 : 2;
          onPlace(active.mark, [center.x - active.anchor.x + direction[0] * step,
            center.y - active.anchor.y + direction[1] * step]);
        }}>{label.lines.join('\n')}</button>
    </>}
  </>;
}

function centerFor({ mark, anchor, width, height, box, view }: EditablePoint): Pixel {
  const desired = mark.offset ? { x: anchor.x + mark.offset[0], y: anchor.y + mark.offset[1] }
    : box ? { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
      : { x: anchor.x + mark.radius + 15 + width / 2, y: anchor.y - height / 2 - 8 };
  const halfWidth = Math.min(width / 2, (view.right - view.left) / 2);
  const halfHeight = Math.min(height / 2, (view.bottom - view.top) / 2);
  return {
    x: Math.min(view.right - halfWidth, Math.max(view.left + halfWidth, desired.x)),
    y: Math.min(view.bottom - halfHeight, Math.max(view.top + halfHeight, desired.y)),
  };
}

function guideStyle({ anchor, mark }: EditablePoint, center: Pixel) {
  const dx = center.x - anchor.x, dy = center.y - anchor.y;
  const distance = Math.hypot(dx, dy);
  const edge = Math.min(mark.radius / (distance || 1), 1);
  return { left: anchor.x + dx * edge, top: anchor.y + dy * edge,
    width: distance * (1 - edge), transform: `rotate(${Math.atan2(dy, dx)}rad)` };
}
