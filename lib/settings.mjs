import { readFileSync, statSync, writeFileSync, renameSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { homeConfig } from './home-config.mjs';

/**
 * User settings layered over lib/home-config.mjs defaults, stored server-side so every browser
 * sees the same thing. File: ~/.config/home-dashboard/settings.json (mode 600). Only this module
 * writes it, and only after validation.
 */
export const TAB_IDS = ['today', 'projects', 'systems', 'budget', 'health', 'query'];
export const settingsPath = () => process.env.HD_SETTINGS_FILE || join(dirname(homeConfig.envFile), 'settings.json');

const clone = (o) => JSON.parse(JSON.stringify(o));
/** Snapshot of the shipped defaults, taken before any settings are applied. */
export const DEFAULTS = Object.freeze({
  pages: { order: [...TAB_IDS], hidden: [] },
  theme: homeConfig.theme,
  webFonts: homeConfig.webFonts,
  today: { lead: homeConfig.today.lead, headlines: 3, trends: 3, tickers: [], tickersShown: 6, tickerOrder: 'holdings' },
  todos: { excludeLists: [], vikunja: true },
  prefs: { city: '', topics: '', sourceNotes: '', deviceLocation: false },
  budget: { overThreshold: homeConfig.budget.overThreshold, fixedCategories: [...homeConfig.budget.fixedCategories], billWindowDays: homeConfig.budget.billWindowDays },
  health: { tempUnit: homeConfig.health.tempUnit, badge: homeConfig.health.badge === 'stale' ? 'stale' : 'off', logStatus: homeConfig.health.logStatus, staleLogDays: homeConfig.health.staleLogDays },
  markdown: { checkboxes: homeConfig.markdown.checkboxes, dataview: homeConfig.markdown.dataview },
  query: { scope: homeConfig.query.vaults.map((v) => v.id) },
});
const ALL_VAULTS = homeConfig.query.vaults.map((v) => ({ ...v }));

const tabId = z.enum(TAB_IDS);
const category = z.string().trim().min(1).max(60);
export const settingsSchema = z.object({
  pages: z.object({
    order: z.array(tabId).max(TAB_IDS.length).refine((a) => new Set(a).size === a.length, 'Duplicate tab in order'),
    hidden: z.array(tabId).max(TAB_IDS.length - 1).refine((a) => !a.includes('today'), 'Today cannot be hidden'),
  }).strict(),
  theme: z.enum(['system', 'dark', 'light']),
  webFonts: z.boolean(),
  today: z.object({
    lead: z.enum(['rules', 'off']),
    headlines: z.number().int().min(0).max(10), trends: z.number().int().min(0).max(10),
    tickers: z.array(z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/, 'Use a ticker symbol like MU or BRK-B')).max(30).refine((a) => new Set(a).size === a.length, 'Duplicate ticker'),
    tickersShown: z.number().int().min(1).max(30), tickerOrder: z.enum(['holdings', 'saved']),
  }).strict(),
  todos: z.object({
    excludeLists: z.array(z.string().trim().min(1).max(80)).max(30).refine((a) => new Set(a).size === a.length, 'Duplicate list'),
    vikunja: z.boolean(),
  }).strict(),
  prefs: z.object({
    city: z.string().trim().max(150), topics: z.string().max(500), sourceNotes: z.string().max(2000), deviceLocation: z.boolean(),
  }).strict(),
  budget: z.object({
    overThreshold: z.number().min(0).max(0.5),
    fixedCategories: z.array(category).max(30).refine((a) => new Set(a).size === a.length, 'Duplicate category'),
    billWindowDays: z.number().int().min(1).max(31),
  }).strict(),
  health: z.object({
    tempUnit: z.enum(['C', 'F']), badge: z.enum(['off', 'stale']), logStatus: z.enum(['auto', 'text']),
    staleLogDays: z.number().int().min(1).max(60),
  }).strict(),
  markdown: z.object({ checkboxes: z.enum(['readonly', 'plain']), dataview: z.enum(['code', 'hide']) }).strict(),
  query: z.object({ scope: z.array(z.string()).min(1).refine((a) => a.every((id) => ALL_VAULTS.some((v) => v.id === id)), 'Unknown vault') }).strict(),
}).strict();

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
function merge(base, patch) {
  const out = clone(base);
  for (const [k, v] of Object.entries(patch || {})) out[k] = isObj(v) && isObj(out[k]) ? merge(out[k], v) : v;
  return out;
}

/** Complete the tab order with any tabs the stored file doesn't mention (new tabs appear at the end). */
function normalize(s) {
  const order = [...s.pages.order.filter((id) => TAB_IDS.includes(id)), ...TAB_IDS.filter((id) => !s.pages.order.includes(id))];
  return { ...s, pages: { order, hidden: s.pages.hidden.filter((id) => id !== 'today') } };
}

/** Drop keys from older versions so a strict schema still accepts the file. */
function migrate(raw) {
  if (isObj(raw?.today)) { const { positions, holdingsStaleHours, ...rest } = raw.today; void holdingsStaleHours; raw.today = { ...(positions && !('tickersShown' in rest) ? { tickersShown: positions } : {}), ...rest }; }
  return raw;
}

let cache = { mtime: -1, path: '', value: clone(DEFAULTS), error: null };
/** Current settings (defaults + file). An unreadable or invalid file falls back to defaults. */
export function getSettings() {
  const p = settingsPath();
  let mtime = 0;
  try { mtime = statSync(p).mtimeMs; } catch { mtime = 0; }
  if (cache.path === p && cache.mtime === mtime) return cache.value;
  let value = clone(DEFAULTS), error = null;
  if (mtime) {
    try {
      const parsed = settingsSchema.safeParse(merge(DEFAULTS, migrate(JSON.parse(readFileSync(p, 'utf8')))));
      if (parsed.success) value = normalize(parsed.data); else error = 'settings.json is invalid; using defaults';
    } catch { error = 'settings.json could not be read; using defaults'; }
  }
  cache = { mtime, path: p, value, error };
  applyToConfig(value);
  return value;
}
export const settingsError = () => (getSettings(), cache.error);

/** Push settings into the shared homeConfig object so existing readers pick them up. */
function applyToConfig(s) {
  homeConfig.theme = s.theme;
  homeConfig.webFonts = s.webFonts;
  homeConfig.today.lead = s.today.lead;
  Object.assign(homeConfig.budget, s.budget);
  homeConfig.health.tempUnit = s.health.tempUnit;
  homeConfig.health.badge = s.health.badge === 'stale' ? 'stale' : false;
  homeConfig.health.logStatus = s.health.logStatus;
  homeConfig.health.staleLogDays = s.health.staleLogDays;
  Object.assign(homeConfig.markdown, s.markdown);
  homeConfig.phoneTabs = s.pages.order.filter((id) => !s.pages.hidden.includes(id)).slice(0, 4);
}

/** Validate a partial update, merge it over the current settings and write the file atomically (mode 600). */
export function saveSettings(patch) {
  if (!isObj(patch)) return { ok: false, error: 'Expected an object' };
  const next = merge(getSettings(), migrate(clone(patch)));
  const parsed = settingsSchema.safeParse(next);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join('.') || 'settings'}: ${i.message}`).join('; ') };
  const value = normalize(parsed.data);
  const p = settingsPath();
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, p);
  cache.mtime = -1;
  return { ok: true, settings: getSettings() };
}

export function resetSettings(section) {
  if (section && !(section in DEFAULTS)) return { ok: false, error: 'Unknown section' };
  const cur = getSettings();
  return saveSettings(section ? { ...cur, [section]: clone(DEFAULTS[section]) } : clone(DEFAULTS));
}

/** Tab ids in display order, minus hidden ones. */
export function visibleTabIds() {
  const s = getSettings();
  return s.pages.order.filter((id) => !s.pages.hidden.includes(id));
}
export const vaultChoices = () => ALL_VAULTS.map((v) => ({ value: v.id, label: v.label }));
