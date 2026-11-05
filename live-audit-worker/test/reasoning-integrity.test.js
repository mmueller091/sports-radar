import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGame,auditTimeline} from '../src/audit.js';
import {compareGameStates,classifySourceErrors} from '../src/comparison.js';
import {captureEvidenceDetails} from '../src/evidence.js';
const base={id:'canes',sport:'NHL',state:'live',score:61,modelVersion:'one',openingScore:60,
  teams:[['A','A',2],['B','B',1]],liveRawStatus:{period:3,displayClock:'17:00',type:{state:'in'}},live:{components:{pressure:1}}};
const peers=clock=>Array.from({length:7},(_,i)=>({game_key:`NHL:${i}`,rating:88,evidence:{scoringVersion:'one',state:{...base,id:String(i),score:88,liveRawStatus:{...base.liveRawStatus,displayClock:clock}}}}));
test('Carolina early third period never compared to last-minute peers',()=>{
  const c=compareGameStates(base,peers('0:50'));assert.equal(c.available,false);assert.equal(c.median,null);
  assert.equal(compareGameStates(base,peers('16:30')).available,true);
  assert.equal(compareGameStates(base,peers('16:30').map(p=>({...p,evidence:{...p.evidence,scoringVersion:'old'}}))).available,false);
});
const play=(i,score,clock,extra={})=>({id:String(i),sequenceNumber:i,period:{number:4},clock:{displayValue:clock},wallclock:new Date(1700000000000+i*100000).toISOString(),awayScore:score[0],homeScore:score[1],...extra});
test('explicit shootout namespace boundary is recorded without hiding actual score regression',()=>{
  const a=play(1,[3,3],'4:00'),b=play(2,[3,3],'5:00',{text:'End of OT'}),c=play(3,[1,2],'0:00',{period:{number:5},text:'Start of Shootout'});
  const r=auditTimeline({plays:[a,b,c]},'NHL');assert.equal(r.findings.length,0);assert.equal(r.diagnostics.shootoutTransitions.length,1);
  const real=auditTimeline({plays:[a,b,{...c,period:{number:4},text:'Faceoff'}]},'NHL');assert.ok(real.findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
  const so=auditTimeline({plays:[c,play(4,[2,2],'0:00',{period:{number:5},text:'Shootout goal'}),play(5,[1,2],'0:00',{period:{number:5},text:'Shootout attempt'})]},'NHL');
  assert.ok(so.findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
});
test('elapsed NHL source clocks do not trigger countdown reversal warnings; genuine reversals survive',()=>{
  const plays=Array.from({length:8},(_,i)=>play(i,[0,0],`${i*2}:00`,{period:{number:1}}));
  assert.equal(auditTimeline({plays},'NHL').findings.length,0);
  const bad=[...plays,play(9,[0,0],'5:00',{period:{number:1}}),play(10,[0,0],'2:00',{period:{number:1}})];
  // A larger independently clocked sample establishes direction despite anomalies.
  const longer=Array.from({length:14},(_,i)=>play(i,[0,0],`${i}:00`,{period:{number:1}}));
  const r=auditTimeline({plays:[...longer,play(15,[0,0],'5:00',{period:{number:1}}),play(16,[0,0],'2:00',{period:{number:1}})]},'NHL');
  assert.ok(r.findings.some(f=>f.reasonCode==='TIMELINE_CLOCK_ORDER'));
});
test('explicit provider correction retained diagnostically; unconfirmed review does not excuse score loss',()=>{
  const a=play(1,[3,3],'2:00'),b=play(2,[3,3],'1:00'),c=play(3,[2,3],'0:30',{text:'Scoring correction'});
  assert.equal(auditTimeline({plays:[a,b,c]},'NHL').diagnostics.corrections.length,1);
  assert.ok(auditTimeline({plays:[a,b,{...c,text:'Play under review'}]},'NHL').findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
});
test('active source errors separated from unrelated games and unknown request scope',()=>{
  const live={...base,providerPath:'hockey/nhl'},s=classifySourceErrors(['https://example/summary?event=canes','https://example/summary?event=99','unexpected provider error'],[live]);
  assert.equal(s.inactive.length,1);assert.equal(s.unknown.length,2);
  const active=classifySourceErrors(['https://example/summary?event=1'],[{...live,id:'1'}]);assert.equal(active.active.length,1);
});
test('capture retains canonical component/manpower evidence and keeps timestamp semantics explicit',()=>{
  const g={...base,evidenceQuality:'invalid',live:{sportImpact:{manpower:{pulled:false,powerPlay:false,advantage:0}},aggregation:{decisiveFloor:30}}};
  const q=captureEvidenceDetails(g,{publishedAt:1700000000000,observedAt:1700000001000});
  assert.equal(q.retainedEvidenceStatus,'invalid');assert.equal(q.goaliePulled,false);
  assert.equal(q.providerPublication,null);assert.equal(q.canonicalPublishedAt,null);assert.equal(q.timestampKind,'canonical-refresh-start');
  assert.equal(q.components.aggregation.decisiveFloor,30);
});
test('model boundary cannot create unexplained scoring jump while deterministic guards stay active',()=>{
  const old={...base,modelVersion:'old',score:25};
  const prior={observed_at:1700000000000,state:'live',normalized_state:JSON.stringify(old),model_version:'old'};
  const r=auditGame({...base,score:85},[prior],[],1700000100000);
  assert.ok(!r.findings.some(f=>f.reasonCode==='UNEXPLAINED_RISE'));
  assert.ok(auditGame({...base,score:101},[prior],[],1700000100000).findings.some(f=>f.deterministic&&f.reasonCode==='RATING_OUT_OF_RANGE'));
});
