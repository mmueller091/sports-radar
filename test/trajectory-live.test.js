import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadCore} from '../calibration/helpers.mjs';
import {pairedHistories,evidenceHistories,hockeyHistories,tinyMovementHistory,prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
import {historySummary} from '../calibration/trajectory-archetypes.mjs';
const require = createRequire(import.meta.url);
const core = await loadCore();
const shadow = require('../calibration/shadow-candidate.cjs');
const oracle = require('./helpers/phase31-oracle.cjs');
const {LIVE_TRAJECTORY_POLICIES,ownedHistory} = require('../calibration/trajectory-live-policy.cjs');
const {TRAJECTORY_POLICIES,trajectoryAdjustment} = require('../calibration/trajectory-policy.cjs');
const old = TRAJECTORY_POLICIES.find(p=>p.id==='gate-45-95-wp-65');
const run = (input,p=null) => shadow.candidateGameRating(core,prepareSynthetic(input),input.competition,input.summary,null,p);

test('same-present paired histories isolate earlier history and retain raw current sport/event calculations',()=>{
  for (const [name,pair] of Object.entries(pairedHistories())) {
    assert.deepEqual(pair[0].competition,pair[1].competition,name);
    assert.deepEqual(pair[0].summary.plays.at(-1),pair[1].summary.plays.at(-1));
    assert.equal(pair[0].summary.winprobability.at(-1).homeWinPercentage,pair[1].summary.winprobability.at(-1).homeWinPercentage);
    for (const p of LIVE_TRAJECTORY_POLICIES) {
      const results = pair.map(x=>run(x,p));
      assert.deepEqual(results[0].state,results[1].state);
      assert.deepEqual(results[0].live.components,results[1].live.components);
      assert.deepEqual(results[0].live.sportImpact,results[1].live.sportImpact);
      for (let i=0;i<2;i++) {
        const baseline = run(pair[i]);
        assert.deepEqual(results[i].live,baseline.live);
        assert.equal(results[i].trajectoryScoring.lateRevivalContribution,0);
        assert.ok(!results[i].historyOwnership.eventFactors.some(f=>/Sustained competitive|Time tied/.test(f.label)));
      }
      if (name==='decisive') {
        const bad=results[1];
        assert.ok(bad.trajectoryScoring.decisiveStrength>.9);
        assert.ok(bad.trajectoryScoring.negativeAfterFloor>=-2);
        assert.ok(bad.score>=core.clampScore(bad.trajectoryScoring.protectedRating));
      }
      if (name==='neutral') assert.ok(results[1].trajectoryScoring.adjustment<0);
      if (name==='falseClose') assert.ok(results[0].score>results[1].score);
      if (name==='nowBlowout') assert.equal(results[0].trajectoryScoring.requestedPositive,0);
    }
  }
});

test('replacing sustained history recalculates cap allocation and retains discrete WP/comeback awards',()=>{
  const summary=historySummary([[.1,7,0],[.2,7,7],[.3,7,14],[.4,14,14]],[[0,.9],[.4,.9],[.8,.1],[.95,.1]]);
  const original=core.momentumImpact('NFL',summary,.95,'live');
  const owned=ownedHistory('NFL',summary,.95);
  const nominal=original.factors.find(f=>f.label==='Sustained competitive game')?.points;
  assert.ok(nominal>0);
  assert.notEqual(owned.points,original.points-nominal,'reclaimed cap is allocated to later event evidence');
  assert.ok(owned.factors.some(f=>f.label==='Erased a large deficit'));
  assert.ok(owned.factors.some(f=>f.label==='Big win-chance swing'));
  assert.ok(owned.points<=15);
});

test('validated dangerous possession retains modest history support despite low outcome probability',()=>{
  const input=pairedHistories().decisive[0];
  input.summary.winprobability.at(-1).homeWinPercentage=.99;
  const baseline=run(input),result=run(input,LIVE_TRAJECTORY_POLICIES[1]);
  assert.equal(result.currentWinProbability,.99);
  assert.equal(result.currentTensionPoints,baseline.currentTensionPoints);
  assert.equal(result.genericLeveragePoints,baseline.genericLeveragePoints);
  assert.deepEqual(result.live,baseline.live);
  assert.ok(result.trajectoryScoring.positiveCurrentStateGate<.5);
  assert.equal(result.trajectoryScoring.effectivePositiveGate,.5);
  assert.ok(result.trajectoryScoring.positiveAfterHistoryCaps>0);
});

test('NHL positive trajectory shares existing late regulation, OT and shootout history headroom',()=>{
  const cases=hockeyHistories();
  for (const p of LIVE_TRAJECTORY_POLICIES) for (const [name,input] of Object.entries(cases)) {
    const result=run(input,p), d=result.trajectoryScoring;
    assert.ok(result.historyOwnership.combinedPoints<=12);
    if(name==='regulation-quiet'||name==='ot-end') assert.equal(d.positiveAfterHistoryCaps,0);
    if(name==='regulation-recent') assert.ok(result.historyOwnership.combinedPoints<=5);
    if(name==='ot-start'||name==='shootout') assert.ok(result.historyOwnership.combinedPoints<=2);
    if(name==='ot-middle') assert.ok(result.historyOwnership.combinedPoints<=1);
    assert.ok(result.historyOwnership.combinedFactors.some(f=>!/Trajectory/.test(f.label)) || name!=='regulation-recent');
    if(name.startsWith('ot-')) assert.ok(result.score<=94);
  }
  assert.ok(run(cases['ot-start'],old).score>run(cases['ot-start'],LIVE_TRAJECTORY_POLICIES[1]).score);
});

test('tiny late WP movement can concentrate fully but earns no separate revival',()=>{
  const input=tinyMovementHistory();
  for (const p of LIVE_TRAJECTORY_POLICIES) {
    const result=run(input,p);
    assert.ok(result.trajectory.lateMovementShare>.9);
    assert.equal(result.trajectoryScoring.lateRevivalContribution,0);
    assert.ok(trajectoryAdjustment(result.trajectory,result.state.currentCloseness,old).lateRevivalContribution>0);
  }
});

test('WP variants preserve telemetry and disclose missing, sparse and unsupported internal gaps',()=>{
  const variants=evidenceHistories();
  const p=LIVE_TRAJECTORY_POLICIES[1];
  const results=Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,run(v,p)]));
  assert.equal(results.missing.trajectory.genuineContinuitySource,'margin-fallback');
  assert.equal(results.singleton.trajectoryScoring.positiveWpConfidence,.65);
  assert.ok(results.sparse.trajectoryScoring.positiveWpConfidence<.7);
  assert.equal(results.full.trajectoryScoring.positiveWpConfidence,1);
  assert.ok(results.earlyOnly.trajectory.wpCoverageEnd<=.3);
  assert.ok(results.lateOnly.trajectory.wpCoverageStart>=.8);
  // Phase 1 has no discontinuous coverage representation. Do not mislabel
  // removed internal samples as an observed gap: endpoints still span 100%.
  assert.equal(results.internalGap.trajectory.wpCoverageShare,1);
  for(const [k,input] of Object.entries(variants)) assert.deepEqual(results[k].trajectory,run(input).trajectory);
});

test('trajectory off and existing Phase 3 preserve frozen shadow outputs; non-live remains untouched',()=>{
  for (const input of [...Object.values(pairedHistories()).flat(),...Object.values(hockeyHistories())]) {
    const game=prepareSynthetic(input);
    for (const p of [null,old]) assert.deepEqual(shadow.candidateGameRating(core,game,input.competition,input.summary,null,p),
      oracle.candidateGameRating(core,game,input.competition,input.summary,null,p));
    const policies=[null,old,...LIVE_TRAJECTORY_POLICIES];
    assert.deepEqual(shadow.candidateTrajectoryRatings(core,game,input.competition,input.summary,policies),
      policies.map(p=>shadow.candidateGameRating(core,game,input.competition,input.summary,null,p)));
    for (const state of ['completed','upcoming']) for (const p of LIVE_TRAJECTORY_POLICIES)
      assert.deepEqual(shadow.candidateGameRating(core,{...game,state},input.competition,input.summary,null,p),
        oracle.candidateGameRating(core,{...game,state},input.competition,input.summary));
  }
});
