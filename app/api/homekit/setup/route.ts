import { receiverToken,receiverURL } from '@/lib/homekit.mjs';
import { validOrigin } from '@/lib/request-origin';
export const dynamic='force-dynamic';
export async function POST(request:Request){if(!validOrigin(request))return Response.json({error:'Invalid origin'},{status:403});return Response.json({url:receiverURL(),token:receiverToken()},{headers:{'Cache-Control':'private, no-store'}});}
