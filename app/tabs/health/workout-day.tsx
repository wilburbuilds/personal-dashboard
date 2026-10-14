'use client';
import type React from 'react';
import { useState } from 'react';
import { Check, Send, NotebookPen } from 'lucide-react';
import type { DayNote, DaySection } from '@/lib/workout-note.mjs';
import { Dictate } from '@/components/home/mic';

/** Today's Gym note as tappable sets. Each tap flips exactly one `- [ ]`/`- [x]` in the vault note. */
export function DayChecklist({ note, day }: { note: DayNote; day: string }) {
  const [sections, setSections] = useState<DaySection[]>(note.sections.filter((s) => s.items.length));
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const all = sections.flatMap((s) => s.items);
  const done = all.filter((i) => i.checked).length;

  async function toggle(hash: string, ord: number, checked: boolean) {
    const key = `${hash}:${ord}`;
    setBusy(key); setErr(null);
    const prev = sections;
    setSections((ss) => ss.map((s) => ({ ...s, items: s.items.map((i) => (i.hash === hash && i.ord === ord ? { ...i, checked } : i)) })));
    try {
      const r = await fetch('/api/workout/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ day, hash, ord, checked }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save');
      setSections((j.sections as DaySection[]).filter((s) => s.items.length));
    } catch (e) { setSections(prev); setErr((e as Error).message); } finally { setBusy(null); }
  }

  if (!all.length) return <p className="empty">Today&apos;s note has no set lines to check off yet.</p>;
  return (
    <div className="wd-sets">
      <div className="wd-prog" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={done} aria-label={`${done} of ${all.length} sets done`}>
        <span style={{ width: `${(done / all.length) * 100}%` }} />
      </div>
      <p className="hd-meta num wd-count">{done} of {all.length} sets done{done === all.length ? '. Nice work.' : ''}</p>
      {sections.map((s) => (
        <fieldset key={s.title} className="wd-sec">
          <legend className="blk">{s.title || 'Sets'} <span>{s.items.filter((i) => i.checked).length}/{s.items.length}</span></legend>
          <ul>
            {s.items.map((i) => {
              const key = `${i.hash}:${i.ord}`;
              const id = `set-${key}`;
              return (
                <li key={key} className={i.checked ? 'on' : ''}>
                  <input id={id} type="checkbox" data-row checked={i.checked} disabled={busy === key} onChange={(e) => toggle(i.hash, i.ord, e.target.checked)} />
                  <label htmlFor={id}>
                    <span className="bx" aria-hidden>{i.checked ? <Check /> : null}</span>
                    <span className="ex">{i.exercise}</span>
                    {i.set ? <span className="st num">{i.set}</span> : null}
                    {i.target ? <span className="tg num">{i.target}</span> : null}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      {err ? <p role="alert" className="t2-err">{err}</p> : null}
    </div>
  );
}

/** Message box to Gym: appends to fitness/gym-inbox.md, plus the optional webhook. */
export function GymBox() {
  const [text, setText] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'err'; msg?: string }>({ kind: 'idle' });
  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || state.kind === 'busy') return;
    setState({ kind: 'busy' });
    try {
      const r = await fetch('/api/gym', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save');
      setText('');
      setState({ kind: 'ok', msg: j.sent ? 'Sent to Gym' : j.webhook === 'failed' ? 'Saved to the Gym inbox (webhook did not answer)' : 'Saved to the Gym inbox' });
    } catch (err) { setState({ kind: 'err', msg: (err as Error).message }); }
  }
  return (
    <section className="hd-panel gym" aria-labelledby="h-gym">
      <div className="hd-ph"><h2 id="h-gym"><NotebookPen aria-hidden className="hd-i" />Tell Gym</h2><span className="hd-meta">fitness/gym-inbox.md</span></div>
      <form onSubmit={send}>
        <span className="hd-micfield">
          <textarea value={text} rows={3} maxLength={4000} placeholder="How it went, loads, how the knee felt" aria-label="Message to Gym"
            onChange={(e) => { setText(e.target.value); if (state.kind !== 'busy') setState({ kind: 'idle' }); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} />
          <Dictate value={text} onChange={setText} label="Dictate to Gym" />
        </span>
        <div className="gym-row">
          <span className={`hd-meta ${state.kind === 'err' ? 'st-miss' : state.kind === 'ok' ? 'st-ok' : ''}`} role="status" aria-live="polite">
            {state.kind === 'ok' ? <><Check aria-hidden className="hd-i" />{state.msg}</> : state.kind === 'err' ? state.msg : <><kbd>⌘</kbd><kbd>Enter</kbd> to send</>}
          </span>
          <button type="submit" className="hd-btn primary small" disabled={!text.trim() || state.kind === 'busy'}><Send aria-hidden className="hd-i" />{state.kind === 'busy' ? 'Sending' : 'Send'}</button>
        </div>
      </form>
    </section>
  );
}
