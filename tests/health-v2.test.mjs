import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayMetrics, buildOverview, activityStrip } from '../lib/health-data.mjs';
import { buildWorkouts, parseLog, rowStatus } from '../lib/workouts.mjs';
import { splitFrontmatter, referencedTargets } from '../lib/md/plugins.mjs';

const day = (d, { rhr = 60, asleep = 400, steps = 5000 } = {}) => ({
  day: d, fetched_at: `${d}T14:00:00Z`,
  paired_devices: { pairedDevices: [{ name: 'users/1/pairedDevices/2', deviceVersion: 'Fitbit Air', batteryLevel: 80, lastSyncTime: `${d}T13:58:00Z` }] },
  candidates: [
    { ok: true, data_type: 'daily-resting-heart-rate', data: { dataPoints: [
      { dataSource: { platform: 'HEALTH_KIT' }, dailyRestingHeartRate: { date: { year: 2026, month: 10, day: Number(d.slice(8)) }, beatsPerMinute: '99' } },
      { dataSource: { platform: 'FITBIT' }, dailyRestingHeartRate: { date: { year: 2026, month: 10, day: Number(d.slice(8)) }, beatsPerMinute: String(rhr) } }] } },
    { ok: true, data_type: 'steps', data: { rollupDataPoints: [{ civilStartTime: { date: { year: 2026, month: 10, day: Number(d.slice(8)) } }, steps: { countSum: String(steps) } }] } },
    { ok: true, data_type: 'sleep', data: { dataPoints: [{ sleep: { metadata: { mainSleep: true }, interval: { startTime: `${d}T06:00:00Z`, endTime: `${d}T13:00:00Z` },
      stages: [{ type: 'LIGHT', startTime: `${d}T06:00:00Z`, endTime: `${d}T07:00:00Z` }], shortAwakenings: [{}, {}],
      summary: { minutesAsleep: String(asleep), minutesInSleepPeriod: '420', minutesToFallAsleep: '5', stagesSummary: [{ type: 'DEEP', minutes: '70', count: '3' }] } } }] } },
    { ok: true, data_type: 'daily-sleep-temperature-derivations', data: { dataPoints: [{ dailySleepTemperatureDerivations: { date: { year: 2026, month: 10, day: Number(d.slice(8)) }, nightlyTemperatureCelsius: 34.5, baselineTemperatureCelsius: 34.2 } }] } },
  ],
});

test('dayMetrics prefers Fitbit readings and derives sleep, temperature and device', () => {
  const m = dayMetrics(day('2026-10-13', { rhr: 61 }));
  assert.equal(m.rhr, 61);
  assert.equal(m.sleep.asleep, 400);
  assert.equal(m.sleep.shortAwakenings, 2);
  assert.equal(m.sleep.stagesSummary.DEEP.minutes, 70);
  assert.ok(Math.abs(m.tempDeltaC - 0.3) < 1e-9);
  assert.equal(m.device.name, 'Fitbit Air');
  assert.equal(m.steps, 5000);
  assert.equal(m.hrv, null);
});

test('buildOverview leaves missing days as gaps and averages prior days', () => {
  const now = new Date('2026-10-13T20:00:00Z');
  const b = { '2026-10-13': day('2026-10-13', { rhr: 70 }), '2026-10-12': day('2026-10-12', { rhr: 60 }), '2026-10-07': day('2026-10-07', { rhr: 62 }) };
  const o = buildOverview(b, now, 14);
  assert.equal(o.days.length, 14);
  assert.ok(o.missing.includes('2026-10-09'));
  assert.equal(o.steps[o.days.indexOf('2026-10-09')], null);
  assert.equal(o.signals.rhr.now, 70);
  assert.equal(o.signals.rhr.avg, 61);
  assert.equal(o.isToday, true);
});

test('activityStrip buckets intervals into 15-minute blocks with the highest level', () => {
  const s = activityStrip([{ start: '2026-10-13T15:00:00Z', end: '2026-10-13T15:10:00Z', level: 1 }, { start: '2026-10-13T15:05:00Z', end: '2026-10-13T15:06:00Z', level: 3 }]);
  assert.equal(s.length, 96);
  assert.equal(s[32], 3); // 8:00 AM PT
  assert.equal(s[33], 0);
});

const program = `## Overview

**Strength & Energy Base: Phase 1 (4 weeks).** Starts **Mon 2026-10-12**, ends Sat 2026-11-07. Reassess around 2026-11-07.

| Week | Dates |
|---|---|
| 1 | a |
| 2 | b |

## Weekly schedule (all times PT)

| Day | Session | Time |
|---|---|---|
| Mon | Day C: lower body + core | 7:40–8:15pm (~30 min) |
| Tue | Day A: push + core | 7:40–8:15pm (~30 min) |
| Wed | Off | |
| Sat | Squat day | 8:00am (~45–60 min) |

## Knee block (~8 min, all 4 training days)

| Exercise | Sets × reps |
|---|---|
| Wall sit | 3 × 30 sec |

## Sessions

### Tue: Day A, push + core

| Exercise | Sets × reps |
|---|---|
| Dumbbell bench press | 3 × 8–10 |

### Sat 8am: Squat day

1. Warm-up: 10 min.
2. Barbell box squat, 4 × 6 light. Sit back.
`;
const log = `## Recent sessions

| Date | Session | Key results | Notes |
|---|---|---|---|
| 2026-10-12 | Day C | Goblet squat 3×10 | **Knee fine** |
| 2026-10-01 | Day B pull: NOT DONE | — | Sick |
| 2026-09-29 | Skipped (push day) | — | Travel |
`;

test('buildWorkouts reads the week, tonight and log status from free text', () => {
  const w = buildWorkouts(program, log, new Date('2026-10-13T20:00:00Z'));
  assert.equal(w.weekNo, 1);
  assert.equal(w.week[0].status, 'done');
  assert.equal(w.week[1].status, 'today');
  assert.equal(w.week[2].status, 'off');
  assert.equal(w.week[5].timeDiffers, true);
  assert.equal(w.tonight.main[0].name, 'Dumbbell bench press');
  assert.equal(w.tonight.knee.rows.length, 1);
  assert.equal(w.usualTime, '7:40 PM');
  assert.deepEqual(w.log.map((r) => r.state), ['done', 'missed', 'skipped']);
  assert.equal(w.stale, false);
});

test('a Status column wins over the free-text guess when present', () => {
  const l = parseLog(`## Recent sessions\n\n| Date | Session | Key results | Notes | Status |\n|---|---|---|---|---|\n| 2026-10-12 | Day C | x | y | not done |\n`);
  assert.equal(l.hasStatusColumn, true);
  assert.equal(l.rows[0].state, 'missed');
  assert.equal(rowStatus({ session: 'Day C', results: '', notes: '', status: 'not done' }, 'text'), 'done');
});

test('frontmatter splits into key/values and wikilinks are collected', () => {
  const { meta, content } = splitFrontmatter('---\nowner: Gym\ntags: [fitness, knee]\n---\n# Hi [[training-log]] ![[img.png]]');
  assert.deepEqual(meta, [{ key: 'owner', values: ['Gym'] }, { key: 'tags', values: ['fitness', 'knee'] }]);
  assert.ok(content.startsWith('# Hi'));
  assert.deepEqual(referencedTargets(content), { links: ['training-log'], embeds: ['img.png'] });
});
