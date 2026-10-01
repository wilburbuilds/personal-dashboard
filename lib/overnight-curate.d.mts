import type { Snapshot } from './dashboard';

export const CURATION_RECORD_ID: 'overnight-curation';
export const CURATION_LIMIT: 5;
export const GROK_CURATE_SCHEMA: Record<string, unknown>;

export function messageToOvernightItem(
  message: unknown,
  options?: { timeZone?: string; reason?: string },
): Snapshot['sources']['overnight']['items'][number] & { id?: string };

export function isObviousNoise(message: unknown): boolean;
export function importanceScore(message: unknown): number;
export function heuristicSelect(
  messages?: unknown[],
  options?: { limit?: number; minScore?: number },
): { message: unknown; score: number; reason: string }[];

export function overnightCandidateMessages(
  messages?: unknown[],
  now?: Date,
  options?: { timeZone?: string; lookbackHours?: number },
): unknown[];

export function buildCuratedSource(
  selected?: { message: unknown; reason?: string }[],
  now?: Date,
  options?: { timeZone?: string; fetchedAt?: string; candidateCount?: number; mode?: string },
): Snapshot['sources']['overnight'];

export function curationDayKey(now?: Date, options?: { timeZone?: string }): string;
export function isFreshCuration(record: unknown, now?: Date, options?: { timeZone?: string }): boolean;
export function applyOvernightCuration(
  rawOvernight: Snapshot['sources']['overnight'],
  curationRecord: unknown,
  now?: Date,
  options?: { timeZone?: string },
): Snapshot['sources']['overnight'];

export function buildCurationRecord(input: {
  source: Snapshot['sources']['overnight'];
  now?: Date;
  mode?: string;
  candidateCount?: number;
  keptCount?: number;
  options?: { timeZone?: string };
}): {
  date: string;
  curatedAt: string;
  mode: string;
  candidateCount: number;
  keptCount: number;
  source: Snapshot['sources']['overnight'];
};

export function candidatesForLlm(messages?: unknown[]): unknown[];
export function buildGrokCuratePrompt(candidates: unknown[]): string;
export function selectByIds(
  messages: unknown[],
  ranked?: { id?: string; reason?: string; priority?: number }[],
  options?: { limit?: number },
): { message: unknown; reason: string; score: number }[];

export function rankWithGrokCli(
  candidates: unknown[],
  options?: { grokBin?: string; schema?: unknown },
): Promise<{ noneImportant?: boolean; important: { id: string; reason?: string; priority?: number }[] }>;

export function curateOvernightMessages(
  messages?: unknown[],
  now?: Date,
  options?: {
    timeZone?: string;
    lookbackHours?: number;
    limit?: number;
    useGrok?: boolean;
    grokRequired?: boolean;
    grokBin?: string;
    fetchedAt?: string;
  },
): Promise<{
  record: ReturnType<typeof buildCurationRecord>;
  source: Snapshot['sources']['overnight'];
  candidates: unknown[];
  selected: { message: unknown; reason: string; score: number }[];
  mode: string;
}>;
