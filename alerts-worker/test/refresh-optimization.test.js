import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData,readFeed,publishFeed,requestFeedRefresh,MODEL_VERSION} from '../src/sports-feed.js';
import {finalContent,shouldSnapshot} from '../src/snapshot-history.js';
import {summaryCandidate,REFRESH_LEASE_MS,refreshBudget} from '../src/refresh-policy.js';
import worker from '../src/index.js';

function database(t) {
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const statements=[];const hooks={};t.after(()=>db.close());
  return {db,statements,hooks,DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){await hooks.before?.(sql,args);statements.push(sql);return db.prepare(sql).get(...args)||null;},
    async all(){await hooks.before?.(sql,args);statements.push(sql);return {results:db.prepare(sql).all(...args)};},
    async run(){await hooks.before?.(sql,args);statements.push(sql);return {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;}}};
}
function event(id,state='pre',line=false) {return {id:String(id),name:'Away at Home',date:'2026-10-30T20:00:00Z',competitions:[{
  status:{type:{state,completed:state==='post',shortDetail:state==='post'?'Final':state==='in'?'Q4':'Scheduled'},period:state==='pre'?0:4,displayClock:state==='in'?'1:00':'0:00'},
  competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:state==='pre'?'0':'20'},
    {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:state==='pre'?'0':'14'}],
  ...(line?{odds:[{details:'AWY -3',spread:3,overUnder:45,awayTeamOdds:{favorite:true}}]}:{})
}]};}
function fixture(t,events) {
  const calls=[];let summaryHook;
  const original=globalThis.fetch;
  globalThis.fetch=async (value,options)=>{
    const url=new URL(value);calls.push(url.href);
    if(url.pathname.endsWith('/summary')) {
      const id=url.searchParams.get('event');const game=events.find(e=>e.id===id);
      if(summaryHook){const result=await summaryHook(id,options);if(result)return result;}
      return Response.json({header:{competitions:game.competitions},plays:[],scoringPlays:[],winprobability:[]});
    }
    return Response.json({events:url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?events:[]});
  };
  t.after(()=>{globalThis.fetch=original;});
  return {events,calls,set hook(value){summaryHook=value;},summaryCalls:()=>calls.filter(url=>url.includes('/summary'))};
}
const silent={log:()=>{}};
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(r=>setImmediate(r));

async function seedStale(env,now) {
  const feed=await refreshSportsData(env,now,silent);
  const header=JSON.parse(env.db.prepare('SELECT payload FROM sports_feed WHERE id=1').get().payload);
  header.updatedAt=new Date(now-60000).toISOString();
  env.db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify(header));
  env.db.prepare('UPDATE sports_resources SET updated_at=?').run(now-60000);
  return {...feed,updatedAt:header.updatedAt};
}

for(const alias of ['Draft Kings','draftkings','  DRAFT   KINGS  ','Draft\tKings']) test(`final provider alias ${JSON.stringify(alias)} does not churn`,()=>{
  const game={sport:'NFL',id:'x',state:'completed',score:60,teams:[['A','A','20'],['B','B','14']],line:{provider:'DraftKings',spread:3,total:45,moneyline:-120}};
  const history={completed:new Map([['NFL:x',{observed_at:0,model_version:MODEL_VERSION,normalized_state:JSON.stringify(game)}]])};
  assert.equal(shouldSnapshot({...game,line:{...game.line,provider:alias}},history,60000,MODEL_VERSION),false);
  assert.equal(game.line.provider,'DraftKings','comparison does not mutate display');
});
test('final semantic corrections and arbitrary provider punctuation remain significant',()=>{
  const game={sport:'NFL',id:'x',state:'completed',score:60,teams:[['A','A','20'],['B','B','14']],line:{provider:'DraftKings',spread:3,total:45,moneyline:-120},factors:[]};
  const history={completed:new Map([['NFL:x',{observed_at:0,model_version:MODEL_VERSION,normalized_state:JSON.stringify(game)}]])};
  for(const patch of [{line:{...game.line,provider:'FanDuel'}},{line:{...game.line,provider:'Draft-Kings'}},
    ...['spread','total','moneyline'].map(key=>({line:{...game.line,[key]:99}})),{score:61},{teams:[['A','A','21'],game.teams[1]]},
    {pregameRecords:['5-1','4-2']},{factors:[{label:'Corrected history',points:2}]}])
    assert.equal(shouldSnapshot({...game,...patch},history,60000,MODEL_VERSION),true,JSON.stringify(patch));
  assert.equal(shouldSnapshot(game,history,60000,'new-model'),true);
});

test('295-game quiet fixture removes 132 summary acquisitions/enrichments from warm publication',async t=>{
  const env=database(t),events=[...Array.from({length:263},(_,i)=>event('u'+i,'pre',i>=100)),...Array.from({length:32},(_,i)=>event('c'+i,'post'))];
  const f=fixture(t,events),now=Date.now(),logs=[];
  const cold=await refreshSportsData(env,now,{log:m=>logs.push(m)});
  assert.equal(cold.games.length,295);assert.equal(cold.games.filter(summaryCandidate).length,132);
  assert.equal(f.summaryCalls().length,132);assert.equal(logs[0].criticalCandidates,132);
  const before=f.summaryCalls().length;
  let atPublication;
  const warm=await refreshSportsData(env,now+60000,{log:m=>logs.push(m),onPublished:()=>{atPublication=f.summaryCalls().length-before;}});
  assert.equal(atPublication,0);assert.equal(logs[1].reusedGames,132);assert.equal(logs[1].criticalCandidates,0);
  assert.equal(logs[1].cachedEnrichments,0);assert.equal(logs[1].deferredCandidates,132);
  assert.equal(logs[1].revalidated,132);
  assert.deepEqual(warm.games,cold.games,'same scoring and canonical output, not just same score');
  // Background timestamp changes alone do not force another enrichment.
  let active=0,maxActive=0,publicationMax=0;
  env.hooks.before=async sql=>{if(sql==='SELECT payload,updated_at FROM sports_resources WHERE key=?'){
    active++;maxActive=Math.max(maxActive,active);await tick();active--;
  }};
  await refreshSportsData(env,now+120000,{log:m=>logs.push(m),onPublished:()=>{publicationMax=maxActive;}});
  assert.ok(publicationMax>1 && publicationMax<=6,'changed-version cached payload reads run with bounded concurrency');
  assert.equal(logs[2].cachedSummaryReads,132);
  assert.equal(logs[2].reusedGames,132);assert.equal(logs[2].cachedEnrichments,0);
  const result={games:295,upcoming:263,completed:32,before:{candidates:132,summaryWork:132,groups:22},
    after:{candidates:132,reused:132,critical:0,cachedEnrichments:0,criticalSummaryCalls:atPublication,criticalGroups:0,
      deferred:132,totalSummaryRevalidations:132}};
  console.log('HEAVY_FIXTURE '+JSON.stringify(result));
});

test('live games precede unrelated nonlive work and slow revalidation cannot block publication',async t=>{
  const env=database(t),events=[...Array.from({length:32},(_,i)=>event('c'+i,'post')),...Array.from({length:263},(_,i)=>event('u'+i,'pre',i>=100)),...Array.from({length:3},(_,i)=>event('live'+i,'in'))];
  const f=fixture(t,events),now=Date.now();await refreshSportsData(env,now,silent);
  const before=f.summaryCalls().length,slow=gate(),started=gate(),published=gate();let stats;
  f.hook=async id=>{if(!id.startsWith('live')){started.resolve();await slow.promise;}};
  const work=refreshSportsData(env,now+60000,{log:m=>{stats=m;},onPublished:published.resolve});
  const feed=await published.promise;await started.promise;
  assert.equal(f.summaryCalls()[before].endsWith('event=live0'),true);
  assert.equal(feed.games.find(g=>g.id==='live0').state,'live');
  assert.equal(env.db.prepare("SELECT 1 FROM sports_leases WHERE key='refresh'").get(),undefined);
  assert.equal((await readFeed(env)).revision,feed.revision);
  slow.resolve();await work;
  assert.equal(stats.criticalCandidates,3);assert.equal(stats.reusedGames,132);
  console.log('LIVE_FIXTURE '+JSON.stringify({games:298,live:3,nonliveReused:stats.reusedGames,criticalSummaryCalls:stats.criticalCandidates,deferred:stats.deferredCandidates}));
});

test('lower-priority provider failure leaves the already published canonical values coherent',async t=>{
  const env=database(t),f=fixture(t,[event('done','post'),event('live','in')]),now=Date.now();
  await refreshSportsData(env,now,silent);f.hook=async id=>{if(id==='done')throw new Error('provider failed');};
  let published;const result=await refreshSportsData(env,now+60000,{...silent,onPublished:value=>{published=structuredClone(value);}});
  const stored=await readFeed(env,now+60000);
  assert.deepEqual(JSON.parse(JSON.stringify(result.games)),stored.games);assert.deepEqual(JSON.parse(JSON.stringify(published.games)),stored.games);
  assert.deepEqual(result.sourceErrors,stored.sourceErrors,'maintenance does not mutate published errors');
});

for(const kind of ['summary','context','model','scoreboard','transition']) test(`${kind} change invalidates nonlive reuse`,async t=>{
  const env=database(t),events=[event('done','post'),event('up')],f=fixture(t,events),now=Date.now();
  await refreshSportsData(env,now,silent);
  if(kind==='summary'){
    const row=env.db.prepare("SELECT key,payload FROM sports_resources WHERE key LIKE '%summary%event=done'").get();
    const payload=JSON.parse(row.payload);payload.pickcenter=[{provider:{name:'FanDuel'},details:'AWY -9',spread:9,overUnder:50,awayTeamOdds:{favorite:true}}];
    env.db.prepare('UPDATE sports_resources SET payload=?,updated_at=? WHERE key=?').run(JSON.stringify(payload),now+59000,row.key);
  }
  if(kind==='context')env.db.prepare(`INSERT INTO game_context(event_id,sport,factor_type,context_text,confidence,source_title,source_url,expires_at,updated_at)
    VALUES ('done','CFB','playoff_rematch','Verified rematch',.95,'Test','https://example.test',?,?)`).run(Math.floor(now/1000)+86400,now);
  if(kind==='model'){
    const row=env.db.prepare('SELECT payload FROM sports_feed WHERE id=1').get();const header=JSON.parse(row.payload);header.enrichment['CFB:done'].model='old-model';
    env.db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify(header));
  }
  if(kind==='scoreboard')events[0].competitions[0].competitors[0].score='21';
  if(kind==='transition')events[1].competitions[0].status.type.state='in';
  let stats;const result=await refreshSportsData(env,now+60000,{log:m=>{stats=m;}});
  assert.ok(result);
  if(kind==='summary')assert.equal(stats.cachedEnrichments,1);
  else assert.ok(stats.criticalCandidates>=1,JSON.stringify(stats));
  assert.equal(stats.reusedGames,1);
});

test('fenced publication cannot overwrite successor; same-start owners have disjoint parts',async t=>{
  const env=database(t),now=Date.now();
  const feed=(time,id)=>({updatedAt:new Date(time).toISOString(),games:[{id}],sourceErrors:[]});
  env.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run('refresh','successor',now+30000);
  const newer=await publishFeed(env,feed(now,'new'),'successor',()=>now);
  assert.ok(newer);
  assert.equal(await publishFeed(env,feed(now,'late-old'),'expired',()=>now),null);
  assert.equal((await readFeed(env)).games[0].id,'new');
  assert.notEqual(`${now}:expired`,newer.revision);
  // Valid ownership alone is insufficient: timestamps must also advance.
  assert.equal(await publishFeed(env,feed(now-1,'older'),'successor',()=>now),null);
  assert.equal(await publishFeed(env,feed(now,'equal'),'successor',()=>now),null);
});

test('expired owner without successor is fenced and part-write failure preserves old header',async t=>{
  const env=database(t),now=Date.now();const old={updatedAt:new Date(now-60000).toISOString(),games:[{id:'old'}]};
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify(old));
  env.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run('refresh','old',now-1);
  assert.equal(await publishFeed(env,{updatedAt:new Date(now).toISOString(),games:[{id:'new'}]},'old',()=>now),null);
  env.db.prepare('UPDATE sports_leases SET expires_at=?').run(now+30000);
  env.hooks.before=async sql=>{if(sql.includes('INSERT OR IGNORE INTO sports_feed_parts'))throw new Error('D1 unavailable');};
  await assert.rejects(publishFeed(env,{updatedAt:new Date(now).toISOString(),games:[{id:'new'}]},'old',()=>now));
  env.hooks.before=null;assert.equal((await readFeed(env)).games[0].id,'old');
});

test('readers retain a coherent old revision while a new multipart revision is prepared',async t=>{
  const env=database(t),now=Date.now();env.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run('refresh','owner',now+30000);
  const old=await publishFeed(env,{updatedAt:new Date(now-1000).toISOString(),games:[{id:'old'}]},'owner',()=>now);
  const blocked=gate(),entered=gate();env.hooks.before=async sql=>{if(sql.startsWith('INSERT INTO sports_feed (id,payload)')){entered.resolve();await blocked.promise;}};
  const work=publishFeed(env,{updatedAt:new Date(now).toISOString(),games:Array.from({length:101},(_,i)=>({id:i}))},'owner',()=>now);
  await entered.promise;assert.equal((await readFeed(env)).revision,old.revision);
  blocked.resolve();await work;env.hooks.before=null;
  assert.equal((await readFeed(env)).games.length,101);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_feed_parts WHERE revision=?').get(old.revision).n,1);
});

test('cron/feed lease contention creates one collector and release cannot delete a successor lease',async t=>{
  const env=database(t),f=fixture(t,[event('live','in')]),now=Date.now(),blocked=gate(),entered=gate();
  f.hook=async()=>{entered.resolve();await blocked.promise;};
  const first=refreshSportsData(env,now,{...silent,trigger:'feed'});await entered.promise;
  const count=f.calls.length;assert.equal(await refreshSportsData(env,now,{...silent,trigger:'cron'}),null);
  assert.equal(f.calls.length,count);
  env.db.prepare("UPDATE sports_leases SET owner='successor',expires_at=? WHERE key='refresh'").run(now+60000);
  blocked.resolve();assert.equal(await first,null);
  assert.equal(env.db.prepare("SELECT owner FROM sports_leases WHERE key='refresh'").get().owner,'successor');
});

test('browser abort has a registered lifetime; bounded response preserves original freshness',async t=>{
  const env=database(t),f=fixture(t,[event('live','in')]),now=Date.now(),blocked=gate(),entered=gate();
  const old=await seedStale(env,now);const lifetimes=[];
  f.hook=async()=>{entered.resolve();await blocked.promise;};
  t.after(()=>blocked.resolve());
  t.mock.timers.enable({apis:['setTimeout']});
  const controller=new AbortController();
  const response=worker.fetch(new Request('https://test/feed',{signal:controller.signal}),env,{waitUntil:p=>lifetimes.push(p)});
  await entered.promise;controller.abort();t.mock.timers.tick(8000);
  const returned=await (await response).json();
  assert.equal(returned.updatedAt,old.updatedAt);assert.equal(lifetimes.length,1);
  assert.ok(returned.freshness.ageMs>=59000);
  blocked.resolve();await lifetimes[0];
  assert.ok(Date.parse((await readFeed(env)).updatedAt)>Date.parse(old.updatedAt));
  assert.equal(env.db.prepare("SELECT 1 FROM sports_leases WHERE key='refresh'").get(),undefined);
});

test('deadline cancels provider work, releases ownership, and next request recovers',async t=>{
  const env=database(t),f=fixture(t,[event('live','in')]),now=Date.now();
  const old=await seedStale(env,now);let elapsed=0,stats;
  f.hook=async()=>{elapsed=26000;};
  assert.equal(await refreshSportsData(env,now,{clock:()=>elapsed,log:m=>{stats=m;}}),null);
  assert.equal(stats.reason,'deadline');assert.equal((await readFeed(env)).updatedAt,old.updatedAt);
  assert.equal(env.db.prepare("SELECT 1 FROM sports_leases WHERE key='refresh'").get(),undefined);
  f.hook=null;assert.ok(await refreshSportsData(env,now+1,silent));
  assert.equal(REFRESH_LEASE_MS,30000);
});

test('failed collection retains canonical revision and can recover without a 180-second wait',async t=>{
  const env=database(t),f=fixture(t,[event('live','in')]),now=Date.now();const old=await seedStale(env,now);
  const good=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('offline');};
  assert.equal(await refreshSportsData(env,now,silent),null);assert.equal((await readFeed(env)).revision,old.revision);
  globalThis.fetch=good;assert.ok(await refreshSportsData(env,now+1,silent));
});

test('structured timing includes stages and counters without a telemetry table/write',async t=>{
  const env=database(t);fixture(t,[event('done','post')]);let metrics;
  await refreshSportsData(env,Date.now(),{trigger:'cron',log:m=>{metrics=m;}});
  for(const key of ['collection','contexts','summary','snapshots','feedWrites','publication','cleanup','maintenance'])assert.equal(typeof metrics.stages[key],'number');
  for(const key of ['totalMs','publicationMs','candidates','liveCandidates','providerFailures','providerRequests','providerTimeouts'])assert.equal(typeof metrics[key],'number');
  assert.equal(metrics.trigger,'cron');assert.equal(metrics.published,true);assert.equal(metrics.lease,'acquired');
  const writes=env.statements.filter(s=>/^(INSERT|UPDATE|DELETE)/.test(s));
  assert.ok(writes.every(s=>/sports_(feed|feed_parts|resources|leases|snapshots)/.test(s)));
  assert.doesNotMatch(JSON.stringify(metrics),/headers|token_hash|subscription|connecting-ip/);
});

test('deadline aborts an outstanding provider request and releases the global lease',async t=>{
  const env=database(t),f=fixture(t,[event('live','in')]),now=Date.now();
  await seedStale(env,now);const entered=gate();let stats,signal;
  f.hook=async(id,options)=>{signal=options.signal;entered.resolve();return new Promise((resolve,reject)=>{
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  });};
  t.mock.timers.enable({apis:['setTimeout']});
  const work=refreshSportsData(env,now,{log:m=>{stats=m;}});await entered.promise;
  t.mock.timers.tick(25000);assert.equal(await work,null);assert.equal(signal.aborted,true);
  assert.ok(stats.providerTimeouts>=1);assert.equal(stats.reason,'deadline');
  assert.equal(env.db.prepare("SELECT 1 FROM sports_leases WHERE key='refresh'").get(),undefined);
  f.hook=null;assert.ok(await refreshSportsData(env,now+1,silent));
});

test('reused rich data retains stale/degraded indicators when revalidation keeps failing',async t=>{
  const env=database(t),f=fixture(t,[event('done','post')]),now=Date.now();
  await refreshSportsData(env,now,silent);f.hook=async()=>{throw new Error('offline');};
  await refreshSportsData(env,now+60000,silent);
  const result=await refreshSportsData(env,now+180000,silent);
  assert.equal(result.games[0].detailStale,true);assert.equal(result.freshness.degraded,true);
  assert.equal(result.sourceErrors.length,1);
});

test('deferred provider correction is applied next revision rather than mutating published games',async t=>{
  const env=database(t),f=fixture(t,[event('done','post')]),now=Date.now();
  const first=await refreshSportsData(env,now,silent);
  f.hook=async()=>Response.json({header:{competitions:f.events[0].competitions},pickcenter:[{
    provider:{name:'FanDuel'},details:'AWY -8',spread:8,overUnder:51,awayTeamOdds:{favorite:true}
  }]});
  const second=await refreshSportsData(env,now+60000,silent);
  assert.equal(finalContent(first.games[0]),finalContent(second.games[0]));
  let stats;const third=await refreshSportsData(env,now+120000,{log:m=>{stats=m;}});
  assert.equal(stats.cachedEnrichments,1);
  assert.notEqual(finalContent(second.games[0]),finalContent(third.games[0]));
});

test('early collection failure cancels and drains sibling provider requests',async t=>{
  const env=database(t),original=globalThis.fetch,signals=[];
  t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async(url,{signal})=>{
    if(String(url).includes('/football/nfl/'))throw new Error('scoreboard unavailable');
    signals.push(signal);
    return new Promise((resolve,reject)=>{
      if(signal.aborted)reject(signal.reason);
      else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
  };
  assert.equal(await refreshSportsData(env,Date.now(),silent),null);
  assert.ok(signals.length>0);assert.ok(signals.every(signal=>signal.aborted));
  assert.equal(env.db.prepare("SELECT 1 FROM sports_leases WHERE key='refresh'").get(),undefined);
});
