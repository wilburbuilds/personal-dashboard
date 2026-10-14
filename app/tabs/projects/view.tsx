'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, ExternalLink, CircleAlert, Archive, ChevronRight } from 'lucide-react';
import type { Overview, ProjectSummary } from '@/lib/sources/vikunja-projects';
import type { Todos } from '@/lib/sources/todos';
import { TodoLists } from '@/components/home/todos';
import { timeLabel } from '@/components/home/ui';

type Sort = 'updated' | 'open' | 'name';
const SORTS: { id: Sort; label: string }[] = [{ id: 'updated', label: 'Recent' }, { id: 'open', label: 'Most open' }, { id: 'name', label: 'Name' }];

/** "3 h ago", "Yesterday", "Oct 2". Exact time on hover. */
export function ago(iso: string | null, now: number) {
  if (!iso) return 'No activity';
  const ms = now - Date.parse(iso), h = ms / 36e5;
  if (h < 1) return `${Math.max(1, Math.round(ms / 6e4))} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  if (h < 48) return 'Yesterday';
  if (h < 24 * 7) return `${Math.round(h / 24)} days ago`;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' }).format(new Date(iso));
}
const exact = (iso: string) => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' }).format(new Date(iso)) + ' PT';

export default function ProjectsOverview({ data, fetchedAt }: { data: Overview & { todos?: Todos }; fetchedAt: Date }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('updated');
  const [archived, setArchived] = useState(false);
  const [now, setNow] = useState(() => fetchedAt.getTime());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(t); }, []);
  // Old links (/t/projects?p=8) go straight to the board.
  useEffect(() => { const p = Number(sp.get('p')); if (p > 0) router.replace(`/t/projects/${p}`); }, [sp, router]);

  const nArchived = data.projects.filter((p) => p.archived).length;
  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return data.projects
      .filter((p) => (archived ? true : !p.archived))
      .filter((p) => words.every((w) => `${p.title} ${p.parent ?? ''}`.toLowerCase().includes(w)))
      .sort((a, b) => sort === 'name' ? a.title.localeCompare(b.title) : sort === 'open' ? (b.open + b.doing) - (a.open + a.doing) || a.title.localeCompare(b.title) : (b.updated ?? '').localeCompare(a.updated ?? ''));
  }, [data.projects, q, sort, archived]);
  const totals = data.projects.filter((p) => !p.archived).reduce((t, p) => ({ open: t.open + p.open, doing: t.doing + p.doing, overdue: t.overdue + p.overdue }), { open: 0, doing: 0, overdue: 0 });

  return (
    <main className="hd-page pj pv">
      <header className="hd-top">
        <h1>Projects</h1>
        <span className="hd-meta num pv-tot">{totals.open + totals.doing} open · {totals.doing} doing{totals.overdue ? <> · <span className="pv-over">{totals.overdue} overdue</span></> : null}</span>
        <span className="hd-spacer" />
        <span className="hd-meta">Synced {timeLabel(fetchedAt)}</span>
        <a className="hd-btn" href={data.publicURL} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="hd-i" />Vikunja</a>
      </header>

      <div className="pv-tools">
        <label className="pv-search"><Search aria-hidden /><span className="hd-sr">Search projects</span>
          <input type="search" value={q} placeholder="Search projects" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) router.push(`/t/projects/${shown[0].id}`); }} />
        </label>
        <div className="hd-seg" role="group" aria-label="Sort">
          {SORTS.map((s) => <button key={s.id} aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</button>)}
        </div>
        {nArchived ? <button className={`hd-btn ghost small pv-arch${archived ? ' on' : ''}`} aria-pressed={archived} onClick={() => setArchived(!archived)}><Archive aria-hidden className="hd-i" />{archived ? 'Hide archived' : `Archived (${nArchived})`}</button> : null}
      </div>

      {shown.length ? (
        <ul className="pv-grid" aria-label="Projects">
          {shown.map((p) => <li key={p.id}><ProjectCard p={p} now={now} /></li>)}
        </ul>
      ) : <p className="hd-empty pv-none">{q ? `No projects match “${q}”.` : 'No projects yet.'}</p>}

      {data.todos ? <TodoLists todos={data.todos} /> : null}
    </main>
  );
}

function ProjectCard({ p, now }: { p: ProjectSummary; now: number }) {
  const total = p.open + p.doing + p.done;
  const pct = (n: number) => (total ? `${(n / total) * 100}%` : '0%');
  return (
    <Link href={`/t/projects/${p.id}`} className={`pv-card${p.archived ? ' arch' : ''}`} style={p.color ? { ['--pc' as string]: p.color } : undefined}>
      <div className="pv-h">
        <span className="pv-dot" aria-hidden />
        <div className="pv-t"><h2>{p.title}</h2>{p.parent ? <span className="pv-parent">{p.parent}</span> : null}</div>
        {p.archived ? <span className="pv-tag">Archived</span> : null}
        <ChevronRight aria-hidden className="pv-go" />
      </div>
      <dl className="pv-counts num">
        <div><dt>Open</dt><dd>{p.open}</dd></div>
        <div><dt>Doing</dt><dd>{p.doing}</dd></div>
        <div><dt>Done</dt><dd>{p.done}</dd></div>
      </dl>
      <div className="pv-bar" role="img" aria-label={`${p.done} of ${total} done`}><i className="d" style={{ width: pct(p.done) }} /><i className="g" style={{ width: pct(p.doing) }} /></div>
      <div className="pv-f">
        {p.overdue ? <span className="pv-over"><CircleAlert aria-hidden />{p.overdue} overdue</span> : <span className="hd-faint">Nothing overdue</span>}
        {p.updated ? <time dateTime={p.updated} title={`Last update ${exact(p.updated)}`}>Updated {ago(p.updated, now)}</time> : <span className="hd-faint">No activity</span>}
      </div>
    </Link>
  );
}
