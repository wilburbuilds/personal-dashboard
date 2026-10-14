import { Sun } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { getSettings } from '@/lib/settings.mjs';
import TodayV2 from './today';

export type TodayData = { lead: 'rules' | 'off'; headlines: number; trends: number; positions: number; holdingsStaleHours: number };

const today: TabPlugin<TodayData> = {
  id: 'today', title: 'Today', icon: Sun, order: 1, status: 'live', refreshSeconds: 0,
  load: async () => ok({ ...getSettings().today }),
  View: TodayV2,
  settings: {
    description: 'Your day at a glance.',
    fields: [
      { key: 'today.lead', label: 'Headline sentence', help: 'Composed from your calendar, workout and replies, or hidden.', type: 'segmented', options: [{ value: 'rules', label: 'From your day' }, { value: 'off', label: 'Off' }] },
      { key: 'today.headlines', label: 'Headlines', help: 'Traditional headlines from your feeds.', type: 'number', min: 0, max: 10, step: 1 },
      { key: 'today.trends', label: 'X trends', help: 'Read from ~/.local/share/home-dashboard/x-trends.json, written by a local agent.', type: 'number', min: 0, max: 10, step: 1 },
      { key: 'today.positions', label: 'Positions shown', help: 'Largest by value first; the rest fold behind “Show more”.', type: 'number', min: 1, max: 30, step: 1 },
      { key: 'today.holdingsStaleHours', label: 'Holdings are stale after', help: 'Flags the Positions sync time when the holdings file is older than this.', type: 'number', min: 1, max: 336, step: 1, unit: 'hours' },
      { key: 'city', label: 'Weather location', type: 'text', store: 'preferences', maxLength: 150, help: 'City, state or country.' },
      { key: 'topics', label: 'Headline topics', type: 'text', store: 'preferences', maxLength: 500, help: 'Saved for curated headlines; RSS feeds don’t change.' },
    ],
  },
};
export default today;
