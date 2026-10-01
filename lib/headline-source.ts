import {fetchHeadlines} from './headlines.mjs';
import {readRecord,saveRecord} from './dashboard-store';
import type {Snapshot} from './dashboard';
export async function readHeadlineSource():Promise<Snapshot['sources']['headlines']>{
 const cached=await readRecord('headline-cache');
 if(cached && Date.now()-cached.checkedAt<30*60000)return cached.source;
 const source=await fetchHeadlines();
 await saveRecord('headline-cache',{checkedAt:Date.now(),source});
 return source;
}
