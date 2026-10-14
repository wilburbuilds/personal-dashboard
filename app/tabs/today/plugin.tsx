import { Sun } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import TodayV2 from './today';

const today: TabPlugin<null> = {
  id: 'today', title: 'Today', icon: Sun, order: 1, status: 'live', refreshSeconds: 0,
  load: async () => ok(null),
  View: TodayV2,
};
export default today;
