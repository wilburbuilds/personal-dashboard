import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.DASHBOARD_DATA_DIR=mkdtempSync(join(tmpdir(),'dashboard-homekit-test-'));
const {ingest,homeRooms,receiverToken,tokenMatches}=await import('../lib/homekit.mjs');
test('authentication uses a persistent restricted token',()=>{const token=receiverToken();assert.equal(token.length,64);assert.equal(receiverToken(),token);assert.ok(tokenMatches('Bearer '+token));assert.ok(!tokenMatches('Bearer wrong'));assert.equal(statSync(join(process.env.DASHBOARD_DATA_DIR,'homekit-token')).mode&0o777,0o600);});
test('readings are validated, idempotent, and ordered by sensor time',()=>{
 const now=new Date().toISOString(),older=new Date(Date.now()-7200000).toISOString();
 const reading={room:'Test room',temperatureC:21.5,humidityPercent:45,observedAt:now};
 ingest({readings:[reading]});ingest({readings:[reading]});assert.equal(homeRooms()[0].history.length,1);
 ingest({readings:[{...reading,temperatureC:19,observedAt:older}]});assert.equal(homeRooms()[0].temperatureC,21.5);assert.equal(homeRooms()[0].stale,false);
 assert.throws(()=>ingest({readings:[{room:'Invalid',temperatureC:500}]}));assert.throws(()=>ingest({readings:[{room:'Empty'}]}));assert.throws(()=>ingest({readings:[{room:'Future',temperatureC:21,observedAt:new Date(Date.now()+86400000).toISOString()}]}));
 assert.equal(homeRooms().length,1);
 ingest({readings:[{room:'Humidity only',humidityPercent:50,observedAt:older}]});const partial=homeRooms().find(r=>r.room==='Humidity only');assert.equal(partial.temperatureC,null);assert.equal(partial.stale,true);
});
