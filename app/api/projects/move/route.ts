import { validOrigin } from '@/lib/request-origin';
import { moveCard, moveSchema } from '@/lib/sources/vikunja-projects';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
/** The dashboard's only Vikunja write: move one card on a Kanban board. */
export async function POST(req: Request) {
  if (!validOrigin(req)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const m = moveSchema.safeParse(await req.json().catch(() => null));
  if (!m.success) return Response.json({ error: 'Invalid move' }, { status: 400, headers });
  try { return Response.json({ ok: true, ...(await moveCard(m.data, AbortSignal.timeout(10000))) }, { headers }); }
  catch (e) { return Response.json({ error: e instanceof Error ? e.message : 'Move failed' }, { status: 502, headers }); }
}
