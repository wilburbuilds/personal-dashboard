import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart';
const UA = 'Mozilla/5.0 (compatible; personal-dashboard/0.1)';

function emptyMarkets(note, status = 'unconnected') {
  return {
    status,
    updatedAt: null,
    strip: [],
    book: null,
    positions: [],
    note,
  };
}

export async function fetchYahooQuote(symbol) {
  const url = `${YAHOO}/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!res.ok) throw Error(`Yahoo ${symbol} ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw Error(`Yahoo ${symbol} empty`);
  const meta = result.meta ?? {};
  const closes = (result.indicators?.quote?.[0]?.close ?? []).filter((v) => Number.isFinite(v));
  const last = Number(meta.regularMarketPrice ?? closes.at(-1));
  const prev = Number(
    meta.chartPreviousClose ?? meta.previousClose ?? (closes.length > 1 ? closes.at(-2) : NaN),
  );
  if (!Number.isFinite(last)) throw Error(`Yahoo ${symbol} price`);
  const change = Number.isFinite(prev) ? last - prev : null;
  const changePct = Number.isFinite(prev) && prev !== 0 ? (change / prev) * 100 : null;
  return { symbol, last, prev: Number.isFinite(prev) ? prev : null, change, changePct };
}

function formatPrice(n, digits = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatSigned(n, digits = 2, suffix = '') {
  const abs = Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return `${n >= 0 ? '+' : '−'}${abs}${suffix}`;
}

export function stripFromQuotes(spy, tnx) {
  const strip = [];
  if (spy) {
    const up = (spy.change ?? 0) >= 0;
    strip.push({
      symbol: 'SPY',
      value: formatPrice(spy.last),
      change: spy.changePct == null ? '—' : formatSigned(spy.changePct, 2, '%'),
      direction: up ? 'up' : 'down',
    });
  }
  if (tnx) {
    const up = (tnx.change ?? 0) >= 0;
    strip.push({
      symbol: 'US 10-year',
      value: `${formatPrice(tnx.last, 3)}%`,
      change: tnx.change == null ? '—' : formatSigned(tnx.change, 2),
      direction: up ? 'up' : 'down',
    });
  }
  return strip;
}

function decode(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#8722;|&minus;/g, '−')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

/** Parse the Quiet-list block written into ~/morning/index.html by the morning agent. */
export function parseMorningMarkets(html = '') {
  if (!html) return { strip: [], book: null, positions: [] };

  const strip = [...html.matchAll(
    /<span class="sym">([^<]+)<\/span>\s*<span class="num">([^<]+)<\/span>\s*<span class="chg (up|down)">([^<]+)<\/span>/g,
  )].map((m) => ({
    symbol: decode(m[1]),
    value: decode(m[2]),
    direction: m[3],
    change: decode(m[4]),
  }));

  const bookMatch = html.match(
    /day-header (up|down)[\s\S]*?day-kicker">([^<]*)<\/span>[\s\S]*?day-sub">([^<]*)<\/span>[\s\S]*?class="pct">([^<]*)<\/span>[\s\S]*?class="dollars">([^<]*)<\/span>/,
  );
  const book = bookMatch
    ? {
        direction: bookMatch[1],
        label: decode(bookMatch[2]) || 'Today',
        sub: decode(bookMatch[3]),
        pct: decode(bookMatch[4]),
        dollars: decode(bookMatch[5]),
      }
    : null;

  const positions = [];
  const posRe = /<li class="pos (up|down)">([\s\S]*?)<\/li>/g;
  let match;
  while ((match = posRe.exec(html))) {
    const block = match[2];
    const ticker = decode(block.match(/class="ticker">([^<]*)/)?.[1] ?? '');
    if (!ticker) continue;
    const opt = decode(block.match(/class="opt">([^<]*)/)?.[1] ?? '');
    const shares = decode(block.match(/class="shares">([^<]*)/)?.[1] ?? '');
    const pct = decode(block.match(/class="pct">([^<]*)/)?.[1] ?? '');
    const dollars = decode(block.match(/class="dollars">([^<]*)/)?.[1] ?? '');
    const lineY = block.match(/<line[^>]*y1="([^"]+)"/)?.[1] ?? null;
    const points = block.match(/<polyline[^>]*points="([^"]+)"/)?.[1] ?? null;
    const stroke = block.match(/<polyline[^>]*stroke="([^"]+)"/)?.[1] ?? null;
    positions.push({
      ticker,
      detail: opt || null,
      quantity: shares,
      direction: match[1],
      pct,
      dollars,
      sparkline: points
        ? { priorY: lineY ? Number(lineY) : null, points, color: stroke || (match[1] === 'up' ? '#5ac53a' : '#eb5d2a') }
        : null,
    });
  }

  return { strip, book, positions };
}

export async function readMarketsSource({
  morningPath = process.env.DASHBOARD_MORNING_HTML || join(homedir(), 'morning/index.html'),
  fetchQuotes = fetchYahooQuote,
} = {}) {
  let morning = emptyMarkets('Morning markets page unavailable.');
  try {
    const html = await readFile(morningPath, 'utf8');
    const parsed = parseMorningMarkets(html);
    morning = {
      status: parsed.positions.length || parsed.strip.length ? 'ready' : 'unconnected',
      updatedAt: new Date().toISOString(),
      strip: parsed.strip,
      book: parsed.book,
      positions: parsed.positions,
      note: parsed.positions.length
        ? 'Positions from morning Quiet list · strip prefers live quotes when available.'
        : 'No Quiet-list positions found on the morning page yet.',
    };
  } catch {
    // keep empty morning
  }

  let strip = morning.strip;
  let note = morning.note;
  let status = morning.status;
  try {
    const [spy, tnx] = await Promise.all([fetchQuotes('SPY'), fetchQuotes('^TNX')]);
    const live = stripFromQuotes(spy, tnx);
    if (live.length) {
      strip = live;
      status = morning.positions.length ? 'ready' : 'ready';
      note = morning.positions.length
        ? 'Live SPY & US 10-year · positions from morning Quiet list.'
        : 'Live SPY & US 10-year · Quiet-list positions not found yet.';
    }
  } catch {
    if (!strip.length && !morning.positions.length) {
      return emptyMarkets('Market quotes unavailable. Morning Quiet list also missing.', 'error');
    }
    note = morning.positions.length
      ? 'Live quotes unavailable · showing morning strip & Quiet list.'
      : 'Live quotes unavailable.';
    if (status === 'unconnected') status = 'error';
  }

  return {
    status,
    updatedAt: new Date().toISOString(),
    strip,
    book: morning.book,
    positions: morning.positions,
    note,
  };
}
