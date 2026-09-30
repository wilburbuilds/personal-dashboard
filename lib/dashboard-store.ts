import { env } from 'cloudflare:workers';
export function database(){if(!env.DB)throw new Error('Dashboard storage unavailable');return env.DB;}
export async function readRecord(id:string){const row=await database().prepare('SELECT payload FROM dashboard_records WHERE id = ?').bind(id).first<{payload:string}>();return row?JSON.parse(row.payload):null;}
export async function saveRecord(id:string,payload:unknown){await database().prepare('INSERT INTO dashboard_records (id,payload,updated_at) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at').bind(id,JSON.stringify(payload),new Date().toISOString()).run();}
