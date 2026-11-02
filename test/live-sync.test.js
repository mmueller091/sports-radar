import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';import helper from './helpers/live-sync.cjs';import {osu,eku,toronto,evaluate,fixture} from './helpers/live-sync-scenarios.mjs';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs'),time=require('../scoring/shared/time.js'),before=helper.baseline();
const copy=x=>structuredClone(x);
test('real CFB summaries retain history and the identical verified current observation',()=>{
 const input=osu(),a=evaluate(active,input),missing=evaluate(active,input,null,a);
 assert.equal(a.lastSummaryAccepted,true);assert.equal(missing.historicalEvidenceRetained,true);assert.equal(missing.live.probabilityTelemetry.probability,a.live.probabilityTelemetry.probability);
 assert.equal(missing.score,a.score);assert.equal(missing.momentumPoints,a.momentumPoints);assert.equal(missing.trajectoryScoring.adjustment,a.trajectoryScoring.adjustment);
 assert.deepEqual(missing.pregameBaseline,input.baseline);
 const stale=copy(input.summary);stale.header.competitions[0].competitors.find(t=>t.homeAway==='away').score='21';
 const rejected=evaluate(active,input,stale,a);assert.equal(rejected.lastSummaryAccepted,false);assert.equal(rejected.score,a.score);
 const empty={header:copy(input.summary.header)};assert.equal(evaluate(active,input,empty,a).score,a.score);
 const partial={header:copy(input.summary.header),plays:input.summary.plays.slice(-1).filter(p=>!p.scoringPlay)};
 const retained=evaluate(active,input,partial,a);assert.equal(retained.historicalEvidenceRetained,true);assert.equal(retained.momentumPoints,a.momentumPoints);assert.equal(retained.verifiedLiveEvidence.observedAt,a.verifiedLiveEvidence.observedAt);
 partial.winprobability=[{playId:'missing-old-play',homeWinPercentage:.99}];assert.equal(evaluate(active,input,partial,a).live.probabilityTelemetry.probability,null);
 const old=evaluate(before,input);assert.ok(old.score-evaluate(before,input,null,old).score>=20);
});
test('touchdown/PAT advances recompute current scoreboard state and expire/invalidate evidence safely',()=>{
 const input=osu(),previousInput=copy(input);previousInput.event.competitions[0].competitors.find(t=>t.homeAway==='away').score='21';
 previousInput.summary.header.competitions[0]=copy(previousInput.event.competitions[0]);
 previousInput.summary.scoringPlays=previousInput.summary.scoringPlays.filter(p=>p.awayScore<=21);previousInput.summary.plays=previousInput.summary.plays.filter(p=>p.awayScore<=21);previousInput.summary.winprobability=[];
 const previous=evaluate(active,previousInput);assert.ok(previous.verifiedLiveEvidence);
 for(const score of ['27','28']){const next=copy(input);next.event.competitions[0].competitors.find(t=>t.homeAway==='away').score=score;
  const g=evaluate(active,next,null,previous);assert.equal(g.teams.find(t=>t[1]==='OKST')[2],score);assert.equal(g.historicalEvidenceRetained,true);assert.ok(g.score>previous.score);assert.equal(g.live.probabilityTelemetry.probability,null);
 }
 const accepted=evaluate(active,input),expired=copy(accepted);expired.verifiedLiveEvidence.observedAt-=120001;if(expired.liveInputEvidence)expired.liveInputEvidence.observedAt-=120001;
 assert.equal(evaluate(active,input,null,expired).historicalEvidenceRetained,false);
 const rollback=copy(input);rollback.event.competitions[0].competitors.find(t=>t.homeAway==='away').score='21';
 const corrected=evaluate(active,rollback,null,accepted);assert.equal(corrected.historicalEvidenceRetained,false);assert.equal(corrected.verifiedLiveEvidence,undefined);
 const unreconciled=copy(input.summary);unreconciled.header.competitions[0]=copy(rollback.event.competitions[0]);
 const rejectedLedger=evaluate(active,rollback,unreconciled,accepted);assert.equal(rejectedLedger.verifiedLiveEvidence,undefined);assert.equal(rejectedLedger.momentumPoints,0);assert.equal(rejectedLedger.live.components.eventShock,0);assert.equal(rejectedLedger.scoringPartial,true);
 const playsOnly=copy(unreconciled);delete playsOnly.scoringPlays;assert.equal(evaluate(active,rollback,playsOnly,accepted).verifiedLiveEvidence,undefined);
 const revised=copy(rollback);revised.event.competitions[0].status.displayClock='5:40';
 const reconciled=copy(previousInput.summary);reconciled.header.competitions[0]=copy(revised.event.competitions[0]);delete reconciled.drives;
 assert.equal(evaluate(active,revised,reconciled,accepted).liveUpdateRejected,true,'matching older totals alone do not prove a clock correction');
 const revisionPrior=copy(accepted);revisionPrior.liveRawSituation={...revisionPrior.liveRawSituation,lastPlay:{id:input.event.id+'9000',text:'Touchdown',modified:'2026-11-02T02:00:00Z'}};
 revised.event.competitions[0].situation={lastPlay:{id:input.event.id+'9000',text:'Touchdown overturned after review',modified:'2026-11-02T02:00:05Z'}};
 reconciled.header.competitions[0]=copy(revised.event.competitions[0]);
 const revisedGame=evaluate(active,revised,reconciled,revisionPrior);assert.equal(revisedGame.lastSummaryAccepted,true);assert.equal(revisedGame.liveRawStatus.displayClock,'5:40');
 assert.ok(input.recorded.some(p=>p.scoreA==='21'&&p.scoreB==='27') || input.recorded.some(p=>p.scoreA==='27'&&p.scoreB==='21'),'overturned-score observations remain in history');
 const mismatch=copy(input);mismatch.event.id='different';assert.equal(evaluate(active,mismatch,null,accepted).historicalEvidenceRetained,false);
 const period=copy(input);period.event.competitions[0].status={period:5,displayClock:'0:00',type:{state:'in',detail:'OT'}};assert.equal(evaluate(active,period,null,accepted).historicalEvidenceRetained,false);
 const overtime=copy(input);overtime.event.competitions[0].status={period:6,displayClock:'0:00',type:{state:'in',detail:'2OT'}};
 const staleOvertime=copy(input.summary);staleOvertime.header.competitions[0]=copy(overtime.event.competitions[0]);staleOvertime.header.competitions[0].status.period=5;
 assert.equal(evaluate(active,overtime,staleOvertime).lastSummaryAccepted,false);
});
test('both real CFB closing markets recover once without rewriting an observed opening baseline',()=>{
 for(const input of [osu(),eku()]){
  const original=copy(input.baseline),g=evaluate(active,input);assert.ok(g.underdog);assert.ok(g.upsetPoints>0);assert.deepEqual(g.pregameBaseline,original);
  const refreshed=evaluate(active,input,null,g);assert.equal(refreshed.underdog.teamId,g.underdog.teamId);assert.equal(refreshed.upsetPoints,g.upsetPoints);
  const points=()=>refreshed.factors.filter(f=>f.label==='Underdog threatens upset');assert.equal(points().length,1);
  for(let i=0;i<3;i++)runtime.applyLiveSnapshot(refreshed,refreshed.sourceCompetition,input.summary);
  assert.equal(refreshed.score,g.score);assert.equal(points().length,1);assert.deepEqual(refreshed.pregameBaseline,original);
  const live=copy(input);live.summary.pickcenter=[{spread:-24.5,homeTeamOdds:{favorite:true},awayTeamOdds:{underdog:true},type:'live'}];delete live.summary.header.competitions[0].odds;
  assert.equal(evaluate(active,live).underdog,null);
  const markedLive=copy(input);markedLive.summary.pickcenter[0].isLive=true;assert.equal(evaluate(active,markedLive).underdog,null);
 }
});
test('NHL confirmed manpower survives missing intervals, but not explicit strength changes, goals or expiry',()=>{
 const input=toronto(),a=evaluate(active,input);assert.ok(a.live.sportImpact.manpower.powerPlay);
 const missing=copy(input.summary);delete missing.onIce;delete missing.boxscore;
 const b=evaluate(active,input,missing,a);assert.equal(b.manpowerRetained,true);assert.equal(b.score,a.score);
 const absent=evaluate(active,input,null,a);assert.equal(absent.manpowerRetained,true);assert.ok(absent.live.sportImpact.manpower.powerPlay);
 const expired=copy(input);expired.event.competitions[0].status.displayClock='7:59';expired.summary.header.competitions[0]=copy(expired.event.competitions[0]);delete expired.summary.onIce;delete expired.summary.boxscore;
 assert.equal(evaluate(active,expired,expired.summary,a).live.sportImpact.manpower.powerPlay,false);
 const goal=copy(input);goal.event.competitions[0].competitors.find(t=>t.homeAway==='home').score='3';assert.equal(evaluate(active,goal,null,a).live.sportImpact.manpower.powerPlay,false);
 const even=copy(input.summary);even.onIce[0].entries=copy(even.onIce[1].entries).map((p,i)=>({athleteid:i===5?`${even.onIce[0].teamId}-g`:`${even.onIce[0].teamId}-${i}`}));
 assert.equal(evaluate(active,input,even,a).live.sportImpact.manpower.powerPlay,false);
 const noGoalies=copy(input.summary);delete noGoalies.boxscore;assert.ok(evaluate(active,input,noGoalies,a).live.sportImpact.manpower.powerPlay);
});
test('halftime changes viewing priority only and resumes immediately; All/Final membership stays intentional',()=>{
 const app=fs.readFileSync('app.js','utf8'),ctx=vm.createContext({globalThis:{SportsRadarScore:runtime},sameLocalDay:()=>false,gameDayStart:()=>0});
 vm.runInContext(app.slice(app.indexOf('function pinnedFavorite('),app.indexOf('function renderGameList(')),ctx);
 const f=fixture('NBA-401909901'),recorded=f.history.snapshots.find(p=>p.rating===77&&/half/i.test(p.phaseLabel));assert.ok(recorded);
 const half={sport:'NBA',state:'live',score:77,liveRawStatus:{period:2,displayClock:'0.0',type:{state:'in',detail:'Halftime'}}},playing={...half,score:74,liveRawStatus:{period:3,displayClock:'10:00',type:{state:'in'}}};
 assert.equal(ctx.viewingPriority(half),71);assert.ok(ctx.compareGames(half,playing)>0);assert.equal(half.score,77);
 half.liveRawStatus=playing.liveRawStatus;assert.equal(ctx.viewingPriority(half),77);assert.ok(ctx.compareGames(half,playing)<0);
 assert.equal(ctx.halftimePriorityAdjustment({sport:'NCAAB',state:'live',score:77,liveRawStatus:{period:2,displayClock:'0:00',type:{state:'in',detail:'End of regulation'}}}),0);
 assert.equal(ctx.visibleInState({state:'completed'},'all'),false);assert.equal(ctx.visibleInState({state:'completed'},'completed'),true);
});
test('late descriptions follow sport clock boundaries and do not affect numeric scoring',()=>{
 const input=osu(),g=evaluate(active,input);assert.doesNotMatch(g.why,/late/);
 for(const [sport,period,clock,want]of [['CFB',3,'5:29',false],['CFB',4,'14:00',true],['NBA',3,'1:00',false],['NBA',4,'6:01',false],['NBA',4,'6:00',true],['NHL',3,'10:01',false],['NHL',3,'10:00',true],['NCAAB',2,'5:00',true]])assert.equal(time.isLateGameStatus(sport,{period,displayClock:clock}),want);
});

test('current WP survives only an identical verified observation; a new clock uses historical facts alone',()=>{
 const input=osu(),current=copy(input);current.summary.winprobability=[{playId:current.summary.plays.at(-1).id,homeWinPercentage:.2}];
 const a=evaluate(active,current),b=evaluate(active,current,null,a);assert.equal(a.live.probabilityTelemetry.probability,.2);assert.equal(b.live.probabilityTelemetry.probability,.2);
 const changed=copy(current);changed.event.competitions[0].status.displayClock='5:28';const moved=evaluate(active,changed,null,a);assert.equal(moved.sameStateEvidenceRetained,false);assert.equal(moved.live.probabilityTelemetry.probability,null);
 const late=copy(input);late.event.competitions[0].status.displayClock='0:10';late.summary.header.competitions[0]=copy(late.event.competitions[0]);
 const end=evaluate(active,late),start=copy(input);start.event.competitions[0].status.period=4;start.event.competitions[0].status.displayClock='15:00';
 const resumed=evaluate(active,start,null,end);assert.equal(resumed.historicalEvidenceRetained,true);assert.equal(resumed.liveRawStatus.period,4);assert.equal(resumed.liveRawStatus.displayClock,'15:00');
});

test('snapshot ingestion keeps evidence caches out of the long-term rating history payload',async()=>{
 // Exercise the real ingestion path with the existing in-memory D1 harness.
 const {DatabaseSync}=await import('node:sqlite'),{refreshSportsData}=await import('../alerts-worker/src/sports-feed.js');
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync('alerts-worker/schema.sql','utf8'));
 const input=osu(),originalFetch=globalThis.fetch;
 const DB={prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(items){return Promise.all(items.map(i=>i.run()));}};
 try{
  globalThis.fetch=async url=>{const u=String(url);if(u.includes('/summary'))return Response.json(input.summary);if(u.includes('/scoreboard'))return Response.json({events:u.includes('/college-football/')?[input.event]:[]});return Response.json({});};
  const feed=await refreshSportsData({DB},Date.now());assert.ok(feed);
  const live=feed.games.find(g=>g.id===input.event.id);assert.ok(live.verifiedLiveEvidence);
  const row=db.prepare('SELECT normalized_state FROM sports_snapshots WHERE game_key=? ORDER BY observed_at DESC LIMIT 1').get('CFB:'+input.event.id);
  const saved=JSON.parse(row.normalized_state);assert.equal(saved.verifiedLiveEvidence,undefined);assert.equal(saved.manpowerEvidence,undefined);assert.equal(saved.providerEventRevisions,undefined);assert.equal(saved.observationEvidence,undefined);assert.equal(saved.score,live.score);
 }finally{globalThis.fetch=originalFetch;db.close();}
});
