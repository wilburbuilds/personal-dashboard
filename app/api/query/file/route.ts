import { readVaultFile } from '@/lib/md/resolve.mjs';

export const dynamic = 'force-dynamic';
const types: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' };

/** Read-only image attachments for markdown embeds. SVG is not served (script risk). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const path = url.searchParams.get('path') || '';
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (!types[ext]) return new Response('Not found', { status: 404 });
  const buf = readVaultFile(url.searchParams.get('vault') || '', path, { image: true });
  if (!buf || typeof buf === 'string') return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(buf), { headers: { 'Content-Type': types[ext], 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
}
