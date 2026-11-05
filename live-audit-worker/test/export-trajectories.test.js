import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNightlyExport,retainedObservation,qualitySummary} from '../src/export.js';

const at=Date.parse('2026-11-03T23:00:00Z');
const snapshot=(i,model='a')=>({game_key:'NHL:test',observed_at:at+i*15000,state:i===449?'completed':'live',rating:70,
 score_a:2,score_b:2,phase:'3',clock:'1:00',model_version:model,normalized_state:JSON.stringify({id:'test',sport:'NHL',state:'live',
  score:70,teams:[['Away','A',2],['Home','H',2]],liveRawStatus:{period:3,displayClock:'1:00'},password:'secret-value',
  liveRawSituation:{outs:1},factors:[{label:'Competitive game',points:10}],modelVersion:'nested-version'})});
function db(snapshots,custom={}){
 return {prepare(sql){assert.match(sql,/^SELECT\b/,'export must remain read only');let args=[];return {bind(...a){args=a;return this},async first(){return sql.includes('FROM sports_resources')?custom.resource||null:null},async all(){
  if(sql.includes('SELECT DISTINCT game_key'))return {results:args[1]?[]:[{game_key:'NHL:test'}]};
  if(sql.includes('run_id,game_key')&&custom.observations)return {results:custom.observations.filter(r=>r.observed_at>args[2])};
  if(sql.includes('FROM live_audit_findings'))return {results:args[0]==='NHL:test'?custom.findings||[]:[]};
  if(sql.includes('run_id,game_key'))return {results:args[2]>=at?[]:[{run_id:1,game_key:'NHL:test',observed_at:at,slate_date:'2026-11-03',sport:'NHL',rating:70,score_a:2,score_b:2,period:3,clock_seconds:60,evidence:JSON.stringify({scoringVersion:'audit-model',state:{sport:'NHL',state:'live',id:'test',startTime:'2026-11-03T23:00:00Z'}})}]};
  if(sql.includes('FROM sports_snapshots'))return {results:snapshots.filter(r=>r.observed_at>args[1]&&r.observed_at<=args[2]).slice(0,args[3])};
  return {results:[]};
 }}}};
}
test('retained snapshots preserve row model and acquisition provenance without publication fabrication',()=>{
 const r=retainedObservation(snapshot(1,'historical-model'));
 assert.equal(r.scoringVersion,'historical-model');assert.equal(r.state.modelVersion,'nested-version');
 assert.equal(r.observedAt,at+15000);assert.equal(r.feedUpdatedAt,null);assert.equal(r.qualityEvidence,null);
 assert.equal(r.provenance,'retained-scoring-snapshot');assert.equal(r.timestampKind,'scoring-snapshot-refresh-bucket');
 assert.equal(r.observationId,'sports_snapshots:NHL:test:'+(at+15000));
 assert.equal(r.state.factors[0].points,10);assert.ok(!JSON.stringify(r).includes('secret-value'));
});
test('clean games export paginated retained trajectories with model cohorts and read accounting',async()=>{
 const snapshots=Array.from({length:450},(_,i)=>snapshot(i,i<200?'old-model':'new-model'));
 const {data}=await buildNightlyExport({DB:db(snapshots)},'2026-11-03',{now:at+24*3600000});
 const g=data.games[0];assert.equal(g.findings.length,0);assert.equal(g.retainedScoringObservations.length,450);
 assert.equal(g.snapshotCoverage.truncated,false);assert.equal(data.sourceHealth.onDemandSnapshotReads.rows,450);
 assert.equal(data.sourceHealth.onDemandSnapshotReads.queries,3);
 assert.deepEqual(new Set(data.metadata.scoringModelVersions),new Set(['audit-model','old-model','new-model']));
 assert.equal(g.retainedScoringObservations.at(-1).state.state,'completed');
 assert.equal(data.metadata.schemaVersion,3);assert.equal(data.sourceHealth.onDemandSnapshotReads.scheduledQueriesAdded,0);
});
test('snapshot budget reports truncation explicitly and never silently asserts complete coverage',async()=>{
 const snapshots=Array.from({length:2100},(_,i)=>snapshot(i));
 const {data}=await buildNightlyExport({DB:db(snapshots)},'2026-11-03',{now:at+24*3600000});
 assert.equal(data.games[0].retainedScoringObservations.length,2000);assert.equal(data.games[0].snapshotCoverage.truncated,true);
 assert.ok(data.coverageGaps.some(g=>g.code==='SNAPSHOT_READ_LIMIT'));assert.equal(data.metadata.complete,false);
});

test('projection preserves exact audit diagnostics while archive compaction keeps all rating rows',async()=>{
 const row=snapshot(0),raw=JSON.parse(row.normalized_state);
 raw.live={phase:'3OT',bonus:22,aggregation:{decisiveFloor:18,positiveBonus:22},sportImpact:{points:4,competitiveFloor:18,
   competitiveTarget:81,manpower:{pulled:true,powerPlay:false,advantage:0},overtime:{depth:3,periodLength:1200,clockMode:'remaining'},
   allocation:{context:3,floorBase:60,timing:{large:'duplicate'}}}};
 raw.trajectoryScoring={adjustment:-7.5,positiveAfterHistoryCaps:3,negativeAfterFloor:-7.5,rawTrajectory:-12};
 raw.historyOwnership={combinedPoints:3,positiveLimitedByCaps:4,relevance:{recovery:{deficit:3,recovered:2}},allocation:{cap:7,factors:[{label:'Recovery',rawPoints:8,retainedPoints:3,capReduction:4}]}};
 row.normalized_state=JSON.stringify(raw);
 const projected=retainedObservation(row);
 assert.deepEqual(projected.state.live.aggregation,raw.live.aggregation);
 assert.deepEqual(projected.state.live.sportImpact.manpower,raw.live.sportImpact.manpower);
 assert.deepEqual(projected.state.live.sportImpact.overtime,raw.live.sportImpact.overtime);
 assert.equal(projected.state.live.sportImpact.allocation.floorBase,60);
 assert.deepEqual(projected.state.trajectoryScoring,raw.trajectoryScoring);
 assert.deepEqual(projected.state.historyOwnership,raw.historyOwnership);
 const {data}=await buildNightlyExport({DB:db([row])},'2026-11-03',{now:at+24*3600000});
 const archived=data.games[0].retainedScoringObservations[0];
 assert.equal(archived.rating,row.rating);assert.deepEqual(archived.scores,[row.score_a,row.score_b]);
 assert.equal(archived.state.trajectoryScoring.adjustment,-7.5);assert.equal(archived.state.historyOwnership.combinedPoints,3);
 assert.match(data.metadata.retainedSnapshotProjection.scope,/not a full normalized-state dump/);
 assert.match(data.metadata.retainedSnapshotProjection.limits,/no rating row is removed/);
});

test('projected byte budget bounds accumulated diagnostics and reports incomplete trajectories',async()=>{
 const source=snapshot(0),raw=JSON.parse(source.normalized_state);raw.factors=[{label:'large retained factor '+ 'x'.repeat(8000),points:1}];
 const normalized_state=JSON.stringify(raw),snapshots=Array.from({length:1200},(_,i)=>({...snapshot(i),normalized_state}));
 const {data}=await buildNightlyExport({DB:db(snapshots)},'2026-11-03',{now:at+24*3600000});
 const game=data.games[0];assert.ok(game.retainedScoringObservations.length<1200);
 assert.ok(game.snapshotCoverage.projectedBytes<=8*1024*1024);assert.equal(game.snapshotCoverage.truncated,true);
 assert.match(game.snapshotCoverage.detail,/projected-byte/);assert.equal(data.metadata.complete,false);
 assert.ok(data.coverageGaps.some(g=>g.code==='SNAPSHOT_READ_LIMIT'));
});

test('shared input byte guard bounds paged audit evidence and snapshots without losing game keys',async()=>{
 const keys=['NHL:aaa','NHL:bbb','NHL:ccc'],evidence=JSON.stringify({scoringVersion:'a',state:{id:'fixture',sport:'NHL',state:'live',
   startTime:'2026-11-03T23:00:00Z',retainedNote:'x'.repeat(80000)}});
 const observations=Object.fromEntries(keys.map((key,j)=>[key,Array.from({length:j===0?300:j===1?200:1},(_,i)=>({
   run_id:i,game_key:key,observed_at:at+i*15000,slate_date:'2026-11-03',sport:'NHL',rating:70,score_a:2,score_b:2,
   period:3,clock_seconds:60,evidence:j===2?JSON.stringify({scoringVersion:'a',state:{id:'ccc',sport:'NHL',state:'live'}}):evidence}))]));
 const raw=JSON.parse(snapshot(0).normalized_state);raw.factors=[{label:'retained telemetry '+ 'y'.repeat(6000),points:1}];
 const snapshots=Array.from({length:500},(_,i)=>({...snapshot(i,'a'),game_key:keys[0],normalized_state:JSON.stringify(raw)}));
 const reads=[];
 const DB={prepare(sql){assert.match(sql,/^SELECT\b/);let args=[];return {bind(...values){args=values;return this},async all(){
   if(sql.includes('SELECT DISTINCT game_key'))return {results:keys.filter(k=>k>args[1]).map(game_key=>({game_key}))};
   if(sql.includes('run_id,game_key')){assert.match(sql,/LIMIT 100$/);const result=observations[args[1]].filter(r=>r.observed_at>args[2]).slice(0,100);reads.push(result.length);return {results:result};}
   if(sql.includes('FROM sports_snapshots'))return {results:snapshots.filter(r=>r.game_key===args[0]&&r.observed_at>args[1]&&r.observed_at<=args[2]).slice(0,args[3])};
   return {results:[]};
 },async first(){return null;}};}};
 const {data}=await buildNightlyExport({DB},'2026-11-03',{now:at+48*3600000});
 const budget=data.sourceHealth.onDemandInputReads;
 assert.deepEqual(data.games.map(g=>g.gameKey),keys);assert.equal(data.games[0].observations.length,300);
 assert.equal(data.games[0].retainedScoringObservations.length,500);
 assert.ok(data.games[1].observations.length<200);assert.equal(data.games[1].observationCoverage.truncated,true);
 assert.ok(data.games[1].observationCoverage.nextOmittedAt>=at);assert.equal(data.games[2].observations.length,1);
 assert.ok(reads.every(n=>n<=100));assert.ok(budget.projectedBytes<=36*1024*1024);
 assert.equal(budget.projectedBytes,budget.auditObservationProjectedBytes+budget.scoringSnapshotProjectedBytes);
 assert.ok(budget.scoringSnapshotProjectedBytes>0);assert.equal(data.metadata.complete,false);
 assert.ok(data.coverageGaps.some(g=>g.gameKey===keys[1]&&g.code==='AUDIT_OBSERVATION_READ_LIMIT'));
 assert.match(data.games[1].observationCoverage.detail,/remain in D1/);assert.equal(observations[keys[1]].length,200);
});
test('nightly summary exposes investigation sections and separate model calibration only',()=>{
 const text=qualitySummary({games:[],modelCohorts:[{modelVersion:'a',sports:[]},{modelVersion:'b',sports:[]}],
  methodology:{},topOverrated:[],topUnderrated:[],integrityProblems:[],missingEvidence:[],recommendations:[]}).join('\n');
 for(const heading of ['Executive summary','Confirmed integrity problems','High-priority scoring-quality concerns',
  'Potentially overrated games','Potentially underrated games','Significant events and rating responses',
  'Rating volatility and discontinuities','Alert usefulness','Sport-specific calibration and model-version comparisons',
  'Evidence coverage and limitations','Recommended investigations','Model a','Model b'])assert.ok(text.includes(heading),heading);
 assert.match(text,/snapshot acquisition/);assert.match(text,/One slate cannot establish/);
});

test('zero and invalid timestamp evidence stays explicit without fabricated publication or state',()=>{
 const zero=retainedObservation({...snapshot(0),observed_at:0});assert.equal(zero.observedAt,0);assert.equal(zero.feedUpdatedAt,null);
 const invalid=retainedObservation({...snapshot(0),observed_at:'not-a-time',normalized_state:'{broken'});
 assert.equal(invalid.observedAt,'not-a-time');assert.equal(invalid.feedUpdatedAt,null);assert.equal(invalid.sourceReference.normalizedStateValid,false);
 assert.equal(invalid.state.liveRawStatus,undefined);
 const text=qualitySummary({games:[],integrityProblems:[{gameKey:'NHL:test',observedAt:0,codes:['X']},{gameKey:'NHL:test',observedAt:'bad',codes:['Y']}]}).join('\n');
 assert.match(text,/1970-01-01T00:00:00.000Z/);assert.match(text,/at unavailable: Y/);
});
test('export suppresses cross-model deltas and preserves evidence interpretation fields',async()=>{
 const observations=[0,1].map(i=>({run_id:i+1,game_key:'NHL:test',observed_at:at+i*180000,slate_date:'2026-11-03',sport:'NHL',rating:50+i*40,
  score_a:2,score_b:2,period:3,clock_seconds:60,evidence:JSON.stringify({scoringVersion:i?'new':'old',sourceFreshnessMs:0,feedUpdatedAt:0,
  comparison:{sampleGames:3},timelineDiagnostics:{scoreRollbacks:0},modelAttribution:{kind:'game'},feedModelVersion:'feed',sourceErrorScope:{active:[]},
  state:{sport:'NHL',state:'live',id:'test',startTime:'2026-11-03T23:00:00Z'}})}));
 const {data}=await buildNightlyExport({DB:db([],{observations})},'2026-11-03',{now:at+3600000});
 const o=data.games[0].observations;
 assert.equal(o[1].ratingChange,null);assert.equal(o[1].ratingChangeUnavailableReason,'model version boundary');
 assert.equal(o[0].sourceFreshnessMs,0);assert.equal(o[0].feedUpdatedAt,0);
 assert.equal(o[0].comparison.sampleGames,3);assert.equal(o[0].timelineDiagnostics.scoreRollbacks,0);assert.equal(o[0].modelAttribution.kind,'game');
 assert.equal(o[0].feedModelVersion,'feed');assert.deepEqual(o[0].sourceErrorScope.active,[]);
});
test('timeline review reads only retained referenced summary and discloses revision uncertainty',async()=>{
 const source='https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=test';
 const observations=[{run_id:1,game_key:'NHL:test',observed_at:at,slate_date:'2026-11-03',sport:'NHL',rating:90,score_a:2,score_b:2,period:4,clock_seconds:0,
  evidence:JSON.stringify({scoringVersion:'test',state:{sport:'NHL',state:'live',id:'test',startTime:'2026-11-03T23:00:00Z'},rawInputReferences:[{source}],
   auditCandidates:[{reasonCode:'TIMELINE_SCORE_ROLLBACK',deterministic:false,confidence:.7,detail:'Original retained concern'}]})}];
 const plays=[0,1,2].map(i=>({id:String(i),period:{number:3},clock:{displayValue:`0:${30-i*10}`},wallclock:new Date(at+i*1000).toISOString(),awayScore:2,homeScore:2}));
 const {data}=await buildNightlyExport({DB:db([],{observations,resource:{updated_at:at+300000,payload:JSON.stringify({plays})}})},'2026-11-03',{now:at+3600000});
 const review=data.games[0].retainedTimelineReview;
 assert.equal(review.status,'reviewed');assert.equal(review.asOf,at+300000);assert.equal(review.source,source);
 assert.match(review.limitation,/not proof of the exact originally flagged payload/);assert.equal(data.sourceHealth.onDemandTimelineReads.queries,1);
 assert.ok(data.games[0].findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'),'original finding remains intact');
});

test('clean game retrospectively exports bounded cached provider events with exact event times',async()=>{
 const source='https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=test';
 const observations=[{run_id:1,game_key:'NHL:test',observed_at:at,slate_date:'2026-11-03',sport:'NHL',rating:70,score_a:2,score_b:2,period:3,clock_seconds:60,
  evidence:JSON.stringify({scoringVersion:'test',feedUpdatedAt:at-5000,state:{sport:'NHL',state:'live',id:'test',startTime:'2026-11-03T23:00:00Z'},rawInputReferences:[{source}]})}];
 const plays=Array.from({length:205},(_,i)=>({id:String(i),scoringPlay:true,text:'Goal',period:{number:3},clock:{displayValue:'1:00'},
   wallclock:new Date(at+i*1000).toISOString(),awayScore:2,homeScore:3}));
 const {data}=await buildNightlyExport({DB:db([],{observations,resource:{updated_at:at+300000,payload:JSON.stringify({header:{id:'test'},plays})}})},'2026-11-03',{now:at+3600000});
 const game=data.games[0],review=game.retainedTimelineReview;
 assert.equal(game.findings.length,0,'later cache diagnostics never rewrite original findings');
 assert.equal(game.retainedProviderEvents.length,200);assert.equal(game.retainedProviderEventCoverage.truncated,true);
 assert.equal(data.sourceHealth.onDemandTimelineReads.queries,1);assert.ok(data.sourceHealth.onDemandInputReads.retrospectiveEventProjectedBytes>0);
 assert.equal(review.asOf,at+300000);assert.equal(review.reviewedAt,at+3600000);assert.match(review.evidenceScope,/historical observations are not backfilled/);
 for(const event of game.retainedProviderEvents){assert.equal(event.occurredAt,at+Number(event.id)*1000);assert.equal(event.providerPublishedAt,null);}
 assert.equal(game.observations[0].feedUpdatedAt,at-5000);assert.equal(game.observations[0].qualityEvidence,null);
 assert.ok(data.coverageGaps.some(g=>g.code==='RETAINED_EVENT_PROJECTION_LIMIT'));
});

test('retrospective provider events are withheld when cache header contradicts recorded game identity',async()=>{
 const source='https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=test';
 const observations=[{run_id:1,game_key:'NHL:test',observed_at:at,slate_date:'2026-11-03',sport:'NHL',rating:70,score_a:2,score_b:2,period:3,clock_seconds:60,
  evidence:JSON.stringify({scoringVersion:'test',state:{sport:'NHL',state:'live',id:'test',startTime:'2026-11-03T23:00:00Z'},rawInputReferences:[{source}]})}];
 const resource={updated_at:at+300000,payload:JSON.stringify({header:{id:'another-game'},plays:[{id:'x',scoringPlay:true,wallclock:new Date(at).toISOString()}]})};
 const {data}=await buildNightlyExport({DB:db([],{observations,resource})},'2026-11-03',{now:at+3600000});
 assert.equal(data.games[0].retainedTimelineReview.status,'invalid');assert.deepEqual(data.games[0].retainedProviderEvents,[]);
 assert.match(data.games[0].retainedTimelineReview.limitation,/different event/);
});
