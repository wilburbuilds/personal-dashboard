import { z } from 'zod';
import { appendFile } from 'node:fs/promises';
import { homeEnv } from '@/lib/home-env.mjs';
import { homeConfig } from '@/lib/home-config.mjs';
import { isDemo, demoBoard } from '@/lib/demo/fixtures.mjs';

export const project = z.object({ id: z.number(), title: z.string(), is_archived: z.boolean().optional(), parent_project_id: z.number().optional() });
const view = z.object({ id: z.number(), title: z.string(), view_kind: z.string(), position: z.number().optional() });
const label = z.object({ title: z.string(), hex_color: z.string().optional().default('') });
const user = z.object({ username: z.string(), name: z.string().optional().default('') });
export const task = z.object({
  id: z.number(), identifier: z.string().optional().default(''), index: z.number().optional(), title: z.string(), done: z.boolean(),
  due_date: z.string().nullable().optional(), percent_done: z.number().optional().default(0), priority: z.number().optional().default(0),
  labels: z.array(label).nullable().optional(), assignees: z.array(user).nullable().optional(),
});
const bucket = z.object({ id: z.number(), title: z.string(), limit: z.number().optional().default(0), tasks: z.array(task).nullable().optional() });

export type Task = { id: number; ref: string; title: string; done: boolean; due: string | null; percent: number; labels: { title: string; color: string }[]; assignees: string[] };
export type Board = {
  projects: { id: number; title: string; open: number }[];
  project: { id: number; title: string; url: string };
  mode: 'kanban' | 'list';
  buckets: { id: number; title: string; limit: number; tasks: Task[] }[];
};

/** The only HTTP verb this adapter can send is GET. Each request is logged. */
export async function vget<S extends z.ZodTypeAny>(path: string, schema: S, signal: AbortSignal): Promise<z.output<S>> {
  const { VIKUNJA_API_TOKEN: token, VIKUNJA_URL: base } = homeEnv();
  if (!token || !base) throw new Error('Vikunja token missing from ~/.config/home-dashboard/env');
  const res = await fetch(base + path, { method: 'GET', headers: { Authorization: `Bearer ${token}` }, signal, cache: 'no-store' });
  appendFile(homeConfig.loadLog, JSON.stringify({ at: new Date().toISOString(), source: 'vikunja', method: 'GET', path, status: res.status }) + '\n').catch(() => {});
  if (!res.ok) throw new Error(`Vikunja ${path} answered ${res.status}`);
  return schema.parse(await res.json());
}

const toTask = (t: z.infer<typeof task>): Task => ({
  id: t.id, ref: t.identifier || `#${t.index ?? t.id}`, title: t.title, done: t.done,
  due: t.due_date && !t.due_date.startsWith('0001') ? t.due_date : null, percent: Math.round((t.percent_done || 0) * 100),
  labels: (t.labels || []).map((l) => ({ title: l.title, color: l.hex_color ? `#${l.hex_color.replace('#', '')}` : '' })),
  assignees: (t.assignees || []).map((a) => a.name || a.username),
});

export async function loadBoard(projectId: number, signal: AbortSignal): Promise<Board> {
  if (isDemo()) return demoBoard();
  const projects = (await vget('/projects', z.array(project), signal)).filter((p) => !p.is_archived && p.id > 0);
  const current = projects.find((p) => p.id === projectId) ?? projects[0];
  if (!current) throw new Error('No Vikunja projects visible to the bot');
  const views = await vget(`/projects/${current.id}/views`, z.array(view), signal);
  const kanban = views.find((v) => v.view_kind === 'kanban');
  const list = views.find((v) => v.view_kind === 'list');
  const counts = await Promise.all(projects.map(async (p) => {
    try { return (await vget(`/projects/${p.id}/tasks?filter=done%3Dfalse&per_page=200`, z.array(task.pick({ id: true })), signal)).length; } catch { return 0; }
  }));
  const viewId = (kanban ?? list)?.id;
  const url = `${homeConfig.vikunja.publicURL}/projects/${current.id}${viewId ? `/${viewId}` : ''}`;
  const projectsOut = projects.map((p, i) => ({ id: p.id, title: p.title, open: counts[i] }));
  if (kanban) {
    const buckets = await vget(`/projects/${current.id}/views/${kanban.id}/tasks`, z.array(bucket), signal);
    return { projects: projectsOut, project: { id: current.id, title: current.title, url }, mode: 'kanban', buckets: buckets.map((b) => ({ id: b.id, title: b.title, limit: b.limit, tasks: (b.tasks || []).map(toTask) })) };
  }
  const tasks = list ? await vget(`/projects/${current.id}/views/${list.id}/tasks`, z.array(task), signal) : [];
  return { projects: projectsOut, project: { id: current.id, title: current.title, url }, mode: 'list', buckets: [{ id: 0, title: 'Tasks', limit: 0, tasks: tasks.map(toTask) }] };
}
