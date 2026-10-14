import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { validOrigin } from '@/lib/request-origin';

let running: Promise<number> | null = null;
let lastStart = 0;

/** Refreshes the dashboard's read cache from Actual. Nothing is written to Actual. */
export async function POST(request: Request) {
  if (!validOrigin(request)) return Response.json({ error: 'Invalid origin' }, { status: 403 });
  if (process.env.HD_DEMO === '1') return Response.json({ ok: true, note: 'Demo mode' });
  if (!running) {
    if (Date.now() - lastStart < 30000) return Response.json({ ok: true, note: 'Synced moments ago' });
    lastStart = Date.now();
    running = new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [join(process.cwd(), 'scripts/budget-sync.mjs')], { stdio: 'ignore', cwd: process.cwd() });
      child.on('exit', (code) => resolve(code ?? 1));
      child.on('error', () => resolve(1));
    }).finally(() => { running = null; });
  }
  const code = await running;
  return Response.json({ ok: code === 0 }, { status: code === 0 ? 200 : 502 });
}
