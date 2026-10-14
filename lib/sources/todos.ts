import { execFile } from 'node:child_process';
import { z } from 'zod';
import { vget, task as vtask, project as vproject } from '@/lib/sources/vikunja';
import { homeConfig } from '@/lib/home-config.mjs';
import { getSettings } from '@/lib/settings.mjs';
import { isDemo, demoTodos } from '@/lib/demo/fixtures.mjs';

const TZ = 'America/Los_Angeles';
export type Todo = { id: string; title: string; due: string | null; allDay: boolean; overdue: boolean; dueToday: boolean; priority: number; notes?: string; url?: string };
export type TodoGroup = { id: string; title: string; items: Todo[] };
export type TodoSource = { status: 'ready' | 'unconnected' | 'error'; note: string; groups: TodoGroup[] };
export type Todos = { at: string; reminders: TodoSource; vikunja: TodoSource };

const REMINDCTL = process.env.HD_REMINDCTL || '/opt/homebrew/bin/remindctl';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

function run(cmd: string, args: string[], timeout = 15000) {
  return new Promise<{ ok: boolean; out: string; err: string }>((res) =>
    execFile(cmd, args, { timeout, maxBuffer: 8 << 20 }, (e, out, err) => res({ ok: !e, out: String(out), err: String(err) })));
}

/** Classify a due date against today in Pacific time. */
export function dueState(due: string | null, allDay: boolean, now = new Date()) {
  if (!due) return { overdue: false, dueToday: false };
  const d = new Date(due);
  if (Number.isNaN(+d)) return { overdue: false, dueToday: false };
  // All-day reminders carry midnight UTC of their date; compare calendar dates, not instants.
  const dk = allDay ? due.slice(0, 10) : dayKey(d), tk = dayKey(now);
  return { overdue: dk < tk, dueToday: dk === tk };
}

const rem = z.object({
  id: z.string(), title: z.string(), isCompleted: z.boolean().optional(), listName: z.string().optional().default(''),
  listID: z.string().optional().default(''), dueDate: z.string().nullable().optional(), dueDateIsAllDay: z.boolean().optional(),
  priority: z.union([z.string(), z.number()]).optional(), notes: z.string().nullable().optional(),
});
const PRI: Record<string, number> = { high: 3, medium: 2, low: 1, none: 0 };

/**
 * Open Apple Reminders via remindctl (read-only: `show open`). Needs macOS Reminders access for the
 * process running the dashboard. If direct access is refused, retry through osascript, which
 * carries its own Reminders permission.
 */
const ACCESS_NOTE = 'Reminders access is off for the dashboard service. On the Mac mini, allow its node binary under System Settings › Privacy & Security › Reminders, then restart the service.';
/** Reminders reads can hang for a long time when macOS is holding an unseen permission prompt, so
 * keep the last good answer for a minute and back off for 10 minutes after a failure. */
let remCache: { at: number; out: string } | null = null;
let remFail: { at: number; note: string } | null = null;
async function remindersJson(): Promise<{ out: string } | { note: string }> {
  const t = Date.now();
  if (remCache && t - remCache.at < 60000) return remCache;
  if (remFail && t - remFail.at < 600000) return remCache ?? remFail;
  const args = ['show', 'open', '--json', '--no-input'];
  let r = await run(REMINDCTL, args, 5000);
  if (!r.ok || !r.out.trim().startsWith('[')) {
    if (/ENOENT|not found/i.test(r.err) && !r.out) return { note: 'unconnected' };
    r = await run('/usr/bin/osascript', ['-e', `do shell script "${REMINDCTL} ${args.join(' ')}"`], 5000);
  }
  if (!r.ok || !r.out.trim().startsWith('[')) {
    const denied = /access|authori[sz]|permission|denied/i.test(r.err + r.out) || !r.out;
    remFail = { at: t, note: denied ? ACCESS_NOTE : 'Reminders could not be read.' };
    return remCache ?? remFail;
  }
  remFail = null;
  remCache = { at: t, out: r.out };
  return remCache;
}

export async function readReminders(now = new Date(), exclude: string[] = []): Promise<TodoSource> {
  const got = await remindersJson();
  if ('note' in got) {
    if (got.note === 'unconnected') return { status: 'unconnected', note: 'remindctl is not installed (brew install steipete/tap/remindctl).', groups: [] };
    return { status: 'error', note: got.note, groups: [] };
  }
  const r = got;
  const parsed = z.array(rem).safeParse(JSON.parse(r.out));
  if (!parsed.success) return { status: 'error', note: 'Reminders answered in an unexpected shape.', groups: [] };
  const skip = new Set(exclude.map((s) => s.toLowerCase()));
  const groups = new Map<string, TodoGroup>();
  for (const x of parsed.data) {
    if (x.isCompleted || skip.has(x.listName.toLowerCase())) continue;
    const allDay = !!x.dueDateIsAllDay, due = x.dueDate ?? null;
    const st = dueState(due, allDay, now);
    const g = groups.get(x.listName) ?? { id: `r:${x.listID || x.listName}`, title: x.listName || 'Reminders', items: [] };
    g.items.push({ id: `r:${x.id}`, title: x.title, due, allDay, ...st, priority: typeof x.priority === 'number' ? x.priority : PRI[String(x.priority ?? 'none')] ?? 0, notes: x.notes ?? undefined });
    groups.set(x.listName, g);
  }
  return { status: 'ready', note: 'Apple Reminders, read-only', groups: [...groups.values()].map(sortGroup).sort((a, b) => a.title.localeCompare(b.title)) };
}

/** Open Vikunja tasks (GET only), grouped by project. */
export async function readVikunjaTodos(now = new Date(), signal: AbortSignal = AbortSignal.timeout(10000)): Promise<TodoSource> {
  try {
    const [tasks, projects] = await Promise.all([
      vget('/tasks?filter=done%3Dfalse&per_page=200', z.array(vtask.extend({ project_id: z.number().optional() })), signal),
      vget('/projects', z.array(vproject), signal),
    ]);
    const names = new Map(projects.map((p) => [p.id, p.title]));
    const groups = new Map<number, TodoGroup>();
    for (const t of tasks) {
      if (t.done) continue;
      const due = t.due_date && !t.due_date.startsWith('0001') ? t.due_date : null;
      const pid = t.project_id ?? 0;
      const g = groups.get(pid) ?? { id: `v:${pid}`, title: names.get(pid) ?? 'Tasks', items: [] };
      g.items.push({ id: `v:${t.id}`, title: t.title, due, allDay: false, ...dueState(due, false, now), priority: t.priority ?? 0, url: `${homeConfig.vikunja.publicURL}/tasks/${t.id}` });
      groups.set(pid, g);
    }
    return { status: 'ready', note: 'Vikunja, read-only', groups: [...groups.values()].map(sortGroup).sort((a, b) => a.title.localeCompare(b.title)) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    return /token missing/i.test(msg) ? { status: 'unconnected', note: 'Vikunja is not connected.', groups: [] } : { status: 'error', note: 'Vikunja could not be reached.', groups: [] };
  }
}

function sortGroup(g: TodoGroup): TodoGroup {
  const rank = (t: Todo) => (t.overdue ? 0 : t.dueToday ? 1 : t.due ? 2 : 3);
  return { ...g, items: g.items.sort((a, b) => rank(a) - rank(b) || (a.due ?? '').localeCompare(b.due ?? '') || b.priority - a.priority || a.title.localeCompare(b.title)) };
}

export async function readTodos(now = new Date()): Promise<Todos> {
  if (isDemo()) return demoTodos(now) as Todos;
  const s = getSettings().todos;
  const [reminders, vikunja] = await Promise.all([
    readReminders(now, s.excludeLists),
    s.vikunja ? readVikunjaTodos(now) : Promise.resolve<TodoSource>({ status: 'unconnected', note: 'Vikunja to-dos are off in Settings.', groups: [] }),
  ]);
  return { at: now.toISOString(), reminders, vikunja };
}

/** Only what is due today or overdue, flattened with its source. */
export function dueNow(t: Todos) {
  const pick = (src: 'reminders' | 'vikunja') => t[src].groups.flatMap((g) => g.items.filter((i) => i.overdue || i.dueToday).map((i) => ({ ...i, source: src, group: g.title })));
  return [...pick('reminders'), ...pick('vikunja')].sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.due ?? '').localeCompare(b.due ?? ''));
}
