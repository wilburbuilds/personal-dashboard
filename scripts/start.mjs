import { startHomeKitReceiver } from './homekit-receiver.mjs';
import next from 'next';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const port=Number(process.env.PORT||3000);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be an integer from 1024 to 65535');
const allowedHosts=new Set([`localhost:${port}`,`127.0.0.1:${port}`]);
const privateOrigin=process.env.DASHBOARD_ORIGIN;
if(privateOrigin){const u=new URL(privateOrigin);if(u.protocol!=='https:'||!u.hostname.endsWith('.ts.net')||u.pathname!=='/'||u.search||u.hash)throw new Error('DASHBOARD_ORIGIN must be a private Tailscale HTTPS origin');allowedHosts.add(u.host);}
const allowedOrigins=new Set([`http://localhost:${port}`,`http://127.0.0.1:${port}`]);
if(privateOrigin)allowedOrigins.add(privateOrigin);
const app=next({dev:false,dir:root,hostname:'127.0.0.1',port});
await app.prepare();
const handle=app.getRequestHandler();
const server=createServer((req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 // Localhost binding plus Host validation prevents access via DNS rebinding.
 if(!allowedHosts.has(req.headers.host)){res.writeHead(403);return res.end('Invalid host');}
 if(req.headers.origin&&!allowedOrigins.has(req.headers.origin)){res.writeHead(403);return res.end('Invalid origin');}
 if(['POST','PUT','PATCH','DELETE'].includes(req.method)&&req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403);return res.end('Cross-site request denied');}
 handle(req,res);
});
const homekit=startHomeKitReceiver();
server.listen(port,'127.0.0.1',()=>console.log(`Personal dashboard: http://127.0.0.1:${port}`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{homekit?.close();server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
