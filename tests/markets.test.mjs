import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMorningMarkets, stripFromQuotes, readMarketsSource } from '../lib/markets.mjs';

const html = `<section class="markets">
  <span class="sym">SPY</span>
  <span class="num">774.15</span>
  <span class="chg up">+0.59%</span>
  <span class="sym">US 10-year</span>
  <span class="num">5.347%</span>
  <span class="chg up">+0.07</span>
</section>
<section class="positions">
  <div class="day-header up">
    <span class="day-kicker">Today</span>
    <span class="day-sub">Monday</span>
    <span class="pct">+6.73%</span>
    <span class="dollars">+$1,281</span>
  </div>
  <ul>
    <li class="pos up">
      <div class="pos-meta">
        <span class="ticker">SPY</span>
        <span class="opt">Jun 30 810 call</span>
        <span class="shares">2</span>
      </div>
      <svg viewBox="0 0 84 32"><line x1="4" y1="13.5" x2="80" y2="13.5"/><polyline points="4.0,23.8 80.0,7.7" fill="none" stroke="#5ac53a"/></svg>
      <div class="pnl"><span class="pct">+8.08%</span><span class="dollars">+$508</span></div>
    </li>
    <li class="pos down">
      <div class="pos-meta">
        <span class="ticker">MUU</span>
        <span class="shares">9.40 shares</span>
      </div>
      <svg viewBox="0 0 84 32"><line x1="4" y1="8.1" x2="80" y2="8.1"/><polyline points="4.0,27.9 80.0,9.4" fill="none" stroke="#eb5d2a"/></svg>
      <div class="pnl"><span class="pct">−1.50%</span><span class="dollars">−$5.22</span></div>
    </li>
  </ul>
</section>`;

test('parses morning strip, book, and Quiet list', () => {
  const m = parseMorningMarkets(html);
  assert.equal(m.strip.length, 2);
  assert.equal(m.strip[0].symbol, 'SPY');
  assert.equal(m.book.pct, '+6.73%');
  assert.equal(m.positions.length, 2);
  assert.equal(m.positions[0].ticker, 'SPY');
  assert.equal(m.positions[0].detail, 'Jun 30 810 call');
  assert.ok(m.positions[0].sparkline.points.includes('4.0,23.8'));
  assert.equal(m.positions[1].direction, 'down');
});

test('stripFromQuotes formats SPY and 10-year', () => {
  const strip = stripFromQuotes(
    { last: 775.81, change: 10.2, changePct: 1.33 },
    { last: 5.311, change: 0.056, changePct: 1.06 },
  );
  assert.equal(strip[0].symbol, 'SPY');
  assert.equal(strip[0].direction, 'up');
  assert.match(strip[0].change, /^\+/);
  assert.equal(strip[1].symbol, 'US 10-year');
  assert.match(strip[1].value, /%/);
});

test('readMarketsSource prefers live strip and keeps morning positions', async () => {
  const { writeFile, mkdtemp, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = await mkdtemp(join(tmpdir(), 'markets-'));
  const path = join(dir, 'index.html');
  await writeFile(path, html);
  try {
    const source = await readMarketsSource({
      morningPath: path,
      fetchQuotes: async (symbol) =>
        symbol === 'SPY'
          ? { symbol, last: 780, prev: 770, change: 10, changePct: 1.2987 }
          : { symbol, last: 5.4, prev: 5.3, change: 0.1, changePct: 1.886 },
    });
    assert.equal(source.status, 'ready');
    assert.equal(source.strip[0].value, '780.00');
    assert.equal(source.positions.length, 2);
    assert.equal(source.book.dollars, '+$1,281');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
