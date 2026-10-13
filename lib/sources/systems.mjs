import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const STATES = ['up', 'degraded', 'down', 'paused', 'unknown'];
const severity = { down: 0, degraded: 1, unknown: 2, paused: 3, up: 4 };
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = (s) => s.replace(/\*\*|`/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();

/** Rows of the Overview table in services.md. */
export function parseServices(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^\|\s*Service\s*\|/i.test(l));
  if (start < 0) return [];
  const rows = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith('|')) break;
    const [name, what, reach, lifecycle] = line.split('|').slice(1, -1).map((c) => c.trim());
    if (!name) continue;
    const text = plain(`${what} ${reach} ${lifecycle}`);
    rows.push({
      id: slug(plain(name)), name: plain(name), what: plain(what).replace(/\s+—\s+paused.*$/i, ''),
      reach: plain(reach) === '—' ? '' : plain(reach).replace(/\s*\(.*\)$/, ''), lifecycle: plain(lifecycle),
      paused: /\bpaused\b/i.test(what) || /^stopped/i.test(plain(lifecycle)),
      offlineNote: /offline since/i.test(text),
    });
  }
  return rows;
}

const feedSchema = z.object({
  checkedAt: z.string(),
  services: z.array(z.object({
    id: z.string(), name: z.string().optional(), state: z.enum(STATES), detail: z.string().optional().default(''),
    checkedAt: z.string().optional(), url: z.string().optional(),
  })),
});

/** Service Manager's feed. Absent or malformed is a normal state, not an error. */
export function readHealthFeed(path, now, staleMinutes) {
  let raw;
  try { raw = readFileSync(path, 'utf8'); } catch { return { present: false, stale: true, checkedAt: null, services: [] }; }
  const parsed = feedSchema.safeParse(safeJson(raw));
  if (!parsed.success) return { present: false, stale: true, checkedAt: null, services: [], error: 'Health feed is not valid JSON for the agreed shape' };
  const age = (now - Date.parse(parsed.data.checkedAt)) / 60000;
  return { present: true, stale: !(age <= staleMinutes), checkedAt: parsed.data.checkedAt, services: parsed.data.services };
}
const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

export function httpProbe(url, { timeoutMs = 1500, upStatuses } = {}) {
  return async () => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) });
      const ms = Date.now() - t0;
      const ok = upStatuses ? upStatuses.includes(res.status) : res.status < 500;
      return ok ? { state: 'up', detail: `HTTP ${res.status} in ${ms} ms` } : { state: 'degraded', detail: `HTTP ${res.status}` };
    } catch (e) {
      return { state: 'down', detail: e?.name === 'TimeoutError' ? `No answer in ${timeoutMs / 1000}s` : 'Connection refused' };
    }
  };
}
const run = (cmd, args, timeout = 3000) => new Promise((res) => execFile(cmd, args, { timeout }, (err, stdout) => res(err ? null : stdout)));

export function containerProbe(name) {
  return async (shared) => {
    const ps = await shared.docker();
    if (ps === null) return { state: 'down', detail: 'Docker is not answering' };
    const row = ps.find((c) => c.name === name);
    if (!row) return { state: 'down', detail: `Container ${name} is not running` };
    return /unhealthy/i.test(row.status) ? { state: 'degraded', detail: row.status } : { state: 'up', detail: row.status };
  };
}
export function launchdProbe(label, { interval = false } = {}) {
  return async () => {
    const out = await run('/bin/launchctl', ['list', label]);
    if (out === null) return { state: 'down', detail: `${label} is not loaded` };
    const pid = /"PID" = (\d+)/.exec(out)?.[1];
    const exit = Number(/"LastExitStatus" = (-?\d+)/.exec(out)?.[1] ?? 0);
    if (pid) return { state: 'up', detail: `Running (pid ${pid})` };
    if (exit === 0) return { state: 'up', detail: interval ? 'Last run exited cleanly' : 'Loaded, last exit 0' };
    return { state: 'degraded', detail: `Last run exited ${exit}` };
  };
}
export function processProbe(pattern, label) {
  return async () => ((await run('/usr/bin/pgrep', ['-f', pattern])) ? { state: 'up', detail: `${label} is running` } : { state: 'down', detail: `${label} is not running` });
}

/** Probe per services.md slug. Anything missing here shows as unknown. */
export const defaultProbes = {
  'actual-budget': httpProbe('http://127.0.0.1:5006/'),
  ollama: httpProbe('http://127.0.0.1:11434/'),
  colima: async (shared) => ((await shared.docker()) === null ? { state: 'down', detail: 'docker ps failed' } : { state: 'up', detail: 'Docker answers' }),
  'memo-ingest': launchdProbe('com.local.memo-ingest', { interval: true }),
  'vault-sync': launchdProbe('com.example.vault-sync', { interval: true }),
  'work-mirror': launchdProbe('com.example.work-mirror', { interval: true }),
  tailscale: processProbe('Tailscale', 'Tailscale'),
  'morning-page': httpProbe('http://127.0.0.1:8787/'),
  'personal-dashboard': async () => ({ state: 'up', detail: 'Serving this page' }),
  hermes: containerProbe('hermes'),
  vikunja: httpProbe('http://127.0.0.1:3456/api/v1/info'),
  'noop': processProbe('NOOP', 'NOOP'),
  'grok-bot-app': processProbe('Grok Bot', 'Grok Bot app'),
  'personal-backup': launchdProbe('com.example.backup', { interval: true }),
  'backup-pi': httpProbe('http://backup.example:8000/', { upStatuses: [401], timeoutMs: 2000 }),
  'uptime-kuma': httpProbe('http://127.0.0.1:3001/'),
};

export function dockerLister(bin = '/opt/homebrew/bin/docker') {
  let memo;
  return () => (memo ??= run(bin, ['ps', '--format', '{{.Names}}\t{{.Status}}']).then((out) => out === null ? null : out.trim().split('\n').filter(Boolean).map((l) => { const [name, status] = l.split('\t'); return { name, status }; })));
}

export async function probeAll(rows, probes, shared = { docker: dockerLister() }) {
  const out = {};
  await Promise.all(rows.map(async (r) => {
    if (r.paused) { out[r.id] = { state: 'paused', detail: 'Paused on purpose. See services.md to resume' }; return; }
    const p = probes[r.id];
    out[r.id] = p ? await p(shared) : { state: 'unknown', detail: 'No probe for this service' };
  }));
  return out;
}

/** Hourly worst-state history, kept for 24 hours. */
export function recordHistory(path, results, now) {
  let h = {};
  try { h = JSON.parse(readFileSync(path, 'utf8')); } catch {}
  const hour = Math.floor(now / 3600000);
  for (const [id, r] of Object.entries(results)) {
    const slot = (h[id] ||= {});
    const prev = slot[hour];
    if (!prev || severity[r.state] < severity[prev]) slot[hour] = r.state;
    for (const k of Object.keys(slot)) if (Number(k) <= hour - 24) delete slot[k];
  }
  try { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path + '.tmp', JSON.stringify(h)); renameSync(path + '.tmp', path); } catch {}
  return Object.fromEntries(Object.entries(h).map(([id, slot]) => [id, Array.from({ length: 24 }, (_, i) => slot[hour - 23 + i] ?? null)]));
}

export function mergeSystems(rows, probes, feed, history, now) {
  const fresh = feed.present && !feed.stale;
  const byId = Object.fromEntries(feed.services.map((s) => [s.id, s]));
  const services = rows.map((r) => {
    const f = fresh ? byId[r.id] : undefined;
    const p = probes[r.id] || { state: 'unknown', detail: '' };
    const pick = f ? { state: f.state, detail: f.detail, source: 'feed', checkedAt: f.checkedAt || feed.checkedAt } : { ...p, source: 'probe', checkedAt: new Date(now).toISOString() };
    return { ...r, ...pick, history: history[r.id] || Array(24).fill(null) };
  }).sort((a, b) => severity[a.state] - severity[b.state] || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(STATES.map((s) => [s, services.filter((x) => x.state === s).length]));
  return { services, counts, feed: { present: feed.present, stale: feed.stale, checkedAt: feed.checkedAt, error: feed.error || null } };
}

export function historyPath(dataDir) { return join(dataDir, 'systems-history.json'); }
