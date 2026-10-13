import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVaultIndex } from '../lib/query/vault.mjs';
import { runQuery, ontologyStub } from '../lib/query/backends.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'hdq-'));
  mkdirSync(join(root, 'p/home'), { recursive: true });
  mkdirSync(join(root, 'w'), { recursive: true });
  writeFileSync(join(root, 'p/home/services.md'), '# Mac mini services\n\nColima virtiofs: db/ and files/ stay mode 777.\n');
  writeFileSync(join(root, 'p/other.md'), '# Other\n\nmode files colima mentioned loosely 777 elsewhere virtiofs.\n');
  writeFileSync(join(root, 'w/work.md'), '# Work\n\nColima at work.\n');
  for (let i = 0; i < 500; i++) writeFileSync(join(root, `p/n${i}.md`), `# Note ${i}\n\nfiller text about groceries and plans ${i}\n`);
  const vaults = [{ id: 'personal', path: join(root, 'p') }, { id: 'work', path: join(root, 'w') }];
  return { root, vaults, index: createVaultIndex({ dbPath: ':memory:', vaults, minRefreshMs: 0 }) };
}

test('a known phrase returns its file first in under 300 ms', () => {
  const { index } = fixture();
  index.refresh(true);
  const t0 = performance.now();
  const hits = index.search('Colima virtiofs: db/ and files/ stay mode 777', { scopes: [], limit: 20 });
  const ms = performance.now() - t0;
  assert.equal(hits[0].path, 'home/services.md');
  assert.ok(ms < 300, `took ${ms} ms`);
});

test('scopes limit vaults and mtime changes reindex', () => {
  const { index, root } = fixture();
  index.refresh(true);
  assert.deepEqual(index.search('colima', { scopes: ['work'], limit: 5 }).map((h) => h.vault), ['work']);
  writeFileSync(join(root, 'w/work.md'), '# Work\n\nNothing here now.\n');
  utimesSync(join(root, 'w/work.md'), new Date(), new Date(Date.now() + 5000));
  assert.equal(index.refresh(true).changed, 1);
  assert.equal(index.search('colima', { scopes: ['work'], limit: 5 }).length, 0);
});

test('swapping in a stub ontology backend keeps the Hit shape', async () => {
  const { index } = fixture();
  index.refresh(true);
  const vault = { id: 'vault', label: 'Vaults', search: async (q, o) => index.search(q, o) };
  const a = await runQuery([vault], 'colima', { scopes: [], limit: 10 });
  const b = await runQuery([vault, ontologyStub], 'colima', { scopes: [], limit: 10 });
  assert.deepEqual(b.hits, a.hits);
  assert.deepEqual(Object.keys(a.hits[0]).sort(), ['backend', 'id', 'path', 'score', 'snippet', 'title', 'vault']);
});

test('read refuses paths outside the vault', () => {
  const { index } = fixture();
  assert.equal(index.read('personal', '../w/work.md'), null);
  assert.match(index.read('personal', 'home/services.md'), /virtiofs/);
});
