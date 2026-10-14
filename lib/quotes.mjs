/**
 * Day moves for a watch list plus a macro row (SPY, US 10-year, WTI crude). Free, no-signup:
 * Yahoo's public chart endpoint (query1, falling back to query2). Stooq was the planned fallback,
 * but its CSV endpoints now sit behind a JavaScript challenge, so it's not used. Results are cached
 * in memory for 60 s; on failure the last good quote is served and marked stale.
 * Nothing here knows about holdings, quantities or P&L.
 */
const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
const UA = 'Mozilla/5.0 (compatible; home-dashboard/0.1)';
export const TTL_MS = 60_000;
export const MACRO = [
  { symbol: 'SPY', label: 'S&P 500 (SPY)', kind: 'price' },
  { symbol: '^TNX', label: 'US 10-year', kind: 'yield' },
  { symbol: 'CL=F', label: 'WTI crude', kind: 'price' },
];
export const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
export const normTicker = (s) => String(s ?? '').trim().toUpperCase();

/** Turn closes into an 84x32 polyline (same box the Today card already uses). */
export function sparkline(closes, prev) {
  const v = closes.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  const lo = Math.min(...v, prev ?? Infinity), hi = Math.max(...v, prev ?? -Infinity);
  const span = hi - lo || 1;
  const y = (n) => +(30 - ((n - lo) / span) * 28).toFixed(1);
  const step = 76 / (v.length - 1);
  return { points: v.map((n, i) => `${+(4 + i * step).toFixed(1)},${y(n)}`).join(' '), priorY: prev != null ? y(prev) : null };
}

export function parseChart(symbol, json) {
  const r = json?.chart?.result?.[0];
  if (!r) throw Error(`${symbol}: no data`);
  const m = r.meta ?? {};
  const closes = (r.indicators?.quote?.[0]?.close ?? []).map((v) => (v == null ? NaN : Number(v)));
  const price = Number(m.regularMarketPrice ?? closes.filter(Number.isFinite).at(-1));
  const prev = Number(m.chartPreviousClose ?? m.previousClose);
  if (!Number.isFinite(price)) throw Error(`${symbol}: no price`);
  const ok = Number.isFinite(prev) && prev !== 0;
  return {
    symbol, name: m.shortName || m.longName || symbol, price, prev: ok ? prev : null,
    change: ok ? price - prev : null, pct: ok ? ((price - prev) / prev) * 100 : null,
    at: m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toISOString() : null,
    spark: sparkline(closes, ok ? prev : null),
  };
}

export async function fetchChart(symbol, fetchImpl = fetch) {
  let last;
  for (const host of HOSTS) {
    try {
      const res = await fetchImpl(`${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(6000), cache: 'no-store',
      });
      if (!res.ok) throw Error(`${symbol}: ${res.status}`);
      return parseChart(symbol, await res.json());
    } catch (e) { last = e; }
  }
  throw last;
}

const cache = new Map(); // symbol -> { at, quote }
/** Quotes for symbols, each cached TTL_MS. Failed symbols return the last good quote (stale) or an error row. */
export async function getQuotes(symbols, { now = Date.now(), fetchImpl = fetch } = {}) {
  const out = await Promise.all(symbols.map(async (symbol) => {
    const hit = cache.get(symbol);
    if (hit && now - hit.at < TTL_MS) return { ...hit.quote, fetchedAt: new Date(hit.at).toISOString(), stale: false };
    try {
      const quote = await fetchChart(symbol, fetchImpl);
      cache.set(symbol, { at: now, quote });
      return { ...quote, fetchedAt: new Date(now).toISOString(), stale: false };
    } catch (e) {
      if (hit) return { ...hit.quote, fetchedAt: new Date(hit.at).toISOString(), stale: true };
      return { symbol, error: e instanceof Error ? e.message : 'unavailable' };
    }
  }));
  return out;
}
export const _clearQuoteCache = () => cache.clear();
