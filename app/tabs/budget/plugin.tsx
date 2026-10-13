import { Wallet } from 'lucide-react';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { TabPlugin } from '../types';
import { ok, fail } from '../types';
import { homeConfig } from '@/lib/home-config.mjs';
import { buildBudgetView } from '@/lib/budget/model.mjs';
import BudgetView from './view';

const cacheSchema = z.object({
  fetchedAt: z.string(), budgetName: z.string(),
  transactions: z.array(z.object({ date: z.string(), amount: z.number(), category: z.string(), account: z.string(), payee: z.string() })),
  budgets: z.record(z.record(z.number())),
  accounts: z.array(z.object({ name: z.string(), closed: z.boolean(), balance: z.number(), balance30: z.number() })),
});
const statusSchema = z.object({ ok: z.boolean(), error: z.string().optional(), finishedAt: z.string().optional() });

export type BudgetData = ReturnType<typeof buildBudgetView> & { actualURL: string; syncError: string | null; staleCache: boolean };

const budget: TabPlugin<BudgetData> = {
  id: 'budget', title: 'Budget', icon: Wallet, order: 4, status: 'beta', refreshSeconds: 300,
  async load({ now }) {
    let raw: string;
    try { raw = await readFile(join(homeConfig.dataDir, 'budget.json'), 'utf8'); } catch {
      return fail(new Error('No Budget snapshot yet. The sync job writes one within 30 minutes of install, or press Sync now.'));
    }
    const cache = cacheSchema.parse(JSON.parse(raw));
    let syncError: string | null = null;
    try {
      const s = statusSchema.parse(JSON.parse(await readFile(join(homeConfig.dataDir, 'budget-sync-status.json'), 'utf8')));
      if (!s.ok) syncError = s.error || 'Last sync failed';
    } catch {}
    const view = buildBudgetView(cache, now, { ...homeConfig.budget, actualURL: homeConfig.actual.publicURL });
    const staleCache = now.getTime() - Date.parse(cache.fetchedAt) > 2 * homeConfig.actual.syncEverySeconds * 1000;
    return ok({ ...view, actualURL: homeConfig.actual.publicURL, syncError, staleCache }, new Date(cache.fetchedAt));
  },
  View: BudgetView,
  attention: (d) => {
    const n = d.actions.filter((a) => a.tone === 'over' || a.tone === 'warn').length;
    return n ? { count: n, tone: d.actions.some((a) => a.tone === 'over') ? 'over' : 'warn' } : null;
  },
  summary: (d) => {
    const n = d.actions.filter((a) => a.tone === 'over' || a.tone === 'warn').length;
    if (n) return `${n} to act on`;
    return d.totals.target ? (d.totals.overPace > 0 ? `$${Math.round(d.totals.overPace / 100)} over pace` : 'On pace') : `$${Math.round(d.totals.spent / 100)} spent`;
  },
};
export default budget;
