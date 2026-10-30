import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {trajectoryArchetypes,evaluateArchetypes} from '../calibration/trajectory-archetypes.mjs';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {highFidelityCheckpoints,prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged}
  from '../scripts/shadow-candidate-report.mjs';
const require = createRequire(import.meta.url);
const {TRAJECTORY_POLICIES,trajectoryAdjustment} = require('../calibration/trajectory-policy.cjs');
const shadow = require('../calibration/shadow-candidate.cjs');

test('all policy families separate real synthetic histories without requiring scoring volume', () => {
  for (const policy of TRAJECTORY_POLICIES) {
    const a = evaluateArchetypes(policy);
    assert.ok(a.sustained.adjustment > 7,policy.id);
    assert.ok(Math.abs(a.defensive.adjustment-a['high-scoring'].adjustment) < .1,policy.id);
    assert.ok(a.sustained.adjustment > a['late-chaos'].adjustment);
    assert.ok(a['late-chaos'].adjustment > a['late-comeback'].adjustment);
    assert.ok(a['late-chaos'].lateRevivalContribution > 0);
    assert.ok(a.ordinary.adjustment > a['false-close'].adjustment);
    assert.ok(a['false-close'].adjustment >= a.blowout.adjustment);
    assert.ok(a.blowout.adjustment < 0);
    assert.equal(a['late-blowout'].adjustment,0,'dead current state cannot collect positive history');
    assert.equal(a.early.adjustment,0);
    assert.equal(a['missing-wp'].adjustment,a['single-wp'].adjustment);
    assert.ok(a['missing-wp'].fallback);
    assert.ok(a['limited-wp'].wpConfidence > 0 && a['limited-wp'].wpConfidence < .12);
    assert.ok(a['limited-wp'].adjustment > a['false-close'].adjustment);
    for (const d of Object.values(a)) {
      assert.ok(d.adjustment >= -policy.negativeCap && d.adjustment <= policy.positiveCap);
      assert.equal(d.telemetry.genuineContinuitySource,d.telemetrySource);
    }
  }
});

test('maturity is evidence, not a time award; current gate cannot suppress negative history', () => {
  const p = TRAJECTORY_POLICIES[0];
  const good = trajectoryArchetypes().find(x => x.id === 'sustained').telemetry;
  const bad = trajectoryArchetypes().find(x => x.id === 'blowout').telemetry;
  assert.equal(trajectoryAdjustment(good,0,p).adjustment,0);
  assert.ok(trajectoryAdjustment(good,.2,p).adjustment < trajectoryAdjustment(good,1,p).adjustment/4);
  assert.equal(trajectoryAdjustment(bad,0,p).adjustment,trajectoryAdjustment(bad,1,p).adjustment);
  const neutral = {...good,competitiveShare:.35,genuineContinuity:.35,marginContinuity:.35,
    dominantShare:0,lateMovementShare:0};
  for (const end of [.05,.2,.5,.9,1.2]) {
    assert.equal(trajectoryAdjustment({...neutral,trajectoryEndPosition:end},1,p).adjustment,0);
  }
  const saturated = end => trajectoryAdjustment({...good,trajectoryEndPosition:end},1,p).adjustment;
  // No revival movement: extending equal-quality history past maturity adds no time points.
  assert.equal(trajectoryAdjustment({...good,lateMovementShare:0,trajectoryEndPosition:1},1,p).adjustment,
    trajectoryAdjustment({...good,lateMovementShare:0,trajectoryEndPosition:2},1,p).adjustment);
  assert.equal(saturated(.1),0);
  assert.ok(saturated(.3) < saturated(.65));
  assert.equal(trajectoryAdjustment({},1,p).adjustment,0);
  assert.equal(trajectoryAdjustment(good,1).adjustment,0,'implicit policy is disabled');
  assert.throws(() => trajectoryAdjustment(good,1,{...p,evidenceEnd:p.evidenceStart}),/Invalid/);
});

test('limited WP shrinks influence without extrapolation or singleton/missing-data punishment', () => {
  const p = TRAJECTORY_POLICIES[0];
  const a = evaluateArchetypes(p);
  assert.equal(a['single-wp'].telemetry.wpCoverageShare,0);
  assert.equal(a['single-wp'].telemetry.genuineContinuity,a['single-wp'].telemetry.marginContinuity);
  assert.ok(a['limited-wp'].telemetry.wpCoverageStart >= .85);
  assert.equal(a['limited-wp'].telemetry.wpCoverageEnd,.95);
  const noSupport = {...a['limited-wp'].telemetry,wpCoverageShare:0};
  assert.equal(trajectoryAdjustment(noSupport,1,p).falseCloseContribution,0);
  const pristine = JSON.stringify(a['limited-wp'].telemetry);
  trajectoryAdjustment(a['limited-wp'].telemetry,1,p);
  assert.equal(JSON.stringify(a['limited-wp'].telemetry),pristine);
});

test('positive confidence distinguishes absent, singleton, sparse and sufficient WP without changing other components', () => {
  const preferred = TRAJECTORY_POLICIES.find(p => p.id === 'gate-45-95-wp-65');
  const existing = {...preferred,fallbackPositiveConfidence:1};
  const a = evaluateArchetypes(preferred);
  assert.equal(a['missing-wp'].positiveWpConfidence,.65);
  assert.equal(a['single-wp'].positiveWpConfidence,.65);
  assert.ok(a['missing-wp'].adjustment > 0 && a['missing-wp'].adjustment < a.sustained.adjustment-3);
  assert.equal(a.sustained.positiveWpConfidence,1);
  const good = {...a.sustained.telemetry,lateMovementShare:0};
  let lastConfidence = 0;
  for (const coverage of [0,.001,.1,.25,.5,.75,.999,1]) {
    const t = {...good,wpCoverageShare:coverage};
    const result = trajectoryAdjustment(t,1,preferred);
    const old = trajectoryAdjustment(t,1,existing);
    assert.ok(result.positiveWpConfidence >= lastConfidence);
    lastConfidence = result.positiveWpConfidence;
    for (const key of ['falseCloseContribution','dominanceContribution','lateRevivalContribution',
      'sustainedQuality','evidenceWeight','positiveCurrentStateGate','sustainedQualityContribution'])
      assert.equal(result[key],old[key],key);
  }
  for (const count of [0,1,2,3,5,6,20]) {
    const result = trajectoryAdjustment({...good,wpCoverageShare:1,wpObservationCount:count},1,preferred);
    assert.ok(result.positiveWpConfidence >= .65 && result.positiveWpConfidence <= 1);
    if (count <= 1) assert.equal(result.positiveWpConfidence,.65);
    if (count === 2) assert.ok(result.positiveWpConfidence < .7,'two far-apart observations are still sparse');
    if (count >= 6) assert.equal(result.positiveWpConfidence,1);
  }
  const neutralMissing = {...good,genuineContinuitySource:'margin-fallback',wpCoverageShare:0,wpObservationCount:0,
    genuineContinuity:.35,marginContinuity:.35,competitiveShare:.35,dominantShare:0};
  assert.equal(trajectoryAdjustment(neutralMissing,1,preferred).adjustment,0,'absence creates no negative term');
  for (const p of TRAJECTORY_POLICIES) {
    const bad = a.blowout.telemetry;
    assert.equal(trajectoryAdjustment(bad,0,p).adjustment,trajectoryAdjustment(bad,1,p).adjustment);
  }
});

test('preferred gate preserves great current states but reduces historical credit for moderate current states', () => {
  const preferred = TRAJECTORY_POLICIES.find(p => p.id === 'gate-45-95-wp-65');
  const good = trajectoryArchetypes().find(a => a.id === 'sustained').telemetry;
  const adjusted = close => trajectoryAdjustment(good,close,preferred).adjustment;
  assert.equal(adjusted(0),0);
  assert.ok(adjusted(.65) > 2 && adjusted(.65) < 4);
  assert.ok(adjusted(.75) > adjusted(.65));
  assert.ok(adjusted(.85) > .85*adjusted(1));
  assert.equal(adjusted(.95),adjusted(1));
});

test('archived NHL goal at 1:05 has no mature trajectory award', async () => {
  const core = await loadCore();
  const fixture = loadFixtures().find(x => String(x.eventId) === '401892522');
  const checkpoints = highFidelityCheckpoints(fixture);
  const index = checkpoints.findIndex(x => x.competition.status.period === 1 &&
    x.competition.status.displayClock === '1:05' && x.summary.scoringPlays.length);
  assert.ok(index >= 0);
  const cp = checkpoints[index];
  const {game} = prepareCheckpointEvaluation(core,fixture,cp,index);
  const baseline = shadow.candidateGameRating(core,game,cp.competition,cp.summary);
  assert.ok(Math.abs(baseline.trajectory.trajectoryEndPosition-65/3600) < 1e-12);
  for (const policy of TRAJECTORY_POLICIES) {
    const result = shadow.candidateGameRating(core,game,cp.competition,cp.summary,null,policy);
    assert.equal(result.trajectoryScoring.evidenceWeight,0);
    assert.equal(result.score,baseline.score);
  }
});

test('direct and batched paths preserve Phase 2 downstream state and apply before final clamp', async () => {
  const core = await loadCore();
  const fixtures = loadFixtures();
  const ids = ['401873002','401858490','401892520','401909090','401856574','401930515'];
  for (const id of ids) {
    const fixture = fixtures.find(x => String(x.eventId) === id);
    const checkpoints = highFidelityCheckpoints(fixture);
    for (const index of [0,Math.floor(checkpoints.length/2),checkpoints.length-1]) {
      const cp = checkpoints[index];
      const prepared = prepareCheckpointEvaluation(core,fixture,cp,index);
      const {game} = prepared;
      const baseline = shadow.candidateGameRating(core,game,cp.competition,cp.summary);
      const batched = shadow.candidateTrajectoryRatings(core,game,cp.competition,cp.summary,TRAJECTORY_POLICIES);
      for (const [i,p] of TRAJECTORY_POLICIES.entries()) {
        const result = shadow.candidateGameRating(core,game,cp.competition,cp.summary,null,p);
        assert.deepEqual(result,batched[i]);
        assert.deepEqual(result.live,baseline.live);
        assert.deepEqual(result.state,baseline.state);
        assert.deepEqual(result.factors,baseline.factors);
        assert.deepEqual(result.trajectory,baseline.trajectory);
        assert.equal(result.baseScore,baseline.baseScore);
        assert.equal(result.score,core.clampScore(result.baseScore+result.liveBonus+result.momentumPoints+
          result.trajectoryScoring.adjustment));
      }
      assertPreparedCheckpointUnchanged(prepared);
      for (const state of ['upcoming','completed']) {
        const nonlive = {...game,state};
        assert.deepEqual(shadow.candidateGameRating(core,nonlive,cp.competition,cp.summary,null,TRAJECTORY_POLICIES[0]),
          shadow.candidateGameRating(core,nonlive,cp.competition,cp.summary));
      }
    }
  }
  // A saturated total must retain headroom before subtracting history. Patching
  // the already-clamped Phase 2 99 would incorrectly lower this score.
  const fixture = fixtures.find(x => String(x.eventId) === '401858490');
  const cp = highFidelityCheckpoints(fixture).at(-1);
  const prepared = prepareCheckpointEvaluation(core,fixture,cp,0);
  const game = {...prepared.game,momentumPoints:200};
  const poorHistory = trajectoryArchetypes().find(x => x.id === 'blowout').summary;
  const result = shadow.candidateGameRating(core,game,cp.competition,poorHistory,null,TRAJECTORY_POLICIES[0]);
  assert.ok(result.trajectoryScoring.adjustment < 0);
  assert.equal(result.score,99);
  assert.ok(core.clampScore(99+result.trajectoryScoring.adjustment) < 99);
});
