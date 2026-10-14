import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Synthetic data for demo mode (HD_DEMO=1, `npm run demo`). Every name, number, note and
 * transaction here is invented. Dates are generated relative to "now" so screens look current.
 */
const TZ = 'America/Los_Angeles';
const pday = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const addDays = (day, n) => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ymdObj = (day) => ({ year: +day.slice(0, 4), month: +day.slice(5, 7), day: +day.slice(8, 10) });
// Small deterministic PRNG so screenshots are stable.
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

export const isDemo = () => process.env.HD_DEMO === '1';

/* ---------- Today (/api/dashboard) ---------- */
export function demoDashboard(now = new Date()) {
  const day = pday(now);
  const at = now.toISOString();
  const src = (status, note, items = [], extra = {}) => ({ status, updatedAt: status === 'unconnected' ? null : at, note, items, ...extra });
  const cal = [
    ['Design review: onboarding flow', '9:30 AM – 10:15 AM'],
    ['Lunch with Sam', '12:00 PM – 1:00 PM'],
    ['Dentist', '3:30 PM – 4:15 PM'],
    ['Pick up groceries', '5:30 PM'],
  ].map(([title, time]) => ({ title, time, label: 'Personal' }));
  return {
    snapshot: {
      date: day,
      sources: {
        weather: src('ready', 'Open-Meteo', [], { weather: { condition: 'cloud', high: 61, low: 44, unit: 'F', location: 'Springfield' } }),
        health: src('ready', 'Fitbit · demo data', [], { metrics: [{ label: 'Sleep', value: '7h 12m' }, { label: 'Resting heart rate', value: '58', unit: 'bpm' }, { label: 'Steps so far', value: '4,812' }] }),
        calendar: src('ready', `Personal calendar · ${day} Pacific`, cal),
        overnight: src('ready', '2 of 14 overnight emails worth a reply', [
          { title: 'Alex Rivera: Can you confirm Saturday?', detail: 'Wants to lock the trailhead time before Friday.', label: 'Friends', time: '11:48 PM' },
          { title: 'Landlord: Furnace service window', detail: 'Two slots offered next week; pick one.', label: 'Home', time: '6:10 AM' },
        ]),
        followups: src('ready', 'Nothing flagged', []),
        headlines: src('ready', 'Demo headlines', [
          ['City council approves new bike lanes downtown', 'Local · Example News'],
          ['Chipmakers rally as demand outlook improves', 'Markets · Example Wire'],
          ['Researchers release open model for weather forecasting', 'AI · Example Tech'],
          ['Senate committee advances infrastructure bill', 'Politics · Example Post'],
          ['Startup launches quieter heat pump for apartments', 'Tech · Example Daily'],
        ].map(([title, label]) => ({ title, label, url: 'https://example.com/', detail: 'Overnight · demo' }))),
        automations: src('unconnected', 'Choose the personal scheduled tasks to include.'),
        discord: src('unconnected', 'Choose the servers and channels to follow.'),
        home: src('unconnected', 'Connect your Home Assistant instance.'),
      },
    },
    homeRooms: [],
    preferences: { city: 'Springfield', topics: 'tech, AI, markets', sourceNotes: '' },
    markets: {
      status: 'ready', updatedAt: at, note: 'Demo quotes',
      strip: [{ symbol: 'S&P 500', value: '5,812', change: '+0.6%', direction: 'up' }, { symbol: '10Y', value: '4.12%', change: '-0.03', direction: 'down' }],
      book: { direction: 'up', label: 'Portfolio', sub: 'today', pct: '+0.8%', dollars: '+$412' },
      holdingsAt: new Date(now.getTime() - 47 * 60000).toISOString(),
      positions: [
        ['ACME', 'Acme Corp', '20 sh', 'up', '+1.9%', '+$88', 4720], ['GLBX', 'Globex', '12 sh', 'down', '−0.7%', '−$21', 2980],
        ['INIT', 'Initech', '35 sh', 'up', '+0.4%', '+$9', 2260], ['UMBR', 'Umbrella', '8 sh', 'up', '+2.6%', '+$44', 1730],
        ['HOOL', 'Hooli', '5 sh', 'down', '−1.1%', '−$15', 1360], ['STRK', 'Stark Ind.', '4 sh', 'up', '+0.9%', '+$9', 1010],
        ['WAYN', 'Wayne Ent.', '6 sh', 'down', '−0.3%', '−$2', 640], ['SOYL', 'Soylent', '15 sh', 'up', '+3.2%', '+$12', 390],
      ].map(([ticker, detail, quantity, direction, pct, dollars, value]) => ({ ticker, detail, quantity, direction, pct, dollars, value, sparkline: null })),
    },
    workout: null,
    tonight: { title: 'Day A: push + core', time: '7:30 PM', duration: [30, 35] },
  };
}

/* ---------- To-dos (Reminders + Vikunja) ---------- */
export function demoTodos(now = new Date()) {
  const day = pday(now);
  const t = (id, title, due, allDay = true, priority = 0) => {
    const dk = due ? due.slice(0, 10) : null;
    return { id, title, due: due ? (allDay ? `${due}T00:00:00Z` : due) : null, allDay, overdue: !!dk && dk < day, dueToday: dk === day, priority };
  };
  return {
    at: now.toISOString(),
    reminders: { status: 'ready', note: 'Apple Reminders, read-only', groups: [
      { id: 'r:home', title: 'Home', items: [t('r1', 'Renew car registration', addDays(day, -2)), t('r2', 'Water the garden', day), t('r3', 'Replace furnace filter', addDays(day, 9)), t('r4', 'Order printer ink', null)] },
      { id: 'r:errands', title: 'Errands', items: [t('r5', 'Return library books', day), t('r6', 'Pick up dry cleaning', addDays(day, 1))] },
    ] },
    vikunja: { status: 'ready', note: 'Vikunja, read-only', groups: [
      { id: 'v:1', title: 'Home stack', items: [t('v1', 'Rotate backup drive', day, false, 3), t('v2', 'Update router firmware', addDays(day, 4), false, 1), t('v3', 'Label the patch panel', null)] },
      { id: 'v:2', title: 'Money admin', items: [t('v4', 'File HSA receipts', addDays(day, -1), false, 2), t('v5', 'Review insurance renewal', addDays(day, 12), false)] },
    ] },
  };
}

/* ---------- Weather detail ---------- */
export function demoWeatherDetail(now = new Date()) {
  const day = pday(now);
  const hours = Array.from({ length: 24 }, (_, h) => ({ time: `${day}T${String(h).padStart(2, '0')}:00`, temp: Math.round(52 + 14 * Math.sin(((h - 9) / 24) * Math.PI * 2 * 0.9)), precip: h >= 15 && h <= 18 ? [20, 45, 60, 35][h - 15] : h > 18 ? 10 : 0 }));
  return {
    status: 'ready', location: 'Springfield, Oregon', unit: 'F', updatedAt: now.toISOString(),
    now: { temp: 61, feelsLike: 59, wind: 9, gust: 17, windDir: 'NW', humidity: 58, uv: 4, condition: 'cloud' },
    today: { high: 66, low: 48, precipChance: 60, precipSum: 0.12, sunrise: `${day}T07:21`, sunset: `${day}T18:34`, uvMax: 4 },
    hours,
    days: Array.from({ length: 7 }, (_, i) => ({ date: addDays(day, i), high: [66, 63, 58, 61, 67, 70, 68][i], low: [48, 47, 44, 45, 49, 51, 50][i], precipChance: [60, 80, 40, 10, 0, 5, 20][i], condition: ['cloud', 'rain', 'rain', 'cloud', 'sun', 'sun', 'cloud'][i] })),
  };
}

/* ---------- Projects (Vikunja board) ---------- */
export function demoBoard() {
  const t = (id, title, extra = {}) => ({ id, ref: `#${id}`, title, done: false, due: null, percent: 0, labels: [], assignees: [], ...extra });
  const lbl = (title, color) => ({ title, color });
  const soon = new Date(Date.now() + 3 * 864e5).toISOString();
  return {
    projects: [{ id: 1, title: 'Home', open: 9 }, { id: 2, title: 'Garden', open: 4 }, { id: 3, title: 'Side project', open: 6 }],
    project: { id: 1, title: 'Home', url: 'https://example.com/' },
    mode: 'kanban',
    buckets: [
      { id: 1, title: 'Backlog', limit: 0, tasks: [t(11, 'Replace hallway light fixture', { labels: [lbl('electrical', '#e2a03f')] }), t(12, 'Research water filter options'), t(13, 'Donate old bike')] },
      { id: 2, title: 'This week', limit: 5, tasks: [t(21, 'Book furnace service', { due: soon, labels: [lbl('home', '#4caf8f')] }), t(22, 'Renew car registration', { due: soon }), t(23, 'Fix squeaky door')] },
      { id: 3, title: 'Doing', limit: 3, tasks: [t(31, 'Paint the spare room', { percent: 60, labels: [lbl('project', '#7b8cff')] }), t(32, 'Sort garage shelves', { percent: 30 })] },
      { id: 4, title: 'Done', limit: 0, tasks: [t(41, 'Clean gutters', { done: true }), t(42, 'Change smoke detector batteries', { done: true })] },
    ],
  };
}

/* ---------- File fixtures: vault, Fitbit, budget, services ---------- */
function fitbitDay(day, r) {
  const d = ymdObj(day);
  const prev = addDays(day, -1);
  const sleepStart = new Date(`${prev}T06:${String(10 + Math.floor(r() * 40)).padStart(2, '0')}:00Z`);
  const stages = []; let t = sleepStart.getTime();
  const seq = ['LIGHT', 'DEEP', 'LIGHT', 'REM', 'LIGHT', 'DEEP', 'LIGHT', 'REM', 'AWAKE', 'LIGHT', 'REM', 'LIGHT', 'REM', 'LIGHT'];
  for (const type of seq) { const m = type === 'AWAKE' ? 6 : type === 'DEEP' ? 35 + r() * 20 : 25 + r() * 25; stages.push({ type, startTime: new Date(t).toISOString(), endTime: new Date(t + m * 6e4).toISOString() }); t += m * 6e4; }
  const sum = (k) => Math.round(stages.filter((s) => s.type === k).reduce((a, s) => a + (Date.parse(s.endTime) - Date.parse(s.startTime)) / 6e4, 0));
  const asleep = sum('LIGHT') + sum('DEEP') + sum('REM');
  const ptLevel = [];
  for (let h = 14; h < 14 + 16; h++) for (let q = 0; q < 4; q++) {
    const s = new Date(`${day}T00:00:00Z`); s.setUTCHours(h, q * 15);
    if (s > new Date()) continue;
    const x = r(); ptLevel.push({ activityLevel: { activityLevelType: x > 0.93 ? 'VERY_ACTIVE' : x > 0.8 ? 'MODERATELY_ACTIVE' : x > 0.5 ? 'LIGHTLY_ACTIVE' : 'SEDENTARY', interval: { startTime: s.toISOString(), endTime: new Date(s.getTime() + 15 * 6e4).toISOString() } } });
  }
  const steps = Math.round(5000 + r() * 6000);
  const ok = (data_type, data) => ({ ok: true, data_type, data });
  const dp = (key, v) => ({ dataPoints: [{ dataSource: { platform: 'FITBIT' }, [key]: { date: d, ...v } }] });
  const roll = (key, v) => ({ rollupDataPoints: [{ civilStartTime: { date: d }, [key]: v }] });
  return {
    day, fetched_at: new Date().toISOString(),
    paired_devices: { pairedDevices: [{ deviceVersion: 'Demo Band', batteryLevel: 72, lastSyncTime: new Date(Date.now() - 40 * 6e4).toISOString() }] },
    candidates: [
      ok('sleep', { dataPoints: [{ sleep: { metadata: { mainSleep: true }, interval: { startTime: sleepStart.toISOString(), endTime: new Date(t).toISOString() }, stages, shortAwakenings: Array(Math.round(4 + r() * 8)).fill({}),
        summary: { minutesAsleep: String(asleep), minutesInSleepPeriod: String(asleep + 18), minutesToFallAsleep: String(Math.round(5 + r() * 12)), stagesSummary: ['DEEP', 'LIGHT', 'REM', 'AWAKE'].map((k) => ({ type: k, minutes: String(sum(k)), count: '3' })) } } }] }),
      ok('daily-resting-heart-rate', dp('dailyRestingHeartRate', { beatsPerMinute: String(Math.round(56 + r() * 5)) })),
      ok('daily-heart-rate-variability', dp('dailyHeartRateVariability', { averageHeartRateVariabilityMilliseconds: 38 + r() * 14 })),
      ok('daily-respiratory-rate', dp('dailyRespiratoryRate', { breathsPerMinute: 14.5 + r() * 1.5 })),
      ok('daily-oxygen-saturation', dp('dailyOxygenSaturation', { averagePercentage: 95 + r() * 2 })),
      ok('daily-sleep-temperature-derivations', dp('dailySleepTemperatureDerivations', { nightlyTemperatureCelsius: 34.2 + (r() - 0.5) * 0.5, baselineTemperatureCelsius: 34.2 })),
      ok('steps', roll('steps', { countSum: String(steps) })),
      ok('distance', roll('distance', { millimetersSum: String(steps * 760) })),
      ok('total-calories', roll('totalCalories', { kcalSum: String(Math.round(1900 + r() * 600)) })),
      ok('active-energy-burned', roll('activeEnergyBurned', { kcalSum: String(Math.round(300 + r() * 400)) })),
      ok('active-minutes', roll('activeMinutes', { activeMinutesRollupByActivityLevel: [{ activeMinutesSum: String(Math.round(20 + r() * 50)) }] })),
      ok('sedentary-period', roll('sedentaryPeriod', { durationSum: `${Math.round((420 + r() * 200) * 60)}s` })),
      ok('heart-rate', roll('heartRate', { beatsPerMinuteAvg: 70 + r() * 8, beatsPerMinuteMin: 54, beatsPerMinuteMax: 128 })),
      ok('activity-level', { dataPoints: ptLevel }),
    ],
  };
}

const PROGRAM = (start) => `---
owner: Coach
updated: ${start}
---

# Current program

## Overview

**Demo Strength Base: Phase 1 (4 weeks).** Starts **week 1 on Mon ${start}** and runs through ${addDays(start, 26)}. **Reassess around ${addDays(start, 26)}.**

| Week | Dates |
|---|---|
| 1 | Week 1 |
| 2 | Week 2 |
| 3 | Week 3 |
| 4 | Week 4 |

## Weekly schedule (all times PT)

| Day | Session | Time |
|---|---|---|
| Mon | Day C: lower body + core | 7:30–8:05pm (~35 min) |
| Tue | Day A: push + core | 7:30–8:05pm (~35 min) |
| Wed | Off | |
| Thu | Day B: pull + core | 7:30–8:05pm (~35 min) |
| Fri | **Rest** | |
| Sat | Long walk or easy bike | 9:00am (~45 min) |
| Sun | Off | |

## Knee block (~8 min, all training days)

| Exercise | Sets × reps |
|---|---|
| Band terminal knee extension (per leg) | 2 × 15 |
| Wall sit | 3 × 30 sec |
| Single-leg balance (per leg) | 2 × 30 sec |

## Sessions

### Mon: Day C, lower body + core

| Exercise | Sets × reps |
|---|---|
| Goblet box squat | 3 × 10 |
| Dumbbell Romanian deadlift | 3 × 10 |
| Bird dog (per side) | 2 × 8 |

### Tue: Day A, push + core

| Exercise | Sets × reps |
|---|---|
| Dumbbell bench press | 3 × 8–10 |
| Standing dumbbell overhead press | 3 × 8–10 |
| Plank | 2 × 30 sec |

### Thu: Day B, pull + core

| Exercise | Sets × reps |
|---|---|
| One-arm dumbbell row (per side) | 3 × 10 |
| Band pull-apart | 2 × 15 |
| Side plank (per side) | 2 × 20 sec |

## Effort and progression

- **Every set ends with 2–3 reps in reserve.**

## Knee guardrails

- **Sharp pain: stop the exercise.**
`;

const LOG = (today) => {
  const rows = [
    [-1, 'Day C lower', 'Goblet squat 3×10 @ 30 lb; RDL 3×10 @ 25 lb', 'Felt good.'],
    [-4, 'Day B pull', 'Row 3×10 @ 30 lb', 'Short on time; skipped side plank.'],
    [-5, 'Day A push', 'Bench 3×10 @ 30 lb; OHP 3×8 @ 20 lb', ''],
    [-6, 'Day C lower', 'Goblet squat 3×10 @ 25 lb', 'Knee 1/10.'],
    [-8, 'Long walk', '45 min, easy', ''],
  ].map(([o, s, r, n]) => `| ${addDays(today, o)} | ${s} | ${r} | ${n} |`).join('\n');
  return `---\nowner: Coach\n---\n\n# Training log\n\n## Personal records\n\n| Movement | Best | Date |\n|---|---|---|\n| Goblet squat | 30 lb × 10 | ${addDays(today, -1)} |\n\n## Recent sessions\n\n| Date | Session | Key results | Notes |\n|---|---|---|---|\n${rows}\n`;
};

const WORKOUT = (day) => `---
date: ${day}
session: "Day A: push + core"
phase: 1
week: 2
---

# Day A: push + core

## Warm-up
- [x] Easy bike — set 1 — 5 min

## Knee block
- [x] Band terminal knee extension — set 1 — 15 per leg
- [ ] Band terminal knee extension — set 2 — 15 per leg
- [ ] Wall sit — set 1 — 30 sec

## Main
- [ ] Dumbbell bench press — set 1 — 8–10 @ 30 lb
- [ ] Dumbbell bench press — set 2 — 8–10 @ 30 lb
- [ ] Dumbbell bench press — set 3 — 8–10 @ 30 lb
- [ ] Standing dumbbell overhead press — set 1 — 8–10 @ 20 lb

## Core
- [ ] Plank — set 1 — 30 sec

## Notes
Keep 2–3 reps in reserve.
`;

function budgetCache(now) {
  const r = rng(7);
  const today = pday(now);
  const tx = [];
  const cats = [['Groceries', 52000], ['Dining', 26000], ['Transport', 14000], ['Shopping', 18000], ['Entertainment', 9000], ['Health', 6000]];
  for (let m = 2; m >= 0; m--) {
    const first = new Date(today.slice(0, 8) + '01T12:00:00Z'); first.setUTCMonth(first.getUTCMonth() - m);
    const mm = first.toISOString().slice(0, 8);
    const lastDay = m === 0 ? +today.slice(8) : 28;
    tx.push({ date: mm + '01', amount: 520000, category: 'Paycheck', account: 'Checking', payee: 'Example Employer' });
    tx.push({ date: mm + '15', amount: 520000, category: 'Paycheck', account: 'Checking', payee: 'Example Employer' });
    tx.push({ date: mm + '03', amount: -185000, category: 'Housing', account: 'Checking', payee: 'Example Property Co' });
    tx.push({ date: mm + '20', amount: -9500, category: 'Utilities', account: 'Checking', payee: 'City Power' });
    tx.push({ date: mm + '22', amount: -6500, category: 'Phone', account: 'Checking', payee: 'Example Mobile' });
    tx.push({ date: mm + '11', amount: -4200, category: 'Subscriptions', account: 'Demo Card', payee: 'Streamly' });
    tx.push({ date: mm + '26', amount: -14000, category: 'Insurance', account: 'Checking', payee: 'Example Insurance' });
    if (m === 1) tx.push({ date: mm + '27', amount: -3800, category: 'Interest & fees', account: 'Demo Card', payee: 'Card interest' });
    for (const [c, monthly] of cats) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const dd = 1 + Math.floor(r() * (lastDay - 1));
        const boost = m === 0 && c === 'Dining' ? 1.6 : 1;
        tx.push({ date: mm + String(dd).padStart(2, '0'), amount: -Math.round((monthly / n) * (0.6 + r() * 0.8) * boost), category: c, account: r() > 0.5 ? 'Demo Card' : 'Checking', payee: `${c} merchant` });
      }
    }
  }
  return {
    fetchedAt: now.toISOString(), budgetName: 'Demo Budget', budgets: {},
    transactions: tx.filter((t) => t.date <= today),
    accounts: [
      { name: 'Checking', closed: false, balance: 642000, balance30: 598000 },
      { name: 'Savings', closed: false, balance: 1250000, balance30: 1225000 },
      { name: 'Demo Card', closed: false, balance: -184000, balance30: -142000 },
    ],
  };
}

const SERVICES = `# Demo services

## Overview

| Service | What it is | Reach it at | Lifecycle |
|---|---|---|---|
| Budget app | Self-hosted budgeting | https://example.ts.net:5443 | Restarts at login |
| Task board | Personal tasks and projects | http://example.ts.net:3456 | Docker, restart unless stopped |
| Uptime monitor | Status checks | http://example.ts.net:3001 | Docker |
| Home dashboard | This app | https://example.ts.net:9443 | LaunchAgent (KeepAlive) |
| Local LLM | Model server | http://localhost:11434 | Restarts at login |
| Nightly backup | Restic to a spare machine | — | Daily at 3:10 AM |
| Backup target | Append-only restic server | example:8000 | systemd |
`;

function feed(now) {
  const at = now.toISOString();
  const s = (id, state, detail) => ({ id, state, detail, checkedAt: at });
  return { checkedAt: at, services: [s('budget-app', 'up', 'HTTP 200 in 18 ms'), s('task-board', 'up', 'HTTP 200 in 22 ms'), s('uptime-monitor', 'up', 'HTTP 200 in 9 ms'),
    s('home-dashboard', 'up', 'HTTP 200 in 31 ms'), s('local-llm', 'degraded', 'HTTP 200 in 2.4 s'), s('nightly-backup', 'up', 'Last run 3:12 AM, 1.2 GB'), s('backup-target', 'down', 'No answer in 1.5s')] };
}

const NOTES = {
  'home/garden-plan.md': `---\ntags: [garden]\n---\n# Garden plan\n\nRaised beds along the south fence.\n\n- [x] Order soil\n- [ ] Build second bed\n- [ ] Plant garlic before first frost\n\n> [!tip] Water deeply, less often.\n\nSee [[recipes/tomato-sauce]].\n`,
  'recipes/tomato-sauce.md': `# Tomato sauce\n\n| Ingredient | Amount |\n|---|---|\n| Tomatoes | 2 lb |\n| Garlic | 4 cloves |\n| Olive oil | 3 tbsp |\n\n1. Roast tomatoes at 400°F for 35 min.\n2. Blend with garlic and oil.\n`,
  'reading/books-2026.md': `# Books 2026\n\n- *The Example Mountain*, finished in March\n- *Notes on Systems*, in progress\n\n**Next:** something light for the trip.\n`,
  'home/knee-notes.md': `# Knee notes\n\nPain-free range only. Wall sits are fine at 30 sec. Keep a log in [[fitness/training-log]].\n`,
  'trips/coast-weekend.md': `# Coast weekend\n\nPacking list:\n\n- Rain shell\n- Camp stove\n- Tide table\n`,
};
const WORK_NOTES = {
  'projects/onboarding-redesign.md': `# Onboarding redesign\n\nGoal: cut time-to-first-value in half.\n\n## Open questions\n\n- Do we need email verification up front?\n- Which three settings matter on day one?\n`,
  'meetings/weekly-sync.md': `# Weekly sync\n\n- Shipped: new billing page\n- Next: onboarding experiments\n`,
};

/** Writes every file the demo needs under `dir` and returns the env vars that point the app at it. */
export function writeDemoFiles(dir, now = new Date()) {
  rmSync(dir, { recursive: true, force: true });
  const today = pday(now);
  const w = (p, s) => { mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, typeof s === 'string' ? s : JSON.stringify(s)); };
  const vault = join(dir, 'vaults/personal'), work = join(dir, 'vaults/work'), data = join(dir, 'data');
  const r = rng(42);
  const wd = (new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const start = addDays(today, -wd - 7);
  for (let i = 13; i >= 0; i--) { const d = addDays(today, -i); if (i === 5) continue; w(join(vault, `fitness/fitbit-air/raw/${d}.json`), fitbitDay(d, r)); }
  w(join(vault, 'fitness/current-program.md'), PROGRAM(start));
  w(join(vault, 'fitness/training-log.md'), LOG(today));
  w(join(vault, `fitness/workouts/${today}.md`), WORKOUT(today));
  for (const [p, s] of Object.entries(NOTES)) w(join(vault, p), s);
  for (const [p, s] of Object.entries(WORK_NOTES)) w(join(work, p), s);
  w(join(dir, 'services.md'), SERVICES);
  w(join(dir, 'health.json'), feed(now));
  w(join(data, 'budget.json'), budgetCache(now));
  w(join(data, 'budget-sync-status.json'), { ok: true, finishedAt: now.toISOString() });
  w(join(dir, 'env'), '');
  w(join(dir, 'x-trends.json'), { updatedAt: new Date(now.getTime() - 20 * 60000).toISOString(), items: [
    { title: '#OpenSourceFriday', url: 'https://x.com/search?q=%23OpenSourceFriday', posts: '18.2K posts', context: 'Technology' },
    { title: 'Northern lights', url: 'https://x.com/search?q=Northern%20lights', posts: '41K posts', context: 'Trending in Science' },
    { title: 'Rate decision', url: 'https://x.com/search?q=Rate%20decision', posts: '9,870 posts', context: 'Business & finance' },
  ] });
  return {
    HD_DEMO: '1',
    DASHBOARD_PERSONAL_VAULT: vault,
    HD_DATA_DIR: data,
    HD_ENV_FILE: join(dir, 'env'),
    HD_LOAD_LOG: join(dir, 'load.jsonl'),
    HD_SERVICES_FILE: join(dir, 'services.md'),
    HD_HEALTH_FEED: join(dir, 'health.json'),
    HD_X_TRENDS_FILE: join(dir, 'x-trends.json'),
    HD_SETTINGS_FILE: join(dir, 'settings.json'),
    HD_QUERY_VAULTS: JSON.stringify([{ id: 'personal', label: 'personal', path: vault }, { id: 'work', label: 'work', path: work }]),
  };
}
