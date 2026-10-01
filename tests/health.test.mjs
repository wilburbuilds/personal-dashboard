import { test } from 'node:test';
import assert from 'node:assert/strict';
import { healthSource } from '../lib/health.mjs';
const now = new Date('2026-09-30T23:30:00Z');
const date={year:2026,month:9,day:30};
const bundle={day:'2026-09-30',fetched_at:now.toISOString(),candidates:[
 {ok:true,data_type:'sleep',data:{dataPoints:[{dataSource:{platform:'FITBIT'},sleep:{metadata:{mainSleep:true},summary:{minutesAsleep:'477',minutesInSleepPeriod:'480'}}}]}},
 {ok:true,data_type:'daily-resting-heart-rate',data:{dataPoints:[{dataSource:{platform:'HEALTH_KIT'},dailyRestingHeartRate:{date,beatsPerMinute:'60'}},{dataSource:{platform:'FITBIT'},dailyRestingHeartRate:{date,beatsPerMinute:'64'}}]}},
 {ok:true,data_type:'steps',method:'dailyRollUp',data:{rollupDataPoints:[{civilStartTime:{date},steps:{countSum:'1556'}}]}}
]};
test('uses Fitbit source and actual asleep time; steps are partial',()=>{const s=healthSource(bundle,'','',now);assert.equal(s.status,'ready');assert.deepEqual(s.metrics.map(m=>m.value),['7h 57m','64','1,556']);assert.equal(s.metrics[2].label,'Steps so far');});
test('failed candidates never become zero or valid readings',()=>{const b=structuredClone(bundle);b.candidates.forEach(c=>c.ok=false);const s=healthSource(b,'','',now);assert.deepEqual(s.metrics.map(m=>m.value),['—','—','—']);assert.equal(s.status,'unconnected');});
test('old measurements are flagged, skipped sessions remain labeled',()=>{const s=healthSource(bundle,'','| 2026-09-26 | Skipped (squat day) | — | Travel |',new Date('2026-10-02T23:30:00Z'));assert.equal(s.status,'error');assert.equal(s.items[0].title,'Skipped (squat day)');assert.equal(s.items[0].label,'Latest training log · 2026-09-26');});
