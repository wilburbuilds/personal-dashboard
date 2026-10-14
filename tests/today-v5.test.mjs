import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readXTrends } from '../lib/x-trends.mjs';

const dir = mkdtempSync(join(tmpdir(), 'hd-v5-'));

test('x trends: missing, valid, stale and invalid files', async () => {
  const f = join(dir, 'x.json');
  assert.equal((await readXTrends(f)).status, 'unconnected');
  writeFileSync(f, JSON.stringify({ updatedAt: '2026-10-13T19:00:00-07:00', items: [{ title: '#One', url: 'https://x.com/search?q=one', posts: '1K posts' }, { title: 'Two' }] }));
  const ok = await readXTrends(f, Date.parse('2026-10-13T20:00:00-07:00'));
  assert.equal(ok.status, 'ready'); assert.equal(ok.items.length, 2); assert.equal(ok.stale, false);
  assert.equal((await readXTrends(f, Date.parse('2026-10-15T20:00:00-07:00'))).stale, true);
  writeFileSync(f, JSON.stringify({ items: [{ title: 'x', url: 'javascript:alert(1)' }] }));
  assert.equal((await readXTrends(f)).status, 'error');
});

test('x-trends: numeric posts are accepted and formatted', async () => {
  const { readXTrends, formatPosts } = await import('../lib/x-trends.mjs');
  assert.equal(formatPosts(36926), '36.9K posts');
  assert.equal(formatPosts(1200000), '1.2M posts');
  assert.equal(formatPosts(950), '950 posts');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const f = `${mkdtempSync(`${tmpdir()}/xt-`)}/x.json`;
  writeFileSync(f, JSON.stringify({ updatedAt: new Date().toISOString(), items: [{ title: 'A', posts: 36926 }, { title: 'B', posts: '2K posts' }, { title: 'C', posts: null }] }));
  const r = await readXTrends(f);
  assert.equal(r.status, 'ready');
  assert.deepEqual(r.items.map((i) => i.posts), ['36.9K posts', '2K posts', undefined]);
});
