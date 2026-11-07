import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {gameHistory,shouldSnapshot} from '../alerts-worker/src/snapshot-history.js';
import {currentAlertGame} from '../alerts-worker/src/alert-delivery.js';
import {retainedObservation} from '../live-audit-worker/src/export.js';
import * as model from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),integrity=require('../scoring/snapshot-integrity.cjs');
const {MODEL_VERSION}=require('../scoring/live-runtime.cjs');
const capture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/usf-ecu-20261106.json.gz',import.meta.url))));
const rows=capture.rows,live=rows.filter(r=>r.state==='live'&&Number(r.phase)===4);
const saved=row=>JSON.parse(row.normalized_state);
const competition=g=>integrity.competitionFor(g);
const game=(sport,c,score=88,id='401862818')=>({sport,id,state:'live',score,baseScore:score,modelVersion:MODEL_VERSION,
  teams:c.competitors.slice().sort((a,b)=>Number(a.homeAway==='home')-Number(b.homeAway==='home')).map(t=>['Team','TM',String(t.score),'','','','','',String(t.team.id)]),
  liveRawStatus:structuredClone(c.status),liveRawSituation:structuredClone(c.situation)});
const summary=c=>({header:{competitions:[structuredClone(c)]}});
const step=(c,previous,s=null,sport='CFB')=>{
  const g=game(sport,c);if(previous)integrity.preserveObservation(g,previous);
  integrity.reconcileObservation(g,structuredClone(c),s);return g;
};
const falseEnd=()=>competition(saved(live[0]));
const positive=()=>competition(saved(live.find(r=>r.clock==='0:02')));

test('actual USF–ECU rows: six false observations are invalid in history and audit, three real endings survive',async()=>{
  const before=JSON.stringify(rows),env={DB:{prepare(){return {bind(){return this},async all(){return {results:rows}}}}}};
  const history=await gameHistory(env,'CFB','401862818',Date.parse('2026-11-07T06:00:00Z'));
  const endings=history.snapshots.filter(p=>p.state==='live'&&p.period===4&&p.clock==='0:00');
  assert.equal(endings.length,9);
  assert.deepEqual(endings.filter(p=>p.evidenceQuality==='invalid').map(p=>p.rating),[24,24,24,24,24,24]);
  assert.deepEqual(endings.filter(p=>p.evidenceQuality!=='invalid').map(p=>p.rating),[40,43,48]);
  const exported=live.filter(r=>r.clock==='0:00').map(retainedObservation);
  assert.deepEqual(exported.filter(p=>p.state.evidenceQuality==='invalid').map(p=>p.rating),[24,24,24,24,24,24]);
  assert.deepEqual(exported.filter(p=>p.state.evidenceQuality!=='invalid').map(p=>p.rating),[40,43,48]);
  assert.equal(JSON.stringify(rows),before,'read-time classification never changes retained records');
});

test('actual USF–ECU boundary replays consecutive false endings, lagging summary recovery and real endings',()=>{
  const q3=rows.filter(r=>r.state==='live'&&Number(r.phase)===3).at(-1);
  let previous=saved(q3);previous.scoringPartial=false;
  for(const row of live){
    const c=competition(saved(row)),oldSummary={header:{competitions:[saved(row).summaryState]}};
    const current=step(c,previous,oldSummary);
    if(row.rating===24){assert.equal(current.liveUpdateRejected,true);assert.equal(shouldSnapshot(current,{},0,'test'),false);}
    else {assert.equal(current.liveUpdateRejected,false);assert.notEqual(current.timingUncertain,true);assert.equal(current.liveRawStatus.displayClock,row.clock);}
    previous=current;
  }
});

test('CFB recovery accepts missing or deferred summary when an ordered scoreboard play establishes progression',()=>{
  for(const s of [null,{sportsRadarEvidence:{aggregateEvidenceDeferred:true}},summary(falseEnd())]){
    const held=step(falseEnd(),null);
    const resumed=step(positive(),held,s);
    assert.equal(resumed.liveUpdateRejected,false);assert.equal(resumed.liveRawStatus.displayClock,'0:02');
    assert.equal(shouldSnapshot(resumed,{},Date.now(),'test'),true);
    assert.equal(currentAlertGame({modelVersion:MODEL_VERSION,updatedAt:new Date().toISOString()},resumed),true);
  }
});

test('matching live evidence permits absent or differently formatted play IDs and score corrections',()=>{
  for(const id of [undefined,'provider:current'])for(const lower of [false,true]){
    const c=positive();c.situation.lastPlay.id=id;
    if(lower)c.competitors[0].score='9';
    const resumed=step(c,step(falseEnd(),null),summary(c));
    assert.equal(resumed.liveUpdateRejected,false);assert.deepEqual(resumed.teams.map(t=>t[2]),c.competitors.map(t=>t.score));
  }
});

test('uncertainty survives repeated unsupported updates, but cannot poison later trustworthy progression',()=>{
  let previous=step(falseEnd(),null);
  const uncertain=positive();uncertain.situation={};
  for(let i=0;i<4;i++){
    previous=step(uncertain,previous,null);
    assert.equal(previous.timingUncertain,true);assert.equal(previous.score,null);
  }
  const resumed=step(positive(),previous,null);
  assert.equal(resumed.liveUpdateRejected,false);
  const next=positive();next.status.displayClock='0.5';
  const advanced=step(next,resumed,null);
  assert.equal(advanced.liveUpdateRejected,false);assert.equal(advanced.liveRawStatus.displayClock,'0.5');
});

test('contradictory summary finals, ahead clocks/scores, unordered plays and uncorroborated score decreases remain held',()=>{
  const final=positive();final.status.type={state:'post',completed:true};
  const finalZero=falseEnd();finalZero.status.type={state:'post',completed:true};
  const ahead=positive();ahead.status.displayClock='0:01';
  const aheadScore=positive();aheadScore.competitors[0].score='99';
  const old=positive();old.situation.lastPlay.id='401862818583';
  const lower=positive();lower.competitors[0].score='9';
  const wrongPeriod=positive();wrongPeriod.situation.lastPlay.period={number:3};
  for(const [c,s] of [[positive(),summary(final)],[positive(),summary(finalZero)],[positive(),summary(ahead)],[positive(),summary(aheadScore)],[old,summary(old)],[lower,null],[wrongPeriod,null]]){
    const g=step(c,step(falseEnd(),null),s);
    assert.equal(g.liveUpdateRejected,true);assert.equal(g.timingUncertain,true);
  }
});

test('corroborated initial zeroes and final-period touchdowns awaiting conversion remain live',()=>{
  for(const sport of ['CFB','NFL','NHL'])for(const clock of ['0:00','0.0']){
    const c=positive(),period=sport==='NHL'?3:4;c.status.period=period;c.status.displayClock=clock;
    c.situation.lastPlay={period:{number:period},clock:{displayValue:clock},awayScore:Number(c.competitors[0].score),homeScore:Number(c.competitors[1].score)};
    const g=step(c,null,null,sport);assert.notEqual(g.timingUncertain,true);assert.notEqual(g.liveUpdateRejected,true);
  }
  const c=falseEnd();c.situation.down=-1;c.situation.lastPlay={id:'401862818900',period:{number:4},scoreValue:6,text:'Touchdown'};
  assert.notEqual(step(c,null).liveUpdateRejected,true);
  c.situation.lastPlay.period.number=3;
  assert.equal(step(c,null).liveUpdateRejected,true,'a Q3 touchdown cannot prove a Q4 ending');
});

test('NFL/NHL real captured provider shapes reject initial false endings and recover without a synchronized summary',()=>{
  for(const [sport,id] of [['NFL','401873033'],['NHL','401892627']]){
    const f=JSON.parse(gunzipSync(fs.readFileSync(new URL(`./fixtures/production-integrity/${sport}-${id}.json.gz`,import.meta.url))));
    const period=sport==='NHL'?3:4;
    for(const clock of ['0:00','0.0'])for(const label of ['Final','Intermission','End of 4th Quarter']){
      const c=structuredClone(f.event.competitions[0]);
      c.status={period,displayClock:clock,type:{state:'in',completed:false,detail:label}};
      c.situation={lastPlay:{id:'401862818100',period:{number:period-1},text:'End of previous period'}};
      const held=step(c,null,null,sport);assert.equal(held.liveUpdateRejected,true);assert.equal(held.score,null);
      const next=structuredClone(c);next.status.displayClock=sport==='NHL'?'19:55':'14:55';
      next.situation.lastPlay={id:'401862818101',period:{number:period},text:'Play resumes'};
      const g=step(next,held,null,sport);assert.equal(g.liveUpdateRejected,false,sport);assert.equal(g.liveRawStatus.displayClock,next.status.displayClock);
    }
  }
});

test('six sports keep ordinary initial clocks, genuine endings, overtime and completed states',()=>{
  for(const sport of ['NFL','CFB','NBA','NCAAB','NHL','MLB']){
    const period=sport==='NHL'?3:sport==='NCAAB'?2:sport==='MLB'?9:4;
    const c=positive();c.status.period=period;c.status.displayClock='1:00';c.situation.lastPlay.period={number:period};
    const previous=step(c,null,null,sport);assert.notEqual(previous.liveUpdateRejected,true,sport);
    for(const clock of ['0:00','0.0']){
      const end=structuredClone(c);end.status.displayClock=clock;
      assert.notEqual(step(end,previous,summary(end),sport).liveUpdateRejected,true,sport);
      end.status.type={state:'post',completed:true,detail:'Final'};
      const completed={...game(sport,end),state:'completed'};
      integrity.reconcileObservation(completed,end,summary(end));assert.equal(completed.state,'completed');assert.equal(completed.score,88);
    }
    const ot=structuredClone(c);ot.status.period=period+1;ot.status.displayClock='5:00';ot.situation.lastPlay.period={number:period+1};
    assert.notEqual(step(ot,previous,summary(ot),sport).liveUpdateRejected,true,sport);
  }
});

test('sparse CFB history cannot invalidate a legitimate Q4 zero solely because retained Q4 coverage is missing',async()=>{
  const before=structuredClone(rows.find(r=>r.state==='live'&&Number(r.phase)===3));
  const end=structuredClone(live.find(r=>r.rating===43));before.observed_at=end.observed_at-3600000;
  const history=await gameHistory({DB:{prepare(){return {bind(){return this},async all(){return {results:[before,end]}}}}}},'CFB','401862818');
  assert.notEqual(history.snapshots.at(-1).evidenceQuality,'invalid');
});
