// Frozen historical reproduction; corrected evaluation lives in replay-input-comparison.mjs.
import {highFidelityCheckpoints} from './replay-inputs.historical.mjs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from './shadow-candidate-report.mjs';
import {focusedHistories,historicalWpThinning} from '../calibration/trajectory-checkpoint-fixtures.mjs';
import {prepareSynthetic,evidenceHistories} from '../calibration/trajectory-live-fixtures.mjs';
const require=createRequire(import.meta.url);
const shadow=require('../calibration/shadow-candidate.cjs');
const {TRAJECTORY_POLICIES}=require('../calibration/trajectory-policy.cjs');
const {LIVE_TRAJECTORY_POLICIES}=require('../calibration/trajectory-live-policy.cjs');
const {winProbabilityObservations}=require('../scoring/shared/probability.js');
export const POLICIES=[{label:'Phase 2',policy:null},
  {label:'original slow-evidence / gate-10-65-wp-100',policy:TRAJECTORY_POLICIES.find(p=>p.id==='gate-10-65-wp-100')},
  {label:'intermediate gate-45-95-wp-65',policy:TRAJECTORY_POLICIES.find(p=>p.id==='gate-45-95-wp-65')},
  ...LIVE_TRAJECTORY_POLICIES.map(policy=>({label:policy.id,policy}))];
// Fixed checkpoint sampling, not a parameter search or ground-truth labelling.
export const SELECTION=[
  ['401856719','401856719774','late recovery and field position'],
  ['401873000','4018730005010','late recovery and field position'],
  ['401872982','4018729824233','late recovery and field position'],
  ['401856833','401856833572','close score / historically one-sided provider WP'],
  ['401858264','401858264453','close score / historically one-sided provider WP'],
  ['401862805','401862805670','earlier close score / current large margin'],
  ['401872984','4018729843726','earlier close score / current large margin'],
  ['401892525','401892525000011370','NHL late regulation'],
  ['401892539','401892539000004250','NHL regulation boundary'],
  ['401892524','401892524000010180','NHL overtime'],
  ['401892545','401892545000009820','NHL overtime'],
  ['401909089','401909089551','basketball scoring-history comparison'],
  ['401856574','401856574120399220','college basketball scoring-history comparison'],
  ['401930515','4019305151404030005','baseball scoring-history comparison'],
  ['401858490','401858490465','revised-gate disagreement'],
  ['401858490','401858490648','revised-gate disagreement'],
  ['401872983','4018729833851','positive request with consumed history capacity'],
  ['401864524','401864524555','sustained scoring-history comparison']
];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const round=n=>n==null?null:Number(n.toFixed(4));
export function evaluateInput(core,input,game=prepareSynthetic(input)) {
  return Object.fromEntries(POLICIES.map(({label,policy})=>{
    const result=shadow.candidateGameRating(core,game,input.competition,input.summary,null,policy);
    const d=result.trajectoryScoring,h=result.historyOwnership;
    const originalHistory=core.momentumImpact(input.sport,input.summary,result.progress,'live');
    return [label,{...result,preClampTotal:result.baseScore+result.liveBonus+result.momentumPoints+d.adjustment,
      originalHistory,reviewBreakdown:{base:result.baseScore,liveBonus:result.liveBonus,
        originalHistory:originalHistory.points,replacedHistory:h?.replacedPoints??0,
        retainedEventPoints:h?.eventPoints??null,retainedEventFactors:h?.eventFactors??null,
        requestedTrajectory:d.unprotectedAdjustment??d.adjustment,
        requestedPositive:d.requestedPositive??Math.max(0,d.adjustment),awardedTrajectory:d.adjustment,
        positiveAfterCaps:d.positiveAfterHistoryCaps??Math.max(0,d.adjustment),
        taper:d.negativeMultiplier??1,negativeAfterTaper:d.negativeAfterTaper??Math.min(0,d.adjustment),
        negativeAfterFloor:d.negativeAfterFloor??Math.min(0,d.adjustment),floor:d.protectedRating??null}}];
  }));
}
export function publicInput(input,currentWp,missing=[]) {
  const c=input.competition;
  const teams=Object.fromEntries(c.competitors.map(t=>[t.homeAway,t]));
  const side=id=>Object.entries(teams).find(([,t])=>String(t.team.id)===String(id?.id??id))?.[0]||'unknown';
  const situation={};
  for(const key of ['down','distance','yardsToEndzone','outs','balls','strikes','onFirst','onSecond','onThird','battingSide','count','homeTimeouts','awayTimeouts'])
    if(c.situation?.[key]!=null) situation[key]=c.situation[key];
  if(c.situation?.possession) situation.possession=side(c.situation.possession);
  const ledger=(input.summary.scoringPlays||[]).map(p=>({period:p.period?.number||p.period,clock:p.clock?.displayValue||'',home:p.homeScore,away:p.awayScore}));
  const sample=ledger.length<=10?ledger:Array.from(new Set(Array.from({length:10},(_,i)=>Math.round(i*(ledger.length-1)/9)))).map(i=>ledger[i]);
  const observations=winProbabilityObservations(input.sport,input.summary);
  const positioned=observations.filter(o=>Number.isFinite(o.position));
  const wp=positioned.map(o=>o.probability);
  return {sport:input.sport,homeScore:Number(teams.home.score),awayScore:Number(teams.away.score),
    period:c.status.period,clock:c.status.displayClock||null,clockConvention:c.status.clockMode==='elapsed'?'elapsed in period':'remaining / provider convention',
    situation,latestUsableHomeWp:currentWp,scoringUpdates:sample,totalScoringUpdates:ledger.length,
    observedHomeWpRange:wp.length?[Math.min(...wp),Math.max(...wp)]:null,
    positionedWpObservations:wp.length,firstWpPosition:positioned[0]?.position??null,lastWpPosition:positioned.at(-1)?.position??null,
    unknowns:[...missing,'Unobserved intervals are not confirmed uncertainty; internal WP gaps are not represented by this telemetry.',
      input.synthetic?'No additional stakes or extraordinary current events encoded.':'Stakes and historical box-score/manpower details are not independently verified in this checkpoint view.'],
    answers:{switchNow:'',urgencyTier:'',matchedPreference:'',evidence:''}};
}
export async function buildReviewPack() {
  const core=await loadCore(),fixtures=loadFixtures(),cache=new Map(),cases=[];
  for(const [eventId,playId,criterion] of SELECTION) {
    const fixture=fixtures.find(f=>String(f.eventId)===eventId);
    assert.ok(fixture,`Missing archived fixture ${eventId}`);
    let cps=cache.get(eventId);
    if(!cps) {cps=highFidelityCheckpoints(fixture);cache.set(eventId,cps);}
    const index=cps.findIndex(c=>String(c.play.id)===playId);
    assert.ok(index>=0,`Missing causal checkpoint ${eventId}:${playId}`);
    const cp=cps[index],prepared=prepareCheckpointEvaluation(core,fixture,cp,index);
    const input={sport:fixture.modelSport,event:cp.event,competition:cp.competition,summary:cp.summary};
    const results=evaluateInput(core,input,prepared.game);
    assertPreparedCheckpointUnchanged(prepared);
    const safe=publicInput(input,results['Phase 2'].currentWinProbability,cp.missingSituationFields);
    // Whitelisted review projection excludes nextPlayScoring, event outcomes,
    // drive results, postgame records, provider prose and later plays.
    cases.push({sortKey:hash([eventId,playId]),kind:'archived review example',matchGroup:null,
      provenance:{eventId,playId,index,fixtureSport:fixture.modelSport,
        teams:cp.competition.competitors.map(t=>({side:t.homeAway,name:t.team.displayName})),
        acceptedPlayIds:cp.summary.plays.map(p=>String(p.id)),checkpointHash:hash([cp.competition.status,cp.competition.situation,cp.summary.scoringPlays,cp.summary.winprobability]),
        samplingCriterion:criterion,samplingIsGroundTruth:false},public:safe,results});
  }
  const focused=focusedHistories();
  for(const [group,inputs] of Object.entries(focused).filter(([k])=>k!=='capacity')) for(const [i,input] of inputs.entries()) {
    const results=evaluateInput(core,input);
    cases.push({sortKey:hash([group,i]),kind:'synthetic matched example',matchGroup:group==='decisive'?'M1':'M2',
      provenance:{syntheticId:input.id,samplingIsGroundTruth:false},
      public:publicInput({...input,synthetic:true},results['Phase 2'].currentWinProbability),results});
  }
  cases.sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
  cases.forEach((c,i)=>{c.id=`R${String(i+1).padStart(2,'0')}`;delete c.sortKey;});
  const count=Map.groupBy(cases.filter(c=>c.provenance.eventId),c=>c.provenance.eventId);
  assert.ok([...count.values()].every(g=>g.length<=2));
  const evaluateSet=items=>Object.fromEntries(Object.entries(items).map(([k,input])=>[k,evaluateInput(core,input)]));
  return {version:1,purpose:'Human review examples from the existing calibration archive; NOT an unseen validation set.',
    policyProvenance:POLICIES.map(({label,policy})=>({label,policy})),selectedPolicy:null,
    cases,counts:{total:cases.length,archived:SELECTION.length,distinctArchivedGames:count.size,synthetic:cases.length-SELECTION.length},
    focused:Object.fromEntries(Object.entries(focused).map(([name,pair])=>[name,pair.map(input=>({id:input.id,present:input.competition,results:evaluateInput(core,input)}))])),
    historicalWpThinning:{currentObservation:historicalWpThinning().full.summary.winprobability.at(-1),results:evaluateSet(historicalWpThinning()),
      limitation:'Internal sample removal still spans endpoint coverage; it does not establish observed coverage inside a gap. Current WP stays identical; retained earlier WP-event awards may legitimately change.'},
    missingCurrentWpComparison:{results:evaluateSet(evidenceHistories()),
      limitation:'Separate end-to-end cases: missing or stale current WP can change Current Tension as well as history.'}};
}
export function renderReviewerPack(key) {
  return ['# Blind live-watchability review','',
    `${key.counts.total} cases: ${key.counts.archived} archived checkpoints from ${key.counts.distinctArchivedGames} games and ${key.counts.synthetic} clearly marked synthetic matched examples. These are examples from the existing calibration archive, not an unseen validation set.`,
    '', 'Home and Away are anonymized sides. Read each checkpoint as a live decision using only the information shown. Scoring updates are prior to or at this checkpoint. Probability ranges describe supplied observations, not continuous coverage or confirmed uncertainty. No post-checkpoint information is included. Answers are intentionally blank.',
    '', 'Urgency tiers: low / moderate / high / immediate. For matched groups M1 and M2, compare the two cases in that group and allow a tie.',
    ...key.cases.flatMap(c=>{
      const p=c.public;
      const current=`Home ${p.homeScore} - Away ${p.awayScore}; period ${p.period}; ${p.clock||'clock unavailable'} (${p.clockConvention}).`;
      const history=p.scoringUpdates.length?p.scoringUpdates.map(x=>`P${x.period} ${x.clock||'clock unknown'}: ${x.home}-${x.away}`).join('; '):'No scoring updates available before this checkpoint.';
      return ['',`## ${c.id} - ${p.sport} - ${c.kind}${c.matchGroup?` - matched group ${c.matchGroup}`:''}`,'',current,
        '',`Current situation: ${Object.keys(p.situation).length?JSON.stringify(p.situation):'not supplied'}. Latest usable provider WP: ${p.latestUsableHomeWp==null?'unavailable':`Home ${round(p.latestUsableHomeWp*100)}%`}.`,
        '',`Prior scoring history, home-away (${p.scoringUpdates.length} of ${p.totalScoringUpdates} supplied scoring updates shown): ${history}`,
        '',`WP availability: ${p.positionedWpObservations} positioned observations${p.observedHomeWpRange?`; observed Home range ${p.observedHomeWpRange.map(x=>round(x*100)).join('-')}%`:''}.`,
        '',`Unknowns: ${p.unknowns.join('; ')}`,'',
        '- Would you switch to this game now? __________',
        '- What urgency tier does it deserve? __________',
        `- ${c.matchGroup?`For ${c.matchGroup}, which case is more watchable, or are they tied?`:'Matched comparison (if applicable):'} __________`,
        '- What evidence drives that judgment? __________'];
    }),''].join('\n');
}
export function renderFocusedReport(key) {
  const labels=POLICIES.slice(3).map(x=>x.label);
  const rows=Object.entries(key.focused).flatMap(([group,pair])=>pair.flatMap(c=>labels.map(label=>{
    const r=c.results[label],b=r.reviewBreakdown;
    return [group,c.id,label,round(r.preClampTotal),r.score,b.replacedHistory,b.retainedEventPoints,
      round(b.requestedTrajectory),round(b.requestedPositive),round(b.awardedTrajectory),b.taper,b.floor,
      b.retainedEventFactors.map(f=>`${f.label}: ${f.points}`).join('; ')||'none'];
  })));
  const table=(headers,rows)=>[headers.join(' | '),headers.map(()=>'---').join(' | '),...rows.map(r=>r.map(v=>v??'none').join(' | '))].join('\n');
  return ['# Frozen Phase 3.1 focused validation','',
    'No scoring function or policy constant changed. These are synthetic mechanics checks, not human accuracy labels. Both members of each pair have identical present score, clock, possession, field position, provider current WP, stakes and current-event inputs. Earlier event contributions are itemized below.',
    '',table(['Group','Case','Policy','Pre-clamp','Final','History replaced (net)','Retained events','Requested net before guards','Requested positive','Awarded net','Negative multiplier','Absolute sport floor','Retained earlier factors'],rows),
    '', 'The ordinary pair uses the same earlier histories as the decisive pair. Its present situation has no supplied possession leverage. The capacity pair uses identical ordinary present inputs; the consumed case retains lead-change, recent late lead-change and WP-swing awards totaling 15. Its positive request is suppressed by the existing budget, not by final clamping.',
    '', 'Historical-WP thinning keeps every play and the same valid current observation. Current Tension, Generic Leverage and raw live components remain identical. Earlier provider-WP event evidence may change; complete event breakdowns are in the diagnostic key. End-to-end missing-current-WP cases remain separate.',
    '',table(['Historical WP variant','Current WP','Current Tension','Raw sustained','Confidence','Adjusted sustained','False-close','Dominance','Retained events','Pre-clamp','Final'],Object.entries(key.historicalWpThinning.results).map(([k,v])=>{const r=v[labels[1]],d=r.trajectoryScoring;return [k,r.currentWinProbability,r.currentTensionPoints,round(d.sustainedQualityContribution),round(d.positiveWpConfidence),round(d.adjustedSustainedQualityContribution),round(d.falseCloseContribution),round(d.dominanceContribution),r.momentumPoints,round(r.preClampTotal),r.score];})),
    '',key.historicalWpThinning.limitation,'',
    'Policy labels: Phase 2; original slow-evidence / gate-10-65-wp-100; intermediate gate-45-95-wp-65; live-owned-35-85; live-owned-45-95. Historical reports are preserved rather than renamed.',
    '', 'Reviewer pack: [trajectory-reviewer-pack.md](trajectory-reviewer-pack.md). Diagnostic key: [trajectory-diagnostic-key.json](trajectory-diagnostic-key.json). No policy selected or promoted.',''].join('\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const key=await buildReviewPack();
  await writeFile(new URL('../calibration/trajectory-diagnostic-key.json',import.meta.url),JSON.stringify(key,null,2)+'\n');
  await writeFile(new URL('../calibration/trajectory-reviewer-pack.md',import.meta.url),renderReviewerPack(key));
  await writeFile(new URL('../calibration/trajectory-focused-validation.md',import.meta.url),renderFocusedReport(key));
  console.log(JSON.stringify(key.counts));
}
