import { backends, runQuery } from '@/lib/query/backends.mjs';
import { getSettings } from '@/lib/settings.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').slice(0, 200);
  const known = getSettings().query.scope;
  const scopes = (url.searchParams.get('scope') || '').split(',').filter((s) => known.includes(s));
  if (!q.trim()) return Response.json({ hits: [], errors: [], ms: 0 });
  return Response.json(await runQuery(backends, q, { scopes: scopes.length ? scopes : known, limit: 40 }));
}
