import { validOrigin } from '@/lib/request-origin';
import { prefsPatchSchema, readPrefs, savePrefs } from '@/lib/prefs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() { return Response.json({ preferences: await readPrefs() }, { headers }); }

/** Partial update of the Today preferences, stored in settings.json. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403, headers });
  try {
    await readPrefs();
    const data = prefsPatchSchema.safeParse(await request.json());
    if (!data.success) return Response.json({ error: 'Please shorten the settings and try again.' }, { status: 400, headers });
    const r = savePrefs(data.data);
    if (!r.ok) return Response.json({ error: r.error }, { status: 400, headers });
    return Response.json({ saved: true, preferences: r.prefs }, { headers });
  } catch { return Response.json({ error: 'Settings could not be saved. Your changes are still here.' }, { status: 503, headers }); }
}
