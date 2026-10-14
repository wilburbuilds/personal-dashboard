import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, stat, appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/**
 * Gym's daily workout notes: fitness/workouts/YYYY-MM-DD.md, one set per line as
 * `- [ ] Exercise — set N — target`. The dashboard may only flip `[ ]` <-> `[x]` on an
 * existing checkbox line. No other text is ever changed, and no checkbox is ever added.
 */
export const WORKOUT_DIR = 'fitness/workouts';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BOX_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/;

export const lineHash = (text) => createHash('sha256').update(text.trim()).digest('hex').slice(0, 16);
export const fileHash = (md) => createHash('sha256').update(md).digest('hex').slice(0, 16);

export function notePath(vault, day) {
  if (!DAY_RE.test(day)) throw new WriteError('bad-day', 'Day must be YYYY-MM-DD');
  return join(vault, WORKOUT_DIR, `${day}.md`);
}

export class WriteError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
  const fm = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const k = /^([\w-]+):\s*(.*)$/.exec(l); if (k) fm[k[1]] = k[2].replace(/^['"]|['"]$/g, ''); }
  return { fm, bodyStart: m ? m[0].split('\n').length - 1 : 0 };
}

/** Parse into sections of checkbox items. `ord` disambiguates identical lines. */
export function parseDayNote(md) {
  const lines = md.split('\n');
  const { fm, bodyStart } = frontmatter(md);
  const sections = [];
  let cur = null;
  const seen = {};
  lines.forEach((raw, i) => {
    if (i < bodyStart) return;
    const line = raw.replace(/\r$/, '');
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h) { cur = { title: h[1], items: [], text: [] }; sections.push(cur); return; }
    const b = BOX_RE.exec(line);
    if (!cur) { if (!b) return; cur = { title: '', items: [], text: [] }; sections.push(cur); }
    if (b) {
      const text = b[4];
      const hash = lineHash(text);
      const ord = (seen[hash] = (seen[hash] ?? -1) + 1);
      const parts = text.split(/\s+[—–]\s+/);
      cur.items.push({ line: i, text, hash, ord, checked: b[2] !== ' ', exercise: parts[0], set: parts[1] ?? '', target: parts.slice(2).join(' — ') });
    } else if (line.trim()) cur.text.push(line);
  });
  return { fm, sections, hash: fileHash(md) };
}

/**
 * Flip one checkbox. Matched by line content hash (+ ordinal among identical lines), so it still
 * lands correctly if Gym inserted lines above it. Returns the new text, or throws WriteError.
 */
export function applyCheck(md, { hash, ord = 0, checked }) {
  const lines = md.split('\n');
  const hits = [];
  lines.forEach((l, i) => { const b = BOX_RE.exec(l.replace(/\r$/, '')); if (b && lineHash(b[4]) === hash) hits.push(i); });
  const i = hits[ord];
  if (i === undefined) throw new WriteError('conflict', 'That set line changed in the note. Reload to see the latest.');
  const cr = lines[i].endsWith('\r') ? '\r' : '';
  const b = BOX_RE.exec(lines[i].replace(/\r$/, ''));
  const want = checked ? 'x' : ' ';
  if ((b[2] !== ' ') === !!checked) return { md, changed: false };
  lines[i] = b[1] + want + b[3] + b[4] + cr;
  return { md: lines.join('\n'), changed: true };
}

const locks = new Map();
async function withLock(key, fn) {
  const prev = locks.get(key) ?? Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  locks.set(key, prev.then(() => next));
  await prev;
  try { return await fn(); } finally { release(); if (locks.get(key) === next) locks.delete(key); }
}

/** Read-modify-write with an in-process lock, a mtime/content re-check right before the atomic rename. */
export async function writeCheck(vault, day, change) {
  const path = notePath(vault, day);
  return withLock(path, async () => {
    let md;
    try { md = await readFile(path, 'utf8'); } catch { throw new WriteError('missing', 'No workout note for that day.'); }
    const before = await stat(path);
    const { md: out, changed } = applyCheck(md, change);
    if (changed) {
      const again = await readFile(path, 'utf8');
      const st = await stat(path);
      if (again !== md || st.mtimeMs !== before.mtimeMs) throw new WriteError('conflict', 'The note was edited at the same moment. Try again.');
      const tmp = join(dirname(path), `.${day}.md.hd-${process.pid}-${Date.now()}`);
      await writeFile(tmp, out, { mode: before.mode & 0o777 });
      await rename(tmp, path);
    }
    return { changed, ...parseDayNote(out) };
  });
}

export async function readDayNote(vault, day) {
  const md = await readFile(notePath(vault, day), 'utf8').catch(() => null);
  return md === null ? null : { path: `${WORKOUT_DIR}/${day}.md`, ...parseDayNote(md) };
}

/* ---------- Gym inbox ---------- */

export const INBOX = 'fitness/gym-inbox.md';
const INBOX_HEAD = '---\nowner: Gym\n---\n\n# Gym inbox\n\nMessages sent from the Home dashboard. Newest at the bottom.\n\n';

export async function appendInbox(vault, text, at = new Date()) {
  const clean = String(text).replace(/\s+/g, ' ').trim().slice(0, 4000);
  if (!clean) throw new WriteError('empty', 'Nothing to send.');
  const path = join(vault, INBOX);
  return withLock(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    let cur = null;
    try { cur = await readFile(path, 'utf8'); } catch {}
    const line = `- ${at.toISOString()} ${clean}\n`;
    if (cur === null) await writeFile(path, INBOX_HEAD + line, { flag: 'wx' }).catch(() => appendFile(path, line));
    else await appendFile(path, (cur.endsWith('\n') || cur === '' ? '' : '\n') + line);
    return { text: clean, at: at.toISOString() };
  });
}

/** Optional active push to Gym. Skipped when GYM_WEBHOOK_URL is unset. */
export async function postWebhook(env, payload, fetchImpl = fetch) {
  const url = env.GYM_WEBHOOK_URL;
  if (!url) return { sent: false, skipped: true };
  const headers = { 'content-type': 'application/json' };
  if (env.GYM_WEBHOOK_SECRET) headers.authorization = `Bearer ${env.GYM_WEBHOOK_SECRET}`;
  try {
    const r = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    return { sent: r.ok, skipped: false, status: r.status };
  } catch { return { sent: false, skipped: false, status: 0 }; }
}
