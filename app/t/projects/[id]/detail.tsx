'use client';
import { useEffect, useState } from 'react';
import { ExternalLink, CalendarClock, Flag, Users, Tag, MessageSquare, CircleAlert, CheckCircle2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { MarkdownNote } from '@/components/home/markdown';
import { vikunjaToMarkdown } from '@/lib/md/vikunja-html';
import type { Card, Column, TaskDetail } from '@/lib/sources/vikunja-projects';
import { PRIORITY } from './board';

const TZ = 'America/Los_Angeles';
const when = (iso: string, time = true) => new Intl.DateTimeFormat('en-US', time ? { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: TZ }).format(new Date(iso));

/** Card detail: read-only, except the column picker, which uses the same Kanban move as drag and drop. */
export function CardDetail({ id, card, columns, canMove, now, onClose, onMove }: { id: number | null; now: number; card: Card | null; columns: Column[]; canMove: boolean; onClose: () => void; onMove: (colIndex: number) => void }) {
  const [st, setSt] = useState<{ id: number; d: TaskDetail | null; err: string } | null>(null);
  useEffect(() => {
    if (id == null) return;
    let live = true;
    fetch(`/api/projects/task/${id}`, { cache: 'no-store' }).then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); if (live) setSt({ id, d: j, err: '' }); })
      .catch((e) => { if (live) setSt({ id, d: null, err: e instanceof Error && e.message ? e.message : 'Couldn’t load this card.' }); });
    return () => { live = false; };
  }, [id]);
  const d = st?.id === id ? st.d : null, err = st?.id === id ? st.err : '';
  const colIndex = card ? columns.findIndex((c) => c.cards.some((x) => x.id === card.id)) : -1;
  const due = d?.due ?? card?.due ?? null;
  const overdue = !!due && !(d?.done ?? card?.done) && Date.parse(due) < now;
  const md = d ? vikunjaToMarkdown(d.description) : '';
  return (
    <Sheet open={id != null} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="hd-tokens pd">
        <SheetHeader className="pd-h">
          <span className="pj-ref">{d?.ref ?? card?.ref}</span>
          <SheetTitle className="pd-title">{d?.title ?? card?.title ?? 'Card'}</SheetTitle>
          <SheetDescription className="pd-sub">{(d?.done ?? card?.done) ? <><CheckCircle2 aria-hidden />Done{d?.doneAt ? ` ${when(d.doneAt)}` : ''}</> : colIndex >= 0 ? `In ${columns[colIndex].title}` : ' '}</SheetDescription>
        </SheetHeader>
        <div className="pd-body">
          <dl className="pd-facts">
            <div><dt><CalendarClock aria-hidden />Due</dt><dd className={overdue ? 'pj-due over' : ''}>{due ? `${overdue ? 'Overdue · ' : ''}${when(due, false)}` : <span className="hd-faint">No due date</span>}</dd></div>
            <div><dt><Flag aria-hidden />Priority</dt><dd>{(d?.priority ?? card?.priority) ? PRIORITY[d?.priority ?? card!.priority] : <span className="hd-faint">None</span>}</dd></div>
            <div><dt><Users aria-hidden />Assignees</dt><dd>{(d?.assignees ?? card?.assignees ?? []).length ? (d?.assignees ?? card!.assignees).join(', ') : <span className="hd-faint">Unassigned</span>}</dd></div>
            <div><dt><Tag aria-hidden />Labels</dt><dd className="pd-labels">{(d?.labels ?? card?.labels ?? []).length ? (d?.labels ?? card!.labels).map((l) => <span key={l.title} className="pj-label"><i style={{ background: l.color || 'var(--h-text-3)' }} />{l.title}</span>) : <span className="hd-faint">None</span>}</dd></div>
            {canMove && card && colIndex >= 0 ? (
              <div><dt>Column</dt><dd>
                <label className="hd-sr" htmlFor="pd-col">Move to column</label>
                <select id="pd-col" className="pd-col" value={colIndex} onChange={(e) => onMove(Number(e.target.value))}>
                  {columns.map((c, i) => <option key={c.id} value={i}>{c.title}</option>)}
                </select>
              </dd></div>
            ) : null}
          </dl>
          {err ? <p className="t2-note" role="alert"><CircleAlert aria-hidden />{err}</p> : null}
          <section className="pd-sec" aria-labelledby="pd-desc-h">
            <h3 id="pd-desc-h">Description</h3>
            {!d && !err ? <span className="hd-skel" style={{ height: 80 }} /> : md ? <MarkdownNote body={md} compact className="pd-md" /> : <p className="hd-faint">No description.</p>}
          </section>
          <section className="pd-sec" aria-labelledby="pd-com-h">
            <h3 id="pd-com-h"><MessageSquare aria-hidden />Comments{d?.comments.length ? <span className="hd-faint num"> {d.comments.length}</span> : null}</h3>
            {!d && !err ? <span className="hd-skel" style={{ height: 48 }} /> : d?.comments.length ? (
              <ol className="pd-comments">
                {d.comments.map((c) => <li key={c.id}><div className="pd-cm-h"><b>{c.author}</b><time dateTime={c.at}>{when(c.at)}</time></div><MarkdownNote body={vikunjaToMarkdown(c.body)} compact className="pd-md" /></li>)}
              </ol>
            ) : <p className="hd-faint">No comments.</p>}
          </section>
          {d ? <p className="hd-faint pd-meta">{d.created ? `Created ${when(d.created)}` : ''}{d.updated ? ` · Updated ${when(d.updated)}` : ''}</p> : null}
        </div>
        <div className="pd-foot">
          <a className="hd-btn primary" href={d?.url ?? '#'} target="_blank" rel="noreferrer" aria-disabled={!d}><ExternalLink aria-hidden className="hd-i" />Open in Vikunja</a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
