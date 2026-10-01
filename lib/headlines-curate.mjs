/**
 * Curated morning-brief headlines overlay.
 *
 * RSS (lib/headlines.mjs) remains the floor.
 * When today's Pacific vault brief exists and ## Headlines parses to ≥1 item,
 * GET /api/dashboard REPLACES RSS headlines (same freshness idea as overnight-curation).
 * Optional secondary path: SQLite record via PUT /api/headlines-curation.
 */
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TZ = 'America/Los_Angeles';
export const HEADLINES_CURATION_RECORD_ID = 'headlines-curation';
export const HEADLINES_CURATION_LIMIT = 6;
export const MORNING_BRIEFS_REL = ['briefs', 'morning'];

export function pacificDayKey(now = new Date(), timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now);
}

export function personalVaultRoot() {
  return process.env.DASHBOARD_PERSONAL_VAULT || join(homedir(), 'vaults/personal');
}

export function morningBriefPath(day, root = personalVaultRoot()) {
  return join(root, ...MORNING_BRIEFS_REL, `${day}.md`);
}

function safeHttpUrl(value) {
  if (!value || typeof value !== 'string') return undefined;
  try {
    const u = new URL(value.trim());
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
  } catch {
    /* ignore */
  }
  return undefined;
}

/**
 * Extract ## Headlines section body until the next ## heading or EOF.
 */
export function extractHeadlinesSection(markdown) {
  const text = String(markdown || '');
  const match = text.match(/^##\s+Headlines\s*$/im);
  if (!match || match.index === undefined) return '';
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^##\s+/m);
  return (next < 0 ? rest : rest.slice(0, next)).trim();
}

/**
 * Parse `- [Title](url) — optional why` lines (max HEADLINES_CURATION_LIMIT).
 */
export function parseHeadlinesSection(markdown, options = {}) {
  const limit = options.limit ?? HEADLINES_CURATION_LIMIT;
  const body = extractHeadlinesSection(markdown);
  if (!body) return [];
  const items = [];
  const seen = new Set();
  const lineRe =
    /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*[—–\-]\s*(.+))?$/;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(lineRe);
    if (!m) continue;
    const title = m[1].replace(/\s+/g, ' ').trim().slice(0, 300);
    const url = safeHttpUrl(m[2]);
    if (!title || !url) continue;
    let key;
    try {
      const u = new URL(url);
      u.hash = '';
      key = u.origin + u.pathname;
    } catch {
      continue;
    }
    const titleKey = title.toLowerCase().replace(/\W/g, '');
    if (seen.has(key) || seen.has(titleKey)) continue;
    seen.add(key);
    seen.add(titleKey);
    const why = (m[3] || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
    const item = {
      title,
      url,
      label: 'Curated · morning brief',
    };
    if (why) item.detail = why;
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}

export function buildCuratedHeadlinesSource(items = [], now = new Date(), options = {}) {
  const list = Array.isArray(items) ? items.slice(0, options.limit ?? HEADLINES_CURATION_LIMIT) : [];
  const mode = options.mode || 'vault';
  const updatedAt = options.fetchedAt || now.toISOString();
  const note =
    list.length > 0
      ? `Morning brief · curated (${mode}) · ${list.length} headline${list.length === 1 ? '' : 's'}`
      : 'Morning brief · no curated headlines';
  return {
    status: 'ready',
    updatedAt,
    note,
    items: list.map((it) => {
      const out = { title: String(it.title || '').slice(0, 300) };
      if (it.url) out.url = it.url;
      if (it.detail) out.detail = String(it.detail).slice(0, 1200);
      if (it.label) out.label = String(it.label).slice(0, 100);
      else out.label = 'Curated · morning brief';
      if (it.time) out.time = String(it.time).slice(0, 100);
      return out;
    }),
  };
}

export function buildHeadlinesCurationRecord({
  source,
  now = new Date(),
  mode,
  options = {},
}) {
  return {
    date: options.date || pacificDayKey(now, options.timeZone || TZ),
    curatedAt: new Date().toISOString(),
    mode: mode || 'external',
    source,
  };
}

/** Fresh when same Pacific day, ready, and ≥1 item (product rule for headlines replace). */
export function isFreshHeadlinesCuration(record, now = new Date(), options = {}) {
  if (!record || typeof record !== 'object') return false;
  if (!record.source || record.source.status !== 'ready') return false;
  const items = record.source.items;
  if (!Array.isArray(items) || items.length < 1) return false;
  const expected = pacificDayKey(now, options.timeZone || TZ);
  return String(record.date) === expected;
}

/**
 * Read today's vault morning brief and parse ## Headlines.
 * Returns { day, path, items, source } or null when missing/unparseable/empty.
 */
export async function readMorningBriefHeadlines(now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const day = options.day || pacificDayKey(now, timeZone);
  const root = options.root || personalVaultRoot();
  const path = morningBriefPath(day, root);
  let markdown;
  try {
    markdown = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  const items = parseHeadlinesSection(markdown, options);
  if (!items.length) return null;
  const source = buildCuratedHeadlinesSource(items, now, {
    mode: options.mode || 'vault',
    fetchedAt: options.fetchedAt,
    limit: options.limit,
  });
  return { day, path, items, source, markdown };
}

/**
 * Prefer vault brief (≥1), else fresh PUT record (≥1), else raw RSS unchanged.
 */
export function applyHeadlinesCuration(rawHeadlines, context = {}, now = new Date(), options = {}) {
  const vault = context.vault;
  if (vault?.source && Array.isArray(vault.source.items) && vault.source.items.length >= 1) {
    const day = vault.day || pacificDayKey(now, options.timeZone || TZ);
    if (day === pacificDayKey(now, options.timeZone || TZ)) {
      return {
        status: vault.source.status || 'ready',
        updatedAt: vault.source.updatedAt || null,
        note: vault.source.note || 'Morning brief · curated',
        items: vault.source.items,
      };
    }
  }
  const record = context.record;
  if (isFreshHeadlinesCuration(record, now, options)) {
    const source = record.source;
    return {
      status: source.status || 'ready',
      updatedAt: source.updatedAt || record.curatedAt || null,
      note: source.note || 'Morning brief · curated',
      items: Array.isArray(source.items) ? source.items : [],
    };
  }
  return rawHeadlines;
}
