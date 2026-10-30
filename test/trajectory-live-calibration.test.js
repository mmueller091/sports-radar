import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summary,POLICIES} from '../scripts/trajectory-live-calibration.mjs';

test('equal-game summaries do not let dense games dominate; 95 and exact 99 are separate',()=>{
  const rows=[...Array.from({length:9},()=>({eventId:'dense',candidateRating:99,baselineRating:90,delta:9,deltaFromExisting:2})),
    {eventId:'sparse',candidateRating:51,baselineRating:60,delta:-9,deltaFromExisting:-2}];
  const s=summary(rows);
  assert.equal(s.mean,94.2);
  assert.equal(s.equalGame.mean,75);
  assert.equal(s.equalGame.meanDelta,0);
  assert.equal(s.exact99,9);
  assert.equal(s.thresholds[95].up,9);
  assert.equal(s.equalGame.thresholds[95].candidateShare,.5);
  assert.equal(s.equalGame.exact99Share,.5);
});

test('Phase 3.1 artifact retains baselines and proves off parity and intentional ownership changes',()=>{
  const r=JSON.parse(readFileSync(new URL('../calibration/output/trajectory-live-calibration.json',import.meta.url)));
  assert.equal(r.states,24562);
  assert.equal(r.evaluations,24562*POLICIES.length);
  assert.equal(r.invariants.offParityStates,24562);
  assert.equal(r.invariants.offMismatches,0);
  assert.equal(r.invariants.rawSportEventMismatches,0);
  assert.equal(r.invariants.batchMismatches,0);
  assert.equal(r.invariants.implicitTrajectoryDefault,null);
  assert.equal(r.selectedPolicy,null);
  assert.equal(r.promotionReady,false);
  assert.equal(r.configurations[0].overall.mean,52.0892);
  assert.equal(r.configurations[1].overall.mean,53.6388);
  assert.equal(r.configurations[2].overall.mean,52.8527);
  for(const c of r.configurations) {
    assert.equal(c.overall.count,24562);
    assert.deepEqual(Object.keys(c.overall.thresholds),['70','85','90','95']);
    assert.equal(Object.keys(c.anchors).length,8);
    assert.equal(Object.values(c.sports).reduce((s,v)=>s+v.count,0),24562);
    if(c.policy?.liveOwnership) {
      assert.ok(c.ownership.statesWithReallocatedHistory>0);
      assert.ok(c.ownership.statesPositiveCapped>0);
      assert.ok(c.ownership.statesNegativeTapered>0);
      assert.ok(r.gates[c.id]['0.65']>0 && r.gates[c.id]['0.65']<1);
      for(const row of [...c.largestIncreases,...c.largestDecreases,...Object.values(c.anchors)]) {
        assert.equal(row.trajectoryScoring.lateRevivalContribution,0);
        assert.equal(row.historyOwnership.eventPoints,row.momentum);
        assert.equal(row.candidateRating,Math.max(1,Math.min(99,Math.round(row.base+row.liveBonus+row.momentum+row.trajectoryScoring.adjustment))));
      }
    }
  }
});

test('artifact exposes evidence metadata, revival counterexample, ablations and NHL budgets',()=>{
  const r=JSON.parse(readFileSync(new URL('../calibration/output/trajectory-live-calibration.json',import.meta.url)));
  const s=r.synthetic;
  assert.deepEqual(Object.keys(s.evidence),['full','missing','singleton','earlyOnly','lateOnly','sparse','internalGap']);
  assert.equal(Object.keys(s.pairs).length,4);
  assert.ok(s.revivalAblation.withRevival.lateRevivalContribution>0);
  assert.equal(s.revivalAblation.withoutRevival.lateRevivalContribution,0);
  for(const a of Object.values(s.ablations)) for(const d of Object.values(a))
    assert.ok(Math.abs(d.adjustedSustainedQualityContribution-d.sustainedQualityContribution*d.positiveWpConfidence)<1e-9);
  for(const p of POLICIES.filter(p=>p?.liveOwnership)) {
    assert.equal(s.hockey['regulation-quiet'].results[p.id].trajectoryScoring.positiveAfterHistoryCaps,0);
    assert.ok(s.hockey['ot-start'].results[p.id].candidateRating<=94);
    const poor=s.pairs.decisive[1].results[p.id];
    assert.equal(poor.trajectoryScoring.protectedRating,poor.base+poor.trajectoryScoring.floorBonus);
    assert.ok(poor.trajectoryScoring.negativeAfterFloor>=-2);
  }
});
