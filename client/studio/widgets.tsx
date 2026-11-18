import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ComponentChildren; wide?: boolean }) {
  return (
    <label class={`field ${wide ? 'wide' : ''}`}>
      <span class="field-label">{label}{hint && <small title={hint}> ⓘ</small>}</span>
      {children}
    </label>
  );
}

const val = (e: Event) => (e.target as HTMLInputElement).value;

export function Text({ value, set, placeholder, area, mono }: { value?: string; set: (v: string) => void; placeholder?: string; area?: boolean; mono?: boolean }) {
  return area
    ? <textarea class={mono ? 'mono' : ''} value={value ?? ''} placeholder={placeholder} onInput={e => set(val(e))} spellcheck={!mono} rows={mono ? 14 : 3}
        onKeyDown={e => { if (mono && e.key === 'Tab') { e.preventDefault(); const t = e.currentTarget; const i = t.selectionStart; t.setRangeText('  ', i, t.selectionEnd, 'end'); set(t.value); } }} />
    : <input value={value ?? ''} placeholder={placeholder} onInput={e => set(val(e))} />;
}

export function Num({ value, set, min, max, step = 1, placeholder }: { value?: number; set: (v: number | undefined) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  return <input type="number" value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder}
    onInput={e => { const v = val(e); set(v === '' ? undefined : Number(v)); }} />;
}

export function Range({ value, set, min, max, step, fmt }: { value?: number; set: (v: number | undefined) => void; min: number; max: number; step: number; fmt?: (v: number) => string }) {
  const v = value ?? min;
  return (
    <span class="range">
      <input type="range" value={v} min={min} max={max} step={step} onInput={e => { const n = Number(val(e)); set(n === min ? undefined : n); }} />
      <small>{fmt ? fmt(v) : v}</small>
    </span>
  );
}

export function Check({ value, set, label }: { value?: boolean; set: (v: boolean) => void; label: string }) {
  return <label class="check"><input type="checkbox" checked={!!value} onChange={e => set((e.target as HTMLInputElement).checked)} /> {label}</label>;
}

export function Select<T extends string>({ value, set, options }: { value?: T; set: (v: T) => void; options: [T, string][] }) {
  return <select value={value} onChange={e => set((e.target as HTMLSelectElement).value as T)}>{options.map(([v, l]) => <option value={v}>{l}</option>)}</select>;
}

/** Chip list input: Enter or comma adds, × removes. */
export function Chips({ value = [], set, placeholder, suggest }: { value?: string[]; set: (v: string[]) => void; placeholder?: string; suggest?: string[] }) {
  const [draft, setDraft] = useState('');
  const id = `dl-${placeholder?.length ?? 0}-${suggest?.length ?? 0}`;
  const add = (raw: string) => {
    const items = raw.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).filter(s => !value.includes(s));
    if (items.length) set([...value, ...items]);
    setDraft('');
  };
  return (
    <div class="chips">
      {value.map(v => <span class="chip" key={v}>{v}<button onClick={() => set(value.filter(x => x !== v))}>×</button></span>)}
      <input value={draft} placeholder={placeholder} list={suggest ? id : undefined}
        onInput={e => { const v = val(e); if (/[,;]/.test(v)) add(v); else setDraft(v); }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } else if (e.key === 'Backspace' && !draft && value.length) set(value.slice(0, -1)); }}
        onBlur={() => draft && add(draft)} />
      {suggest && <datalist id={id}>{suggest.filter(s => !value.includes(s)).map(s => <option value={s} />)}</datalist>}
    </div>
  );
}

/** Drop zone + file picker. */
export function Drop({ onFiles, accept, multiple, children }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; children: ComponentChildren }) {
  const [over, setOver] = useState(false);
  return (
    <label class={`drop ${over ? 'over' : ''}`}
      onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); onFiles([...(e.dataTransfer?.files ?? [])]); }}>
      <input type="file" accept={accept} multiple={multiple} onChange={e => { const t = e.target as HTMLInputElement; onFiles([...(t.files ?? [])]); t.value = ''; }} />
      {children}
    </label>
  );
}
