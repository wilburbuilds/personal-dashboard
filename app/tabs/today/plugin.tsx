import { Sun } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { getSettings } from '@/lib/settings.mjs';
import TodayV2 from './today';

export type TodayData = { lead: 'rules' | 'off' };

const today: TabPlugin<TodayData> = {
  id: 'today', title: 'Today', icon: Sun, order: 1, status: 'live', refreshSeconds: 0,
  load: async () => ok({ lead: getSettings().today.lead }),
  View: TodayV2,
  settings: {
    description: 'Your day at a glance.',
    fields: [
      { key: 'today.lead', label: 'Headline sentence', help: 'Composed from your calendar, workout and replies, or hidden.', type: 'segmented', options: [{ value: 'rules', label: 'From your day' }, { value: 'off', label: 'Off' }] },
      { key: 'city', label: 'Weather location', type: 'text', store: 'preferences', maxLength: 150, help: 'City, state or country.' },
      { key: 'topics', label: 'Headline topics', type: 'text', store: 'preferences', maxLength: 500, help: 'Saved for curated headlines; RSS feeds don’t change.' },
    ],
  },
};
export default today;
