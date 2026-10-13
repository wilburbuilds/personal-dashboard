'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Lock, ExternalLink, CalendarClock } from 'lucide-react';
import type { Board, Task } from '@/lib/sources/vikunja';
import { timeLabel } from '@/components/home/ui';

const fmtDue = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(iso));
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function Card({ t, now }: { t: Task; now: number }) {
  const overdue = !!t.due && !t.done && Date.parse(t.due) < now;
  return (
    <article className={`pj-card${t.done ? ' done' : ''}`}>
      <div className="pj-row"><span className="pj-ref">{t.ref}</span>{t.assignees[0] ? <span className="pj-who" title={t.assignees[0]}>{initials(t.assignees[0])}</span> : null}</div>
      <h3>{t.title}</h3>
      {t.labels.length || t.due ? (
        <div className="pj-row pj-meta">
          {t.labels.map((l) => <span key={l.title} className="pj-label"><i style={{ background: l.color || 'var(--h-text-3)' }} />{l.title}</span>)}
          {t.due ? <span className={overdue ? 'pj-due over' : 'pj-due'}><CalendarClock aria-hidden />{fmtDue(t.due)}</span> : null}
        </div>
      ) : null}
      {t.percent > 0 ? <div className="pj-progress" role="img" aria-label={`${t.percent}% done`}><i style={{ width: `${t.percent}%` }} /></div> : null}
    </article>
  );
}

export default function ProjectsView({ data, fetchedAt }: { data: Board; fetchedAt: Date }) {
  const [mode, setMode] = useState<'board' | 'list'>('board');
  const [bucket, setBucket] = useState(0);
  const [now] = useState(() => Date.now());
  const top = [...data.projects].sort((a, b) => b.open - a.open).slice(0, 3);
  if (!top.some((p) => p.id === data.project.id)) top.splice(2, 1, data.projects.find((p) => p.id === data.project.id)!);
  const total = data.buckets.reduce((s, b) => s + b.tasks.length, 0);
  return (
    <main className="hd-page pj">
      <header className="hd-top">
        <h1>Projects</h1>
        <nav className="hd-seg" aria-label="Project">
          {top.map((p) => <Link key={p.id} href={`/t/projects?p=${p.id}`} aria-current={p.id === data.project.id ? 'page' : undefined}>{p.title}</Link>)}
        </nav>
        <label className="pj-more"><span className="hd-sr">More projects</span>
          <select value={data.project.id} onChange={(e) => { window.location.href = `/t/projects?p=${e.target.value}`; }}>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.open})</option>)}
          </select>
        </label>
        <span className="hd-spacer" />
        <span className="hd-meta pj-lock"><Lock aria-hidden className="hd-i" />Read-only, synced {timeLabel(fetchedAt)}</span>
        <div className="hd-seg" role="group" aria-label="Layout">
          <button aria-pressed={mode === 'board'} onClick={() => setMode('board')}>Board</button>
          <button aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button>
        </div>
        <a className="hd-btn" href={data.project.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="hd-i" />Open in Vikunja</a>
      </header>
      <p className="pj-sub hd-muted">{data.project.title}. {total} {total === 1 ? 'task' : 'tasks'} across {data.buckets.length} {data.mode === 'kanban' ? 'buckets' : 'list'}.</p>
      {mode === 'board' ? (
        <>
          <div className="hd-seg pj-bucket-switch" role="group" aria-label="Bucket">
            {data.buckets.map((b, i) => <button key={b.id} aria-pressed={i === bucket} onClick={() => { setBucket(i); document.getElementById(`pj-col-${b.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); }}>{b.title} {b.tasks.length}</button>)}
          </div>
          <div className="pj-board">
            {data.buckets.map((b) => (
              <section key={b.id} id={`pj-col-${b.id}`} className="pj-col" aria-label={b.title}>
                <header><h2>{b.title}</h2><span className="hd-faint num">{b.tasks.length}{b.limit ? ` / ${b.limit}` : ''}</span></header>
                {b.tasks.length ? b.tasks.map((t) => <Card key={t.id} t={t} now={now} />) : <p className="hd-empty">Nothing here</p>}
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="hd-panel pj-list">
          <table>
            <thead><tr><th>Task</th><th>Bucket</th><th>Labels</th><th>Due</th><th>Done</th></tr></thead>
            <tbody>
              {data.buckets.flatMap((b) => b.tasks.map((t) => (
                <tr key={t.id}><td><span className="pj-ref">{t.ref}</span> {t.title}</td><td>{b.title}</td><td>{t.labels.map((l) => l.title).join(', ')}</td>
                  <td className={t.due && !t.done && Date.parse(t.due) < now ? 'pj-due over' : ''}>{t.due ? fmtDue(t.due) : ''}</td><td className="num">{t.percent}%</td></tr>
              )))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
