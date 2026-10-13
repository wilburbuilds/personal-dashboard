import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeConfig } from '../lib/home-config.mjs';

const label = 'com.home-dashboard.budget-sync';
const plist = join(homedir(), 'Library/LaunchAgents', label + '.plist');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uid = String(process.getuid());
try { execFileSync('launchctl', ['bootout', `gui/${uid}/${label}`], { stdio: 'ignore' }); } catch {}
if (process.argv.includes('--uninstall')) process.exit(0);
const log = join(homedir(), 'Library/Logs/home-dashboard-budget-sync.log');
mkdirSync(dirname(plist), { recursive: true });
writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${process.execPath}</string><string>${join(root, 'scripts/budget-sync.mjs')}</string></array>
<key>WorkingDirectory</key><string>${root}</string>
<key>RunAtLoad</key><true/>
<key>StartInterval</key><integer>${homeConfig.actual.syncEverySeconds}</integer>
<key>StandardOutPath</key><string>${log}</string>
<key>StandardErrorPath</key><string>${log}</string>
</dict></plist>
`);
execFileSync('launchctl', ['bootstrap', `gui/${uid}`, plist]);
console.log('installed', label);
