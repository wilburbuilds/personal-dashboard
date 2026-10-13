import type { LucideIcon } from 'lucide-react';
import type { FC } from 'react';

export type TabId = 'today' | 'projects' | 'systems' | 'budget' | 'query';
export type TabStatus = 'live' | 'beta' | 'hidden';
export type SourceResult<D> = { ok: true; data: D; fetchedAt: Date } | { ok: false; error: string; stale?: D };
export type LoadCtx = { now: Date; signal: AbortSignal; params: URLSearchParams };
export type Attention = { count: number; tone: 'warn' | 'over' };

export interface TabPlugin<D> {
  id: TabId;
  title: string;
  icon: LucideIcon;
  order: number;
  status: TabStatus;
  load(ctx: LoadCtx): Promise<SourceResult<D>>;
  View: FC<{ data: D; fetchedAt: Date }>;
  refreshSeconds: number;
  attention?(data: D): Attention | null;
  summary?(data: D): string;
  Skeleton?: FC;
}

export const ok = <D,>(data: D, fetchedAt = new Date()): SourceResult<D> => ({ ok: true, data, fetchedAt });
export const fail = <D,>(error: unknown, stale?: D): SourceResult<D> => ({ ok: false, error: error instanceof Error ? error.message : String(error), stale });
