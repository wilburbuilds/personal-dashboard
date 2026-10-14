import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Fitbit Air raw exports -> display-only Health Overview data. Read-only. */
const TZ = 'America/Los_Angeles';
export const pacificDay = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const num = (v) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const ymd = (d) => (d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : null);
const minuteOfDay = (iso) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(iso));
  return Number(p.find((x) => x.type === 'hour').value) * 60 + Number(p.find((x) => x.type === 'minute').value);
};
export function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function cands(bundle, type) {
  return (bundle?.candidates ?? []).filter((c) => c.ok && c.data_type === type);
}
const points = (bundle, type) => cands(bundle, type).flatMap((c) => c.data?.dataPoints ?? []);
const rollup = (bundle, type) => {
  const all = cands(bundle, type).flatMap((c) => c.data?.rollupDataPoints ?? []);
  return all.find((p) => ymd(p.civilStartTime?.date) === bundle.day) ?? null;
};
const fitbitFirst = (arr) => [...arr].sort((a, b) => (b.dataSource?.platform === 'FITBIT') - (a.dataSource?.platform === 'FITBIT'));
const daily = (bundle, type, key) => fitbitFirst(points(bundle, type)).map((p) => p[key]).find((v) => v && ymd(v.date) === bundle.day) ?? null;

const LEVEL = { SEDENTARY: 1, LIGHTLY_ACTIVE: 2, LIGHT: 2, MODERATELY_ACTIVE: 3, MODERATE: 3, FAIRLY_ACTIVE: 3, VERY_ACTIVE: 4, VIGOROUS: 4 };

/** One day's numbers from one raw bundle. Missing values stay null. */
export function dayMetrics(bundle) {
  if (!bundle) return null;
  const sleepPt = points(bundle, 'sleep').map((p) => p.sleep).filter((s) => s?.metadata?.mainSleep === true)
    .sort((a, b) => String(b.interval?.endTime).localeCompare(String(a.interval?.endTime)))[0];
  let sleep = null;
  if (sleepPt) {
    const sum = sleepPt.summary ?? {};
    const stagesSummary = Object.fromEntries((sum.stagesSummary ?? []).map((s) => [s.type, { minutes: num(s.minutes) ?? 0, count: num(s.count) ?? 0 }]));
    sleep = {
      start: sleepPt.interval?.startTime ?? null,
      end: sleepPt.interval?.endTime ?? null,
      stages: (sleepPt.stages ?? []).filter((s) => s.startTime && s.endTime && s.type).map((s) => ({ type: s.type, start: s.startTime, end: s.endTime })),
      stagesSummary,
      asleep: num(sum.minutesAsleep),
      awake: num(sum.minutesAwake),
      inBed: num(sum.minutesInSleepPeriod),
      toFallAsleep: num(sum.minutesToFallAsleep),
      shortAwakenings: Array.isArray(sleepPt.shortAwakenings) ? sleepPt.shortAwakenings.length : null,
    };
  }
  const hrv = daily(bundle, 'daily-heart-rate-variability', 'dailyHeartRateVariability');
  const temp = daily(bundle, 'daily-sleep-temperature-derivations', 'dailySleepTemperatureDerivations');
  const spo = daily(bundle, 'daily-oxygen-saturation', 'dailyOxygenSaturation');
  const hr = rollup(bundle, 'heart-rate')?.heartRate;
  const active = rollup(bundle, 'active-minutes')?.activeMinutes?.activeMinutesRollupByActivityLevel ?? [];
  const sed = rollup(bundle, 'sedentary-period')?.sedentaryPeriod?.durationSum;
  const levels = points(bundle, 'activity-level').map((p) => p.activityLevel).filter((a) => a?.interval?.startTime)
    .map((a) => ({ start: a.interval.startTime, end: a.interval.endTime, level: LEVEL[a.activityLevelType] ?? 1 }));
  const device = bundle.paired_devices?.pairedDevices?.[0];
  const tC = temp && num(temp.nightlyTemperatureCelsius) !== null && num(temp.baselineTemperatureCelsius) !== null
    ? num(temp.nightlyTemperatureCelsius) - num(temp.baselineTemperatureCelsius) : null;
  return {
    day: bundle.day,
    fetchedAt: bundle.fetched_at ?? null,
    device: device ? { name: (device.deviceVersion || (String(device.name ?? '').startsWith('users/') ? '' : device.name) || 'Fitbit').replace(/^Google /, ''), battery: num(device.batteryLevel), lastSync: device.lastSyncTime ?? null } : null,
    sleep,
    rhr: num(daily(bundle, 'daily-resting-heart-rate', 'dailyRestingHeartRate')?.beatsPerMinute),
    hrv: num(hrv?.averageHeartRateVariabilityMilliseconds),
    breathing: num(daily(bundle, 'daily-respiratory-rate', 'dailyRespiratoryRate')?.breathsPerMinute),
    spo2: num(spo?.averagePercentage),
    tempDeltaC: tC,
    steps: num(rollup(bundle, 'steps')?.steps?.countSum),
    distanceMi: (() => { const mm = num(rollup(bundle, 'distance')?.distance?.millimetersSum); return mm === null ? null : mm / 1609344; })(),
    calories: num(rollup(bundle, 'total-calories')?.totalCalories?.kcalSum),
    activeCalories: num(rollup(bundle, 'active-energy-burned')?.activeEnergyBurned?.kcalSum),
    activeMinutes: active.length ? active.reduce((s, a) => s + (num(a.activeMinutesSum) ?? 0), 0) : null,
    sedentaryMin: sed ? Math.round((num(String(sed).replace(/s$/, '')) ?? 0) / 60) : null,
    hrAvg: num(hr?.beatsPerMinuteAvg), hrMin: num(hr?.beatsPerMinuteMin), hrMax: num(hr?.beatsPerMinuteMax),
    levels,
    exercises: points(bundle, 'exercise').map((p) => p.exercise).filter(Boolean).map((e) => ({
      name: e.displayName || e.exerciseType || 'Exercise',
      start: e.interval?.startTime ?? null,
      minutes: e.activeDuration ? Math.round((num(String(e.activeDuration).replace(/s$/, '')) ?? 0) / 60) : null,
      distanceMi: num(e.metricsSummary?.distanceMillimeters) === null ? null : num(e.metricsSummary.distanceMillimeters) / 1609344,
      avgHr: num(e.metricsSummary?.averageHeartRateBeatsPerMinute),
    })),
  };
}

/** 96 fifteen-minute blocks: 0 no data, 1 sedentary .. 4 very active. */
export function activityStrip(levels) {
  const blocks = new Array(96).fill(0);
  for (const l of levels) {
    let m = minuteOfDay(l.start);
    const end = l.end ? Math.max(m + 1, minuteOfDay(l.end) || 1440) : m + 1;
    for (; m < Math.min(end, 1440); m += 1) { const k = Math.floor(m / 15); blocks[k] = Math.max(blocks[k], l.level); }
  }
  return blocks;
}

const mean = (a) => { const v = a.filter((x) => x !== null && x !== undefined); return v.length ? v.reduce((p, q) => p + q, 0) / v.length : null; };

/** Builds the Overview model for `today` from a map of day -> bundle (missing days = gaps). */
export function buildOverview(bundles, now = new Date(), trendDays = 14) {
  const today = pacificDay(now);
  const days = Array.from({ length: trendDays }, (_, k) => addDays(today, k - trendDays + 1));
  const metrics = Object.fromEntries(days.map((d) => [d, dayMetrics(bundles[d] ?? null)]));
  const latestDay = Object.keys(bundles).filter((d) => d <= today).sort().at(-1) ?? null;
  const cur = latestDay ? (metrics[latestDay] ?? dayMetrics(bundles[latestDay])) : null;
  const series = (k) => days.map((d) => metrics[d]?.[k] ?? null);
  const sig = (k) => { const s = series(k); return { series: s, avg: mean(s.slice(0, -1)), now: cur?.[k] ?? null }; };
  const missing = days.filter((d) => !bundles[d]);
  return {
    today, latestDay, isToday: latestDay === today, days, missing,
    current: cur ? { ...cur, levels: undefined, strip: activityStrip(cur.levels) } : null,
    signals: { rhr: sig('rhr'), hrv: sig('hrv'), breathing: sig('breathing'), spo2: sig('spo2'), tempDeltaC: sig('tempDeltaC') },
    sleepHours: days.map((d) => (metrics[d]?.sleep?.asleep ?? null) === null ? null : metrics[d].sleep.asleep / 60),
    steps: series('steps'),
    exercises: days.flatMap((d) => (metrics[d]?.exercises ?? []).map((e) => ({ ...e, day: d }))),
  };
}

export async function readFitbitBundles(vault, now = new Date(), trendDays = 14) {
  const dir = join(vault, 'fitness/fitbit-air/raw');
  const today = pacificDay(now);
  const from = addDays(today, -trendDays - 30);
  const names = (await readdir(dir)).filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0, 10) <= today && n.slice(0, 10) >= from);
  const out = {};
  await Promise.all(names.map(async (n) => {
    try { out[n.slice(0, 10)] = JSON.parse(await readFile(join(dir, n), 'utf8')); } catch { /* unreadable day = gap */ }
  }));
  return out;
}
