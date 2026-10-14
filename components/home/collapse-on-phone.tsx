'use client';
import { useEffect } from 'react';

/** Closes <details data-collapse-phone> on phones after hydration (the Knee block starts collapsed there). */
export function CollapseOnPhone() {
  useEffect(() => {
    if (!window.matchMedia('(max-width: 639px)').matches) return;
    document.querySelectorAll<HTMLDetailsElement>('details[data-collapse-phone]').forEach((d) => { d.open = false; });
  }, []);
  return null;
}
