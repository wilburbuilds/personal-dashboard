import { validOrigin } from '@/lib/request-origin';
import { homeConfig } from '@/lib/home-config.mjs';
import { homeEnv } from '@/lib/home-env.mjs';
import { appendInbox, postWebhook, WORKOUT_DIR, WriteError } from '@/lib/workout-note.mjs';

const pacificDay = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());

/** Append a message to fitness/gym-inbox.md, then optionally POST it to Gym's webhook. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  const b = await request.json().catch(() => null) as { text?: unknown } | null;
  if (!b || typeof b.text !== 'string') return Response.json({ error: 'Bad request' }, { status: 400 });
  try {
    const saved = await appendInbox(homeConfig.health.vault, b.text);
    const workoutNote = `~/vaults/personal/${WORKOUT_DIR}/${pacificDay()}.md`;
    const hook = await postWebhook(homeEnv(true), { text: saved.text, at: saved.at, workoutNote });
    return Response.json({ ok: true, saved: true, sent: hook.sent, webhook: hook.skipped ? 'unset' : hook.sent ? 'ok' : 'failed', at: saved.at });
  } catch (e) {
    return Response.json({ error: e instanceof WriteError ? e.message : 'Could not save' }, { status: e instanceof WriteError && e.code === 'empty' ? 400 : 500 });
  }
}
