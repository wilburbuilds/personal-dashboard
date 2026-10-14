import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, statSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'hd-settings-'));
const file = join(dir, 'settings.json');
process.env.HD_SETTINGS_FILE = file;
const S = await import('../lib/settings.mjs');
const { homeConfig } = await import('../lib/home-config.mjs');

test('defaults when no file exists', () => {
  assert.equal(existsSync(file), false);
  const s = S.getSettings();
  assert.deepEqual(s.pages.hidden, []);
  assert.deepEqual(S.visibleTabIds(), S.DEFAULTS.pages.order);
  assert.equal(S.visibleTabIds().length, S.TAB_IDS.length);
});

test('save persists with mode 600 and applies to config', () => {
  const r = S.saveSettings({ pages: { hidden: ['query'] }, budget: { overThreshold: 0.2 }, health: { tempUnit: 'C' } });
  assert.equal(r.ok, true, r.error);
  assert.equal(statSync(file).mode & 0o777, 0o600);
  const disk = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual(disk.pages.hidden, ['query']);
  assert.equal(disk.budget.overThreshold, 0.2);
  assert.ok(!S.visibleTabIds().includes('query'));
  assert.equal(homeConfig.budget.overThreshold, 0.2);
});

test('rejects invalid input without writing', () => {
  const before = readFileSync(file, 'utf8');
  for (const bad of [
    { pages: { hidden: ['today'] } },
    { pages: { order: ['today', 'nope'] } },
    { budget: { overThreshold: 5 } },
    { query: { scope: [] } },
    { query: { scope: ['not-a-vault'] } },
    { bogus: 1 },
    'string',
  ]) assert.equal(S.saveSettings(bad).ok, false, JSON.stringify(bad));
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('order normalization keeps every tab', () => {
  const r = S.saveSettings({ pages: { order: ['health', 'today'] } });
  if (r.ok) {
    assert.equal(r.settings.pages.order.length, S.TAB_IDS.length);
    assert.equal(new Set(r.settings.pages.order).size, S.TAB_IDS.length);
    assert.equal(r.settings.pages.order[0], 'health');
  }
});

test('reset one section and everything', () => {
  assert.equal(S.resetSettings('budget').ok, true);
  assert.equal(S.getSettings().budget.overThreshold, S.DEFAULTS.budget.overThreshold);
  assert.equal(S.resetSettings('nope').ok, false);
  assert.equal(S.resetSettings().ok, true);
  assert.deepEqual(S.getSettings().pages, S.DEFAULTS.pages);
});

test('corrupt file falls back to defaults', async () => {
  writeFileSync(file, '{not json', { mode: 0o600 });
  await new Promise((r) => setTimeout(r, 20));
  const s = S.getSettings();
  assert.deepEqual(s.pages, S.DEFAULTS.pages);
  assert.ok(S.settingsError());
});
