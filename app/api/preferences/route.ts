import { saveRecord } from '@/lib/dashboard-store';
import { preferencesSchema } from '@/lib/dashboard';
export const dynamic='force-dynamic';
export async function POST(request:Request){const headers={'Cache-Control':'private, no-store'};if(request.headers.get('origin')!==('http://'+request.headers.get('host')))return Response.json({error:'Invalid origin'},{status:403,headers});try {const data=preferencesSchema.safeParse(await request.json());if(!data.success)return Response.json({error:'Please shorten the settings and try again.'},{status:400,headers});await saveRecord('preferences',data.data);return Response.json({saved:true},{headers});}catch {return Response.json({error:'Settings could not be saved. Your changes are still here.'},{status:503,headers});}}
