// Frozen historical reproduction; corrected evaluation lives in replay-input-comparison.mjs.
import {highFidelityCheckpoints} from './replay-inputs.historical.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {evaluateArchetypes} from '../calibration/trajectory-archetypes.mjs';
import {prepareCheckpointEvaluation,evaluatePreparedCheckpointTrajectories,
  assertPreparedCheckpointUnchanged} from './shadow-candidate-report.mjs';
const require = createRequire(import.meta.url);
const shadow = require('../calibration/shadow-candidate.cjs');
const {TRAJECTORY_POLICIES} = require('../calibration/trajectory-policy.cjs');
const thresholds = [50,70,80,85,90];
const sports = ['CFB','NFL','NBA','NCAAB','MLB','NHL','Soccer','Tennis'];
const r = x => x == null ? null : Number(x.toFixed(4));
const mean = a => a.length ? a.reduce((s,v) => s+v,0)/a.length : null;
const median = a => {
  if (!a.length) return null;
  const b = [...a].sort((x,y) => x-y), i = Math.floor(b.length/2);
  return b.length%2 ? b[i] : (b[i-1]+b[i])/2;
};
export function summarize(rows) {
  return {
    count:rows.length,games:new Set(rows.map(x => x.eventId)).size,
    mean:r(mean(rows.map(x => x.candidateRating))),median:median(rows.map(x => x.candidateRating)),
    baselineMean:r(mean(rows.map(x => x.baselineRating))),baselineMedian:median(rows.map(x => x.baselineRating)),
    meanDelta:r(mean(rows.map(x => x.delta))),medianDelta:median(rows.map(x => x.delta)),
    bands:Object.fromEntries([['<50',1,50],['50-69',50,70],['70-84',70,85],['85+',85,100]].map(([name,lo,hi]) => {
      const count = rows.filter(x => x.candidateRating >= lo && x.candidateRating < hi).length;
      return [name,{count,percentage:r(count*100/(rows.length || 1))}];
    })),
    thresholds:Object.fromEntries(thresholds.map(t => [t,{
      baseline:rows.filter(x => x.baselineRating >= t).length,
      candidate:rows.filter(x => x.candidateRating >= t).length,
      up:rows.filter(x => x.baselineRating < t && x.candidateRating >= t).length,
      down:rows.filter(x => x.baselineRating >= t && x.candidateRating < t).length
    }]))
  };
}
export function trajectoryBuckets(row) {
  const t = row.trajectory, d = row.trajectoryScoring;
  return {
    highGenuineContinuity:t.genuineContinuity >= .75,
    falseClose:t.marginContinuity >= .7 && t.genuineContinuity <= .5 && t.wpCoverageShare >= .5,
    highDominance:t.dominantShare >= .6,
    highLateMovement:t.lateMovementShare >= .6,
    strongSustainedQuality:d.sustainedQuality >= .75,
    lateRevival:d.lateRevival >= .25,
    lowEvidenceMaturity:d.evidenceWeight < .25,
    marginFallback:d.fallback,
    limitedWp:t.wpCoverageShare > 0 && t.wpCoverageShare < .25
  };
}
export function evidenceComparisons(row) {
  const t = row.trajectory;
  const supported = t.genuineContinuitySource === 'positioned-win-probability';
  const strong = supported && t.wpCoverageShare >= .75 && t.wpObservationCount >= 6;
  const genuine = strong && t.genuineContinuity >= .75;
  return {
    highGenuineStrongWp:genuine,
    highMarginNoWp:t.marginContinuity >= .75 && t.wpObservationCount === 0,
    highMarginLimitedWp:t.marginContinuity >= .75 && t.wpObservationCount > 0 &&
      (!supported || t.wpCoverageShare < .75 || t.wpObservationCount < 6),
    oneSidedAfterGenuine:genuine && Number.isFinite(row.currentWp) &&
      Math.max(row.currentWp,1-row.currentWp) >= .85,
    uncertainAfterGenuine:genuine && Number.isFinite(row.currentWp) &&
      Math.max(row.currentWp,1-row.currentWp) <= .6
  };
}
const diagnosticFields = ['positiveCurrentStateGate','positiveWpConfidence','positiveWpSupport','evidenceWeight',
  'sustainedQualityContribution','adjustedSustainedQualityContribution','falseCloseContribution',
  'dominanceContribution','lateRevivalContribution','rawTrajectory','boundedTrajectory','adjustment'];
function diagnosticMeans(rows) {
  return Object.fromEntries(diagnosticFields.map(k => [k,r(mean(rows.map(x => x.trajectoryScoring[k])))]));
}
function diagnostic(row) {
  return Object.fromEntries(['stateId','eventId','sport','progress','score','currentWp','currentCloseness',
    'baselineRating','candidateRating','delta','decisive','sportSituation','fidelity','trajectory','trajectoryScoring']
    .map(k => [k,row[k]]));
}
const invariantFields = ['candidateBaseScore','candidateLiveBonus','aggregationBonus','candidateCurrentTension',
  'candidateGenericLeverage','sportSituation','sportPressure','momentum','decisiveFloor','driveFloor','competitiveFloor'];

export async function buildTrajectoryCalibration(fixtures=loadFixtures(),core=null) {
  core ||= await loadCore();
  const phase2 = JSON.parse(await readFile(new URL('../calibration/output/current-tension-calibration.json',import.meta.url),'utf8'));
  const oldAnchors = phase2.configurations.find(x => x.id === 'modifier-65-35-c34').anchors;
  const anchorIds = new Set(Object.values(oldAnchors).map(x => x.stateId));
  const rows = TRAJECTORY_POLICIES.map(() => []);
  let states = 0, independentChecks = 0;
  const checkedSports = new Set();
  for (const fixture of fixtures) {
    const checkpoints = highFidelityCheckpoints(fixture);
    for (const [index,checkpoint] of checkpoints.entries()) {
      const prepared = prepareCheckpointEvaluation(core,fixture,checkpoint,index);
      if (!prepared) continue;
      const [baseline,...candidates] = evaluatePreparedCheckpointTrajectories(prepared,[null,...TRAJECTORY_POLICIES]);
      states++;
      for (const [i,row] of candidates.entries()) {
        for (const field of invariantFields) assert.equal(row[field],baseline[field],`${row.stateId}: ${field}`);
        assert.deepEqual(row.trajectory,baseline.trajectory);
        assert.equal(row.candidateRating,core.clampScore(row.candidateBaseScore+row.candidateLiveBonus+
          row.momentum+row.trajectoryScoring.adjustment));
        rows[i].push({...row,baselineRating:baseline.candidateRating,delta:row.candidateRating-baseline.candidateRating});
      }
      // Independent complete calls at all Phase 2 anchors and first/middle/last
      // checkpoints per fixture prove that sharing the base/live work is exact.
      if (anchorIds.has(baseline.stateId) || [0,Math.floor(checkpoints.length/2),checkpoints.length-1].includes(index)) {
        const independentBaseline = shadow.candidateGameRating(core,prepared.game,checkpoint.competition,checkpoint.summary);
        assert.equal(independentBaseline.score,baseline.candidateRating);
        for (const [i,p] of TRAJECTORY_POLICIES.entries()) {
          const direct = shadow.candidateGameRating(core,prepared.game,checkpoint.competition,checkpoint.summary,null,p);
          assert.equal(direct.score,candidates[i].candidateRating);
          assert.deepEqual(direct.trajectoryScoring,candidates[i].trajectoryScoring);
          assert.deepEqual(direct.live,independentBaseline.live);
          assert.deepEqual(direct.state,independentBaseline.state);
          independentChecks++;
        }
        checkedSports.add(fixture.modelSport);
      }
      assertPreparedCheckpointUnchanged(prepared);
    }
    if (process.env.TRAJECTORY_PROGRESS) console.log(`${fixture.modelSport} ${fixture.eventId}: ${states} states`);
  }
  const configurations = TRAJECTORY_POLICIES.map((policy,i) => {
    const data = rows[i];
    const bucketNames = data.length ? Object.keys(trajectoryBuckets(data[0])) : [];
    return {
      policy,overall:summarize(data),
      sports:Object.fromEntries(sports.map(s => [s,summarize(data.filter(x => x.sport === s))])),
      progress:Object.fromEntries([['0-25%',0,.25],['25-50%',.25,.5],['50-75%',.5,.75],['75-90%',.75,.9],['90%+',.9,Infinity]]
        .map(([name,lo,hi]) => [name,summarize(data.filter(x => x.progress >= lo && x.progress < hi))])),
      groups:{neutral:summarize(data.filter(x => x.sportSituation <= 0 && !x.decisive)),
        specificLeverage:summarize(data.filter(x => x.sportSituation > 0)),decisive:summarize(data.filter(x => x.decisive))},
      buckets:Object.fromEntries(bucketNames.map(name => [name,summarize(data.filter(x => trajectoryBuckets(x)[name]))])),
      diagnostics:diagnosticMeans(data),
      comparisons:Object.fromEntries(Object.keys(evidenceComparisons(data[0])).map(name => {
        const selected = data.filter(x => evidenceComparisons(x)[name]);
        return [name,{...summarize(selected),diagnostics:diagnosticMeans(selected),
          examples:[...selected].sort((a,b) => Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3).map(diagnostic)}];
      })),
      coverage:Object.fromEntries(sports.map(s => {
        const selected = data.filter(x => x.sport === s);
        return [s,{states:selected.length,games:new Set(selected.map(x => x.eventId)).size,
          fullStates:selected.filter(x => x.fidelity === 'full').length,
          positionedWpStates:selected.filter(x => x.trajectory.genuineContinuitySource === 'positioned-win-probability').length,
          substantialWpStates:selected.filter(x => x.trajectory.wpCoverageShare >= .5).length}];
      })),
      anchors:Object.fromEntries(Object.entries(oldAnchors).map(([name,old]) => {
        const row = data.find(x => x.stateId === old.stateId);
        assert.ok(row,`Missing anchor ${name}`);
        return [name,{phase2RecordedRating:old.candidateRating,...diagnostic(row)}];
      })),
      largestIncreases:[...data].filter(x => x.delta > 0).sort((a,b) => b.delta-a.delta).slice(0,10).map(diagnostic),
      largestDecreases:[...data].filter(x => x.delta < 0).sort((a,b) => a.delta-b.delta).slice(0,10).map(diagnostic),
      archetypes:evaluateArchetypes(policy)
    };
  });
  return {version:2,states,policyEvaluations:states*TRAJECTORY_POLICIES.length,
    invariants:{productionChanged:false,implicitTrajectoryDefault:null,currentTension:shadow.DEFAULT_CURRENT_TENSION_POLICY,
      genericLeverage:{cap:shadow.GENERIC_LEVERAGE_CAP,start:shadow.GENERIC_LEVERAGE_START,
        span:shadow.GENERIC_LEVERAGE_SPAN},finalAggregationOnly:true,fields:invariantFields,
      downstreamMismatches:0,independentChecks,checkedSports:[...checkedSports]},
    methodology:'Authoritative chronological checkpoint candidate path; every explicit policy runs before final clamp/round. Shared Phase 2 base/live evaluation verified against independent complete calls. No finalized-rating patches. Phase 1 telemetry unchanged, including the prior NHL elapsed-clock correction. Checkpoint-weighted; states within games are correlated. Buckets overlap; neutral can hide missing situations.',
    recommendation:{preferred:'gate-45-95-wp-65',reference:'gate-10-65-wp-100',promotionReady:false,
      concerns:['Insufficient labelled revival, partial/sparse-WP and cross-sport coverage for final promotion.',
        'No positioned NHL WP states: scoreboard continuity cannot establish genuine uncertainty or false closeness.',
        'Severe late revivals remain net-negative by design; no revival retuning was performed.'],
      reason:'Provisional semantic preference: the .45-.95 gate reduces one-sided-current anchor credit to about three points while preserving strong uncertain states. A 65% fallback retains meaningful scoreboard recognition with a material distinction from sufficiently observed uncertainty; 50% is more restrictive and 80% retains most of the unsupported maximum. This is an interpretable compromise, not an optimum inferred from aggregate NHL ratings or an unlabelled archive.'},
    configurations};
}

const table = (head,rows) => [head.join(' | '),head.map(() => '---').join(' | '),...rows.map(x => x.join(' | '))].join('\n');
export function renderTrajectoryReport(result) {
  const preferred = result.configurations.find(x => x.policy.id === result.recommendation.preferred);
  const reference = result.configurations.find(x => x.policy.id === result.recommendation.reference);
  const stats = entries => table(['View','States','Games','Baseline mean','Candidate mean','Median','Mean delta'],
    Object.entries(entries).map(([k,v]) => [k,v.count,v.games,v.baselineMean,v.mean,v.median,v.meanDelta]));
  const crossings = c => table(['Threshold','Before','After','Up','Down'],
    Object.entries(c.overall.thresholds).map(([k,v]) => [k,v.baseline,v.candidate,v.up,v.down]));
  const components = entries => table(['State/history','Gate','WP confidence','Evidence','Raw sustained','Adjusted sustained','False-close','Dominance','Revival','Raw trajectory','Bounded','Adjustment'],
    Object.entries(entries).map(([k,a]) => {
      const d = a.trajectoryScoring || a;
      return [k,...diagnosticFields.filter(x => x !== 'positiveWpSupport').map(x => r(d[x]))];
    }));
  const extremes = c => table(['State','Sport','Before','After','Delta','Raw trajectory','Evidence','Gate','WP confidence'],
    [...c.largestIncreases,...c.largestDecreases].map(a => [a.stateId,a.sport,a.baselineRating,a.candidateRating,a.delta,
      r(a.trajectoryScoring.rawTrajectory),r(a.trajectoryScoring.evidenceWeight),r(a.trajectoryScoring.positiveCurrentStateGate),r(a.trajectoryScoring.positiveWpConfidence)]));
  const lines = ['# Phase 3 targeted trajectory calibration','',
    'Trajectory remains explicitly opt-in. No production scoring, Phase 1 telemetry, Phase 2 default, sport scoring or revival changes. No promotion, staging, commit, deployment or push. Existing NHL elapsed-clock correction is retained unchanged.','',
    `Evaluated ${result.states} states x ${result.configurations.length} policies = ${result.policyEvaluations} actual candidate finalizations. ${result.invariants.independentChecks} independent complete policy calls agree; downstream mismatches: ${result.invariants.downstreamMismatches}.`,
    '',result.methodology,'',
    '## Policies and recommendation','',
    'The grid crosses gates .10-.65, .20-.70, .25-.75, .30-.80, .35-.85 and .45-.95 with fallback positive confidence .50, .65, .80 and 1.00. The additional .45-.95 ramp tests modest historical credit at the one-sided anchors (currentCloseness about .65); the five requested ramps remain relatively permissive there. All other structure is fixed: +10/-8 caps; genuine .75, false-close .75, dominance .80; revival maximum 3; evidence .25-.75.',
    '',`Preferred for further validation: **${result.recommendation.preferred}**. ${result.recommendation.reason}`,
    '', 'The reference gate-10-65-wp-100 reproduces the previous slow-evidence configuration. The recommendation is report metadata only and does not enable a default.','',
    table(['Policy','Gate','Fallback confidence','Mean','Median','Mean delta','NHL mean delta'],result.configurations.map(c =>
      [c.policy.id,`${c.policy.gateStart}-${c.policy.gateEnd}`,c.policy.fallbackPositiveConfidence,c.overall.mean,c.overall.median,c.overall.meanDelta,c.sports.NHL.meanDelta])),
    '', '## Independently inspectable transformations','',
    'Existing sustained quality, coverage shrinkage, false-close, dominance and revival formulas remain intact. Raw sustained = 10 * smoothstep(.35,.95,sustainedQuality). Positive WP support = smoothstep(0,1,wpCoverageShare) * smoothstep(1,6,wpObservationCount) for positioned-WP telemetry, otherwise zero. Positive confidence = fallback + (1-fallback) * support. Adjusted sustained = raw sustained * positive confidence. Six positioned observations and full coverage reach full confidence; sparse observations or incomplete coverage transition smoothly. This count endpoint is a provisional adequacy guard, not a statistically fitted threshold.',
    '', 'Only sustained reward receives this confidence factor. Missing/singleton WP earns the fallback multiplier, never an independent negative missing-data term. Historical false-close and dominance discounts can still outweigh a smaller sustained reward. Revival is unchanged. No probability is extrapolated beyond observed coverage and no Phase 1 field is rewritten.',
    '', 'Raw trajectory = adjusted sustained + false-close + dominance + revival. Clamp to [-8,10], multiply by evidence smoothstep(.25,.75,end position), and multiply a positive net trajectory only by smoothstep(gateStart,gateEnd,existing Phase 2 currentCloseness). Negative net adjustments bypass the positive gate. Final candidate rating rounds/clamps base + live bonus + momentum + trajectory, preserving pre-clamp headroom.',
    '',table(['Current closeness',...result.configurations.filter(c => c.policy.fallbackPositiveConfidence === 1).map(c => c.policy.id)],
      [0,.3,.5,.65,.75,.85,.95,1].map(v => [v,...result.configurations.filter(c => c.policy.fallbackPositiveConfidence === 1).map(c => {
        const x = Math.max(0,Math.min(1,(v-c.policy.gateStart)/(c.policy.gateEnd-c.policy.gateStart)));
        return r(x*x*(3-2*x));
      })])),
    '', '## Phase 2 anchors: preferred versus reference','',
    table(['Anchor','Phase 2','Reference Phase 3','Preferred Phase 3','Preferred delta'],Object.entries(preferred.anchors).map(([k,a]) =>
      [k,a.baselineRating,reference.anchors[k].candidateRating,a.candidateRating,a.delta])),
    '',components(preferred.anchors),
    '', '## Synthetic histories','',
    table(['History','Reference adjustment','Preferred adjustment','Change'],Object.entries(preferred.archetypes).map(([k,a]) =>
      [k,r(reference.archetypes[k].adjustment),r(a.adjustment),r(a.adjustment-reference.archetypes[k].adjustment)])),
    '',components(preferred.archetypes),
    '', 'These are trajectory adjustments, not full ratings. Severe late comeback and chaos remain net-negative: Current Tension carries current drama, while trajectory retains prolonged poor-history discounts. Early evidence is zero. Missing and singleton WP remain equal, but below fully supported sustained uncertainty. Late blowout has zero positive history. Defensive and high-scoring sustained games retain comparable recognition.',
    '', '## NHL impact for every policy','',
    `NHL has ${preferred.coverage.NHL.states} states from ${preferred.coverage.NHL.games} games and zero positioned WP states. Every NHL state therefore uses its policy's fallback positive confidence. This leaves some scoreboard-continuity recognition while acknowledging that genuine uncertainty and false closeness cannot be distinguished reliably. No NHL-specific constants were introduced.`,
    '',table(['Policy','Fallback','NHL baseline mean','NHL candidate mean','NHL mean delta','Change from reference mean'],result.configurations.map(c =>
      [c.policy.id,c.policy.fallbackPositiveConfidence,c.sports.NHL.baselineMean,c.sports.NHL.mean,c.sports.NHL.meanDelta,r(c.sports.NHL.mean-reference.sports.NHL.mean)])),
    '', '## Evidence comparisons','',
    'High genuine / strong WP: genuineContinuity >= .75, positioned source, coverage >= .75, count >= 6. High margin / no WP: marginContinuity >= .75 and count 0. High margin / limited WP: marginContinuity >= .75 with observations but fallback source, coverage < .75 or count < 6 (includes singleton). One-sided after genuine adds current max WP >= .85; strongly uncertain after genuine adds current max WP <= .60. These are overlapping descriptive cohorts, not labelled truth.',
    '',stats(preferred.comparisons),
    '', '## Preferred replay distribution','',stats({overall:preferred.overall}),
    '',table(['Band','Count','Percent'],Object.entries(preferred.overall.bands).map(([k,v]) => [k,v.count,v.percentage])),
    '',crossings(preferred),'',stats(preferred.sports),'',stats({...preferred.progress,...preferred.groups,...preferred.buckets}),
    '', '## Largest preferred changes','',extremes(preferred),
    '', '## Coverage and unresolved validation','',
    table(['Sport','Games','States','Full states','Positioned WP','WP coverage >= 50%'],Object.entries(preferred.coverage).map(([s,c]) =>
      [s,c.games,c.states,c.fullStates,c.positionedWpStates,c.substantialWpStates])),
    '',...result.recommendation.concerns.map(x => `- ${x}`),
    '',`The narrow limited-WP bucket (coverage > 0 and < .25) has ${preferred.buckets.limitedWp.count} state(s); the broader high-margin sparse/partial-WP cohort has ${preferred.comparisons.highMarginLimitedWp.count}. Late revival has ${preferred.buckets.lateRevival.count} states across ${preferred.buckets.lateRevival.games} games.`,
    '', 'The two observed structural concerns are addressed by the preferred experimental policy: one-sided-current history is modest and unsupported positive sustained history cannot automatically equal fully observed genuine uncertainty. This does not establish optimal thresholds or promotion readiness. Add independent labelled defensive/high-scoring classics, false-close histories, competitive-to-blowout transitions, severe real/fake revivals, sparse observations spanning long intervals, and partial WP coverage across sports. NHL lacks positioned WP; Soccer/Tennis are absent; basketball/baseball samples are small. Keep trajectory opt-in pending expanded labelled fixtures.',
    '', '## Per-policy replay details','',
    'All candidates below include distribution, crossings, sport/progress/situation/trajectory views, explicit evidence cohorts, anchors, synthetic histories and largest changes. JSON also contains exact diagnostics and examples for each cohort.',
    ...result.configurations.flatMap(c => ['',`### ${c.policy.id}`,'',stats({overall:c.overall}),'',
      table(['Band','Count','Percent'],Object.entries(c.overall.bands).map(([k,v]) => [k,v.count,v.percentage])),
      '',crossings(c),'',stats(c.sports),'',stats({...c.progress,...c.groups,...c.buckets}),'',stats(c.comparisons),'',
      components(Object.fromEntries(Object.entries(c.comparisons).map(([k,v]) => [k,v.diagnostics]))),'',
      table(['Anchor','Phase 2','Candidate','Delta'],Object.entries(c.anchors).map(([k,a]) => [k,a.baselineRating,a.candidateRating,a.delta])),
      '',components(c.anchors),'',components(c.archetypes),'',extremes(c)]),
    '', 'Machine-readable results: [output/trajectory-calibration.json](output/trajectory-calibration.json).',''];
  return lines.join('\n');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await buildTrajectoryCalibration();
  assert.equal(result.states,24562,'Archive state count changed; investigate before accepting calibration');
  await mkdir(new URL('../calibration/output/',import.meta.url),{recursive:true});
  await writeFile(new URL('../calibration/output/trajectory-calibration.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  await writeFile(new URL('../calibration/trajectory-calibration-report.md',import.meta.url),renderTrajectoryReport(result));
  console.log(JSON.stringify({states:result.states,invariants:result.invariants,
    policies:result.configurations.map(c => ({id:c.policy.id,...c.overall}))},null,2));
}
