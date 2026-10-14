'use client';
import { useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUp, ArrowDown, GripVertical, Check, CircleAlert, RotateCcw, X, Lock } from 'lucide-react';
import type { Settings } from '@/lib/settings.mjs';
import type { Preferences } from '@/lib/dashboard';
import type { SettingField, SettingsSection } from '@/app/tabs/types';
import { Dictate } from '@/components/home/mic';

export type PageRow = { id: Settings['pages']['order'][number]; title: string; icon: ReactNode; section: SettingsSection | null };
type Status = { kind: 'idle' | 'saving' | 'saved' | 'error'; msg?: string };

const get = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);
const patchFor = (path: string, value: unknown) => path.split('.').reduceRight<unknown>((acc, k) => ({ [k]: acc }), value) as Record<string, unknown>;
const setIn = <T,>(o: T, path: string, value: unknown): T => {
  const out = structuredClone(o) as Record<string, unknown>;
  const ks = path.split('.'); let cur = out;
  ks.slice(0, -1).forEach((k) => { cur = cur[k] as Record<string, unknown>; });
  cur[ks.at(-1)!] = value;
  return out as T;
};

export default function SettingsView({ settings: initial, defaults, prefs: initialPrefs, pages, global, markdown, error }: {
  settings: Settings; defaults: Settings; prefs: Preferences; pages: PageRow[]; global: SettingsSection; markdown: SettingsSection; error: string | null;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const byId = Object.fromEntries(pages.map((p) => [p.id, p]));

  async function put(patch: Record<string, unknown>, refresh = true) {
    setStatus({ kind: 'saving' });
    try {
      const r = await fetch('/api/settings', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save');
      setS(j.settings);
      setStatus({ kind: 'saved' });
      if (refresh) router.refresh();
    } catch (e) { setStatus({ kind: 'error', msg: (e as Error).message }); }
  }
  async function putPrefs(next: Preferences) {
    setStatus({ kind: 'saving' });
    try {
      const r = await fetch('/api/preferences', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save');
      setStatus({ kind: 'saved' });
    } catch (e) { setStatus({ kind: 'error', msg: (e as Error).message }); }
  }
  function change(f: SettingField, value: unknown, debounce = 0) {
    if (f.store === 'preferences') {
      const next = { ...prefs, [f.key]: value } as Preferences;
      setPrefs(next);
      clearTimeout(timers.current[f.key]);
      timers.current[f.key] = setTimeout(() => putPrefs(next), debounce || 500);
      return;
    }
    setS((cur) => setIn(cur, f.key, value));
    clearTimeout(timers.current[f.key]);
    const go = () => put(patchFor(f.key, value), ['theme', 'webFonts'].includes(f.key) || f.key.startsWith('pages'));
    if (debounce) timers.current[f.key] = setTimeout(go, debounce); else go();
  }
  async function reset(section?: string) {
    setStatus({ kind: 'saving' });
    const r = await fetch(`/api/settings${section ? `?section=${section}` : ''}`, { method: 'DELETE' });
    const j = await r.json();
    if (r.ok) { setS(j.settings); setStatus({ kind: 'saved', msg: 'Reset to defaults' }); router.refresh(); } else setStatus({ kind: 'error', msg: j.error });
  }

  /* ---- Pages ---- */
  const order = s.pages.order;
  const hidden = new Set(s.pages.hidden);
  const visibleCount = order.filter((id) => !hidden.has(id)).length;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order]; const [x] = next.splice(from, 1); next.splice(to, 0, x);
    setS((c) => ({ ...c, pages: { ...c.pages, order: next } }));
    put({ pages: { order: next } });
  };
  const toggle = (id: PageRow['id']) => {
    if (id === 'today') return;
    const next = hidden.has(id) ? s.pages.hidden.filter((x) => x !== id) : [...s.pages.hidden, id];
    setS((c) => ({ ...c, pages: { ...c.pages, hidden: next } }));
    put({ pages: { hidden: next } });
  };
  const drag = useRef<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [lifted, setLifted] = useState<number | null>(null);

  const sections: { id: string; title: string; icon?: ReactNode; sec: SettingsSection; resetKey?: string }[] = [
    { id: 'appearance', title: global.title!, sec: global },
    ...order.map((id) => byId[id]).filter((p) => p?.section).map((p) => ({ id: p.id, title: p.title, icon: p.icon, sec: p.section!, resetKey: p.id === 'projects' ? 'todos' : p.id })),
    { id: 'notes', title: markdown.title!, sec: markdown, resetKey: 'markdown' },
  ];

  return (
    <main className="hd-page st">
      <header className="hd-top st-top">
        <h1>Settings</h1>
        <span className="hd-spacer" />
        <span className={`st-status ${status.kind}`} role="status" aria-live="polite">
          {status.kind === 'saving' ? 'Saving' : status.kind === 'saved' ? <><Check aria-hidden className="hd-i" />{status.msg || 'Saved'}</> : status.kind === 'error' ? <><CircleAlert aria-hidden className="hd-i" />{status.msg}</> : 'Changes save automatically'}
        </span>
      </header>
      {error ? <p className="warnl"><CircleAlert aria-hidden />{error}</p> : null}
      <div className="st-grid">
        <nav className="st-toc" aria-label="Settings sections">
          <a href="#st-pages">Pages</a>
          {sections.map((x) => <a key={x.id} href={`#st-${x.id}`}>{x.title}</a>)}
        </nav>
        <div className="st-body">
          <section id="st-pages" className="hd-panel st-sec" aria-labelledby="st-pages-h">
            <div className="st-head">
              <div><h2 id="st-pages-h">Pages</h2><p>Show, hide and reorder tabs. The order drives the rail, the phone bar (first four), ⌘1–9 and ⌥↑/⌥↓.</p></div>
              <button className="hd-btn ghost small" onClick={() => reset('pages')}><RotateCcw aria-hidden className="hd-i" />Reset</button>
            </div>
            <ol className="st-pages">
              {order.map((id, i) => {
                const p = byId[id]; const on = !hidden.has(id); const locked = id === 'today';
                return (
                  <li key={id} className={`${on ? '' : 'off'} ${over === i ? 'over' : ''} ${lifted === i ? 'lifted' : ''}`}
                    draggable onDragStart={(e) => { drag.current = i; setLifted(i); e.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDragLeave={() => setOver((o) => (o === i ? null : o))}
                    onDrop={(e) => { e.preventDefault(); if (drag.current !== null) move(drag.current, i); drag.current = null; setOver(null); setLifted(null); }}
                    onDragEnd={() => { drag.current = null; setOver(null); setLifted(null); }}>
                    <span className="grip" aria-hidden><GripVertical /></span>
                    <span className="ic">{p.icon}</span>
                    <span className="nm">{p.title}{i < 4 && on ? <small>Phone bar</small> : null}</span>
                    <span className="mv">
                      <button className="hd-iconbtn" aria-label={`Move ${p.title} up`} disabled={i === 0} onClick={() => move(i, i - 1)}><ArrowUp aria-hidden /></button>
                      <button className="hd-iconbtn" aria-label={`Move ${p.title} down`} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}><ArrowDown aria-hidden /></button>
                    </span>
                    {locked ? <span className="lock" title="Today always stays visible"><Lock aria-hidden />Always on</span> : (
                      <Switch checked={on} label={`Show ${p.title}`} disabled={on && visibleCount <= 1} onChange={() => toggle(id)} />
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {sections.map((x) => (
            <section key={x.id} id={`st-${x.id}`} className="hd-panel st-sec" aria-labelledby={`st-${x.id}-h`}>
              <div className="st-head">
                <div><h2 id={`st-${x.id}-h`}>{x.icon}{x.title}</h2>{x.sec.description ? <p>{x.sec.description}</p> : null}</div>
                {x.resetKey && x.resetKey in defaults ? <button className="hd-btn ghost small" onClick={() => reset(x.resetKey)}><RotateCcw aria-hidden className="hd-i" />Reset</button>
                  : x.id === 'appearance' ? null : null}
              </div>
              <div className="st-fields">
                {x.sec.fields.map((f) => (
                  <Field key={f.key} f={f} value={f.store === 'preferences' ? (prefs as Record<string, unknown>)[f.key] : get(s, f.key)} onChange={(v, d) => change(f, v, d)} />
                ))}
              </div>
            </section>
          ))}
          <p className="st-foot">Saved in <code>~/.config/home-dashboard/settings.json</code>, layered over <code>lib/home-config.mjs</code>. <button className="hd-linkish" onClick={() => reset()}>Reset everything</button></p>
        </div>
      </div>
    </main>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={`st-switch ${checked ? 'on' : ''}`} onClick={onChange}
      title={disabled ? 'At least one page has to stay visible' : undefined}>
      <span />
    </button>
  );
}

function Field({ f, value, onChange }: { f: SettingField; value: unknown; onChange: (v: unknown, debounce?: number) => void }) {
  const id = `f-${f.key.replace(/\W/g, '-')}`;
  const help = f.help ? <p className="st-help" id={`${id}-h`}>{f.help}</p> : null;
  const label = <label className="st-label" htmlFor={id}>{f.label}</label>;
  if (f.type === 'segmented' || f.type === 'select') {
    return (
      <div className="st-row">
        <div className="st-lab"><span className="st-label" id={id}>{f.label}</span>{help}</div>
        <div className="hd-seg st-seg" role="radiogroup" aria-labelledby={id}>
          {f.options!.map((o) => <button key={o.value} role="radio" aria-checked={value === o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>)}
        </div>
      </div>
    );
  }
  if (f.type === 'toggle') return <div className="st-row"><div className="st-lab"><span className="st-label">{f.label}</span>{help}</div><Switch checked={!!value} label={f.label} onChange={() => onChange(!value)} /></div>;
  if (f.type === 'number' || f.type === 'percent') {
    const pct = f.type === 'percent';
    const n = Number(value);
    return (
      <div className="st-row">
        <div className="st-lab">{label}{help}</div>
        <span className="st-num">
          <input id={id} type="number" inputMode="numeric" aria-describedby={f.help ? `${id}-h` : undefined}
            min={pct ? (f.min ?? 0) * 100 : f.min} max={pct ? (f.max ?? 1) * 100 : f.max} step={pct ? (f.step ?? 0.01) * 100 : f.step}
            defaultValue={pct ? Math.round(n * 100) : n}
            onChange={(e) => { const v = Number(e.target.value); if (!Number.isFinite(v)) return; const val = pct ? v / 100 : v; if ((f.min !== undefined && val < f.min) || (f.max !== undefined && val > f.max)) return; onChange(val, 500); }} />
          <span>{pct ? '%' : f.unit}</span>
        </span>
      </div>
    );
  }
  if (f.type === 'text') return <TextField f={f} id={id} value={String(value ?? '')} onChange={onChange} label={label} help={help} />;
  if (f.type === 'tags') return <Tags f={f} value={(value as string[]) ?? []} onChange={onChange} help={help} />;
  if (f.type === 'multi') {
    const cur = (value as string[]) ?? [];
    return (
      <div className="st-row">
        <div className="st-lab"><span className="st-label">{f.label}</span>{help}</div>
        <div className="st-chips">
          {f.options!.map((o) => {
            const on = cur.includes(o.value);
            return <button key={o.value} className="hd-chip" aria-pressed={on} disabled={on && cur.length === 1} onClick={() => onChange(on ? cur.filter((x) => x !== o.value) : [...cur, o.value])}>{on ? <Check aria-hidden className="hd-i" /> : null}{o.label}</button>;
          })}
        </div>
      </div>
    );
  }
  return null;
}

function TextField({ f, id, value, onChange, label, help }: { f: SettingField; id: string; value: string; onChange: (v: unknown, d?: number) => void; label: ReactNode; help: ReactNode }) {
  const [v, setV] = useState(value);
  const set = (x: string) => { const y = x.slice(0, f.maxLength ?? 500); setV(y); onChange(y, 700); };
  return (
    <div className="st-row st-wide">
      <div className="st-lab">{label}{help}</div>
      <span className="hd-micfield st-text"><input id={id} value={v} maxLength={f.maxLength} onChange={(e) => set(e.target.value)} /><Dictate value={v} onChange={set} label={`Dictate ${f.label.toLowerCase()}`} /></span>
    </div>
  );
}

function Tags({ f, value, onChange, help }: { f: SettingField; value: string[]; onChange: (v: unknown) => void; help: ReactNode }) {
  const [draft, setDraft] = useState('');
  const add = () => { const t = draft.trim(); if (!t || value.includes(t)) { setDraft(''); return; } onChange([...value, t.slice(0, 60)]); setDraft(''); };
  return (
    <div className="st-row st-wide">
      <div className="st-lab"><span className="st-label">{f.label}</span>{help}</div>
      <div className="st-tags">
        {value.map((t) => <span key={t} className="st-tag">{t}<button aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X aria-hidden /></button></span>)}
        <span className="hd-micfield st-tagin">
          <input value={draft} placeholder="Add a category" aria-label={`Add to ${f.label}`} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }} onBlur={add} />
          <Dictate value={draft} onChange={setDraft} label="Dictate a category" />
        </span>
      </div>
    </div>
  );
}
