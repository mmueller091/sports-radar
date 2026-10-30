import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {summarize,trajectoryBuckets,evidenceComparisons} from '../scripts/trajectory-calibration.mjs';
const require = createRequire(import.meta.url);
const {TRAJECTORY_POLICIES} = require('../calibration/trajectory-policy.cjs');

test('targeted grid varies only positive gate and positive confidence', () => {
  const values = key => [...new Set(TRAJECTORY_POLICIES.map(p => p[key]))].sort((a,b) => a-b);
  assert.equal(TRAJECTORY_POLICIES.length,24);
  assert.deepEqual(values('gateStart'),[.1,.2,.25,.3,.35,.45]);
  assert.deepEqual(values('fallbackPositiveConfidence'),[.5,.65,.8,1]);
  for (const [key,value] of Object.entries({positiveCap:10,negativeCap:8,genuineWeight:.75,
    falseCloseWeight:.75,dominanceWeight:.8,revivalPoints:3,evidenceStart:.25,evidenceEnd:.75}))
    assert.deepEqual(values(key),[value],key);
});

test('summary counts bands and crossings in both directions', () => {
  const s = summarize([{eventId:'a',baselineRating:69,candidateRating:72,delta:3},
    {eventId:'a',baselineRating:91,candidateRating:84,delta:-7}]);
  assert.equal(s.mean,78);
  assert.equal(s.meanDelta,-2);
  assert.equal(s.thresholds[70].up,1);
  assert.equal(s.thresholds[85].down,1);
  assert.equal(s.bands['70-84'].count,2);
  assert.equal(s.games,1);
  assert.equal(summarize([]).mean,null);
});

test('full replay artifact covers every policy and preserves downstream invariants', () => {
  const report = JSON.parse(readFileSync(new URL('../calibration/output/trajectory-calibration.json',import.meta.url),'utf8'));
  assert.equal(report.states,24562);
  assert.equal(report.policyEvaluations,24562*TRAJECTORY_POLICIES.length);
  assert.equal(report.invariants.downstreamMismatches,0);
  assert.ok(report.invariants.independentChecks > 1000);
  assert.equal(report.invariants.implicitTrajectoryDefault,null);
  assert.deepEqual(report.invariants.currentTension,{kind:'margin-modifier',uncertaintyWeight:.35,currentTensionCeiling:34});
  assert.equal(report.recommendation.promotionReady,false);
  const preferred = report.configurations.find(c => c.policy.id === report.recommendation.preferred);
  const reference = report.configurations.find(c => c.policy.id === report.recommendation.reference);
  assert.deepEqual(Object.values(reference.anchors).map(a => a.candidateRating),[1,59,58,92,83,75,67,95]);
  assert.ok(preferred.anchors.requiredCFB.delta >= 1 && preferred.anchors.requiredCFB.delta <= 4);
  assert.ok(preferred.anchors.nflCloseOneSided.delta >= 1 && preferred.anchors.nflCloseOneSided.delta <= 4);
  assert.ok(preferred.anchors.closeCFB5050.delta >= 5);
  assert.ok(preferred.anchors.nflLateUncertain.delta >= 7);
  assert.ok(preferred.anchors.decisiveNFLDrive.candidateRating < 99);
  assert.equal(preferred.progress['0-25%'].meanDelta,0,'no premature history award after NHL clock fix');
  for (const crossing of Object.values(preferred.progress['0-25%'].thresholds)) {
    assert.equal(crossing.up,0);
    assert.equal(crossing.down,0);
  }
  assert.deepEqual(report.configurations.map(c => c.policy),TRAJECTORY_POLICIES);
  for (const config of report.configurations) {
    assert.equal(config.overall.count,24562);
    assert.equal(Object.values(config.sports).reduce((n,s) => n+s.count,0),24562);
    assert.equal(Object.values(config.progress).reduce((n,s) => n+s.count,0),24562);
    assert.equal(Object.keys(config.anchors).length,8);
    assert.equal(config.anchors.blowout.candidateRating,1);
    assert.ok(config.anchors.ordinaryCloseEarly.candidateRating < 70);
    assert.ok(config.anchors.closeCFB5050.candidateRating > config.anchors.requiredCFB.candidateRating);
    assert.ok(config.anchors.nflLateUncertain.candidateRating > config.anchors.nflCloseOneSided.candidateRating);
    assert.equal(Object.keys(config.buckets).length,9);
    assert.equal(Object.keys(config.comparisons).length,5);
    assert.equal(config.coverage.NHL.positionedWpStates,0);
    assert.equal(config.progress['0-25%'].meanDelta,0);
    assert.ok(config.comparisons.highMarginNoWp.count >= config.sports.NHL.count/2);
    assert.ok(config.largestIncreases.length && config.largestDecreases.length);
    for (const a of Object.values(config.anchors)) {
      assert.equal(a.delta,a.candidateRating-a.baselineRating);
      assert.ok(Number.isFinite(a.trajectoryScoring.adjustment));
      assert.ok(Number.isFinite(a.trajectoryScoring.positiveWpConfidence));
      assert.ok(Object.keys(trajectoryBuckets(a)).length);
    }
  }
});

test('evidence comparisons exclude fallback from genuine cohorts and handle sparse observations', () => {
  const row = {currentWp:.9,trajectory:{genuineContinuitySource:'margin-fallback',genuineContinuity:1,
    marginContinuity:1,wpCoverageShare:0,wpObservationCount:0}};
  assert.equal(evidenceComparisons(row).highMarginNoWp,true);
  assert.equal(evidenceComparisons(row).highGenuineStrongWp,false);
  row.trajectory.wpObservationCount = 1;
  assert.equal(evidenceComparisons(row).highMarginLimitedWp,true);
  Object.assign(row.trajectory,{genuineContinuitySource:'positioned-win-probability',wpCoverageShare:1,wpObservationCount:8});
  assert.equal(evidenceComparisons(row).oneSidedAfterGenuine,true);
  row.currentWp = .5;
  assert.equal(evidenceComparisons(row).uncertainAfterGenuine,true);
});
