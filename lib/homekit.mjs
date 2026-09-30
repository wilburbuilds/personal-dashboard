import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,readFileSync,writeFileSync,chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes,timingSafeEqual } from 'node:crypto';
export const dataDirectory=()=>process.env.DASHBOARD_DATA_DIR||join(homedir(),'Library','Application Support','Personal Dashboard');
export function receiverToken(){const dir=dataDirectory();mkdirSync(dir,{recursive:true,mode:0o700});const path=join(dir,'homekit-token');try{return readFileSync(path,'utf8').trim();}catch(e){if(e.code!=='ENOENT')throw e;try{writeFileSync(path,randomBytes(32).toString('hex'),{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}return readFileSync(path,'utf8').trim();}}
export function tokenMatches(header){const actual=Buffer.from(header||''),expected=Buffer.from('Bearer '+receiverToken());return actual.length===expected.length&&timingSafeEqual(actual,expected);}
let db;
function database(){if(db)return db;mkdirSync(dataDirectory(),{recursive:true,mode:0o700});const path=join(dataDirectory(),'homekit.sqlite');db=new DatabaseSync(path);chmodSync(path,0o600);db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS readings(room TEXT NOT NULL, observed_at TEXT NOT NULL, temperature REAL, humidity REAL, PRIMARY KEY(room,observed_at))');return db;}
export function ingest(payload){
 if(!payload||!Array.isArray(payload.readings)||!payload.readings.length||payload.readings.length>32)throw new TypeError('Provide 1–32 readings');
 const now=Date.now();const rows=payload.readings.map(r=>{
  if(!r||typeof r.room!=='string'||!r.room.trim()||r.room.length>80)throw new TypeError('Each reading needs a room name');
  const temp=r.temperatureC,humidity=r.humidityPercent;
  if(temp===undefined&&humidity===undefined)throw new TypeError('Provide temperatureC or humidityPercent');
  if(temp!==undefined&&(typeof temp!=='number'||!Number.isFinite(temp)||temp< -50||temp>100))throw new TypeError('Invalid temperatureC');
  if(humidity!==undefined&&(typeof humidity!=='number'||!Number.isFinite(humidity)||humidity<0||humidity>100))throw new TypeError('Invalid humidityPercent');
  const when=r.observedAt===undefined?now:Date.parse(r.observedAt);
  if(!Number.isFinite(when)||when>now+300000||when<now-7*86400000)throw new TypeError('Invalid or stale observedAt');
  return [r.room.trim(),new Date(when).toISOString(),temp??null,humidity??null];
 });
 const d=database();d.exec('BEGIN IMMEDIATE');try{const stmt=d.prepare('INSERT INTO readings(room,observed_at,temperature,humidity) VALUES(?,?,?,?) ON CONFLICT(room,observed_at) DO NOTHING');for(const row of rows)stmt.run(...row);d.prepare('DELETE FROM readings WHERE observed_at < ?').run(new Date(now-30*86400000).toISOString());d.exec('COMMIT');}catch(e){d.exec('ROLLBACK');throw e;}return rows.length;
}
export function homeRooms(){const d=database();const rows=d.prepare('SELECT r.* FROM readings r JOIN (SELECT room,MAX(observed_at) latest FROM readings GROUP BY room) l ON r.room=l.room AND r.observed_at=l.latest ORDER BY r.room LIMIT 32').all();return rows.map(r=>({room:r.room,temperatureC:r.temperature,humidityPercent:r.humidity,observedAt:r.observed_at,stale:Date.now()-Date.parse(r.observed_at)>3600000,history:d.prepare('SELECT observed_at AS time,temperature AS value FROM readings WHERE room=? AND observed_at>=? AND temperature IS NOT NULL ORDER BY observed_at DESC LIMIT 144').all(r.room,new Date(Date.now()-86400000).toISOString()).reverse()}));}
export const receiverURL=()=>process.env.HOMEKIT_RECEIVER_URL||'http://localhost:3088/api/homekit';
