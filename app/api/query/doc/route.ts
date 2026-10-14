import { vaultIndex } from '@/lib/query/backends.mjs';
import { resolveRefs } from '@/lib/md/resolve.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const vault = url.searchParams.get('vault') || '';
  const body = vaultIndex().read(vault, url.searchParams.get('path') || '');
  if (body === null) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ body, refs: resolveRefs(body, vault) });
}
