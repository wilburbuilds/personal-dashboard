#!/usr/bin/env node
/**
 * Install/uninstall LaunchAgent: weekday overnight mail curation at 6:45am local
 * (Mac mini should use America/Los_Angeles). Calls scripts/curate-overnight.mjs.
 * Preserves nothing from the dashboard service; separate label.
 */
import { mkdir, writeFile, unlink, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'darwin') throw new Error('LaunchAgent installer is for macOS.');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const label = 'com.home-dashboard.overnight-curate';
const domain = `gui/${process.getuid()}`;
const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const logDir = join(homedir(), 'Library', 'Logs');
const nodeBin = process.execPath;
const script = join(root, 'scripts', 'curate-overnight.mjs');
// Keep LaunchAgent PATH minimal/stable — do not inherit npm's ephemeral PATH.
const pathEnv = `${homedir()}/.local/bin:/opt/homebrew/bin:${homedir()}/.grok/bin:/usr/bin:/bin`;

const xml = (s) =>
  String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

if (process.argv.includes('--uninstall')) {
  spawnSync('launchctl', ['bootout', `${domain}/${label}`]);
  await unlink(plist).catch((e) => {
    if (e.code !== 'ENOENT') throw e;
  });
  console.log('Overnight curation LaunchAgent removed.');
  process.exit(0);
}

await access(script);
await mkdir(dirname(plist), { recursive: true });
await mkdir(logDir, { recursive: true });

const weekdays = [1, 2, 3, 4, 5]; // Mon–Fri; Apple: 0=Sun
const intervals = weekdays
  .map(
    (d) => `<dict>
<key>Weekday</key><integer>${d}</integer>
<key>Hour</key><integer>6</integer>
<key>Minute</key><integer>45</integer>
</dict>`,
  )
  .join('\n');

await writeFile(
  plist,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${xml(label)}</string>
<key>ProgramArguments</key><array>
  <string>${xml(nodeBin)}</string>
  <string>${xml(script)}</string>
</array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict>
  <key>PATH</key><string>${xml(pathEnv)}</string>
  <key>HOME</key><string>${xml(homedir())}</string>
  <key>GROK_BIN</key><string>${xml(join(homedir(), '.grok', 'bin', 'grok'))}</string>
</dict>
<key>StartCalendarInterval</key><array>
${intervals}
</array>
<key>StandardOutPath</key><string>${xml(join(logDir, 'home-dashboard-overnight-curate.out.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(logDir, 'home-dashboard-overnight-curate.err.log'))}</string>
</dict></plist>`,
  { mode: 0o600 },
);

spawnSync('launchctl', ['bootout', `${domain}/${label}`]);
let result;
for (let attempt = 0; attempt < 8; attempt++) {
  result = spawnSync('launchctl', ['bootstrap', domain, plist], { encoding: 'utf8' });
  if (result.status === 0) break;
  await new Promise((r) => setTimeout(r, 400));
}
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}
console.log('Overnight curation LaunchAgent installed: Mon–Fri 6:45am local (use Pacific on the mini).');
console.log(`Manual run: cd ${root} && npm run curate:overnight`);
