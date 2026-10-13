import { Sun } from 'lucide-react';
import type { TabPlugin } from '../types';
import { ok } from '../types';
import Dashboard from './dashboard';

function TodayView() {
  return <div className="hd-today"><Dashboard /></div>;
}

const today: TabPlugin<null> = {
  id: 'today', title: 'Today', icon: Sun, order: 1, status: 'live', refreshSeconds: 0,
  load: async () => ok(null),
  View: TodayView,
};
export default today;
