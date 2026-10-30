import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from '../scripts/shadow-candidate-report.mjs';
import {prepareSynthetic,hockeyHistories} from '../calibration/trajectory-live-fixtures.mjs';
import {focusedHistories} from '../calibration/trajectory-checkpoint-fixtures.mjs';
import {endgameRegressions,endgameContextVariants,decisiveEndgameInputs,neutralOvertimeInput,hypotheticalQualityContexts} from '../calibration/endgame-allocation-fixtures.mjs';
const require=createRequire(import.meta.url),core=await loadCore();
const shadow=require('../calibration/shadow-candidate.cjs');
const {LIVE_HISTORY_RELEVANCE_POLICY:baseline,LIVE_ENDGAME_ALLOCATION_POLICY:policy}=require('../calibration/trajectory-live-policy.cjs');
const {fixture:hockeyFixture}=require('./helpers/nhl-calibration.cjs');
const fixtures=loadFixtures(),cache=new Map();
const cases=JSON.parse(readFileSync(new URL('../calibration/trajectory-diagnostic-key.replay-v2.json',import.meta.url))).cases;
function archived(eventId,playId) {
  const f=fixtures.find(f=>String(f.eventId)===eventId);
  if(!cache.has(eventId))cache.set(eventId,replayCheckpoints(f).checkpoints);
  const cps=cache.get(eventId),index=cps.findIndex(cp=>String(cp.play.id)===playId);
  assert.ok(index>=0);return prepareCheckpointEvaluation(core,f,cps[index],index);
}
function reviewed(id) {const p=cases.find(c=>c.id===id).provenance;return archived(p.eventId,p.playId);}
const run=(p,variant=policy)=>shadow.candidateGameRating(core,p.game,p.checkpoint.competition,p.checkpoint.summary,null,variant);
const synthetic=(input,variant=policy)=>shadow.candidateGameRating(core,prepareSynthetic(input),input.competition,input.summary,null,variant);
function invariant(before,after) {
  assert.deepEqual(after.state,before.state);assert.deepEqual(after.trajectory,before.trajectory);
  assert.deepEqual(after.historyOwnership,before.historyOwnership);
  assert.deepEqual(after.live.components,before.live.components);
  assert.equal(after.trajectoryScoring.negativeAfterTaper,before.trajectoryScoring.negativeAfterTaper);
  assert.deepEqual(after.trajectoryScoring,{...before.trajectoryScoring,policyId:policy.id});
  assert.equal(after.score,core.clampScore(after.baseScore+after.liveBonus+after.momentumPoints+after.trajectoryScoring.adjustment));
}

test('reviewed upper end uses existing floor headroom after history, without changing its allocation',()=>{
  for(const [id,score] of [['R13',99]]) {
    const p=reviewed(id),before=run(p,baseline),after=run(p);
    assert.equal(before.score,score);invariant(before,after);
    assert.equal(after.score,90);
    const b=after.live.endgameAllocation;
    assert.equal(b.floorBaseScore,after.baseScore+b.positiveHistory-b.retainedContext);
    assert.ok(b.allocatedFloor<=b.originalFloor);
    assertPreparedCheckpointUnchanged(p);
  }
});

test('preselected unrelated endgames and reviewed decisive histories remain bounded',()=>{
  for(const [eventId,playId,score] of endgameRegressions) {
    assert.ok(!cases.some(c=>c.provenance.eventId===eventId));
    const p=archived(eventId,playId),before=run(p,baseline),after=run(p);
    assert.equal(before.score,score);invariant(before,after);
    if(!after.live.endgameAllocation)assert.deepEqual(after,{...before,
      trajectoryScoring:{...before.trajectoryScoring,policyId:policy.id}});
    else assert.ok(after.score>=90);
    assertPreparedCheckpointUnchanged(p);
  }
  const pair=focusedHistories().decisive.map(i=>synthetic(i));
  assert.deepEqual(pair.map(r=>r.score),[87,85]);
  assert.ok(pair[0].score>pair[1].score,'sustained quality still distinguishes R06/R12');
});

test('supported context distinguishes finishes; unverified context earns nothing',()=>{
  for(const id of ['R13','R03','R14']) {
    const p=reviewed(id),cp=p.checkpoint;
    const variants=endgameContextVariants({id,sport:p.game.sport,event:cp.event,competition:cp.competition,summary:cp.summary});
    const results=Object.fromEntries(variants.map(i=>[i.label,synthetic(i)]));
    assert.ok(results.postseason.score>results['regular-season'].score,id);
    assert.ok(results['verified-rivalry'].score>=results['regular-season'].score,id);
    assert.ok(results['verified-storyline'].score>=results['regular-season'].score,id);
    assert.equal(results['unverified-rivalry'].score,results['regular-season'].score,id);
  }
  // NHL's unchanged absolute floor can absorb retained context. Record the
  // mismatch without imposing an invented one-point minimum.
  const pair=Object.fromEntries(endgameContextVariants(neutralOvertimeInput()).map(i=>[i.label,synthetic(i)]));
  assert.equal(pair['verified-rivalry'].score,pair['regular-season'].score);
  assert.equal(pair['verified-storyline'].score,pair['regular-season'].score);
});

function unchanged(before,after) {
  assert.deepEqual(after,{...before,trajectoryScoring:{...before.trajectoryScoring,policyId:policy.id}});
}

test('named earlier-third-period NHL states and reviewed OT/late regulation are fully unchanged',()=>{
  for(const [playId,score] of [
    ['401892521000009890',81],['401892521000009900',82],
    ['401892521000005010',82],['401892521000009910',82],['401892521000009950',82]
  ]) {
    const p=archived('401892521',playId),before=run(p,baseline),after=run(p);
    assert.equal(before.score,score);unchanged(before,after);assertPreparedCheckpointUnchanged(p);
  }
  for(const [id,score] of [['R03',94],['R11',94],['R14',95]]) {
    const p=reviewed(id);assert.equal(run(p).score,score);unchanged(run(p,baseline),run(p));
  }
  for(const input of Object.values(hockeyHistories()))unchanged(synthetic(input,baseline),synthetic(input));
});

test('NHL branch/clock boundaries introduce no allocation discontinuity',()=>{
  // Existing regulation target anchors, manpower activation, history headroom,
  // regulation -> OT, OT depth and shootout. Baseline steps are not redesigned.
  const clocks=['20:00','12:01','12:00','11:59','10:01','10:00','9:59',
    '5:01','5:00','4:59','3:01','3:00','2:59','2:01','2:00','1:59',
    '1:01','1:00','0:59','0:16','0:15','0:14','0:01','0:00'];
  for(const [gap,manpower] of [[0,''],[1,''],[1,'trailingPP'],[1,'pulled'],[2,'sixOnFour']]) {
    const results=clocks.map(clock=>{
      const i={sport:'NHL',...hockeyFixture({gap,manpower,clock})};
      const before=synthetic(i,baseline),after=synthetic(i);unchanged(before,after);
      return [before.score,after.score];
    });
    for(let j=1;j<results.length;j++)assert.equal(results[j][1]-results[j-1][1],results[j][0]-results[j-1][0]);
  }
  for(const postseason of [false,true])for(const [period,clock] of [[3,'0:01'],[3,'0:00'],[4,postseason?'20:00':'5:00'],[4,'0:01'],[4,'0:00'],[5,postseason?'20:00':'0:00']]) {
    const i={sport:'NHL',...hockeyFixture({period,clock,postseason})};
    unchanged(synthetic(i,baseline),synthetic(i));
  }
});

test('NFL existing floor activation has no new clock-crossing drop',()=>{
  const p=reviewed('R13'),scores=[];
  for(const clock of ['3:01','3:00','2:59']) {
    const cp=structuredClone(p.checkpoint);cp.competition.status.displayClock=clock;
    cp.competition.status.type={state:'in',completed:false};
    cp.summary.header.competitions=[cp.competition];
    const input={sport:'NFL',event:{...cp.event,competitions:[cp.competition]},competition:cp.competition,summary:cp.summary};
    const before=synthetic(input,baseline),after=synthetic(input);
    invariant(before,after);scores.push(after.score);
    if(clock==='3:01')assert.equal(after.live.endgameAllocation,undefined);
  }
  assert.ok(scores[1]>=scores[0],scores.join(' -> '));
  assert.ok(scores[2]>=scores[1],scores.join(' -> '));
});

test('hypothetical quality/stakes inputs preserve action and history and use existing context factors',()=>{
  const inputs=hypotheticalQualityContexts(),games=inputs.map(prepareSynthetic);
  for(const i of inputs) {
    assert.deepEqual(i.summary.plays,inputs[0].summary.plays);
    assert.deepEqual(i.competition.status,inputs[0].competition.status);
    assert.deepEqual(i.competition.competitors.map(t=>t.score),inputs[0].competition.competitors.map(t=>t.score));
    unchanged(synthetic(i,baseline),synthetic(i));
  }
  assert.ok(games[1].openingFactors.some(f=>f.label==='Adjusted team quality' && f.points>0));
  assert.ok(games[2].openingFactors.some(f=>/Postseason/.test(f.label)));
  assert.ok(games.every(g=>!g.openingFactors.some(f=>f.label==='Division matchup between winning teams')));
});

test('decisive defensive play, low-scoring goal line, winning try and postseason OT stay high',()=>{
  const results=Object.fromEntries(decisiveEndgameInputs().map(i=>[i.id,synthetic(i)]));
  for(const id of ['goal-line','winning-try','major-defensive','postseason-ot'])assert.ok(results[id].score>=90,`${id}: ${results[id].score}`);
  assert.ok(results['major-defensive'].score>results['stagnant-control'].score);
  const hockey=Object.values(hockeyHistories());
  for(const i of hockey)invariant(synthetic(i,baseline),synthetic(i));
  assert.ok(synthetic(hockeyHistories()['playoff-ot']).score>synthetic(hockeyHistories()['ot-start']).score);
});

test('opt-in isolation, deterministic batch path and ordinary regular-season headroom',()=>{
  for(const i of [...decisiveEndgameInputs(),...Object.values(hockeyHistories()),...focusedHistories().ordinary]) {
    const game=prepareSynthetic(i),inputs=JSON.stringify([game,i]);
    const before=synthetic(i,baseline),after=synthetic(i);
    invariant(before,after);
    assert.deepEqual(shadow.candidateTrajectoryRatings(core,game,i.competition,i.summary,[baseline,policy]),[before,after]);
    assert.deepEqual(shadow.candidateGameRating(core,game,i.competition,i.summary),
      shadow.candidateGameRating(core,game,i.competition,i.summary,null,null));
    for(const state of ['completed','upcoming'])assert.deepEqual(
      shadow.candidateGameRating(core,{...game,state},i.competition,i.summary,null,policy),
      shadow.candidateGameRating(core,{...game,state},i.competition,i.summary,null,baseline));
    assert.equal(JSON.stringify([game,i]),inputs);
  }
  const i=decisiveEndgameInputs().find(i=>i.id==='winning-try');
  i.event.sportsRadarContextFactors=[{type:'rivalry',verified:true},{type:'playoff_rematch',verified:true}];
  i.summary.plays=[{text:'Defensive touchdown'}];
  assert.ok(synthetic(i).score>95,'extraordinary regular-season finish has no universal 95 cap');
});
