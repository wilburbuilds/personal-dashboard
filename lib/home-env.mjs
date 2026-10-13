import { readFileSync } from 'node:fs';
import { homeConfig } from './home-config.mjs';

let cached;
/** Secrets for the dashboard, from its own mode-600 env file. Never sent to the browser. */
export function homeEnv() {
  if (cached) return cached;
  const out = {};
  try {
    for (const line of readFileSync(homeConfig.envFile, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {}
  return (cached = out);
}
