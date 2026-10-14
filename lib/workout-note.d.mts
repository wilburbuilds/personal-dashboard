export type SetItem = { line: number; text: string; hash: string; ord: number; checked: boolean; exercise: string; set: string; target: string };
export type DaySection = { title: string; items: SetItem[]; text: string[] };
export type DayNote = { path: string; fm: Record<string, string>; sections: DaySection[]; hash: string };
export declare const WORKOUT_DIR: string;
export declare const INBOX: string;
export declare class WriteError extends Error { code: string }
export declare function lineHash(t: string): string;
export declare function fileHash(t: string): string;
export declare function notePath(vault: string, day: string): string;
export declare function parseDayNote(md: string): Omit<DayNote, 'path'>;
export declare function applyCheck(md: string, c: { hash: string; ord?: number; checked: boolean }): { md: string; changed: boolean };
export declare function writeCheck(vault: string, day: string, c: { hash: string; ord?: number; checked: boolean }): Promise<{ changed: boolean } & Omit<DayNote, 'path'>>;
export declare function readDayNote(vault: string, day: string): Promise<DayNote | null>;
export declare function appendInbox(vault: string, text: string, at?: Date): Promise<{ text: string; at: string }>;
export declare function postWebhook(env: Record<string, string>, payload: unknown, f?: typeof fetch): Promise<{ sent: boolean; skipped: boolean; status?: number }>;
