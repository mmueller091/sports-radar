import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from '../scripts/shadow-candidate-report.mjs';
import {pairedHistories,evidenceHistories,hockeyHistories,tinyMovementHistory,prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
import {focusedHistories} from '../calibration/trajectory-checkpoint-fixtures.mjs';
import {historySummary} from '../calibration/trajectory-archetypes.mjs';
const require=createRequire(import.meta.url),core=await loadCore();
const shadow=require('../calibration/shadow-candidate.cjs');
const oracle=require('./helpers/phase31-oracle.cjs');
const {LIVE_TRAJECTORY_POLICIES,LIVE_HISTORY_RELEVANCE_POLICY:policy,ownedHistory}=require('../calibration/trajectory-live-policy.cjs');
const {historyImpact}=require('../scoring/shared/history.js');
const {hockeyHistory}=require('../scoring/sports/nhl.js');
const baseline=LIVE_TRAJECTORY_POLICIES[1];
const key=JSON.parse(readFileSync(new URL('../calibration/trajectory-diagnostic-key.replay-v2.json',import.meta.url)));
const fixtures=loadFixtures(),cache=new Map();
function archived(eventId,playId) {
  const fixture=fixtures.find(f=>String(f.eventId)===eventId);
  if(!cache.has(eventId))cache.set(eventId,replayCheckpoints(fixture).checkpoints);
  const cps=cache.get(eventId),index=cps.findIndex(cp=>String(cp.play.id)===playId);
  assert.ok(index>=0);
  return prepareCheckpointEvaluation(core,fixture,cps[index],index);
}
function reviewed(id) {const p=key.cases.find(c=>c.id===id).provenance;return archived(p.eventId,p.playId);}
const runPrepared=(p,variant=policy)=>shadow.candidateGameRating(core,p.game,p.checkpoint.competition,p.checkpoint.summary,null,variant);
const run=(input,variant=policy)=>shadow.candidateGameRating(core,prepareSynthetic(input),input.competition,input.summary,null,variant);

test('reviewed recovery reduces only the historical discount; dead history vanishes before caps',()=>{
  for(const [id,expected] of [['R07',45],['R18',60],['R08',1]]) {
    const p=reviewed(id),before=runPrepared(p,baseline),after=runPrepared(p);
    assert.equal(before.score,key.cases.find(c=>c.id===id).results[baseline.id].score);
    assert.equal(after.score,expected);
    assert.deepEqual(after.state,before.state);assert.deepEqual(after.live,before.live);
    assert.deepEqual(after.trajectory,before.trajectory);
    const d=after.trajectoryScoring,h=after.historyOwnership;
    if(id==='R08') {
      assert.equal(h.relevance.eventRetention,0);assert.equal(after.momentumPoints,0);
      assert.ok(h.allocation.factors.reduce((s,f)=>s+f.rawPoints,0)>15);
      assert.ok(h.allocation.factors.every(f=>f.retainedPoints===0));
    } else {
      assert.ok(h.relevance.recovery);assert.equal(d.negativeMultiplier,.4375);
      assert.ok(d.adjustment<0 && d.adjustment>before.trajectoryScoring.adjustment);
      assert.equal(after.momentumPoints,before.momentumPoints);
      assert.equal(d.lateRevivalContribution,0);
    }
    assertPreparedCheckpointUnchanged(p);
  }
});

test('preselected outside-review checkpoints are regression checks, not accuracy labels',()=>{
  // Selected before editing: 35%/85% checkpoint indices in the first eligible
  // outside-pack game for each sport. Preserve baseline evidence explicitly.
  const selected=[
    ['401872981','4018729811764',67],['401872981','4018729814363',72],
    ['401856720','401856720327',44],['401856720','401856720698',1],
    ['401909088','401909088261',59],['401909088','401909088636',66],
    ['401892519','401892519000005490',41],['401892519','401892519000009650',10],
    ['401908024','4019080240503990057',74],['401908024','4019080241303001157',49]
  ];
  for(const [eventId,playId,score] of selected) {
    assert.ok(!key.cases.some(c=>c.provenance.eventId===eventId));
    const p=archived(eventId,playId),before=runPrepared(p,baseline),after=runPrepared(p);
    assert.equal(before.score,score);
    assert.deepEqual(after.state,before.state);assert.deepEqual(after.live,before.live);
    assert.ok(after.historyOwnership.combinedPoints<=(p.fixture.modelSport==='NHL'?12:15));
    assert.equal(after.score,core.clampScore(after.baseScore+after.liveBonus+after.momentumPoints+after.trajectoryScoring.adjustment));
    assertPreparedCheckpointUnchanged(p);
  }
});

test('score recovery needs recent material events and viable runway, not WP movement',()=>{
  const genuine=reviewed('R07');
  const missingWp=structuredClone(genuine.checkpoint);
  missingWp.summary.winprobability=[];
  const r=shadow.candidateGameRating(core,genuine.game,missingWp.competition,missingWp.summary,null,policy);
  assert.ok(r.historyOwnership.relevance.recovery,'WP is not required for supported score recovery');
  assert.equal(r.currentWinProbability,null);
  for(const input of [...pairedHistories().nowBlowout,tinyMovementHistory(),...pairedHistories().falseClose]) {
    const before=run(input,baseline),after=run(input);
    assert.equal(after.historyOwnership.relevance.recovery,null,input.id);
    assert.equal(after.trajectoryScoring.negativeMultiplier,before.trajectoryScoring.negativeMultiplier);
  }
  const missing=structuredClone(genuine.checkpoint);missing.summary.scoringPlays=[];missing.summary.plays=[];
  assert.equal(shadow.candidateGameRating(core,genuine.game,missing.competition,missing.summary,null,policy)
    .historyOwnership.relevance.recovery,null);
});

test('stale, inconsistent and future scoring cannot establish recovery',()=>{
  const p=reviewed('R07');
  for(const kind of ['stale','mismatch','future']) {
    const cp=structuredClone(p.checkpoint);
    if(kind==='stale')for(const play of cp.summary.scoringPlays) {play.period={number:1};play.clock={displayValue:'10:00'};}
    if(kind==='mismatch')cp.summary.scoringPlays.at(-1).awayScore=16;
    if(kind==='future')for(const play of cp.summary.scoringPlays.slice(-2)) {play.period={number:4};play.clock={displayValue:'1:00'};}
    const result=shadow.candidateGameRating(core,p.game,cp.competition,cp.summary,null,policy);
    assert.equal(result.historyOwnership.relevance.recovery,null,kind);
  }
});

test('decisive protection and the sustained/comeback pair survive without stacked tapers',()=>{
  const pair=focusedHistories().decisive.map(input=>run(input));
  assert.deepEqual(pair.map(r=>r.score),[91,89]);
  for(const input of pairedHistories().decisive) {
    const before=run(input,baseline),after=run(input);
    assert.equal(after.trajectoryScoring.negativeMultiplier,.25);
    assert.equal(after.historyOwnership.relevance.eventRetention,1);
    assert.deepEqual(after.live,before.live);
    assert.ok(after.score>=core.clampScore(after.trajectoryScoring.protectedRating));
  }
  const lowWp=pairedHistories().decisive[0];lowWp.summary.winprobability.at(-1).homeWinPercentage=.99;
  assert.ok(run(lowWp).trajectoryScoring.positiveAfterHistoryCaps>0);
  for(const input of Object.values(hockeyHistories())) {
    const before=run(input,baseline),after=run(input);
    assert.equal(after.score,before.score);assert.deepEqual(after.historyOwnership.combinedFactors,before.historyOwnership.combinedFactors);
  }
});

test('relevance precedes allocation caps including trajectory, and completed options are inert',()=>{
  const summary=historySummary([[.1,7,0],[.2,7,7],[.8,7,14],[.9,14,14],[.94,21,14]],[[0,.9],[.4,.9],[.8,.1],[.95,.1]]);
  const result=ownedHistory('NFL',summary,.95,10,.5),a=result.relevance;
  assert.equal(a.retention,.5);assert.equal(a.cap,15);
  assert.ok(a.factors.some(f=>f.label==='Trajectory sustained history' && f.relevantPoints===5));
  assert.ok(a.factors.some(f=>f.capReduction>0));
  assert.equal(result.points,Math.min(15,a.factors.reduce((s,f)=>s+f.relevantPoints,0)));
  assert.notEqual(result.points,ownedHistory('NFL',summary,.95,10).points*.5,'do not scale already-capped history');
  assert.deepEqual(historyImpact('NFL',summary,1,'completed',{}, {liveRelevance:0}),historyImpact('NFL',summary,1,'completed'));
  for(const input of Object.values(hockeyHistories())) {
    assert.deepEqual(hockeyHistory(input.summary,1,'completed',{liveRelevance:0}),hockeyHistory(input.summary,1,'completed'));
    const reduced=ownedHistory('NHL',input.summary,1,10,0);
    assert.equal(reduced.points,0);
  }
});

test('production, implicit Phase 2, early quality, missing-WP fallback and live-to-final isolation',()=>{
  const inputs=[...Object.values(evidenceHistories()),...Object.values(pairedHistories()).flat(),...Object.values(hockeyHistories())];
  for(const input of inputs) {
    const game=prepareSynthetic(input),before=JSON.stringify([game,input]);
    const result=shadow.candidateGameRating(core,game,input.competition,input.summary,null,policy);
    assert.equal(JSON.stringify([game,input]),before);
    assert.deepEqual(result.live,run(input,baseline).live,'current milestones and extraordinary events are independent');
    assert.deepEqual(shadow.candidateGameRating(core,game,input.competition,input.summary),oracle.candidateGameRating(core,game,input.competition,input.summary));
    for(const state of ['completed','upcoming'])assert.deepEqual(
      shadow.candidateGameRating(core,{...game,state},input.competition,input.summary,null,policy),
      oracle.candidateGameRating(core,{...game,state},input.competition,input.summary));
    assert.deepEqual(prepareSynthetic(input),game,'production enrichment untouched');
  }
  const early=reviewed('R04');
  assert.equal(runPrepared(early).score,runPrepared(early,baseline).score);
  const missing=run(evidenceHistories().missing);
  assert.equal(missing.trajectory.genuineContinuitySource,'margin-fallback');
  assert.equal(missing.trajectoryScoring.positiveWpConfidence,.65);
});
