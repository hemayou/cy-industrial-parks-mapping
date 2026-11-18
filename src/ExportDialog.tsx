import { Download, Image, LoaderCircle, Move, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { ExportJob } from './map/export';
import { renderSheet } from './map/export';
import type { FrameKind } from './map/sheet';
import type { Layout, NormalizedFrame, OutputSpec } from './model';
import { clampFrame } from './model';
import { OutputControls } from './LayoutPanel';
import { Field, NumberInput } from './controls';

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

interface Props {
  job: ExportJob;
  onOutput: (output: OutputSpec) => void;
  onLayout: (layout: Layout) => void;
  onClose: () => void;
}

interface FrameView { kind: FrameKind; frame: NormalizedFrame; url: string }
interface Preview { url: string; frames: FrameView[] }
interface Drag {
  kind: FrameKind; start: NormalizedFrame; current: NormalizedFrame;
  clientX: number; clientY: number; sheetWidth: number; sheetHeight: number;
  resize: boolean; changed: boolean;
}

export function ExportDialog({ job, onOutput, onLayout, onClose }: Props) {
  const element = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const urls = useRef<string[]>([]);
  const readyUrl = useRef<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const closed = useRef(false);
  const running = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [draftFrame, setDraftFrame] = useState<{ kind: FrameKind; frame: NormalizedFrame } | null>(null);
  const [busy, setBusy] = useState<'preview' | 'download' | ''>('preview');
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState<{ url: string; filename: string } | null>(null);
  const [lastPreview, setLastPreview] = useState({ output: job.output, layout: job.layout });
  const stale = lastPreview.output !== job.output || lastPreview.layout !== job.layout;
  const info = (change: Partial<Layout>) => onLayout({ ...job.layout, ...change });

  async function run(isPreview: boolean, currentJob = job) {
    if (running.current) return;
    running.current = true;
    setBusy(isPreview ? 'preview' : 'download');
    setMessage('');
    try {
      const result = await renderSheet(currentJob, isPreview);
      if (closed.current) return;
      if (isPreview) {
        urls.current.forEach(url => URL.revokeObjectURL(url));
        const nextPreview = {
          url: URL.createObjectURL(result.blob),
          frames: result.frames.map(({ kind, frame, blob }) => ({ kind, frame, url: URL.createObjectURL(blob) })),
        };
        urls.current = [nextPreview.url, ...nextPreview.frames.map(item => item.url)];
        setPreview(nextPreview);
        setDraftFrame(null);
        setLastPreview({ output: currentJob.output, layout: currentJob.layout });
      } else {
        const safe = (currentJob.layout.title || '朝阳区专题图').replace(/[\\/:*?"<>|]/g, ' ').trim();
        const suffix = currentJob.output.type === 'jpeg' ? 'jpg' : 'png';
        const filename = `${safe}_${result.width}x${result.height}.${suffix}`;
        if (readyUrl.current) URL.revokeObjectURL(readyUrl.current);
        readyUrl.current = URL.createObjectURL(result.blob);
        setReady({ url: readyUrl.current, filename });
        downloadBlob(result.blob, filename);
        setMessage(result.reduced ? '图片已导出。设备限制降低了地图区域的绘制分辨率，成图采用所选像素宽高。' : '图片已导出。');
      }
    } catch (error) {
      if (!closed.current) {
        setDraftFrame(null);
        setMessage(error instanceof Error ? error.message : '出图失败。请调整设置后重试。');
      }
    } finally {
      running.current = false;
      if (!closed.current) setBusy('');
    }
  }

  useEffect(() => {
    element.current?.showModal();
    void run(true);
    return () => {
      closed.current = true;
      urls.current.forEach(url => URL.revokeObjectURL(url));
      if (readyUrl.current) URL.revokeObjectURL(readyUrl.current);
    };
  }, []);

  function commitFrame(kind: FrameKind, frame: NormalizedFrame) {
    const key = kind === 'legend' ? 'legendFrame' : 'titleFrame';
    const layout = { ...job.layout, [key]: frame };
    onLayout(layout);
    void run(true, { ...job, layout });
  }

  function beginDrag(event: PointerEvent<HTMLButtonElement>, kind: FrameKind, frame: NormalizedFrame, resize: boolean) {
    if (busy || !stage.current || event.button !== 0) return;
    const rect = stage.current.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind, start: frame, current: frame, clientX: event.clientX, clientY: event.clientY,
      sheetWidth: rect.width, sheetHeight: rect.height, resize, changed: false,
    };
  }

  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const x = (event.clientX - drag.clientX) / drag.sheetWidth;
    const y = (event.clientY - drag.clientY) / drag.sheetHeight;
    if (!drag.changed && Math.abs(x) + Math.abs(y) < .004) return;
    drag.changed = true;
    drag.current = clampFrame(drag.resize
      ? { ...drag.start, width: Math.min(1 - drag.start.x, drag.start.width + x), height: Math.min(1 - drag.start.y, drag.start.height + y) }
      : { ...drag.start, x: drag.start.x + x, y: drag.start.y + y });
    setDraftFrame({ kind: drag.kind, frame: drag.current });
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.changed) commitFrame(drag.kind, drag.current);
  }

  function nudge(event: KeyboardEvent<HTMLButtonElement>, kind: FrameKind, frame: NormalizedFrame, resize: boolean) {
    const offset: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const change = offset[event.key];
    if (busy || !change) return;
    event.preventDefault();
    const step = event.shiftKey ? .03 : .008;
    const [dx, dy] = change;
    const adjusted = clampFrame(resize ? {
      ...frame, width: Math.min(1 - frame.x, frame.width + dx * step), height: Math.min(1 - frame.y, frame.height + dy * step),
    } : { ...frame, x: frame.x + dx * step, y: frame.y + dy * step });
    setDraftFrame({ kind, frame: adjusted });
    commitFrame(kind, adjusted);
  }

  function restoreFrames() {
    const layout = { ...job.layout, titleFrame: null, legendFrame: null };
    onLayout(layout);
    void run(true, { ...job, layout });
  }

  return <dialog ref={element} className="export-dialog" aria-label="预览与导出"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dialog-header"><h2>预览与导出</h2>
      <button type="button" className="icon-button" onClick={onClose} disabled={!!busy} aria-label="关闭预览"><X size={21} /></button>
    </header>
    <div className="export-grid">
      <div className="sheet-preview" aria-busy={busy === 'preview'}>
        {preview ? <div className="paper-stage" ref={stage}>
          <img className="sheet-background" src={preview.url} alt="朝阳区专题图成图预览" draggable={false} />
          {preview.frames.map(item => {
            const frame = draftFrame?.kind === item.kind ? draftFrame.frame : item.frame;
            const label = item.kind === 'title' ? '图名框' : '图例框';
            return <div key={item.kind} className={`paper-element element-${item.kind}`}
              style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.width * 100}%`, height: `${frame.height * 100}%` }}>
              <img src={item.url} alt="" draggable={false} />
              <button className="drag-element" type="button" aria-label={`移动${label}`} title={`拖动${label}`} disabled={!!busy}
                onPointerDown={event => beginDrag(event, item.kind, frame, false)} onPointerMove={moveDrag} onPointerUp={endDrag}
                onPointerCancel={() => { dragRef.current = null; setDraftFrame(null); }}
                onKeyDown={event => nudge(event, item.kind, frame, false)} />
              <button className="resize-element" type="button" aria-label={`调整${label}大小`} title={`拉伸${label}`} disabled={!!busy}
                onPointerDown={event => beginDrag(event, item.kind, frame, true)} onPointerMove={moveDrag} onPointerUp={endDrag}
                onPointerCancel={() => { dragRef.current = null; setDraftFrame(null); }}
                onKeyDown={event => nudge(event, item.kind, frame, true)} />
            </div>;
          })}
        </div> : <div className="empty-preview">
          {busy === 'preview' ? <LoaderCircle className="spin" /> : <Image />}
          <span>{busy === 'preview' ? '正在绘制预览' : '预览暂不可用'}</span>
        </div>}
        {stale && preview && busy !== 'preview' && <span className="preview-stale">设置已调整，请刷新预览</span>}
      </div>
      <aside className="export-panel">
        <OutputControls value={job.output} onChange={onOutput} />
        <details className="preview-tools" open>
          <summary><Move size={15} /> 图框与文字</summary>
          <p>拖动图名框或图例框，向外拉右下角可调整大小。</p>
          <Field label="主标题"><input value={job.layout.title} maxLength={130}
            onChange={event => info({ title: event.currentTarget.value })} /></Field>
          <Field label="副标题"><input value={job.layout.titleSubtitle} maxLength={110}
            onChange={event => info({ titleSubtitle: event.currentTarget.value })} /></Field>
          <Field label="主标题字号（pt）"><NumberInput value={job.layout.titleSize} min={8} max={125}
            onChange={titleSize => info({ titleSize })} /></Field>
          <div className="fields two">
            <Field label="图例文字（pt）"><NumberInput value={job.layout.legendSize} min={6} max={60}
              onChange={legendSize => info({ legendSize })} /></Field>
            <Field label="图例符号（pt）"><NumberInput value={job.layout.legendSymbolSize} min={5} max={60}
              onChange={legendSymbolSize => info({ legendSymbolSize })} /></Field>
          </div>
          <button className="text-button" type="button" onClick={restoreFrames} disabled={!!busy}>恢复自动版位</button>
        </details>
        <div className="button-stack">
          <button className="button secondary" onClick={() => void run(true)} disabled={!!busy} type="button"><RefreshCw size={16} /> 刷新预览</button>
          <button className="button primary download-button" onClick={() => void run(false)} disabled={!!busy} type="button">
            {busy === 'download' ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            {busy === 'download' ? '正在绘制原图' : `下载 ${job.output.type === 'jpeg' ? 'JPG' : 'PNG'}`}
          </button>
        </div>
        {ready && !busy && <a className="text-button" href={ready.url} download={ready.filename}>再次保存已生成图片</a>}
        <div role="status" className="export-message">{message || (busy === 'download' ? '大幅面成图需要一些时间。' : '')}</div>
      </aside>
    </div>
  </dialog>;
}
