import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
let connection: DatabaseSync | undefined;
export function database(){
 if(connection)return connection;
 const directory=process.env.DASHBOARD_DATA_DIR||join(homedir(),'Library','Application Support','Personal Dashboard');
 mkdirSync(directory,{recursive:true,mode:0o700});
 const filename=join(directory,'dashboard.sqlite');
 connection=new DatabaseSync(filename);
 chmodSync(filename,0o600);
 connection.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; CREATE TABLE IF NOT EXISTS dashboard_records (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
 return connection;
}
export async function readRecord(id:string){const row=database().prepare('SELECT payload FROM dashboard_records WHERE id = ?').get(id) as {payload:string}|undefined;return row?JSON.parse(row.payload):null;}
export async function saveRecord(id:string,payload:unknown){database().prepare('INSERT INTO dashboard_records (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at').run(id,JSON.stringify(payload),new Date().toISOString());}
