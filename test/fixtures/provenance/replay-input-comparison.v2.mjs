import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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
    fixtureHashes:listFixtureFiles().map(path=>({path:path.slice(repoRoot.length+1).replaceAll('\\','/'),sha256:hash(readFileSync(path))})),
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
    sourceHashes:['scripts/replay-inputs.mjs','scripts/replay-inputs.historical.mjs','scripts/replay-input-comparison.mjs',
      'calibration/shadow-candidate.cjs','calibration/trajectory-policy.cjs','calibration/trajectory-live-policy.cjs',
      'calibration/trajectory-checkpoint-manifest.json'].map(path=>({path,sha256:hash(read(path))})),
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

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  if(process.argv.includes('--scan')) {
    const scope=scanFixtures();write('calibration/output/replay-input-scope.v2.json',scope);console.log(JSON.stringify(scope.summary,null,2));
  } else {
    const scope=JSON.parse(read('calibration/output/replay-input-scope.v2.json'));
    assert.equal(scope.pipelineSha256,hash(read('scripts/replay-inputs.mjs')),'Pipeline changed after scope measurement');
    for(const f of scope.fixtureHashes)assert.equal(hash(read(f.path)),f.sha256,'Fixture changed after scope measurement');
    const result=await compare(scope);console.log(JSON.stringify({states:result.scopeSummary.after,invariants:result.invariants}));
  }
}
