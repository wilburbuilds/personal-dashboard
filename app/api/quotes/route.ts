import { getQuotes, MACRO } from '@/lib/quotes.mjs';
import { getSettings } from '@/lib/settings.mjs';
import { isDemo, demoQuotes } from '@/lib/demo/fixtures.mjs';
export const dynamic = 'force-dynamic';

/** Day moves for the macro row and the watch list in Settings › Today. Server-side, cached 60 s. GET only. */
export async function GET() {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (isDemo()) return Response.json(demoQuotes(), { headers });
  const tickers = getSettings().today.tickers;
  const macroSyms = MACRO.map((m) => m.symbol);
  const all = await getQuotes([...new Set([...macroSyms, ...tickers])]);
  const by = new Map(all.map((q) => [q.symbol, q]));
  const fetched = all.flatMap((q) => ('fetchedAt' in q ? [q.fetchedAt] : [])).sort().at(-1) ?? null;
  return Response.json({
    fetchedAt: fetched,
    macro: MACRO.map((m) => ({ ...by.get(m.symbol)!, label: m.label, kind: m.kind })),
    tickers: tickers.map((t) => by.get(t)!),
  }, { headers });
}
