import { z } from 'zod';
import { appendFile } from 'node:fs/promises';
import { homeEnv } from '@/lib/home-env.mjs';
import { homeConfig } from '@/lib/home-config.mjs';
import { isDemo } from '@/lib/demo/fixtures.mjs';
import { demoOverview, demoProjectBoard, demoTaskDetail, demoMove } from '@/lib/demo/projects.mjs';
import { vget } from './vikunja';

/*
 * Projects v5: overview, per-project Kanban board and card detail. Reads are GET only.
 * The single write path is moveCard(): Vikunja's bucket-move and task-position endpoints for a
 * Kanban view. Nothing else in the dashboard writes to Vikunja.
 */

const proj = z.object({ id: z.number(), title: z.string(), description: z.string().optional().default(''), is_archived: z.boolean().optional().default(false), parent_project_id: z.number().optional().default(0), updated: z.string().optional().default(''), hex_color: z.string().optional().default('') });
const pview = z.object({ id: z.number(), title: z.string(), view_kind: z.string(), done_bucket_id: z.number().optional().default(0), default_bucket_id: z.number().optional().default(0), bucket_configuration_mode: z.string().optional().default('') });
const label = z.object({ id: z.number().optional(), title: z.string(), hex_color: z.string().optional().default('') });
const user = z.object({ id: z.number().optional(), username: z.string(), name: z.string().optional().default('') });
const vtask = z.object({
  id: z.number(), identifier: z.string().optional().default(''), index: z.number().optional(), title: z.string(), done: z.boolean(),
  description: z.string().optional().default(''), due_date: z.string().nullable().optional(), priority: z.number().optional().default(0),
  percent_done: z.number().optional().default(0), position: z.number().optional().default(0), updated: z.string().optional().default(''),
  created: z.string().optional().default(''), done_at: z.string().nullable().optional(), project_id: z.number().optional(), bucket_id: z.number().optional().default(0),
  labels: z.array(label).nullable().optional(), assignees: z.array(user).nullable().optional(),
});
const vbucket = z.object({ id: z.number(), title: z.string(), limit: z.number().optional().default(0), position: z.number().optional().default(0), tasks: z.array(vtask).nullable().optional() });
const comment = z.object({ id: z.number(), comment: z.string(), created: z.string(), author: user.nullable().optional() });

const realDate = (s?: string | null) => (s && !s.startsWith('0001') ? s : null);
const color = (h?: string) => (h ? `#${h.replace('#', '')}` : '');

export type Card = { id: number; ref: string; title: string; done: boolean; due: string | null; priority: number; percent: number; position: number; labels: { title: string; color: string }[]; assignees: string[]; hasDescription: boolean };
export type Column = { id: number; title: string; limit: number; kind: 'open' | 'doing' | 'done'; cards: Card[] };
export type ProjectSummary = { id: number; title: string; parent: string | null; archived: boolean; color: string; open: number; doing: number; done: number; overdue: number; updated: string | null; url: string };
export type Overview = { projects: ProjectSummary[]; publicURL: string };
export type ProjectBoard = { project: { id: number; title: string; parent: string | null; url: string; archived: boolean }; viewId: number | null; doneBucketId: number; columns: Column[]; writable: boolean };
export type TaskDetail = {
  id: number; ref: string; title: string; done: boolean; description: string; due: string | null; priority: number; percent: number;
  labels: { title: string; color: string }[]; assignees: string[]; created: string | null; updated: string | null; doneAt: string | null;
  comments: { id: number; author: string; at: string; body: string }[]; url: string;
};

const DOING = /\b(doing|in[ -]?progress|progress|active|wip|working|review|started)\b/i;
const pub = () => homeConfig.vikunja.publicURL;
const toCard = (t: z.infer<typeof vtask>): Card => ({
  id: t.id, ref: t.identifier || `#${t.index ?? t.id}`, title: t.title, done: t.done, due: realDate(t.due_date), priority: t.priority,
  percent: Math.round((t.percent_done || 0) * 100), position: t.position,
  labels: (t.labels || []).map((l) => ({ title: l.title, color: color(l.hex_color) })), assignees: (t.assignees || []).map((a) => a.name || a.username),
  hasDescription: !!t.description.replace(/<[^>]+>/g, '').trim(),
});
const kindOf = (b: { id: number; title: string }, doneId: number): Column['kind'] => (b.id === doneId ? 'done' : DOING.test(b.title) ? 'doing' : 'open');

async function projects(signal: AbortSignal) {
  return (await vget('/projects?is_archived=true', z.array(proj), signal)).filter((p) => p.id > 0);
}
async function kanbanOf(id: number, signal: AbortSignal) {
  const views = await vget(`/projects/${id}/views`, z.array(pview), signal);
  return { kanban: views.find((v) => v.view_kind === 'kanban') ?? null, list: views.find((v) => v.view_kind === 'list') ?? null };
}

let ovCache: { at: number; value: Overview } | null = null;
export async function loadOverview(signal: AbortSignal): Promise<Overview> {
  if (isDemo()) return demoOverview();
  if (ovCache && Date.now() - ovCache.at < 30000) return ovCache.value;
  const all = await projects(signal);
  const now = Date.now();
  const titles = new Map(all.map((p) => [p.id, p.title]));
  const rows = await Promise.all(all.map(async (p): Promise<ProjectSummary> => {
    const base = { id: p.id, title: p.title, parent: titles.get(p.parent_project_id) ?? null, archived: p.is_archived, color: color(p.hex_color), url: `${pub()}/projects/${p.id}` };
    let open = 0, doing = 0, done = 0, overdue = 0, updated = realDate(p.updated);
    const bump = (s: string) => { if (s && (!updated || s > updated)) updated = s; };
    try {
      const { kanban, list } = await kanbanOf(p.id, signal);
      const count = (t: z.infer<typeof vtask>, kind: Column['kind']) => {
        bump(t.updated);
        if (t.done || kind === 'done') { done++; return; }
        if (kind === 'doing') doing++; else open++;
        const due = realDate(t.due_date); if (due && Date.parse(due) < now) overdue++;
      };
      if (kanban) {
        const buckets = await vget(`/projects/${p.id}/views/${kanban.id}/tasks?per_page=500`, z.array(vbucket), signal);
        for (const b of buckets) for (const t of b.tasks || []) count(t, kindOf(b, kanban.done_bucket_id));
      } else if (list) {
        for (const t of await vget(`/projects/${p.id}/views/${list.id}/tasks?per_page=500&filter=done%3Dtrue%20%7C%7C%20done%3Dfalse`, z.array(vtask), signal)) count(t, 'open');
      }
    } catch { /* counts stay at zero; the card still links to the board */ }
    return { ...base, open, doing, done, overdue, updated };
  }));
  ovCache = { at: Date.now(), value: { projects: rows, publicURL: pub() } };
  return ovCache.value;
}

export async function loadProjectBoard(id: number, signal: AbortSignal): Promise<ProjectBoard> {
  if (isDemo()) return demoProjectBoard(id);
  const all = await projects(signal);
  const p = all.find((x) => x.id === id);
  if (!p) throw new Error('That project isn’t visible to the dashboard’s Vikunja bot.');
  const parent = all.find((x) => x.id === p.parent_project_id)?.title ?? null;
  const { kanban, list } = await kanbanOf(id, signal);
  const viewId = (kanban ?? list)?.id ?? null;
  const project = { id, title: p.title, parent, archived: p.is_archived, url: `${pub()}/projects/${id}${viewId ? `/${viewId}` : ''}` };
  if (!kanban) {
    const tasks = list ? await vget(`/projects/${id}/views/${list.id}/tasks?per_page=500`, z.array(vtask), signal) : [];
    return { project, viewId, doneBucketId: 0, writable: false, columns: [{ id: 0, title: 'Tasks', limit: 0, kind: 'open', cards: tasks.map(toCard) }] };
  }
  const buckets = await vget(`/projects/${id}/views/${kanban.id}/tasks?per_page=500`, z.array(vbucket), signal);
  return {
    project, viewId: kanban.id, doneBucketId: kanban.done_bucket_id,
    writable: kanban.bucket_configuration_mode !== 'filter',
    columns: [...buckets].sort((a, b) => a.position - b.position).map((b) => ({
      id: b.id, title: b.title, limit: b.limit, kind: kindOf(b, kanban.done_bucket_id),
      cards: (b.tasks || []).map(toCard).sort((x, y) => x.position - y.position),
    })),
  };
}

export async function loadTaskDetail(id: number, signal: AbortSignal): Promise<TaskDetail> {
  if (isDemo()) return demoTaskDetail(id);
  const [t, cs] = await Promise.all([vget(`/tasks/${id}`, vtask, signal), vget(`/tasks/${id}/comments`, z.array(comment), signal).catch(() => [])]);
  return {
    id: t.id, ref: t.identifier || `#${t.index ?? t.id}`, title: t.title, done: t.done, description: t.description, due: realDate(t.due_date), priority: t.priority,
    percent: Math.round((t.percent_done || 0) * 100), labels: (t.labels || []).map((l) => ({ title: l.title, color: color(l.hex_color) })),
    assignees: (t.assignees || []).map((a) => a.name || a.username), created: realDate(t.created), updated: realDate(t.updated), doneAt: realDate(t.done_at),
    comments: cs.map((c) => ({ id: c.id, author: c.author ? c.author.name || c.author.username : 'Someone', at: c.created, body: c.comment })),
    url: `${pub()}/tasks/${t.id}`,
  };
}

/* ---------- The one write: move a card on a Kanban view ---------- */
export const moveSchema = z.object({
  projectId: z.number().int().positive(), viewId: z.number().int().positive(), taskId: z.number().int().positive(),
  bucketId: z.number().int().positive(), position: z.number().finite().nonnegative(),
}).strict();
export type Move = z.infer<typeof moveSchema>;

async function vpost(path: string, body: unknown, signal: AbortSignal) {
  const { VIKUNJA_API_TOKEN: token, VIKUNJA_URL: base } = homeEnv();
  if (!token || !base) throw new Error('Vikunja token missing from ~/.config/home-dashboard/env');
  const res = await fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, cache: 'no-store' });
  appendFile(homeConfig.loadLog, JSON.stringify({ at: new Date().toISOString(), source: 'vikunja', method: 'POST', path, status: res.status }) + '\n').catch(() => {});
  if (!res.ok) throw new Error(`Vikunja answered ${res.status}`);
  return res.json().catch(() => ({}));
}

/** Move a task into a bucket (if it changed) and set its position in that view. Validates that the
 * task, bucket and view all belong to the same project before writing. */
export async function moveCard(m: Move, signal: AbortSignal): Promise<{ done: boolean }> {
  if (isDemo()) return demoMove(m);
  const { kanban } = await kanbanOf(m.projectId, signal);
  if (!kanban || kanban.id !== m.viewId) throw new Error('That board isn’t a Kanban view.');
  if (kanban.bucket_configuration_mode === 'filter') throw new Error('This board’s buckets are filters; move cards in Vikunja.');
  const buckets = await vget(`/projects/${m.projectId}/views/${m.viewId}/tasks?per_page=500`, z.array(vbucket), signal);
  if (!buckets.some((b) => b.id === m.bucketId)) throw new Error('Unknown column.');
  const from = buckets.find((b) => (b.tasks || []).some((t) => t.id === m.taskId));
  if (!from) throw new Error('That card isn’t on this board.');
  if (from.id !== m.bucketId) await vpost(`/projects/${m.projectId}/views/${m.viewId}/buckets/${m.bucketId}/tasks`, { task_id: m.taskId }, signal);
  await vpost(`/tasks/${m.taskId}/position`, { task_id: m.taskId, project_view_id: m.viewId, position: m.position }, signal);
  ovCache = null;
  return { done: m.bucketId === kanban.done_bucket_id };
}
