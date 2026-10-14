import { HeartPulse } from 'lucide-react';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { homeConfig } from '@/lib/home-config.mjs';
import { buildOverview, readFitbitBundles, type Overview } from '@/lib/health-data.mjs';
import { readWorkouts, type Workouts } from '@/lib/workouts.mjs';
import { readDayNote, type DayNote } from '@/lib/workout-note.mjs';
import { resolveRefs } from '@/lib/md/resolve.mjs';
import type { Refs } from '@/components/home/markdown';
import HealthView from './view';

export type HealthData = {
  view: 'overview' | 'workouts' | 'note';
  overview: Overview | null;
  workouts: (Workouts & { refs: Refs }) | null;
  dayNote: DayNote | null;
  note: { path: string; body: string; refs: Refs } | null;
  tempUnit: 'C' | 'F';
  md: { checkboxes: string; dataview: string };
  now: string;
};

const cfg = homeConfig.health;

async function load(params: URLSearchParams): Promise<HealthData> {
  const now = new Date();
  const v = params.get('view');
  const view: HealthData['view'] = v === 'workouts' ? 'workouts' : v === 'note' ? 'note' : 'overview';
  const base = { view, overview: null, workouts: null, dayNote: null, note: null, tempUnit: cfg.tempUnit === 'F' ? 'F' : 'C', md: homeConfig.markdown, now: now.toISOString() } as HealthData;
  if (view === 'note') {
    // Only notes inside the vault's fitness folder are shown here; everything else lives in Query.
    const rel = normalize(params.get('path') || 'training-log.md').replace(/^(\.\.(\/|$))+/, '');
    if (!rel.endsWith('.md') || rel.includes('..')) return { ...base, note: null };
    const body = await readFile(join(cfg.vault, 'fitness', rel), 'utf8').catch(() => null);
    return { ...base, note: body === null ? null : { path: `fitness/${rel}`, body, refs: resolveRefs(body, 'personal') } };
  }
  const bundles = await readFitbitBundles(cfg.vault, now, cfg.trendDays).catch(() => ({}));
  const overview = buildOverview(bundles, now, cfg.trendDays);
  if (view === 'overview') return { ...base, overview };
  const w = await readWorkouts(cfg.vault, now, { logStatus: cfg.logStatus, staleLogDays: cfg.staleLogDays });
  const text = w.log.map((r) => `${r.results}\n${r.notes}`).join('\n');
  const dayNote = await readDayNote(cfg.vault, w.today).catch(() => null);
  return { ...base, overview, dayNote, workouts: { ...w, refs: resolveRefs(text, 'personal') } };
}

const health: TabPlugin<HealthData> = {
  id: 'health', title: 'Health', icon: HeartPulse, order: 4.5, status: 'live', refreshSeconds: 300,
  load: async ({ params }) => ok(await load(params)),
  View: HealthView,
  summary(d) {
    const s = d.overview?.current?.sleep?.asleep;
    return s ? `Slept ${Math.floor(s / 60)}h ${String(Math.round(s % 60)).padStart(2, '0')}m` : 'Fitbit and workouts';
  },
  ...((cfg.badge as boolean | string) === 'stale' ? {
    attention(d: HealthData) {
      const c = d.overview?.current;
      const syncOld = !c?.fetchedAt || Date.now() - Date.parse(c.fetchedAt) > 36 * 3600e3;
      return syncOld ? { count: 1, tone: 'warn' as const } : null;
    },
  } : {}),
};
export default health;
