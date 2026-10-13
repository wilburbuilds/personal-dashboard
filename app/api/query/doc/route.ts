import { vaultIndex } from '@/lib/query/backends.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const body = vaultIndex().read(url.searchParams.get('vault') || '', url.searchParams.get('path') || '');
  if (body === null) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json({ body });
}
