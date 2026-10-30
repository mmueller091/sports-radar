import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from '../scripts/shadow-candidate-report.mjs';
import {prepareSynthetic,hockeyHistories} from '../calibration/trajectory-live-fixtures.mjs';
import {nhlAdditional,nhlNamed,nhlContextVariants,nhlSemanticInputs} from '../calibration/nhl-allocation-fixtures.mjs';
const require=createRequire(import.meta.url),core=await loadCore();
const shadow=require('../calibration/shadow-candidate.cjs');
const {LIVE_ENDGAME_ALLOCATION_POLICY:baseline,LIVE_NHL_ALLOCATION_POLICY:policy,ownedHistory}=require('../calibration/trajectory-live-policy.cjs');
const {hockeyLiveTiming,hockeyHistory}=require('../scoring/sports/nhl.js');
const {fixture,goal}=require('./helpers/nhl-calibration.cjs');
const sourceHelper=require('./helpers/scoring-source.cjs');
const fixtures=loadFixtures(),cache=new Map();
const cases=JSON.parse(readFileSync(new URL('../calibration/trajectory-diagnostic-key.replay-v2.json',import.meta.url))).cases;
function archived(event,play) {
  const f=fixtures.find(f=>String(f.eventId)===event);
  if(!cache.has(event))cache.set(event,replayCheckpoints(f).checkpoints);
  const cps=cache.get(event),index=cps.findIndex(cp=>String(cp.play.id)===play);
  assert.ok(index>=0);return prepareCheckpointEvaluation(core,f,cps[index],index);
}
function reviewed(id) {const p=cases.find(c=>c.id===id).provenance;return archived(p.eventId,p.playId);}
const run=(i,p=policy)=>shadow.candidateGameRating(core,prepareSynthetic(i),i.competition,i.summary,null,p);
const runArchived=(p,policyValue=policy)=>shadow.candidateGameRating(core,p.game,p.checkpoint.competition,p.checkpoint.summary,null,policyValue);
const make=options=>({sport:'NHL',...fixture(options)});
function reconcile(r) {
  const h=r.historyOwnership,t=r.trajectoryScoring,a=h.allocation;
  assert.ok(Math.abs(h.combinedPoints-h.combinedFactors.reduce((s,f)=>s+f.points,0))<1e-9);
  assert.ok(h.combinedPoints<=12+1e-9);
  if(a?.headroom!==null && a?.headroom!==undefined)assert.ok(h.combinedPoints<=a.headroom+1e-9);
  assert.equal(t.adjustment,h.combinedPoints-r.momentumPoints+t.negativeAfterFloor);
  assert.equal(r.score,core.clampScore(r.baseScore+r.liveBonus+h.combinedPoints+t.negativeAfterFloor));
  assert.ok(r.live.aggregation.positiveBonus<=Math.max(30,r.live.aggregation.decisiveFloor));
}

test('real retained R03/R11 labels resolve first OT and physical elapsed clocks',()=>{
  for(const [id,label,seconds] of [['R03','OT 2:28',152],['R11','OT 0:05',295]]) {
    const p=reviewed(id),cp=p.checkpoint;
    assert.equal(cp.competition.status.type.detail,label);
    const timing=hockeyLiveTiming(cp.event,cp.competition,cp.summary);
    assert.equal(timing.depth,1);assert.equal(timing.postseason,false);assert.equal(timing.seconds,seconds);
    assert.equal(timing.source,'structured-period');
    const remaining=structuredClone(cp.competition);remaining.status.clockMode='remaining';
    remaining.status.displayClock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
    assert.equal(hockeyLiveTiming(cp.event,remaining,cp.summary).elapsed,timing.elapsed);
    assert.equal(runArchived(p).live.sportImpact.overtime.depth,1);assertPreparedCheckpointUnchanged(p);
  }
  const p=reviewed('R14');assert.equal(runArchived(p).live.sportImpact.overtime.seconds,19);
});

test('structured period/format dominates labels; missing or conflicting information is explicit',()=>{
  const resolve=(period,label,season=3,clock='0:05',clockMode='elapsed')=>{
    const i=make({period,clock,postseason:season===3});
    if(season===null){delete i.event.season;delete i.summary.header.season;i.event.name='Away at Home';}
    i.competition.status={period,displayClock:clock,clockMode,type:{detail:label,shortDetail:label}};
    return hockeyLiveTiming(i.event,i.competition,i.summary);
  };
  assert.equal(resolve(5,'2OT 0:05').depth,2);assert.equal(resolve(6,'3OT 2:28').depth,3);
  assert.equal(resolve(3,'3rd 19:41',2).depth,0);
  assert.equal(resolve(2,'2nd Intermission',2).depth,0);
  assert.equal(resolve(5,'Shootout',2).shootout,true);
  assert.equal(resolve(4,'OT 2:28',2).depth,1);
  assert.equal(resolve(4,'3OT 2:28').depth,1);assert.ok(resolve(4,'3OT 2:28').issues.length);
  assert.equal(resolve(3,'OT 2:28',2).depth,0);
  assert.equal(resolve(undefined,'OT 2:28',2).depth,1);
  assert.equal(resolve(undefined,'2OT 2:28').depth,2);
  assert.equal(resolve(undefined,'Intermission',null).depth,null);
  assert.equal(resolve(5,'Intermission',null).depth,null);
  assert.equal(resolve(undefined,'3OT 0:05',null).postseason,false,'OT depth is not postseason evidence');
  assert.equal(resolve(undefined,'2:28',null).depth,null);
  assert.equal(resolve(4,'OT 2:28',null).seconds,null,'unknown OT format has no invented length');
  const conflicting=make({period:5,postseason:true});conflicting.competition.season={type:2};
  const uncertain=hockeyLiveTiming(conflicting.event,conflicting.competition,conflicting.summary);
  assert.equal(uncertain.depth,null);assert.equal(uncertain.formatKnown,false);assert.equal(uncertain.seconds,null);
  assert.ok(uncertain.issues.some(s=>s.includes('Conflicting season')));
});

test('regulation targets are smooth; fixed action has no activation or regulation/OT drops',()=>{
  const history=hockeyHistories()['regulation-quiet'].summary.plays;
  for(const [gap,manpower] of [[0,''],[1,''],[1,'trailingPP'],[1,'pulled'],[2,'sixOnFour']]) {
    const inputs=[{period:2,clock:'0:01'},{period:2,clock:'0:00'},{period:3,clock:'20:00'},
      ...[1199,721,720,719,601,600,599,301,300,299,181,180,179,121,120,119,61,60,59,16,15,14,1,0]
        .map(s=>({period:3,clock:`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}))];
    const results=inputs.map(o=>run(make({...o,gap,manpower,plays:history})));
    for(let n=1;n<results.length;n++) {
      const before=results[n-1],after=results[n];
      const seconds=o=>o.clock.split(':').map(Number).reduce((m,s)=>60*m+s);
      // Across a substantial quiet interval, history may age. At adjacent
      // seconds on either side of an activation/knot it must not create a drop.
      if(inputs[n].period!==inputs[n-1].period || Math.abs(seconds(inputs[n])-seconds(inputs[n-1]))<=1)
        assert.ok(after.score>=before.score,`${gap}/${manpower}: ${inputs[n].clock} ${before.score}->${after.score}`);
      if(n>=3)assert.ok(after.live.sportImpact.competitiveTarget>=before.live.sportImpact.competitiveTarget-1e-9);
    }
  }
  for(const postseason of [false,true]) {
    const inputs=[make({period:3,clock:'0:00',postseason,plays:history}),make({period:4,clock:postseason?'20:00':'5:00',postseason,plays:history})];
    assert.ok(run(inputs[1]).score>=run(inputs[0]).score);
  }
  const end=run(make({period:4,clock:'0:00',plays:history}));
  const shootout=run(make({period:5,shootout:true,plays:history}));
  assert.ok(shootout.score>=end.score-1);
});

test('context survives the floor, with quality, storyline and postseason kept distinct',()=>{
  const inputs=nhlContextVariants(),results=Object.fromEntries(inputs.map(i=>[i.label,run(i)]));
  assert.ok(results['strong-teams'].score>results.ordinary.score);
  assert.ok(results.rivalry.score>results.ordinary.score);
  assert.ok(results.storyline.score>results.ordinary.score);
  assert.equal(results['unverified-storyline'].score,results.ordinary.score);
  assert.equal(results['unknown-records'].score,results.ordinary.score);
  assert.ok(results.postseason.score>results['strong-teams'].score);
  assert.ok(results['deciding-final'].live.sportImpact.competitiveTarget>results.postseason.live.sportImpact.competitiveTarget);
  for(const i of inputs) {
    assert.deepEqual(i.summary.plays,inputs[0].summary.plays);
    assert.deepEqual(i.competition.competitors.map(t=>t.score),inputs[0].competition.competitors.map(t=>t.score));
    assert.equal(i.competition.status.displayClock,inputs[0].competition.status.displayClock);
    reconcile(run(i));
  }
});

test('ordinary OT retains history without target-dependent release; allocations reconcile',()=>{
  const i=hockeyHistories()['ot-start'],after=run(i),before=run(i,baseline);
  assert.equal(after.historyOwnership.allocation.headroom,2);
  assert.equal(after.historyOwnership.combinedPoints,before.historyOwnership.combinedPoints);
  assert.ok(after.score<before.score,'lower target does not silently become additional history');
  const recent=hockeyHistories()['regulation-recent'];recent.competition.status.period=4;recent.competition.status.displayClock='5:00';
  const drama=run(recent);
  assert.ok(drama.historyOwnership.combinedPoints>after.historyOwnership.combinedPoints);
  assert.ok(drama.score>after.score);assert.ok(after.score>=85 && after.score<95);
  for(const p of [...nhlNamed,...nhlAdditional])reconcile(runArchived(archived(p[0],p[1])));
});

test('reviewed cases, pressure/manpower, extraordinary events, defensive games and dead games',()=>{
  for(const id of ['R03','R11','R14']) {
    const p=reviewed(id),r=runArchived(p);reconcile(r);assert.ok(r.score>=85);assert.ok(r.score<99);
  }
  for(const [event,play] of nhlNamed.slice(0,5)) {
    const r=runArchived(archived(event,play));
    assert.equal(r.historyOwnership.combinedPoints,12,'history is not subtracted through the floor base');
    assert.ok(r.score>=70);
  }
  for(const [event,play] of nhlNamed.slice(5))assert.ok(runArchived(archived(event,play)).score<95);
  for(const [event,play,score] of nhlAdditional)assert.equal(runArchived(archived(event,play),baseline).score,score);
  const results=Object.fromEntries(nhlSemanticInputs().map(i=>[i.label,run(i)]));
  assert.ok(results['pressure-tie'].score>results['quiet-tie'].score);
  assert.ok(results['one-goal-manpower'].score>results['quiet-tie'].score);
  assert.ok(results['extraordinary-current'].live.components.eventShock>0);
  assert.ok(results['extraordinary-current'].score>results['quiet-tie'].score);
  assert.ok(results['defensive-scoreless'].score>=80);
  assert.ok(results.settled.score<30);
});

test('NHL inputs, defaults, completed scoring, original policies and other sports are isolated',()=>{
  for(const input of [...nhlContextVariants(),...Object.values(hockeyHistories())]) {
    const game=prepareSynthetic(input),saved=JSON.stringify([game,input]);
    const defaultBefore=shadow.candidateGameRating(core,game,input.competition,input.summary);
    const before=run(input,baseline),after=run(input);
    assert.equal(after.currentTensionPoints,before.currentTensionPoints);
    assert.equal(after.genericLeveragePoints,before.genericLeveragePoints);
    assert.deepEqual(after.trajectory,before.trajectory);
    assert.deepEqual(shadow.candidateTrajectoryRatings(core,game,input.competition,input.summary,[baseline,policy]),[before,after]);
    assert.deepEqual(shadow.candidateGameRating(core,game,input.competition,input.summary),defaultBefore);
    for(const state of ['completed','upcoming'])assert.deepEqual(
      shadow.candidateGameRating(core,{...game,state},input.competition,input.summary,null,policy),
      shadow.candidateGameRating(core,{...game,state},input.competition,input.summary,null,baseline));
    assert.deepEqual(hockeyHistory(input.summary,1,'completed',{nhlAllocation:{}}),hockeyHistory(input.summary,1,'completed'));
    assert.equal(JSON.stringify([game,input]),saved);
  }
  for(const sport of ['NFL','CFB','NBA','NCAAB','MLB']) {
    const f=fixtures.find(f=>f.modelSport===sport),cps=replayCheckpoints(f).checkpoints;
    for(const fraction of [.6,.95]) {
      const index=Math.floor(cps.length*fraction),p=prepareCheckpointEvaluation(core,f,cps[index],index);
      const before=runArchived(p,baseline),after=runArchived(p);
      assert.deepEqual(after,{...before,trajectoryScoring:{...before.trajectoryScoring,policyId:policy.id}});
    }
  }
});

test('opt-in NHL shared timing, target, history and aggregation match classic browser execution',()=>{
  const browser=vm.runInNewContext(`${sourceHelper.scoringSource()}\nSportsRadarScoring`);
  const nodeNhl=require('../scoring/sports/nhl.js'),nodePressure=require('../scoring/shared/pressure.js');
  for(const i of [...nhlContextVariants(),...nhlSemanticInputs()]) {
    const game=prepareSynthetic(i),result=run(i),allocation=result.live.sportImpact.allocation;
    const candidate={...game,sourceEvent:game.sourceEvent,baseScore:result.baseScore};
    const args=[candidate,i.competition,i.summary,i.competition.status,result.progress,result.gap,{context:allocation.context}];
    assert.deepEqual(structuredClone(browser.sports_nhl.hockeyLiveTiming(i.event,i.competition,i.summary)),nodeNhl.hockeyLiveTiming(i.event,i.competition,i.summary));
    assert.deepEqual(structuredClone(browser.sports_nhl.hockeySituationImpact(...args)),nodeNhl.hockeySituationImpact(...args));
    const options={replaceSustained:true,trajectoryPositive:result.trajectoryScoring.requestedPositive,liveRelevance:result.historyOwnership.relevance.eventRetention,nhlAllocation:allocation};
    assert.deepEqual(structuredClone(browser.sports_nhl.hockeyHistory(i.summary,result.progress,'live',options)),nodeNhl.hockeyHistory(i.summary,result.progress,'live',options));
    const aggregate={sportImpact:result.live.sportImpact,decisiveFloorEnabled:true,preserveCompetitiveSupport:true,
      situationPoints:result.live.components.situation,pressurePoints:result.live.components.pressure,eventShockPoints:result.live.components.eventShock};
    assert.deepEqual(structuredClone(browser.shared_pressure.aggregateLiveBonus(aggregate)),nodePressure.aggregateLiveBonus(aggregate));
  }
});
