import type { Snapshot } from './dashboard';

type HeadlineSource = NonNullable<Snapshot['sources']['headlines']>;
type HeadlineItem = HeadlineSource['items'][number];

export const HEADLINES_CURATION_RECORD_ID: 'headlines-curation';
export const HEADLINES_CURATION_LIMIT: 6;
export const MORNING_BRIEFS_REL: string[];

export function pacificDayKey(now?: Date, timeZone?: string): string;
export function personalVaultRoot(): string;
export function morningBriefPath(day: string, root?: string): string;
export function extractHeadlinesSection(markdown: string): string;
export function parseHeadlinesSection(
  markdown: string,
  options?: { limit?: number },
): Array<Pick<HeadlineItem, 'title' | 'url' | 'label' | 'detail'>>;
export function buildCuratedHeadlinesSource(
  items?: Array<Record<string, unknown>>,
  now?: Date,
  options?: { mode?: string; fetchedAt?: string; limit?: number },
): HeadlineSource;
export function buildHeadlinesCurationRecord(args: {
  source: HeadlineSource;
  now?: Date;
  mode?: string;
  options?: { date?: string; timeZone?: string };
}): {
  date: string;
  curatedAt: string;
  mode: string;
  source: HeadlineSource;
};
export function isFreshHeadlinesCuration(
  record: unknown,
  now?: Date,
  options?: { timeZone?: string },
): boolean;
export function readMorningBriefHeadlines(
  now?: Date,
  options?: {
    day?: string;
    root?: string;
    timeZone?: string;
    mode?: string;
    fetchedAt?: string;
    limit?: number;
  },
): Promise<null | {
  day: string;
  path: string;
  items: Array<Pick<HeadlineItem, 'title' | 'url' | 'label' | 'detail'>>;
  source: HeadlineSource;
  markdown: string;
}>;
export function applyHeadlinesCuration(
  rawHeadlines: HeadlineSource,
  context?: {
    vault?: {
      day?: string;
      source?: HeadlineSource;
      items?: unknown[];
    } | null;
    record?: unknown;
  },
  now?: Date,
  options?: { timeZone?: string },
): HeadlineSource;
