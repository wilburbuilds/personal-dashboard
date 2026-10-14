import { validOrigin } from '@/lib/request-origin';
import { homeConfig } from '@/lib/home-config.mjs';
import { writeCheck, WriteError } from '@/lib/workout-note.mjs';

/** The dashboard's only vault write besides the Gym inbox: flip one `- [ ]`/`- [x]` in fitness/workouts/<day>.md. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const b = await request.json().catch(() => null) as { day?: unknown; hash?: unknown; ord?: unknown; checked?: unknown } | null;
  if (!b || typeof b.day !== 'string' || typeof b.hash !== 'string' || !/^[0-9a-f]{16}$/.test(b.hash) || typeof b.checked !== 'boolean')
    return Response.json({ error: 'Bad request' }, { status: 400 });
  const ord = Number.isInteger(b.ord) && (b.ord as number) >= 0 ? (b.ord as number) : 0;
  try {
    const r = await writeCheck(homeConfig.health.vault, b.day, { hash: b.hash, ord, checked: b.checked });
    return Response.json({ ok: true, changed: r.changed, sections: r.sections, hash: r.hash });
  } catch (e) {
    const code = e instanceof WriteError ? e.code : 'error';
    const status = code === 'bad-day' ? 400 : code === 'missing' ? 404 : code === 'conflict' ? 409 : 500;
    return Response.json({ error: e instanceof WriteError ? e.message : 'Could not write the note', code }, { status });
  }
}
