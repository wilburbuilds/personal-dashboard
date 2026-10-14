export type XTrend = { title: string; url?: string; posts?: string; context?: string };
export type XTrends = { status: 'ready' | 'unconnected' | 'error'; updatedAt: string | null; stale: boolean; items: XTrend[]; note: string };
export function xTrendsPath(): string;
export function readXTrends(path?: string, now?: number, staleHours?: number): Promise<XTrends>;
export function formatPosts(n: number): string;
