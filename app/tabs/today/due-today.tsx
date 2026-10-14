'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { TodoRow } from '@/components/home/todos';
import type { Todo, TodoSource } from '@/lib/sources/todos';

type Due = { at: string; items: (Todo & { source: 'reminders' | 'vikunja'; group: string })[]; reminders: Pick<TodoSource, 'status' | 'note'>; vikunja: Pick<TodoSource, 'status' | 'note'> };

/** Reminders + Vikunja items due today or overdue. Read-only; refreshes with the page every 2 minutes. */
export function DueToday() {
  const [d, setD] = useState<Due | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch('/api/todos?scope=due', { cache: 'no-store' }).then((r) => r.json()).then((j) => { if (live) setD(j); }).catch(() => {});
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 120000);
    return () => { live = false; clearInterval(t); };
  }, []);
  const over = d?.items.filter((i) => i.overdue).length ?? 0;
  const problems = d ? (['reminders', 'vikunja'] as const).filter((k) => d[k].status === 'error') : [];
  return (
    <section className="t2-sec t2-due" aria-labelledby="h-due">
      <div className="sh"><h2 id="h-due">Due today</h2><span className="m num">{d ? `${d.items.length}${over ? `, ${over} overdue` : ''}` : ''}</span><Link href="/t/projects#td-all-h">All to-dos</Link></div>
      {!d ? <span className="hd-skel" style={{ height: 56, display: 'block' }} /> : d.items.length ? (
        <ul className="td-list">{d.items.slice(0, 8).map((t) => <TodoRow key={t.id} t={t} source={t.source} />)}</ul>
      ) : <p className="t2-empty td-clear"><CircleCheck aria-hidden />Nothing due. Clear day.</p>}
      {d && d.items.length > 8 ? <p className="t2-trmeta">{d.items.length - 8} more in <Link href="/t/projects#td-all-h">Projects</Link></p> : null}
      {problems.map((k) => <p key={k} className="t2-note td-note"><CircleAlert aria-hidden />{d![k].note}</p>)}
    </section>
  );
}
