import { Search, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { searchParkFeatures } from './map/parkFeatures';
import type { ParkFeature, SearchEntry } from './map/parkFeatures';

const optionLimit = 12;

export function ParkSearch({ entries, onSelect }: { entries: SearchEntry[]; onSelect: (record: ParkFeature) => void }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const focusedOption = useRef<HTMLLIElement>(null);
  const matches = useMemo(() => searchParkFeatures(entries, query), [entries, query]);
  const options = matches.slice(0, optionLimit);
  const expanded = open && query.trim().length > 0;
  const highlighted = active >= 0 && active < options.length ? active : -1;

  useEffect(() => {
    if (expanded) focusedOption.current?.scrollIntoView({ block: 'nearest' });
  }, [expanded, highlighted]);

  function choose(record: ParkFeature) {
    setQuery(record.name);
    setOpen(false);
    setActive(-1);
    onSelect(record);
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Enter' && expanded && options.length) {
      event.preventDefault();
      choose(options[Math.max(highlighted, 0)].record);
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const from = highlighted === -1 && step < 0 ? 0 : highlighted;
      setActive((from + step + options.length) % options.length);
      setOpen(true);
    }
  }

  return <div className="park-search" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <div className="park-search-field">
      <Search size={17} aria-hidden="true" />
      <input ref={input} type="text" role="combobox" aria-label="搜索园区" placeholder="搜索园区、地址或产业"
        autoComplete="off" value={query} aria-expanded={expanded} aria-autocomplete="list"
        aria-controls={expanded && options.length ? listId : undefined}
        aria-activedescendant={expanded && highlighted >= 0 ? `${listId}-${highlighted}` : undefined}
        onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={navigate}
        onChange={event => { setQuery(event.currentTarget.value); setActive(-1); setOpen(true); }} />
      {query && <button type="button" className="icon-button" aria-label="清空园区搜索" onClick={() => {
        setQuery(''); setActive(-1); input.current?.focus();
      }}><X size={15} /></button>}
    </div>
    {expanded && <div className="park-search-results">
      {options.length ? <ul role="listbox" id={listId} aria-label="园区搜索候选">
        {options.map(({ record, summary }, index) => <li key={`${record.source}:${record.index}`} id={`${listId}-${index}`}
          role="option" aria-selected={index === highlighted} ref={index === highlighted ? focusedOption : undefined}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(record)}>
          <strong>{record.name}</strong>
          <small>{summary}{record.pending && <span className="park-pending"> · 位置待核</span>}</small>
        </li>)}
      </ul> : <p role="status">未找到匹配的园区</p>}
      {matches.length > optionLimit && <p className="park-search-count">共 {matches.length} 项，可继续输入缩小范围</p>}
    </div>}
  </div>;
}

export function ParkDetails({ record, onClose }: { record: ParkFeature; onClose: () => void }) {
  return <section className="park-details" aria-label="园区详情" onKeyDown={event => {
    if (event.key === 'Escape') onClose();
  }}>
    <div className="park-details-head">
      <div><p>{record.layerName}</p><h2>{record.name}</h2></div>
      <button type="button" className="icon-button" aria-label="关闭园区详情" onClick={onClose}><X size={17} /></button>
    </div>
    {record.pending && <p className="park-pending park-location-note">位置待核，当前仅有区县级参考位置。</p>}
    {record.details.length > 0 && <dl>
      {record.details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>}
  </section>;
}
