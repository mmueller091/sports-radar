import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {feedResponseWaitMs,requestFeedRefresh,refreshSportsData,readFeed,MODEL_VERSION} from '../src/sports-feed.js';
import {FEED_WAIT_MS,LIVE_FEED_WAIT_MS} from '../src/refresh-policy.js';

const enabled=['NFL','CFB','NCAAB','NHL','MLB','NBA'];
const game=(sport='CFB',state='live',now=Date.now())=>({
  id:'fixture-live',sport,state,status:state==='upcoming'?'Scheduled':'Q4',
  startTime:new Date(now+(state==='upcoming'?300000:-3600000)).toISOString()
});
const feed=(now=Date.now(),games=[game('CFB','live',now)],patch={})=>({
  modelVersion:MODEL_VERSION,updatedAt:new Date(now-60000).toISOString(),games,...patch
});
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('short response budget applies only to warm current-model live or near-start enabled sports',()=>{
  const now=Date.now();
  assert.equal(LIVE_FEED_WAIT_MS,2000);
  assert.equal(FEED_WAIT_MS,8000,'legacy response budget is unchanged');
  for(const sport of enabled)for(const state of ['live','upcoming'])
    assert.equal(feedResponseWaitMs(feed(now,[game(sport,state,now)]),now),2000,`${sport} ${state}`);
  assert.equal(feedResponseWaitMs(feed(now,[game('Soccer'),game('NBA')]),now),2000,'an enabled live game qualifies a mixed feed');
  assert.equal(feedResponseWaitMs(feed(now,undefined,{updatedAt:new Date(now-120000).toISOString()}),now),2000,'exact freshness boundary is usable');
  assert.equal(feedResponseWaitMs(feed(now,undefined,{updatedAt:new Date(now).toISOString()}),now),2000,'a valid present timestamp is usable');
});

test('cold, old-model, stale, malformed and future-dated feeds retain the existing response budget',()=>{
  const now=Date.now();
  for(const previous of [null,undefined,{},feed(now,undefined,{modelVersion:'old-model'}),
    feed(now,undefined,{updatedAt:new Date(now-120001).toISOString()}),
    feed(now,undefined,{updatedAt:undefined}),feed(now,undefined,{updatedAt:''}),
    feed(now,undefined,{updatedAt:'invalid-date'}),feed(now,undefined,{updatedAt:new Date(now+1).toISOString()})])
    assert.equal(feedResponseWaitMs(previous,now),8000,JSON.stringify(previous));
  assert.equal(feedResponseWaitMs(feed(now,undefined,{freshness:{stale:true}}),now),2000,'the decision recomputes timestamp freshness');
  assert.equal(feedResponseWaitMs(feed(now,undefined,{updatedAt:new Date(now-120001).toISOString(),freshness:{stale:false}}),now),8000,'a stale cached flag cannot make old data usable');
});

test('soccer, tennis, idle and ineligible start times never select the short response budget',()=>{
  const now=Date.now();
  const unqualified=[[],[game('Soccer')],[game('Tennis')],[game('Soccer','upcoming',now)],
    [game('Tennis','upcoming',now)],[game('NBA','completed',now)],
    [{...game('CFB','upcoming',now),startTime:new Date(now+3600000).toISOString()}],
    [{...game('CFB','upcoming',now),startTime:new Date(now-3600000).toISOString()}],
    [{...game('CFB','upcoming',now),status:'Postponed'}],
    [{...game('CFB','upcoming',now),liveRawStatus:{type:{name:'STATUS_CANCELED'}}}],
    [{...game('CFB','upcoming',now),startTime:'not-a-date'}],
    [game('Soccer'),game('NBA','completed',now)]];
  for(const games of unqualified)assert.equal(feedResponseWaitMs(feed(now,games),now),8000,JSON.stringify(games));
});

function fixture(t) {
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const f={db,calls:[],lifetimes:[],logs:[],blocked:null,entered:null};
  const env={DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){
      const statement=db.prepare(sql);
      return /^\s*SELECT\b/i.test(sql)
        ? {results:statement.all(...args),meta:{changes:0}}
        : {meta:{changes:statement.run(...args).changes}};
    }
  };},async batch(statements){const out=[];for(const statement of statements)out.push(await statement.run());return out;}}};
  const event={id:'fixture-live',name:'Fixture Away at Home',date:new Date(Date.now()-3600000).toISOString(),competitions:[{
    status:{type:{state:'in',completed:false,shortDetail:'Q4'},period:4,displayClock:'1:00'},
    competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'20'},
      {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'14'}]
  }]};
  const original=globalThis.fetch;
  globalThis.fetch=async value=>{
    const url=new URL(value);f.calls.push(url.href);
    assert.equal(url.hostname,'site.api.espn.com','every provider request is mocked');
    if(url.pathname.endsWith('/summary')) {
      assert.equal(url.searchParams.get('event'),event.id);
      if(f.blocked){f.entered.resolve();await f.blocked.promise;}
      return Response.json({header:{competitions:event.competitions},plays:[],scoringPlays:[],winprobability:[]});
    }
    return Response.json({events:url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?[event]:[]});
  };
  f.env=env;
  f.ctx={waitUntil:work=>f.lifetimes.push(work)};
  f.options={log:entry=>f.logs.push(entry)};
  f.block=()=>{f.blocked=gate();f.entered=gate();};
  f.release=()=>f.blocked?.resolve();
  f.seed=async()=>{
    const now=Date.now();
    const initial=await refreshSportsData(env,now,{log:()=>{}});assert.ok(initial);
    const header=JSON.parse(db.prepare('SELECT payload FROM sports_feed WHERE id=1').get().payload);
    header.updatedAt=new Date(now-60000).toISOString();
    db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify(header));
    db.prepare('UPDATE sports_resources SET updated_at=?').run(now-60000);
    return readFeed(env,now);
  };
  t.after(async()=>{
    f.release();
    await Promise.allSettled(f.lifetimes);
    globalThis.fetch=original;
    db.close();
  });
  return f;
}

test('fast publication wins the shortened response race without waiting for its timeout',async t=>{
  const f=fixture(t),previous=await f.seed();
  t.mock.timers.enable({apis:['setTimeout']});
  const result=await requestFeedRefresh(f.env,previous,f.ctx,f.options);
  assert.ok(Date.parse(result.updatedAt)>Date.parse(previous.updatedAt));
  assert.equal(f.lifetimes.length,1);
  await f.lifetimes[0];
  assert.equal((await readFeed(f.env)).revision,result.revision);
  assert.equal(f.logs.find(entry=>entry.event==='canonical_feed_response').reused,false);
});

test('slow refresh returns the unchanged prior feed at two seconds and publishes in the registered background lifetime',async t=>{
  const f=fixture(t),previous=await f.seed();f.block();
  t.mock.timers.enable({apis:['setTimeout']});
  let settled=false;
  const response=requestFeedRefresh(f.env,previous,f.ctx,f.options).then(value=>{settled=true;return value;});
  await f.entered.promise;
  t.mock.timers.tick(1999);await tick();assert.equal(settled,false);
  t.mock.timers.tick(1);
  const returned=await response;
  assert.equal(returned.updatedAt,previous.updatedAt);
  assert.equal(returned.revision,previous.revision);
  assert.deepEqual(returned.games,previous.games,'no tentative score or enrichment is exposed');
  assert.equal(f.lifetimes.length,1);
  assert.equal((await readFeed(f.env)).revision,previous.revision,'old revision remains coherent before publication');
  f.release();await f.lifetimes[0];
  const published=await readFeed(f.env);
  assert.ok(Date.parse(published.updatedAt)>Date.parse(previous.updatedAt));
  assert.equal(published.games[0].state,'live');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_leases WHERE key='refresh'").get().n,0);
});

test('cold startup keeps its original eight-second grace and continues warming after that response',async t=>{
  const f=fixture(t);f.block();
  t.mock.timers.enable({apis:['setTimeout']});
  let settled=false;
  const response=requestFeedRefresh(f.env,null,f.ctx,f.options).then(value=>{settled=true;return value;});
  await f.entered.promise;
  t.mock.timers.tick(2000);await tick();assert.equal(settled,false);
  t.mock.timers.tick(5999);await tick();assert.equal(settled,false);
  t.mock.timers.tick(1);assert.equal(await response,null);
  assert.equal(f.lifetimes.length,1);
  f.release();await f.lifetimes[0];assert.ok(await readFeed(f.env));
});

test('explicit wait override remains authoritative',async t=>{
  const f=fixture(t),previous=await f.seed();f.block();
  t.mock.timers.enable({apis:['setTimeout']});
  let settled=false;
  const response=requestFeedRefresh(f.env,previous,f.ctx,{...f.options,waitMs:25}).then(value=>{settled=true;return value;});
  await f.entered.promise;
  t.mock.timers.tick(24);await tick();assert.equal(settled,false);
  t.mock.timers.tick(1);assert.equal((await response).revision,previous.revision);
  f.release();await f.lifetimes[0];
});

test('overlapping short-wait requests still create only one collector and one publication',async t=>{
  const f=fixture(t),previous=await f.seed();f.block();
  t.mock.timers.enable({apis:['setTimeout']});
  const first=requestFeedRefresh(f.env,previous,f.ctx,f.options);
  await f.entered.promise;
  const count=f.calls.length;
  const second=await requestFeedRefresh(f.env,previous,f.ctx,f.options);
  assert.equal(second.revision,previous.revision);
  assert.equal(f.calls.length,count,'lease contender cannot start another provider collection');
  t.mock.timers.tick(2000);assert.equal((await first).revision,previous.revision);
  f.release();await Promise.all(f.lifetimes);
  assert.equal(f.logs.filter(entry=>entry.event==='canonical_refresh'&&entry.published).length,1);
  assert.equal(f.logs.filter(entry=>entry.event==='canonical_refresh'&&entry.outcome==='contended').length,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_leases WHERE key='refresh'").get().n,0);
});
