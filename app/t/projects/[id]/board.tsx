'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, CalendarClock, Flag, AlignLeft, CircleAlert, GripVertical } from 'lucide-react';
import type { ProjectBoard, Column, Card } from '@/lib/sources/vikunja-projects';
import { timeLabel } from '@/components/home/ui';
import { CardDetail } from './detail';

const TZ = 'America/Los_Angeles';
const fmtDue = (iso: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: TZ }).format(new Date(iso));
const initials = (s: string) => s.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export const PRIORITY = ['None', 'Low', 'Medium', 'High', 'Urgent', 'Do now'];
const STEP = 65536;

/** Position for a card inserted at `index` among `cards` (the moved card already removed). */
export function positionAt(cards: { position: number }[], index: number) {
  const prev = cards[index - 1]?.position, next = cards[index]?.position;
  if (prev == null && next == null) return STEP;
  if (prev == null) return next! / 2;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}

type Pick = { id: number; from: { col: number; index: number }; snapshot: Column[] };

export default function ProjectBoardView({ board, fetchedAt }: { board: ProjectBoard; fetchedAt: string }) {
  const [cols, setCols] = useState<Column[]>(board.columns);
  const [open, setOpen] = useState<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [drop, setDrop] = useState<{ col: number; index: number } | null>(null);
  const [kb, setKb] = useState<Pick | null>(null);
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [err, setErr] = useState('');
  const [live, setLive] = useState('');
  const [col, setCol] = useState(0);
  const [now] = useState(() => Date.parse(fetchedAt));
  const refs = useRef(new Map<number, HTMLButtonElement>());
  const canMove = board.writable && board.viewId != null;

  useEffect(() => { if (kb) refs.current.get(kb.id)?.focus(); }, [cols, kb]);

  const where = (cs: Column[], id: number) => { for (let c = 0; c < cs.length; c++) { const i = cs[c].cards.findIndex((x) => x.id === id); if (i >= 0) return { col: c, index: i }; } return null; };
  /** Pure: the board with card `id` moved to column `c`, slot `index`. */
  function placed(cs: Column[], id: number, c: number, index: number) {
    const at = where(cs, id); if (!at) return cs;
    const next = cs.map((x) => ({ ...x, cards: [...x.cards] }));
    const [card] = next[at.col].cards.splice(at.index, 1);
    const i = Math.max(0, Math.min(at.col === c && at.index < index ? index - 1 : index, next[c].cards.length));
    next[c].cards.splice(i, 0, { ...card });
    return next;
  }

  async function commit(id: number, c: number, index: number, snapshot: Column[]) {
    const at = where(snapshot, id);
    if (!at || (at.col === c && (at.index === index || at.index === index - 1))) { setCols(snapshot); return; }
    const moved = placed(snapshot, id, c, index);
    const to = moved[c]; const i = to.cards.findIndex((x) => x.id === id);
    const others = to.cards.filter((x) => x.id !== id);
    const position = positionAt(others, i);
    to.cards[i] = { ...to.cards[i], position, done: to.kind === 'done' ? true : snapshot[at.col].kind === 'done' ? false : to.cards[i].done };
    setCols(moved); setErr('');
    setPending((s) => new Set(s).add(id));
    const title = to.cards[i].title;
    try {
      const r = await fetch('/api/projects/move', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: board.project.id, viewId: board.viewId, taskId: id, bucketId: to.id, position }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Vikunja answered ${r.status}`);
      setLive(`Moved “${title}” to ${to.title}.`);
    } catch (e) {
      setCols(snapshot);
      const msg = `Couldn’t move “${title}”: ${e instanceof Error ? e.message : 'unknown error'}. It’s back where it was.`;
      setErr(msg); setLive(msg);
    } finally { setPending((s) => { const n = new Set(s); n.delete(id); return n; }); }
  }

  /* Pointer drag (HTML5 DnD). */
  function overColumn(e: React.DragEvent, c: number) {
    if (dragId == null) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'move';
    const list = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-card]');
    let index = list.length;
    for (let k = 0; k < list.length; k++) { const r = list[k].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { index = k; break; } }
    if (!drop || drop.col !== c || drop.index !== index) setDrop({ col: c, index });
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    if (dragId != null && drop) commit(dragId, drop.col, drop.index, cols);
    setDragId(null); setDrop(null);
  }

  /* Keyboard: Space picks up, arrows move, Space/Enter drops, Escape cancels. */
  function onKey(e: React.KeyboardEvent, card: Card) {
    if (!canMove) return;
    if (!kb) {
      if (e.key === ' ') { e.preventDefault(); const at = where(cols, card.id)!; setKb({ id: card.id, from: at, snapshot: cols }); setLive(`Picked up “${card.title}” in ${cols[at.col].title}, position ${at.index + 1}. Use the arrow keys to move, Space to drop, Escape to cancel.`); }
      return;
    }
    if (kb.id !== card.id) return;
    const at = where(cols, card.id)!;
    let c = at.col, i = at.index;
    if (e.key === 'ArrowLeft') c = Math.max(0, c - 1);
    else if (e.key === 'ArrowRight') c = Math.min(cols.length - 1, c + 1);
    else if (e.key === 'ArrowUp') i = Math.max(0, i - 1);
    else if (e.key === 'ArrowDown') i = Math.min(cols[c].cards.length - 1, i + 1);
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); const snap = kb.snapshot; setKb(null);
      const target = where(cols, card.id)!; const orig = where(snap, card.id)!;
      if (target.col === orig.col && target.index === orig.index) { setCols(snap); setLive('Dropped in the same place.'); return; }
      // Re-apply against the snapshot so the saved position is computed from real neighbours.
      const idx = target.col === orig.col && target.index > orig.index ? target.index + 1 : target.index;
      commit(card.id, target.col, idx, snap); return;
    } else if (e.key === 'Escape') { e.preventDefault(); setCols(kb.snapshot); setKb(null); setLive(`Move cancelled. “${card.title}” is back in ${kb.snapshot[kb.from.col].title}.`); return; }
    else return;
    e.preventDefault();
    if (c !== at.col) i = Math.min(at.index, cols[c].cards.length);
    if (c === at.col && i === at.index) return;
    const tmp = cols.map((x) => ({ ...x, cards: x.cards.filter((y) => y.id !== card.id) }));
    tmp[c].cards.splice(i, 0, cols[at.col].cards[at.index]);
    setCols(tmp); setCol(c);
    setLive(`${tmp[c].title}, position ${i + 1} of ${tmp[c].cards.length}.`);
  }

  const total = cols.reduce((n, c) => n + c.cards.length, 0);
  const openCard = cols.flatMap((c) => c.cards).find((x) => x.id === open) ?? null;
  return (
    <main className="hd-page pj pb">
      <header className="hd-top">
        <Link href="/t/projects" className="hd-btn ghost small pb-back"><ArrowLeft aria-hidden className="hd-i" />Projects</Link>
        <h1>{board.project.title}{board.project.parent ? <span className="pb-parent"> in {board.project.parent}</span> : null}</h1>
        <span className="hd-spacer" />
        <span className="hd-meta">{total} {total === 1 ? 'card' : 'cards'} · synced {timeLabel(fetchedAt)}</span>
        <a className="hd-btn" href={board.project.url} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="hd-i" />Open in Vikunja</a>
      </header>
      <p className="pb-help hd-faint">{canMove ? 'Drag cards between columns, or focus a card and press Space to move it with the arrow keys. Moves are saved to Vikunja.' : 'This board has no manual Kanban view, so cards can’t be moved here.'}</p>
      {err ? <p className="t2-note pb-err" role="alert"><CircleAlert aria-hidden />{err}</p> : null}
      <p className="hd-sr" aria-live="assertive">{live}</p>
      <p className="hd-sr" id="pb-kbd">Press Space to pick up this card and move it with the arrow keys.</p>

      <div className="hd-seg pj-bucket-switch" role="group" aria-label="Column">
        {cols.map((c, i) => <button key={c.id} aria-pressed={i === col} onClick={() => { setCol(i); document.getElementById(`pb-col-${c.id}`)?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); }}>{c.title} {c.cards.length}</button>)}
      </div>
      <div className="pj-board pb-board" onDragEnd={() => { setDragId(null); setDrop(null); }}>
        {cols.map((c, ci) => (
          <section key={c.id} id={`pb-col-${c.id}`} className={`pj-col pb-col k-${c.kind}${drop?.col === ci ? ' over' : ''}`} aria-label={`${c.title}, ${c.cards.length} cards`}
            onDragOver={(e) => overColumn(e, ci)} onDrop={onDrop}>
            <header><h2>{c.title}</h2><span className={`hd-faint num${c.limit && c.cards.length > c.limit ? ' pb-limit' : ''}`}>{c.cards.length}{c.limit ? ` / ${c.limit}` : ''}</span></header>
            <ul className="pb-cards" role="list">
              {c.cards.map((t, i) => (
                <li key={t.id} data-card className={drop?.col === ci && drop.index === i && dragId !== t.id ? 'pb-gap' : undefined}>
                  <BoardCard t={t} now={now} draggable={canMove} picked={kb?.id === t.id} dragging={dragId === t.id} saving={pending.has(t.id)}
                    refFn={(el) => { if (el) refs.current.set(t.id, el); else refs.current.delete(t.id); }}
                    onOpen={() => { if (!kb) setOpen(t.id); }} onKey={(e) => onKey(e, t)}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(t.id)); setDragId(t.id); }} />
                </li>
              ))}
              {drop?.col === ci && drop.index >= c.cards.length ? <li className="pb-gap end" aria-hidden /> : null}
            </ul>
            {!c.cards.length && drop?.col !== ci ? <p className="hd-empty">Nothing here</p> : null}
          </section>
        ))}
      </div>
      <CardDetail id={open} card={openCard} columns={cols} canMove={canMove} now={now} onClose={() => setOpen(null)}
        onMove={(colIndex) => { if (open != null) commit(open, colIndex, cols[colIndex].cards.length, cols); }} />
    </main>
  );
}

function BoardCard({ t, now, draggable, picked, dragging, saving, refFn, onOpen, onKey, onDragStart }: {
  t: Card; now: number; draggable: boolean; picked: boolean; dragging: boolean; saving: boolean; refFn: (el: HTMLButtonElement | null) => void;
  onOpen: () => void; onKey: (e: React.KeyboardEvent) => void; onDragStart: (e: React.DragEvent) => void;
}) {
  const overdue = !!t.due && !t.done && Date.parse(t.due) < now;
  return (
    <button ref={refFn} type="button" className={`pj-card pb-card${t.done ? ' done' : ''}${picked ? ' picked' : ''}${dragging ? ' dragging' : ''}${saving ? ' saving' : ''}`}
      draggable={draggable} onDragStart={onDragStart} onClick={onOpen} onKeyDown={onKey} aria-pressed={picked || undefined}
      aria-describedby={draggable ? 'pb-kbd' : undefined}>
      <div className="pj-row">
        <span className="pj-ref">{t.ref}</span>
        {t.priority >= 3 ? <span className={`pb-pri p${t.priority}`}><Flag aria-hidden />{PRIORITY[t.priority]}</span> : null}
        {t.assignees.length ? <span className="pj-who" title={t.assignees.join(', ')}>{initials(t.assignees[0])}</span> : null}
        {draggable ? <GripVertical aria-hidden className="pb-grip" /> : null}
      </div>
      <h3>{t.title}</h3>
      {t.labels.length || t.due || t.hasDescription ? (
        <div className="pj-row pj-meta">
          {t.labels.map((l) => <span key={l.title} className="pj-label"><i style={{ background: l.color || 'var(--h-text-3)' }} />{l.title}</span>)}
          {t.due ? <span className={overdue ? 'pj-due over' : 'pj-due'}><CalendarClock aria-hidden />{overdue ? 'Overdue · ' : ''}{fmtDue(t.due)}</span> : null}
          {t.hasDescription ? <AlignLeft aria-label="Has a description" className="pb-desc" /> : null}
        </div>
      ) : null}
      {t.percent > 0 ? <div className="pj-progress" role="img" aria-label={`${t.percent}% done`}><i style={{ width: `${t.percent}%` }} /></div> : null}
    </button>
  );
}
