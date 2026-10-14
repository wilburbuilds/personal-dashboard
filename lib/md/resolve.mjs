import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, relative, sep, extname } from 'node:path';
import { homeConfig } from '../home-config.mjs';
import { referencedTargets, wikiKey, IMG, splitFrontmatter } from './plugins.mjs';

/** Server-side wikilink and embed resolution against the vault file index (read-only). */
const SKIP = new Set(['node_modules', '.git', '.obsidian', '.trash']);
let cache = null;
function fileIndex() {
  if (cache && Date.now() - cache.at < 60000) return cache;
  const byKey = new Map();
  for (const v of homeConfig.query.vaults) {
    const walk = (dir) => {
      let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.isFile() && (e.name.endsWith('.md') || IMG.test(e.name))) {
          const rel = relative(v.path, p);
          const add = (k) => { const l = byKey.get(k) ?? []; l.push({ vault: v.id, path: rel }); byKey.set(k, l); };
          add(wikiKey(e.name)); add(wikiKey(rel.split(sep).join('/')));
        }
      }
    };
    walk(v.path);
  }
  cache = { at: Date.now(), byKey };
  return cache;
}

export function resolveTarget(target, fromVault) {
  const hits = fileIndex().byKey.get(wikiKey(target)) ?? [];
  return hits.find((h) => h.vault === fromVault) ?? hits[0] ?? null;
}

export function readVaultFile(vaultId, rel, { image = false } = {}) {
  const v = homeConfig.query.vaults.find((x) => x.id === vaultId);
  if (!v) return null;
  try {
    const root = realpathSync(v.path);
    const abs = realpathSync(join(root, rel));
    if (!abs.startsWith(root + sep)) return null;
    if (image ? !IMG.test(abs) : extname(abs) !== '.md') return null;
    if (statSync(abs).size > 8 * 1024 * 1024) return null;
    return image ? readFileSync(abs) : readFileSync(abs, 'utf8');
  } catch { return null; }
}

const titleOf = (body, rel) => /^#\s+(.+)$/m.exec(body)?.[1].trim() || rel.split('/').pop().replace(/\.md$/, '');

/** @returns {{links: Record<string, {vault:string,path:string}|null>, embeds: Record<string, {kind:'note',vault:string,path:string,title:string,body:string}|{kind:'image',src:string,name:string}|null>}} */
export function resolveRefs(body, fromVault, depth = 0) {
  const { links, embeds } = referencedTargets(body);
  const out = { links: {}, embeds: {} };
  for (const t of links) out.links[t] = resolveTarget(t, fromVault);
  for (const t of embeds) {
    const hit = resolveTarget(t, fromVault);
    if (!hit) { out.embeds[t] = null; continue; }
    if (IMG.test(hit.path)) { out.embeds[t] = { kind: 'image', name: hit.path.split('/').pop(), src: `/api/query/file?vault=${encodeURIComponent(hit.vault)}&path=${encodeURIComponent(hit.path)}` }; continue; }
    const b = depth > 0 ? '' : readVaultFile(hit.vault, hit.path) ?? '';
    // Nesting stops after one level: embedded notes get links resolved but no further embeds.
    const content = splitFrontmatter(b).content.slice(0, 6000);
    const nested = resolveRefs(content.replace(/!\[\[/g, '[['), hit.vault, depth + 1);
    Object.assign(out.links, nested.links);
    out.embeds[t] = { kind: 'note', vault: hit.vault, path: hit.path, title: titleOf(b, hit.path), body: content.replace(/!\[\[/g, '[[') };
  }
  return out;
}
