export type WeekDay = { day: string; session: string; rest: boolean; time: string | null; duration: number[] | null; rawTime: string; date: string; status: 'off' | 'done' | 'today' | 'planned' | 'unlogged' | 'notdone' | 'before'; timeDiffers: boolean };
export type LogRow = { date: string; session: string; results: string; notes: string; status: string; state: 'done' | 'missed' | 'skipped' | 'rest' };
export type Workouts = {
  today: string; weekday: string; phase: string | null; start: string | null; end: string | null; reassess: string | null;
  weekNo: number | null; weeksTotal: number | null; usualTime: string | null; week: WeekDay[];
  tonight: null | { title: string; time: string | null; rawTime: string; duration: number[] | null; knee: { rows: { name: string; sets: string }[]; minutes: number | null }; main: { name: string; sets: string }[] };
  next: null | { day: string; date: string; session: string; time: string | null };
  rules: { reserve: string | null; pain: string | null };
  log: LogRow[]; records: { movement: string; best: string; date: string }[]; hasStatusColumn: boolean;
  newestLog: string | null; stale: boolean; found?: { program: boolean; log: boolean };
};
export function pacificDay(d?: Date): string;
export function weekdayOf(day: string): string;
export function tables(md: string): { head: string[]; rows: string[][] }[];
export function parseProgram(md?: string): unknown;
export function rowStatus(row: { session: string; results: string; notes: string; status?: string }, mode?: string): LogRow['state'];
export function parseLog(md?: string, mode?: string): { rows: LogRow[]; records: Workouts['records']; hasStatusColumn: boolean };
export function buildWorkouts(program: string, log: string, now?: Date, opts?: { logStatus?: string; staleLogDays?: number }): Workouts;
export function readWorkouts(vault: string, now?: Date, opts?: { logStatus?: string; staleLogDays?: number }): Promise<Workouts>;
