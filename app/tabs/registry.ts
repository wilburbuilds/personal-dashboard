import { cache } from 'react';
import { appendFile } from 'node:fs/promises';
import type { TabPlugin, TabId, LoadCtx, SourceResult } from './types';
import { homeConfig } from '@/lib/home-config.mjs';
import today from './today/plugin';
import projects from './projects/plugin';
import systems from './systems/plugin';
import budget from './budget/plugin';
import query from './query/plugin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const tabs: TabPlugin<any>[] = [today, projects, systems, budget, query].sort((a, b) => a.order - b.order);

export const findTab = (id: string) => tabs.find((t) => t.id === id);
export const visibleTabs = (beta: boolean) => tabs.filter((t) => t.status === 'live' || (beta && t.status === 'beta'));

async function timedLoad(id: TabId, search: string): Promise<SourceResult<unknown>> {
  const plugin = findTab(id)!;
  const ctx: LoadCtx = { now: new Date(), signal: AbortSignal.timeout(8000), params: new URLSearchParams(search) };
  const t0 = performance.now();
  let result: SourceResult<unknown>;
  try {
    result = await plugin.load(ctx);
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const line = { at: new Date().toISOString(), tab: id, ok: result.ok, ms: Math.round(performance.now() - t0), ...(result.ok ? {} : { error: result.error }) };
  appendFile(homeConfig.loadLog, JSON.stringify(line) + '\n').catch(() => {});
  return result;
}

/** One load per tab per request, shared by the nav badges and the page. */
export const loadTab = cache(timedLoad);
