import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {historicalFixtureSha256} from '../calibration/fixture-provenance.mjs';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {loadCore,loadFixtures,listFixtureFiles,repoRoot} from '../calibration/helpers.mjs';
import {replayCheckpoints,INPUT_PIPELINE_VERSION} from './replay-inputs.mjs';
import {highFidelityCheckpoints as historicalCheckpoints} from './replay-inputs.historical.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from './shadow-candidate-report.mjs';
import {POLICIES,publicInput,renderReviewerPack} from './trajectory-review-pack.mjs';
const require=createRequire(import.meta.url),shadow=require('../calibration/shadow-candidate.cjs');
const oracle=require('../test/helpers/phase31-oracle.cjs');
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const write=(p,v)=>writeFileSync(new URL(p,root),JSON.stringify(v,null,2)+'\n');
const sid=(f,c)=>`${f.eventId}:${c.play.id}`;
const ids=a=>a.map(p=>String(p.id));
const input=c=>[c.event,c.competition,c.summary];
const scores=c=>Object.fromEntries(c.competition.competitors.map(t=>[t.homeAway,Number(t.score)]));
const round=n=>n==null?null:Number(n.toFixed(4));
const mean=a=>a.length?a.reduce((a,b)=>a+b,0)/a.length:null;
const thresholds=[70,80,85,90,99];
const labels=POLICIES.map(p=>p.label);

// New evaluations identify the source bytes they actually use. Historical
// artifacts retain their own records and are verified separately by the tests.
export function currentSourceHashes() {
  return ['scripts/replay-inputs.mjs','scripts/replay-inputs.historical.mjs','scripts/replay-input-comparison.mjs',
    'calibration/shadow-candidate.cjs','calibration/trajectory-policy.cjs','calibration/trajectory-live-policy.cjs',
    'calibration/trajectory-checkpoint-manifest.json','rating-core.js',
    ...require('../test/helpers/scoring-source.cjs').legacyScripts]
    .map(path=>({path,sha256:hash(read(path))}));
}

function membership(a,b) {
  const aa=new Set(a),bb=new Set(b);
  return {before:a.length,after:b.length,added:b.filter(x=>!aa.has(x)),removed:a.filter(x=>!bb.has(x)),orderChanged:hash(a)!==hash(b)};
}
function inputChanges(a,b) {
  const change={};
  for(const [name,aa,bb] of [['score',scores(a),scores(b)],['situation',a.competition.situation,b.competition.situation]])
    if(hash(aa)!==hash(bb))change[name]={before:aa,after:bb};
  for(const field of ['plays','scoringPlays']) {
    const m=membership(ids(a.summary[field]),ids(b.summary[field]));
    if(m.orderChanged)change[field]=m;
  }
  if(hash(a.summary.winprobability)!==hash(b.summary.winprobability))change.wp={
    ...membership(a.summary.winprobability.map(w=>String(w.playId??hash(w))),b.summary.winprobability.map(w=>String(w.playId??hash(w)))),
    latestBefore:a.summary.winprobability.at(-1)??null,latestAfter:b.summary.winprobability.at(-1)??null};
  if(hash(a.summary.drives??null)!==hash(b.summary.drives??null))change.partialDrives={before:hash(a.summary.drives??null),after:hash(b.summary.drives??null)};
  return change;
}

export function scanFixtures(fixtures=loadFixtures()) {
  const games=[];
  for(const [fi,f] of fixtures.entries()) {
    const old=historicalCheckpoints(f),r=replayCheckpoints(f),previous=new Map(old.map(c=>[String(c.play.id),c])),current=new Map(r.checkpoints.map(c=>[String(c.play.id),c]));
    const excluded=new Set(r.exclusions.map(e=>e.playId));
    const changes=r.checkpoints.flatMap(c=>{
      const before=previous.get(String(c.play.id));if(!before)return [];
      const changes=inputChanges(before,c);
      return Object.keys(changes).length?[{stateId:sid(f,c),changes}]:[];
    });
    const transitionRepairs=r.situations.filter(s=>{
      const old=previous.get(s.playId)?.competition.situation;
      return old&&Object.keys(old).length&&hash(old)!==hash(s.situation);
    }).map(s=>({stateId:`${f.eventId}:${s.playId}`,state:s.state,reason:s.reason,
      classification:/unresolved/.test(s.state)?'confirmed-unsupported-projection; current-situation-unresolved':'validated-transition-or-scrimmage'}));
    const confirmed=[...new Set(r.repairs.map(e=>e.playId))];
    games.push({eventId:String(f.eventId),sport:f.modelSport,source:f.source,capturedAt:f.capturedAt,
      sourceRecords:r.sourceCount,before:old.length,after:r.checkpoints.length,
      orderingRepairs:r.repairs,transitionRepairs,exclusions:r.exclusions.map(e=>({...e,stateId:`${f.eventId}:${e.playId}`})),
      confirmedRepairablePlayIds:confirmed,unresolvedPlayIds:[...excluded],
      unaffectedPlayIds:r.stream.filter(e=>!confirmed.includes(String(e.play.id))&&!transitionRepairs.some(t=>t.stateId===`${f.eventId}:${e.play.id}`)).map(e=>String(e.play.id)),
      added:r.checkpoints.filter(c=>!previous.has(String(c.play.id))).map(c=>sid(f,c)),
      removed:old.filter(c=>!current.has(String(c.play.id))&&!excluded.has(String(c.play.id))).map(c=>sid(f,c)),
      excludedCheckpoints:old.filter(c=>excluded.has(String(c.play.id))).map(c=>sid(f,c)),changes});
    if((fi+1)%10===0)console.log(JSON.stringify({scannedGames:fi+1,total:fixtures.length}));
  }
  const countDefect=(records,key)=>{
    const reasons=[...new Set(games.flatMap(g=>g[records].map(e=>e[key])))];
    return Object.fromEntries(reasons.map(reason=>[reason,{games:games.filter(g=>g[records].some(e=>e[key]===reason)).length,
      records:games.reduce((n,g)=>n+new Set(g[records].filter(e=>e[key]===reason).map(e=>e.playId??e.stateId)).size,0)}]));
  };
  return {inputPipelineVersion:INPUT_PIPELINE_VERSION,pipelineSha256:hash(read('scripts/replay-inputs.mjs')),fixtures:fixtures.length,
    fixtureHashes:listFixtureFiles().map(file=>{const path=file.slice(repoRoot.length+1).replaceAll('\\','/');return {path,sha256:historicalFixtureSha256(path)};}),
    summary:{before:games.reduce((n,g)=>n+g.before,0),after:games.reduce((n,g)=>n+g.after,0),
      ordering:countDefect('orderingRepairs','reason'),situation:countDefect('transitionRepairs','reason'),unresolved:countDefect('exclusions','reason'),
      gamesWithOrderingRepairs:games.filter(g=>g.orderingRepairs.length).length,
      gamesWithSituationRepairs:games.filter(g=>g.transitionRepairs.length).length,
      gamesWithExclusions:games.filter(g=>g.exclusions.length).length,
      added:games.reduce((n,g)=>n+g.added.length,0),removed:games.reduce((n,g)=>n+g.removed.length,0),excludedCheckpoints:games.reduce((n,g)=>n+g.excludedCheckpoints.length,0)},games};
}

function compact(r) {
  const d=r.trajectoryScoring,a=r.live?.aggregation||{},s=r.live?.sportImpact||{};
  return {score:r.score,preClamp:r.baseScore+r.liveBonus+r.momentumPoints+d.adjustment,
    currentTension:r.currentTensionPoints,genericLeverage:r.genericLeveragePoints,currentWp:r.currentWinProbability,
    situationPoints:r.live?.components?.situation??0,competitiveFloor:s.competitiveFloor||0,driveFloor:a.driveFloor||0,
    decisiveDrive:Boolean(s.decisiveDrive),finalPossession:Boolean(s.finalPossession),
    decisiveStrength:d.decisiveStrength??null,negativeMultiplier:d.negativeMultiplier??null,
    trajectoryAdjustment:d.adjustment,momentum:r.momentumPoints};
}
function stats(rows,getBefore,getAfter) {
  const valid=rows.filter(r=>getBefore(r)!=null&&getAfter(r)!=null);
  const groups=Map.groupBy(valid,r=>r.eventId);
  const old=valid.map(getBefore),next=valid.map(getAfter);
  return {count:valid.length,games:groups.size,checkpointWeighted:{before:round(mean(old)),after:round(mean(next)),delta:round(mean(valid.map(r=>getAfter(r)-getBefore(r))))},
    equalGame:{before:round(mean([...groups.values()].map(g=>mean(g.map(getBefore))))),after:round(mean([...groups.values()].map(g=>mean(g.map(getAfter))))),
      delta:round(mean([...groups.values()].map(g=>mean(g.map(r=>getAfter(r)-getBefore(r))))))},
    exact99:{before:old.filter(n=>n===99).length,after:next.filter(n=>n===99).length},
    thresholds:Object.fromEntries(thresholds.map(t=>[t,{before:old.filter(n=>n>=t).length,after:next.filter(n=>n>=t).length,
      up:valid.filter(r=>getBefore(r)<t&&getAfter(r)>=t).length,down:valid.filter(r=>getBefore(r)>=t&&getAfter(r)<t).length,
      equalGameBeforeShare:round(mean([...groups.values()].map(g=>g.filter(r=>getBefore(r)>=t).length/g.length))),
      equalGameAfterShare:round(mean([...groups.values()].map(g=>g.filter(r=>getAfter(r)>=t).length/g.length)))}]))};
}

export async function compare(scope) {
  const core=await loadCore(),fixtures=loadFixtures(),rows=[];
  const review=JSON.parse(read('calibration/trajectory-diagnostic-key.corrected.json'));
  review.version=3;review.correction={inputPipelineVersion:INPUT_PIPELINE_VERSION,scoringRerun:true,policyChanges:false,
    basis:'Same corrected checkpoint for all five frozen policies. Retrospective retained captures; no real-time revision history.'};
  const invariants={identicalInputs:0,offScorerParity:0,unchangedInputReuse:0};
  const evaluate=(f,c)=>{
    const prepared=prepareCheckpointEvaluation(core,f,c,0);
    const results=shadow.candidateTrajectoryRatings(core,prepared.game,c.competition,c.summary,POLICIES.map(p=>p.policy));
    assertPreparedCheckpointUnchanged(prepared);
    assert.deepEqual(results[0],oracle.candidateGameRating(core,prepared.game,c.competition,c.summary));
    invariants.offScorerParity++;invariants.identicalInputs++;
    return Object.fromEntries(results.map((r,i)=>[labels[i],r]));
  };
  for(const [fi,f] of fixtures.entries()) {
    const old=historicalCheckpoints(f),fresh=replayCheckpoints(f).checkpoints;
    const aa=new Map(old.map(c=>[String(c.play.id),c])),bb=new Map(fresh.map(c=>[String(c.play.id),c]));
    const excluded=new Set(scope.games.find(g=>g.eventId===String(f.eventId)).excludedCheckpoints);
    for(const playId of new Set([...aa.keys(),...bb.keys()])) {
      const a=aa.get(playId),b=bb.get(playId),stateId=`${f.eventId}:${playId}`;
      const beforeHash=a?hash(input(a)):null,afterHash=b?hash(input(b)):null;
      const before=a?evaluate(f,a):null;
      // The historical and corrected objects are byte-identical here, including
      // the complete accepted prefix. Reuse this deterministic five-policy batch.
      const identical=a&&b&&beforeHash===afterHash;
      const after=identical?before:b?evaluate(f,b):null;
      if(identical)invariants.unchangedInputReuse++;
      const row={eventId:String(f.eventId),sport:f.modelSport,stateId,
        membership:a&&b?'matched':b?'added':excluded.has(stateId)?'excluded':'removed',
        beforeInputHash:beforeHash,afterInputHash:afterHash,
        before:before?Object.fromEntries(Object.entries(before).map(([k,v])=>[k,compact(v)])):null,
        after:after?Object.fromEntries(Object.entries(after).map(([k,v])=>[k,compact(v)])):null};
      rows.push(row);
      const c=review.cases.find(c=>c.provenance.eventId===String(f.eventId)&&c.provenance.playId===playId);
      if(c) {
        c.previousResults=c.results;c.results=after;c.comparison=row;
        c.provenance.inputPipelineVersion=INPUT_PIPELINE_VERSION;
        c.provenance.fixture=scope.fixtureHashes.find(p=>p.path.endsWith(`-${f.eventId}.json`));
        c.provenance.checkpointHash=b?hash(input(b)):null;
        c.provenance.acceptedPlayIds=b?ids(b.summary.plays):[];
        delete c.provenance.index;
        const verified=c.reviewAudit.verifiedContext,unverified=c.reviewAudit.unverifiedInputs;
        c.reviewAudit={verifiedContext:verified,unverifiedInputs:unverified,
          status:!b?'excluded: unresolved replay contradiction':b.situationValidation?.state.startsWith('unresolved')?'excluded: current football situation unresolved':b.excludedHistory.length?'excluded from confident judgment: incomplete earlier history':'eligible with stated unknowns',
          issues:!b?['No supported checkpoint survives input validation.']:b.missingSituationFields,
          ...(b?.situationValidation?{situationValidation:b.situationValidation}:{}),excludedHistory:b?.excludedHistory??[]};
        if(b) {
          c.public=publicInput({sport:f.modelSport,competition:b.competition,summary:b.summary},after['Phase 2'].currentWinProbability,b.missingSituationFields);
          c.public.unknowns.push(...unverified);
        } else {
          // Preserve identity/clock for locating an excluded card, never show stale
          // faulty possession/history/WP as if it came from corrected inputs.
          c.public={...c.public,situation:{},scoringUpdates:[],totalScoringUpdates:0,latestUsableHomeWp:null,
            observedHomeWpRange:null,positionedWpObservations:0,unknowns:['Excluded: no supported corrected checkpoint. Score/clock below are identifiers from the retained record, not validated live state.']};
        }
      }
    }
    if((fi+1)%10===0)console.log(JSON.stringify({evaluatedGames:fi+1,total:fixtures.length,states:rows.length}));
  }
  const matched=rows.filter(r=>r.membership==='matched'),corrected=rows.filter(r=>r.after);
  const comparisons=Object.fromEntries(labels.map(label=>[label,{
    inputEffect:stats(matched,r=>r.before[label].score,r=>r.after[label].score),
    policyEffectOnCorrectedInputs:stats(corrected,r=>r.after['Phase 2'].score,r=>r.after[label].score),
    allOld:stats(rows.filter(r=>r.before),r=>r.before[label].score,r=>r.before[label].score),
    allNew:stats(corrected,r=>r.after[label].score,r=>r.after[label].score),
    decisiveChanges:matched.filter(r=>['competitiveFloor','driveFloor','decisiveDrive','finalPossession','decisiveStrength','negativeMultiplier'].some(k=>r.before[label][k]!==r.after[label][k])).map(r=>({stateId:r.stateId,before:r.before[label],after:r.after[label]}))}]));
  const result={inputPipelineVersion:INPUT_PIPELINE_VERSION,policies:POLICIES,selectedPolicy:null,promotionReady:false,
    scopeSummary:scope.summary,fixtureHashes:scope.fixtureHashes,invariants,
    membership:Object.fromEntries(['matched','added','removed','excluded'].map(k=>[k,rows.filter(r=>r.membership===k).map(r=>r.stateId)])),
    comparisons,anchors:review.cases.filter(c=>c.provenance.eventId).map(c=>({id:c.id,stateId:`${c.provenance.eventId}:${c.provenance.playId}`,status:c.reviewAudit.status,...c.comparison})),
    perSport:Object.fromEntries([...new Set(rows.map(r=>r.sport))].map(sport=>[sport,Object.fromEntries(labels.map(label=>[label,stats(matched.filter(r=>r.sport===sport),r=>r.before[label].score,r=>r.after[label].score)]))])),
    limitations:['Retrospective captures establish event ordering support, not original publication time, live availability, or revision history.',
      'Ambiguous score intervals and chronology records are excluded, not fixed by monotonic score clamping. Later complete consistent scoring snapshots restart evaluation with explicit incomplete-history flags.',
      'Time-only WP waits until a strictly later game clock. Linked WP for excluded or future plays is never admitted.',
      'All 107 retained fixtures scanned; only six sports have replay records. These are diagnostic comparisons, not accuracy labels.',
      'No production input validator was enabled. Existing shared football scoring still trusts callers with malformed possession/field-position inputs.'],
    sourceHashes:currentSourceHashes(),
    oldStagingManifestValidatesRepair:false};
  writeFileSync(new URL('calibration/output/replay-input-states.v2.json.gz',root),gzipSync(JSON.stringify(rows)+'\n'));
  write('calibration/output/replay-input-comparison.v2.json',result);
  write('calibration/trajectory-diagnostic-key.replay-v2.json',review);
  let pack=renderReviewerPack(review).replace('# Blind live-watchability review','# Corrected replay v2 blind review');
  for(const c of review.cases) {
    const heading=`## ${c.id} - ${c.public.sport} - ${c.kind}${c.matchGroup?` - matched group ${c.matchGroup}`:''}`;
    pack=pack.replace(heading,`${heading}\n\nReview suitability: ${c.reviewAudit.status}.\n\nVerified context: ${c.reviewAudit.verifiedContext.join(' ')||'No additional context verified.'}`);
  }
  writeFileSync(new URL('calibration/trajectory-reviewer-pack.replay-v2.md',root),pack);
  writeFileSync(new URL('calibration/replay-input-comparison.v2.md',root),renderReport(result));
  return result;
}

export function renderReport(r) {
  const table=(heads,rows)=>[heads.join(' | '),heads.map(()=>'---').join(' | '),...rows.map(v=>v.join(' | '))].join('\n');
  return ['# Corrected replay input comparison v2','',
    `All ${r.fixtureHashes.length} retained fixtures scanned. ${r.scopeSummary.before} historical checkpoints; ${r.scopeSummary.after} corrected checkpoints. Stable event/play identity: ${Object.entries(r.membership).map(([k,v])=>`${v.length} ${k}`).join(', ')}.`,
    '', 'Frozen Phase 2 (65/35, ceiling 34; Generic Leverage 8 / .55 / .40), Phase 3 and Phase 3.1 definitions are unchanged. Trajectory stays opt-in. No policy selected or promoted. The old staging manifest validates only its historical checkpoint.',
    '', '## Input effects, matched identities','',table(['Policy','Before mean','After mean','Mean delta','Equal-game delta','Exact 99 before/after'],labels.map(l=>{const s=r.comparisons[l].inputEffect;return [l,s.checkpointWeighted.before,s.checkpointWeighted.after,s.checkpointWeighted.delta,s.equalGame.delta,`${s.exact99.before}/${s.exact99.after}`];})),
    '', '## Policy differences on identical corrected inputs','',table(['Policy','Mean','Delta vs Phase 2','Equal-game delta','Exact 99'],labels.map(l=>{const s=r.comparisons[l].policyEffectOnCorrectedInputs;return [l,s.checkpointWeighted.after,s.checkpointWeighted.delta,s.equalGame.delta,s.exact99.after];})),
    '', '## Named anchors','',table(['Case','Suitability','Phase 2 before/after','Live-owned-45-95 before/after','Floor before/after'],r.anchors.filter(a=>['R05','R10','R21'].includes(a.id)).map(a=>[a.id,a.status,`${a.before?.['Phase 2'].score}/${a.after?.['Phase 2'].score}`,`${a.before?.['live-owned-45-95'].score}/${a.after?.['live-owned-45-95'].score}`,`${a.before?.['Phase 2'].competitiveFloor}/${a.after?.['Phase 2'].competitiveFloor}`])),
    '', '## Scope','', 'Ordering, transition categories, unresolved exclusions, exact affected game/checkpoint IDs, and score/situation/WP/history changes are in [the scope report](output/replay-input-scope.v2.json).',
    '', JSON.stringify(r.scopeSummary,null,2),
    '', '## Validation and boundaries','',`Identical-input batches: ${r.invariants.identicalInputs}; trajectory-off frozen scorer parity: ${r.invariants.offScorerParity}; byte-identical input batches reused: ${r.invariants.unchangedInputReuse}. Oracle comparisons establish scorer parity on supplied inputs; reuse avoids redundant scoring of identical checkpoints. Neither implies equality between faulty and repaired inputs.`,
    '',...r.limitations.map(s=>`- ${s}`),
    '', 'Remaining production exposure: shared footballSituationImpact and NFL/CFB possession paths can still accept caller-supplied team/field position without a valid current scrimmage/explicit try. A separate proposed change is a shared validated-current-situation contract for those callers, allowing explicit tries and supported timeout continuity. That production behavior change is outside this repair and is not enabled.',
    '', 'Threshold crossings (70/80/85/90/99), equal-game shares, per-sport summaries, decisive/floor changes, all anchor outputs and provenance are in [comparison JSON](output/replay-input-comparison.v2.json). Every old/new compact policy result and input hash is retained in `output/replay-input-states.v2.json.gz`.',
    '', 'Reviewer cards: [replay v2 pack](trajectory-reviewer-pack.replay-v2.md). Full anchor diagnostics: [replay v2 key](trajectory-diagnostic-key.replay-v2.json). Frozen evidence and the earlier presentation correction are preserved.',''].join('\n');
}

// Focused opt-in comparison on the existing corrected replay pipeline. This
// mode never regenerates frozen diagnostics, manifests or historical outputs.
export async function compareHistoryRelevance({endgame=false,nhl=false}={}) {
  const {LIVE_TRAJECTORY_POLICIES,LIVE_HISTORY_RELEVANCE_POLICY,LIVE_ENDGAME_ALLOCATION_POLICY,LIVE_NHL_ALLOCATION_POLICY}=require('../calibration/trajectory-live-policy.cjs');
  const policies=nhl ? [LIVE_ENDGAME_ALLOCATION_POLICY,LIVE_NHL_ALLOCATION_POLICY]
    : endgame ? [LIVE_HISTORY_RELEVANCE_POLICY,LIVE_ENDGAME_ALLOCATION_POLICY]
    : [LIVE_TRAJECTORY_POLICIES[1],LIVE_HISTORY_RELEVANCE_POLICY];
  const {focusedHistories}=await import('../calibration/trajectory-checkpoint-fixtures.mjs');
  const {prepareSynthetic}=await import('../calibration/trajectory-live-fixtures.mjs');
  const {endgameRegressions,endgameContextVariants,decisiveEndgameInputs,neutralOvertimeInput,hypotheticalQualityContexts}=
    await import('../calibration/endgame-allocation-fixtures.mjs');
  const {nhlAdditional,nhlNamed,nhlContextVariants,nhlSemanticInputs}=await import('../calibration/nhl-allocation-fixtures.mjs');
  const core=await loadCore(),fixtures=loadFixtures().filter(f=>!nhl || f.modelSport==='NHL'),rows=[],reviewed=[],regressions=[];
  const variants=[],previous99Samples=[],outsideScope={};
  const representativeChanges=[];
  const review=JSON.parse(read('calibration/trajectory-diagnostic-key.replay-v2.json'));
  const reviewedIds=new Set(['R13','R06','R12','R07','R04','R14','R03','R19','R18','R16','R08']);
  const selected=nhl ? review.cases.filter(c=>['R03','R11','R14'].includes(c.id))
    : endgame ? review.cases : review.cases.filter(c=>reviewedIds.has(c.id));
  const regressionGames=new Set(['401872981','401856720','401909088','401892519','401908024']);
  const detail=r=>({score:r.score,base:r.baseScore,liveBonus:r.liveBonus,history:r.momentumPoints,
    preClamp:r.baseScore+r.liveBonus+r.momentumPoints+r.trajectoryScoring.adjustment,
    trajectory:r.trajectoryScoring,ownership:r.historyOwnership,
    ...(endgame || nhl ? {allocation:r.live.endgameAllocation??r.live.sportImpact.allocation??null,competitiveFloor:r.live.sportImpact.competitiveFloor??0,
      competitiveTarget:r.live.sportImpact.competitiveTarget??null,components:r.live.components,factors:r.factors,
      ...(nhl ? {overtime:r.live.sportImpact.overtime,contextWeight:r.state.retainedContextWeight} : {})} : {})});
  const compareVariant=i=>{
    const game=prepareSynthetic(i);
    const [before,after]=shadow.candidateTrajectoryRatings(core,game,i.competition,i.summary,policies);
    return {id:i.id,label:i.label||'synthetic decisive regression',before:before.score,after:after.score,
      ...(endgame || nhl ? {openingScore:game.openingScore,openingFactors:game.openingFactors} : {}),
      beforeDetail:detail(before),afterDetail:detail(after)};
  };
  let invariantChecks=0;
  for(const [fi,f] of fixtures.entries()) {
    const cps=replayCheckpoints(f).checkpoints;
    for(const [index,cp] of cps.entries()) {
      const prepared=prepareCheckpointEvaluation(core,f,cp,index);if(!prepared)continue;
      const [before,after]=shadow.candidateTrajectoryRatings(core,prepared.game,cp.competition,cp.summary,policies);
      if(nhl) {
        assert.equal(after.currentTensionPoints,before.currentTensionPoints);
        assert.equal(after.genericLeveragePoints,before.genericLeveragePoints);
        assert.equal(after.state.retainedContextWeight,before.state.retainedContextWeight);
        const h=after.historyOwnership,t=after.trajectoryScoring;
        assert.ok(Math.abs(h.combinedPoints-h.combinedFactors.reduce((sum,f)=>sum+f.points,0))<1e-9);
        assert.ok(h.combinedPoints<=12+1e-9);
        assert.equal(t.adjustment,h.combinedPoints-after.momentumPoints+t.negativeAfterFloor);
        assert.equal(after.score,core.clampScore(after.baseScore+after.liveBonus+h.combinedPoints+t.negativeAfterFloor));
      } else assert.deepEqual(after.state,before.state);
      if(endgame) {
        assert.deepEqual(after.historyOwnership,before.historyOwnership);
        assert.deepEqual(after.trajectoryScoring,{...before.trajectoryScoring,policyId:policies[1].id});
        assert.deepEqual(after.live.components,before.live.components);
        assert.ok(after.score<=before.score,'allocation cannot increase ratings');
        if(!after.live.endgameAllocation)assert.deepEqual(after.live,before.live);
        if(f.modelSport!=='NFL' || !(before.live.sportImpact.competitiveFloor>0)) {
          assert.deepEqual(after,{...before,trajectoryScoring:{...before.trajectoryScoring,policyId:policies[1].id}},'outside NFL positive-floor scope');
          outsideScope[f.modelSport]=(outsideScope[f.modelSport]||0)+1;
        }
      } else if(!nhl)assert.deepEqual(after.live,before.live);
      assert.deepEqual(after.trajectory,before.trajectory);assertPreparedCheckpointUnchanged(prepared);
      invariantChecks++;
      const row={stateId:sid(f,cp),eventId:String(f.eventId),sport:f.modelSport,
        progress:after.progress,gap:after.gap,before:before.score,after:after.score,delta:after.score-before.score};
      rows.push(row);
      const evidence=()=>({...row,status:cp.competition.status,play:cp.play.text,
        teams:cp.competition.competitors.map(t=>({name:t.team.displayName,score:t.score})),
        beforeDetail:detail(before),afterDetail:detail(after)});
      if(nhl && row.delta!==0 && (representativeChanges.length<12 || Math.abs(row.delta)>Math.abs(representativeChanges.at(-1).delta))) {
        representativeChanges.push(evidence());representativeChanges.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
        representativeChanges.splice(12);
      }
      if(nhl && nhlNamed.some(([event,play])=>event===String(f.eventId)&&play===String(cp.play.id)))
        reviewed.push({id:sid(f,cp),...evidence()});
      // A few actual archived 99s for arithmetic review, never score targets.
      if(endgame && ['NFL','NHL'].includes(f.modelSport) && before.score===99 &&
          previous99Samples.filter(r=>r.sport===f.modelSport).length<2) {
        previous99Samples.push({...row,status:cp.competition.status,situation:cp.competition.situation,
          teams:cp.competition.competitors.map(t=>({name:t.team.displayName,homeAway:t.homeAway,score:t.score})),
          play:cp.play.text,sportImpact:before.live.sportImpact,
          beforeDetail:detail(before),afterDetail:detail(after)});
      }
      const c=selected.find(c=>c.provenance.eventId===String(f.eventId)&&c.provenance.playId===String(cp.play.id));
      if(c) {
        if(!endgame && !nhl)assert.equal(before.score,c.results[policies[0].id].score,`${c.id}: frozen baseline`);
        reviewed.push({id:c.id,...(nhl ? evidence() : {...row,beforeDetail:detail(before),afterDetail:detail(after)})});
        if(nhl)variants.push(...nhlContextVariants({id:c.id,sport:'NHL',event:cp.event,competition:cp.competition,summary:cp.summary}).map(compareVariant));
        if(endgame && ['R13','R03','R14'].includes(c.id))variants.push(...endgameContextVariants({
          id:c.id,sport:f.modelSport,event:cp.event,competition:cp.competition,summary:cp.summary}).map(compareVariant));
      }
      const preselected=(nhl ? nhlAdditional : endgameRegressions).find(([eventId,playId])=>eventId===String(f.eventId)&&playId===String(cp.play.id));
      if(endgame || nhl ? preselected : regressionGames.has(String(f.eventId))&&[.35,.85].some(fraction=>index===Math.floor(cps.length*fraction))) {
        if(endgame || nhl)assert.equal(before.score,preselected[2],'pre-edit regression baseline');
        regressions.push({...row,...(nhl ? evidence() : {}),eventRetention:after.historyOwnership.relevance.eventRetention,
          recovery:after.historyOwnership.relevance.recovery,
          historyBefore:before.momentumPoints,historyAfter:after.momentumPoints,
          trajectoryBefore:before.trajectoryScoring.adjustment,trajectoryAfter:after.trajectoryScoring.adjustment});
      }
    }
    if((fi+1)%20===0)console.log(JSON.stringify({relevanceGames:fi+1,states:rows.length}));
  }
  for(const c of selected.filter(c=>c.provenance.syntheticId)) {
    const input=Object.values(focusedHistories()).flat().find(i=>i.id===c.provenance.syntheticId);
    assert.ok(input);
    const [before,after]=shadow.candidateTrajectoryRatings(core,prepareSynthetic(input),input.competition,input.summary,policies);
    if(!endgame)assert.equal(before.score,c.results[policies[0].id].score);
    reviewed.push({id:c.id,before:before.score,after:after.score,delta:after.score-before.score,
      beforeDetail:detail(before),afterDetail:detail(after)});
  }
  if(endgame)variants.push(...decisiveEndgameInputs().map(compareVariant),
    ...endgameContextVariants(neutralOvertimeInput()).map(compareVariant),
    ...hypotheticalQualityContexts().map(compareVariant));
  if(nhl)variants.push(...nhlContextVariants().map(compareVariant),...nhlSemanticInputs().map(compareVariant));
  assert.equal(reviewed.length,nhl ? 3+nhlNamed.length : endgame ? review.cases.length : 11);
  assert.equal(regressions.length,nhl ? nhlAdditional.length : 10);
  const summarize=data=>stats(data,r=>r.before,r=>r.after);
  return {inputPipelineVersion:INPUT_PIPELINE_VERSION,sourceHashes:currentSourceHashes(),policies:policies.map(p=>p.id),invariantChecks,
    overall:summarize(rows),sports:Object.fromEntries([...new Set(rows.map(r=>r.sport))]
      .map(sport=>[sport,summarize(rows.filter(r=>r.sport===sport))])),
    increased:rows.filter(r=>r.delta>0).length,decreased:rows.filter(r=>r.delta<0).length,
    unchanged:rows.filter(r=>r.delta===0).length,
    largestIncreases:rows.filter(r=>r.delta>0).sort((a,b)=>b.delta-a.delta).slice(0,5),
    largestDecreases:rows.filter(r=>r.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,5),
    reviewed:reviewed.sort((a,b)=>a.id.localeCompare(b.id)),regressions,...(endgame ? {variants,outsideScope,previous99Samples} : {}),
    ...(nhl ? {variants,representativeChanges,perGame:Object.fromEntries([...new Set(rows.map(r=>r.eventId))]
      .map(id=>[id,summarize(rows.filter(r=>r.eventId===id))]))} : {})};
}

export async function compareCFBContext({watchability=false}={}) {
  const {LIVE_NHL_ALLOCATION_POLICY,LIVE_CFB_CONTEXT_POLICY,LIVE_CFB_WATCHABILITY_POLICY}=require('../calibration/trajectory-live-policy.cjs');
  const baseline=watchability ? LIVE_CFB_CONTEXT_POLICY : LIVE_NHL_ALLOCATION_POLICY;
  const candidate=watchability ? LIVE_CFB_WATCHABILITY_POLICY : LIVE_CFB_CONTEXT_POLICY;
  const {cfbAdditional:contextAdditional,cfbContextVariants}=await import('../calibration/cfb-context-fixtures.mjs');
  const {cfbWatchabilityAdditional,cfbWatchabilityInputs}=await import('../calibration/cfb-watchability-fixtures.mjs');
  const cfbAdditional=watchability ? cfbWatchabilityAdditional : contextAdditional;
  const {prepareSynthetic}=await import('../calibration/trajectory-live-fixtures.mjs');
  const core=await loadCore(),fixtures=loadFixtures(),rows=[],reviewed=[],regressions=[],variants=[],parity={},largestIncreases=[],largestDecreases=[];
  const key=JSON.parse(read('calibration/trajectory-diagnostic-key.replay-v2.json'));
  const selected=key.cases.filter(c=>['R07','R18','R08'].includes(c.id));
  const detail=r=>({score:r.score,base:r.baseScore,live:r.liveBonus,history:r.momentumPoints,
    state:r.state,factors:r.factors,components:r.live.components,ownership:r.historyOwnership,trajectory:r.trajectoryScoring});
  for(const [fi,f] of fixtures.entries()) {
    for(const [i,cp] of replayCheckpoints(f).checkpoints.entries()) {
      const p=prepareCheckpointEvaluation(core,f,cp,i);if(!p)continue;
      const [a,b]=shadow.candidateTrajectoryRatings(core,p.game,cp.competition,cp.summary,[baseline,candidate]);
      if(!watchability || f.modelSport!=='CFB')assert.equal(a.currentTensionPoints,b.currentTensionPoints);
      assert.equal(a.genericLeveragePoints,b.genericLeveragePoints);
      assert.deepEqual(a.trajectory,b.trajectory);
      if(f.modelSport!=='CFB') {
        assert.deepEqual(b,{...a,trajectoryScoring:{...a.trajectoryScoring,policyId:candidate.id}});
        parity[f.modelSport]=(parity[f.modelSport]||0)+1;
      } else {
        const row={eventId:String(f.eventId),playId:String(cp.play.id),before:a.score,after:b.score,delta:b.score-a.score};rows.push(row);
        const c=selected.find(c=>c.provenance.eventId===row.eventId&&c.provenance.playId===row.playId);
        const extra=cfbAdditional.find(([,event,play])=>event===row.eventId&&play===row.playId);
        const evidence=()=>({...row,status:cp.competition.status,scores:cp.competition.competitors.map(t=>({side:t.homeAway,score:t.score})),
          situation:cp.competition.situation,opening:p.game.openingScore,openingFactors:p.game.openingFactors,beforeDetail:detail(a),afterDetail:detail(b)});
        if(watchability && row.delta!==0) {
          const list=row.delta>0 ? largestIncreases : largestDecreases;
          if(list.length<5 || Math.abs(row.delta)>Math.abs(list.at(-1).delta)) {
            list.push(evidence());list.sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta));list.splice(5);
          }
        }
        if(c)reviewed.push({id:c.id,...evidence()});
        if(extra){assert.equal(a.score,extra[3]);regressions.push({label:extra[0],...evidence()});}
        if(c?.id==='R18')for(const v of cfbContextVariants({sport:'CFB',event:cp.event,competition:cp.competition,summary:cp.summary})) {
          const g=prepareSynthetic(v),[x,y]=shadow.candidateTrajectoryRatings(core,g,v.competition,v.summary,[baseline,candidate]);
          assert.deepEqual(y.trajectory,b.trajectory);
          if(!watchability)assert.deepEqual(y.historyOwnership,b.historyOwnership);
          variants.push({id:v.id,hypothetical:true,before:x.score,after:y.score,opening:g.openingScore,openingFactors:g.openingFactors,
            context:v.event.sportsRadarContextFactors??[],teams:v.competition.competitors.map(t=>({side:t.homeAway,rank:t.curatedRank??null,records:t.records??null})),
            odds:v.competition.odds??null,beforeDetail:detail(x),afterDetail:detail(y)});
        }
      }
      assertPreparedCheckpointUnchanged(p);
    }
    if((fi+1)%25===0)console.log(JSON.stringify({cfbComparisonGames:fi+1,cfbStates:rows.length,nonCFBStates:Object.values(parity).reduce((a,b)=>a+b,0)}));
  }
  assert.equal(reviewed.length,3);assert.equal(regressions.length,cfbAdditional.length);
  const synthetic=watchability ? cfbWatchabilityInputs().map(input=>{
    const game=prepareSynthetic(input);
    const [a,b]=shadow.candidateTrajectoryRatings(core,game,input.competition,input.summary,[baseline,candidate]);
    assert.equal(a.score,input.baselineScore);
    return {id:input.id,hypothetical:true,before:a.score,after:b.score,beforeDetail:detail(a),afterDetail:detail(b)};
  }) : [];
  return {policies:[baseline,candidate],overall:stats(rows,r=>r.before,r=>r.after),
    increased:rows.filter(r=>r.delta>0).length,decreased:rows.filter(r=>r.delta<0).length,
    unchanged:rows.filter(r=>r.delta===0).length,nonCFBParity:parity,reviewed,regressions,variants,
    largestChanges:rows.slice().sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,10),
    ...(watchability ? {synthetic,largestIncreases,largestDecreases} : {})};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.includes('--cfb-context') || process.argv.includes('--cfb-watchability')) {
    const watchability=process.argv.includes('--cfb-watchability');
    const result=await compareCFBContext({watchability});mkdirSync(new URL('work/',root),{recursive:true});
    write(watchability ? 'work/live-cfb-watchability-results.json' : 'work/live-cfb-context-results.json',result);
    console.log(JSON.stringify({overall:result.overall,increased:result.increased,decreased:result.decreased,unchanged:result.unchanged,
      nonCFBParity:result.nonCFBParity,reviewed:result.reviewed.map(({id,before,after})=>({id,before,after})),
      variants:result.variants.map(({id,before,after})=>({id,before,after})),
      regressions:result.regressions.map(({label,before,after})=>({label,before,after}))}));
  } else if(process.argv.includes('--history-relevance') || process.argv.includes('--endgame-allocation') || process.argv.includes('--nhl-allocation')) {
    const endgame=process.argv.includes('--endgame-allocation');
    const nhl=process.argv.includes('--nhl-allocation');
    // Retain the first experiment verbatim inside the existing output file.
    // No new output locations or provenance artifacts.
    const firstExperiment=endgame ? JSON.parse(read('work/live-endgame-allocation-results.json')) : null;
    const result=await compareHistoryRelevance({endgame,nhl});
    if(endgame)result.firstExperiment=firstExperiment.firstExperiment??firstExperiment;
    mkdirSync(new URL('work/',root),{recursive:true});
    write(nhl ? 'work/live-nhl-allocation-results.json' : endgame ? 'work/live-endgame-allocation-results.json' : 'work/live-history-relevance-results.json',result);
    console.log(JSON.stringify({overall:result.overall,increased:result.increased,decreased:result.decreased,
      reviewed:result.reviewed.map(({id,before,after})=>({id,before,after}))},null,2));
  } else if(process.argv.includes('--scan')) {
    const scope=scanFixtures();write('calibration/output/replay-input-scope.v2.json',scope);console.log(JSON.stringify(scope.summary,null,2));
  } else {
    const scope=JSON.parse(read('calibration/output/replay-input-scope.v2.json'));
    assert.equal(scope.pipelineSha256,hash(read('scripts/replay-inputs.mjs')),'Pipeline changed after scope measurement');
    for(const f of scope.fixtureHashes)assert.equal(historicalFixtureSha256(f.path),f.sha256,'Fixture changed after scope measurement');
    const result=await compare(scope);console.log(JSON.stringify({states:result.scopeSummary.after,invariants:result.invariants}));
  }
}
