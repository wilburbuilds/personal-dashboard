import { validOrigin } from '@/lib/request-origin';
import { getSettings, saveSettings, resetSettings, settingsError } from '@/lib/settings.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  return Response.json({ settings: getSettings(), error: settingsError() }, { headers });
}

/** Partial update, validated, merged over current settings. Writes only ~/.config/home-dashboard/settings.json. */
export async function PUT(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const text = await request.text();
  if (text.length > 20000) return Response.json({ error: 'Too large' }, { status: 413, headers });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers }); }
  const r = saveSettings(body);
  return r.ok ? Response.json({ settings: r.settings }, { headers }) : Response.json({ error: r.error }, { status: 400, headers });
}

/** Reset one section (?section=budget) or everything to the home-config defaults. */
export async function DELETE(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  const r = resetSettings(new URL(request.url).searchParams.get('section') || undefined);
  return r.ok ? Response.json({ settings: r.settings }, { headers }) : Response.json({ error: r.error }, { status: 400, headers });
}
