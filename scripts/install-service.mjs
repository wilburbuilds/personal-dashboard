import { mkdir,writeFile,access,unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join,resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if(process.platform!=='darwin')throw new Error('This service installer is for macOS.');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const label='com.home-dashboard';
const domain=`gui/${process.getuid()}`;
const plist=join(homedir(),'Library','LaunchAgents',label+'.plist');
let previous={};
const prior=spawnSync('plutil',['-extract','EnvironmentVariables','json','-o','-',plist],{encoding:'utf8'});
if(prior.status===0){try{previous=JSON.parse(prior.stdout);}catch{}}
const port=process.env.PORT||previous.PORT||'3000';
if(!/^\d+$/.test(port)||+port<1024||+port>65535)throw new Error('Invalid PORT');
const origin=process.env.DASHBOARD_ORIGIN??previous.DASHBOARD_ORIGIN??'';
if(origin){const u=new URL(origin);if(u.protocol!=='https:'||!u.hostname.endsWith('.ts.net')||u.origin!==origin)throw new Error('Invalid private Tailscale origin');}
const data=join(homedir(),'Library','Application Support','Personal Dashboard');
if(process.argv.includes('--uninstall')){
 spawnSync('launchctl',['bootout',`${domain}/${label}`]);await unlink(plist).catch(e=>{if(e.code!=='ENOENT')throw e;});console.log('Startup service removed. Personal data kept.');process.exit(0);
}
await access(join(root,'.next','BUILD_ID'));
await mkdir(dirname(plist),{recursive:true});await mkdir(data,{recursive:true,mode:0o700});
const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
await writeFile(plist,`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(join(root,'scripts','start.mjs'))}</string></array>
<key>WorkingDirectory</key><string>${xml(root)}</string>
<key>EnvironmentVariables</key><dict><key>HOMEKIT_BIND_ADDRESS</key><string>${xml(process.env.HOMEKIT_BIND_ADDRESS??previous.HOMEKIT_BIND_ADDRESS??'')}</string><key>HOMEKIT_RECEIVER_URL</key><string>${xml(process.env.HOMEKIT_RECEIVER_URL??previous.HOMEKIT_RECEIVER_URL??'http://localhost:3088/api/homekit')}</string><key>NODE_ENV</key><string>production</string><key>PORT</key><string>${port}</string><key>DASHBOARD_ORIGIN</key><string>${xml(origin)}</string><key>DASHBOARD_DATA_DIR</key><string>${xml(data)}</string></dict>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>15</integer>
<key>StandardOutPath</key><string>${xml(join(data,'server.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(data,'error.log'))}</string>
</dict></plist>`,{mode:0o600});
spawnSync('launchctl',['bootout',`${domain}/${label}`]);
let result;
for(let attempt=0;attempt<8;attempt++){
 result=spawnSync('launchctl',['bootstrap',domain,plist],{encoding:'utf8'});
 if(result.status===0)break;
 await new Promise(resolve=>setTimeout(resolve,500));
}
if(result.status!==0){console.error(result.stderr);process.exit(result.status||1);}
console.log(`Dashboard service installed for this Mac user. It starts at login: ${origin||'http://127.0.0.1:'+port}`);
