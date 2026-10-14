import type { LucideIcon } from 'lucide-react';
import type { FC } from 'react';

export type TabId = 'today' | 'projects' | 'systems' | 'budget' | 'health' | 'query';
export type TabStatus = 'live' | 'hidden';
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
  /** Optional per-tab section on the Settings page. Keys are dotted paths into Settings (lib/settings.mjs) or Today preferences. */
  settings?: SettingsSection | (() => SettingsSection);
}

export type SettingOption = { value: string; label: string };
export type SettingField = {
  key: string;
  label: string;
  help?: string;
  type: 'select' | 'segmented' | 'toggle' | 'number' | 'percent' | 'tags' | 'multi' | 'text';
  options?: SettingOption[];
  min?: number; max?: number; step?: number; unit?: string; maxLength?: number;
  /** 'settings' (default) writes settings.json; 'preferences' writes the existing Today preferences store. */
  store?: 'settings' | 'preferences';
  /** tags only: chips can be reordered (drag, or Alt+Arrow keys); order is saved. */
  orderable?: boolean;
  placeholder?: string;
};
export type SettingsSection = { title?: string; description?: string; fields: SettingField[] };

export const ok = <D,>(data: D, fetchedAt = new Date()): SourceResult<D> => ({ ok: true, data, fetchedAt });
export const fail = <D,>(error: unknown, stale?: D): SourceResult<D> => ({ ok: false, error: error instanceof Error ? error.message : String(error), stale });
