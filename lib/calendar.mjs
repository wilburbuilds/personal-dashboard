import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TZ = 'America/Los_Angeles';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
];

export function configDirectory(root = process.env.DASHBOARD_GOOGLE_CONFIG_DIR) {
  return root || join(homedir(), '.config', 'personal-dashboard');
}

export function oauthPath(dir = configDirectory()) {
  return process.env.DASHBOARD_GOOGLE_OAUTH || join(dir, 'oauth.json');
}

export function tokensPath(dir = configDirectory()) {
  return process.env.DASHBOARD_GOOGLE_TOKENS || join(dir, 'tokens.json');
}

const dayKey = (date, timeZone = TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);

const formatTime = (iso, timeZone = TZ) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

/** Instant for YYYY-MM-DD HH:MM:SS in a named IANA zone. */
export function zonedCivilTime(day, hms, timeZone = TZ) {
  let guess = new Date(`${day}T${hms}Z`);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(guess);
    const get = (t) => Number(parts.find((p) => p.type === t)?.value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const wanted = Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)),
      Number(hms.slice(0, 2)),
      Number(hms.slice(3, 5)),
      Number(hms.slice(6, 8)),
    );
    guess = new Date(guess.getTime() + (wanted - asUtc));
  }
  return guess;
}

/** Pacific civil day [timeMin, timeMax). */
export function pacificDayBounds(now = new Date(), timeZone = TZ) {
  const day = dayKey(now, timeZone);
  const timeMin = zonedCivilTime(day, '00:00:00', timeZone);
  // Next calendar day in that zone
  const nextProbe = new Date(timeMin.getTime() + 26 * 3600000);
  const nextDay = dayKey(nextProbe, timeZone);
  const timeMax = zonedCivilTime(nextDay, '00:00:00', timeZone);
  return { day, timeMin, timeMax };
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

/**
 * Map Google Calendar event resources → dashboard calendar source.
 * Morning-brief floor: remaining today, capped ~horizonHours ahead (default 12).
 */
export function calendarSource(events = [], now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const horizonHours = options.horizonHours ?? 12;
  const { day, timeMax } = pacificDayBounds(now, timeZone);
  const horizonEnd = new Date(Math.min(timeMax.getTime(), now.getTime() + horizonHours * 3600000));
  const updatedAt = options.fetchedAt || now.toISOString();
  const items = [];

  for (const event of events) {
    if (!event || event.status === 'cancelled') continue;
    const allDay = Boolean(event.start?.date && !event.start?.dateTime);
    if (allDay) {
      if (event.start.date !== day) continue;
      items.push({
        title: String(event.summary || 'Busy').slice(0, 300),
        time: 'All day',
        detail: [event.location, event.description].filter(Boolean).join(' · ').slice(0, 1200) || undefined,
        url: safeUrl(event.htmlLink),
        label: options.calendarLabel,
      });
      continue;
    }
    const startIso = event.start?.dateTime;
    if (!startIso) continue;
    const start = new Date(startIso);
    const end = event.end?.dateTime ? new Date(event.end.dateTime) : start;
    if (end.getTime() <= now.getTime()) continue; // already finished
    if (start.getTime() >= horizonEnd.getTime()) continue; // beyond brief horizon
    if (start.getTime() >= timeMax.getTime()) continue; // past today

    const endIso = event.end?.dateTime;
    const timeLabel =
      endIso && formatTime(startIso, timeZone) !== formatTime(endIso, timeZone)
        ? `${formatTime(startIso, timeZone)} – ${formatTime(endIso, timeZone)}`
        : formatTime(startIso, timeZone);

    items.push({
      title: String(event.summary || 'Busy').slice(0, 300),
      time: timeLabel || 'Today',
      detail: [event.location, event.description].filter(Boolean).join(' · ').slice(0, 1200) || undefined,
      url: safeUrl(event.htmlLink),
      label: options.calendarLabel,
    });
  }

  items.sort((a, b) => {
    if (a.time === 'All day' && b.time !== 'All day') return -1;
    if (b.time === 'All day' && a.time !== 'All day') return 1;
    return String(a.time).localeCompare(String(b.time), undefined, { numeric: true });
  });

  const capped = items.slice(0, 30).map((it) => {
    const out = { title: it.title, time: it.time };
    if (it.detail) out.detail = it.detail;
    if (it.url) out.url = it.url;
    if (it.label) out.label = it.label;
    return out;
  });

  return {
    status: 'ready',
    updatedAt,
    note: capped.length
      ? `Personal calendar · ${day} Pacific · next ~${horizonHours}h`
      : `Nothing on the calendar for the rest of today (${day} Pacific).`,
    items: capped,
  };
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

export async function loadOAuthConfig(path = oauthPath()) {
  const cfg = await readJson(path);
  if (!cfg) return null;
  const client_id = String(cfg.client_id || '').trim();
  const client_secret = String(cfg.client_secret || '').trim();
  const redirect_uri = String(cfg.redirect_uri || 'http://127.0.0.1:8766/oauth/callback').trim();
  if (!client_id || !client_secret) return null;
  return {
    client_id,
    client_secret,
    redirect_uri,
    token_path: cfg.token_path ? String(cfg.token_path) : undefined,
  };
}

export async function loadTokens(path = tokensPath()) {
  return readJson(path);
}

export async function saveTokens(tokens, path = tokensPath()) {
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(tokens, null, 2)}\n`, { mode: 0o600 });
  try {
    await chmod(path, 0o600);
  } catch {
    /* ignore */
  }
}

export async function refreshAccessToken(oauth, tokens) {
  if (!tokens?.refresh_token) throw new Error('Missing refresh_token');
  const body = new URLSearchParams({
    client_id: oauth.client_id,
    client_secret: oauth.client_secret,
    refresh_token: tokens.refresh_token,
    grant_type: 'refresh_token',
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error_description || json.error || `Token refresh HTTP ${res.status}`);
  }
  const merged = {
    ...tokens,
    access_token: json.access_token,
    expires_in: json.expires_in,
    token_type: json.token_type || tokens.token_type,
    scope: json.scope || tokens.scope,
    obtained_at: new Date().toISOString(),
  };
  if (json.refresh_token) merged.refresh_token = json.refresh_token;
  return merged;
}

function tokenFresh(tokens, skewMs = 120000) {
  if (!tokens?.access_token) return false;
  if (!tokens.obtained_at || tokens.expires_in == null) return false;
  const obtained = Date.parse(tokens.obtained_at);
  if (!Number.isFinite(obtained)) return false;
  return Date.now() < obtained + Number(tokens.expires_in) * 1000 - skewMs;
}

export async function fetchPrimaryEvents(accessToken, { timeMin, timeMax, timeZone = TZ } = {}) {
  const url = new URL(EVENTS_URL);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('timeZone', timeZone);
  url.searchParams.set('maxResults', '40');
  if (timeMin) url.searchParams.set('timeMin', new Date(timeMin).toISOString());
  if (timeMax) url.searchParams.set('timeMax', new Date(timeMax).toISOString());

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error?.message || `Calendar API HTTP ${res.status}`);
  }
  return json.items || [];
}

/** Live overlay reader. Missing secrets/tokens → unconnected (no network). */
export async function readCalendarSource(now = new Date()) {
  const oauth = await loadOAuthConfig();
  const tokenFile = oauth?.token_path
    ? String(oauth.token_path).replace(/^~(?=\/|$)/, homedir())
    : tokensPath();
  let tokens = await loadTokens(tokenFile);

  if (!oauth || !tokens?.refresh_token) {
    return {
      status: 'unconnected',
      updatedAt: null,
      note:
        'Personal Google Calendar is not connected yet. Add OAuth client secrets under ~/.config/personal-dashboard/ and run npm run oauth:calendar as your personal Google account.',
      items: [],
    };
  }

  try {
    if (!tokenFresh(tokens)) {
      tokens = await refreshAccessToken(oauth, tokens);
      await saveTokens(tokens, tokenFile);
    }
    const { timeMin, timeMax } = pacificDayBounds(now);
    const fetchMin = new Date(Math.min(timeMin.getTime(), now.getTime() - 6 * 3600000));
    const events = await fetchPrimaryEvents(tokens.access_token, { timeMin: fetchMin, timeMax });
    return calendarSource(events, now, { fetchedAt: new Date().toISOString() });
  } catch (error) {
    return {
      status: 'error',
      updatedAt: null,
      note: `Calendar could not be read (${error instanceof Error ? error.message : 'unknown error'}).`,
      items: [],
    };
  }
}
