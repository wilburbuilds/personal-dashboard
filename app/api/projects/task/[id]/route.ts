import { loadTaskDetail } from '@/lib/sources/vikunja-projects';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: 'Bad id' }, { status: 400, headers });
  try { return Response.json(await loadTaskDetail(id, AbortSignal.timeout(10000)), { headers }); }
  catch { return Response.json({ error: 'Couldn’t load this card from Vikunja.' }, { status: 502, headers }); }
}
