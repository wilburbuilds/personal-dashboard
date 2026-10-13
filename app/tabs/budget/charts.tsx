'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import type { BudgetData } from './plugin';
import { fmt, fmtK } from '@/components/home/num';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 640, h: 260 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(260, Math.round(e.contentRect.width)), h: Math.round(e.contentRect.height) }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Plays the authored draw once per browser session. */
function useDrawOnce(key: string) {
  const reduce = useReducedMotion();
  const [draw, setDraw] = useState(false);
  useEffect(() => {
    if (reduce || sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    setDraw(true);
  }, [key, reduce]);
  return draw;
}

const niceMax = (v: number) => {
  const d = v / 100;
  const step = d > 4000 ? 1000 : d > 1500 ? 500 : d > 400 ? 100 : 50;
  return Math.ceil(d / step) * step * 100 || 10000;
};

type Series = 'actual' | 'pace' | 'last' | 'projection';

export function BurnUp({ v }: { v: BudgetData }) {
  const [ref, { w, h: boxH }] = useSize<HTMLDivElement>();
  const draw = useDrawOnce(`hd-burn-${v.month}`);
  const [hidden, setHidden] = useState<Set<Series>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  const b = v.burn;
  const h = Math.max(w < 500 ? 200 : 240, boxH);
  const pad = { l: 44, r: 18, t: 22, b: 26 };
  const lastMax = b.lastMonth.at(-1)?.cumulative ?? 0;
  const actualEnd = b.actual.at(-1)?.cumulative ?? 0;
  const yMax = niceMax(Math.max(b.target, b.projectionEnd, lastMax, actualEnd) * 1.06);
  const x = (d: number) => pad.l + ((d - 1) / (b.days - 1)) * (w - pad.l - pad.r);
  const y = (c: number) => pad.t + (1 - c / yMax) * (h - pad.t - pad.b);
  const line = (pts: { day: number; cumulative: number }[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.cumulative).toFixed(1)}`).join('');
  const actualPath = line(b.actual);
  const area = b.actual.length ? `${actualPath}L${x(b.actual.at(-1)!.day)},${y(0)}L${x(1)},${y(0)}Z` : '';
  const endDay = b.actual.at(-1)?.day ?? 1;
  const projOver = b.target > 0 && b.projectionEnd > b.target;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((yMax * f) / 100) * 100);
  const xTicks = [1, 8, 15, 22, 29].filter((d) => d <= b.days);
  const monthShort = v.monthLabel.slice(0, 3);
  const hp = hover ? { day: hover, a: b.actual.find((p) => p.day === hover), pace: Math.round((b.target * hover) / b.days), last: b.lastMonth.find((p) => p.day === hover) } : null;
  const toggle = (s: Series) => setHidden((old) => { const n = new Set(old); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  const show = (s: Series) => !hidden.has(s);
  const label = `Cumulative flexible spending for ${v.monthLabel}: ${fmt(actualEnd)} through day ${endDay}${b.target ? `, against a ${fmt(b.target)} target. Even pace for today is ${fmt(v.totals.pace)}; projected month end ${fmt(b.projectionEnd)}` : ''}.`;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const d = Math.round(1 + ((e.clientX - r.left - pad.l) / (w - pad.l - pad.r)) * (b.days - 1));
    setHover(d >= 1 && d <= b.days ? d : null);
  }

  return (
    <div className="bu-burn">
      <div className="bu-legend" role="group" aria-label="Series">
        {([['actual', monthShort], ['projection', 'Projection'], ['pace', 'Even pace'], ['last', 'Last month']] as [Series, string][]).map(([s, l]) => (
          <button key={s} aria-pressed={show(s)} onClick={() => toggle(s)} className={`lg-${s}`}><i />{l}</button>
        ))}
      </div>
      <div className="bu-plot" ref={ref}>
      <svg width={w} height={h} role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="bu-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--viz-1)" stopOpacity=".28" /><stop offset="1" stopColor="var(--viz-1)" stopOpacity="0" /></linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}><line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} className="bu-grid" /><text x={pad.l - 8} y={y(t) + 4} className="bu-axis" textAnchor="end">{fmtK(t)}</text></g>
        ))}
        {xTicks.map((d) => <text key={d} x={x(d)} y={h - 6} className="bu-axis" textAnchor="middle">{monthShort} {d}</text>)}
        {b.target > 0 ? (
          <g><line x1={pad.l} x2={w - pad.r} y1={y(b.target)} y2={y(b.target)} className="bu-cap" />
            <text x={pad.l + 6} y={y(b.target) - 6} className="bu-cap-label">Target {fmt(b.target)}</text></g>
        ) : null}
        {show('last') && b.lastMonth.length ? <path d={line(b.lastMonth.filter((p) => p.day <= b.days))} className="bu-last" /> : null}
        {show('pace') && b.target > 0 ? <line x1={x(1)} y1={y(b.target / b.days)} x2={x(b.days)} y2={y(b.target)} className="bu-pace" /> : null}
        <line x1={x(b.today)} x2={x(b.today)} y1={pad.t - 6} y2={h - pad.b} className="bu-now" />
        {show('actual') && area ? <motion.path d={area} fill="url(#bu-fill)" initial={draw ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.36 }} /> : null}
        {show('actual') && actualPath ? (
          <motion.path d={actualPath} className="bu-actual" initial={draw ? { pathLength: 0 } : false} animate={{ pathLength: 1 }} transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }} />
        ) : null}
        {show('projection') && b.actual.length && endDay < b.days ? (
          <motion.line x1={x(endDay)} y1={y(actualEnd)} x2={x(b.days)} y2={y(b.projectionEnd)} className={projOver ? 'bu-proj over' : 'bu-proj'}
            initial={draw ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 1 }} transition={{ delay: draw ? 0.36 : 0, duration: 0.36 }} />
        ) : null}
        {show('projection') && b.actual.length ? (
          <text x={x(b.days)} y={y(b.projectionEnd) - 10} textAnchor="end" className={projOver ? 'bu-proj-label over' : 'bu-proj-label'}>On track for {fmt(b.projectionEnd)}</text>
        ) : null}
        {show('actual') && b.actual.length ? <circle cx={x(endDay)} cy={y(actualEnd)} r={4} className="bu-dot" /> : null}
        {hp ? <line x1={x(hp.day)} x2={x(hp.day)} y1={pad.t} y2={h - pad.b} className="bu-scrub" /> : null}
      </svg>
      {hp ? (
        <div className="bu-tip" style={{ left: Math.min(Math.max(x(hp.day) - 80, 0), w - 170) }}>
          <strong>{monthShort} {hp.day}</strong>
          {hp.a ? <><span>Spent that day <b>{fmt(hp.a.spentToday)}</b></span><span>So far <b>{fmt(hp.a.cumulative)}</b></span></> : <span className="hd-faint">{hp.day > b.today ? 'Still ahead' : 'Not imported yet'}</span>}
          {b.target ? <span>Pace <b>{fmt(hp.pace)}</b></span> : null}
          {hp.last ? <span>Last month <b>{fmt(hp.last.cumulative)}</b></span> : null}
        </div>
      ) : null}
      </div>
      <table className="hd-sr"><caption>Daily cumulative spending</caption><thead><tr><th>Day</th><th>Cumulative</th></tr></thead>
        <tbody>{b.actual.map((p) => <tr key={p.day}><td>{p.day}</td><td>{fmt(p.cumulative)}</td></tr>)}</tbody></table>
      {b.actual.every((p) => p.cumulative === 0) ? <p className="bu-note">Nothing spent yet in {v.monthLabel.split(' ')[0]}.</p> : null}
    </div>
  );
}

export function Trend({ v }: { v: BudgetData }) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const h = 150;
  const rows = v.trend;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.spent, r.target, r.projection ?? 0))) * 1.1);
  const bw = Math.min(46, (w - 20) / rows.length - 14);
  const gap = (w - bw * rows.length) / (rows.length + 1);
  const y = (c: number) => 18 + (1 - c / max) * (h - 40);
  const label = rows.map((r) => `${r.label} ${fmt(r.spent)}${r.target ? ` of ${fmt(r.target)}` : ''}`).join(', ');
  return (
    <div ref={ref} className="bu-trend">
      <svg width={w} height={h} role="img" aria-label={`Flexible spending by month: ${label}`}>
        {rows.map((r, i) => {
          const x0 = gap + i * (bw + gap);
          const over = r.target > 0 && r.spent > r.target;
          return (
            <g key={r.month}>
              {r.current && r.projection ? <rect x={x0} y={y(r.projection)} width={bw} height={y(0) - y(r.projection)} className="bu-trend-proj" rx={4} /> : null}
              <rect x={x0} y={y(r.spent)} width={bw} height={Math.max(1, y(0) - y(r.spent))} rx={4} className={r.current ? 'bu-bar cur' : over ? 'bu-bar over' : 'bu-bar'} />
              {r.target ? <line x1={x0 - 4} x2={x0 + bw + 4} y1={y(r.target)} y2={y(r.target)} className="bu-trend-target" /> : null}
              <text x={x0 + bw / 2} y={y(Math.max(r.spent, r.projection ?? 0)) - 6} textAnchor="middle" className="bu-axis strong">{r.current && r.projection ? `~${fmtK(r.projection)}` : fmtK(r.spent)}</text>
              <text x={x0 + bw / 2} y={h - 4} textAnchor="middle" className="bu-axis">{r.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
