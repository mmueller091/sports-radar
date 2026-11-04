import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {browser} from './helpers/overtime-terminology.mjs';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ctx=browser();
ctx.lineSnapshots={};
const start=source.indexOf('function displayLine(');
vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
test('compact card odds retain every value and distinguish current, closing and unverified pregame lines',()=>{
 for(const [state,verifiedClose,label] of [['upcoming',false,'Odds'],['live',false,'Pregame odds'],['completed',true,'Closing odds']]){
  const game={id:'test',sport:'NHL',state,status:'Scheduled',sub:'Tonight',score:42,teams:[['Colorado','COL',2],['Columbus','CBJ',1]],line:{spread:'COL -1.5',moneyline:'COL -125',total:6.5,verifiedClose}};
  const before=structuredClone(game),full=ctx.displayLine(game),html=ctx.gameCard(game);
  assert.ok(html.includes(`<strong>${label}</strong>`));
  assert.ok(html.includes('COL -1.5 · ML COL -125 · O/U 6.5'));
  assert.ok(html.includes(full.text),'the complete market description remains accessible in the title');
  assert.ok(html.includes('Stats ›'));
  assert.deepEqual(game,before,'presentation must not mutate scoring or feed data');
 }
});
test('missing odds stay explicit without fabricated values',()=>{
 const html=ctx.gameCard({id:'missing',sport:'NBA',state:'upcoming',status:'Scheduled',score:35,teams:[['A'],['B']]});
 assert.match(html,/>Not listed<\/span>/);
 assert.doesNotMatch(html,/ML undefined|O\/U null/);
});
