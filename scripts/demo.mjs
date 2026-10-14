// Demo mode: synthetic data for every tab, no personal sources touched.
// Usage: npm run build && npm run demo   (serves http://127.0.0.1:3200)
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDemoFiles } from '../lib/demo/fixtures.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.env.HD_DEMO_DIR || join(tmpdir(), 'home-dashboard-demo');
const env = writeDemoFiles(dir);
const port = process.env.PORT || '3200';
console.log(`Demo data in ${dir}`);
const child = spawn(process.execPath, [join(root, 'scripts/start.mjs')], {
  stdio: 'inherit', cwd: root,
  env: { PATH: process.env.PATH, HOME: dir, NODE_ENV: 'production', PORT: port, ...env },
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => child.kill(s));
child.on('exit', (c) => process.exit(c ?? 0));
