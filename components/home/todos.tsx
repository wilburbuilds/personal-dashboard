'use client';
import { useState } from 'react';
import { CircleAlert, ExternalLink, ListTodo, Bell, ChevronDown } from 'lucide-react';
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

export function TodoRow({ t, source }: { t: Todo; source?: 'reminders' | 'vikunja' }) {
  const body = (
    <>
      <span className={`td-dot${t.priority >= 3 ? ' hi' : ''}`} aria-hidden />
      <span className="td-t">{t.title}</span>
      {t.due ? <span className={`td-due num${t.overdue ? ' over' : t.dueToday ? ' today' : ''}`}>{dueLabel(t)}</span> : null}
      {source ? <span className="td-src" title={source === 'reminders' ? 'Apple Reminders' : 'Vikunja'}>{source === 'reminders' ? <Bell aria-label="Reminders" /> : <ListTodo aria-label="Vikunja" />}</span> : null}
    </>
  );
  return <li className="td-row">{t.url ? <a href={t.url} target="_blank" rel="noreferrer">{body}<ExternalLink aria-hidden className="td-ext" /></a> : <div>{body}</div>}</li>;
}

function SourceNote({ s, name }: { s: Pick<TodoSource, 'status' | 'note'>; name: string }) {
  if (s.status === 'ready') return null;
  return <p className="t2-note td-note"><CircleAlert aria-hidden />{name}: {s.note}</p>;
}

/** The full read-only list at the bottom of Projects: Reminders lists, then Vikunja projects. */
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
    <section className="td-all" aria-labelledby="td-all-h">
      <div className="td-all-h"><h2 id="td-all-h">To-dos</h2><span className="hd-meta">Read-only · Reminders and Vikunja</span></div>
      <div className="td-cols">
        {block('reminders', 'Reminders', Bell)}
        {block('vikunja', 'Vikunja', ListTodo)}
      </div>
    </section>
  );
}
