import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData,readFeed,MODEL_VERSION} from '../src/sports-feed.js';
import {reusable} from '../src/refresh-policy.js';

function database(t) {
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const hooks={};t.after(()=>db.close());
  return {db,hooks,DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){await hooks.before?.(sql,args);return db.prepare(sql).get(...args)||null;},
    async all(){await hooks.before?.(sql,args);return {results:db.prepare(sql).all(...args)};},
    async run(){await hooks.before?.(sql,args);if(sql.startsWith('SELECT'))return {results:db.prepare(sql).all(...args),meta:{changes:0}};return {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };},async batch(statements){hooks.batch?.();const results=[];for(const statement of statements)results.push(await statement.run());return results;}}};
}
function event(id,state='post') {return {id:String(id),name:'Away at Home',date:'2026-11-01T20:00:00Z',competitions:[{
  status:{type:{state,completed:state==='post',shortDetail:state==='post'?'Final':'Q4'},period:4,displayClock:state==='in'?'1:00':'0:00'},
  competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'20'},
    {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'14'}]
}]};}
const tennis=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/audit-integrity/tennis-20261101.json.gz',import.meta.url)))).payload;

test('current enrichment metadata cannot certify a prior rating from another model',()=>{
  const game={state:'completed'},meta={model:MODEL_VERSION,input:'same',summaryHash:'known'};
  assert.equal(reusable(game,{state:'completed',modelVersion:'previous-model'},meta,'same',MODEL_VERSION),false);
  assert.equal(reusable(game,{state:'completed',modelVersion:MODEL_VERSION},meta,'same',MODEL_VERSION),true);
});

test('a cached heavy model transition publishes bounded honest progress and converges across cron polls',async t=>{
  const env=database(t),events=[...Array.from({length:259},(_,i)=>event(`done${i}`)),event('live','in')];
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  const requests=[];let includeTennis=false;
  globalThis.fetch=async value=>{
    const url=new URL(value);requests.push(url.href);
    if(url.pathname.endsWith('/summary')) {
      assert.doesNotMatch(url.pathname,/tennis/);
      const e=events.find(e=>e.id===url.searchParams.get('event'));
      return Response.json({header:{competitions:e.competitions},plays:[],scoringPlays:[],winprobability:[]});
    }
    return Response.json(url.pathname.includes('/tennis/atp/')&&includeTennis?tennis:
      {events:url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?events:[]});
  };
  const start=Date.now(),cold=await refreshSportsData(env,start,{log:()=>{}});assert.ok(cold);
  const old=structuredClone(cold);delete old.revision;delete old.parts;
  old.modelVersion='previous-model';old.updatedAt=new Date(start-60000).toISOString();
  for(const game of old.games){game.modelVersion='previous-model';game.score=99;game.baseScore=99;}
  for(const meta of Object.values(old.enrichment))meta.model='previous-model';
  env.db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify(old));
  env.db.prepare("UPDATE sports_snapshots SET model_version='previous-model'").run();
  // Grand Slam coverage excludes the captured 225 non-major Tennis matches.
  includeTennis=true;env.db.prepare("DELETE FROM sports_resources WHERE key LIKE '%/tennis/%'").run();
  let elapsed=0,summaryReads=[];
  env.hooks.before=(sql,args)=>{
    if(sql==='SELECT payload,updated_at FROM sports_resources WHERE key=?'&&String(args[0]).includes('/summary')){
      summaryReads.push(String(args[0]));elapsed+=250;
    }
  };
  env.hooks.batch=()=>{elapsed+=100;};
  const counts=[],publicationMs=[];let previousPending=null,firstPending=[];
  for(let poll=0;poll<8;poll++){
    elapsed=0;summaryReads=[];let metrics;
    const now=start+(poll+1)*60000;
    // Cache freshness is independent of model migration. This isolates costly
    // cached reads/recalculation from network timeout or provider failure.
    env.db.prepare('UPDATE sports_resources SET updated_at=?').run(now);
    const feed=await refreshSportsData(env,now,{clock:()=>elapsed,log:m=>metrics=m});
    assert.ok(feed,`poll ${poll}: ${JSON.stringify(metrics)}`);
    assert.equal(feed.modelVersion,MODEL_VERSION);assert.equal(feed.games.length,260);
    assert.ok(feed.games.every(g=>g.modelVersion===MODEL_VERSION));
    assert.ok(feed.games.every(g=>g.score!==99),'previous-model score sentinel is never relabeled');
    assert.ok(summaryReads[0].endsWith('event=live'),'live acquisition precedes nonlive migration');
    assert.ok(metrics.publicationMs<25000,JSON.stringify(metrics));
    publicationMs.push(metrics.publicationMs);
    const pending=feed.games.filter(g=>g.enrichmentPending);counts.push(pending.length);
    if(poll===0){assert.ok(pending.length>0&&pending.length<259);firstPending=pending.map(g=>`CFB:${g.id}`);}
    if(previousPending!==null)assert.ok(pending.length<previousPending,`migration must progress: ${counts}`);
    for(const game of pending){
      assert.equal(game.scoringPartial,true);assert.equal(game.evidenceQuality,'partial');
      assert.equal(game.scoreboard.scoringPartial,true);assert.equal(game.scoreboard.evidenceQuality,'partial');
      assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots WHERE game_key=? AND model_version=?').get(`CFB:${game.id}`,MODEL_VERSION).n,0,'pending finals cannot enter final history');
    }
    assert.equal(Object.keys(feed.enrichment).filter(k=>k.startsWith('CFB:done')).length,259-pending.length);
    assert.equal((await readFeed(env,now)).revision,feed.revision);
    previousPending=pending.length;if(!pending.length)break;
  }
  assert.equal(counts.at(-1),0,`bounded repeated-poll progress: ${counts}`);
  assert.ok(firstPending.length>0);assert.ok(requests.every(url=>!url.includes('/tennis/atp/summary')));
  // Once the resource versions settle, deferred current-model validation must
  // also converge. It stays bounded even after model-enrichment pending clears.
  const validationCounts=[];
  for(let poll=0;poll<8;poll++){
    elapsed=0;let metrics;
    const now=start+(counts.length+poll+1)*60000;
    const feed=await refreshSportsData(env,now,{clock:()=>elapsed,log:m=>metrics=m});
    assert.ok(feed,JSON.stringify(metrics));assert.ok(metrics.publicationMs<25000);
    assert.equal(feed.games.filter(g=>g.enrichmentPending).length,0);
    const pending=feed.games.filter(g=>g.summaryValidationPending);validationCounts.push(pending.length);
    for(const game of pending){assert.equal(game.scoringPartial,true);assert.equal(game.scoreboard.summaryValidationPending,true);}
    if(!pending.length)break;
  }
  assert.equal(validationCounts.at(-1),0,`deferred validation must converge: ${validationCounts}`);
  console.log('MODEL_MIGRATION_PROGRESS '+JSON.stringify({games:260,nonlive:259,live:1,tennis:0,pendingByPoll:counts,publicationMs,validationPendingByPoll:validationCounts}));
});

for(const mismatch of ['lifecycle','score','identity'])test(`model migration cannot certify a cached final with mismatching ${mismatch}`,async t=>{
  const env=database(t),now=Date.now(),e=event(`stale-${mismatch}`),cached=structuredClone(e.competitions[0]);
  if(mismatch==='lifecycle')cached.status={type:{state:'in',completed:false},period:4,displayClock:'6:00'};
  if(mismatch==='score')cached.competitors[0].score='14';
  if(mismatch==='identity')cached.competitors[0].team.id='other';
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
  const url=`https://site.api.espn.com/apis/site/v2/sports/football/college-football/summary?event=${e.id}`;
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify({header:{competitions:[cached]}}),now-300000);
  let elapsed=0,summaryRequests=0;
  env.hooks.before=(sql,args)=>{if(sql==='SELECT payload,updated_at FROM sports_resources WHERE key=?'&&args[0]===url)elapsed=12000;};
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async value=>{
    const request=new URL(value);
    if(request.pathname.endsWith('/summary')){summaryRequests++;return Response.json({header:{competitions:e.competitions},plays:[]});}
    return Response.json({events:request.pathname.includes('/college-football/')&&request.searchParams.get('groups')==='80'?[e]:[]});
  };
  const partial=await refreshSportsData(env,now,{clock:()=>elapsed,log:()=>{}});
  assert.ok(partial);const game=partial.games[0];assert.equal(game.enrichmentPending,true);
  assert.equal(game.evidenceQuality,'partial');assert.equal(game.scoringPartial,true);assert.equal(game.scoreboard.enrichmentPending,true);
  assert.equal(summaryRequests,0,'a 7-second fetch cannot consume the publication reserve');
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,0);
  env.hooks.before=null;elapsed=0;
  const completed=await refreshSportsData(env,now+60000,{clock:()=>elapsed,log:()=>{}});
  assert.ok(completed);assert.equal(summaryRequests,1);assert.equal(completed.games[0].enrichmentPending,undefined);
  assert.notEqual(completed.games[0].scoringPartial,true);assert.equal(completed.games[0].detailStale,false);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots WHERE model_version=?').get(MODEL_VERSION).n,1);
});

test('a failed last pending nonlive acquisition stays partial until a later successful refresh',async t=>{
  const env=database(t),now=Date.now(),e=event('last-pending');let fail=true;
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async value=>{
    const request=new URL(value);
    if(request.pathname.endsWith('/summary')){if(fail)throw Error('provider unavailable');return Response.json({header:{competitions:e.competitions},plays:[]});}
    return Response.json({events:request.pathname.includes('/college-football/')&&request.searchParams.get('groups')==='80'?[e]:[]});
  };
  const first=await refreshSportsData(env,now,{log:()=>{}});assert.ok(first);
  for(const target of [first.games[0],first.games[0].scoreboard]){
    assert.equal(target.enrichmentPending,true);assert.equal(target.evidenceQuality,'partial');assert.equal(target.scoringPartial,true);
  }
  assert.equal(first.enrichmentProgress.pending,1);assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,0);
  fail=false;const second=await refreshSportsData(env,now+60000,{log:()=>{}});assert.ok(second);
  assert.equal(second.games[0].enrichmentPending,undefined);assert.notEqual(second.games[0].scoringPartial,true);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots WHERE model_version=?').get(MODEL_VERSION).n,1);
});
