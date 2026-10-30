// Frozen historical reproduction; corrected evaluation lives in replay-input-comparison.mjs.
import {highFidelityCheckpoints} from './replay-inputs.historical.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {summarize} from './trajectory-calibration.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from './shadow-candidate-report.mjs';
import {pairedHistories,evidenceHistories,hockeyHistories,tinyMovementHistory,prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
import {trajectoryArchetypes} from '../calibration/trajectory-archetypes.mjs';
const require=createRequire(import.meta.url);
const shadow=require('../calibration/shadow-candidate.cjs');
const oracle=require('../test/helpers/phase31-oracle.cjs');
const {TRAJECTORY_POLICIES,trajectoryAdjustment}=require('../calibration/trajectory-policy.cjs');
const {LIVE_TRAJECTORY_POLICIES}=require('../calibration/trajectory-live-policy.cjs');
export const POLICIES=[null,TRAJECTORY_POLICIES.find(p=>p.id==='gate-10-65-wp-100'),
  TRAJECTORY_POLICIES.find(p=>p.id==='gate-45-95-wp-65'),...LIVE_TRAJECTORY_POLICIES];
const id=p=>p?.id||'phase2';
const round=x=>x==null?null:Number(x.toFixed(4));
const average=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const thresholds=[70,85,90,95];
export function summary(rows) {
  const base=summarize(rows);
  const games=Map.groupBy(rows,r=>r.eventId);
  base.thresholds=Object.fromEntries(thresholds.map(t=>[t,{baseline:rows.filter(r=>r.baselineRating>=t).length,
    candidate:rows.filter(r=>r.candidateRating>=t).length,up:rows.filter(r=>r.baselineRating<t&&r.candidateRating>=t).length,
    down:rows.filter(r=>r.baselineRating>=t&&r.candidateRating<t).length}]));
  return {...base,exact99:rows.filter(r=>r.candidateRating===99).length,baseline99:rows.filter(r=>r.baselineRating===99).length,
    meanDeltaFromExisting:round(average(rows.map(r=>r.deltaFromExisting))),
    equalGame:{mean:round(average([...games.values()].map(g=>average(g.map(r=>r.candidateRating))))),
      baselineMean:round(average([...games.values()].map(g=>average(g.map(r=>r.baselineRating))))),
      meanDelta:round(average([...games.values()].map(g=>average(g.map(r=>r.delta))))),
      thresholds:Object.fromEntries(thresholds.map(t=>[t,{baselineShare:round(average([...games.values()].map(g=>g.filter(r=>r.baselineRating>=t).length/g.length))),
        candidateShare:round(average([...games.values()].map(g=>g.filter(r=>r.candidateRating>=t).length/g.length)))}])),
      exact99Share:round(average([...games.values()].map(g=>g.filter(r=>r.candidateRating===99).length/g.length)))}};
}
function diagnostic(result) {
  return {candidateRating:result.score,base:result.baseScore,liveBonus:result.liveBonus,momentum:result.momentumPoints,
    currentWp:result.currentWinProbability,currentCloseness:result.state?.currentCloseness,
    trajectory:result.trajectory,trajectoryScoring:result.trajectoryScoring,
    historyOwnership:result.historyOwnership||null,sportImpact:result.live?.sportImpact,
    aggregation:result.live?.aggregation};
}
function syntheticResults(core) {
  const evaluate=input=>{
    const game=prepareSynthetic(input);
    return {present:input.competition,results:Object.fromEntries(POLICIES.map(p=>[id(p),
      diagnostic(shadow.candidateGameRating(core,game,input.competition,input.summary,null,p))]))};
  };
  const ablations={};
  for(const archetype of trajectoryArchetypes().filter(a=>['sustained','false-close','blowout','missing-wp','limited-wp'].includes(a.id))) {
    const p=LIVE_TRAJECTORY_POLICIES[1];
    const variants={all:p,noFalseClose:{...p,falseCloseWeight:0},noDominance:{...p,dominanceWeight:0},
      noExplicitPenalties:{...p,falseCloseWeight:0,dominanceWeight:0}};
    ablations[archetype.id]=Object.fromEntries(Object.entries(variants).map(([name,policy])=>
      [name,trajectoryAdjustment(archetype.telemetry,archetype.currentCloseness,policy)]));
    // Counterfactual removes only the WP reduction of quality; leave penalty
    // inputs unchanged. This is a contribution ablation, not fabricated WP.
    const d=ablations[archetype.id].all,t=archetype.telemetry;
    const q=p.genuineWeight*t.marginContinuity+(1-p.genuineWeight)*t.competitiveShare;
    const x=Math.max(0,Math.min(1,(q-.35)/.6));
    const reward=p.positiveCap*x*x*(3-2*x)*d.positiveWpConfidence;
    const raw=reward+d.falseCloseContribution+d.dominanceContribution;
    const bounded=Math.max(-p.negativeCap,Math.min(p.positiveCap,raw));
    ablations[archetype.id].noQualityReduction={...d,sustainedQuality:q,sustainedQualityContribution:p.positiveCap*x*x*(3-2*x),adjustedSustainedQualityContribution:reward,
      rawTrajectory:raw,boundedTrajectory:bounded,adjustment:bounded*d.evidenceWeight*(bounded>0?d.positiveCurrentStateGate:1)};
  }
  const tiny=tinyMovementHistory();
  const tinyResults=evaluate(tiny);
  const old=tinyResults.results[id(POLICIES[2])];
  return {pairs:Object.fromEntries(Object.entries(pairedHistories()).map(([k,v])=>[k,v.map(evaluate)])),
    evidence:Object.fromEntries(Object.entries(evidenceHistories()).map(([k,v])=>[k,evaluate(v)])),
    hockey:Object.fromEntries(Object.entries(hockeyHistories()).map(([k,v])=>[k,evaluate(v)])),
    tiny:tinyResults,revivalAblation:{withRevival:old.trajectoryScoring,
      withoutRevival:trajectoryAdjustment(old.trajectory,old.currentCloseness,{...POLICIES[2],revivalPoints:0})},ablations};
}
export async function buildLiveCalibration() {
  const core=await loadCore(),fixtures=loadFixtures(),rows=POLICIES.map(()=>[]);
  const phase2=JSON.parse(await readFile(new URL('../calibration/output/current-tension-calibration.json',import.meta.url)));
  const anchors=phase2.configurations.find(c=>c.id==='modifier-65-35-c34').anchors;
  const anchorIds=new Set(Object.values(anchors).map(a=>a.stateId));
  let states=0,independentChecks=0;
  for(const fixture of fixtures) {
    const checkpoints=highFidelityCheckpoints(fixture);
    for(const [index,cp] of checkpoints.entries()) {
      const prepared=prepareCheckpointEvaluation(core,fixture,cp,index);
      if(!prepared) continue;
      const all=shadow.candidateTrajectoryRatings(core,prepared.game,cp.competition,cp.summary,POLICIES);
      const baseline=all[0],existing=all[2],stateId=`${fixture.eventId}:${cp.play.id||index}`;
      assert.deepEqual(baseline,oracle.candidateGameRating(core,prepared.game,cp.competition,cp.summary),'trajectory-off frozen parity');
      for(const [i,result] of all.entries()) {
        assert.deepEqual(result.state,baseline.state);
        assert.deepEqual(result.live,baseline.live,'raw sport/event components and live aggregation unchanged');
        assert.deepEqual(result.trajectory,baseline.trajectory);
        assert.equal(result.baseScore,baseline.baseScore);
        assert.equal(result.score,core.clampScore(result.baseScore+result.liveBonus+result.momentumPoints+result.trajectoryScoring.adjustment));
        if(POLICIES[i]?.liveOwnership) {
          const h=result.historyOwnership,d=result.trajectoryScoring;
          assert.equal(result.momentumPoints,h.eventPoints);
          assert.ok(Math.abs(h.combinedPoints-h.eventPoints-d.positiveAfterHistoryCaps)<1e-9);
          assert.ok(d.negativeAfterFloor<=0 && d.negativeAfterFloor>=d.negativeAfterTaper);
          assert.equal(d.lateRevivalContribution,0);
          assert.ok(!h.eventFactors.some(f=>['Sustained competitive game','Time tied or within one goal'].includes(f.label)));
        } else assert.equal(result.momentumPoints,baseline.momentumPoints);
        const decisive=Math.max(result.live.aggregation.driveFloor||0,result.live.sportImpact.competitiveFloor||0)>0;
        rows[i].push({eventId:String(fixture.eventId),stateId,sport:fixture.modelSport,progress:result.progress,
          decisive,score:cp.competition.competitors.map(c=>c.score).join('-'),
          baselineRating:baseline.score,existingRating:existing.score,delta:result.score-baseline.score,
          deltaFromExisting:result.score-existing.score,...diagnostic(result)});
        if(anchorIds.has(stateId)||[0,Math.floor(checkpoints.length/2),checkpoints.length-1].includes(index)) {
          assert.deepEqual(result,shadow.candidateGameRating(core,prepared.game,cp.competition,cp.summary,null,POLICIES[i]));
          if(i===1||i===2) assert.deepEqual(result,oracle.candidateGameRating(core,prepared.game,cp.competition,cp.summary,null,POLICIES[i]));
          independentChecks++;
        }
      }
      assertPreparedCheckpointUnchanged(prepared);
      states++;
    }
    console.log(`${fixture.modelSport} ${fixture.eventId}: ${states} states`);
  }
  const configs=POLICIES.map((policy,i)=>{
    const data=rows[i];
    return {id:id(policy),policy,overall:summary(data),sports:Object.fromEntries([...new Set(fixtures.map(f=>f.modelSport))].map(s=>[s,summary(data.filter(r=>r.sport===s))])),
      groups:{decisive:summary(data.filter(r=>r.decisive)),neutral:summary(data.filter(r=>!r.decisive&&r.sportImpact.points===0)),
        specific:summary(data.filter(r=>!r.decisive&&r.sportImpact.points>0))},
      progress:Object.fromEntries([['0-25%',0,.25],['25-50%',.25,.5],['50-75%',.5,.75],['75-90%',.75,.9],['90%+',.9,Infinity]].map(([k,a,b])=>[k,summary(data.filter(r=>r.progress>=a&&r.progress<b))])),
      anchors:Object.fromEntries(Object.entries(anchors).map(([k,a])=>[k,data.find(r=>r.stateId===a.stateId)])),
      ownership:{statesWithReallocatedHistory:data.filter(r=>r.historyOwnership?.replacedPoints!==0&&r.historyOwnership).length,
        meanReplaced:round(average(data.map(r=>r.historyOwnership?.replacedPoints||0))),
        statesPositiveCapped:data.filter(r=>r.historyOwnership?.positiveLimitedByCaps>1e-9).length,
        statesNegativeTapered:data.filter(r=>r.trajectoryScoring.negativeMultiplier<1&&r.trajectoryScoring.negativeAfterTaper<0).length,
        statesFloorProtected:data.filter(r=>r.trajectoryScoring.negativeAfterFloor>r.trajectoryScoring.negativeAfterTaper).length},
      largestIncreases:[...data].sort((a,b)=>b.delta-a.delta).slice(0,10),largestDecreases:[...data].sort((a,b)=>a.delta-b.delta).slice(0,10),
      largestDecisiveDecreases:data.filter(r=>r.decisive).sort((a,b)=>a.delta-b.delta).slice(0,10)};
  });
  return {version:'3.1',states,evaluations:states*POLICIES.length,independentChecks,
    invariants:{offParityStates:states,offMismatches:0,rawSportEventMismatches:0,batchMismatches:0,
      implicitTrajectoryDefault:null,phase2Policy:shadow.DEFAULT_CURRENT_TENSION_POLICY,productionChanged:false},
    promotionReady:false,selectedPolicy:null,synthetic:syntheticResults(core),configurations:configs,
    gates:Object.fromEntries(POLICIES.filter(Boolean).map(p=>[p.id,Object.fromEntries([0,.1,.4,.65,.75,.9,1].map(v=>{
      const x=Math.max(0,Math.min(1,(v-p.gateStart)/(p.gateEnd-p.gateStart)));return [v,round(x*x*(3-2*x))];}))]))};
}
const table=(headers,rows)=>[headers.join(' | '),headers.map(()=>'---').join(' | '),...rows.map(r=>r.map(v=>v??'').join(' | '))].join('\n');
export function renderLiveReport(r) {
  const ids=r.configurations.map(c=>c.id), revised=ids.filter(x=>x.startsWith('live-'));
  const s=r.synthetic;
  const compare=items=>table(['Fixture',...ids],Object.entries(items).map(([k,v])=>[k,...ids.map(id=>v.results[id].candidateRating)]));
  const distribution=entries=>table(['View','States','Games','Checkpoint mean','Equal-game mean','Mean delta','Equal-game delta','Delta vs existing','99 count'],
    Object.entries(entries).map(([k,v])=>[k,v.count,v.games,v.mean,v.equalGame.mean,v.meanDelta,v.equalGame.meanDelta,v.meanDeltaFromExisting,v.exact99]));
  const diagnostic=entries=>table(['Case','Source / coverage / count','Raw sustained','Confidence','Adjusted sustained','False-close','Dominance','Revival','Requested positive','Positive after caps','Negative after taper / floor','History removed (net)','Final'],
    Object.entries(entries).map(([k,v])=>{const d=v.trajectoryScoring,t=v.trajectory,h=v.historyOwnership;return [k,
      `${t.genuineContinuitySource} / ${round(t.wpCoverageShare)} / ${t.wpObservationCount}`,round(d.sustainedQualityContribution),round(d.positiveWpConfidence),round(d.adjustedSustainedQualityContribution),
      round(d.falseCloseContribution),round(d.dominanceContribution),round(d.lateRevivalContribution),round(d.requestedPositive),round(d.positiveAfterHistoryCaps),
      `${round(d.negativeAfterTaper)} / ${round(d.negativeAfterFloor)}`,h?.replacedPoints,v.candidateRating];}));
  return ['# Phase 3.1 ownership and live recommendation guardrails','',
    'Experimental only. Production/default Phase 2/completed scoring unchanged. Trajectory remains explicit opt-in. Existing Phase 3 policies and reports are retained byte-for-byte. No configuration is promoted or selected as an accuracy winner. No staging, commit, deployment or push.','',
    `Authoritative replay: ${r.states} states across 107 games; ${r.evaluations} direct-path finalizations; ${r.independentChecks} independent complete checks. Frozen pre-task shadow oracle agrees at all ${r.invariants.offParityStates} trajectory-off states; raw sport/event/live-aggregation and batch mismatches are zero.`,
    '', 'See [ownership audit](trajectory-history-ownership.md) for all sports, caps, retained event ownership and required pre-existing helper dependencies.','',
    '## Corrected calculation','',
    'Revised candidates remove only the live sustained factor BEFORE history caps. Discrete event factors retain their original order and formulas; reclaimed capacity can flow to later event evidence. Positive net trajectory enters the same history cap after event factors (shared 15; NHL 12 and its original regulation/OT/shootout headroom). The sport live bonus is recomputed by the existing direct path and stays unchanged; history aggregation intentionally changes. Never subtract a nominal factor from a capped score.',
    '', 'Both revised candidates use the retained +10/-8 structural family, .25-.75 maturity, and 65% margin-only positive confidence. Gates are .35-.85 and .45-.95. Separate revival award is zero, with late-movement/revival diagnostics retained. Positive effective gate is max(current-closeness gate, 0.5 * decisiveStrength). This modest support comes from validated sport leverage, not a second WP multiplier.',
    '', 'decisiveStrength = max(existing decisive-drive urgency, final-possession urgency, clamp(existing floor increment / 20)). The denominator is the existing ordinary competitive-situation cap. Negative trajectory multiplier = 1 - .75 * decisiveStrength, leaving 25% at full strength. Its remaining penalty cannot take a rating below base + the existing floor increment. A floor increment is not an absolute 85/90 target. Only trajectory penalties are constrained; this cannot create positive points or erase unrelated penalties.',
    '', '## Gate behavior (before decisive support)','',table(['Closeness',...ids.slice(1)],[0,.1,.4,.65,.75,.9,1].map(v=>[v,...ids.slice(1).map(id=>r.gates[id][v])])),
    '', '## Same-present paired histories','',compare(Object.fromEntries(Object.entries(s.pairs).flatMap(([k,pair])=>pair.map((v,i)=>[`${k}: ${i?'poor / false-close':'classic / competitive'}`,v])))),
    '', 'Within each pair, score, clock, possession, field position, current WP, current non-scoring event, teams and stakes are identical. Tests verify identical Current Tension, raw sport situations, pressure, milestones and event shocks. Earlier lead/comeback evidence is intentionally retained and can differ. These synthetic constraints test mechanics, not historical accuracy.',
    ...revised.flatMap(id=>['',`### Pair diagnostics: ${id}`,'',diagnostic(Object.fromEntries(Object.entries(s.pairs).flatMap(([k,pair])=>pair.map((v,i)=>[`${k}-${i}`,v.results[id]]))))]),
    '', '## NHL regulation / OT / shootout','',compare(s.hockey),
    '', 'Quiet tied regulation at <=15 seconds has zero history headroom; fresh tying/go-ahead events permit up to five. Regular-season OT permits 94 minus its existing current target; shootout permits two. Revised trajectory uses these same budgets after preserved events. Playoff OT retains its existing separate behavior. Existing Phase 3 adds trajectory after these budgets and can bypass them.',
    ...revised.flatMap(id=>['',`### NHL diagnostics: ${id}`,'',diagnostic(Object.fromEntries(Object.entries(s.hockey).map(([k,v])=>[k,v.results[id]])))]),
    '', '## Evidence variants','',compare(s.evidence),
    '', 'Full/missing/singleton/early-only/late-only/sparse variants reuse identical score history. Missing and stale early-only WP also change current-WP availability under the unchanged validator; the JSON reports currentCloseness and currentWp to keep that effect distinct from history confidence. No absent data is replaced with 50/50.',
    '', 'The current Phase 1 representation interpolates between positioned observations and has no discontinuous-gap metadata. The internalGap case removes intermediate observations but still reports full endpoint coverage; it is NOT proof of observed uncertainty inside the gap. Count confidence limits sparse cases, but does not resolve this representation limitation. No fake gap support or probability extrapolation was added.',
    ...revised.flatMap(id=>['',`### Evidence diagnostics: ${id}`,'',diagnostic(Object.fromEntries(Object.entries(s.evidence).map(([k,v])=>[k,v.results[id]])))]),
    '', '## Revival and internal overlap ablations','',
    `Tiny late WP changes total 0.00002 probability movement and concentrate ${round(s.tiny.results[ids[2]].trajectory.lateMovementShare)} of all movement late. Existing revival contribution: ${round(s.revivalAblation.withRevival.lateRevivalContribution)}; same trajectory with revival disabled: ${round(s.revivalAblation.withoutRevival.lateRevivalContribution)}. Revised policies award zero separate revival, retaining discrete event credit.`,
    '',table(['Archetype','Ablation','Sustained after confidence','False-close','Dominance','Raw','Adjustment'],Object.entries(s.ablations).flatMap(([k,a])=>Object.entries(a).map(([name,d])=>[k,name,round(d.adjustedSustainedQualityContribution),round(d.falseCloseContribution),round(d.dominanceContribution),round(d.rawTrajectory),round(d.adjustment)]))),
    '', 'Quality reduction, false-close and dominance are correlated responses to one-sided WP, not three independent observations. The ablations expose their additive effect: removing a penalty is materially different from restoring quality. Their raw sum is bounded at -8 before evidence/urgency protection. This task retains those weights; the unlabelled archive cannot establish whether both penalties are needed. Treat this internal overlap as a remaining calibration limitation, not independent corroboration.',
    '', '## Replay summary','',distribution(Object.fromEntries(r.configurations.map(c=>[c.id,c.overall]))),
    '', 'Checkpoint means weight long/dense games more. Equal-game means first average each game and then weight the 107 games equally. JSON includes equal-game threshold shares and exact-99 shares. This is sensitivity reporting, not a quality objective.',
    '',table(['Anchor',...ids],Object.keys(r.configurations[0].anchors).map(k=>[k,...r.configurations.map(c=>c.anchors[k].candidateRating)])),
    '', 'Anchor scores are not pinned to Phase 2. For example, the .45-.95 CFB one-sided anchor replaces three old sustained points with about 3.04 recalculated trajectory points. The uncertain NFL anchor already has 15 retained event points, leaving no trajectory headroom; its unchanged 74 follows the existing budget. The uncertain CFB anchor has five points of remaining event-history capacity and reaches 88. These changes follow ownership and caps, not desired final scores.',
    ...revised.flatMap(id=>['',`### Anchor ownership: ${id}`,'',diagnostic(r.configurations.find(c=>c.id===id).anchors)]),
    '', 'The replay decisive group includes ANY positive sport floor increment, including weak increments of only two to six points; it is broader than the fully urgent synthetic possession. Its largest decreases include removal of three overlapping sustained points plus a partially tapered penalty. The JSON exposes floor increments and taper strength for those states. Fully supported urgent states retain at most 25% of the trajectory penalty and preserve their sport floor. Both decisive paired finals saturate at 99; their raw components, including the -1.81 poor-history adjustment, are reported to avoid treating saturation as proof of protection.',
    ...r.configurations.flatMap(c=>['',`## ${c.id}`,'',distribution({overall:c.overall,...c.sports,...c.groups,...c.progress}),
      '',table(['Threshold','Baseline','Candidate','Up','Down','Equal-game baseline share','Equal-game candidate share'],Object.entries(c.overall.thresholds).map(([t,v])=>[t,v.baseline,v.candidate,v.up,v.down,c.overall.equalGame.thresholds[t].baselineShare,c.overall.equalGame.thresholds[t].candidateShare])),
      '',`Ownership/guardrails: ${JSON.stringify(c.ownership)}.`,
      '',table(['Extreme','State','Sport','Phase 2','Existing Phase 3','Candidate','Delta'],[['increase',c.largestIncreases],['decrease',c.largestDecreases],['decisive decrease',c.largestDecisiveDecreases]].flatMap(([label,rows])=>rows.map(v=>[label,v.stateId,v.sport,v.baselineRating,v.existingRating,v.candidateRating,v.delta])))]),
    '', '## Limitations and checkpoint dependencies','',
    'No accuracy winner is selected. Both revised gates pass targeted semantics, but the archive lacks labelled history quality and robust revival/partial-WP cases. NHL has no positioned WP; Soccer/Tennis have no archived replay; NBA/NCAAB/MLB samples remain small. Synthetic examples establish invariants only. Historical stagnation and discrete-event awards remain owned by existing sport/event logic; this task does not redesign Peak Drama or fit penalty weights.',
    '', 'Any checkpoint must include the preserved shared aggregateLiveBonus extraction (pressure.js plus rating-core.js caller), basketball candidatePoints separation, NHL elapsed-clock telemetry corrections in probability.js/trajectory.js, the shadow replay helpers and Phase 3 policy/telemetry baseline. These are required dependencies, not unrelated changes merely because they predate this task. See the ownership audit for precise roles.',
    '', '## Validation record','',r.validation ? `${r.validation.repositoryTests} distinct repository tests passed across the full suite and targeted additions/reruns; Worker bundling passed after the sandbox directory-access restriction was removed for that test. Scoring/watchlist/timeline fixtures, syntax checks and git diff --check passed. Existing Phase 3 baselines and all pre-existing files outside the three intentional edits matched their initial SHA256 hashes.` : 'Replay assertions are included above. Repository test results are recorded after running validation.',
    ...(r.validation ? ['',table(['Phase 3.1 change','File'],r.validation.changedFiles.map(f=>[f.kind,f.path]))] : []),
    '', 'Machine-readable results: [output/trajectory-live-calibration.json](output/trajectory-live-calibration.json).',''].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const result=await buildLiveCalibration();
  assert.equal(result.states,24562);
  await writeFile(new URL('../calibration/output/trajectory-live-calibration.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  await writeFile(new URL('../calibration/trajectory-live-calibration-report.md',import.meta.url),renderLiveReport(result));
  console.log(JSON.stringify({states:result.states,invariants:result.invariants,configurations:result.configurations.map(c=>({id:c.id,overall:c.overall}))},null,2));
}
