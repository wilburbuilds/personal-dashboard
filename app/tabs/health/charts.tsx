import type { Stage } from '@/lib/health-data.mjs';

/** Hand-built SVG charts for Health (Recharts can't draw a stage-lane chart well). Server-rendered. */
const TZ = 'America/Los_Angeles';
const hour = (iso: string | number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
const hourOnly = (ms: number) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: TZ }).format(new Date(ms));
export const hm = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
export const clock = hour;

const LANES = ['AWAKE', 'REM', 'LIGHT', 'DEEP'] as const;
const NAMES: Record<string, string> = { AWAKE: 'Awake', REM: 'REM', LIGHT: 'Light', DEEP: 'Deep' };
const COLORS: Record<string, string> = { AWAKE: 'var(--stage-awake)', REM: 'var(--stage-rem)', LIGHT: 'var(--stage-light)', DEEP: 'var(--stage-deep)' };
export const stageColor = COLORS;
export const stageName = NAMES;

export function Hypnogram({ stages, start, end, W, H, compact = false, label }: { stages: Stage[]; start: string; end: string; W: number; H: number; compact?: boolean; label: string }) {
  const t0 = Date.parse(start), t1 = Date.parse(end);
  const L = 56, R = 6, T = 6, B = 22, w = W - L - R, lh = (H - T - B) / 4;
  const x = (ms: number) => L + ((ms - t0) / (t1 - t0 || 1)) * w;
  const lane = (s: string) => Math.max(0, LANES.indexOf(s as (typeof LANES)[number]));
  const ticks: [string, number][] = [[hour(t0), t0]];
  const step = compact ? 3 : 2;
  const first = new Date(t0); first.setMinutes(0, 0, 0);
  for (let t = first.getTime() + 3600e3; t < t1 - 40 * 60e3; t += 3600e3) {
    const h = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date(t)));
    if (h % step === 0 && t - t0 > 40 * 60e3) ticks.push([hourOnly(t), t]);
  }
  ticks.push([hour(t1), t1]);
  const sorted = [...stages].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <svg className="hyp" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label} preserveAspectRatio="xMinYMin meet">
      {LANES.map((s, k) => (
        <g key={s}>
          <text x="0" y={T + k * lh + lh / 2 + 4} className="ax">{NAMES[s]}</text>
          <line x1={L} x2={W - R} y1={T + k * lh + lh} y2={T + k * lh + lh} className="gl" opacity=".5" />
        </g>
      ))}
      <g className="hyp-draw">
        {sorted.map((s, i) => {
          const a = Date.parse(s.start), b = Date.parse(s.end);
          const prev = sorted[i - 1];
          return (
            <g key={i}>
              {prev ? <line x1={x(a)} x2={x(a)} y1={T + lane(prev.type) * lh + lh / 2} y2={T + lane(s.type) * lh + lh / 2} stroke="var(--border-strong)" strokeWidth="1" /> : null}
              <rect x={x(a)} y={T + lane(s.type) * lh + 3} width={Math.max(1.5, x(b) - x(a))} height={lh - 6} rx="2" fill={COLORS[s.type] ?? 'var(--text-3)'} />
            </g>
          );
        })}
      </g>
      {ticks.map(([l, t], k) => <text key={k} x={x(t)} y={H - 5} className="ax" textAnchor={k === 0 ? 'start' : k === ticks.length - 1 ? 'end' : 'middle'}>{l}</text>)}
    </svg>
  );
}

export function MiniLine({ series, avg, W = 118, H = 30 }: { series: (number | null)[]; avg: number | null; W?: number; H?: number }) {
  const v = series.filter((n): n is number => n !== null);
  if (v.length < 2) return <svg width={W} height={H} aria-hidden="true" />;
  const mn = Math.min(...v, avg ?? Infinity), mx = Math.max(...v, avg ?? -Infinity);
  const y = (n: number) => H - 3 - ((n - mn) / (mx - mn || 1)) * (H - 6);
  const xx = (k: number) => 3 + (k * (W - 6)) / (series.length - 1);
  const segs: string[][] = [];
  let cur: string[] = [];
  series.forEach((n, k) => { if (n === null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${xx(k).toFixed(1)},${y(n).toFixed(1)}`); });
  if (cur.length) segs.push(cur);
  const lastK = series.length - 1;
  const last = series[lastK];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {avg !== null ? <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} stroke="var(--text-3)" strokeDasharray="2 3" opacity=".7" /> : null}
      {segs.map((s, i) => s.length > 1 ? <polyline key={i} points={s.join(' ')} fill="none" stroke="var(--viz-1)" strokeWidth="1.6" strokeLinejoin="round" /> : <circle key={i} cx={s[0].split(',')[0]} cy={s[0].split(',')[1]} r="1.6" fill="var(--viz-1)" />)}
      {last !== null ? <circle cx={xx(lastK)} cy={y(last)} r="3" fill="var(--viz-1)" /> : null}
    </svg>
  );
}

export function DailyBars({ values, days, W, H, fmt, color = 'var(--viz-1)', label }: { values: (number | null)[]; days: string[]; W: number; H: number; fmt: (n: number) => string; color?: string; label: string }) {
  const B = 18, T = 14, h = H - T - B;
  const mx = Math.max(1, ...values.filter((n): n is number => n !== null)) * 1.12;
  const bw = W / values.length;
  const n = values.length - 1;
  const lab = (d: string) => { const [, m, dd] = d.split('-').map(Number); return dd === 1 || d === days[0] ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${dd}` : String(dd); };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {values.map((v, k) => {
        const x = k * bw + bw * 0.18, ww = bw * 0.64;
        const y = v === null ? 0 : T + h - (v / mx) * h;
        return (
          <g key={k}>
            {v === null
              ? <rect x={x} y={T + h - 2} width={ww} height="2" fill="var(--border-strong)" />
              : <rect className="bar" x={x} y={y} width={ww} height={T + h - y} rx="2" fill={color} opacity={k === n ? 1 : 0.55} />}
            {(n - k) % 3 === 0 ? <text x={x + ww / 2} y={H - 4} className="ax" textAnchor="middle">{lab(days[k])}</text> : null}
            {k === n && v !== null ? <text x={x + ww / 2} y={y - 4} className="ax strong" textAnchor="middle">{fmt(v)}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export function ActivityStrip({ blocks, nowMin, W, label }: { blocks: number[]; nowMin: number | null; W: number; label: string }) {
  const bw = W / 96;
  const fill = ['transparent', 'var(--lvl-sed)', 'var(--lvl-light)', 'var(--lvl-mod)', 'var(--lvl-vig)'];
  const nowK = nowMin === null ? 96 : Math.floor(nowMin / 15);
  const ticks: [string, number][] = [['12 AM', 0], ['6 AM', 24], ['12 PM', 48], ['6 PM', 72], ['12 AM', 96]];
  return (
    <svg viewBox={`0 0 ${W} 44`} width="100%" role="img" aria-label={label}>
      {blocks.map((b, k) => (
        <rect key={k} x={k * bw + 0.5} y="4.5" width={Math.max(0.5, bw - 1.5)} height="21" rx="1.5"
          fill={k > nowK ? 'transparent' : fill[b]} stroke={k > nowK ? 'var(--border)' : b === 0 ? 'var(--border)' : 'none'} strokeOpacity={k > nowK ? 1 : 0.5} />
      ))}
      {ticks.map(([l, k], j) => <text key={j} x={k * bw} y="40" className="ax" textAnchor={j === 0 ? 'start' : j === 4 ? 'end' : 'middle'}>{l}</text>)}
      {nowMin !== null ? <line x1={(nowMin / 15) * bw} x2={(nowMin / 15) * bw} y1="0" y2="30" stroke="var(--pace)" strokeWidth="1.5" /> : null}
    </svg>
  );
}
