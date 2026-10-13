import { CircleCheck, TriangleAlert, CircleX, CirclePause, CircleHelp, CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';

export type State = 'up' | 'degraded' | 'down' | 'paused' | 'unknown';
const stateIcon = { up: CircleCheck, degraded: TriangleAlert, down: CircleX, paused: CirclePause, unknown: CircleHelp };

export function StatusLabel({ state }: { state: State }) {
  const Icon = stateIcon[state];
  return <span className={`hd-state st-${state}`}><Icon aria-hidden />{state}</span>;
}

export function PanelError({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="hd-panel hd-error" role="alert">
      <CircleAlert aria-hidden className="hd-i" />
      <div><strong>{title}</strong><p>{detail}</p></div>
      {action}
    </div>
  );
}

export const timeLabel = (iso: string | Date) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }).format(new Date(iso));

export function ago(iso: string | Date, now = Date.now()) {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}
