import Link from 'next/link';
import { ArrowLeft, CircleCheck, CircleDot, Circle, CircleX, CircleDashed, Watch, TriangleAlert, FileText } from 'lucide-react';
import type { HealthData } from './plugin';
import { Hypnogram, MiniLine, DailyBars, ActivityStrip, hm, clock, stageColor, stageName } from './charts';
import { MarkdownNote } from '@/components/home/markdown';
import { CollapseOnPhone } from '@/components/home/collapse-on-phone';
import type { Signal } from '@/lib/health-data.mjs';
import type { Workouts, WeekDay } from '@/lib/workouts.mjs';

const TZ = 'America/Los_Angeles';
const shortDate = (day: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));
const fmt = (n: number | null, dp = 0) => (n === null ? '—' : n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
const nowMinute = (iso: string) => { const p = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: TZ }).formatToParts(new Date(iso)); return Number(p[0].value) * 60 + Number(p[2].value); };

function SubNav({ view }: { view: HealthData['view'] }) {
  return (
    <nav className="subnav" aria-label="Health views">
      <Link href="/t/health" aria-current={view === 'overview' ? 'page' : undefined}>Overview</Link>
      <Link href="/t/health?view=workouts" aria-current={view === 'workouts' ? 'page' : undefined}>Workouts</Link>
    </nav>
  );
}

export default function HealthView({ data }: { data: HealthData; fetchedAt: Date }) {
  const c = data.overview?.current;
  const meta = data.view === 'overview' && c?.device
    ? `${c.device.name} synced ${c.device.lastSync ? clock(c.device.lastSync) : 'time unknown'}${c.device.battery !== null ? `, battery ${c.device.battery}%` : ''}`
    : null;
  return (
    <main className="hd-page he">
      <header className="hd-top he-top">
        <h1>Health</h1>
        <span className="hd-spacer" />
        {meta ? <span className="hd-meta he-sync">{meta}</span> : null}
      </header>
      <SubNav view={data.view} />
      {data.view === 'overview' ? <Overview data={data} /> : data.view === 'workouts' ? <WorkoutsView data={data} /> : <NoteView data={data} />}
    </main>
  );
}

/* ---------- Overview ---------- */

function delta(sig: Signal, dp: number, good: 'lower' | 'higher' | '') {
  if (sig.now === null || sig.avg === null) return { text: 'No 14-day average yet', tone: 'faint' };
  const d = sig.now - sig.avg;
  const tone = Math.abs(d) < 10 ** -dp / 2 ? 'faint' : good === 'lower' ? (d < 0 ? 'up-t' : 'dn-t') : good === 'higher' ? (d > 0 ? 'up-t' : 'dn-t') : 'faint';
  return { text: `${d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(dp)} vs 14-day avg`, tone };
}

function Overview({ data }: { data: HealthData }) {
  const o = data.overview!;
  const c = o.current;
  if (!c) return <p className="hd-empty">No Fitbit exports found in fitness/fitbit-air/raw yet.</p>;
  const s = c.sleep;
  const F = data.tempUnit === 'F';
  const tempSig: Signal = F ? { series: o.signals.tempDeltaC.series.map((v) => (v === null ? null : v * 1.8)), avg: o.signals.tempDeltaC.avg === null ? null : o.signals.tempDeltaC.avg * 1.8, now: o.signals.tempDeltaC.now === null ? null : o.signals.tempDeltaC.now * 1.8 } : o.signals.tempDeltaC;
  const rhr = o.signals.rhr;
  const rhrWord = rhr.now === null || rhr.avg === null ? '' : rhr.now - rhr.avg < -1 ? ', a little under your two-week average' : rhr.now - rhr.avg > 1 ? ', above your two-week average' : ', right at your two-week average';
  const deep = s?.stagesSummary.DEEP?.minutes ?? null;
  const sigs: [string, Signal, string, number, 'lower' | 'higher' | '', (n: number) => string][] = [
    ['Resting heart rate', rhr, 'bpm', 1, 'lower', (n) => fmt(n)],
    ['Heart rate variability', o.signals.hrv, 'ms', 1, 'higher', (n) => fmt(n, 1)],
    ['Breathing rate', o.signals.breathing, '/min', 1, '', (n) => fmt(n, 1)],
    ['Blood oxygen', o.signals.spo2, '% avg', 1, '', (n) => fmt(n)],
    ['Skin temperature', tempSig, `°${data.tempUnit} vs baseline`, F ? 1 : 2, '', (n) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(F ? 1 : 2)}`],
  ];
  const total = s ? Object.values(s.stagesSummary).reduce((a, b) => a + b.minutes, 0) || 1 : 1;
  const stamp = c.fetchedAt ? clock(c.fetchedAt) : null;
  const nowMin = o.isToday ? nowMinute(data.now) : null;
  const missingNote = o.missing.length ? `${listDays(o.missing)} ${o.missing.length === 1 ? 'has' : 'have'} no Fitbit data.` : null;
  const stagesLabel = s ? `Sleep stages from ${s.start ? clock(s.start) : ''} to ${s.end ? clock(s.end) : ''}: ${['DEEP', 'LIGHT', 'REM', 'AWAKE'].map((k) => `${stageName[k]} ${hm(s.stagesSummary[k]?.minutes ?? 0)}`).join(', ')}.` : '';
  return (
    <>
      {!o.isToday ? <p className="warnl"><TriangleAlert aria-hidden />No export for today yet. Showing {shortDate(o.latestDay!)}.</p> : null}
      <p className="lead">
        {s?.asleep != null ? <>Slept <b>{hm(s.asleep)}</b>{deep !== null ? <> with {hm(deep)} deep</> : null}. </> : <>No main sleep recorded last night. </>}
        {rhr.now !== null ? <>Resting heart rate is <b>{rhr.now}</b>{rhrWord}.</> : null}
      </p>
      <div className="hgrid2">
        <div className="hd-col">
          <section className="hd-panel" aria-labelledby="h-sl">
            <div className="hd-ph"><h2 id="h-sl">Last night</h2>{s?.start && s.end ? <span className="hd-meta num">{clock(s.start)} to {clock(s.end)}</span> : null}</div>
            {s && s.start && s.end && s.stages.length ? (
              <>
                <div className="only-wide"><Hypnogram stages={s.stages} start={s.start} end={s.end} W={700} H={150} label={stagesLabel} /></div>
                <div className="only-narrow"><Hypnogram stages={s.stages} start={s.start} end={s.end} W={340} H={130} compact label={stagesLabel} /></div>
                <table className="hd-sr"><caption>Sleep stages</caption><tbody>{s.stages.map((st, i) => <tr key={i}><td>{stageName[st.type]}</td><td>{clock(st.start)}</td><td>{clock(st.end)}</td></tr>)}</tbody></table>
                <div className="stg num">
                  {['DEEP', 'LIGHT', 'REM', 'AWAKE'].map((k) => {
                    const m = s.stagesSummary[k]?.minutes ?? 0;
                    return <div key={k}><span className="k"><span className="sw" style={{ background: stageColor[k] }} />{stageName[k]}</span><b>{k === 'AWAKE' ? `${m} min` : hm(m)}<span className="p">{Math.round((m / total) * 100)}%</span></b></div>;
                  })}
                </div>
                <div className="facts num">
                  <Fact k="Asleep" v={s.asleep !== null ? hm(s.asleep) : '—'} />
                  <Fact k="In bed" v={s.inBed !== null ? hm(s.inBed) : '—'} />
                  <Fact k="Fell asleep in" v={s.toFallAsleep !== null ? `${s.toFallAsleep} min` : '—'} />
                  <Fact k="Short awakenings" v={fmt(s.shortAwakenings)} />
                </div>
              </>
            ) : <p className="empty">No sleep stages in this export.</p>}
          </section>
          <section className="hd-panel" aria-labelledby="h-act">
            <div className="hd-ph"><h2 id="h-act">{o.isToday ? 'Today so far' : shortDate(o.latestDay!)}</h2>{stamp ? <span className="hd-meta num">as of {stamp}</span> : null}</div>
            <div className="act num">
              <Fact k="Steps" v={fmt(c.steps)} />
              <Fact k="Distance" v={c.distanceMi === null ? '—' : c.distanceMi.toFixed(c.distanceMi < 10 ? 1 : 0)} u="mi" />
              <Fact k="Active minutes" v={fmt(c.activeMinutes)} />
              <Fact k="Sedentary" v={c.sedentaryMin === null ? '—' : hm(c.sedentaryMin)} />
              <Fact k="Calories" v={fmt(c.calories)} u={c.activeCalories !== null ? `${fmt(c.activeCalories)} active` : undefined} />
            </div>
            <div className="only-wide"><ActivityStrip blocks={c.strip} nowMin={nowMin} W={700} label="Activity level through the day so far, in 15-minute blocks." /></div>
            <div className="only-narrow"><ActivityStrip blocks={c.strip} nowMin={nowMin} W={340} label="Activity level through the day so far, in 15-minute blocks." /></div>
            <div className="lg">
              <span><i style={{ background: 'var(--lvl-sed)' }} />Sedentary</span><span><i style={{ background: 'var(--lvl-light)' }} />Lightly active</span>
              <span><i style={{ background: 'var(--lvl-mod)' }} />Moderately active</span><span><i style={{ background: 'var(--lvl-vig)' }} />Very active</span>
              {c.hrAvg !== null ? <span className="num">Avg heart rate {Math.round(c.hrAvg)}{c.hrMin !== null && c.hrMax !== null ? `, range ${c.hrMin} to ${c.hrMax}` : ''}</span> : null}
            </div>
            {c.strip.filter(Boolean).length < 16 ? <p className="sub2">Fitbit sent activity levels for only part of the day; blank blocks have no reading yet.</p> : null}
          </section>
        </div>
        <div className="hd-col">
          <section className="hd-panel" aria-labelledby="h-sig">
            <div className="hd-ph"><h2 id="h-sig">Overnight signals</h2><span className="hd-meta">{o.days.length} days</span></div>
            {sigs.map(([name, sig, unit, dp, good, f]) => {
              const d = delta(sig, dp, good);
              return (
                <div className="sg" key={name}>
                  <div><div className="k">{name}</div><div className="v num">{sig.now === null ? '—' : f(sig.now)}<small>{unit}</small></div></div>
                  <div className="sgr"><MiniLine series={sig.series} avg={sig.avg} /><span className={`num ${d.tone}`}>{d.text}</span></div>
                </div>
              );
            })}
          </section>
          <section className="hd-panel quiet" aria-labelledby="h-tr">
            <div className="hd-ph"><h2 id="h-tr">Two weeks</h2></div>
            <div className="k">Sleep, hours</div>
            <DailyBars values={o.sleepHours} days={o.days} W={316} H={96} fmt={(n) => n.toFixed(1)} label={`Hours asleep, last ${o.days.length} days. Flat marks are days with no Fitbit data.`} />
            <div className="k" style={{ marginTop: 14 }}>Steps</div>
            <DailyBars values={o.steps} days={o.days} W={316} H={96} fmt={(n) => `${(n / 1000).toFixed(1)}k`} color="var(--viz-ok)" label={`Daily steps, last ${o.days.length} days. Flat marks are days with no Fitbit data.`} />
            {missingNote ? <p className="sub2">{missingNote}</p> : null}
          </section>
        </div>
      </div>
    </>
  );
}

function listDays(days: string[]) {
  // Collapse consecutive days into ranges: "Oct 8–9 and Oct 3".
  const out: string[] = [];
  let a = days[0], b = days[0];
  const next = (d: string) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  for (const d of [...days.slice(1), '']) {
    if (d && d === next(b)) { b = d; continue; }
    out.push(a === b ? shortDate(a) : `${shortDate(a)}–${b.slice(8).replace(/^0/, '')}`);
    a = b = d;
  }
  return out.length > 1 ? `${out.slice(0, -1).join(', ')} and ${out.at(-1)}` : out[0];
}

function Fact({ k, v, u }: { k: string; v: string; u?: string }) {
  return <div><div className="k">{k}</div><div className="v">{v}{u ? <small>{u}</small> : null}</div></div>;
}

/* ---------- Workouts ---------- */

const ST: Record<WeekDay['status'], [typeof Circle | null, string, string]> = {
  done: [CircleCheck, 'Done', 'st-ok'], today: [CircleDot, 'Tonight', 'st-today'], planned: [Circle, 'Planned', 'faint'],
  unlogged: [CircleDashed, 'Not logged', 'faint'], notdone: [CircleX, 'Not done', 'st-miss'], before: [Circle, 'Planned', 'faint'], off: [null, '', ''],
};

function WorkoutsView({ data }: { data: HealthData }) {
  const w = data.workouts!;
  if (!w.found?.program) return <p className="hd-empty">fitness/current-program.md was not found in personal.</p>;
  const t = w.tonight;
  const morning = !!t?.time && /AM$/.test(t.time);
  const dur = t?.duration ? (t.duration.length > 1 ? `${t.duration[0]} to ${t.duration[1]} minutes` : `about ${t.duration[0]} minutes`) : null;
  const rangeTime = t?.rawTime && /–/.test(t.rawTime) ? t.rawTime.replace(/\s*\(.*\)/, '').replace(/(\d)(am|pm)/gi, (_, d, ap) => `${d} ${ap.toUpperCase()}`).replace('–', ' to ') : t?.time;
  const sessionWord = (s: string) => /push/i.test(s) ? 'push day' : /pull/i.test(s) ? 'pull day' : /lower/i.test(s) ? 'lower-body day' : /squat|deadlift/i.test(s) ? 'squat and deadlift day' : s;
  const fitbitRows = (data.overview?.exercises ?? []).map((e) => ({ date: e.day, session: e.name, results: [e.minutes ? `${e.minutes} min` : '', e.distanceMi ? `${e.distanceMi.toFixed(1)} mi` : '', e.avgHr ? `avg HR ${Math.round(e.avgHr)}` : ''].filter(Boolean).join(', '), notes: 'Detected by Fitbit', state: 'fitbit' as const }));
  const rows = [...w.log.map((r) => ({ ...r, state: r.state as string })), ...fitbitRows.filter((f) => !w.log.some((r) => r.date === f.date && /walk|bike|run/i.test(r.session)))]
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const phaseName = w.phase?.replace(/:\s*Phase\s*\d.*$/i, '').trim();
  const phaseNo = /Phase\s*(\d+)/i.exec(w.phase ?? '')?.[1];
  const dayFrac = w.start ? Math.min(1, Math.max(0, ((Date.parse(w.today) - Date.parse(w.start)) / 864e5 % 7 + 1) / 7)) : 0;
  return (
    <>
      <p className="lead">
        {w.weekNo && w.weeksTotal ? <>Week {w.weekNo} of {w.weeksTotal} in {phaseName}. </> : phaseName ? <>{phaseName}. </> : null}
        {t ? <><b>{morning ? 'Today' : 'Tonight'} is {sessionWord(t.title)}</b>{dur ? <>, {dur}</> : null}.</> : w.next ? <>Rest today. Next up is {sessionWord(w.next.session)} on {w.next.day}{w.next.time ? ` at ${w.next.time}` : ''}.</> : <>Rest today.</>}
      </p>
      {w.stale ? <p className="warnl"><TriangleAlert aria-hidden />Nothing logged since {shortDate(w.newestLog!)}.</p> : null}
      <p className="k wk-note">This week.{w.usualTime ? ` Weeknight sessions start at ${w.usualTime}.` : ''}</p>
      <section className="wk" aria-label={`This week, ${shortDate(w.week[0].date)} to ${shortDate(w.week[6].date)}`}>
        {w.week.map((d) => {
          const [Icon, label, cls] = ST[d.status];
          const lab = d.status === 'today' && d.time && /AM$/.test(d.time) ? 'Today' : label;
          return (
            <div key={d.day} className={`wd ${d.rest ? 'off' : ''} ${d.status === 'today' ? 'today' : ''}`} aria-current={d.date === w.today ? 'date' : undefined}>
              <span className="dn"><b>{d.day}</b> {Number(d.date.slice(8))}</span>
              <span className="sn">{d.session.replace(/\s*\((knee-friendly)\)/, '')}</span>
              {d.timeDiffers || d.status === 'today' ? <span className="tm num">{d.time}</span> : null}
              {Icon ? <span className={`stt ${cls}`}><Icon aria-hidden /><span>{lab}</span></span> : null}
            </div>
          );
        })}
      </section>
      <CollapseOnPhone />
      <div className="wg">
        <section className="hd-panel" aria-labelledby="h-se">
          {t ? (
            <>
              <div className="hd-ph"><h2 id="h-se">{morning ? 'Today' : 'Tonight'}: {t.title}</h2>{rangeTime ? <span className="hd-meta num">{rangeTime}</span> : null}</div>
              {t.knee.rows.length ? (
                <details className="kb" open data-collapse-phone="">
                  <summary><h3 className="blk">Knee block <span>{t.knee.rows.length} exercises{t.knee.minutes ? `, about ${t.knee.minutes} min` : ''}, every training day</span></h3></summary>
                  <SessionTable rows={t.knee.rows} />
                </details>
              ) : null}
              <h3 className="blk">Main</h3>
              {t.main.length ? <SessionTable rows={t.main} /> : <p className="empty">This session has no exercise table in current-program.md.</p>}
              <div className="rules">
                <span><b>2–3 reps in reserve.</b> Nothing to failure.</span>
                <span><b>Sharp pain:</b> stop the exercise.</span>
              </div>
            </>
          ) : (
            <>
              <div className="hd-ph"><h2 id="h-se">Rest day</h2></div>
              <p className="empty">No session today.{w.next ? <small>Next: {w.next.session}, {w.next.day} {Number(w.next.date.slice(8))}{w.next.time ? ` at ${w.next.time}` : ''}.</small> : null}</p>
            </>
          )}
        </section>
        <div className="hd-col">
          <section className="hd-panel" aria-labelledby="h-lg">
            <div className="hd-ph"><h2 id="h-lg">Training log</h2><Link className="hd-meta he-link" href="/t/health?view=note&path=training-log.md">Open note</Link></div>
            {rows.length ? rows.map((r) => {
              const miss = r.state === 'missed' || r.state === 'skipped';
              return (
                <div className="lgi" key={r.date + r.session}>
                  <span className="dt num">{shortDate(r.date)}</span>
                  <div>
                    <b>{cap(r.session.replace(/:\s*NOT DONE$/i, '').replace(/^Skipped \((.+)\)$/, '$1'))}{miss ? <span className="st-miss" title={r.state === 'missed' ? 'Not done' : 'Skipped'}><CircleX aria-label={r.state === 'missed' ? 'Not done' : 'Skipped'} /></span> : r.state === 'fitbit' ? <span className="faint"><Watch aria-label="Detected by Fitbit" /></span> : null}</b>
                    {r.results ? <MarkdownNote body={r.results} refs={w.refs} compact settings={data.md} /> : miss ? <p>{r.state === 'missed' ? 'Not done' : 'Skipped'}</p> : null}
                    {r.notes ? <MarkdownNote body={r.notes} refs={w.refs} compact settings={data.md} className="note" /> : null}
                  </div>
                </div>
              );
            }) : <p className="empty">No sessions logged yet.</p>}
          </section>
          {w.start && w.end ? (
            <section className="hd-panel quiet" aria-labelledby="h-ph">
              <div className="hd-ph"><h2 id="h-ph">{phaseNo ? `Phase ${phaseNo}` : 'Phase'}</h2><span className="hd-meta num">{shortDate(w.start)} to {shortDate(w.end)}</span></div>
              <div className="ph2" role="img" aria-label={w.weekNo ? `Week ${w.weekNo} of ${w.weeksTotal}` : 'Not started'}>
                {Array.from({ length: w.weeksTotal ?? 4 }, (_, k) => {
                  const n = (w.weekNo ?? 0) - 1;
                  return <span key={k} className={k < n ? 'on' : ''} style={k === n ? { background: `linear-gradient(90deg,var(--viz-1) ${Math.round(dayFrac * 100)}%,var(--surface-3) ${Math.round(dayFrac * 100)}%)` } : undefined} />;
                })}
              </div>
              {w.reassess ? <p className="sub2 num">Reassess around {shortDate(w.reassess)}: knee response, logged loads, what you enjoyed.</p> : null}
            </section>
          ) : null}
          <section className="hd-panel quiet" aria-labelledby="h-pr">
            <div className="hd-ph"><h2 id="h-pr">Personal records</h2></div>
            {w.records.length
              ? <table className="se"><tbody>{w.records.map((r) => <tr key={r.movement}><td>{r.movement}</td><td className="num">{r.best}</td><td className="faint num">{r.date}</td></tr>)}</tbody></table>
              : <p className="empty">None logged yet.<small>Starting loads from week 1 become the baseline.</small></p>}
          </section>
        </div>
      </div>
    </>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function SessionTable({ rows }: { rows: { name: string; sets: string }[] }) {
  return (
    <table className="se">
      <thead><tr><th>Exercise</th><th>Sets × reps</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td className="num">{r.sets}</td></tr>)}</tbody>
    </table>
  );
}

/* ---------- Note ---------- */

function NoteView({ data }: { data: HealthData }) {
  const n = data.note;
  return (
    <>
      <div className="he-note-head">
        <Link className="hd-btn ghost small" href="/t/health?view=workouts"><ArrowLeft aria-hidden className="hd-i" />Workouts</Link>
        {n ? <span className="q-path"><FileText aria-hidden className="hd-i" />personal/{n.path}</span> : null}
      </div>
      <article className="hd-panel mdp" aria-label="Note">
        {n ? <><h2 className="mdp-title">{n.path.split('/').pop()!.replace(/\.md$/, '')}</h2><MarkdownNote body={n.body} refs={n.refs} settings={data.md} /></> : <p className="hd-empty">That note isn&apos;t in the fitness folder.</p>}
      </article>
    </>
  );
}

export type { Workouts };
