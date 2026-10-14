export type Stage = { type: string; start: string; end: string };
export type DayMetrics = {
  day: string; fetchedAt: string | null;
  device: { name: string; battery: number | null; lastSync: string | null } | null;
  sleep: null | { start: string | null; end: string | null; stages: Stage[]; stagesSummary: Record<string, { minutes: number; count: number }>; asleep: number | null; awake: number | null; inBed: number | null; toFallAsleep: number | null; shortAwakenings: number | null };
  rhr: number | null; hrv: number | null; breathing: number | null; spo2: number | null; tempDeltaC: number | null;
  steps: number | null; distanceMi: number | null; calories: number | null; activeCalories: number | null; activeMinutes: number | null; sedentaryMin: number | null;
  hrAvg: number | null; hrMin: number | null; hrMax: number | null;
  exercises: { name: string; start: string | null; minutes: number | null; distanceMi: number | null; avgHr: number | null }[];
};
export type Signal = { series: (number | null)[]; avg: number | null; now: number | null };
export type Overview = {
  today: string; latestDay: string | null; isToday: boolean; days: string[]; missing: string[];
  current: (Omit<DayMetrics, never> & { strip: number[] }) | null;
  signals: { rhr: Signal; hrv: Signal; breathing: Signal; spo2: Signal; tempDeltaC: Signal };
  sleepHours: (number | null)[]; steps: (number | null)[];
  exercises: (DayMetrics['exercises'][number] & { day: string })[];
};
export function pacificDay(d?: Date): string;
export function addDays(day: string, n: number): string;
export function dayMetrics(bundle: unknown): DayMetrics | null;
export function activityStrip(levels: { start: string; end?: string; level: number }[]): number[];
export function buildOverview(bundles: Record<string, unknown>, now?: Date, trendDays?: number): Overview;
export function readFitbitBundles(vault: string, now?: Date, trendDays?: number): Promise<Record<string, unknown>>;
