'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import {
  ExternalLink, RefreshCw, ArrowRight, ArrowLeftRight, Check, TriangleAlert, CircleAlert, CalendarClock, CreditCard, Landmark,
  Utensils, ShoppingCart, ShoppingBag, Stethoscope, Plane, Car, Users, User, Shapes, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import type { BudgetData } from './plugin';
import { BurnUp, Trend } from './charts';
import { Money, fmt } from '@/components/home/num';
import { timeLabel } from '@/components/home/ui';

type Cat = BudgetData['categories'][number];
type Action = BudgetData['actions'][number];
const catIcon: Record<string, typeof Shapes> = { Dining: Utensils, Groceries: ShoppingCart, Shopping: ShoppingBag, Medical: Stethoscope, Travel: Plane, Transportation: Car, Family: Users, Personal: User };
const toneIcon = { over: CircleAlert, warn: TriangleAlert, info: CalendarClock };
const sorts = { attention: 'Needs attention', largest: 'Largest', az: 'A–Z' } as const;
const rank = { over: 0, warn: 1, ok: 2, none: 3, idle: 4 } as Record<string, number>;

function Sentence({ v }: { v: BudgetData }) {
  return <p className="bu-sentence">{v.sentence.map((p, i) => <span key={i} className={p.tone ? `t-${p.tone}` : undefined}>{p.t}</span>)}</p>;
}

function Facts({ v }: { v: BudgetData }) {
  const t = v.totals;
  const items: [string, number, string?][] = [['Spent', t.spent], ['Pace for today', t.pace], [t.targetSource === 'budget' ? 'Budget' : 'Target', t.target], ['Projected', t.projection, t.target && t.projection > t.target ? 'over' : ''], ['Daily room', t.dailyRoom]];
  return (
    <dl className="bu-facts">
      {items.filter((_, i) => t.target || i === 0 || i === 3).map(([k, val, tone]) => (
        <div key={k}><dt>{k}</dt><dd className={tone ? `t-${tone}` : undefined}><Money cents={val} /></dd></div>
      ))}
    </dl>
  );
}

function ActionItem({ a, onDismiss }: { a: Action; onDismiss: () => void }) {
  const Icon = toneIcon[a.tone as keyof typeof toneIcon] ?? CircleAlert;
  return (
    <motion.li layout exit={{ opacity: 0, height: 0 }} className={`bu-act tone-${a.tone}`}>
      <Icon aria-hidden className="hd-i bu-act-icon" />
      <div>
        <h3>{a.title}</h3>
        <p>{a.body}</p>
        <p className="bu-step"><ArrowRight aria-hidden />{a.step}</p>
        <div className="bu-act-btns">
          {a.move ? <a className="hd-btn small" href={a.link?.href} target="_blank" rel="noreferrer"><ArrowLeftRight aria-hidden className="hd-i" />{a.move}</a> : null}
          {a.link ? <a className="hd-btn small ghost" href={a.link.href} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="hd-i" />{a.link.label}</a> : null}
          <button className="hd-btn small ghost bu-dismiss" onClick={onDismiss} aria-label={`Done with: ${a.title}`}><Check aria-hidden className="hd-i" />Done for this month</button>
        </div>
      </div>
    </motion.li>
  );
}

function WhatToDo({ v }: { v: BudgetData }) {
  const key = `hd-budget-dismissed-${v.month}`;
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => { setDismissed(JSON.parse(localStorage.getItem(key) || '[]')); }, [key]);
  const dismiss = (id: string) => { const n = [...dismissed, id]; setDismissed(n); localStorage.setItem(key, JSON.stringify(n)); };
  const open = v.actions.filter((a) => !dismissed.includes(a.id)).slice(0, 3);
  return (
    <section className="hd-panel s4 bu-todo" aria-labelledby="bu-todo-h">
      <div className="hd-ph"><h2 id="bu-todo-h">What to do</h2><span className="hd-meta">{open.length ? `${open.length} to act on` : 'All clear'}</span></div>
      {open.length ? (
        <ul>{open.map((a) => <ActionItem key={a.id} a={a} onDismiss={() => dismiss(a.id)} />)}</ul>
      ) : (
        <div className="bu-calm"><Check aria-hidden className="hd-i" /><p>{v.calm ?? 'Nothing else needs you this month.'}</p>
          {dismissed.length ? <button className="hd-btn small ghost" onClick={() => { setDismissed([]); localStorage.removeItem(key); }}>Show dismissed</button> : null}
        </div>
      )}
    </section>
  );
}

function CategoryRow({ c, max, draw }: { c: Cat; max: number; draw: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = catIcon[c.name] ?? Shapes;
  const scale = c.target || max;
  const fill = Math.min(1, c.spent / scale);
  const tick = c.target ? Math.min(1, c.pace / scale) : null;
  const tone = c.status === 'over' ? 'over' : c.status === 'warn' ? 'warn' : c.status === 'ok' ? 'ok' : 'none';
  const paceText = c.target ? (c.overBy > 0 ? `${fmt(c.overBy)} over pace` : `${fmt(-c.overBy)} under`) : 'No target';
  const hmax = Math.max(...c.history.map((x) => Math.max(x.spent, x.target)), 1);
  return (
    <li className={`bu-cat tone-${tone}`}>
      <button className="bu-cat-row" aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={`${c.name}: ${fmt(c.spent)}${c.target ? ` of ${fmt(c.target)}, ${paceText}` : ', no target'}`}>
        <Icon aria-hidden className="hd-i" />
        <span className="bu-cat-name">{c.name}</span>
        <span className="bu-track" title={c.target ? `${fmt(Math.max(0, c.remaining))} left, ${fmt(c.dailyRoom)}/day, heading for ${fmt(c.projection)}` : undefined}>
          <motion.i className="bu-fill" initial={draw ? { scaleX: 0 } : false} animate={{ scaleX: fill }} transition={{ delay: draw ? 0.6 : 0, duration: 0.36, ease: [0.16, 1, 0.3, 1] }} />
          {tick !== null ? <b className="bu-tick" style={{ left: `${tick * 100}%` }} /> : null}
        </span>
        <span className="bu-cat-amt num">{fmt(c.spent)}{c.target ? <span className="hd-faint"> / {fmt(c.target)}</span> : null}</span>
        <span className={`bu-cat-pace num t-${tone}`}>{paceText}</span>
        <ChevronDown aria-hidden className="hd-i bu-chev" />
      </button>
      {open ? (
        <div className="bu-cat-more">
          <div className="bu-mini" role="img" aria-label={`${c.name} by month: ${c.history.map((x) => `${x.month} ${fmt(x.spent)}`).join(', ')}`}>
            {c.history.map((x) => (
              <span key={x.month}><i style={{ height: `${(x.spent / hmax) * 100}%` }} className={x.target && x.spent > x.target ? 'over' : ''} /><small>{new Date(x.month + '-15').toLocaleString('en-US', { month: 'short' })}</small></span>
            ))}
          </div>
          <p className="hd-muted">{c.target ? <>{fmt(Math.max(0, c.remaining))} left, about {fmt(c.dailyRoom)} a day. Heading for {fmt(c.projection)}. Target is {c.source === 'budget' ? 'your Actual budget' : 'last month’s spending'}.</> : 'No budget and no history yet.'}</p>
        </div>
      ) : null}
    </li>
  );
}

function Categories({ v, draw }: { v: BudgetData; draw: boolean }) {
  const [sort, setSort] = useState<keyof typeof sorts>('attention');
  const [hl, setHl] = useState<string | null>(null);
  const rows = [...v.categories].sort((a, b) =>
    sort === 'az' ? a.name.localeCompare(b.name) : sort === 'largest' ? b.spent - a.spent : rank[a.status] - rank[b.status] || b.overBy - a.overBy);
  const max = Math.max(...v.categories.map((c) => c.spent), 1);
  return (
    <section className="hd-panel s8 bu-cats" aria-labelledby="bu-cats-h">
      <div className="hd-ph">
        <h2 id="bu-cats-h">Categories</h2>
        <span className="bu-tick-legend hd-meta"><b />Where you should be today</span>
        <div className="hd-seg" role="group" aria-label="Sort">
          {(Object.keys(sorts) as (keyof typeof sorts)[]).map((k) => <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{sorts[k]}</button>)}
        </div>
      </div>
      {v.share.length ? (
        <>
          <div className="bu-share" role="img" aria-label={`Where it went: ${v.share.map((s) => `${s.name} ${Math.round(s.pct * 100)}%`).join(', ')}`}>
            {v.share.map((s, i) => <i key={s.name} style={{ flexGrow: s.pct, background: `var(--c${Math.min(i + 1, 6)})` }} className={hl && hl !== s.name ? 'dim' : ''} onPointerEnter={() => setHl(s.name)} onPointerLeave={() => setHl(null)} title={`${s.name} ${fmt(s.spent)}`} />)}
          </div>
          <ul className="bu-share-legend">
            {v.share.slice(0, 4).map((s, i) => <li key={s.name}><i style={{ background: `var(--c${i + 1})` }} />{s.name} <b className="num">{Math.round(s.pct * 100)}%</b></li>)}
          </ul>
        </>
      ) : null}
      <div className="bu-cat-head"><span>Flexible spending</span><span>Spent / target</span><span>Pace</span></div>
      <ul className="bu-cat-list">{rows.map((c) => <CategoryRow key={c.name} c={c} max={max} draw={draw} />)}</ul>
      {v.bills.length ? (
        <details className="bu-bills">
          <summary><CalendarClock aria-hidden className="hd-i" />Bills <span className="hd-faint">kept out of pace. {v.bills.filter((b) => b.status === 'paid').length} paid, {v.bills.filter((b) => b.status === 'upcoming').length} upcoming</span><ChevronDown aria-hidden className="hd-i bu-chev" /></summary>
          <ul>{v.bills.map((b) => (
            <li key={b.name}><span>{b.name}</span><span className="hd-faint">{b.status === 'paid' ? 'Paid' : b.dueIn !== null && b.dueIn < 0 ? `Expected ${-b.dueIn} days ago` : `Due ~${b.due?.slice(5).replace('-', '/')}`}</span><span className="num">{fmt(b.status === 'paid' ? b.paid : b.expected)}</span></li>
          ))}</ul>
        </details>
      ) : null}
    </section>
  );
}

function Accounts({ v }: { v: BudgetData }) {
  const rows = [...v.accounts].filter((a) => a.balance !== 0 || a.change30 !== 0).sort((a, b) => (a.kind === b.kind ? Math.abs(b.balance) - Math.abs(a.balance) : a.kind === 'cash' ? -1 : 1));
  return (
    <section className="hd-panel quiet bu-accts" aria-labelledby="bu-acct-h">
      <div className="hd-ph"><h2 id="bu-acct-h">Accounts</h2><span className="hd-meta">30-day change</span></div>
      <div className="bu-net">
        <div><span>Cash</span><b className="num"><Money cents={v.cash} /></b></div>
        <div><span>Card debt</span><b className="num t-over"><Money cents={v.debt} /></b></div>
        <div><span>Net</span><b className={`num ${v.cash - v.debt < 0 ? 't-over' : ''}`}><Money cents={v.cash - v.debt} /></b></div>
      </div>
      <ul>
        {rows.map((a) => (
          <li key={a.name}>
            <a href={v.actualURL} target="_blank" rel="noreferrer">
              {a.kind === 'cash' ? <Landmark aria-hidden className="hd-i" /> : <CreditCard aria-hidden className="hd-i" />}
              <span className="bu-acct-name">{a.name}</span>
              <span className="num">{fmt(a.balance)}</span>
              <span className={`num bu-chg ${a.change30 === 0 ? '' : a.change30 > 0 ? 't-ok' : 't-over'}`}>{a.change30 === 0 ? '–' : `${a.change30 > 0 ? '+' : '−'}${fmt(Math.abs(a.change30))}`}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BudgetView({ data: v, fetchedAt }: { data: BudgetData; fetchedAt: Date }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const reduce = useReducedMotion();
  const [draw, setDraw] = useState(false);
  useEffect(() => {
    const k = `hd-cats-${v.month}`;
    if (!reduce && !sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); setDraw(true); }
  }, [v.month, reduce]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await fetch('/api/budget/sync', { method: 'POST' });
      if (!r.ok) throw new Error();
      toast.success('Synced from Actual');
      router.refresh();
    } catch {
      toast.error('Sync failed. Showing the last snapshot.');
    } finally { setSyncing(false); }
  }

  const trendNote = (() => {
    const done = v.trend.filter((t) => !t.current);
    const cur = v.trend.find((t) => t.current);
    if (done.length < 1) return 'Trend appears after next month.';
    const avg = done.reduce((s, t) => s + t.spent, 0) / done.length;
    return `${done.length === 1 ? `${done[0].label} was` : `Recent months averaged`} ${fmt(avg)}. ${cur ? `${cur.label} is heading for ${fmt(cur.projection ?? cur.spent)}.` : ''}`;
  })();

  return (
    <main className="hd-page bu">
      <Toaster position="bottom-right" />
      <header className="hd-top">
        <h1>Budget</h1>
        <span className="bu-month">{v.monthLabel}</span>
        <span className="hd-spacer" />
        {v.staleCache || v.syncError ? <span className="hd-chip stale">{v.syncError ? `Last sync failed. Data from ${timeLabel(fetchedAt)}` : `Data from ${timeLabel(fetchedAt)}`}</span>
          : <span className="hd-meta">Synced from Actual at {timeLabel(fetchedAt)}</span>}
        <button className="hd-btn ghost" onClick={sync} disabled={syncing}><RefreshCw aria-hidden className={`hd-i ${syncing ? 'spin' : ''}`} />{syncing ? 'Syncing' : 'Sync now'}</button>
        <a className="hd-btn" href={v.actualURL} target="_blank" rel="noreferrer"><ExternalLink aria-hidden className="hd-i" />Open Actual</a>
      </header>
      <div className="hd-grid">
        <section className="hd-panel s8 bu-month-panel" aria-labelledby="bu-h">
          <h2 id="bu-h" className="hd-sr">This month</h2>
          <Sentence v={v} />
          <p className="bu-basis hd-faint">
            {v.totals.targetSource === 'budget' ? 'Targets are your Actual budgets.' : v.totals.targetSource === 'average' ? 'No budgets are set in Actual, so each target is what you spent last month.' : 'Set budgets in Actual to see pace.'}
            {' '}Bills and card interest are kept out of pace.
          </p>
          <Facts v={v} />
          <BurnUp v={v} />
        </section>
        <WhatToDo v={v} />
        <Categories v={v} draw={draw} />
        <div className="s4 hd-col">
          <section className="hd-panel quiet" aria-labelledby="bu-trend-h">
            <div className="hd-ph"><h2 id="bu-trend-h">Monthly trend</h2><span className="hd-meta">Flexible only</span></div>
            <Trend v={v} />
            <p className="bu-note">{trendNote}</p>
          </section>
          <Accounts v={v} />
        </div>
      </div>
    </main>
  );
}
