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
      { key: 'sourceNotes', label: 'Your sources', type: 'text', store: 'preferences', maxLength: 2000, help: 'Notes about where Today’s data comes from (calendars, channels, Home Assistant). No passwords or tokens. Weather location and headline topics are edited on Today.' },
    ],
  },
};
export default today;
