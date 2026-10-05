export type MarketStripQuote = {
  symbol: string;
  value: string;
  change: string;
  direction: 'up' | 'down';
};
export type MarketBook = {
  direction: 'up' | 'down';
  label: string;
  sub: string;
  pct: string;
  dollars: string;
};
export type MarketPosition = {
  ticker: string;
  detail: string | null;
  quantity: string;
  direction: 'up' | 'down';
  pct: string;
  dollars: string;
  sparkline: { priorY: number | null; points: string; color: string } | null;
};
export type MarketsSource = {
  status: 'ready' | 'unconnected' | 'error';
  updatedAt: string | null;
  strip: MarketStripQuote[];
  book: MarketBook | null;
  positions: MarketPosition[];
  note: string;
};
export function fetchYahooQuote(symbol: string): Promise<{
  symbol: string;
  last: number;
  prev: number | null;
  change: number | null;
  changePct: number | null;
}>;
export function stripFromQuotes(
  spy: { last: number; change: number | null; changePct: number | null } | null,
  tnx: { last: number; change: number | null; changePct: number | null } | null,
): MarketStripQuote[];
export function parseMorningMarkets(html?: string): {
  strip: MarketStripQuote[];
  book: MarketBook | null;
  positions: MarketPosition[];
};
export function readMarketsSource(options?: {
  morningPath?: string;
  fetchQuotes?: typeof fetchYahooQuote;
}): Promise<MarketsSource>;
