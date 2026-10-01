import { z } from 'zod';
import { validOrigin } from '@/lib/request-origin';
import { readWeatherSource } from '@/lib/weather';
const coordinates=z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)});
export async function POST(request:Request){
 const headers={'Cache-Control':'private, no-store'};
 if(!validOrigin(request))return Response.json({error:'Invalid origin'},{status:403,headers});
 try {
  const text=await request.text();if(text.length>500)return Response.json({error:'Request too large'},{status:413,headers});
  const value=coordinates.safeParse(JSON.parse(text));if(!value.success)return Response.json({error:'Invalid location'},{status:400,headers});
  return Response.json(await readWeatherSource('',value.data),{headers});
 }catch{return Response.json({error:'Location weather unavailable'},{status:503,headers});}
}
