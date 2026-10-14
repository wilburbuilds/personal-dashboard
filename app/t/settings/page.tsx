import { tabs } from '@/app/tabs/registry';
import { getSettings, settingsError, DEFAULTS } from '@/lib/settings.mjs';
import type { Preferences } from '@/lib/dashboard';
import { readPrefs } from '@/lib/prefs';
import type { SettingsSection } from '@/app/tabs/types';
import SettingsView, { type PageRow } from './view';

export const dynamic = 'force-dynamic';

const GLOBAL: SettingsSection = {
  title: 'Appearance',
  description: 'Applies on every device.',
  fields: [
    { key: 'theme', label: 'Theme', type: 'segmented', options: [{ value: 'system', label: 'System' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }] },
    { key: 'webFonts', label: 'Web fonts', help: 'Familjen Grotesk, Hanken Grotesk and Geist Mono. Off uses system fonts.', type: 'toggle' },
  ],
};
const MARKDOWN: SettingsSection = {
  title: 'Notes',
  description: 'How vault markdown renders in Query and Health.',
  fields: [
    { key: 'markdown.checkboxes', label: 'Task checkboxes', help: 'Read-only boxes, or plain list items.', type: 'segmented', options: [{ value: 'readonly', label: 'Read-only boxes' }, { value: 'plain', label: 'Plain list' }] },
    { key: 'markdown.dataview', label: 'Dataview blocks', type: 'segmented', options: [{ value: 'code', label: 'Show as code' }, { value: 'hide', label: 'Hide' }] },
  ],
};

export default async function SettingsPage() {
  const settings = getSettings();
  const prefs: Preferences = await readPrefs();
  const pages: PageRow[] = settings.pages.order.map((id) => {
    const t = tabs.find((x) => x.id === id)!;
    const sec = typeof t.settings === 'function' ? t.settings() : t.settings;
    const Icon = t.icon;
    return { id, title: t.title, icon: <Icon aria-hidden className="hd-i" />, section: sec ?? null };
  });
  return <SettingsView settings={settings} defaults={DEFAULTS} prefs={prefs} pages={pages} global={GLOBAL} markdown={MARKDOWN} error={settingsError()} />;
}
