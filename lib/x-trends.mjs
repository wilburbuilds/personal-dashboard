import { readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

/**
 * X (Twitter) trends written by a local agent. No API key: the app only reads a file.
 * Path: HD_X_TRENDS_FILE, default ~/.local/share/home-dashboard/x-trends.json
 * {
 *   "updatedAt": "2026-10-13T19:40:00-07:00",
 *   "items": [{ "title": "#Topic", "url": "https://x.com/search?q=%23Topic", "posts": 48000 (or "48K posts"), "context": "Why it's trending" }]
 * }
 */
export const xTrendsPath = () => process.env.HD_X_TRENDS_FILE || join(process.env.HOME || homedir(), '.local/share/home-dashboard/x-trends.json');

/** 36926 → "36.9K posts", 1200000 → "1.2M posts", 950 → "950 posts". */
export function formatPosts(n) {
  const c = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  return `${c} post${n === 1 ? '' : 's'}`;
}

const item = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().url().refine((u) => /^https?:/.test(u)).optional(),
  posts: z.union([z.number().finite().nonnegative(), z.string().max(60)]).nullish().transform((v) => (typeof v === 'number' ? formatPosts(v) : v ?? undefined)),
  context: z.string().max(400).optional(),
});
export const xTrendsSchema = z.object({ updatedAt: z.string().optional(), items: z.array(item).max(50) });

/** @returns {Promise<{ status: 'ready'|'unconnected'|'error'; updatedAt: string|null; stale: boolean; items: z.infer<typeof item>[]; note: string }>} */
export async function readXTrends(path = xTrendsPath(), now = Date.now(), staleHours = 24) {
  let text;
  try { text = await readFile(path, 'utf8'); } catch {
    return { status: 'unconnected', updatedAt: null, stale: false, items: [], note: 'No X trends file yet.' };
  }
  try {
    const parsed = xTrendsSchema.parse(JSON.parse(text));
    const at = parsed.updatedAt && !Number.isNaN(Date.parse(parsed.updatedAt)) ? new Date(parsed.updatedAt).toISOString() : (await stat(path)).mtime.toISOString();
    const stale = now - Date.parse(at) > staleHours * 3600_000;
    return { status: 'ready', updatedAt: at, stale, items: parsed.items, note: stale ? 'X trends are more than a day old.' : 'X trends' };
  } catch {
    return { status: 'error', updatedAt: null, stale: false, items: [], note: 'The X trends file is not valid JSON in the expected shape.' };
  }
}
