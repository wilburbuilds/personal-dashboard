#!/usr/bin/env node
/**
 * Morning overnight-mail curation for the personal dashboard.
 * Read-only Gmail → heuristic (+ optional Grok CLI) → save curation record.
 * Dashboard GET replaces the overnight tile when this record is same-day Pacific.
 *
 * Usage:
 *   npm run curate:overnight
 *   node scripts/curate-overnight.mjs --no-grok
 *   node scripts/curate-overnight.mjs --dry-run
 */
import { homedir } from 'node:os';
import { accessSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  loadOAuthConfig,
  loadTokens,
  refreshAccessToken,
  saveTokens,
  tokensPath,
} from '../lib/calendar.mjs';
import { fetchOvernightAndFollowupMessages, GMAIL_SCOPES } from '../lib/gmail.mjs';
import { CURATION_RECORD_ID, curateOvernightMessages } from '../lib/overnight-curate.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const noGrok = args.has('--no-grok');
const grokRequired = args.has('--grok-required');
const origin = (process.env.DASHBOARD_API || 'http://127.0.0.1:3000').replace(/\/$/, '');

function tokenHasGmailScope(tokens) {
  const scope = String(tokens?.scope || '');
  return scope.split(/\s+/).some((s) => s === GMAIL_SCOPES[0] || s === 'https://mail.google.com/');
}

function grokAvailable() {
  const bin = process.env.GROK_BIN || join(homedir(), '.grok', 'bin', 'grok');
  try {
    accessSync(bin);
    return bin;
  } catch {
    return null;
  }
}

function dataDir() {
  return (
    process.env.DASHBOARD_DATA_DIR ||
    join(homedir(), 'Library', 'Application Support', 'Personal Dashboard')
  );
}

async function saveViaApi(record) {
  const res = await fetch(`${origin}/api/overnight-curation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      date: record.date,
      mode: record.mode,
      candidateCount: record.candidateCount,
      source: record.source,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `API HTTP ${res.status}`);
  return json;
}

function saveViaSqlite(record) {
  const directory = dataDir();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, 'dashboard.sqlite');
  const db = new DatabaseSync(filename);
  try {
    try {
      chmodSync(filename, 0o600);
    } catch {
      /* ignore */
    }
    db.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS dashboard_records (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)',
    );
    db.prepare(
      'INSERT INTO dashboard_records (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at',
    ).run(CURATION_RECORD_ID, JSON.stringify(record), new Date().toISOString());
  } finally {
    db.close();
  }
  return { saved: true, via: 'sqlite' };
}

async function persist(record) {
  try {
    return await saveViaApi(record);
  } catch (apiError) {
    console.error(
      `API save failed (${apiError instanceof Error ? apiError.message : apiError}); writing SQLite directly.`,
    );
    return saveViaSqlite(record);
  }
}

async function main() {
  const now = new Date();
  const oauth = await loadOAuthConfig();
  const tokenFile = oauth?.token_path
    ? String(oauth.token_path).replace(/^~(?=\/|$)/, homedir())
    : tokensPath();
  let tokens = await loadTokens(tokenFile);

  if (!oauth || !tokens?.refresh_token) {
    console.error('Gmail OAuth not configured. See README (Google sources).');
    process.exit(2);
  }
  if (!tokenHasGmailScope(tokens)) {
    console.error('tokens.json lacks gmail.readonly. Re-run: npm run oauth:google');
    process.exit(2);
  }

  const obtained = Date.parse(tokens.obtained_at);
  const fresh =
    tokens.access_token &&
    Number.isFinite(obtained) &&
    tokens.expires_in != null &&
    Date.now() < obtained + Number(tokens.expires_in) * 1000 - 120000;
  if (!fresh) {
    tokens = await refreshAccessToken(oauth, tokens);
    await saveTokens(tokens, tokenFile);
  }

  const { messages } = await fetchOvernightAndFollowupMessages(tokens.access_token, now);
  const grokBin = noGrok ? null : grokAvailable();
  const { record, mode, candidates } = await curateOvernightMessages(messages, now, {
    useGrok: Boolean(grokBin),
    grokRequired: grokRequired && Boolean(grokBin),
    grokBin: grokBin || undefined,
    fetchedAt: new Date().toISOString(),
  });

  console.log(
    JSON.stringify(
      {
        dryRun,
        mode,
        date: record.date,
        candidateCount: candidates.length,
        keptCount: record.keptCount,
        note: record.source.note,
        items: record.source.items.map((i) => ({ title: i.title, label: i.label })),
      },
      null,
      2,
    ),
  );

  if (dryRun) {
    console.error('Dry run — curation not saved.');
    return;
  }

  const saved = await persist(record);
  console.error(
    `Saved ${CURATION_RECORD_ID} for ${record.date} (Pacific)${saved?.via ? ' via ' + saved.via : ''}. Overnight tile uses curated list on next GET.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
