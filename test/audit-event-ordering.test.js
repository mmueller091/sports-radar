import test from 'node:test';
import assert from 'node:assert/strict';
import evidence from '../scoring/provider-evidence.cjs';

test('basketball normalization preserves existing event-wallclock ordering at one game clock',()=>{
 const play=(id,sequenceNumber,text,wallclock,awayScore)=>({id,sequenceNumber,text,wallclock,period:{number:1},clock:{displayValue:'18:59'},homeScore:0,awayScore});
 const dunk=play('game497','497','Made dunk','2026-03-28T22:12:00Z',4);
 const turnover=play('game502','502','Traveling turnover','2026-03-28T22:11:54Z',2);
 for(const sport of ['NBA','NCAAB'])for(const rows of [[dunk,turnover],[turnover,dunk]]){
  assert.deepEqual(evidence.normalizeEvents(sport,rows).events.map(p=>p.id),['game502','game497']);
 }
});
test('provider sequence numbers alone cannot identify idless events across innings or periods',()=>{
 for(const sport of ['MLB','NFL']){
  const first={sequenceNumber:'1',period:{number:1,type:'Top'},clock:{displayValue:'12:00'},text:'First event',homeScore:0,awayScore:1};
  const second={...first,period:{number:2,type:'Top'},text:'Distinct later event',awayScore:2};
  const result=evidence.normalizeEvents(sport,[first,second,structuredClone(first)]);
  assert.equal(result.conflicts,0);assert.equal(result.events.length,2);assert.equal(result.duplicates,1);
 }
});
