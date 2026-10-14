import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { TICKER_RE } from './quotes.mjs';

/**
 * Optional ranking source: an ordered list of underlying tickers, largest position first, written
 * by a local agent. Order only; any numbers in the file are ignored and never read into the app.
 *   ~/.local/share/home-dashboard/holdings-rank.json
 *   { "updatedAt": "2026-10-13T20:00:00-07:00", "tickers": ["SPY", "MU", "NVDA"] }
 */
export const rankPath = () => process.env.HD_HOLDINGS_RANK_FILE || join(homedir(), '.local/share/home-dashboard/holdings-rank.json');
export const RANK_MAX_AGE_MS = 7 * 864e5;

export async function readTickerRank(path = rankPath(), now = Date.now()) {
  try {
    const [raw, st] = await Promise.all([readFile(path, 'utf8'), stat(path)]);
    const j = JSON.parse(raw);
    const list = Array.isArray(j?.tickers) ? j.tickers : null;
    if (!list) return null;
    const tickers = [...new Set(list.map((t) => String(t).trim().toUpperCase()).filter((t) => TICKER_RE.test(t)))].slice(0, 30);
    const at = Date.parse(j.updatedAt) || st.mtimeMs;
    if (!tickers.length || now - at > RANK_MAX_AGE_MS) return null;
    return { tickers, updatedAt: new Date(at).toISOString() };
  } catch { return null; }
}

/** The watch list in display order: the rank file's order when given, then saved tickers it doesn't mention. */
export function orderTickers(saved, rank) {
  if (!rank) return [...saved];
  return [...new Set([...rank.tickers, ...saved])];
}
