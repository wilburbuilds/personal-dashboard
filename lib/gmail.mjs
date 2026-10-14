import { homedir } from 'node:os';
import {
  CALENDAR_SCOPES,
  configDirectory,
  loadOAuthConfig,
  loadTokens,
  oauthPath,
  refreshAccessToken,
  saveTokens,
  tokensPath,
  zonedCivilTime,
} from './calendar.mjs';

const TZ = 'America/Los_Angeles';
const GMAIL_LIST = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const GMAIL_GET = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

/** Read-only: subject, from, snippet, labels, thread links. No send/modify. */
export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

/** Combined scopes for npm run oauth:google (calendar + gmail). */
export const GOOGLE_SCOPES = [...CALENDAR_SCOPES, ...GMAIL_SCOPES];

export { CALENDAR_SCOPES, configDirectory, oauthPath, tokensPath };

const dayKey = (date, timeZone = TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);

const formatTime = (ms, timeZone = TZ) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));

const formatDayTime = (ms, timeZone = TZ) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));

function headerValue(headers, name) {
  const needle = String(name).toLowerCase();
  const hit = (headers || []).find((h) => String(h?.name || '').toLowerCase() === needle);
  return hit?.value ? String(hit.value) : '';
}

function parseFrom(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Unknown sender';
  const angle = s.match(/^(.+?)\s*<[^>]+>\s*$/);
  if (angle) {
    return angle[1].replace(/^["']|["']$/g, '').trim() || s.slice(0, 120);
  }
  return s.slice(0, 120);
}

function safeUrl(value) {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const u = new URL(value);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    /* ignore */
  }
  return undefined;
}

function gmailOpenUrl(messageId, threadId) {
  if (threadId) return safeUrl(`https://mail.google.com/mail/u/0/#inbox/${threadId}`);
  if (messageId) return safeUrl(`https://mail.google.com/mail/u/0/#all/${messageId}`);
  return undefined;
}

/**
 * Most recent overnight window in Pacific: 22:00 → next day 08:00.
 * If currently inside overnight (hour ≥ 22 or < 8), that ongoing window;
 * otherwise the overnight that just ended at today's 08:00.
 * Clamped so the start is not older than lookbackHours (default 24).
 */
export function overnightBounds(now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const lookbackHours = options.lookbackHours ?? 24;
  const day = dayKey(now, timeZone);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);

  let start;
  let end;
  let startDay;
  let endDay;
  if (hour >= 22) {
    // Ongoing: today 22:00 → tomorrow 08:00
    start = zonedCivilTime(day, '22:00:00', timeZone);
    startDay = day;
    endDay = dayKey(new Date(start.getTime() + 12 * 3600000), timeZone);
    end = zonedCivilTime(endDay, '08:00:00', timeZone);
  } else {
    // Before 8am: ongoing overnight; daytime: last overnight that ended at 08:00
    endDay = day;
    end = zonedCivilTime(day, '08:00:00', timeZone);
    startDay = dayKey(new Date(zonedCivilTime(day, '00:00:00', timeZone).getTime() - 6 * 3600000), timeZone);
    start = zonedCivilTime(startDay, '22:00:00', timeZone);
  }

  const earliest = new Date(now.getTime() - lookbackHours * 3600000);
  if (start.getTime() < earliest.getTime()) {
    start = earliest;
  }
  if (end.getTime() > now.getTime()) {
    end = now;
  }
  if (end.getTime() < start.getTime()) {
    end = start;
  }
  return { start, end, day, startDay, endDay };
}

function labelSet(message) {
  return new Set((message?.labelIds || []).map(String));
}

/**
 * Needs-you heuristic (documented):
 * Inbox messages from the past `newerThanDays` (default 3) that are
 * UNREAD, STARRED, or IMPORTANT. Spam/trash/chat excluded by the list query.
 * Cap applied by caller. Sorted: unread+important, unread, starred, then time desc.
 */
export function isNeedsYou(message) {
  const labels = labelSet(message);
  if (labels.has('SPAM') || labels.has('TRASH') || labels.has('CHAT')) return false;
  return labels.has('UNREAD') || labels.has('STARRED') || labels.has('IMPORTANT');
}

function needsYouRank(message) {
  const labels = labelSet(message);
  const unread = labels.has('UNREAD');
  const important = labels.has('IMPORTANT');
  const starred = labels.has('STARRED');
  if (unread && important) return 0;
  if (unread) return 1;
  if (starred && important) return 2;
  if (starred) return 3;
  if (important) return 4;
  return 5;
}

function mapMessageItem(message, options = {}) {
  const headers = message.payload?.headers || [];
  const subject = (headerValue(headers, 'Subject') || '(no subject)').slice(0, 300);
  const from = parseFrom(headerValue(headers, 'From'));
  const ms = Number(message.internalDate);
  const timeZone = options.timeZone || TZ;
  const labels = labelSet(message);
  const tags = [];
  if (labels.has('UNREAD')) tags.push('Unread');
  if (labels.has('IMPORTANT')) tags.push('Important');
  if (labels.has('STARRED')) tags.push('Starred');
  const snippet = String(message.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const detailParts = [from];
  if (snippet) detailParts.push(snippet);
  const item = {
    title: subject,
    detail: detailParts.join(' · ').slice(0, 1200),
    time: Number.isFinite(ms) ? formatDayTime(ms, timeZone) : undefined,
    url: gmailOpenUrl(message.id, message.threadId),
  };
  if (tags.length) item.label = tags.join(' · ');
  else if (options.defaultLabel) item.label = options.defaultLabel;
  return item;
}

/**
 * Map Gmail message resources → overnight dashboard source.
 * Keeps messages whose internalDate falls in overnightBounds(now).
 */
export function overnightSource(messages = [], now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const { start, end } = overnightBounds(now, { timeZone, lookbackHours: options.lookbackHours ?? 24 });
  const updatedAt = options.fetchedAt || now.toISOString();
  const startMs = start.getTime();
  const endMs = end.getTime();
  const filtered = [];
  for (const message of messages) {
    if (!message) continue;
    const ms = Number(message.internalDate);
    if (!Number.isFinite(ms)) continue;
    if (ms < startMs || ms > endMs) continue;
    filtered.push(message);
  }
  filtered.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
  const items = filtered.slice(0, options.limit ?? 12).map((m) => mapMessageItem(m, { timeZone, defaultLabel: 'Overnight' }));
  const startLabel = formatDayTime(startMs, timeZone);
  const endLabel = formatTime(endMs, timeZone);
  return {
    status: 'ready',
    updatedAt,
    note: items.length
      ? `Gmail overnight · ${startLabel} – ${endLabel} PT (10pm–8am window)`
      : `No overnight mail between ${startLabel} and ${endLabel} PT.`,
    items: items.map(compactItem),
  };
}

/**
 * Map Gmail messages → followups / needs-you source.
 */
export function followupsSource(messages = [], now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const updatedAt = options.fetchedAt || now.toISOString();
  const newerThanDays = options.newerThanDays ?? 3;
  const cutoff = now.getTime() - newerThanDays * 24 * 3600000;
  const filtered = [];
  for (const message of messages) {
    if (!message || !isNeedsYou(message)) continue;
    const ms = Number(message.internalDate);
    if (Number.isFinite(ms) && ms < cutoff) continue;
    filtered.push(message);
  }
  filtered.sort((a, b) => {
    const r = needsYouRank(a) - needsYouRank(b);
    if (r !== 0) return r;
    return Number(b.internalDate) - Number(a.internalDate);
  });
  const items = filtered
    .slice(0, options.limit ?? 8)
    .map((m) => mapMessageItem(m, { timeZone }));
  return {
    status: 'ready',
    updatedAt,
    note: items.length
      ? `Needs you · unread, important, or starred · inbox · last ${newerThanDays}d`
      : `Nothing flagged as needs-you (unread / important / starred) in the last ${newerThanDays} days.`,
    items: items.map(compactItem),
  };
}

function compactItem(it) {
  const out = { title: it.title };
  if (it.detail) out.detail = it.detail;
  if (it.time) out.time = it.time;
  if (it.url) out.url = it.url;
  if (it.label) out.label = it.label;
  return out;
}

function tokenHasGmailScope(tokens) {
  const scope = String(tokens?.scope || '');
  return scope.split(/\s+/).some((s) => s === 'https://www.googleapis.com/auth/gmail.readonly' || s === 'https://mail.google.com/');
}

function unconnectedNote(reason) {
  if (reason === 'scope') {
    return 'Gmail readonly is not on the saved tokens yet. Run npm run oauth:google with your personal Google account (prompt=consent) to add gmail.readonly.';
  }
  return 'Personal Gmail is not connected yet. Add OAuth client secrets under ~/.config/home-dashboard/google/ and run npm run oauth:google with your personal Google account.';
}

function unconnectedPair(reason, now = new Date()) {
  const note = unconnectedNote(reason);
  const base = { status: 'unconnected', updatedAt: null, note, items: [] };
  return { overnight: { ...base }, followups: { ...base } };
}

async function listMessageIds(accessToken, q, maxResults = 40) {
  const url = new URL(GMAIL_LIST);
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', String(maxResults));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Gmail list HTTP ${res.status}`);
  }
  return json.messages || [];
}

async function getMessage(accessToken, id) {
  const url = new URL(`${GMAIL_GET}/${encodeURIComponent(id)}`);
  url.searchParams.set('format', 'metadata');
  url.searchParams.set('metadataHeaders', 'From');
  url.searchParams.append('metadataHeaders', 'Subject');
  url.searchParams.append('metadataHeaders', 'Date');
  url.searchParams.append('metadataHeaders', 'List-Unsubscribe');
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Gmail get HTTP ${res.status}`);
  }
  return json;
}

export async function fetchMessagesMetadata(accessToken, ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = [];
  // Sequential keeps quota polite for a personal dashboard; small N.
  for (const id of unique) {
    out.push(await getMessage(accessToken, id));
  }
  return out;
}

export async function fetchOvernightAndFollowupMessages(accessToken, now = new Date()) {
  const { start, end } = overnightBounds(now);
  // Gmail after:/before: use epoch seconds (mailbox-local semantics; we also filter client-side).
  const afterSec = Math.floor(start.getTime() / 1000) - 3600; // slight pad
  const beforeSec = Math.floor(end.getTime() / 1000) + 3600;
  const overnightQ = `in:inbox -in:chat -in:spam -in:trash after:${afterSec} before:${beforeSec}`;
  const followupsQ = 'in:inbox (is:unread OR is:starred OR is:important) newer_than:3d -in:chat -in:spam -in:trash';

  const [overnightRefs, followupRefs] = await Promise.all([
    listMessageIds(accessToken, overnightQ, 25),
    listMessageIds(accessToken, followupsQ, 20),
  ]);
  const idSet = new Set();
  const ordered = [];
  for (const ref of [...overnightRefs, ...followupRefs]) {
    if (!ref?.id || idSet.has(ref.id)) continue;
    idSet.add(ref.id);
    ordered.push(ref.id);
  }
  const messages = await fetchMessagesMetadata(accessToken, ordered);
  return { messages, overnightRefs, followupRefs };
}

/** Live overlay reader for overnight + followups. Missing secrets/scopes → unconnected. */
export async function readGmailSources(now = new Date()) {
  const oauth = await loadOAuthConfig();
  const tokenFile = oauth?.token_path
    ? String(oauth.token_path).replace(/^~(?=\/|$)/, homedir())
    : tokensPath();
  let tokens = await loadTokens(tokenFile);

  if (!oauth || !tokens?.refresh_token) {
    return unconnectedPair('missing', now);
  }
  if (!tokenHasGmailScope(tokens)) {
    return unconnectedPair('scope', now);
  }

  try {
    const obtained = Date.parse(tokens.obtained_at);
    const fresh =
      tokens.access_token &&
      Number.isFinite(obtained) &&
      tokens.expires_in != null &&
      Date.now() < obtained + Number(tokens.expires_in) * 1000 - 120000;
    if (!fresh) {
      tokens = await refreshAccessToken(oauth, tokens);
      await saveTokens(tokens, tokenFile);
      if (!tokenHasGmailScope(tokens)) {
        return unconnectedPair('scope', now);
      }
    }
    const { messages } = await fetchOvernightAndFollowupMessages(tokens.access_token, now);
    const fetchedAt = new Date().toISOString();
    return {
      overnight: overnightSource(messages, now, { fetchedAt }),
      followups: followupsSource(messages, now, { fetchedAt }),
    };
  } catch (error) {
    const note = `Gmail could not be read (${error instanceof Error ? error.message : 'unknown error'}).`;
    const err = { status: 'error', updatedAt: null, note, items: [] };
    return { overnight: { ...err }, followups: { ...err } };
  }
}
