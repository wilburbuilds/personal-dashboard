export declare const RANK_MAX_AGE_MS: number;
export declare function rankPath(): string;
export declare function readTickerRank(path?: string, now?: number): Promise<{ tickers: string[]; updatedAt: string } | null>;
export declare function orderTickers(saved: string[], rank: { tickers: string[] } | null): string[];
