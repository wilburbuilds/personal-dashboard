'use client';
import { PanelError } from '@/components/home/ui';

export default function TabError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="hd-page">
      <PanelError title="This tab crashed" detail={error.message} action={<button className="hd-btn" onClick={reset}>Retry</button>} />
    </div>
  );
}
