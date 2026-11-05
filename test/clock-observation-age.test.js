import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {snapshotEvidence,shouldSnapshot} from '../alerts-worker/src/snapshot-history.js';
import {currentAlertGame} from '../alerts-worker/src/alert-delivery.js';
const require=createRequire(import.meta.url);
const {preserveObservation,reconcileObservation}=require('../scoring/snapshot-integrity.cjs');
const runtime=require('../scoring/live-runtime.cjs');
const basketball=require('../scoring/basketball-state.cjs');
const start=Date.parse('2026-11-05T01:00:00Z');
const competition=(clock,period=4)=>({status:{period,displayClock:clock,type:{state:'in'}},
 competitors:[{team:{id:'a'},homeAway:'away',score:'17'},{team:{id:'h'},homeAway:'home',score:'10'}],situation:{}});
const game=c=>({id:'age',sport:'CFB',state:'live',score:67,baseScore:52,evidenceQuality:'complete',
 liveRawStatus:c.status,liveRawSituation:c.situation,teams:[['Away','AW','17','','','','','','a'],['Home','HM','10','','','','','','h']]});
function observe(c,previous){const g=game(c);if(previous)preserveObservation(g,previous);reconcileObservation(g,c,null);return g;}

test('first observation records when it was actually seen, before a delayed refresh',t=>{
 t.mock.method(Date,'now',()=>start);
 const before=observe(competition('12:52'));
 Date.now.mock.mockImplementation(()=>start+14*60000);
 const recovered=observe(competition('0:00'),before);
 assert.notEqual(recovered.timingUncertain,true,'fourteen minutes of real time supports the advance');
});

test('identical and rejected refreshes do not make stale provider evidence look newly observed',t=>{
 t.mock.method(Date,'now',()=>start);
 let previous=observe(competition('12:52'));
 for(let minute=1;minute<=13;minute++){
  Date.now.mock.mockImplementation(()=>start+minute*60000);
  previous=observe(competition('12:52'),previous);
 }
 assert.equal(previous.priorObservation.observedAt,start);
 Date.now.mock.mockImplementation(()=>start+14*60000);
 const next=observe(competition('0:00'),previous);
 assert.notEqual(next.timingUncertain,true,'provider catch-up after a repeated stale clock is allowed');
});

test('a newly advanced clock establishes a fresh anchor and impossible repeats remain quarantined',t=>{
 t.mock.method(Date,'now',()=>start);
 let previous=observe(competition('12:52'));
 Date.now.mock.mockImplementation(()=>start+60000);
 previous=observe(competition('11:52'),previous);
 assert.equal(previous.priorObservation.observedAt,start+60000);
 for(const offset of [75000,75000,90000,120000]){
  Date.now.mock.mockImplementation(()=>start+offset);
  previous=observe(competition('0:00'),previous);
  assert.equal(previous.timingUncertain,true);
  assert.equal(previous.priorObservation.competition.status.displayClock,'11:52');
  assert.equal(previous.priorObservation.observedAt,start+60000);
 }
});

test('partial repeated inputs and identical timestamps do not contaminate history, snapshots or alerts',t=>{
 t.mock.method(Date,'now',()=>start);
 for(const sport of ['CFB','NFL','NHL']){
  Date.now.mock.mockImplementation(()=>start);
  const period=sport==='NHL'?3:4,startCompetition=competition('12:52',period);
  const previous={...game(startCompetition),sport,modelVersion:runtime.MODEL_VERSION,
   observationEvidence:{identity:`${sport}:age:a,h`,superseded:['accepted-only']},liveInputEvidence:{summary:{plays:[{id:'verified'}]}}};
  reconcileObservation(previous,startCompetition,null);
  let prior=previous;
  for(const offset of [15000,15000,30000]){
   Date.now.mock.mockImplementation(()=>start+offset);
   const c=competition('0:00',period),next={...game(c),sport,modelVersion:runtime.MODEL_VERSION};
   preserveObservation(next,prior);runtime.applyLiveSnapshot(next,c,{header:{competitions:[c]},plays:[{id:'rejected'}]});
   assert.equal(next.timingUncertain,true,sport);
   assert.equal(next.score,67);
   assert.deepEqual(next.observationEvidence,previous.observationEvidence);
   assert.deepEqual(next.liveInputEvidence,previous.liveInputEvidence);
   assert.equal(shouldSnapshot(next,{},Date.now(),runtime.MODEL_VERSION),false);
   assert.equal(snapshotEvidence(next,'live').evidenceQuality,'invalid');
   assert.equal(currentAlertGame({modelVersion:runtime.MODEL_VERSION,updatedAt:new Date(Date.now()).toISOString()},next),false);
   prior=next;
  }
  Date.now.mock.mockImplementation(()=>start+60000);
  const c=competition('12:00',period),recovery={...game(c),sport};
  preserveObservation(recovery,prior);reconcileObservation(recovery,c,null);
  assert.notEqual(recovery.timingUncertain,true);
  assert.equal(recovery.liveUpdateRejected,false);
 }
});

test('omitted situation fields cannot reset a repeated clock and an explicit corroborated correction can advance it',t=>{
 t.mock.method(Date,'now',()=>start);
 const c=competition('12:00');c.situation={possession:'a',down:2,distance:10,lastPlay:{id:'same',text:'Rush'}};
 let previous=observe(c);
 for(let minute=1;minute<=5;minute++){
  Date.now.mock.mockImplementation(()=>start+minute*60000);
  previous=observe(competition('12:00'),previous);
 }
 assert.equal(previous.priorObservation.observedAt,start);
 Date.now.mock.mockImplementation(()=>start+6000);
 const corrected=competition('7:00');corrected.situation={...c.situation,lastPlay:{id:'same',text:'Official clock correction after review'}};
 const next=game(corrected),original=observe(c);preserveObservation(next,original);
 reconcileObservation(next,corrected,{header:{competitions:[corrected]}});
 assert.notEqual(next.timingUncertain,true);
 assert.equal(next.observationIntegrity.status,'revised');
});

test('normal progress, rapid scoring, period ends, overtime and outages preserve valid clock progression',t=>{
 t.mock.method(Date,'now',()=>start);
 for(const [sport,period] of [['CFB',4],['NFL',4],['NHL',3],['NFL',5],['NHL',4]]){
  for(const [beforeClock,nextClock,elapsed,nextPeriod] of [['4:00','3:55',0,period],['0:10','0:00',30000,period],['0:00','5:00',60000,period+1],['12:00','1:00',20*60000,period]]){
   Date.now.mock.mockImplementation(()=>start);
   const c=competition(beforeClock,period),before={...game(c),sport};reconcileObservation(before,c,null);
   Date.now.mock.mockImplementation(()=>start+elapsed);
   const current=competition(nextClock,nextPeriod),after={...game(current),sport};
   preserveObservation(after,before);reconcileObservation(after,current,null);
   assert.notEqual(after.timingUncertain,true,`${sport} ${beforeClock} -> ${nextClock}`);
  }
 }
});

test('NBA and NCAAM hold the latest provisional rating across repeated uncertain refreshes without promoting it',()=>{
 for(const [sport,period] of [['NBA',4],['NCAAB',2],['NCAAB',3]]){
  const c=competition('0:06',period),before={...game(c),sport,score:11,scoringPartial:true,evidenceQuality:'partial',
   basketballLastTrusted:{score:43},basketballEvidence:{identity:`${sport}:age:a,h`,competition:c,plays:[],probabilities:[]}};
  let prior=before;
  for(let i=0;i<3;i++){
   const zero=competition('0.0',period),pending={...game(zero),sport,modelVersion:runtime.MODEL_VERSION};
   basketball.preserveBasketballState(pending,prior);basketball.reconcileBasketball(pending,zero,null);
   assert.equal(pending.score,11);
   assert.equal(pending.heldRatingProvisional,true);
   assert.equal(pending.basketballLastTrusted.score,43);
   assert.equal(snapshotEvidence(pending,'live').evidenceQuality,'invalid');
   assert.equal(currentAlertGame({modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString()},pending),false);
   prior=pending;
  }
 }
});
