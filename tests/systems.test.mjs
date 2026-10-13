import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseServices, probeAll, httpProbe, readHealthFeed, mergeSystems } from '../lib/sources/systems.mjs';

const md = `# x

| Service | What it is | Reach it at | Lifecycle |
|---|---|---|---|
| Actual Budget | Budgeting app | https://h:5443 (tailnet) | Restarts at login |
| Buzz Concierge | Headless Buzz agent — **paused 2026-09-24** | wss://h | Stopped; see below to resume |
| backup-pi | Raspberry Pi — **offline since ~2026-10-11** | Tailscale \`backup.example:8000\` | systemd on the Pi |

## Next`;

test('parses the services overview table', () => {
  const rows = parseServices(md);
  assert.deepEqual(rows.map((r) => [r.id, r.paused]), [['actual-budget', false], ['buzz-concierge', true], ['backup-pi', false]]);
  assert.equal(rows[0].reach, 'https://h:5443');
});

test('a killed probe target flips to down on the next refresh', async () => {
  const server = createServer((_, res) => res.end('ok')).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const probes = { 'actual-budget': httpProbe(`http://127.0.0.1:${server.address().port}/`) };
  const rows = parseServices(md).slice(0, 2);
  const first = await probeAll(rows, probes, { docker: async () => [] });
  assert.equal(first['actual-budget'].state, 'up');
  assert.equal(first['buzz-concierge'].state, 'paused');
  await new Promise((r) => server.close(r));
  const second = await probeAll(rows, probes, { docker: async () => [] });
  assert.equal(second['actual-budget'].state, 'down');
});

test('absent feed falls back to probes; fresh feed wins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hd-'));
  const now = Date.parse('2026-10-13T20:00:00Z');
  const absent = readHealthFeed(join(dir, 'nope.json'), now, 30);
  assert.equal(absent.present, false);
  writeFileSync(join(dir, 'h.json'), JSON.stringify({ checkedAt: '2026-10-13T19:55:00Z', services: [{ id: 'backup-pi', state: 'down', detail: 'offline' }] }));
  const feed = readHealthFeed(join(dir, 'h.json'), now, 30);
  const rows = parseServices(md);
  const merged = mergeSystems(rows, { 'backup-pi': { state: 'up', detail: 'probe' } }, feed, {}, now);
  assert.equal(merged.services[0].id, 'backup-pi');
  assert.equal(merged.services[0].source, 'feed');
  assert.equal(mergeSystems(rows, {}, absent, {}, now).services.find((s) => s.id === 'backup-pi').source, 'probe');
});
