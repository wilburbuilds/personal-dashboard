import { Sun } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import { getSettings } from '@/lib/settings.mjs';
import TodayV2 from './today';

export type TodayData = { lead: 'rules' | 'off'; headlines: number; trends: number; tickers: string[]; tickersShown: number; tickerOrder: 'holdings' | 'saved'; chartUrl: string };

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
      { key: 'today.tickers', label: 'Market tickers', help: 'Underlying symbols, largest position first (drag to reorder, or Alt+←/→ on a focused chip). Day moves only; no holdings are stored.', type: 'tags', orderable: true, placeholder: 'Add a ticker' },
      { key: 'today.tickerOrder', label: 'Ticker order', help: 'Use ~/.local/share/home-dashboard/holdings-rank.json when an agent keeps it fresh (order only, no values); otherwise the saved order above.', type: 'segmented', options: [{ value: 'holdings', label: 'Holdings file if present' }, { value: 'saved', label: 'Saved order' }] },
      { key: 'today.tickersShown', label: 'Tickers shown', help: 'The rest fold behind “Show more”.', type: 'number', min: 1, max: 30, step: 1 },
      { key: 'today.chartUrl', label: 'TradingView chart layout URL', help: 'Tickers on Today open here in a new tab, e.g. https://www.tradingview.com/chart/<layout id>/. Leave as https://www.tradingview.com/chart/ for the default chart.', type: 'text', maxLength: 200 },
      { key: 'sourceNotes', label: 'Your sources', type: 'text', store: 'preferences', maxLength: 2000, help: 'Notes about where Today’s data comes from (calendars, channels, Home Assistant). No passwords or tokens. Weather location and headline topics are edited on Today.' },
    ],
  },
};
export default today;
