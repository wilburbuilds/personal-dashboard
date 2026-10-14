'use client';
import { useEffect, useState } from 'react';
import { ChevronDown, CircleAlert } from 'lucide-react';
import Link from 'next/link';
import type { Quote, QuoteResult } from '@/lib/quotes.mjs';

type Macro = QuoteResult & { label: string; kind: 'price' | 'yield' };
type Data = { fetchedAt: string | null; macro: Macro[]; tickers: QuoteResult[] };
const OPEN_KEY = 'hd-today-tickers-open';
const TZ = 'America/Los_Angeles';
const clock = (d: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: TZ }).format(new Date(d));
const fmt = (n: number, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (n: number, d = 2, suf = '') => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n), d)}${suf}`;
const isQ = (q: QuoteResult | undefined): q is Quote => !!q && !('error' in q);

/** Day moves only: price, change and percent for the macro row and the watch list. Loads after the page, polls every 60 s. */
export function Markets({ shown, tickerCount }: { shown: number; tickerCount: number }) {
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () => fetch('/api/quotes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: Data) => { if (live) { setD(j); setFailed(false); setOpen(localStorage.getItem(OPEN_KEY) === '1'); } }).catch(() => { if (live) setFailed(true); });
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { live = false; clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  const list = d?.tickers ?? [];
  const n = d ? list.length : tickerCount;
  return (
    <section className="t2-sec" aria-labelledby="h-mk" aria-busy={!d}>
      <div className="sh"><h2 id="h-mk">Markets</h2>
        <span className="m">{d?.fetchedAt ? <time dateTime={d.fetchedAt} title="Time of the last quote fetch (refreshes every minute)">Quotes {clock(d.fetchedAt)} PT</time> : failed ? 'Quotes unavailable' : 'Loading quotes'}</span>
      </div>
      {failed && !d ? <p className="t2-note"><CircleAlert aria-hidden />Couldn’t reach the quote service. Retrying every minute.</p> : null}
      <div className="t2-mk mk3 num">
        {(d?.macro ?? [null, null, null]).map((m, i) => <MacroCell key={m?.symbol ?? i} m={m} />)}
      </div>
      {n ? (
        <div className="t2-pos">
          <div className="t2-posh"><h3>Watch list</h3><span className="t2-sync">Day move</span></div>
          <div id="t2-tk-list">
            {d ? list.map((q, i) => (i < shown || open ? <Row key={q.symbol} q={q} extra={i >= shown} /> : null))
              : Array.from({ length: Math.min(n, shown) }, (_, i) => <div key={i} className="t2-ps"><span className="hd-skel" style={{ height: 30, gridColumn: '1 / -1' }} /></div>)}
          </div>
          {d && list.length > shown ? (
            <button type="button" className="t2-more" aria-expanded={open} aria-controls="t2-tk-list" onClick={() => { const v = !open; setOpen(v); localStorage.setItem(OPEN_KEY, v ? '1' : '0'); }}>
              <ChevronDown aria-hidden className={open ? 'up' : ''} />{open ? 'Show fewer' : `Show ${list.length - shown} more`}
            </button>
          ) : null}
        </div>
      ) : <p className="t2-empty">Add tickers to watch in <Link href="/t/settings#st-today" className="t2-link">Settings › Today</Link>.</p>}
    </section>
  );
}

function MacroCell({ m }: { m: Macro | null }) {
  if (!m) return <div><div className="k"><span className="hd-skel" style={{ width: 70, height: 12 }} /></div><div className="mkv"><span className="hd-skel" style={{ width: 90, height: 20 }} /></div></div>;
  if (!isQ(m)) return <div><div className="k">{m.label}</div><div className="mkv hd-faint">—</div></div>;
  const up = (m.change ?? 0) >= 0, cls = up ? 'up-t' : 'dn-t';
  const val = m.kind === 'yield' ? `${fmt(m.price, 3)}%` : m.symbol === 'CL=F' ? `$${fmt(m.price)}` : fmt(m.price);
  const chg = m.kind === 'yield' ? (m.change == null ? '—' : `${signed(m.change * 100, 0)} bp`) : (m.pct == null ? '—' : signed(m.pct, 2, '%'));
  return <div title={m.stale ? 'Last good quote; refresh failed' : m.name}><div className="k">{m.label}</div><div className="mkv">{val}<span className={cls}>{chg}</span>{m.stale ? <small className="mk-stale">stale</small> : null}</div></div>;
}

function Row({ q, extra }: { q: QuoteResult; extra: boolean }) {
  if (!isQ(q)) return <div className={`t2-ps num${extra ? ' t2-extra' : ''}`}><div><b>{q.symbol}</b><small>No quote</small></div><span /><span className="r hd-faint">—</span><span className="r hd-faint">—</span></div>;
  const up = (q.change ?? 0) >= 0, color = up ? 'var(--viz-ok)' : 'var(--viz-over)', cls = `r ${up ? 'up-t' : 'dn-t'}`;
  return (
    <div className={`t2-ps num${extra ? ' t2-extra' : ''}`} title={q.stale ? 'Last good quote; refresh failed' : undefined}>
      <div><b>{q.symbol}</b><small>{q.name}</small></div>
      {q.spark ? (
        <svg viewBox="0 0 84 32" width="60" height="28" aria-hidden="true" preserveAspectRatio="none">
          {q.spark.priorY != null ? <line x1="4" x2="80" y1={q.spark.priorY} y2={q.spark.priorY} stroke="var(--text-3)" strokeDasharray="1.5 2.5" strokeWidth="1" /> : null}
          <polyline points={q.spark.points} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : <span />}
      <span className="r">{fmt(q.price)}</span>
      <span className={cls}>{q.pct == null ? '—' : signed(q.pct, 2, '%')}<small>{q.change == null ? '' : signed(q.change)}</small></span>
    </div>
  );
}
