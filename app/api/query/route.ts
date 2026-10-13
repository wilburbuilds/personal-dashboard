import { backends, runQuery } from '@/lib/query/backends.mjs';
import { homeConfig } from '@/lib/home-config.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').slice(0, 200);
  const known = homeConfig.query.vaults.map((v) => v.id);
  const scopes = (url.searchParams.get('scope') || '').split(',').filter((s) => known.includes(s));
  if (!q.trim()) return Response.json({ hits: [], errors: [], ms: 0 });
  return Response.json(await runQuery(backends, q, { scopes: scopes.length ? scopes : known, limit: 40 }));
}
