import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {gameHistory,shouldSnapshot} from '../alerts-worker/src/snapshot-history.js';
import {currentAlertGame} from '../alerts-worker/src/alert-delivery.js';
import * as liveModel from '../alerts-worker/src/live-game-model.js';

const require=createRequire(import.meta.url);
const center=require('../game-center.js');
const runtime=require('../scoring/live-runtime.cjs');
const {preserveBasketballState,reconcileBasketball}=require('../scoring/basketball-state.cjs');
const {normalizedTime}=require('../scoring/shared/time.js');
const observationIntegrity=require('../scoring/snapshot-integrity.cjs');
const report=JSON.parse(fs.readFileSync(new URL('./fixtures/nba-transition-observations.json',import.meta.url)));
const production=JSON.parse(fs.readFileSync(new URL('./fixtures/nba-production-transition.json',import.meta.url)));
const competition=(period,clock,a,b,detail='')=>({status:{period,displayClock:clock,type:{state:'in',detail}},
 competitors:[{team:{id:'1',displayName:'Away'},homeAway:'away',score:String(a)},
  {team:{id:'2',displayName:'Home'},homeAway:'home',score:String(b)}],situation:{}});
const game=(id,c,score=50)=>({id,sport:'NBA',state:'live',score,teams:[['Away','AW',c.competitors[0].score,'','','','','','1'],['Home','HM',c.competitors[1].score,'','','','','','2']]});
const prior=(id,c)=>({
 ...game(id,c,63),basketballEvidence:{identity:`NBA:${id}:1,2`,competition:c,plays:[],probabilities:[]},
 basketballLastTrusted:{score:63,baseScore:63,factors:[],modelVersion:'prior'}
});

test('both recorded NBA zero-clock sequences stay in the audit but leave the game-time chart',()=>{
 for(const sample of report.games){
  const snapshots=sample.observations.map(p=>({...p,observedAt:Date.parse(p.observedAt),state:'live',evidenceQuality:'verified',modelVersion:'production'}));
  const original=JSON.stringify(snapshots),detail={sportsRadarHistory:{snapshots}};
  const data=center.observations({...game(sample.id,competition(4,'9:14',0,0)),score:sample.observations.at(-1).rating},detail);
  assert.deepEqual(data.points.map(p=>p.score),sample.observations.map(p=>p.rating));
  assert.deepEqual(data.points.map(p=>p.observedAt),snapshots.map(p=>p.observedAt));
  assert.ok(data.points.slice(0,-1).every(p=>p.compatibilityIssue));
  assert.ok(data.points.at(-1).x<2880);
  assert.equal(data.points.filter(center.reliable).length,1);
  assert.equal(JSON.stringify(snapshots),original);
 }
});

test('Q3 zero to Q4 zero holds the trusted rating, then a valid Q4 clock resumes',()=>{
 for(const sample of report.games){
  const start=competition(3,'0.0',sample.observations[0].scoreA,sample.observations[0].scoreB);
  const before=prior(sample.id,start),transition=competition(4,'0.0',sample.observations[0].scoreA,sample.observations[0].scoreB);
  const pending=game(sample.id,transition,sample.observations[0].rating);
  preserveBasketballState(pending,before);
  const held=reconcileBasketball(pending,transition,null);
  assert.equal(held.timingUncertain,true);assert.equal(pending.score,63);
  assert.equal(pending.scoringPartial,true);assert.equal(pending.liveRawStatus.displayClock,'');
  const actual=sample.observations.at(-1),valid=competition(4,actual.clock,actual.scoreA,actual.scoreB);
  const resumed=game(sample.id,valid,actual.rating);preserveBasketballState(resumed,pending);
  assert.equal(reconcileBasketball(resumed,valid,{header:{competitions:[valid]},plays:[]}).timingUncertain,undefined);
  assert.notEqual(resumed.timingUncertain,true);
 }
});

test('a second scoring pass cannot overwrite the held rating during a real Q4 zero transition',()=>{
 const id='401909916',q3=competition(3,'0.0',69,94,'End of 3rd Quarter');
 const before=prior(id,q3);before.score=46;before.basketballLastTrusted.score=46;
 const q4=competition(4,'0.0',69,94,'0.0 - 4th Quarter');
 const pending=game(id,q4,19);preserveBasketballState(pending,before);
 runtime.applyLiveSnapshot(pending,q4,null);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.score,46);
 // The feed's summary enrichment calls the scorer again on the same game.
 pending.score=19;pending.liveRawStatus=q4.status;
 runtime.applyLiveSnapshot(pending,q4,{header:{competitions:[q4]},plays:[]});
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.score,46);
 assert.equal(pending.liveRawStatus.displayClock,'');
});

test('Worker enrichment keeps the last verified score until the NBA Q4 clock resolves',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/real-games/NBA-20261020-401909090.json',import.meta.url)));
 const make=(period,clock,detail)=>{
  const event=structuredClone(fixture.event);
  const status={period,displayClock:clock,clock:0,
   type:{id:'2',name:'STATUS_IN_PROGRESS',state:'in',completed:false,description:detail,detail,shortDetail:detail}};
  event.status=structuredClone(status);event.competitions[0].status=status;
  return event;
 };
 const q3=make(3,'0.0','End of 3rd Quarter'),q4=make(4,'0.0','0.0 - 4th Quarter');
 const previous=liveModel.normalizeEvent(q3,'NBA');
 previous.score=46;previous.scoringPartial=false;
 previous.basketballLastTrusted={score:46,baseScore:46,factors:[],modelVersion:previous.modelVersion};
 const pending=liveModel.normalizeEvent(q4,'NBA');
 liveModel.enrichGame(pending,{header:{competitions:[q4.competitions[0]]},plays:[],scoringPlays:[]},previous);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.score,46);
 assert.equal(pending.liveRawStatus.displayClock,'');
 assert.equal(pending.lastSummaryAccepted,false);
 const valid=make(4,'11:06','11:06 - 4th Quarter');
 const resumed=liveModel.normalizeEvent(valid,'NBA');
 liveModel.enrichGame(resumed,{header:{competitions:[valid.competitions[0]]},plays:[],scoringPlays:[]},pending);
 assert.notEqual(resumed.timingUncertain,true);
 assert.equal(resumed.liveRawStatus.displayClock,'11:06');
});

test('Worker enrichment also holds NCAAM at an unconfirmed second-half zero',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/real-games/NCAAB-20260328-401856575.json',import.meta.url)));
 const make=(period,clock,detail)=>{
  const event=structuredClone(fixture.event);
  const status={period,displayClock:clock,clock:0,
   type:{id:'2',name:'STATUS_IN_PROGRESS',state:'in',completed:false,description:detail,detail,shortDetail:detail}};
  event.status=structuredClone(status);event.competitions[0].status=status;
  return event;
 };
 const first=make(1,'0:00','Halftime'),second=make(2,'0.0','0.0 - 2nd Half');
 const previous=liveModel.normalizeEvent(first,'NCAAB');
 previous.score=54;previous.scoringPartial=false;
 previous.basketballLastTrusted={score:54,baseScore:54,factors:[],modelVersion:previous.modelVersion};
 const pending=liveModel.normalizeEvent(second,'NCAAB');
 liveModel.enrichGame(pending,{header:{competitions:[second.competitions[0]]},plays:[],scoringPlays:[]},previous);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.score,54);
 assert.equal(pending.liveRawStatus.displayClock,'');
 const valid=make(2,'19:19','19:19 - 2nd Half');
 const resumed=liveModel.normalizeEvent(valid,'NCAAB');
 liveModel.enrichGame(resumed,{header:{competitions:[valid.competitions[0]]},plays:[],scoringPlays:[]},pending);
 assert.notEqual(resumed.timingUncertain,true);
 assert.equal(resumed.liveRawStatus.displayClock,'19:19');
});

test('nine-minute backward clocks need corroboration; official small corrections and actual buzzer remain valid',()=>{
 const id='401909907',start=prior(id,competition(4,'0:01',93,92));
 const bad=competition(4,'9:14',93,92);bad.situation.lastPlay={id:'999',text:'Basket made'};
 const rejected=game(id,bad,70);preserveBasketballState(rejected,start);
 assert.equal(reconcileBasketball(rejected,bad,{header:{competitions:[bad]},plays:[]}).timingUncertain,true);
 const correction=competition(4,'0:48',93,92);correction.situation.lastPlay={id:'999',text:'Official clock correction'};
 const accepted=game(id,correction,70);preserveBasketballState(accepted,start);
 assert.notEqual(reconcileBasketball(accepted,correction,{header:{competitions:[correction]},plays:[]}).timingUncertain,true);
 const buzzer=competition(4,'0.0',93,92,'Final');buzzer.status.type.completed=true;
 const final=game(id,buzzer,70);preserveBasketballState(final,start);
 assert.notEqual(reconcileBasketball(final,buzzer,{header:{competitions:[buzzer]},plays:[]}).timingUncertain,true);
});

test('a matching play clock resolves a zero while mismatched or incomplete play evidence leaves it pending',()=>{
 const id='401909907',before=prior(id,competition(3,'0.0',90,84));
 const zero=competition(4,'0.0',90,84);
 zero.situation.lastPlay={id:'401909907401'};
 const play={id:zero.situation.lastPlay.id,period:{number:4},clock:{displayValue:'11:43'},awayScore:90,homeScore:84};
 const current=game(id,zero,55);preserveBasketballState(current,before);
 assert.notEqual(reconcileBasketball(current,zero,{plays:[play]}).timingUncertain,true);
 assert.equal(current.liveRawStatus.displayClock,'11:43');
 assert.equal(current.liveRawStatus.clockSource,'corroborated-play');
 for(const bad of [{...play,homeScore:83},{...play,clock:{}},{...play,id:'other'}]){
  const pending=game(id,zero,55);preserveBasketballState(pending,before);
  assert.equal(reconcileBasketball(pending,zero,{plays:[bad]}).timingUncertain,true);
  assert.equal(pending.score,63);
 }
});

test('college second-half and overtime zero clocks hold until corroborated or final',()=>{
 for(const [previousPeriod,period] of [[1,2],[2,3]]){
  const id='401909907',start=competition(previousPeriod,'0.0',62,59);
  const before={...prior(id,start),sport:'NCAAB'};
  before.basketballEvidence.identity=`NCAAB:${id}:1,2`;
  const zero=competition(period,'0.0',62,59);
  const pending={...game(id,zero,8),sport:'NCAAB'};
  preserveBasketballState(pending,before);
  assert.equal(reconcileBasketball(pending,zero,null).timingUncertain,true);
  assert.equal(pending.score,63);
  const buzzer=competition(period,'0.0',62,59,'Final');
  buzzer.status.type.completed=true;
  const final={...game(id,buzzer,60),sport:'NCAAB'};
  preserveBasketballState(final,before);
  assert.notEqual(reconcileBasketball(final,buzzer,null).timingUncertain,true);
 }
});

test('an incomplete first observation does not persist a zero rating',async()=>{
 const live={sport:'NBA',id:'first',state:'live',score:null,timingUncertain:true};
 assert.equal(shouldSnapshot(live,{},Date.now(),'m'),false);
 assert.equal(shouldSnapshot({...live,score:0}, {},Date.now(),'m'),true);
 const rows=[{observed_at:Date.now(),state:'live',rating:null,phase:'4',clock:'0.0',normalized_state:'{}'}];
 const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:rows})})})}};
 assert.deepEqual((await gameHistory(env,'NBA','first')).snapshots,[]);
});

test('uncertain timing cannot supply normalized progress or basketball possessions',()=>{
 assert.deepEqual(normalizedTime('NBA',{status:{period:4,displayClock:'0.0',timingUncertain:true}}),
  {progress:null,elapsedSeconds:null,remainingSeconds:null});
 assert.equal(normalizedTime('NBA',{status:{period:4,displayClock:'9:14'}}).remainingSeconds,554);
});

test('read-time history keeps transitional rows but removes their verified status',async()=>{
 const sample=report.games[0],rows=[{observed_at:Date.parse('2026-11-03T01:53:00Z'),state:'live',rating:63,phase:'3',clock:'0.0',score_a:'90',score_b:'84',normalized_state:'{"evidenceQuality":"complete"}',model_version:'production'},
  ...sample.observations.map(p=>({observed_at:Date.parse(p.observedAt),state:'live',rating:p.rating,phase:String(p.period),clock:p.clock,score_a:String(p.scoreA),score_b:String(p.scoreB),normalized_state:'{"evidenceQuality":"complete"}',model_version:'production'}))];
 const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:rows})})})}};
 const history=await gameHistory(env,'NBA',sample.id,Date.parse('2026-11-03T02:00:00Z'));
 assert.equal(history.snapshots.length,rows.length);
 assert.ok(history.snapshots.slice(1,4).every(p=>p.integrityIssue&&p.evidenceQuality==='invalid'));
 assert.equal(history.snapshots.at(-1).evidenceQuality,'verified');
});

test('101 basketball plays form accessible mobile groups',()=>{
 const snapshots=[{observedAt:1,state:'live',rating:50,period:4,clock:'12:00',evidenceQuality:'verified',modelVersion:'m'},
  {observedAt:2,state:'live',rating:70,period:4,clock:'9:14',evidenceQuality:'verified',modelVersion:'m'}];
 const scoringPlays=Array.from({length:101},(_,i)=>({period:{number:4},clock:{displayValue:`${Math.floor((720-i*4)/60)}:${String((720-i*4)%60).padStart(2,'0')}`},text:`Basket ${i+1}`,scoringPlay:true}));
 const html=center.timeline({...game('dense',competition(4,'9:14',93,93)),score:70},{sportsRadarHistory:{snapshots},scoringPlays});
 const mobile=html.match(/<svg class="timeline-chart timeline-mobile"[\s\S]*?<\/svg>/)?.[0]||'';
 assert.ok(mobile);
 assert.ok((mobile.match(/timeline-event-marker/g)||[]).length<35);
 assert.match(mobile,/101 scoring plays|Basket 101/);
 assert.match(mobile,/tabindex="0"/);
});

test('provisional and held ratings agree between the headline and timeline',()=>{
 const snapshots=[{observedAt:1,state:'live',rating:63,period:4,clock:'7:35',evidenceQuality:'verified',modelVersion:'m'},
  {observedAt:2,state:'live',rating:62,period:4,clock:'7:30',evidenceQuality:'verified',modelVersion:'m'}];
 const detail={sportsRadarHistory:{snapshots}},g={...game('display',competition(4,'7:30',93,93)),score:68,scoringPartial:true};
 const provisional=center.timeline(g,detail);
 assert.match(provisional,/Provisional live rating<\/span><strong>68/);
 assert.match(provisional,/Latest recorded live rating<\/span><strong>62/);
 assert.doesNotMatch(provisional,/Current live rating<\/span><strong>Pending/);
 const held=center.timeline({...g,timingUncertain:true,score:63},detail);
 assert.match(held,/Last confirmed rating<\/span><strong>63/);
 assert.match(held,/Clock updating/);
  const provisionalHeld=center.timeline({...g,timingUncertain:true,heldRatingProvisional:true,score:11},detail);
  assert.match(provisionalHeld,/Last observed rating<\/span><strong>11/);
});

test('football and hockey also reject uncorroborated transition zeros and large clock rollbacks',()=>{
 for(const [sport,previousPeriod,finalPeriod] of [['NFL',3,4],['CFB',3,4],['NHL',2,3]]){
  const id='401909907',start=competition(previousPeriod,'0.0',10,10),before={...game(id,start,63),sport,
    liveRawStatus:start.status,liveRawSituation:start.situation,evidenceQuality:'complete'};
  const transition=competition(finalPeriod,'0.0',10,10),pending={...game(id,transition,15),sport};
  observationIntegrity.preserveObservation(pending,before);
  observationIntegrity.reconcileObservation(pending,transition,null);
  assert.equal(pending.timingUncertain,true,`${sport} transition`);
  assert.equal(pending.score,63);
  const near=competition(finalPeriod,'0:01',10,10);near.situation.lastPlay={id:id+'0001'};
  const priorGame={...game(id,near,60),sport,liveRawStatus:near.status,liveRawSituation:near.situation,evidenceQuality:'complete'};
  const rollback=competition(finalPeriod,'9:14',10,10);rollback.situation.lastPlay={id:id+'0002',text:'New play'};
  const current={...game(id,rollback,20),sport};observationIntegrity.preserveObservation(current,priorGame);
  observationIntegrity.reconcileObservation(current,rollback,null);
  assert.equal(current.liveUpdateRejected,true,`${sport} rollback`);
 }
});

test('USF-ECU Q3 end cannot masquerade as the end of Q4, and a poisoned Q4 observation recovers',()=>{
 const id='401862818';
 const third=competition(3,'0:00',10,17,'End of 3rd Quarter');
 third.situation.lastPlay={id:id+'584',text:'End of 3rd quarter.'};
 const previous={...game(id,third,67),sport:'CFB',liveRawStatus:third.status,
  liveRawSituation:third.situation,baseScore:67,evidenceQuality:'complete',
  timedLastTrusted:{score:67,baseScore:67,factors:[]}};
 const falseEnd=competition(4,'0:00',10,17,'End of 4th Quarter');
 falseEnd.situation.lastPlay=structuredClone(third.situation.lastPlay);
 const pending={...game(id,falseEnd,24),sport:'CFB'};
 observationIntegrity.preserveObservation(pending,previous);
 observationIntegrity.reconcileObservation(pending,falseEnd,null);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.score,67);
 assert.equal(pending.liveRawStatus.displayClock,'');
 assert.equal(pending.liveUpdateRejected,true);
 assert.equal(shouldSnapshot(pending,{},Date.now(),'production'),false);
 assert.equal(currentAlertGame({modelVersion:'production',updatedAt:new Date().toISOString()},
  {...pending,modelVersion:'production'}),false);

 // Production accepted this wrong zero before the guard ran. Its later
 // scoreboard play was 778, 194 plays after the Q3-ending play 584.
 const poisoned={...game(id,falseEnd,24),sport:'CFB',liveRawStatus:falseEnd.status,
  liveRawSituation:falseEnd.situation,baseScore:24,evidenceQuality:'complete'};
 const fourth=competition(4,'0:33',17,17,'0:33 - 4th Quarter');
 fourth.situation.lastPlay={id:id+'778',text:'No Huddle-Shotgun pass incomplete. Targeting penalty.'};
 const corrected={...game(id,fourth,81),sport:'CFB'};
 observationIntegrity.preserveObservation(corrected,poisoned);
 observationIntegrity.reconcileObservation(corrected,fourth,{header:{competitions:[fourth]}});
 assert.equal(corrected.liveUpdateRejected,false);
 assert.equal(corrected.timingUncertain,undefined);
 assert.equal(corrected.liveRawStatus.displayClock,'0:33');
 assert.deepEqual(corrected.teams.map(t=>t[2]),['17','17']);

 const oldPlay={...game(id,third,50),sport:'CFB'};
 observationIntegrity.preserveObservation(oldPlay,poisoned);
 observationIntegrity.reconcileObservation(oldPlay,third,null);
 assert.equal(oldPlay.liveUpdateRejected,true,'older plays still cannot roll back time');
});

test('FSU-Pitt halftime cannot masquerade as the end of Q3 or block real Q3 updates',()=>{
 const id='401858293';
 const second=competition(2,'0:10',6,7,'0:10 - 2nd Quarter');
 second.situation.lastPlay={id:id+'357',period:{number:2},text:'Incomplete pass.'};
 const priorGame={...game(id,second,74),sport:'CFB',liveRawStatus:second.status,
  liveRawSituation:second.situation,evidenceQuality:'complete'};
 // Production's 8:32 PM observation said End of 3rd, but its final play was
 // actually End of Half. Its scores remained 6-7 for the next 45+ minutes.
 const falseThird=competition(3,'0:00',6,7,'End of 3rd Quarter');
 falseThird.situation.lastPlay={id:id+'358',type:{text:'End of Half'},text:'End of Half.'};
 const pending={...game(id,falseThird,68),sport:'CFB'};
 observationIntegrity.preserveObservation(pending,priorGame);
 observationIntegrity.reconcileObservation(pending,falseThird,null);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.liveUpdateRejected,true);
 assert.equal(pending.liveRawStatus.displayClock,'');
 assert.equal(pending.score,74);
 assert.equal(shouldSnapshot(pending,{},Date.now(),'production'),false);
 const initial={...game(id,falseThird,68),sport:'CFB'};
 observationIntegrity.reconcileObservation(initial,falseThird,null);
 assert.equal(initial.timingUncertain,true,'bad Q3 clock cannot become the first accepted state');
 assert.equal(initial.score,null);

 // The already-published bad state must recover when ESPN supplies its
 // corroborated 13-7 score and real third-quarter clock.
 const poisoned={...game(id,falseThird,68),sport:'CFB',liveRawStatus:falseThird.status,
  liveRawSituation:falseThird.situation,evidenceQuality:'complete'};
 const real=competition(3,'5:52',13,7,'5:52 - 3rd Quarter');
 real.situation.lastPlay={id:id+'421',period:{number:3},text:'First down.'};
 const recovered={...game(id,real,79),sport:'CFB'};
 observationIntegrity.preserveObservation(recovered,poisoned);
 observationIntegrity.reconcileObservation(recovered,real,{header:{competitions:[real]}});
 assert.equal(recovered.timingUncertain,undefined);
 assert.equal(recovered.liveUpdateRejected,false);
 assert.equal(recovered.liveRawStatus.displayClock,'5:52');
 assert.deepEqual(recovered.teams.map(t=>t[2]),['13','7']);

 const outdated={...game(id,second,74),sport:'CFB'};
 observationIntegrity.preserveObservation(outdated,poisoned);
 observationIntegrity.reconcileObservation(outdated,second,null);
 assert.equal(outdated.liveUpdateRejected,true,'old Q2 play remains rejected');
});

test('USF-ECU recovery distinguishes missing evidence from contradictions',()=>{
 const id='401862818';
 const falseEnd=competition(4,'0:00',10,17,'End of 4th Quarter');
 falseEnd.situation.lastPlay={id:id+'584',period:{number:3},text:'End of 3rd quarter.'};
 const previous={...game(id,falseEnd,24),sport:'CFB',liveRawStatus:falseEnd.status,
  liveRawSituation:falseEnd.situation,evidenceQuality:'complete',
  timedLastTrusted:{score:67,baseScore:67,factors:[]}};
 const valid=competition(4,'0:33',17,17,'0:33 - 4th Quarter');
 valid.situation.lastPlay={id:id+'778',period:{number:4},text:'Penalty.'};
 const trial=(observation=valid,summary={header:{competitions:[observation]}})=>{
  const current={...game(id,observation,89),sport:'CFB'};
  observationIntegrity.preserveObservation(current,previous);
  observationIntegrity.reconcileObservation(current,observation,summary);
  return current;
 };
 const brokenClock=structuredClone(valid);brokenClock.status.displayClock='14:99';
 const tooLong=structuredClone(valid);tooLong.status.displayClock='16:00';
 const noId=structuredClone(valid);delete noId.situation.lastPlay.id;
 const oldId=structuredClone(valid);oldId.situation.lastPlay.id=id+'583';
 const scoreRevision=structuredClone(valid);scoreRevision.competitors[0].score='9';
 const mismatchedClock=structuredClone(valid);mismatchedClock.status.displayClock='0:32';
 const mismatchedScore=structuredClone(valid);mismatchedScore.competitors[0].score='10';
 const mismatchedState=structuredClone(valid);mismatchedState.status.type.state='post';
 const cases=[
  ['summary clock stale',valid,{header:{competitions:[mismatchedClock]}}],
  ['summary lifecycle is final',valid,{header:{competitions:[mismatchedState]}}],
  ['clock seconds invalid',brokenClock,{header:{competitions:[brokenClock]}}],
  ['clock beyond quarter',tooLong,{header:{competitions:[tooLong]}}],
  ['play ID older',oldId,{header:{competitions:[oldId]}}],
  ['score decreases without corroboration',scoreRevision,null]
 ];
 for(const [name,c,summary] of cases){
  const held=trial(c,summary);
  assert.equal(held.timingUncertain,true,name);
  assert.equal(held.liveUpdateRejected,true,name);
  assert.equal(held.liveRawStatus.displayClock,'',name);
  assert.equal(held.score,67,name);
  assert.equal(shouldSnapshot(held,{},Date.now(),'production'),false,name);
 }
 for(const [c,summary] of [
  [valid,null],[valid,{header:{competitions:[mismatchedScore]}}],
  [valid,{header:{competitions:[valid]},sportsRadarEvidence:{aggregateEvidenceDeferred:true}}],
  [noId,{header:{competitions:[noId]}}],[scoreRevision,{header:{competitions:[scoreRevision]}}]
 ]){
  const recovered=trial(c,summary);
  assert.equal(recovered.liveUpdateRejected,false);
  assert.notEqual(recovered.timingUncertain,true);
 }
 const correct=trial();
 assert.equal(correct.timingUncertain,undefined);
 assert.equal(correct.liveUpdateRejected,false);
 assert.equal(correct.liveRawStatus.displayClock,'0:33');
 assert.deepEqual(correct.teams.map(t=>t[2]),['17','17']);
});

test('an initial false Q4 end cannot become an accepted baseline before summary recovery',()=>{
 const id='401862818';
 const falseEnd=competition(4,'0:00',10,17,'End of 4th Quarter');
 const first={...game(id,falseEnd,99),sport:'CFB'};
 observationIntegrity.reconcileObservation(first,falseEnd,null);
 assert.equal(first.timingUncertain,true);
 assert.equal(first.liveUpdateRejected,true);
 assert.equal(first.score,null);
 assert.equal(first.liveRawStatus.displayClock,'');
 assert.equal(shouldSnapshot(first,{},Date.now(),'production'),false);
 const fourth=competition(4,'14:55',10,17,'14:55 - 4th Quarter');
 fourth.situation.lastPlay={id:id+'620',period:{number:4},text:'Pass for five yards.'};
 const next={...game(id,fourth,72),sport:'CFB'};
 observationIntegrity.preserveObservation(next,first);
 observationIntegrity.reconcileObservation(next,fourth,{header:{competitions:[fourth]},plays:[{
  id:id+'620',period:{number:4},clock:{displayValue:'14:55'},awayScore:10,homeScore:17
 }]});
 assert.equal(next.timingUncertain,undefined);
 assert.equal(next.liveUpdateRejected,false);
 assert.equal(next.liveRawStatus.displayClock,'14:55');
});

test('real fourth-period and NHL period endings remain valid with verified game-end status',()=>{
 const id='401862818';
 for(const [sport,priorPeriod,endPeriod,detail,completed] of [
  ['CFB',4,4,'End of 4th Quarter',false],
  ['NFL',4,4,'End of 4th Quarter',false],
  ['NHL',3,3,'Intermission',false],
  ['NFL',3,4,'Final',true],
  ['NHL',2,3,'Final',true]
 ]){
  const start=competition(priorPeriod,'0:00',10,17,'End of prior period');
  const priorGame={...game(id,start,67),sport,liveRawStatus:start.status,liveRawSituation:start.situation};
  const ending=competition(endPeriod,'0:00',10,17,detail);
  if(completed)ending.status.type={state:'post',completed:true,detail};
  ending.situation.lastPlay={id:id+'800',period:{number:endPeriod},text:detail};
  const next={...game(id,ending,75),sport};
  observationIntegrity.preserveObservation(next,priorGame);
  observationIntegrity.reconcileObservation(next,ending,null);
  assert.notEqual(next.timingUncertain,true,`${sport} ${detail}`);
  assert.notEqual(next.liveUpdateRejected,true,`${sport} ${detail}`);
 }
});

test('NFL and NHL misleading period-end labels cannot accept an impossible zero-clock transition',()=>{
 const id='401862818';
 for(const [sport,priorPeriod,endPeriod,detail] of [
  ['NFL',3,4,'End of 4th Quarter'],['NHL',2,3,'Intermission']
 ]){
  const priorStatus=competition(priorPeriod,'0:00',10,17,'End of prior period');
  priorStatus.situation.lastPlay={id:id+'584',period:{number:priorPeriod},text:'End of prior period.'};
  const prev={...game(id,priorStatus,67),sport,liveRawStatus:priorStatus.status,
   liveRawSituation:priorStatus.situation,baseScore:67,factors:[]};
  const falseEnd=competition(endPeriod,'0:00',10,17,detail);
  falseEnd.status.type.completed=false;
  falseEnd.situation.lastPlay=structuredClone(priorStatus.situation.lastPlay);
  const pending={...game(id,falseEnd,24),sport,modelVersion:'production'};
  observationIntegrity.preserveObservation(pending,prev);
  observationIntegrity.reconcileObservation(pending,falseEnd,null);
  assert.equal(pending.timingUncertain,true,sport);
  assert.equal(pending.liveUpdateRejected,true,sport);
  assert.equal(pending.score,67,sport);
  assert.equal(pending.liveRawStatus.displayClock,'',sport);
  assert.equal(shouldSnapshot(pending,{},Date.now(),'production'),false,sport);
  assert.equal(currentAlertGame({modelVersion:'production',updatedAt:new Date().toISOString()},pending),false,sport);
  const clock=sport==='NHL'?'19:55':'14:55';
  const resumed=competition(endPeriod,clock,10,17,`${clock} - ${endPeriod}`);
  resumed.situation.lastPlay={id:id+'620',period:{number:endPeriod},text:'Play in progress.'};
  const recovered={...game(id,resumed,73),sport};
  observationIntegrity.preserveObservation(recovered,pending);
  observationIntegrity.reconcileObservation(recovered,resumed,{header:{competitions:[resumed]},plays:[]});
  assert.notEqual(recovered.timingUncertain,true,`${sport} recovery`);
  assert.equal(recovered.liveUpdateRejected,false,`${sport} recovery`);
  assert.equal(recovered.liveRawStatus.displayClock,clock,`${sport} recovery`);
 }
});

test('Worker ingestion quarantines the false CFB ending and accepts its confirmed recovery',()=>{
 const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/real-games/CFB-20261017-401862804.json',import.meta.url)));
 const event=fixture.event,id=String(event.id);
 const make=(period,clock,scoreA,scoreB,detail,playId,playText)=>{
  const e=structuredClone(event),c=e.competitions[0];
  c.status={period,displayClock:clock,type:{state:'in',completed:false,detail,shortDetail:detail}};
  c.competitors.find(t=>t.homeAway==='away').score=String(scoreA);
  c.competitors.find(t=>t.homeAway==='home').score=String(scoreB);
  c.situation={lastPlay:{id:id+playId,text:playText}};
  e.status=structuredClone(c.status);
  return e;
 };
 const q3=make(3,'0:00',10,17,'End of 3rd Quarter','584','End of 3rd quarter.');
 const falseEnd=make(4,'0:00',10,17,'End of 4th Quarter','584','End of 3rd quarter.');
 const real=make(4,'0:33',17,17,'0:33 - 4th Quarter','778','Pass incomplete.');
 const before=liveModel.normalizeEvent(q3,'CFB');before.score=67;before.scoringPartial=false;
 before.timedLastTrusted={score:67,baseScore:67,factors:[]};
 const pending=liveModel.normalizeEvent(falseEnd,'CFB');
 liveModel.enrichGame(pending,null,before);
 assert.equal(pending.score,67);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.liveRawStatus.displayClock,'');
 assert.equal(pending.liveUpdateRejected,true);
 assert.equal(shouldSnapshot(pending,{},Date.now(),pending.modelVersion),false);
 const recovered=liveModel.normalizeEvent(real,'CFB');
 liveModel.enrichGame(recovered,{header:{competitions:[real.competitions[0]]},plays:[]},pending);
 assert.notEqual(recovered.timingUncertain,true);
 assert.equal(recovered.liveUpdateRejected,false);
 assert.equal(recovered.liveRawStatus.displayClock,'0:33');
 assert.deepEqual(recovered.teams.map(t=>t[2]),['17','17']);
});

test('same-period false game endings cannot advance twelve minutes in one refresh',()=>{
 for(const sport of ['CFB','NFL','NHL']){
  const id='401866457',start=competition(sport==='NHL'?3:4,'12:52',17,10);
  const previous={...game(id,start,67),sport,liveRawStatus:start.status,liveRawSituation:start.situation,
   baseScore:52,evidenceQuality:'complete'};
  observationIntegrity.reconcileObservation(previous,start,null);
  const falseEnd=competition(sport==='NHL'?3:4,'0:00',17,10,'End of 4th Quarter');
  const pending={...game(id,falseEnd,21),sport};
  observationIntegrity.preserveObservation(pending,previous);
  observationIntegrity.reconcileObservation(pending,falseEnd,null);
  assert.equal(pending.timingUncertain,true,`${sport} implausible jump`);
  assert.equal(pending.score,67,`${sport} preserves the last trustworthy rating`);
  assert.equal(pending.liveRawStatus.displayClock,'');
  assert.ok(pending.evidenceReasons.includes('implausible-clock-advance'));
  assert.equal(pending.scoringPartial,true);
 }
});

test('legitimate same-period progress and genuine terminal observations remain accepted',()=>{
 const id='401866457',start=competition(4,'12:52',17,10,'12:52 - 4th Quarter');
 const previous={...game(id,start,67),sport:'CFB',liveRawStatus:start.status,liveRawSituation:start.situation,
  evidenceQuality:'complete'};
 const normal=competition(4,'11:51',17,10,'11:51 - 4th Quarter');
 const next={...game(id,normal,67),sport:'CFB'};
 observationIntegrity.preserveObservation(next,previous);
 observationIntegrity.reconcileObservation(next,normal,null);
 assert.notEqual(next.timingUncertain,true);
 const old=competition(4,'12:52',17,10,'12:52 - 4th Quarter');
 const knownElapsed={...game(id,old,67),sport:'CFB',liveRawStatus:old.status,liveRawSituation:old.situation,
  evidenceQuality:'complete'};
 const enoughTime=competition(4,'0:00',17,10,'End of 4th Quarter');
 const end={...game(id,enoughTime,21),sport:'CFB'};
 observationIntegrity.preserveObservation(end,knownElapsed);
 end.priorObservation.observedAt=Date.now()-14*60*1000;
 observationIntegrity.reconcileObservation(end,enoughTime,null);
 assert.notEqual(end.timingUncertain,true,'sufficiently elapsed real time can support an end-of-quarter clock');
 const final=competition(4,'0:00',20,17,'Final');final.status.type.completed=true;
 const completed={...game(id,final,69),sport:'CFB',state:'completed'};
 observationIntegrity.preserveObservation(completed,previous);
 observationIntegrity.reconcileObservation(completed,final,null);
 assert.notEqual(completed.timingUncertain,true,'completed games bypass live timing guard');
});

test('basketball unconfirmed zeros hold the most recent valid display state, not a distant period',()=>{
 const id='401909922',recentClock=competition(4,'6.7',112,106,'6.7 - 4th Quarter');
 const recent={...prior(id,recentClock),score:11,baseScore:14,
  liveRawStatus:recentClock.status,live:{phase:'6.7 · 4th quarter',bonus:0},
  scoringPartial:true,evidenceQuality:'partial',evidenceReasons:['scoring-ledger-coverage-gap']};
 recent.basketballLastTrusted={score:43,baseScore:43,live:{phase:'1:25 · 2nd quarter'},factors:[]};
 const zero=competition(4,'0.0',112,106,'0.0 - 4th Quarter');
 const pending=game(id,zero,43);
 preserveBasketballState(pending,recent);
 reconcileBasketball(pending,zero,null);
 assert.equal(pending.timingUncertain,true);
 assert.equal(pending.scoringPartial,true);
 assert.equal(pending.score,11,'partial scoring history does not require using a stale second-quarter rating');
 assert.equal(pending.live.phase,'6.7 · 4th quarter');
 assert.equal(pending.basketballLastTrusted.score,43,'verified history remains separately available');
 const unsafe={...recent,timingUncertain:true,score:99};
 const another=game(id,zero,15);
 preserveBasketballState(another,unsafe);
 reconcileBasketball(another,zero,null);
 assert.equal(another.score,43,'an uncertain prior rating is never promoted to a display fallback');
});

test('both captured production histories replay without a backward chart segment',()=>{
 for(const sample of production.games){
  const detail={sportsRadarHistory:{snapshots:sample.snapshots},scoringPlays:sample.scoringPlays};
  const before=JSON.stringify(detail),data=center.observations(sample.game,detail);
  const firstQ4=data.points.findIndex(p=>p.period===4&&p.clock==='0.0');
  assert.ok(firstQ4>0);
  assert.equal(data.points[firstQ4].compatibilityIssue,true);
  assert.ok(data.points.some(p=>p.period===4&&p.clock==='0.0'&&!p.compatibilityIssue&&/End of 4th Quarter/.test(p.original.phaseLabel)));
  const html=center.timeline(sample.game,detail);
  const paths=[...html.matchAll(/class="timeline-line[^\"]*" d="([^\"]+)"/g)].map(m=>m[1]);
  assert.ok(paths.length>=2);
  for(const path of paths){
    let previous=null;
    for(const [,command,args] of path.matchAll(/([MLC]) ([^MLC]+)/g)){
      const coordinates=args.trim().split(/\s+/).map(Number);
      for(let i=0;i<coordinates.length;i+=2){
        if(command!=='M')assert.ok(coordinates[i]>previous,`${sample.id} backward segment or control`);
        previous=coordinates[i];
      }
    }
  }
  const edges=center.connections(sample.game,detail,data);
  assert.ok(edges.some(e=>!e.allowed),`${sample.id} unavailable interval`);
  assert.ok(edges.filter(e=>e.allowed).every(e=>e.to.x>=e.from.x&&e.to.observedAt>e.from.observedAt));
  assert.ok(edges.filter(e=>e.from.original.recordIndex<firstQ4&&e.to.original.recordIndex>firstQ4).every(e=>!e.allowed),'unconfirmed zero still breaks the path');
  const mobile=html.match(/<svg class="timeline-chart timeline-mobile"[\s\S]*?<\/svg>/)?.[0]||'';
  assert.ok((mobile.match(/timeline-event-marker/g)||[]).length<30);
  assert.equal(JSON.stringify(detail),before);
 }
});
