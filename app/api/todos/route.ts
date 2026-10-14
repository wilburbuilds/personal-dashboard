import { readTodos, dueNow } from '@/lib/sources/todos';
export const dynamic = 'force-dynamic';
/** Read-only to-dos. ?scope=due returns only items due today or overdue. */
export async function GET(request: Request) {
  const t = await readTodos();
  const due = new URL(request.url).searchParams.get('scope') === 'due';
  const body = due ? { at: t.at, items: dueNow(t), reminders: { status: t.reminders.status, note: t.reminders.note }, vikunja: { status: t.vikunja.status, note: t.vikunja.note } } : t;
  return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
}
