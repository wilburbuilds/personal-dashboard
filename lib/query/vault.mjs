import { DatabaseSync } from 'node:sqlite';
import { readdirSync, statSync, readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const SKIP = new Set(['node_modules', 'attachments', '.git', '.obsidian', '.trash']);

function* walk(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && e.name.endsWith('.md')) yield p;
  }
}
const titleOf = (body, rel) => /^#\s+(.+)$/m.exec(body)?.[1].trim() || rel.split(sep).pop().replace(/\.md$/, '');

/** SQLite FTS5 index over markdown vaults, refreshed by file mtime. */
export function createVaultIndex({ dbPath, vaults, minRefreshMs = 30000 }) {
  if (dbPath !== ':memory:') mkdirSync(join(dbPath, '..'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`create table if not exists files(path text primary key, vault text, mtime real);
    create virtual table if not exists docs using fts5(path unindexed, vault unindexed, title, body, tokenize='porter unicode61');`);
  let refreshedAt = 0;
  let building = null;

  function refresh(force = false) {
    if (!force && Date.now() - refreshedAt < minRefreshMs) return { changed: 0 };
    const known = new Map(db.prepare('select path, mtime from files').all().map((r) => [r.path, r.mtime]));
    const seen = new Set();
    let changed = 0;
    const del = db.prepare('delete from docs where path = ?');
    const ins = db.prepare('insert into docs(path, vault, title, body) values (?, ?, ?, ?)');
    const up = db.prepare('insert into files(path, vault, mtime) values (?, ?, ?) on conflict(path) do update set mtime = excluded.mtime');
    db.exec('begin');
    try {
      for (const v of vaults) {
        for (const abs of walk(v.path)) {
          const key = v.id + ':' + relative(v.path, abs);
          seen.add(key);
          const m = statSync(abs).mtimeMs;
          if (known.get(key) === m) continue;
          const body = readFileSync(abs, 'utf8');
          del.run(key);
          ins.run(key, v.id, titleOf(body, abs), body);
          up.run(key, v.id, m);
          changed++;
        }
      }
      for (const k of known.keys()) if (!seen.has(k)) { del.run(k); db.prepare('delete from files where path = ?').run(k); changed++; }
      db.exec('commit');
    } catch (e) { db.exec('rollback'); throw e; }
    refreshedAt = Date.now();
    return { changed };
  }

  function search(q, { scopes, limit = 40 }) {
    const terms = q.match(/[\p{L}\p{N}_]+/gu) || [];
    if (!terms.length) return [];
    const allowed = vaults.filter((v) => !scopes?.length || scopes.includes(v.id)).map((v) => v.id);
    if (!allowed.length) return [];
    const marks = allowed.map(() => '?').join(',');
    const sql = `select path, vault, title, snippet(docs, 3, char(1), char(2), '…', 16) as snip, bm25(docs, 0, 0, 6, 1) as score
      from docs where docs match ? and vault in (${marks}) order by score limit ?`;
    const stmt = db.prepare(sql);
    const phrase = terms.length > 1 ? stmt.all('"' + terms.join(' ') + '"', ...allowed, limit) : [];
    const loose = stmt.all(terms.map((t) => `"${t}"*`).join(' '), ...allowed, limit);
    const seen = new Set();
    return [...phrase, ...loose].filter((r) => !seen.has(r.path) && seen.add(r.path)).slice(0, limit).map((r) => ({
      backend: 'vault', id: r.path, vault: r.vault, path: r.path.slice(r.vault.length + 1), title: r.title, snippet: r.snip, score: r.score,
    }));
  }

  function read(vaultId, rel) {
    const v = vaults.find((x) => x.id === vaultId);
    if (!v) return null;
    const root = realpathSync(v.path);
    let abs;
    try { abs = realpathSync(join(root, rel)); } catch { return null; }
    if (!abs.startsWith(root + sep) || !abs.endsWith('.md')) return null;
    return readFileSync(abs, 'utf8');
  }

  const count = () => Object.fromEntries(db.prepare('select vault, count(*) as n from files group by vault').all().map((r) => [r.vault, r.n]));
  return { refresh, search, read, count, get building() { return building; } };
}
