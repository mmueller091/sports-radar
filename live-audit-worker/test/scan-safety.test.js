import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {scan} from '../src/index.js';
import {sqliteD1} from './helpers/sqlite-d1.js';

const now=Date.parse('2026-11-04T02:00:00Z');
const game=(extra={})=>({id:'123',sport:'NHL',state:'live',score:65,openingScore:50,baseScore:50,
  modelVersion:'test-model',startTime:'2026-11-03T23:00:00Z',providerPath:'hockey/nhl',
  teams:[['Away','AWY','2',null,null,null,null,null,'1'],['Home','HOM','1',null,null,null,null,null,'2']],
  liveRawStatus:{period:3,displayClock:'10:00',type:{state:'in',completed:false}},
  factors:[{label:'Game-state baseline',points:50}],live:{phase:'3rd period',bonus:15,components:{pressure:0}},
  evidenceQuality:'complete',evidenceReasons:[],evidenceCoverage:{scope:'score-progression',eventStream:'not-established'},
  ...extra});
const errorUrl=id=>'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event='+id;
function noExternal(t,db){
  let network=0,ai=0;
  t.mock.method(globalThis,'fetch',()=>{network++;throw new Error('External request forbidden during audit scan');});
  return {env:{DB:db.DB,AI:{run(){ai++;throw new Error('AI request forbidden during audit scan');}}},
    assertClean(){assert.equal(network,0);assert.equal(ai,0);assert.ok(db.operations.filter(o=>o.kind==='write').every(o=>o.table.startsWith('live_audit_')));}};
}
const finding=(db,code)=>db.sqlite.prepare('SELECT * FROM live_audit_findings WHERE reason_code=?').get(code);

test('pregame qualitative checks use the existing feed and finding tables without provider calls or live observations',async t=>{
  const db=sqliteD1();t.after(()=>db.close());const guard=noExternal(t,db);
  const g=game({sport:'NFL',state:'upcoming',factors:[{contextType:'confirmed_key_starters',contextText:'A confirmed quarterback starts',points:4}]});
  db.feed([g],now-1000);await scan(guard.env,now);guard.assertClean();
  assert.equal(finding(db,'GENERIC_STARTER_BONUS').status,'open');
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM live_audit_observations').get().n,0);
  g.factors=[];db.feed([g],now+1000);await scan(guard.env,now+2000);await scan(guard.env,now+3000);
  assert.equal(finding(db,'GENERIC_STARTER_BONUS').status,'recovered');guard.assertClean();
});

test('actual scan SQL is audit-only and preserves per-game model attribution and structured evidence',async t=>{
  const db=sqliteD1();t.after(()=>db.close());
  const g=game({modelVersion:'canonical-game-model',inputEvidence:{clockMode:'elapsed'},
    historyOwnership:{eventPoints:3},trajectoryScoring:{adjustment:-1},momentumPoints:3});
  db.feed([g],now-15000,{modelVersion:'different-feed-model',parts:true});
  db.snapshot(g,now-120000);
  const original=db.sqlite.prepare('SELECT * FROM sports_snapshots').all();
  const guard=noExternal(t,db),result=await scan(guard.env,now);guard.assertClean();
  assert.equal(result.gamesChecked,1);assert.equal(result.providerRequests,0);assert.equal(result.notifications,0);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM sports_snapshots').all(),original);
  const row=db.sqlite.prepare('SELECT * FROM live_audit_observations').get(),e=JSON.parse(row.evidence);
  assert.equal(e.scoringVersion,'canonical-game-model');assert.equal(e.feedModelVersion,'different-feed-model');
  assert.equal(e.modelAttribution,'canonical-game');assert.equal(e.state.historyOwnership.eventPoints,3);
  assert.equal(e.qualityEvidence.scoreProgressionQuality,'complete');assert.equal(e.qualityEvidence.providerPublication,null);
  assert.equal(e.qualityEvidence.canonicalPublishedAt,null);assert.equal(e.qualityEvidence.canonicalRefreshStartedAt,now-15000);
  assert.equal(row.slate_date,'2026-11-03');assert.equal(db.metrics().readQueries,8);
  const run=db.sqlite.prepare('SELECT * FROM live_audit_runs').get();
  assert.equal(run.provider_requests,0);assert.equal(run.notifications,0);assert.equal(run.error,null);
});

test('source errors distinguish active games from other retained requests without new queries',async t=>{
  const db=sqliteD1();t.after(()=>db.close());const guard=noExternal(t,db);
  const live=game(),future=game({id:'999',state:'upcoming'});
  db.feed([live,future],now-1000,{sourceErrors:[errorUrl('999'),errorUrl('888')]});await scan(guard.env,now);
  assert.equal(finding(db,'SOURCE_ERRORS'),undefined);
  const e=JSON.parse(db.sqlite.prepare('SELECT evidence FROM live_audit_observations').get().evidence);
  assert.equal(e.sourceErrorScope.active,0);assert.equal(e.sourceErrorScope.inactive,2);
  db.feed([live,future],now+179000,{sourceErrors:[errorUrl('123'),errorUrl('999')]});await scan(guard.env,now+180000);
  const f=finding(db,'SOURCE_ERRORS');assert.equal(f.status,'watch');
  const scoped=JSON.parse(f.evidence);assert.equal(scoped.observed.active,1);assert.equal(scoped.observed.inactive,1);
  assert.deepEqual(scoped.affectedGames,['NHL:123']);guard.assertClean();
});

test('deterministic failures still open immediately and require two clean scans to recover',async t=>{
  const db=sqliteD1();t.after(()=>db.close());const guard=noExternal(t,db);
  db.feed([game({score:100})],now-1000);await scan(guard.env,now);
  assert.equal(finding(db,'RATING_OUT_OF_RANGE').status,'open');
  db.feed([game()],now+179000);await scan(guard.env,now+180000);
  assert.equal(finding(db,'RATING_OUT_OF_RANGE').status,'recovering');
  db.feed([game()],now+359000);await scan(guard.env,now+360000);
  assert.equal(finding(db,'RATING_OUT_OF_RANGE').status,'recovered');
  const events=db.sqlite.prepare("SELECT event FROM live_audit_events WHERE reason_code='RATING_OUT_OF_RANGE' ORDER BY at").all().map(r=>r.event);
  assert.deepEqual(events,['opened','recovered']);guard.assertClean();
});

test('heuristic concerns still need two scans and retain independent recovery history',async t=>{
  const db=sqliteD1();t.after(()=>db.close());const guard=noExternal(t,db);
  const wide=game({score:91,teams:[['Away','AWY','5'],['Home','HOM','1']],liveRawStatus:{period:3,displayClock:'1:00',type:{state:'in'}}});
  db.feed([wide],now-1000);await scan(guard.env,now);assert.equal(finding(db,'LATE_WIDE_MARGIN_HIGH').status,'watch');
  db.feed([wide],now+179000);await scan(guard.env,now+180000);assert.equal(finding(db,'LATE_WIDE_MARGIN_HIGH').status,'open');
  db.feed([{...wide,score:60}],now+359000);await scan(guard.env,now+360000);assert.equal(finding(db,'LATE_WIDE_MARGIN_HIGH').status,'recovering');
  db.feed([{...wide,score:60}],now+539000);await scan(guard.env,now+540000);assert.equal(finding(db,'LATE_WIDE_MARGIN_HIGH').status,'recovered');
  assert.deepEqual(db.sqlite.prepare("SELECT event FROM live_audit_events WHERE reason_code='LATE_WIDE_MARGIN_HIGH' ORDER BY at").all().map(r=>r.event),['opened','recovered']);
  guard.assertClean();
});

test('unchanged scheduled cadence remains exactly one trigger every three minutes',()=>{
  const wrangler=fs.readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
  assert.match(wrangler,/crons\s*=\s*\["\*\/3 \* \* \* \*"\]/);
  assert.equal((wrangler.match(/\[triggers\]/g)||[]).length,1);
  assert.doesNotMatch(wrangler,/\[ai\]|\[\[queues|durable_objects/);
});

test('deployed baseline and upgraded scan use the same SQL read/write counts; bytes are measured',async t=>{
  const compressed=fs.readFileSync(new URL('./fixtures/audit-quality-1-worker.js.gz',import.meta.url));
  const source=gunzipSync(compressed);
  const manifest=JSON.parse(fs.readFileSync(new URL('./fixtures/audit-quality-1-worker.js.manifest.json',import.meta.url),'utf8'));
  assert.equal(createHash('sha256').update(source).digest('hex'),manifest.sha256);
  const baseline=await import('data:text/javascript;base64,'+source.toString('base64'));
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/november-3-observed.json',import.meta.url),'utf8'));
  const retained=fixture.cases.find(g=>g.gameKey==='NHL:401892634').snapshots.find(s=>s.observed_at===1793760900000);
  const g={...retained.state,providerPath:'hockey/nhl'};
  const measurements=[];
  for(const [version,fn] of [['baseline',baseline.scan],['upgraded',scan]]){
    const db=sqliteD1();t.after(()=>db.close());
    db.feed([g],now-15000,{modelVersion:g.modelVersion,parts:true});
    const started=performance.now();const result=await fn({DB:db.DB,AI:{run(){throw new Error('AI prohibited');}}},now);
    measurements.push({version,...db.metrics(),executionMs:performance.now()-started,storageWrites:result.storageWrites});
    assert.equal(result.providerRequests,0);assert.equal(result.notifications,0);
  }
  assert.equal(measurements[1].readQueries,measurements[0].readQueries);
  assert.equal(measurements[1].writeStatements,measurements[0].writeStatements);
  assert.equal(measurements[1].observationRows,measurements[0].observationRows);
  assert.ok(measurements[1].observationBytes>measurements[0].observationBytes);
  t.diagnostic(JSON.stringify({scenario:'Same retained Winnipeg state, one live game, no cached event stream, in-memory SQLite; timings exclude D1 network and billing',measurements}));
});
