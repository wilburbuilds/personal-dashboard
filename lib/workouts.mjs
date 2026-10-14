import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** current-program.md + training-log.md -> Workouts view model. Read-only, all free-text parsing lives here. */
const TZ = 'America/Los_Angeles';
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const clean = (s = '') => s.replace(/\*\*|__|`/g, '').replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_, a, b) => b || a).trim();
export const pacificDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
export const weekdayOf = (day) => DAYS[(new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7];
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function section(md, headingRe) {
  const m = headingRe.exec(md);
  if (!m) return '';
  const level = /^(#+)/.exec(m[0])?.[1].length ?? 2;
  const rest = md.slice(m.index + m[0].length);
  const next = rest.search(new RegExp(`^#{1,${level}} `, 'm'));
  return next === -1 ? rest : rest.slice(0, next);
}
export function tables(md) {
  const out = [];
  let cur = null;
  for (const line of md.split('\n')) {
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.every((c) => /^:?-{2,}:?$/.test(c) || c === '')) { if (cur && !cur.rows.length && cells.some(Boolean)) continue; if (cur) continue; }
      if (!cur) cur = { head: cells, rows: [] };
      else cur.rows.push(cells);
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}
const bullets = (md) => md.split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => clean(l.replace(/^\s*[-*]\s+/, '')));
const exerciseRows = (t) => (t?.rows ?? []).filter((r) => r[0] && !/^-+$/.test(r[0])).map((r) => ({ name: clean(r[0]), sets: clean(r[1] ?? '') }));

function parseTime(cell = '') {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(?:[–-]\s*\d{1,2}(?::\d{2})?\s*)?(am|pm)/i.exec(cell);
  if (!m) return null;
  return `${m[1]}:${m[2] ?? '00'} ${m[3].toUpperCase()}`;
}
const durationOf = (cell = '') => /~?\s*(\d+)(?:[–-](\d+))?\s*min/.exec(cell)?.slice(1).filter(Boolean).map(Number) ?? null;

export function parseProgram(md = '') {
  const overview = section(md, /^## Overview.*$/m);
  const phase = /\*\*([^*]+?)\.?\*\*/.exec(overview)?.[1]?.replace(/\.$/, '') ?? null;
  const dates = [...overview.matchAll(/(\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  const weekTable = tables(overview)[0];
  const sched = tables(section(md, /^## Weekly schedule.*$/m))[0];
  const schedule = DAYS.map((d) => {
    const row = sched?.rows.find((r) => clean(r[0]).slice(0, 3) === d);
    const session = clean(row?.[1] ?? '') || 'Off';
    const rest = /^(rest|off)$/i.test(session);
    return { day: d, session, rest, time: rest ? null : parseTime(row?.[2] ?? ''), duration: durationOf(row?.[2] ?? ''), rawTime: clean(row?.[2] ?? '') };
  });
  const knee = section(md, /^## Knee block.*$/m);
  const sessions = {};
  const sess = section(md, /^## Sessions.*$/m);
  for (const m of sess.matchAll(/^### (.+)$/gm)) {
    const title = clean(m[1]);
    const day = DAYS.find((d) => title.startsWith(d)) ?? (/^Sat/i.test(title) ? 'Sat' : null);
    if (!day) continue;
    const body = section(sess.slice(m.index), /^### .+$/m);
    const t = tables(body)[0];
    let main = exerciseRows(t);
    if (!main.length) {
      main = body.split('\n').filter((l) => /^\d+\.\s+/.test(l.trim())).map((l) => clean(l.trim().replace(/^\d+\.\s+/, '')))
        .filter((l) => !/^warm-?up/i.test(l)).map((l) => {
          const mm = /^([^,.:]+?)[,:]?\s+(\d+\s*[×x]\s*[\d–-]+(?:\s*\w+)?)/.exec(l);
          return mm ? { name: mm[1].trim(), sets: mm[2].replace(/\s*light$/, '').trim() } : { name: l.split('. ')[0].replace(/:\s.*$/, ''), sets: /(\d+[–-]\d+ min)/.exec(l)?.[1] ?? '' };
        });
    }
    sessions[day] = { title: title.replace(/^\w{3}(?: \d+(?::\d+)?\s*(?:am|pm))?:\s*/i, ''), main, note: body.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('|') && !/^\d+\./.test(l))[0] ?? null };
  }
  const effort = bullets(section(md, /^## Effort and progression.*$/m));
  const guard = bullets(section(md, /^## Knee guardrails.*$/m));
  return {
    phase, start: dates[0] ?? null, end: dates[1] ?? null, reassess: dates[2] ?? dates[1] ?? null,
    weeks: (weekTable?.rows ?? []).map((r) => ({ week: Number(r[0]) || null, dates: clean(r[1] ?? '') })),
    schedule,
    knee: { rows: exerciseRows(tables(knee)[0]), minutes: Number(/~?(\d+)\s*min/.exec(md.match(/^## Knee block.*$/m)?.[0] ?? '')?.[1]) || null },
    sessions,
    rules: {
      reserve: effort.find((b) => /reps? in reserve/i.test(b)) ?? null,
      pain: guard.find((b) => /sharp pain/i.test(b)) ?? null,
    },
    updated: /^updated:\s*(\S+)/m.exec(md)?.[1] ?? null,
  };
}

/** Status from a Status column when present (logStatus 'auto'), else from free text. */
export function rowStatus(row, mode = 'auto') {
  if (mode === 'auto' && row.status) {
    const s = row.status.toLowerCase();
    if (/not|miss/.test(s)) return 'missed';
    if (/skip/.test(s)) return 'skipped';
    if (/done|complete|yes/.test(s)) return 'done';
  }
  const text = `${row.session} ${row.results} ${row.notes}`;
  if (/not done/i.test(text)) return 'missed';
  if (/^skipped|\bskipped\b/i.test(row.session)) return 'skipped';
  if (/no session/i.test(row.session)) return 'rest';
  return 'done';
}

export function parseLog(md = '', mode = 'auto') {
  const recent = section(md, /^## Recent sessions.*$/m);
  const t = tables(recent)[0];
  const head = (t?.head ?? []).map((h) => h.toLowerCase());
  const col = (n) => head.findIndex((h) => h.includes(n));
  const iDate = col('date'), iSess = col('session'), iRes = col('result'), iNotes = col('note'), iStatus = col('status');
  const rows = (t?.rows ?? []).filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(clean(r[iDate] ?? ''))).map((r) => {
    const row = {
      date: clean(r[iDate]), session: clean(r[iSess] ?? ''), results: clean(r[iRes] ?? ''), notes: clean(r[iNotes] ?? ''),
      status: iStatus >= 0 ? clean(r[iStatus] ?? '') : '',
    };
    if (row.results === '—' || row.results === '-') row.results = '';
    return { ...row, state: rowStatus(row, mode) };
  }).sort((a, b) => b.date.localeCompare(a.date));
  const pr = tables(section(md, /^## Personal records.*$/m))[0];
  const records = (pr?.rows ?? []).filter((r) => r.some((c) => clean(c))).map((r) => ({ movement: clean(r[0]), best: clean(r[1] ?? ''), date: clean(r[2] ?? '') }));
  return { rows, records, hasStatusColumn: iStatus >= 0 };
}

export function buildWorkouts(program, log, now = new Date(), opts = {}) {
  const today = pacificDay(now);
  const wd = weekdayOf(today);
  const monday = addDays(today, -DAYS.indexOf(wd));
  const p = parseProgram(program);
  const l = parseLog(log, opts.logStatus);
  const usual = (() => { const c = {}; p.schedule.forEach((s) => { if (s.time) c[s.time] = (c[s.time] ?? 0) + 1; }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null; })();
  const week = p.schedule.map((s, k) => {
    const date = addDays(monday, k);
    const logged = l.rows.filter((r) => r.date === date);
    let status = s.rest ? 'off' : date < today ? 'unlogged' : date === today ? 'today' : 'planned';
    if (logged.some((r) => r.state === 'done')) status = 'done';
    else if (logged.some((r) => r.state === 'missed' || r.state === 'skipped')) status = s.rest ? 'off' : 'notdone';
    if (!s.rest && p.start && date < p.start) status = 'before';
    return { ...s, date, status, timeDiffers: !!s.time && s.time !== usual };
  });
  const weekNo = p.start ? Math.floor((Date.parse(today) - Date.parse(p.start)) / (7 * 864e5)) + 1 : null;
  const tonight = week.find((d) => d.date === today);
  const session = tonight && !tonight.rest ? p.sessions[wd] ?? null : null;
  const next = week.find((d) => d.date > today && !d.rest);
  const newest = l.rows[0]?.date ?? null;
  const staleDays = newest ? Math.floor((Date.parse(today) - Date.parse(newest)) / 864e5) : null;
  return {
    today, weekday: wd, phase: p.phase, start: p.start, end: p.end, reassess: p.reassess,
    weekNo: weekNo && weekNo > 0 ? weekNo : null, weeksTotal: p.weeks.length || null,
    usualTime: usual, week,
    tonight: tonight && !tonight.rest ? { title: session?.title ?? tonight.session, time: tonight.time, rawTime: tonight.rawTime, duration: tonight.duration, knee: p.knee, main: session?.main ?? [] } : null,
    next: next ? { day: next.day, date: next.date, session: next.session, time: next.time } : null,
    rules: p.rules,
    log: l.rows, records: l.records, hasStatusColumn: l.hasStatusColumn,
    newestLog: newest, stale: staleDays !== null && staleDays > (opts.staleLogDays ?? 7),
  };
}

export async function readWorkouts(vault, now = new Date(), opts = {}) {
  const read = async (f) => { try { return await readFile(join(vault, 'fitness', f), 'utf8'); } catch { return ''; } };
  const [program, log] = await Promise.all([read('current-program.md'), read('training-log.md')]);
  return { ...buildWorkouts(program, log, now, opts), found: { program: !!program, log: !!log } };
}
