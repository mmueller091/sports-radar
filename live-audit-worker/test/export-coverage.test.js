import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNightlyExport} from '../src/export.js';
import {AUDIT_VERSION} from '../src/audit.js';
import {AUDIT_SCOPE_VERSION} from '../src/scope.js';
import {sqliteD1} from './helpers/sqlite-d1.js';
import {observationReference} from '../src/trajectory-quality.js';

const start=Date.parse('2026-11-05T23:00:00Z'),date='2026-11-05';
const state=(id='coverage',rating=60)=>({id,sport:'NHL',state:'live',score:rating,baseScore:40,openingScore:40,
  startTime:new Date(start).toISOString(),modelVersion:'coverage-model',teams:[['Away','AWY',2,null,null,null,null,null,'1'],['Home','HOM',1,null,null,null,null,null,'2']],
  evidenceQuality:'complete',scoringPartial:false,liveRawStatus:{period:3,displayClock:'1:00',type:{state:'in',completed:false}},
  live:{phase:'P3',bonus:rating-40,sportImpact:{manpower:{pulled:false,powerPlay:false,advantage:0}}},
  momentumPoints:0,trajectoryScoring:{adjustment:0}});
function audit(fixture,index,{id='coverage',rating=60,rawRating=rating,game=state(id,rating),finding=false,large=false}={}){
  const evidence={auditVersion:AUDIT_VERSION,auditScopeVersion:AUDIT_SCOPE_VERSION,scoringVersion:'coverage-model',feedUpdatedAt:start+index*180000,
    sourceErrorScope:{active:[],inactive:[]},state:{...game,...(large?{unneededHistory:'x'.repeat(10000)}:{})},
    auditCandidates:finding?[{reasonCode:'TEST_REVIEW',deterministic:false,detail:'Review retained diagnostic context'}]:[]};
  fixture.sqlite.prepare('INSERT INTO live_audit_observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(index+1,'NHL:'+id,start+index*180000,date,'NHL','late:close',rawRating,2,1,3,60,JSON.stringify(evidence));
}
const run=fixture=>buildNightlyExport({DB:fixture.DB},date,{now:start+48*3600000});

test('equal-time states survive a page boundary, detail upgrades and exact raw references',async()=>{
  const f=sqliteD1();try{
    audit(f,0);
    for(let i=0;i<199;i++)f.snapshot(state(),start+i*15000);
    const at=start+199*15000;
    for(const [lifecycle,rating] of [['upcoming',35],['live',89],['completed',66]])
      f.snapshot({...state('coverage',rating),state:lifecycle,factors:[{label:lifecycle,points:rating}]},at);
    const before=f.sqlite.prepare('SELECT rowid,* FROM sports_snapshots ORDER BY rowid').all();
    const {data}=await run(f),g=data.games[0],same=g.retainedScoringObservations.filter(p=>p.observedAt===at);
    assert.equal(g.retainedScoringObservations.length,202);assert.equal(g.snapshotCoverage.complete,true);
    assert.deepEqual(same.map(p=>[p.state.state,p.rating]),[['upcoming',35],['live',89],['completed',66]]);
    assert.equal(new Set(same.map(p=>p.observationId)).size,3);
    assert.ok(same.every(p=>p.evidenceProjection==='detailed'),'each state receives its own requested diagnostic detail');
    assert.ok(same.every(p=>!p.sourceReference.trajectoryGapBefore),'page boundary does not invent a missing source observation');
    for(const p of same){
      for(const ref of [p.sourceReference,...p.rawInputReferences]){
        const row=f.sqlite.prepare('SELECT rating FROM sports_snapshots WHERE game_key=? AND observed_at=? AND state=?').get(ref.gameKey,ref.observedAt,ref.state);
        assert.equal(row.rating,p.rating);
      }
      const compact=g.surroundingScoringSnapshots.find(s=>s.observedAt===at&&s.state===p.state.state);
      assert.equal(compact.factors[0].label,p.state.state);assert.equal(compact.rawInputReference.state,p.state.state);
    }
    const refs=same.map(p=>observationReference({gameKey:g.gameKey,modelVersion:p.scoringVersion,observedAt:at,provenance:p.provenance,snapshotState:p.state.state,sourceReference:p.sourceReference}));
    assert.equal(new Set(refs.map(r=>r.referenceId)).size,3);assert.deepEqual(refs.map(r=>r.state),['upcoming','live','completed']);
    assert.deepEqual(f.sqlite.prepare('SELECT rowid,* FROM sports_snapshots ORDER BY rowid').all(),before);
    assert.ok(f.operations.every(o=>o.kind==='read'));
  }finally{f.close();}
});

test('full-span sampling paginates equal-time states by complete identity within unchanged budgets',async()=>{
  const f=sqliteD1();try{
    audit(f,0);
    for(let i=0;i<700;i++)for(const lifecycle of ['upcoming','live','completed'])f.snapshot({...state(),state:lifecycle},start+i*15000);
    const all=f.sqlite.prepare('SELECT observed_at,state FROM sports_snapshots ORDER BY observed_at,state DESC').all();
    const expected=all.filter((_,i)=>i===0||Math.floor(i*1999/2099)>Math.floor((i-1)*1999/2099));
    const {data}=await run(f),g=data.games[0],points=g.retainedScoringObservations;
    assert.deepEqual(points.map(p=>[p.observedAt,p.state.state]),expected.map(p=>[p.observed_at,p.state]));
    assert.equal(points.length,2000);assert.equal(new Set(points.map(p=>p.observationId)).size,2000);
    assert.equal(g.snapshotCoverage.availableRows,2100);assert.equal(g.snapshotCoverage.complete,false);
    assert.equal(g.snapshotCoverage.fullSpanPreserved,true);assert.equal(g.snapshotCoverage.countMismatch,false);
    assert.equal(data.sourceHealth.onDemandSnapshotReads.rows,2000);
    assert.ok(data.sourceHealth.onDemandInputReads.projectedBytes<=36*1024*1024);
    assert.ok(data.coverageGaps.some(g=>g.code==='SNAPSHOT_READ_LIMIT'));
  }finally{f.close();}
});

test('real SQLite pages full audit and snapshot cores before diagnostic reads; late peak remains present',async()=>{
  const f=sqliteD1();try{
    for(let i=0;i<121;i++)audit(f,i,{finding:true,large:true});
    for(let i=0;i<450;i++)f.snapshot({...state('coverage',i===449?99:60),unneededHistory:'y'.repeat(5000)},start+i*15000);
    audit(f,0,{id:'zz-clean'});f.snapshot(state('zz-clean'),start);
    const {data}=await run(f),g=data.games.find(g=>g.gameKey==='NHL:coverage');
    assert.equal(g.observations.length,121);assert.equal(g.observations.at(-1).observedAt,start+120*180000);
    assert.equal(g.retainedScoringObservations.length,450);assert.equal(g.retainedScoringObservations.at(-1).rating,99);
    assert.equal(g.snapshotCoverage.availableRows,450);assert.equal(g.snapshotCoverage.complete,true);assert.equal(g.snapshotCoverage.fullSpanPreserved,true);
    assert.equal(data.metadata.trajectoryCoverageComplete,true);
    assert.equal(g.diagnosticDetailCoverage.audit.requestedRows,121);assert.equal(g.diagnosticDetailCoverage.audit.includedRows,100);
    assert.equal(data.metadata.diagnosticDetailCoverageComplete,false,'detail cap does not silently label details complete');
    assert.equal(g.observations.at(-1).evidenceProjection,'detailed','bounded detail selection also preserves flagged tail endpoints');
    assert.equal(g.observations.find(o=>o.evidenceProjection==='trajectory').state.unneededHistory,undefined);
    const operations=f.operations.map(o=>o.sql),firstHeavy=operations.findIndex(sql=>sql.includes('observed_at IN ('));
    const lastCore=operations.findLastIndex(sql=>sql.includes('AS normalized_state')||sql.includes('AS evidence'));
    assert.ok(firstHeavy>lastCore,'every game receives lightweight coverage before any full state detail read');
    assert.ok(data.sourceHealth.onDemandInputReads.projectedBytes<=36*1024*1024);
    assert.ok(data.sourceHealth.onDemandSnapshotReads.rows<=20000);
    assert.equal(data.sourceHealth.onDemandSnapshotReads.providerRequestsAdded,0);
    assert.equal(data.sourceHealth.onDemandSnapshotReads.scheduledQueriesAdded,0);
    assert.ok(f.operations.every(o=>o.kind==='read'));
  }finally{f.close();}
});

test('byte-capped audit trajectories retain endpoints and never report export sampling as missing collection intervals',async()=>{
  const f=sqliteD1();try{
    const game={...state(),context:'Large retained context '+ 'c'.repeat(80000)};
    for(let i=0;i<170;i++)audit(f,i,{rating:60+i%2,game:{...game,score:60+i%2}});
    f.snapshot(state(),start);
    const {data}=await run(f),g=data.games[0];
    assert.ok(g.observations.length<170);assert.equal(g.observationCoverage.availableRows,170);
    assert.equal(g.observations[0].observedAt,start);assert.equal(g.observations.at(-1).observedAt,start+169*180000);
    assert.equal(g.observationCoverage.fullSpanPreserved,true);assert.equal(g.observationCoverage.complete,false);
    assert.ok(data.coverageGaps.some(g=>g.code==='AUDIT_OBSERVATION_READ_LIMIT'));
    assert.ok(!data.coverageGaps.some(g=>g.code==='OBSERVATION_GAP'));
    assert.equal(data.metadata.missingObservationIntervals,0);
    for(let i=1;i<g.observations.length;i++){
      const before=g.observations[i-1],current=g.observations[i];
      if(current.observedAt-before.observedAt>180000){
        assert.equal(current.ratingChange,null);assert.equal(current.sourceReference.trajectoryGapBefore,true);
        assert.match(current.ratingChangeUnavailableReason,/omitted by export sampling/);
      }else{assert.equal(current.ratingChange,current.rating-before.rating);assert.equal(current.ratingChangeFromObservedAt,before.observedAt);}
    }
    assert.ok(data.sourceHealth.onDemandInputReads.projectedBytes<=36*1024*1024);
  }finally{f.close();}
});

test('row-capped snapshot projection samples the complete retained time span instead of an early prefix',async()=>{
  const f=sqliteD1();try{
    audit(f,0);
    for(let i=0;i<2100;i++)f.snapshot(state('coverage',i===2099?95:60),start+i*15000);
    const {data}=await run(f),g=data.games[0],points=g.retainedScoringObservations;
    assert.equal(points.length,2000);assert.equal(points[0].observedAt,start);assert.equal(points.at(-1).observedAt,start+2099*15000);
    assert.equal(points.at(-1).rating,95);assert.equal(g.snapshotCoverage.availableRows,2100);
    assert.equal(g.snapshotCoverage.complete,false);assert.equal(g.snapshotCoverage.fullSpanPreserved,true);
    assert.match(g.snapshotCoverage.sampling,/full-span/);assert.equal(data.metadata.trajectoryCoverageComplete,false);
    assert.ok(data.coverageGaps.some(g=>g.code==='SNAPSHOT_READ_LIMIT'));
    assert.equal(data.sourceHealth.onDemandSnapshotReads.rows,2000,'diagnostics do not exceed the per-game retained-row cap');
  }finally{f.close();}
});

test('SQL projection preserves JSON booleans, explicit unavailable ratings, invalid JSON and audit scope',async()=>{
  const f=sqliteD1();try{
    audit(f,0,{rawRating:0,game:{...state(),score:null}});
    audit(f,1,{rawRating:0,game:{...state(),score:0}});
    f.snapshot(state(),start);
    f.sqlite.prepare('INSERT INTO sports_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('NHL:coverage',start+15000,'NHL','live',60,'2','1','3','0:59','{broken','coverage-model');
    const {data}=await run(f),g=data.games[0];
    assert.equal(g.observations[0].rating,null);assert.equal(g.observations[0].rawRating,0);
    assert.equal(g.observations[0].ratingInterpretation.legacyNullCoercion,true);
    assert.equal(g.observations[1].rating,0,'genuine numeric zero remains visible as invalid evidence');
    assert.equal(g.observations[0].auditScopeVersion,AUDIT_SCOPE_VERSION);assert.deepEqual(g.observations[0].sourceErrorScope.active,[]);
    assert.equal(g.retainedScoringObservations[0].state.scoringPartial,false);
    assert.equal(g.retainedScoringObservations[0].state.liveRawStatus.type.completed,false);
    assert.equal(g.retainedScoringObservations[1].sourceReference.normalizedStateValid,false);
    assert.ok(data.scoringQuality.integrityProblems.some(p=>p.codes.includes('NORMALIZED_STATE_INVALID')));
    const raw=f.sqlite.prepare('SELECT rating,evidence FROM live_audit_observations ORDER BY observed_at').all();
    assert.equal(raw[0].rating,0);assert.equal(JSON.parse(raw[0].evidence).state.score,null,'export interpretation never rewrites history');
  }finally{f.close();}
});

test('export headline distinguishes original null-coercion findings from current confirmed integrity defects',async()=>{
  const f=sqliteD1();try{
    audit(f,0,{rawRating:0,game:{...state(),score:null}});f.snapshot(state(),start);
    const original={deterministic:true,detail:'Historical audit recorded zero',observed:{rating:0}};
    f.sqlite.prepare('INSERT INTO live_audit_findings VALUES (?,?,?,?,?,?,?,?,?,?,?)').run('NHL:coverage','RATING_OUT_OF_RANGE',start,start,null,'recovered',1,'critical',1,'audit collection',JSON.stringify(original));
    const {data,summary}=await run(f);
    assert.equal(data.metadata.integrityFailures,1,'original finding classification remains available');
    assert.equal(data.metadata.currentConfirmedIntegrityFailures,0);assert.equal(data.metadata.currentAuditCollectionErrors,1);
    assert.equal(data.findings[0].classification,'confirmed_integrity_failure');
    assert.equal(data.scoringQuality.historicalFindingReview[0].classification,'audit_collection_error');
    assert.match(summary,/Original recorded findings: 1 \(1 recorded deterministic classifications/);
    assert.match(summary,/Current historical-finding review: 0 confirmed integrity findings; 1 audit-collection errors/);
    assert.match(summary,/original recorded classification confirmed_integrity_failure.*Current review: audit_collection_error/);
    assert.doesNotMatch(summary,/\(1 deterministic integrity failures/);
    assert.equal(f.sqlite.prepare('SELECT evidence FROM live_audit_findings').get().evidence,JSON.stringify(original));
  }finally{f.close();}
});
