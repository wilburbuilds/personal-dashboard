/**
 * Overnight mail curation for the morning brief.
 *
 * Raw Gmail overnight (lib/gmail.mjs) remains the floor adapter.
 * When a same-day Pacific curation record exists, the overnight tile
 * SHOWS THE CURATED LIST ONLY (replace, not a second noisy list).
 * Never sends, trashes, or modifies mail. No work account.
 */
import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { overnightBounds } from './gmail.mjs';

const TZ = 'America/Los_Angeles';
export const CURATION_RECORD_ID = 'overnight-curation';
export const CURATION_LIMIT = 5;

const dayKey = (date, timeZone = TZ) =>
  new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);

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
  if (!s) return { display: 'Unknown sender', email: '' };
  const angle = s.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angle) {
    return {
      display: angle[1].replace(/^["']|["']$/g, '').trim() || angle[2],
      email: angle[2].trim().toLowerCase(),
    };
  }
  if (s.includes('@')) return { display: s.slice(0, 120), email: s.toLowerCase() };
  return { display: s.slice(0, 120), email: '' };
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

function labelSet(message) {
  return new Set((message?.labelIds || []).map(String));
}

function compactItem(it) {
  const out = { title: it.title };
  if (it.detail) out.detail = it.detail;
  if (it.time) out.time = it.time;
  if (it.url) out.url = it.url;
  if (it.label) out.label = it.label;
  return out;
}

/** Map a Gmail message resource to a dashboard item (same shape as overnight). */
export function messageToOvernightItem(message, options = {}) {
  const timeZone = options.timeZone || TZ;
  const headers = message?.payload?.headers || [];
  const subject = (headerValue(headers, 'Subject') || '(no subject)').slice(0, 300);
  const from = parseFrom(headerValue(headers, 'From'));
  const ms = Number(message?.internalDate);
  const snippet = String(message?.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const detailParts = [from.display];
  if (snippet) detailParts.push(snippet);
  const labels = labelSet(message);
  const tags = [];
  if (options.reason) tags.push(options.reason);
  else {
    if (labels.has('UNREAD')) tags.push('Unread');
    if (labels.has('IMPORTANT')) tags.push('Important');
    if (labels.has('STARRED')) tags.push('Starred');
    if (!tags.length) tags.push('Overnight');
  }
  const item = {
    id: message?.id ? String(message.id) : undefined,
    title: subject,
    detail: detailParts.join(' · ').slice(0, 1200),
    time: Number.isFinite(ms) ? formatDayTime(ms, timeZone) : undefined,
    url: gmailOpenUrl(message?.id, message?.threadId),
    label: tags.join(' · ').slice(0, 100),
  };
  return item;
}

const SECURITY_RE =
  /\b(security|verify|verification|password|passcode|login alert|signed in|sign[\s-]?in|2fa|two[\s-]?factor|suspicious|unauthorized|account alert|unusual activity|reset your)\b/i;
const MONEY_RE =
  /\b(invoice|payment due|past due|overdue|wire transfer|bank alert|chargeback|refund issued|statement ready|tax document|1099|w[\s-]?2)\b/i;
const TIME_SENSITIVE_RE =
  /\b(action required|respond by|due today|expires? (today|tonight|soon)|confirm (your|within)|urgent|asap|time[\s-]?sensitive)\b/i;
const PROMO_SUBJECT_RE =
  /\b(% off|\$\d+ off|flash sale|limited time offer|weekly digest|daily digest|newsletter|unsubscribe|shop now|free shipping|don'?t miss|just for you:|your (weekly|daily) )\b/i;
const BULK_FROM_RE =
  /^(noreply|no-reply|no_reply|donotreply|do-not-reply|newsletter|marketing|promo|promotions|news|digest|notifications|notify|mailer|updates|info)@/i;

/**
 * True when the message is obvious promo/newsletter noise for a morning brief.
 * Security/money/time-sensitive subjects override bulk-from heuristics.
 */
export function isObviousNoise(message) {
  const labels = labelSet(message);
  if (labels.has('SPAM') || labels.has('TRASH') || labels.has('CHAT')) return true;

  const headers = message?.payload?.headers || [];
  const subject = headerValue(headers, 'Subject');
  const from = parseFrom(headerValue(headers, 'From'));
  const listUnsub = headerValue(headers, 'List-Unsubscribe');
  const blob = `${subject} ${message?.snippet || ''}`;

  if (SECURITY_RE.test(blob) || MONEY_RE.test(blob) || TIME_SENSITIVE_RE.test(blob)) {
    return false;
  }
  if (labels.has('IMPORTANT') || labels.has('STARRED') || labels.has('CATEGORY_PERSONAL')) {
    return false;
  }
  if (labels.has('CATEGORY_PROMOTIONS') || labels.has('CATEGORY_SOCIAL')) return true;
  if (PROMO_SUBJECT_RE.test(subject)) return true;
  if (listUnsub && labels.has('CATEGORY_UPDATES') && !labels.has('UNREAD')) return true;
  if (BULK_FROM_RE.test(from.email) && !labels.has('UNREAD')) return true;
  if (BULK_FROM_RE.test(from.email) && labels.has('CATEGORY_UPDATES')) return true;
  return false;
}

/** Positive keep signals for ranking (higher = more important). */
export function importanceScore(message) {
  const labels = labelSet(message);
  const headers = message?.payload?.headers || [];
  const subject = headerValue(headers, 'Subject');
  const blob = `${subject} ${message?.snippet || ''}`;
  let score = 0;
  if (labels.has('STARRED')) score += 40;
  if (labels.has('IMPORTANT')) score += 35;
  if (labels.has('CATEGORY_PERSONAL')) score += 30;
  if (labels.has('UNREAD')) score += 10;
  if (SECURITY_RE.test(blob)) score += 45;
  if (MONEY_RE.test(blob)) score += 35;
  if (TIME_SENSITIVE_RE.test(blob)) score += 30;
  if (labels.has('CATEGORY_PROMOTIONS')) score -= 50;
  if (labels.has('CATEGORY_SOCIAL')) score -= 40;
  if (isObviousNoise(message)) score -= 100;
  return score;
}

function defaultReason(message) {
  const labels = labelSet(message);
  const headers = message?.payload?.headers || [];
  const blob = `${headerValue(headers, 'Subject')} ${message?.snippet || ''}`;
  if (SECURITY_RE.test(blob)) return 'Security';
  if (MONEY_RE.test(blob)) return 'Money';
  if (TIME_SENSITIVE_RE.test(blob)) return 'Time-sensitive';
  if (labels.has('STARRED')) return 'Starred';
  if (labels.has('IMPORTANT')) return 'Important';
  if (labels.has('CATEGORY_PERSONAL')) return 'Personal';
  if (labels.has('UNREAD')) return 'Unread';
  return 'Worth a look';
}

/**
 * Heuristic weed + rank. Returns up to `limit` messages (not items).
 * Drops obvious promo noise; keeps security/money/personal/time-sensitive/flagged.
 */
export function heuristicSelect(messages = [], options = {}) {
  const limit = options.limit ?? CURATION_LIMIT;
  const minScore = options.minScore ?? 10;
  const candidates = [];
  for (const message of messages) {
    if (!message?.id) continue;
    if (isObviousNoise(message)) continue;
    const score = importanceScore(message);
    if (score < minScore) continue;
    candidates.push({ message, score, reason: defaultReason(message) });
  }
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(b.message.internalDate) - Number(a.message.internalDate);
  });
  return candidates.slice(0, limit);
}

/** Messages whose internalDate falls in the overnight window (floor candidates). */
export function overnightCandidateMessages(messages = [], now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const { start, end } = overnightBounds(now, { timeZone, lookbackHours: options.lookbackHours ?? 24 });
  const startMs = start.getTime();
  const endMs = end.getTime();
  const out = [];
  for (const message of messages) {
    if (!message) continue;
    const ms = Number(message.internalDate);
    if (!Number.isFinite(ms)) continue;
    if (ms < startMs || ms > endMs) continue;
    const labels = labelSet(message);
    if (labels.has('SPAM') || labels.has('TRASH') || labels.has('CHAT')) continue;
    out.push(message);
  }
  out.sort((a, b) => Number(b.internalDate) - Number(a.internalDate));
  return out;
}

export function buildCuratedSource(selected = [], now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const updatedAt = options.fetchedAt || now.toISOString();
  const candidateCount = options.candidateCount ?? selected.length;
  const mode = options.mode || 'heuristic';
  const items = selected.map(({ message, reason }) =>
    compactItem(messageToOvernightItem(message, { timeZone, reason: reason || defaultReason(message) })),
  );
  let note;
  if (items.length) {
    note = `Important overnight · curated (${mode}) · ${items.length} of ${candidateCount}`;
  } else if (candidateCount > 0) {
    note = `Nothing important overnight — weeded ${candidateCount} message${candidateCount === 1 ? '' : 's'} (${mode}).`;
  } else {
    note = 'No overnight mail to curate.';
  }
  return {
    status: 'ready',
    updatedAt,
    note,
    items,
  };
}

/** Pacific civil date the morning brief belongs to (overnight end day). */
export function curationDayKey(now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const { endDay, day } = overnightBounds(now, { timeZone });
  // During/after overnight, brief day is the end day (morning). Before 10pm daytime: endDay is today.
  return endDay || day;
}

export function isFreshCuration(record, now = new Date(), options = {}) {
  if (!record || typeof record !== 'object') return false;
  if (!record.source || record.source.status !== 'ready') return false;
  const expected = curationDayKey(now, options);
  return String(record.date) === expected;
}

/**
 * Replace raw overnight with curated when a same-day Pacific curation exists.
 * Otherwise return raw unchanged (floor). Documented product rule.
 */
export function applyOvernightCuration(rawOvernight, curationRecord, now = new Date(), options = {}) {
  if (!isFreshCuration(curationRecord, now, options)) {
    return rawOvernight;
  }
  const source = curationRecord.source;
  return {
    status: source.status || 'ready',
    updatedAt: source.updatedAt || curationRecord.curatedAt || null,
    note: source.note || 'Important overnight · curated',
    items: Array.isArray(source.items) ? source.items : [],
  };
}

export function buildCurationRecord({ source, now = new Date(), mode, candidateCount, keptCount, options = {} }) {
  return {
    date: curationDayKey(now, options),
    curatedAt: new Date().toISOString(),
    mode: mode || 'heuristic',
    candidateCount: candidateCount ?? 0,
    keptCount: keptCount ?? source?.items?.length ?? 0,
    source,
  };
}

/** Compact candidate list for LLM ranking (ids + subject/from/snippet/labels only). */
export function candidatesForLlm(messages = []) {
  return messages.map((message) => {
    const headers = message?.payload?.headers || [];
    const from = parseFrom(headerValue(headers, 'From'));
    const labels = [...labelSet(message)].filter((l) =>
      ['UNREAD', 'IMPORTANT', 'STARRED', 'CATEGORY_PERSONAL', 'CATEGORY_PROMOTIONS', 'CATEGORY_UPDATES', 'CATEGORY_SOCIAL'].includes(l),
    );
    return {
      id: String(message.id),
      subject: (headerValue(headers, 'Subject') || '(no subject)').slice(0, 200),
      from: from.display.slice(0, 120),
      email: from.email.slice(0, 120),
      snippet: String(message.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 180),
      labels,
      score: importanceScore(message),
    };
  });
}

export const GROK_CURATE_SCHEMA = {
  type: 'object',
  properties: {
    noneImportant: { type: 'boolean' },
    important: {
      type: 'array',
      maxItems: CURATION_LIMIT,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          reason: { type: 'string' },
          priority: { type: 'integer' },
        },
        required: ['id', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['important', 'noneImportant'],
  additionalProperties: false,
};

export function buildGrokCuratePrompt(candidates) {
  return `You curate overnight email for the owner's personal morning dashboard (Pacific time).

Read-only: never suggest sending, trashing, archiving, or labeling mail.
Account is your personal Google account only — ignore any work/work context.

Task: from the overnight candidates JSON below, pick at most ${CURATION_LIMIT} messages that matter this morning.
KEEP: security alerts, money/banking, personal notes from real people, time-sensitive asks, starred/important that are not promo.
DROP: newsletters, promotions, digests, social notifications, marketing noreply noise.

If nothing matters, set noneImportant=true and important=[].
Return ONLY JSON matching the schema (ids must be from the candidate list).

CANDIDATES:
${JSON.stringify(candidates, null, 2)}
`;
}

/**
 * Apply Grok (or any) ranked id list onto the candidate message set.
 * Unknown ids ignored. Caps at CURATION_LIMIT.
 */
export function selectByIds(messages, ranked = [], options = {}) {
  const limit = options.limit ?? CURATION_LIMIT;
  const byId = new Map(messages.map((m) => [String(m.id), m]));
  const out = [];
  const seen = new Set();
  for (const row of ranked) {
    const id = String(row?.id || '');
    if (!id || seen.has(id) || !byId.has(id)) continue;
    seen.add(id);
    out.push({
      message: byId.get(id),
      reason: String(row.reason || 'Worth a look').slice(0, 40),
      score: typeof row.priority === 'number' ? 1000 - row.priority : importanceScore(byId.get(id)),
    });
    if (out.length >= limit) break;
  }
  return out;
}

function defaultGrokBin() {
  return process.env.GROK_BIN || join(homedir(), '.grok', 'bin', 'grok');
}

/**
 * Invoke Grok Build CLI for structured curation JSON.
 * Mirrors memo-ingest scripts/grok-summarize.sh flags.
 * Returns parsed object or null on failure/unavailable.
 */
export async function rankWithGrokCli(candidates, options = {}) {
  if (!candidates.length) return { noneImportant: true, important: [] };
  const grokBin = options.grokBin || defaultGrokBin();
  const prompt = buildGrokCuratePrompt(candidates);
  const schema = JSON.stringify(options.schema || GROK_CURATE_SCHEMA);
  const tmp = join(tmpdir(), `pd-overnight-curate-${process.pid}-${Date.now()}.txt`);
  await writeFile(tmp, prompt, { encoding: 'utf8', mode: 0o600 });
  try {
    const args = [
      '--prompt-file',
      tmp,
      '--verbatim',
      '--max-turns',
      '1',
      '--no-subagents',
      '--disable-web-search',
      '--json-schema',
      schema,
    ];
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(grokBin, args, {
        env: { ...process.env, PATH: process.env.PATH || '/usr/bin:/bin' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (c) => {
        out += c;
      });
      child.stderr.on('data', (c) => {
        err += c;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve(out);
        else reject(new Error(err.trim() || `grok exited ${code}`));
      });
    });
    const text = String(stdout || '').trim();
    // Prefer last JSON object if the CLI wraps output.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('grok returned no JSON object');
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!parsed || !Array.isArray(parsed.important)) throw new Error('grok JSON missing important[]');
    return parsed;
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

/**
 * Full curation pipeline on overnight candidate messages.
 * Tries Grok when available; falls back to heuristic-only.
 */
export async function curateOvernightMessages(messages = [], now = new Date(), options = {}) {
  const timeZone = options.timeZone || TZ;
  const candidates = overnightCandidateMessages(messages, now, options);
  const heuristic = heuristicSelect(candidates, { limit: options.limit ?? CURATION_LIMIT });
  let selected = heuristic;
  let mode = 'heuristic';

  const wantGrok = options.useGrok !== false;
  if (wantGrok && candidates.length) {
    try {
      // Pass heuristic survivors plus a few more non-noise for judgment.
      const forLlm = [];
      const seen = new Set();
      for (const row of heuristic) {
        seen.add(String(row.message.id));
        forLlm.push(row.message);
      }
      for (const message of candidates) {
        if (forLlm.length >= 15) break;
        if (seen.has(String(message.id))) continue;
        if (isObviousNoise(message)) continue;
        seen.add(String(message.id));
        forLlm.push(message);
      }
      const ranked = await rankWithGrokCli(candidatesForLlm(forLlm), options);
      if (ranked.noneImportant) {
        selected = [];
        mode = 'heuristic+grok';
      } else {
        const fromGrok = selectByIds(forLlm, ranked.important, options);
        if (fromGrok.length || ranked.noneImportant === true) {
          selected = fromGrok;
          mode = 'heuristic+grok';
        }
      }
    } catch (error) {
      if (options.grokRequired) throw error;
      mode = 'heuristic';
      selected = heuristic;
    }
  }

  const source = buildCuratedSource(selected, now, {
    timeZone,
    fetchedAt: options.fetchedAt || new Date().toISOString(),
    candidateCount: candidates.length,
    mode,
  });
  const record = buildCurationRecord({
    source,
    now,
    mode,
    candidateCount: candidates.length,
    keptCount: source.items.length,
    options: { timeZone },
  });
  return { record, source, candidates, selected, mode };
}
