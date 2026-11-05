import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildScoringQuality,captureQualityEvidence} from '../src/quality.js';
import {lifecycleOf} from '../src/trajectory-quality.js';
const archive=JSON.parse(fs.readFileSync(new URL('./fixtures/november3-observed.json',import.meta.url),'utf8'));
const epoch=Date.parse('2026-11-03T23:00:00Z');
function obs({rating=70,scores=[2,2],clock='1:00',period=3,sport='NHL',state='live',offset=0,model='one',quality={},raw={},factors=[]}={}){
  const g={id:'1',sport,state,score:rating,teams:[['Away','A',scores[0],'','','','','','away'],['Home','H',scores[1],'','','','','','home']],
    liveRawStatus:{period,displayClock:clock},liveRawSituation:raw,factors,evidenceQuality:'complete'};
  return {observedAt:epoch+offset,rating,scores,period,state:g,scoringVersion:model,feedRevision:`${offset}-${model}`,
    qualityEvidence:{...captureQualityEvidence(g,{publishedAt:epoch+offset,observedAt:epoch+offset}),...quality}};
}
const build=observations=>buildScoringQuality([{gameKey:'NHL:1',sport:'NHL',matchup:'Fixture',observations}]);

test('November 3 observed Winnipeg winner is decided, not a 59-point live underrating',()=>{
  const q=buildScoringQuality(archive.games),g=q.games.find(g=>g.gameKey==='NHL:401892634');
  assert.equal(g.peakRating,95);assert.equal(g.ratingContexts.decided[0].rating,59);
  assert.ok(!q.topUnderrated.some(f=>f.gameKey===g.gameKey&&f.rating===59));
  assert.equal(g.volatility.maxAbsoluteChange,77);
  assert.ok(g.volatility.majorChanges.some(c=>c.beforeRating===11&&c.afterRating===88));
  assert.ok(!g.volatility.majorChanges.some(c=>c.afterRating===59),'completed transition is not a live discontinuity');
  const tied=g.comebackAnalysis.find(c=>c.clockSeconds===31);
  assert.equal(tied.maximumObservedDeficit,4);assert.equal(tied.deficitRecovered,4);assert.equal(tied.gameSecondsElapsed,241);
  assert.equal(tied.historicalRarity.percentile,null,'one observed comeback cannot establish historical rarity');
});
test('November 3 Dallas 85 crossing is observed at seven seconds, bounded by the 82 observation',()=>{
  const g=buildScoringQuality(archive.games).games.find(g=>g.gameKey==='NHL:401892640');
  const t=g.thresholds.find(t=>t.threshold===85);
  assert.equal(t.firstObservedClockSeconds,7);assert.equal(t.gameTimeRemainingSeconds,7);
  assert.deepEqual(t.crossingInterval,{from:1793759815502,to:1793759995435});
  assert.equal(t.exactCrossingAt,null);assert.equal(t.firstCrossingUsefulness,'very_short_observed_runway');
  assert.equal(t.episodeCount,1);assert.equal(t.episodes[0].rightCensored,true);
});
test('November 3 Carolina early-third rating is not a late-final-minute underrating',()=>{
  const q=buildScoringQuality(archive.games),g=q.games.find(g=>g.gameKey==='NHL:401892642');
  assert.equal(g.ratingTrajectory[0].clockSeconds,1200);assert.equal(g.peakRating,61);
  assert.ok(!q.topUnderrated.some(f=>f.gameKey===g.gameKey));
});
test('overtime 99 and shootout 97 are not inflation; shootout attempts do not imply a decided overtime goal',()=>{
  const q=build([obs({rating:99,period:4,clock:'2:00'}),obs({rating:97,period:5,scores:[3,2],clock:'0:00',offset:180000})]);
  assert.equal(q.topOverrated.length,0);assert.equal(q.games[0].peakRating,99);
  assert.equal(lifecycleOf({state:'live'},'NHL',5,[3,2]),'live');
  assert.equal(lifecycleOf({state:'live',liveRawStatus:{periodDescriptor:{periodType:'OT'}}},'NHL',5,[3,2]),'decided');
  assert.equal(lifecycleOf({state:'live',liveRawStatus:{type:{detail:'End of 2OT'}}},'NHL',5,[3,2]),'decided');
  assert.equal(lifecycleOf({state:'live',liveRawStatus:{type:{detail:'In SO'}}},'NHL',4,[3,2]),'live');
});
test('all threshold boundaries are inclusive and repeated episodes disclose censoring',()=>{
  const q=build([obs({rating:85}),obs({rating:84,offset:180000}),obs({rating:90,offset:360000}),obs({rating:95,offset:540000})]);
  const t=q.games[0].thresholds.find(t=>t.threshold===85);
  assert.equal(t.episodeCount,2);assert.equal(t.episodes[0].leftCensored,true);assert.equal(t.episodes[0].rightCensored,false);
  assert.equal(t.estimatedSecondsAbove,360);assert.equal(t.remainedSatisfied,false);
  assert.equal(q.games[0].thresholds.find(t=>t.threshold===95).firstObservedRating,95);
});
test('model switches never create same-model durations or discontinuities across an intervening release',()=>{
  const q=build([obs({rating:50,model:'one'}),obs({rating:95,offset:180000,model:'two'}),obs({rating:90,offset:360000,model:'one'})]);
  const a=q.games.find(g=>g.modelVersion==='one');assert.equal(a.coveredSeconds,0);assert.equal(a.volatility.observedChanges,0);
  const overview=q.calibration.find(c=>c.sport==='NHL');assert.equal(overview.mixedModelsSuppressed,true);
  assert.equal(overview.gamesObserved,1);assert.equal(overview.peakDistribution.median,null);assert.equal(overview.percentageReaching[85],null);
  assert.equal(q.modelCohorts.length,2);
  assert.ok(a.eventResponses.every(e=>!e.before||!e.after||e.before.observedAt!==epoch||e.after.observedAt!==epoch+360000),'event-response brackets cannot bridge a different intervening model');
});
test('returning model has separately censored threshold episodes, not invented continuity',()=>{
  const q=build([obs({rating:90,model:'one'}),obs({rating:95,offset:180000,model:'two'}),obs({rating:90,offset:360000,model:'one'})]);
  const t=q.games.find(g=>g.modelVersion==='one').thresholds.find(t=>t.threshold===85);
  assert.equal(t.episodeCount,2);assert.equal(t.episodes[0].censoredByModelBoundary,true);
  assert.equal(t.episodes[0].rightCensored,true);assert.equal(t.episodes[1].leftCensored,true);assert.equal(t.episodes[1].entryInterval,null);
});
test('retained snapshot acquisition improves trajectory but cannot fabricate publication duration',()=>{
  const a=obs({rating:80}),b=obs({rating:90,offset:30000});delete a.qualityEvidence;delete b.qualityEvidence;
  a.provenance=b.provenance='retained-scoring-snapshot';
  const q=buildScoringQuality([{gameKey:'NHL:1',sport:'NHL',observations:[],retainedScoringObservations:[a,b]}]);
  const g=q.games[0];assert.equal(g.peakRating,90);assert.equal(g.thresholds[2].firstObservedAt,epoch+30000);
  assert.equal(g.thresholds[2].estimatedSecondsAbove,null);assert.equal(g.coveredSeconds,0);
  assert.equal(q.evidenceCoverage.structuredEvidence,0);assert.equal(q.evidenceCoverage.legacyRecoveredFromRetainedState,2);
});
test('complete production score progression is not complete audit situation coverage',()=>{
  const q=build([obs()]);assert.equal(q.evidenceCoverage.byStatus.complete,0);assert.equal(q.evidenceCoverage.byStatus.partial,1);
  assert.equal(q.evidenceCoverage.missingFieldCounts.manpower,1);
});
test('producer-invalid and extractor-invalid evidence stay invalid independently of complete score progression',()=>{
  const q=build([obs({quality:{evidenceQuality:'invalid'}}),obs({offset:180000,quality:{evidenceQuality:'complete',retainedEvidenceStatus:'invalid'}})]);
  assert.equal(q.evidenceCoverage.byStatus.invalid,2);assert.equal(q.evidenceCoverage.byStatus.complete,0);
  assert.equal(q.games[0].thresholds[0].estimatedSecondsAbove,null);
});
test('stale and invalid evidence remains visible and cannot establish measured duration',()=>{
  const a=obs({rating:100}),b=obs({rating:90,offset:600000});b.qualityEvidence.publishedAt=epoch;
  const q=build([a,b]);assert.equal(q.integrityProblems[0].codes[0],'INVALID_RATING');
  assert.equal(q.evidenceCoverage.byStatus.invalid,2);assert.equal(q.games[0].coveredSeconds,0);
  assert.equal(q.games[0].peakRating,null);assert.equal(q.games[0].thresholds.find(t=>t.threshold===95).firstObservedAt,null);
  const c=q.calibration.find(c=>c.sport==='NHL');assert.equal(c.gamesWithRating,0);assert.equal(c.peakDistribution.max,null);assert.equal(c.percentageReaching[95],null);
});
test('invalid 101 or stale 99 cannot create a high-rating calibration result or a threshold crossing',()=>{
  const invalid=obs({rating:101,offset:180000}),stale=obs({rating:99,offset:600000});stale.qualityEvidence.publishedAt=epoch;
  const q=build([obs({rating:80}),invalid,stale]),g=q.games[0],c=q.calibration.find(c=>c.sport==='NHL');
  assert.equal(g.peakRating,80);assert.equal(c.peakDistribution.max,80);assert.equal(c.percentageReaching[95],0);
  assert.equal(g.thresholds.find(t=>t.threshold===85).firstObservedAt,null);assert.equal(g.invalidOrUnavailableRatingsExcluded,2);
  assert.equal(g.ratingTrajectory.length,3);assert.ok(q.integrityProblems.some(f=>f.codes.includes('INVALID_RATING')));
  assert.equal(g.volatility.maxAbsoluteChange,null);assert.equal(g.volatility.invalidSourceChangesExcluded,2);
});
test('blocked source candidates appear in evidence review, not in potentially underrated rankings',()=>{
  const q=build([obs({rating:60,period:4,scores:[2,2],quality:{scoringPartial:true}})]);
  assert.equal(q.topUnderrated.length,0);assert.equal(q.evidenceReview.length,1);
  assert.equal(q.evidenceReview[0].classification,'data_quality_limitation');
  assert.equal(q.executiveSummary.evidenceReviewGroups,1);assert.equal(q.executiveSummary.blockedScoringCandidateObservations,1);
  assert.equal(q.modelCohorts[0].topUnderrated.length,0);
});
test('invalid source between high samples censors threshold continuity without claiming an observed exit',()=>{
  const q=build([obs({rating:90}),obs({rating:99,offset:180000,quality:{retainedEvidenceStatus:'invalid'}}),obs({rating:90,offset:360000})]);
  const t=q.games[0].thresholds.find(t=>t.threshold===85);assert.equal(t.episodeCount,2);
  assert.equal(t.episodes[0].censoredByInvalidEvidence,true);assert.equal(t.episodes[0].exitInterval,null);assert.equal(t.remainedSatisfied,null);
});
test('malformed evidence arrays and missing state are unavailable, not fabricated zero possession or score',()=>{
  const q=build([{observedAt:epoch,rating:null,scores:null,state:null,scoringVersion:'one',qualityEvidence:null}]);
  assert.equal(q.evidenceCoverage.byStatus.invalid,1);assert.ok(q.integrityProblems.some(f=>f.codes.includes('INVALID_SCORE')));
  const b=obs({quality:{timeouts:null,bases:null}});assert.doesNotThrow(()=>build([b]));
  b.sourceReference={table:'sports_snapshots',normalizedStateValid:false};
  const corrupt=build([b]);assert.equal(corrupt.evidenceCoverage.byStatus.invalid,1);
  assert.ok(corrupt.integrityProblems[0].codes.includes('NORMALIZED_STATE_INVALID'));
});
test('score and clock corrections remain in the investigation ledger',()=>{
  const q=build([obs({rating:90,scores:[2,2],clock:'0:30'}),obs({rating:70,scores:[1,2],clock:'2:30',offset:180000})]);
  const c=q.games[0].volatility.majorChanges[0];assert.equal(c.scoreCorrection,true);assert.equal(c.clockCorrection,true);
  assert.equal(c.classification,'data_quality_limitation');
});
test('a provider score regression cannot manufacture a four-goal comeback',()=>{
  const q=build([obs({rating:10,scores:[0,4],clock:'4:00'}),obs({rating:60,scores:[0,0],clock:'3:00',offset:180000})]);
  assert.equal(q.games[0].comebackAnalysis.length,0);
  assert.ok(!q.games[0].decisiveMoments.some(e=>e.signals.includes('Substantial comeback observed so far')));
  assert.equal(q.games[0].volatility.majorChanges[0].scoreCorrection,true);
});
test('repeated recovery evidence is summarized without dropping any rating observation',()=>{
  const q=build([obs({rating:10,scores:[0,4],clock:'4:00'}),obs({rating:87,scores:[4,4],clock:'0:31',offset:180000}),obs({rating:92,scores:[4,4],clock:'0:31',offset:210000})]);
  const g=q.games[0],recovery=g.comebackAnalysis[0];
  assert.equal(g.ratingTrajectory.length,3);assert.equal(g.comebackAnalysis.length,1);
  assert.equal(recovery.supportingObservationCount,2);assert.deepEqual(recovery.ratingRange,{min:87,max:92});
  assert.equal(recovery.to.observedAt,epoch+180000);assert.equal(recovery.lastReference.observedAt,epoch+210000);
});
test('real out-of-range final ratings remain deterministic integrity problems without becoming live peaks',()=>{
  const q=build([obs({rating:80}),obs({rating:120,state:'completed',offset:180000})]);
  assert.equal(q.games[0].peakRating,80);assert.ok(q.integrityProblems.some(f=>f.codes.includes('INVALID_RATING')));
  assert.equal(q.games[0].ratingContexts.completed[0].rating,120);
  const finalsOnly=build([obs({rating:99,state:'completed'})]);
  assert.equal(finalsOnly.calibration.find(c=>c.sport==='NHL').gamesObserved,0);
  assert.equal(finalsOnly.calibration.find(c=>c.sport==='NHL').gamesWithRating,0);
});
test('recommendations preserve required evidence fields and never propose a numeric target',()=>{
  const q=build([obs({rating:11,scores:[2,4],clock:'1:57'}),obs({rating:88,scores:[3,4],clock:'0:59',offset:180000,factors:[{label:'Manpower pressure',points:35}]})]);
  const r=q.recommendations.find(r=>r.direction==='discontinuity');assert.ok(r);
  for(const field of ['gameKey','observedAt','rating','verifiedSituation','whyInvestigate','scoringComponents','suspectedCausalMechanism','supportingObservations','comparableSituations','missingEvidence','confidence','potentialUserImpact','proposedInvestigation','expectedEffectsOnOtherScenarios','replayTestingRequired'])assert.ok(field in r,field);
  assert.equal(r.classification,'calibration_hypothesis');assert.equal(r.replayTestingRequired,true);
  assert.equal(r.estimatedImpact.candidateScoreDelta,null);assert.equal(r.estimatedImpact.productionScoreDelta,0);
});
test('hidden soccer is not prioritized and unverified tennis does not enter Grand Slam calibration',()=>{
  const soccer=obs({sport:'Soccer',rating:99,period:2,scores:[8,0],clock:'90:00'});
  const tennis=obs({sport:'Tennis',rating:98,period:3,scores:[1,1],quality:{grandSlam:false}});
  const q=buildScoringQuality([{gameKey:'Soccer:1',sport:'Soccer',observations:[soccer]},{gameKey:'Tennis:1',sport:'Tennis',observations:[tennis]}]);
  assert.ok(!q.recommendations.some(r=>r.sport==='Soccer'));assert.equal(q.calibration.find(c=>c.sport==='Tennis').gamesObserved,0);
  assert.equal(q.calibration.find(c=>c.sport==='Soccer').publicRecommendation,false);
});
test('later cached provider events enrich retrospective response without backfilling historical availability',()=>{
  const observations=[obs({rating:60,scores:[1,2]}),obs({rating:70,scores:[2,2],offset:180000})];
  const original=structuredClone(observations);
  const event={id:'retained-goal-1',kinds:['goal','game_tying'],text:'Game-tying goal',scoringPlay:true,
    occurredAt:epoch+60000,timestampKind:'provider-event-wallclock',period:3,scores:[2,2],
    sourceAcquiredAt:epoch+86400000,reviewedAt:epoch+86500000,providerPublishedAt:null,
    source:'retrospective-cached-provider-summary',availabilityAtRating:'unknown'};
  const q=buildScoringQuality([{gameKey:'NHL:1',sport:'NHL',matchup:'Fixture',observations,retainedProviderEvents:[event]}]);
  const e=q.games[0].eventResponses.find(e=>e.event.id===event.id);assert.ok(e,'retrospective event must be analyzed separately');
  assert.equal(e.event.occurredAt,epoch+60000);assert.equal(e.event.sourceAcquiredAt,epoch+86400000);
  assert.equal(e.event.reviewedAt,epoch+86500000);assert.equal(e.event.providerPublishedAt,null);
  assert.equal(e.event.availabilityAtRating,'unknown');assert.equal(e.latency.exactResponseMs,null);
  assert.equal(e.latency.providerPublicationLatencyMs,null);assert.equal(e.latency.providerLatencyMs,null);
  assert.deepEqual(observations,original,'cached later evidence must not mutate or backfill historical observations');
  assert.deepEqual(q.confirmedScoringDefects,[]);assert.match(q.methodology.reaction,/Later-revision.*availability.*unknown/);
});
