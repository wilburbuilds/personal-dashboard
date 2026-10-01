import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pickHeadlines} from '../lib/headlines.mjs';
const feed={topic:'Tech',publisher:'Example'};
test('rejects old, future, undated and unsafe links; removes duplicates',()=>{
 const now=new Date('2026-09-30T15:00:00Z');
 const valid={title:'A headline',link:'https://example.com/a',isoDate:'2026-09-30T12:00:00Z'};
 const items=pickHeadlines([{feed,articles:[valid,{...valid,link:valid.link+'?ref=feed'},{...valid,title:'old',isoDate:'2026-09-01T00:00:00Z'},{...valid,title:'unsafe',link:'javascript:alert(1)'},{...valid,title:'future',isoDate:'2026-10-02T00:00:00Z'},{...valid,title:'undated',isoDate:undefined}]}],now);
 assert.equal(items.length,1);assert.match(items[0].detail,/Overnight/);
});
