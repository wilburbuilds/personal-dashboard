import type { Snapshot } from './dashboard';

export const CALENDAR_SCOPES: string[];

export function configDirectory(root?: string): string;
export function oauthPath(dir?: string): string;
export function tokensPath(dir?: string): string;
export function zonedCivilTime(day: string, hms: string, timeZone?: string): Date;
export function pacificDayBounds(now?: Date, timeZone?: string): { day: string; timeMin: Date; timeMax: Date };
export function calendarSource(
  events?: unknown[],
  now?: Date,
  options?: {
    timeZone?: string;
    horizonHours?: number;
    fetchedAt?: string;
    calendarLabel?: string;
  },
): Snapshot['sources']['calendar'];
export function loadOAuthConfig(path?: string): Promise<{
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  token_path?: string;
} | null>;
export function loadTokens(path?: string): Promise<Record<string, unknown> | null>;
export function saveTokens(tokens: unknown, path?: string): Promise<void>;
export function refreshAccessToken(oauth: { client_id: string; client_secret: string }, tokens: { refresh_token?: string }): Promise<Record<string, unknown>>;
export function fetchPrimaryEvents(
  accessToken: string,
  options?: { timeMin?: Date | string; timeMax?: Date | string; timeZone?: string },
): Promise<unknown[]>;
export function readCalendarSource(now?: Date): Promise<Snapshot['sources']['calendar']>;
