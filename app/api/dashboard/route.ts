import { readRecord,saveRecord } from '@/lib/dashboard-store';
import { snapshotSchema,emptySnapshot,defaultPreferences } from '@/lib/dashboard';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try {return Response.json({snapshot:await readRecord('snapshot')??emptySnapshot(),preferences:await readRecord('preferences')??defaultPreferences},{headers});}catch {return Response.json({error:'Your dashboard could not be loaded. Try again shortly.'},{status:503,headers});}}
// This shared writer relies on Sites owner-private dispatch. Never make this Site public.
// Service callers authenticate with OAI-Sites-Authorization at the Sites boundary.
export async function PUT(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return Response.json({error:'Invalid origin'},{status:403,headers});try {const body=await request.text();if(body.length>100000)return Response.json({error:'Update too large'},{status:413,headers});const parsed=snapshotSchema.safeParse(JSON.parse(body));if(!parsed.success)return Response.json({error:'Invalid dashboard snapshot',details:parsed.error.flatten()},{status:400,headers});await saveRecord('snapshot',parsed.data);return Response.json({saved:true,date:parsed.data.date},{headers});}catch {return Response.json({error:'Update could not be saved.'},{status:503,headers});}}
