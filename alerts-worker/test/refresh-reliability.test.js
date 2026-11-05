import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pathToFileURL} from 'node:url';
import {checkGames} from '../src/index.js';
import {shouldSnapshot,snapshotEvidence} from '../src/snapshot-history.js';
const baseline=process.env.REFRESH_BASELINE==='1';
const {refreshSportsData,readFeed,refreshDue,MODEL_VERSION}=await import(process.env.REFRESH_SOURCE?pathToFileURL(process.env.REFRESH_SOURCE):baseline
  ? new URL('../../../production/alerts-worker/src/sports-feed.js',import.meta.url)
  : new URL('../src/sports-feed.js',import.meta.url));

function fixture(t,count=132) {
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const f={db,elapsed:0,reads:0,writes:0,batches:0,requests:0,hook:null,fetchHook:null};
  const env={DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){await f.hook?.(sql,args);f.reads++;return db.prepare(sql).get(...args)||null;},
    async all(){await f.hook?.(sql,args);f.reads++;return {results:db.prepare(sql).all(...args)};},
    async run(){await f.hook?.(sql,args);f.writes++;return {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };},async batch(statements){f.batches++;return Promise.all(statements.map(s=>s.run()));}}};
  const now=Date.now();
  f.events=Array.from({length:count},(_,i)=>({id:String(i),name:'Away at Home',date:new Date(now-86400000).toISOString(),competitions:[{
    status:{type:{state:'post',completed:true,shortDetail:'Final'},period:4,displayClock:'0:00'},
    competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'20'},
      {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'14'}]
  }]}));
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;db.close();});
  globalThis.fetch=async (value,options)=>{
    f.requests++;const url=new URL(value);
    const override=await f.fetchHook?.(url,options);if(override)return override;
    if(url.pathname.endsWith('/summary')){
      const e=f.events.find(e=>e.id===url.searchParams.get('event'));
      return Response.json({header:{competitions:e.competitions},plays:[],scoringPlays:[],winprobability:[]});
    }
    return Response.json({events:url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?f.events:[]});
  };
  f.run=async(time,extra={})=>{
    const before={reads:f.reads,writes:f.writes,requests:f.requests,batches:f.batches};
    f.atPublication=null;
    const result=await refreshSportsData(env,time,{clock:()=>f.elapsed,log:m=>f.metrics=m,
      onPublished:()=>{f.atPublication=Object.fromEntries(Object.keys(before).map(k=>[k,f[k]-before[k]]));},...extra});
    f.counts=Object.fromEntries(Object.keys(before).map(k=>[k,f[k]-before[k]]));
    return result;
  };
  f.reset=()=>{f.elapsed=0;f.hook=null;f.fetchHook=null;};
  return Object.assign(f,{env,now});
}
function record(name,f){console.log('RELIABILITY '+JSON.stringify({name,baseline,...f.counts,outcome:f.metrics.outcome,
  publicationMs:f.metrics.publicationMs,totalMs:f.metrics.totalMs,providerFailures:f.metrics.providerFailures,atPublication:f.atPublication,
  pending:f.metrics.deferredEnrichments,validationPending:f.metrics.deferredValidations,stages:f.metrics.stages,d1:f.metrics.d1}));}

test('history latency is charged before optional cache validation spends the publication reserve',async t=>{
  const f=fixture(t);await f.run(f.now);await f.run(f.now+60000);
  const prior=await readFeed(f.env,f.now+120000);
  // Deterministic elapsed-time fault injection, not a claim about remote D1.
  // Four completed-history batches cost 9s; cached summary reads cost 250ms each.
  f.hook=sql=>{
    if(sql.includes('SELECT s.game_key,s.observed_at,s.normalized_state,s.model_version'))f.elapsed+=2250;
    if(sql==='SELECT payload,updated_at FROM sports_resources WHERE key=?')f.elapsed+=250;
  };
  const result=await f.run(f.now+120000);record('slow-history-validation',f);
  assert.equal(f.metrics.providerFailures,0);
  if(baseline){
    assert.equal(result,null);assert.equal(f.metrics.reason,'deadline');
    assert.equal((await readFeed(f.env)).revision,prior.revision);
  }else{
    assert.ok(result);assert.ok(f.metrics.publicationMs<25000);
    assert.ok(f.metrics.deferredValidations>0);assert.equal(f.metrics.stages.snapshotHistory,9000);
    assert.ok(result.games.filter(g=>g.summaryValidationPending).every(g=>g.scoringPartial&&g.evidenceQuality==='partial'));
    assert.equal((await readFeed(f.env)).revision,result.revision);
  }
  f.reset();const recovered=await f.run(f.now+180000);
  assert.ok(recovered);assert.equal(recovered.games.filter(g=>g.summaryValidationPending||g.enrichmentPending).length,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_leases WHERE key='refresh'").get().n,0);
});

test('ordinary changed nonlive inputs are bounded, publish honest progress and recover',async t=>{
  const f=fixture(t,60);await f.run(f.now);
  for(const e of f.events)e.competitions[0].competitors[0].score='21';
  f.fetchHook=url=>{if(url.pathname.endsWith('/summary'))f.elapsed+=500;};
  const result=await f.run(f.now+60000);record('changed-nonlive',f);
  if(baseline){assert.equal(result,null);assert.equal(f.metrics.reason,'deadline');}
  else{
    assert.ok(result);assert.ok(f.metrics.publicationMs<25000);assert.ok(f.metrics.deferredEnrichments>0);
    for(const g of result.games.filter(g=>g.enrichmentPending)){
      assert.equal(g.teams[0][2],'21');assert.equal(g.scoringPartial,true);
      assert.equal(g.scoreboard.enrichmentPending,true);
      const newest=f.db.prepare('SELECT normalized_state FROM sports_snapshots WHERE game_key=? ORDER BY observed_at DESC LIMIT 1').get(`CFB:${g.id}`);
      assert.equal(JSON.parse(newest.normalized_state).teams[0][2],'20','partial finals cannot replace verified history');
    }
    let sends=0;await checkGames(f.env,result,async()=>{sends++;return 201;});assert.equal(sends,0);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM alerts').get().n,0);
  }
  f.reset();const recovered=await f.run(f.now+120000);
  assert.ok(recovered);assert.ok(recovered.games.every(g=>!g.enrichmentPending&&g.teams[0][2]==='21'));
});

test('failed authoritative collection never advances the header; next eligible refresh recovers',async t=>{
  const f=fixture(t,1);const old=await f.run(f.now);
  f.fetchHook=url=>{if(url.pathname.includes('/college-football/')&&!url.pathname.endsWith('/summary'))throw Error('fixture scoreboard HTTP 503');};
  assert.equal(await f.run(f.now+60000),null);
  assert.equal((await readFeed(f.env)).revision,old.revision);
  if(!baseline){assert.equal(f.metrics.reason,'scoreboard_acquisition_failed');assert.ok(f.metrics.providerErrors.some(e=>e.message==='fixture scoreboard HTTP 503'));}
  f.reset();assert.ok(await f.run(f.now+60001));
});

test('failed noncritical summary acquisition is explicit and recovers without blocking current scoreboard',async t=>{
  const f=fixture(t,1);await f.run(f.now);f.events[0].competitions[0].competitors[0].score='21';
  // Remove only the isolated test cache so the failure cannot fall back.
  f.db.prepare("DELETE FROM sports_resources WHERE key LIKE '%/summary%'").run();
  f.fetchHook=url=>{if(url.pathname.endsWith('/summary'))throw Error('fixture summary HTTP 503');};
  const result=await f.run(f.now+60000);assert.ok(result);assert.equal(result.games[0].teams[0][2],'21');
  assert.equal(result.games[0].scoringPartial,true);assert.ok(f.metrics.providerFailures>0);
  if(!baseline){assert.equal(result.games[0].enrichmentPending,true);assert.ok(f.metrics.providerErrors.some(e=>e.message==='fixture summary HTTP 503'));}
  f.reset();assert.ok(await f.run(f.now+120000));
  assert.equal(f.metrics.deferredEnrichments,0);
});

test('deadline during required D1 writes retains old header and diagnoses original stage',async t=>{
  const f=fixture(t,1);const old=await f.run(f.now);
  f.hook=sql=>{if(sql.startsWith('INSERT OR IGNORE INTO sports_feed_parts'))f.elapsed=26000;};
  assert.equal(await f.run(f.now+60000),null);assert.equal(f.metrics.providerFailures,0);
  assert.equal((await readFeed(f.env)).revision,old.revision);
  if(!baseline){assert.equal(f.metrics.failure.stage,'publication');assert.equal(f.metrics.failure.message,'Refresh deadline');assert.ok(f.metrics.d1.byPhase.feedWrites.elapsedMs>=26000);}
  f.reset();assert.ok(await f.run(f.now+60001));
});

test('primary D1 exception survives a separate lease release exception',async t=>{
  const f=fixture(t,1);await f.run(f.now);
  f.hook=(sql,args)=>{
    if(sql.startsWith('INSERT OR IGNORE INTO sports_feed_parts'))throw Error('fixture D1 part write failure');
    if(sql==='DELETE FROM sports_leases WHERE key=? AND owner=?'&&args[0]==='refresh')throw Error('fixture release failure');
  };
  assert.equal(await f.run(f.now+60000),null);assert.equal(f.metrics.lease,'release_failed');
  if(!baseline){
    assert.equal(f.metrics.failure.stage,'feedWrites');assert.equal(f.metrics.failure.message,'fixture D1 part write failure');
    assert.equal(f.metrics.releaseError.message,'fixture release failure');assert.equal(f.metrics.d1.failures,2);
  }
  f.reset();assert.ok(await f.run(f.now+120000));
});

test('existing idle eligibility can skip a minute with sub-minute cron jitter',()=>{
  const at=Date.parse('2026-11-05T16:42:17.497Z'),feed={modelVersion:MODEL_VERSION,updatedAt:new Date(at).toISOString(),games:[]};
  assert.equal(refreshDue(feed,Date.parse('2026-11-05T16:43:17.388Z')),false);
  assert.equal(refreshDue(feed,at+60000),true);
  assert.equal(refreshDue({...feed,games:[{state:'live'}]},at+12000),true);
});

test('live acquisition stays first and imminent upcoming inputs precede completed enrichment',async t=>{
  const f=fixture(t,10);
  f.events[8].competitions[0].status.type={state:'in',completed:false,shortDetail:'Q4'};
  const imminent=f.events[9];imminent.date=new Date(f.now+3600000).toISOString();
  imminent.competitions[0].status.type={state:'pre',completed:false,shortDetail:'Scheduled'};
  for(const c of imminent.competitions[0].competitors)c.score='0';
  await f.run(f.now);
  for(const e of f.events){e.name='Changed input';e.competitions[0].notes=[{headline:'Changed input'}];}
  const order=[];f.fetchHook=url=>{if(url.pathname.endsWith('/summary'))order.push(url.searchParams.get('event'));};
  assert.ok(await f.run(f.now+60000));assert.equal(order[0],'8');
  if(!baseline)assert.equal(order[1],'9');
});

test('healthy warm and model-transition fixture reports measured local cost and operation counts',async t=>{
  const f=fixture(t,132);
  await f.run(f.now,{clock:()=>performance.now()});record('healthy-cold',f);
  const warm=await f.run(f.now+60000,{clock:()=>performance.now()});record('healthy-warm',f);
  assert.ok(warm);assert.equal(f.metrics.reusedGames,132);
  // Invalidate computations only. Provider facts stay cached and compatible.
  f.db.prepare("UPDATE sports_feed SET payload=json_set(payload,'$.modelVersion','fixture-previous-model')").run();
  const row=JSON.parse(f.db.prepare('SELECT payload FROM sports_feed').get().payload);
  for(const m of Object.values(row.enrichment))m.model='fixture-previous-model';
  f.db.prepare('UPDATE sports_feed SET payload=?').run(JSON.stringify(row));
  const migrated=await f.run(f.now+120000,{clock:()=>performance.now()});record('healthy-model-transition',f);
  assert.ok(migrated);assert.equal(f.metrics.criticalCandidates,132);assert.equal(f.metrics.deferredEnrichments,0);
  assert.deepEqual(migrated.games.map(g=>g.score),warm.games.map(g=>g.score));
});

for(const kind of ['changed-input','model-transition','cache-validation'])test(`pending completed ${kind} stays partial in publication, history and notification revalidation`,async t=>{
  const f=fixture(t,2);await f.run(f.now);await f.run(f.now+60000);
  const time=f.now+120000,old=await readFeed(f.env,time);
  if(kind==='changed-input')for(const e of f.events)e.competitions[0].competitors[0].score='21';
  if(kind==='model-transition'){
    const header=JSON.parse(f.db.prepare('SELECT payload FROM sports_feed').get().payload);
    header.modelVersion='fixture-previous-model';
    for(const meta of Object.values(header.enrichment))meta.model='fixture-previous-model';
    f.db.prepare('UPDATE sports_feed SET payload=?').run(JSON.stringify(header));
  }
  const snapshots=()=>f.db.prepare('SELECT * FROM sports_snapshots ORDER BY game_key,observed_at').all();
  const before=snapshots();
  f.hook=sql=>{if(sql.includes('SELECT s.game_key,s.observed_at,s.normalized_state,s.model_version'))f.elapsed=19000;};
  const feed=await f.run(time);assert.ok(feed);
  const persisted=await readFeed(f.env,time+20000);
  assert.equal(persisted.revision,feed.revision);
  for(const g of persisted.games){
    const key=`CFB:${g.id}`,pending=kind==='cache-validation'?'summaryValidationPending':'enrichmentPending';
    for(const target of [g,g.scoreboard]){
      assert.equal(target[pending],true);assert.equal(target.scoringPartial,true);
      assert.equal(target.evidenceQuality,'partial');assert.equal(target.detailStale,true);
      assert.equal(snapshotEvidence(target,'completed').evidenceQuality,'partial');
    }
    assert.equal(shouldSnapshot(g,{completed:new Map()},time,MODEL_VERSION),false);
    if(kind==='cache-validation')assert.deepEqual(persisted.enrichment[key],old.enrichment[key],'unvalidated inputs retain their old provenance');
    else assert.equal(persisted.enrichment[key],undefined,'pending enrichment is not certified reusable');
  }
  assert.deepEqual(snapshots(),before,'pending finals do not modify any historical observation');
  // A real local subscriber and queued claim make this check non-vacuous.
  // The transport is a spy; no push request or credential is used.
  t.mock.method(Date,'now',()=>time+20000);
  f.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('fixture-device','https://push.invalid/fixture','fixture-key','fixture-auth',50,Math.floor(Date.now()/1000));
  f.db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,created_at) VALUES (?,?,?,?,?,?)')
    .run('fixture-device',`${MODEL_VERSION}:CFB:0`,99,'Fixture pending alert','Fixture',Math.floor(Date.now()/1000));
  let sends=0;
  await checkGames(f.env,feed,async()=>{sends++;return 201;});
  assert.equal(sends,0);assert.equal(f.db.prepare('SELECT status FROM alerts').get().status,'cancelled');
  f.reset();const recovered=await f.run(time+60000);assert.ok(recovered);
  assert.ok(recovered.games.every(g=>!g.enrichmentPending&&!g.summaryValidationPending));
});
