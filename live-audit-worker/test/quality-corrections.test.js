import test from 'node:test';
import assert from 'node:assert/strict';
import {auditGame,auditTimeline,gameState,AUDIT_VERSION} from '../src/audit.js';
import {normalizeAuditRating} from '../src/rating-evidence.js';
import {captureQualityEvidence,buildScoringQuality} from '../src/quality.js';
import {reviewHistoricalFindings} from '../src/historical-review.js';
import {AUDIT_SCOPE_VERSION,scopeEvidence,scopedRunsSql,scopeRun} from '../src/scope.js';
import {scan} from '../src/index.js';
import {sqliteD1} from './helpers/sqlite-d1.js';

const at=Date.parse('2026-11-06T02:00:00Z');
function observation({sport='NHL',id='fixture',rating=60,scores=[2,2],period=3,clock='1:00',offset=0,extra={},quality={}}={}){
  const state={id,sport,state:'live',score:rating,modelVersion:'test-model',startTime:'2026-11-05T23:00:00Z',
    teams:[['Away','A',scores[0],null,null,null,null,null,'away'],['Home','H',scores[1],null,null,null,null,null,'home']],
    liveRawStatus:{period,displayClock:clock,type:{state:'in',completed:false}},
    evidenceQuality:'complete',evidenceReasons:[],scoringPartial:false,...extra};
  return {observedAt:at+offset,feedUpdatedAt:at+offset,rating,scores,period,scoringVersion:'test-model',state,
    qualityEvidence:{...captureQualityEvidence(state,{publishedAt:at+offset,observedAt:at+offset}),...quality}};
}
const game=observations=>({gameKey:observations[0].state.sport+':'+observations[0].state.id,sport:observations[0].state.sport,observations});
const build=observations=>buildScoringQuality([game(observations)]);
const prior=o=>({observed_at:o.observedAt,state:o.state.state,normalized_state:JSON.stringify(o.state),model_version:o.scoringVersion});
const additive=(base,bonus,momentum,trajectory)=>({baseScore:base,live:{bonus},momentumPoints:momentum,trajectoryScoring:{adjustment:trajectory}});

test('sampled trajectory gaps censor duration, deltas, comebacks and inferred event responses without hiding points',()=>{
  const before=observation({rating:90,scores:[0,2],period:2,clock:'10:00'});
  const after=observation({rating:95,scores:[2,2],period:2,clock:'8:00',offset:180000});
  after.sourceReference={trajectoryGapBefore:true,trajectoryGapReason:'source observations omitted by export sampling'};
  const g=build([before,after]).games[0],t=g.thresholds.find(t=>t.threshold===85);
  assert.deepEqual(g.ratingTrajectory.map(p=>p.rating),[90,95]);
  assert.equal(g.peakRating,95);
  assert.equal(g.coveredSeconds,0);
  assert.equal(g.unknownIntervalSeconds,180);
  assert.equal(t.estimatedSecondsAbove,null);
  assert.equal(t.episodeCount,2);
  assert.equal(t.episodes[0].censoredByEvidenceGap,true);
  assert.equal(t.episodes[0].censoredByModelBoundary,undefined);
  assert.equal(g.volatility.observedChanges,0);
  assert.equal(g.comebackAnalysis.length,0);
  assert.equal(g.eventResponses.length,0);
  assert.ok(g.evidenceGaps.some(gap=>gap.includes('Retained trajectory gap')));
});

test('unavailable ratings never become zero or create deltas, while genuine zero remains invalid',()=>{
  const good=observation({sport:'CFB',rating:43,scores:[24,21],period:4,clock:'9:00'});
  for(const value of [null,undefined,'',' ']){
    const missing=observation({sport:'CFB',rating:value,scores:[24,21],period:4,clock:'9:00',offset:180000});
    missing.state.score=value;
    assert.equal(gameState(missing.state).rating,null);
    const down=auditGame(missing.state,[prior(good)],[],missing.observedAt);
    assert.ok(!down.findings.some(f=>['RATING_OUT_OF_RANGE','UNEXPLAINED_DROP','UNEXPLAINED_RISE'].includes(f.reasonCode)));
    const up=auditGame(good.state,[prior(missing)],[],missing.observedAt+180000);
    assert.ok(!up.findings.some(f=>['RATING_OUT_OF_RANGE','UNEXPLAINED_DROP','UNEXPLAINED_RISE'].includes(f.reasonCode)));
  }
  for(const value of [0,'0',100,'invalid',true]){
    const result=auditGame({...good.state,score:value},[],[],at);
    assert.ok(result.findings.some(f=>f.reasonCode==='RATING_OUT_OF_RANGE'&&f.deterministic),String(value));
  }
});

test('scan stores SQL NULL for a guarded unavailable rating and makes no provider request',async t=>{
  const db=sqliteD1();t.after(()=>db.close());
  const g=observation({sport:'CFB',rating:null,scores:[24,21],period:4,clock:'9:00',
    extra:{liveUpdateRejected:true,timingUncertain:true,scoringPartial:true,evidenceReasons:['summary-unavailable']}}).state;
  db.feed([g],at-1000);
  t.mock.method(globalThis,'fetch',()=>{throw new Error('Provider calls forbidden');});
  const result=await scan({DB:db.DB},at);
  const row=db.sqlite.prepare('SELECT rating,evidence FROM live_audit_observations').get();
  assert.equal(row.rating,null);assert.equal(JSON.parse(row.evidence).state.score,null);
  assert.equal(result.providerRequests,0);assert.equal(result.notifications,0);
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM live_audit_findings WHERE reason_code='RATING_OUT_OF_RANGE'").get().n,0);
  const run=scopeRun(db.sqlite.prepare(scopedRunsSql()).get());
  assert.ok(run.checks_completed>0,'new audit release retains explicit supported-sport scope');
  assert.equal(JSON.parse(row.evidence).auditScopeVersion,AUDIT_SCOPE_VERSION);
});

test('historical null-as-zero rows are reinterpreted without changing raw evidence or asserting a production zero',()=>{
  const before=observation({sport:'CFB',rating:43,scores:[24,21],period:4,clock:'9:00'});
  const missing=observation({sport:'CFB',rating:0,scores:[24,21],period:4,clock:'9:00',offset:180000,
    extra:{score:null,timingUncertain:true,liveUpdateRejected:true,scoringPartial:true}});
  missing.auditCandidates=[{reasonCode:'RATING_OUT_OF_RANGE',deterministic:true,observed:{rating:0}},
    {reasonCode:'UNEXPLAINED_DROP',deterministic:false,observed:{previousRating:43,rating:0}}];
  const after=observation({sport:'CFB',rating:43,scores:[24,21],period:4,clock:'9:00',offset:360000});
  const observations=[before,missing,after],original=structuredClone(observations),q=build(observations);
  assert.equal(q.integrityProblems.length,0);assert.equal(q.ratingInterpretations.length,1);
  assert.equal(q.ratingInterpretations[0].classification,'audit_collection_error');
  assert.deepEqual(q.games[0].ratingTrajectory.map(p=>p.rating),[43,null,43]);
  assert.equal(q.games[0].volatility.observedChanges,0);
  assert.equal(q.games[0].peakRating,43);
  const findings=missing.auditCandidates.map(f=>({...f,gameKey:'CFB:fixture',firstSeen:missing.observedAt,status:'recovered',classification:'confirmed_integrity_failure'}));
  const review=reviewHistoricalFindings({games:[game(observations)],findings});
  assert.ok(review.every(r=>r.classification==='audit_collection_error'));
  assert.ok(review.every(r=>r.evidence.productionZeroEstablished===false&&r.evidence.rawEvidencePreserved));
  assert.deepEqual(observations,original);
  const actualZero=build([observation({rating:0})]);
  assert.ok(actualZero.integrityProblems.some(r=>r.codes.includes('INVALID_RATING')));
  assert.equal(normalizeAuditRating(0,{score:0}).legacyNullCoercion,false);
});

test('a first-half nine-point recovery does not require any fixed 85-point target',()=>{
  const before=observation({sport:'NCAAB',rating:35,scores:[15,27],period:1,clock:'8:50'});
  for(const rating of [42,60,70,84,85]){
    const after=observation({sport:'NCAAB',rating,scores:[25,28],period:1,clock:'4:42',offset:180000,
      extra:{live:{winProbability:.899},liveUpset:{market:{teamId:'away',spread:17.5,source:'verified closing spread'}}}});
    const q=build([before,after]);
    assert.ok(q.games[0].decisiveMoments.some(p=>p.signals.includes('Substantial comeback observed so far')));
    assert.equal(q.topUnderrated.length,0,String(rating));
  }
});

test('recognized early hockey comebacks remain context, not automatic underrating',()=>{
  for(const [period,rating,clock] of [[1,70,'2:08'],[2,67,'13:35']]){
    const q=build([observation({rating:43,scores:[2,0],period,clock:period===1?'5:07':'16:20'}),
      observation({rating,scores:[2,2],period,clock,offset:180000,extra:{factors:[{label:'Erased a multi-goal deficit',points:6}]}})]);
    assert.equal(q.topUnderrated.length,0);
    assert.ok(q.games[0].decisiveMoments.some(p=>p.signals.includes('Substantial comeback observed so far')));
  }
});

test('underdog evidence maps home probability to the named team and cannot substitute unknown for a credible threat',()=>{
  const o=observation({sport:'CFB',rating:70,scores:[16,14],period:3,clock:'13:35',
    extra:{live:{winProbability:.1547},liveSurprise:{market:{teamId:'home',side:'home',spread:13.5,probability:.18274111675126903,source:'pregame market',reportedAt:null}}}});
  assert.equal(o.qualityEvidence.underdogProbability,.1547);
  assert.match(o.qualityEvidence.underdogProbabilitySource,/team-mapped/);
  assert.ok(!build([o]).games[0].decisiveMoments.some(p=>p.signals.includes('Credible observed underdog threat')));
  const away=captureQualityEvidence({...o.state,liveSurprise:{market:{...o.state.liveSurprise.market,teamId:'away'}}});
  assert.equal(away.underdogProbability,1-.1547);
  const unknown=captureQualityEvidence({...o.state,live:{winProbability:null}});
  assert.equal(unknown.underdogProbability,null);
  const mismatched=captureQualityEvidence({...o.state,liveSurprise:{market:{...o.state.liveSurprise.market,teamId:'third-team'}}});
  assert.equal(mismatched.underdogProbability,null);
});

test('market timestamp provenance uses reportedAt without inventing missing publication times',()=>{
  const state=observation({extra:{liveUpset:{market:{teamId:'away',source:'pregame market',reportedAt:'2026-11-05T19:00:00Z'}}}}).state;
  const q=captureQualityEvidence(state);
  assert.equal(q.market.quotedAt,Date.parse('2026-11-05T19:00:00Z'));assert.equal(q.market.timestampSource,'reportedAt');
  assert.equal(q.providerPublication,null);
  state.liveUpset.market.reportedAt=null;
  const missing=captureQualityEvidence(state);assert.equal(missing.market.quotedAt,null);assert.equal(missing.market.timestampSource,null);
});

test('a corroborated opposite-direction late response still produces a bounded calibration concern',()=>{
  const before=observation({sport:'NBA',rating:75,scores:[97,100],period:4,clock:'1:30'});
  const after=observation({sport:'NBA',rating:60,scores:[100,100],period:4,clock:'1:00',offset:180000,extra:{liveRawSituation:{possession:'away'}}});
  const q=build([before,after]),f=q.topUnderrated[0];
  assert.equal(f.rating,60);assert.equal(f.underratingBasis.response.delta,-15);
  assert.equal(f.underratingBasis.requiredRating,null);assert.equal(f.classification,'calibration_hypothesis');
  const blocked=structuredClone(after);blocked.qualityEvidence.scoringPartial=true;
  const partial=build([before,blocked]);assert.equal(partial.topUnderrated.length,0);
  assert.equal(partial.evidenceReview[0].classification,'data_quality_limitation');
});

test('five independent matched games can support an underrating review without a universal threshold',()=>{
  const make=(id,rating)=>observation({id,rating,period:4,clock:'2:00',quality:{pregameTeamQuality:50,
    manpower:{advantage:0,pulled:false,powerPlay:false},goaliePulled:false,market:{teamId:'away',spread:1.5,source:'verified closing spread',quotedAt:at-10000}}});
  const target=game([make('target',40)]),peers=Array.from({length:5},(_,i)=>game([make('peer'+i,80)]));
  assert.ok(!buildScoringQuality([target,...peers.slice(0,4)]).topUnderrated.some(f=>f.gameKey==='NHL:target'));
  const candidate=buildScoringQuality([target,...peers]).topUnderrated.find(f=>f.gameKey==='NHL:target');
  assert.equal(candidate.comparableSituations.sampleGames,5);assert.equal(candidate.underratingBasis.matchedPeerDeficit,40);
  assert.equal(candidate.underratingBasis.requiredRating,null);
});

test('lead building cannot be counted as erased deficit and true recoveries preserve separate margin swing',()=>{
  const small=build([observation({sport:'NCAAB',scores:[6,5],period:1,clock:'15:00'}),
    observation({sport:'NCAAB',scores:[15,27],period:1,clock:'8:50',offset:180000})]);
  assert.ok(!small.games[0].comebackAnalysis.some(r=>r.teamIndex===1),'one-point deficit did not become a thirteen-point deficit recovery');
  const real=build([observation({sport:'NCAAB',scores:[15,27],period:1,clock:'8:50'}),
    observation({sport:'NCAAB',scores:[30,27],period:1,clock:'4:00',offset:180000})]);
  const recovery=real.games[0].comebackAnalysis.find(r=>r.teamIndex===0);
  assert.equal(recovery.maximumObservedDeficit,12);assert.equal(recovery.deficitRecovered,12);assert.equal(recovery.marginSwing,15);
});

test('full line-item arithmetic explains a late two-goal finish without calling its 85-point fall a scoring defect',()=>{
  const before=observation({rating:93,scores:[4,3],clock:'0:32',extra:additive(53,34,6,.32995555555555534)});
  const after=observation({rating:8,scores:[5,3],clock:'0:00',offset:180000,extra:additive(8,0,0,0)});
  for(const o of [before,after]){
    const c=o.qualityEvidence.components,raw=c.baseScore+c.liveBonus+c.momentumPoints+c.trajectoryAdjustment;
    c.calculation={source:'canonical-feed-calculation',modelVersion:'test-model',total:o.rating,
      rows:[{label:'Base',points:String(c.baseScore)},{label:'Live bonus',points:String(c.liveBonus)},
        {label:'Momentum',points:String(c.momentumPoints)},{label:'Trajectory',points:String(c.trajectoryAdjustment)},
        {label:'Rating rounding',points:String(o.rating-raw)}]};
  }
  const q=build([before,after]),change=q.games[0].volatility.majorChanges[0];
  assert.equal(change.delta,-85);assert.equal(change.arithmeticReconciliation.status,'reconciled');
  assert.equal(change.unexplainedByReportedComponents,0);assert.equal(change.reportedComponentDelta,-85);
  assert.equal(change.classification,'expected_behavior');assert.equal(change.calibrationConcern,false);
  assert.equal(q.recommendations.filter(f=>f.direction==='discontinuity').length,0);
  assert.ok(q.expectedBehavior.some(f=>f.rating===8));
});

test('scalar arithmetic reconciles midgame one-to-two-goal steps without excusing their calibration',()=>{
  const before=observation({rating:65,scores:[3,2],period:2,clock:'5:36',extra:additive(54,4,3,3.507551)});
  const after=observation({rating:37,scores:[4,2],period:2,clock:'5:36',offset:15000,extra:additive(33,1,3,0)});
  const q=build([before,after]),change=q.games[0].volatility.majorChanges[0];
  assert.equal(change.delta,-28);assert.equal(change.arithmeticReconciliation.status,'reconciled');
  assert.equal(change.unexplainedByReportedComponents,0);assert.equal(change.classification,'calibration_hypothesis');
  assert.equal(change.calibrationConcern,true);assert.equal(q.recommendations[0].priority,'medium');
});

test('complete arithmetic alone does not excuse a large two-goal drop while meaningful late runway remains',()=>{
  const before=observation({rating:93,scores:[4,3],clock:'1:55',extra:additive(53,34,6,.32995555555555534)});
  const after=observation({rating:8,scores:[5,3],clock:'1:45',offset:15000,extra:additive(8,0,0,0)});
  const change=build([before,after]).games[0].volatility.majorChanges[0];
  assert.equal(change.arithmeticReconciliation.status,'reconciled');
  assert.equal(change.classification,'calibration_hypothesis');assert.equal(change.calibrationConcern,true);
});

test('late one-goal rally retains score-clock urgency while missing summary manpower stays unknown',()=>{
  const before=observation({rating:53,scores:[5,3],clock:'0:43',extra:additive(13,34,6,.482794)});
  const after=observation({rating:89,scores:[5,4],clock:'0:16',offset:180000,
    extra:{...additive(53,29.64918518518519,6,-.076822),scoringPartial:true,evidenceQuality:'partial',evidenceReasons:['summary-unavailable']}});
  after.state.live.sportImpact={manpower:{pulled:false,powerPlay:false,advantage:0}};
  after.qualityEvidence=captureQualityEvidence(after.state,{publishedAt:after.observedAt,observedAt:after.observedAt});
  assert.equal(after.qualityEvidence.goaliePulled,null);assert.equal(after.qualityEvidence.manpower,null);
  assert.equal(after.qualityEvidence.reportedManpower.pulled,false);
  const q=build([before,after]),change=q.games[0].volatility.majorChanges[0];
  assert.equal(change.classification,'expected_behavior');assert.equal(change.arithmeticReconciliation.status,'reconciled');
  assert.match(change.evidenceQualification,/manpower.*unverified/);
  assert.equal(change.afterRating,89);assert.equal(q.recommendations.filter(f=>f.direction==='discontinuity').length,0);
});

test('incomplete explanatory factors do not manufacture a numerical unexplained residual',()=>{
  const q=build([observation({rating:50,extra:{factors:[{label:'Context',points:10}]}}),
    observation({rating:80,offset:180000,extra:{factors:[{label:'Context',points:12}]}})]);
  const change=q.games[0].volatility.majorChanges[0];
  assert.equal(change.reportedFactorDelta,2);assert.equal(change.arithmeticReconciliation.status,'unavailable');
  assert.equal(change.unexplainedByReportedComponents,null);assert.match(change.modelPolicyAttribution,/not an unexplained/);
});

test('shootout period context applies to unlabeled attempts but not a genuine within-phase regression',()=>{
  const play=(id,period,scores,text)=>({id:String(id),sequenceNumber:id,period:{number:period},clock:{displayValue:'0:00'},
    wallclock:new Date(at+id*1000).toISOString(),awayScore:scores[0],homeScore:scores[1],text});
  const plays=[play(1,4,[1,1],'End of Overtime'),play(2,5,[0,0],'Shot saved'),play(3,5,[0,1],'Shootout goal')];
  const result=auditTimeline({plays},'NHL');
  assert.equal(result.diagnostics.shootoutTransitions.length,1);
  assert.ok(!result.findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
  const actual=auditTimeline({plays:[...plays,play(4,5,[0,0],'Shot saved')]},'NHL');
  assert.ok(actual.findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
  const playoff=auditTimeline({plays:[play(1,4,[1,1],'End of Overtime'),play(2,5,[0,0],'Start of 2OT'),play(3,5,[0,0],'Shot saved')]},'NHL');
  assert.equal(playoff.diagnostics.shootoutTransitions.length,0);assert.ok(playoff.findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
});

test('non-scoring play score decreases stay reviewable without asserting canonical scoreboard rollback',()=>{
  const plays=[0,1,2].map(i=>({id:String(i),sequenceNumber:i,period:{number:4},clock:{displayValue:'1:00'},
    wallclock:new Date(at+i*1000).toISOString(),awayScore:i===2?99:100,homeScore:115,text:i===2?'Suns Full timeout':'Play'}));
  const result=auditTimeline({plays},'NBA'),finding=result.findings.find(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK');
  assert.ok(finding);assert.equal(finding.observed.canonicalScoreboardRegressionEstablished,false);
  assert.equal(result.diagnostics.nonScoringScoreInconsistencies.length,1);
  assert.match(finding.detail,/non-scoring play metadata/);
});

test('new audit release keeps supported-sport scope provenance while older mixed counts remain unknown',()=>{
  const counts={active:1,inactive:3,unknown:0};
  assert.deepEqual(scopeEvidence({auditVersion:AUDIT_SCOPE_VERSION,sourceErrorScope:counts}).sourceErrorScope,counts);
  assert.deepEqual(scopeEvidence({auditVersion:AUDIT_VERSION,auditScopeVersion:AUDIT_SCOPE_VERSION,sourceErrorScope:counts}).sourceErrorScope,counts);
  assert.equal(scopeEvidence({auditVersion:'legacy',sourceErrorScope:counts}).sourceErrorScope,null);
});

test('usable score evidence and complete contextual evidence have separate denominators',()=>{
  const q=build([observation()]);
  assert.equal(q.evidenceCoverage.totalObservations,1);assert.equal(q.evidenceCoverage.usableScoringObservations,1);
  assert.equal(q.evidenceCoverage.completeScoreProgressionObservations,1);assert.equal(q.evidenceCoverage.completeContextualObservations,0);
  assert.equal(q.evidenceCoverage.invalidOrUnavailableScoringObservations,0);
});

test('boolean and blank score or probability fields cannot become numeric zero or one',()=>{
  for(const invalid of [false,true,' ',[],{}]){
    const o=observation({sport:'NBA',scores:[invalid,1],period:4,
      extra:{live:{winProbability:invalid},liveRawSituation:{down:invalid,distance:invalid,shotClock:invalid}}});
    const q=build([o]);
    assert.ok(q.integrityProblems.some(f=>f.codes.includes('INVALID_SCORE')));
    assert.equal(o.qualityEvidence.winProbability,null);assert.equal(o.qualityEvidence.down,null);
    assert.equal(o.qualityEvidence.distance,null);assert.equal(o.qualityEvidence.shotClock,null);
  }
  const genuine=observation({sport:'NBA',scores:[0,1],period:4,extra:{live:{winProbability:0},liveRawSituation:{shotClock:0}}});
  assert.equal(build([genuine]).integrityProblems.length,0);
  assert.equal(genuine.qualityEvidence.winProbability,0);assert.equal(genuine.qualityEvidence.shotClock,0);
});
