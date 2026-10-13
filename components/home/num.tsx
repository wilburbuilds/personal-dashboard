'use client';
import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

/** Money that tweens on refresh instead of jumping. Cents in, whole dollars out. */
export function Money({ cents, className }: { cents: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(cents);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = prev.current;
    prev.current = cents;
    if (reduce || from === cents) { el.textContent = fmt(cents); return; }
    const c = animate(from, cents, { duration: 0.2, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => { el.textContent = fmt(v); } });
    return () => c.stop();
  }, [cents, reduce]);
  return <span ref={ref} className={`num ${className ?? ''}`}>{fmt(cents)}</span>;
}
export const fmt = (cents: number) => (cents < 0 ? '-' : '') + '$' + Math.round(Math.abs(cents) / 100).toLocaleString('en-US');
export const fmtK = (cents: number) => { const d = Math.abs(cents) / 100; return (cents < 0 ? '-' : '') + (d >= 1000 ? `$${(d / 1000).toFixed(d >= 10000 ? 0 : 1)}k` : `$${Math.round(d)}`); };
