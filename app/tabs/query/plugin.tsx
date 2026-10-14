import { Search } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { homeConfig } from '@/lib/home-config.mjs';
import { vaultIndex } from '@/lib/query/backends.mjs';
import QueryView from './view';

export type QueryData = { vaults: { id: string; label: string; docs: number }[]; q: string; indexedMs: number; open: { vault: string; path: string } | null; md: { checkboxes: string; dataview: string } };

const query: TabPlugin<QueryData> = {
  id: 'query', title: 'Query', icon: Search, order: 5, status: 'beta', refreshSeconds: 0,
  async load({ params }) {
    const t0 = performance.now();
    const index = vaultIndex();
    index.refresh();
    const counts = index.count();
    return ok({
      vaults: homeConfig.query.vaults.map((v) => ({ id: v.id, label: v.label, docs: counts[v.id] ?? 0 })),
      md: homeConfig.markdown,
      q: params.get('q') || '',
      open: (() => { const o = params.get('open'); const i = o?.indexOf(':') ?? -1; return o && i > 0 ? { vault: o.slice(0, i), path: o.slice(i + 1) } : null; })(),
      indexedMs: Math.round(performance.now() - t0),
    });
  },
  View: QueryView,
};
export default query;
