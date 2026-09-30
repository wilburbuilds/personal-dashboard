import { createServer } from 'node:http';
import { ingest,receiverToken,tokenMatches } from '../lib/homekit.mjs';
export function startHomeKitReceiver(){
 if(!process.env.HOMEKIT_BIND_ADDRESS)return;
 receiverToken();
 const server=createServer(async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.url!=='/api/homekit'||req.method!=='POST')return send(404,{error:'Not found'});
  if(req.headers.origin)return send(403,{error:'Use an Apple Home automation, not a browser'});
  if(!tokenMatches(req.headers.authorization))return send(401,{error:'Invalid receiver token'});
  let body='';try{for await(const chunk of req){body+=chunk.toString();if(Buffer.byteLength(body)>16384){send(413,{error:'Payload too large'});return;}}}catch{return;}
  let payload;try{payload=JSON.parse(body);}catch{return send(400,{error:'Invalid JSON'});}
  try{return send(200,{saved:true,readings:ingest(payload)});}catch(e){return send(e instanceof TypeError?400:503,{error:e instanceof TypeError?e.message:'Unable to save readings'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 server.on('error',e=>{console.error('HomeKit receiver failed:',e.code);process.exit(1);});
 server.listen(3088,process.env.HOMEKIT_BIND_ADDRESS,()=>console.log('HomeKit receiver listening on home-network port 3088'));
 return server;
}
