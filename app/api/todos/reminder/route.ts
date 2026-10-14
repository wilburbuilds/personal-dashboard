import { validOrigin } from '@/lib/request-origin';
import { setReminderCompleted, toggleSchema } from '@/lib/sources/todos';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

/** The dashboard's only Reminders write: toggle one reminder's completed flag, by id. Same-origin only. */
export async function POST(req: Request) {
  if (!validOrigin(req)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const p = toggleSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: 'Invalid request' }, { status: 400, headers });
  const r = await setReminderCompleted(p.data.id, p.data.completed);
  return r.ok ? Response.json({ ok: true }, { headers }) : Response.json({ error: r.error }, { status: r.status, headers });
}
