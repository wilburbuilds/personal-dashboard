'use client';
import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, ExternalLink, ListTodo, Bell, ChevronDown, Check } from 'lucide-react';
import type { Todo, Todos, TodoSource } from '@/lib/sources/todos';

const TZ = 'America/Los_Angeles';
/** Short, honest due label: "Overdue · Oct 11", "Today", "Today 3:30 PM", "Tue, Oct 21". */
export function dueLabel(t: Pick<Todo, 'due' | 'allDay' | 'overdue' | 'dueToday'>) {
  if (!t.due) return '';
  const d = new Date(t.due);
  const date = t.allDay
    ? new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
    : new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: TZ }).format(d);
  const time = t.allDay ? '' : new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(d);
  if (t.overdue) return `Overdue · ${date.replace(/^\w+, /, '')}`;
  if (t.dueToday) return time ? `Today ${time}` : 'Today';
  return time ? `${date}, ${time}` : date;
}

/* ---------- Completing Apple Reminders (the one Reminders write) ---------- */
type Toggle = { done: Set<string>; busy: Set<string>; toggle: (t: Todo) => void };
const ToggleCtx = createContext<Toggle | null>(null);
const UNDO_SECONDS = 8;
const remId = (t: Todo) => (t.id.startsWith('r:') ? t.id.slice(2) : null);

/** Optimistic complete / undo for Reminders rows inside it, with a short undo toast and rollback on failure. */
export function ReminderToggles({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ t: Todo; kind: 'done' | 'error'; msg: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = (x: typeof toast, ms = UNDO_SECONDS * 1000) => { clearTimeout(timer.current); setToast(x); timer.current = setTimeout(() => setToast(null), ms); };
  const flip = (set: Set<string>, id: string, on: boolean) => { const n = new Set(set); if (on) n.add(id); else n.delete(id); return n; };

  async function send(t: Todo, completed: boolean) {
    const id = remId(t)!;
    setDone((d) => flip(d, t.id, completed)); setBusy((b) => flip(b, t.id, true));
    if (completed) show({ t, kind: 'done', msg: `Completed “${t.title}”.` }); else setToast(null);
    try {
      const r = await fetch('/api/todos/reminder', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, completed }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    } catch (e) {
      setDone((d) => flip(d, t.id, !completed));
      show({ t, kind: 'error', msg: `Couldn’t ${completed ? 'complete' : 'reopen'} “${t.title}”: ${e instanceof Error ? e.message : 'unknown error'}` }, 6000);
    } finally { setBusy((b) => flip(b, t.id, false)); }
  }
  const toggle = (t: Todo) => { if (!remId(t) || busy.has(t.id)) return; send(t, !done.has(t.id)); };
  return (
    <ToggleCtx.Provider value={{ done, busy, toggle }}>
      {children}
      <div className={`td-toast${toast ? ' on' : ''}${toast?.kind === 'error' ? ' err' : ''}`} role="status" aria-live="polite">
        {toast ? <><span>{toast.msg}</span>{toast.kind === 'done' && done.has(toast.t.id) ? <button type="button" onClick={() => send(toast.t, false)}>Undo</button> : null}</> : null}
      </div>
    </ToggleCtx.Provider>
  );
}

export function TodoRow({ t, source }: { t: Todo; source?: 'reminders' | 'vikunja' }) {
  const ctx = useContext(ToggleCtx);
  const canToggle = !!ctx && !!remId(t);
  const isDone = canToggle && ctx!.done.has(t.id);
  const body = (
    <>
      {canToggle ? null : <span className={`td-dot${t.priority >= 3 ? ' hi' : ''}`} aria-hidden />}
      <span className="td-t">{t.title}</span>
      {t.due ? <span className={`td-due num${t.overdue ? ' over' : t.dueToday ? ' today' : ''}`}>{dueLabel(t)}</span> : null}
      {source ? <span className="td-src" title={source === 'reminders' ? 'Apple Reminders' : 'Vikunja'}>{source === 'reminders' ? <Bell aria-label="Reminders" /> : <ListTodo aria-label="Vikunja" />}</span> : null}
    </>
  );
  return (
    <li className={`td-row${canToggle ? ' td-can' : ''}${isDone ? ' td-done' : ''}`}>
      {canToggle ? (
        <button type="button" role="checkbox" aria-checked={isDone} className={`td-check${t.priority >= 3 ? ' hi' : ''}`} disabled={ctx!.busy.has(t.id)}
          aria-label={isDone ? `Reopen “${t.title}”` : `Complete “${t.title}”`} onClick={() => ctx!.toggle(t)}>
          {isDone ? <Check aria-hidden /> : null}
        </button>
      ) : null}
      {t.url ? <a href={t.url} target="_blank" rel="noreferrer">{body}<ExternalLink aria-hidden className="td-ext" /></a> : <div>{body}</div>}
    </li>
  );
}

function SourceNote({ s, name }: { s: Pick<TodoSource, 'status' | 'note'>; name: string }) {
  if (s.status === 'ready') return null;
  return <p className="t2-note td-note"><CircleAlert aria-hidden />{name}: {s.note}</p>;
}

/** The full list at the bottom of Projects: Reminders lists, then Vikunja projects. */
export function TodoLists({ todos }: { todos: Todos }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const block = (key: 'reminders' | 'vikunja', title: string, Icon: typeof Bell) => {
    const s = todos[key];
    const n = s.groups.reduce((a, g) => a + g.items.length, 0);
    return (
      <section className="td-src-block" aria-labelledby={`td-${key}`}>
        <h3 id={`td-${key}`}><Icon aria-hidden className="hd-i" />{title}<span className="hd-faint num">{s.status === 'ready' ? n : ''}</span></h3>
        <SourceNote s={s} name={title} />
        {s.status === 'ready' && !n ? <p className="hd-empty">Nothing open.</p> : null}
        <div className="td-groups">
          {s.groups.map((g) => {
            const LIMIT = 8, more = g.items.length - LIMIT, exp = !!open[g.id];
            return (
              <div className="td-group" key={g.id}>
                <h4>{g.title}<span className="num">{g.items.length}</span></h4>
                <ul className="td-list" id={`tdl-${g.id}`}>{g.items.slice(0, exp ? undefined : LIMIT).map((t) => <TodoRow key={t.id} t={t} />)}</ul>
                {more > 0 ? <button type="button" className="t2-more" aria-expanded={exp} aria-controls={`tdl-${g.id}`} onClick={() => setOpen({ ...open, [g.id]: !exp })}><ChevronDown aria-hidden className={exp ? 'up' : ''} />{exp ? 'Show fewer' : `Show ${more} more`}</button> : null}
              </div>
            );
          })}
        </div>
      </section>
    );
  };
  return (
    <ReminderToggles>
    <section className="td-all" aria-labelledby="td-all-h">
      <div className="td-all-h"><h2 id="td-all-h">To-dos</h2><span className="hd-meta">Check off Reminders here · Vikunja is read-only</span></div>
      <div className="td-cols">
        {block('reminders', 'Reminders', Bell)}
        {block('vikunja', 'Vikunja', ListTodo)}
      </div>
    </section>
    </ReminderToggles>
  );
}
