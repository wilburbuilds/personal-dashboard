import { Activity } from 'lucide-react';
import { readFile } from 'node:fs/promises';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { homeConfig } from '@/lib/home-config.mjs';
import { parseServices, probeAll, defaultProbes, readHealthFeed, recordHistory, mergeSystems, historyPath } from '@/lib/sources/systems.mjs';
import SystemsView from './view';

import type { State } from '@/components/home/ui';
export type Service = { id: string; name: string; what: string; reach: string; lifecycle: string; state: State; detail: string; source: 'feed' | 'probe'; checkedAt: string; history: (string | null)[] };
export type Systems = { services: Service[]; counts: Record<State, number>; feed: { present: boolean; stale: boolean; checkedAt: string | null; error: string | null }; probedAt: string };
type Probes = Awaited<ReturnType<typeof probeAll>>;

let last: { at: number; probes: Probes; history: Record<string, (string | null)[]> } | null = null;
let inflight: Promise<void> | null = null;

async function refresh() {
  const rows = parseServices(await readFile(homeConfig.systems.servicesFile, 'utf8'));
  const probes = await probeAll(rows, defaultProbes);
  const now = Date.now();
  last = { at: now, probes, history: recordHistory(historyPath(homeConfig.dataDir), probes, now) };
}

const systems: TabPlugin<Systems> = {
  id: 'systems', title: 'Systems', icon: Activity, order: 3, status: 'live', refreshSeconds: 60,
  async load({ now }) {
    const age = last ? now.getTime() - last.at : Infinity;
    if (age > 20000) {
      inflight ??= refresh().finally(() => { inflight = null; });
      if (!last) await inflight;
    }
    const rows = parseServices(await readFile(homeConfig.systems.servicesFile, 'utf8'));
    const feed = readHealthFeed(homeConfig.systems.healthFeed, now.getTime(), homeConfig.systems.feedStaleMinutes);
    return ok({ ...mergeSystems(rows, last!.probes, feed, last!.history, now.getTime()), probedAt: new Date(last!.at).toISOString() } as Systems);
  },
  View: SystemsView,
  attention: (d) => {
    const n = d.counts.down + d.counts.degraded;
    return n ? { count: n, tone: d.counts.down ? 'over' : 'warn' } : null;
  },
  summary: (d) => [d.counts.down && `${d.counts.down} down`, d.counts.degraded && `${d.counts.degraded} degraded`].filter(Boolean).join(', ') || 'All up',
};
export default systems;
