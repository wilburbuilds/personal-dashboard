import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { impliedValue, readMarketsSource } from '../lib/markets.mjs';
import { readXTrends } from '../lib/x-trends.mjs';

const dir = mkdtempSync(join(tmpdir(), 'hd-v5-'));

test('implied value comes from the day move', () => {
  assert.equal(Math.round(impliedValue('+8.08%', '+$508')), 6795);
  assert.equal(Math.round(impliedValue('−1.50%', '−$5.22')), 343);
  assert.equal(impliedValue('0.00%', '$0'), null);
  assert.equal(impliedValue('', ''), null);
});

const pos = (t, pct, d) => `<li class="pos up"><span class="ticker">${t}</span><span class="shares">1 share</span><span class="pct">${pct}</span><span class="dollars">${d}</span></li>`;
test('positions sort largest first and carry the file time', async () => {
  const f = join(dir, 'index.html');
  writeFileSync(f, pos('SMALL', '+1.00%', '+$1') + pos('BIG', '+1.00%', '+$100') + pos('MID', '+1.00%', '+$10'));
  const at = new Date('2026-10-05T19:14:00Z');
  utimesSync(f, at, at);
  const m = await readMarketsSource({ morningPath: f, fetchQuotes: async () => { throw new Error('offline'); } });
  assert.deepEqual(m.positions.map((p) => p.ticker), ['BIG', 'MID', 'SMALL']);
  assert.equal(m.holdingsAt, at.toISOString());
});

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
