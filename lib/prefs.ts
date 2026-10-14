import { getSettings, saveSettings } from './settings.mjs';
import { readRecord } from './dashboard-store';
import { preferencesSchema, type Preferences } from './dashboard';

/**
 * Today preferences (weather location, headline topics, source notes, device-location toggle).
 * They live in the server settings.json ("prefs"), never in code. Older installs kept them in the
 * SQLite dashboard_records table; the first read copies that record over once.
 */
export async function readPrefs(): Promise<Preferences> {
  const p = getSettings().prefs;
  if (p.city || p.topics || p.sourceNotes || p.deviceLocation) return p;
  const old = (await readRecord('preferences')) as Partial<Preferences> | null;
  if (old && (old.city || old.topics || old.sourceNotes)) {
    const r = saveSettings({ prefs: { city: old.city ?? '', topics: old.topics ?? '', sourceNotes: old.sourceNotes ?? '', deviceLocation: false } });
    if (r.ok) return r.settings.prefs;
  }
  return p;
}

export const prefsPatchSchema = preferencesSchema.partial().strict();
export function savePrefs(patch: Partial<Preferences>) {
  const r = saveSettings({ prefs: patch });
  return r.ok ? { ok: true as const, prefs: r.settings.prefs } : r;
}
