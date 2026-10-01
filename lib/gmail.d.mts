import type { Snapshot } from './dashboard';

export const GMAIL_SCOPES: string[];
export const GOOGLE_SCOPES: string[];
export { CALENDAR_SCOPES, configDirectory, oauthPath, tokensPath } from './calendar.mjs';

export function overnightBounds(
  now?: Date,
  options?: { timeZone?: string; lookbackHours?: number },
): { start: Date; end: Date; day: string; startDay: string; endDay: string };

export function isNeedsYou(message: unknown): boolean;

export function overnightSource(
  messages?: unknown[],
  now?: Date,
  options?: { timeZone?: string; lookbackHours?: number; fetchedAt?: string; limit?: number },
): Snapshot['sources']['overnight'];

export function followupsSource(
  messages?: unknown[],
  now?: Date,
  options?: { timeZone?: string; newerThanDays?: number; fetchedAt?: string; limit?: number },
): Snapshot['sources']['followups'];

export function fetchMessagesMetadata(accessToken: string, ids?: string[]): Promise<unknown[]>;
export function fetchOvernightAndFollowupMessages(
  accessToken: string,
  now?: Date,
): Promise<{ messages: unknown[]; overnightRefs: unknown[]; followupRefs: unknown[] }>;
export function readGmailSources(now?: Date): Promise<{
  overnight: Snapshot['sources']['overnight'];
  followups: Snapshot['sources']['followups'];
}>;
