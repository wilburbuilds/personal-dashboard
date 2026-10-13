import { join } from 'node:path';
import { homeConfig } from '../home-config.mjs';
import { createVaultIndex } from './vault.mjs';

/** @typedef {{backend:string,id:string,vault:string,path:string,title:string,snippet:string,score:number}} Hit */
/** @typedef {{id:string,label:string,search(q:string,opts:{scopes:string[],limit:number}):Promise<Hit[]>}} QueryBackend */

let index;
export function vaultIndex() {
  index ??= createVaultIndex({ dbPath: join(homeConfig.dataDir, 'query.db'), vaults: homeConfig.query.vaults });
  return index;
}

/** @type {QueryBackend} */
export const vaultBackend = {
  id: 'vault', label: 'Vaults',
  async search(q, opts) { const i = vaultIndex(); i.refresh(); return i.search(q, opts); },
};

/** @type {QueryBackend} A placeholder for the ontology backend; returns nothing until it exists. */
export const ontologyStub = { id: 'ontology', label: 'Ontology', async search() { return []; } };

export const backends = [vaultBackend];

/** Runs every backend and merges hits. The UI only ever sees Hit[]. */
export async function runQuery(list, q, opts) {
  const t0 = performance.now();
  const settled = await Promise.allSettled(list.map((b) => b.search(q, opts)));
  const hits = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : [])).sort((a, b) => a.score - b.score).slice(0, opts.limit);
  const errors = settled.flatMap((s, i) => (s.status === 'rejected' ? [`${list[i].label}: ${s.reason?.message || s.reason}`] : []));
  return { hits, errors, ms: Math.round(performance.now() - t0) };
}
