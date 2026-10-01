import { readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
const day = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(date);
const number = value => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
export function healthSource(bundle, program = '', log = '', now = new Date()) {
  const points = type => (bundle?.candidates ?? []).filter(c => c.ok && c.data_type === type).flatMap(c => c.data?.dataPoints ?? []).filter(p => p.dataSource?.platform === 'FITBIT');
  const sleep = points('sleep').map(p => p.sleep).filter(s => s?.metadata?.mainSleep === true).sort((a,b) => String(b.interval?.endTime).localeCompare(String(a.interval?.endTime)))[0];
  const minutes = number(sleep?.summary?.minutesAsleep);
  const hr = number(points('daily-resting-heart-rate').find(p => {
    const d = p.dailyRestingHeartRate?.date;
    return d && `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}` === bundle.day;
  })?.dailyRestingHeartRate?.beatsPerMinute);
  const steps = number((bundle?.candidates ?? []).filter(c => c.ok && c.data_type === 'steps' && c.method === 'dailyRollUp').flatMap(c => c.data?.rollupDataPoints ?? []).find(p => {
    const d = p.civilStartTime?.date;
    return d && `${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}` === bundle.day;
  })?.steps?.countSum);
  const stamp = Date.parse(bundle?.fetched_at);
  const updatedAt = Number.isFinite(stamp) ? new Date(stamp).toISOString() : null;
  const stale = !updatedAt || now.getTime() - stamp > 36*3600000 || stamp > now.getTime()+300000 || bundle?.day !== day(now);
  const items = [];
  const title = program.match(/## Program overview\s+\*\*(.+?)\*\*/)?.[1];
  const schedule = program.match(/\*\*Schedule:\*\*\s*(.+)/)?.[1];
  if (title) items.push({label:'Saved gym plan',title:title.slice(0,300),detail:[schedule,`Plan updated ${program.match(/^updated:\s*(\S+)/m)?.[1] ?? 'date unavailable'}`].filter(Boolean).join(' · ').slice(0,1200)});
  const latest = log.split('\n').filter(l => /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/.test(l)).map(l=>l.split('|').slice(1,-1).map(v=>v.trim())).sort((a,b)=>b[0].localeCompare(a[0]))[0];
  if(latest) items.push({label:`Latest training log · ${latest[0]}`,title:latest[1].slice(0,300),detail:[latest[2],latest[3]].filter(v=>v && v!=='—').join(' · ').slice(0,1200)});
  const available = [minutes,hr,steps].filter(v=>v!==null).length;
  return {status:available ? (stale || available<3 ? 'error':'ready') : 'unconnected',updatedAt,metrics:[
    {label:'Sleep',value:minutes===null?'—':`${Math.floor(minutes/60)}h ${Math.round(minutes%60)}m`},
    {label:'Resting heart rate',value:hr===null?'—':String(hr),unit:'bpm'},
    {label:bundle?.day===day(now)?'Steps so far':'Steps',value:steps===null?'—':steps.toLocaleString('en-US')}
  ],items,note:available ? `Fitbit · ${bundle.day}. ${stale?'Readings need an update. ':''}${available<3?'Some measurements are unavailable. ':''}Sleep uses Fitbit’s reported time asleep. Steps are as of the last import.` : 'Fitbit measurements unavailable. Saved training notes shown where available.'};
}
export async function readHealthSource(root = process.env.DASHBOARD_PERSONAL_VAULT || join(homedir(),'vaults/personal')) {
  const fitness = join(root,'fitness');
  const optional = async path => {try{return await readFile(path,'utf8');}catch{return '';}};
  const [program,log] = await Promise.all([optional(join(fitness,'current-program.md')),optional(join(fitness,'training-log.md'))]);
  try {
    const directory = join(fitness,'fitbit-air/raw');
    const files = (await readdir(directory)).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n) && n.slice(0,10)<=day(new Date())).sort();
    if (!files.length) return healthSource(null,program,log);
    return healthSource(JSON.parse(await readFile(join(directory,files.at(-1)),'utf8')),program,log);
  } catch { return {...healthSource(null,program,log),status:'error',note:'Fitbit export could not be read. Saved training notes shown where available.'}; }
}
