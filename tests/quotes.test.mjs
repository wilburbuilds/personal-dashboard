import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChart, getQuotes, sparkline, _clearQuoteCache, TTL_MS } from '../lib/quotes.mjs';

const chart = (price, prev, closes = [prev, (prev + price) / 2, price]) => ({ chart: { result: [{ meta: { regularMarketPrice: price, chartPreviousClose: prev, shortName: 'Thing', regularMarketTime: 1791900000 }, indicators: { quote: [{ close: closes }] } }] } });
const res = (body, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body });

test('parseChart gives a day move, not P&L', () => {
  const q = parseChart('MU', chart(110, 100));
  assert.equal(q.price, 110); assert.equal(q.prev, 100);
  assert.equal(Math.round(q.change), 10); assert.equal(Math.round(q.pct), 10);
  assert.ok(q.spark.points.startsWith('4,'));
  assert.equal(Object.keys(q).some((k) => /qty|quantity|value|pnl|shares/i.test(k)), false);
});

test('sparkline needs two points', () => { assert.equal(sparkline([1], 1), null); });

test('quotes are cached for the TTL and served stale on failure', async () => {
  _clearQuoteCache();
  let calls = 0;
  const ok = async () => { calls++; return res(chart(50, 49)); };
  const t0 = 1_800_000_000_000;
  await getQuotes(['SPY'], { now: t0, fetchImpl: ok });
  await getQuotes(['SPY'], { now: t0 + TTL_MS - 1, fetchImpl: ok });
  assert.equal(calls, 1);
  const bad = async () => { calls++; return res({}, false); };
  const [s] = await getQuotes(['SPY'], { now: t0 + TTL_MS + 1, fetchImpl: bad });
  assert.equal(s.stale, true); assert.equal(s.price, 50);
  const [e] = await getQuotes(['NOPE'], { now: t0, fetchImpl: bad });
  assert.ok('error' in e);
});

test('missing intraday points are skipped, not drawn as zero', () => {
  const q = parseChart('X', chart(10, 9, [9, null, 9.5, null, 10]));
  assert.equal(q.spark.points.split(' ').length, 3);
  assert.ok(q.spark.points.split(' ').every((p) => { const y = Number(p.split(',')[1]); return y >= 2 && y <= 30; }));
});

import { readTickerRank, orderTickers } from '../lib/ticker-rank.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('holdings rank file: order only, validated, falls back to saved order', async () => {
  const f = join(mkdtempSync(join(tmpdir(), 'hd-rank-')), 'r.json');
  assert.equal(await readTickerRank(f), null);
  writeFileSync(f, JSON.stringify({ updatedAt: new Date().toISOString(), tickers: ['msft', 'SPY', 'bad ticker', 'MSFT'], values: [1, 2] }));
  const r = await readTickerRank(f);
  assert.deepEqual(r.tickers, ['MSFT', 'SPY']);
  assert.deepEqual(orderTickers(['SPY', 'AAPL', 'MSFT'], r), ['MSFT', 'SPY', 'AAPL']);
  assert.deepEqual(orderTickers(['SPY', 'AAPL'], null), ['SPY', 'AAPL']);
  writeFileSync(f, JSON.stringify({ updatedAt: '2020-01-01T00:00:00Z', tickers: ['MSFT'] }));
  assert.equal(await readTickerRank(f), null);
});

test('settings: chartUrl accepts TradingView chart URLs only', async () => {
  const { settingsSchema, DEFAULTS } = await import('../lib/settings.mjs');
  const ok = (u) => settingsSchema.safeParse({ ...DEFAULTS, today: { ...DEFAULTS.today, chartUrl: u } }).success;
  assert.equal(DEFAULTS.today.chartUrl, 'https://www.tradingview.com/chart/');
  assert.ok(ok('https://www.tradingview.com/chart/'));
  assert.ok(ok('https://www.tradingview.com/chart/Abc123/'));
  assert.ok(!ok('https://evil.example/chart/'));
  assert.ok(!ok('javascript:alert(1)'));
});
