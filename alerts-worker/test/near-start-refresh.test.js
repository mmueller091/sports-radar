import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {gameStartingSoon,refreshDue,refreshSportsData,MODEL_VERSION} from '../src/sports-feed.js';
import {normalizeEvent} from '../src/live-game-model.js';

const dateFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
const dateKey=at=>dateFormatter.format(at).replaceAll('-','');
const upcoming=(at,patch={})=>({id:'start',sport:'CFB',division:'FBS',state:'upcoming',status:'Scheduled',startTime:new Date(at).toISOString(),...patch});

function fixture(t,games=[],now=Date.now()) {
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){if(sql.startsWith('SELECT'))return {results:db.prepare(sql).all(...args),meta:{changes:0}};return {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
  if(games.length)db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({modelVersion:MODEL_VERSION,updatedAt:new Date(now-60000).toISOString(),games}));
  const f={db,env,now,calls:[],events:[],nflMeta:null};
  const original=globalThis.fetch;
  globalThis.fetch=async (value,options)=>{
    const url=new URL(value);f.calls.push({url,ttl:options.cf?.cacheTtl});
    assert.equal(url.hostname,'site.api.espn.com','all provider requests stay inside the mock');
    if(url.pathname.endsWith('/summary')){
      const event=f.events.find(e=>e.id===url.searchParams.get('event'));
      assert.ok(event,'summary belongs to a fixture event');
      return Response.json({header:{competitions:event.competitions},plays:[],scoringPlays:[],winprobability:[]});
    }
    return Response.json({...(url.pathname.includes('/football/nfl/')?f.nflMeta:null),
      events:url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?f.events:[]});
  };
  t.after(()=>{globalThis.fetch=original;db.close();});
  f.run=at=>refreshSportsData(env,at,{log:entry=>{f.metrics=entry;}});
  f.boards=path=>f.calls.filter(c=>c.url.pathname===`/apis/site/v2/sports/${path}/scoreboard`);
  return f;
}

test('near-start window includes exact boundaries and stops after a bounded delayed-start grace',()=>{
  const now=Date.now();
  for(const offset of [-30*60000,-1,0,15*60000])assert.equal(gameStartingSoon(upcoming(now+offset),now),true,`offset ${offset}`);
  for(const offset of [-30*60000-1,15*60000+1,-86400000,86400000])assert.equal(gameStartingSoon(upcoming(now+offset),now),false,`offset ${offset}`);
  for(const state of ['live','completed','postponed'])assert.equal(gameStartingSoon(upcoming(now,{state}),now),false);
  for(const startTime of [undefined,'','not-a-date'])assert.equal(gameStartingSoon(upcoming(now,{startTime}),now),false);
  assert.equal(gameStartingSoon(null,now),false);
  assert.equal(gameStartingSoon(upcoming(now,{status:'Start delayed'}),now),true);
  assert.equal(gameStartingSoon(upcoming(now,{status:'College football starts shortly'}),now),true,'TBA must match a token, not football');
  for(const sport of ['NFL','CFB','NCAAB','NHL','MLB','NBA'])
    assert.equal(gameStartingSoon(upcoming(now,{sport}),now),true,`${sport} remains enabled`);
  for(const sport of ['Soccer','Tennis'])
    assert.equal(gameStartingSoon(upcoming(now,{sport}),now),false,`${sport} is not a public sport`);
});

test('postponed, canceled and unknown start times remain excluded after feed serialization',()=>{
  const now=Date.now();
  for(const status of ['Postponed','Canceled','Cancelled','Suspended','TBD','TBA','Time to be determined'])
    assert.equal(gameStartingSoon(upcoming(now,{status}),now),false,status);
  for(const field of ['name','detail','shortDetail'])for(const status of ['STATUS_POSTPONED','STATUS_CANCELED','STATUS_SUSPENDED','TBD','TBA'])
    assert.equal(gameStartingSoon(upcoming(now,{liveRawStatus:{type:{[field]:status}}}),now),false,`${field}: ${status}`);
  const normalized=normalizeEvent({id:'postponed',date:new Date(now).toISOString(),competitions:[{
    status:{type:{state:'pre',name:'STATUS_POSTPONED',shortDetail:'Scheduled'}},
    competitors:[{team:{id:'1',displayName:'Away'}},{team:{id:'2',displayName:'Home'}}]
  }]},'CFB');
  const published=JSON.parse(JSON.stringify(normalized));
  assert.equal(published.sourceCompetition,undefined);
  assert.equal(gameStartingSoon(published,now),false);
});

test('near-start feed is eligible at 10 seconds while live priority remains 12 seconds and idle remains 60',()=>{
  const now=Date.now(),feed={modelVersion:MODEL_VERSION,updatedAt:new Date(now).toISOString(),games:[upcoming(now+300000)]};
  assert.equal(refreshDue(feed,now+9999),false);assert.equal(refreshDue(feed,now+10000),true);
  const mixed={...feed,games:[...feed.games,{state:'live'}]};
  assert.equal(refreshDue(mixed,now+10000),false);assert.equal(refreshDue(mixed,now+11999),false);assert.equal(refreshDue(mixed,now+12000),true);
  const hiddenUpcoming={...feed,games:[upcoming(now+300000,{sport:'Soccer'})]};
  assert.equal(refreshDue(hiddenUpcoming,now+10000),false,'hidden soccer cannot accelerate pregame refresh');
  assert.equal(refreshDue(hiddenUpcoming,now+60000),true);
  const hiddenLive={...feed,games:[{sport:'Soccer',state:'live'}]};
  assert.equal(refreshDue(hiddenLive,now+11999),false);
  assert.equal(refreshDue(hiddenLive,now+12000),true,'existing soccer live backend cadence remains intact');
  for(const game of [upcoming(now+3600000),upcoming(now-3600000),upcoming(now,{status:'Postponed'})]){
    const idle={...feed,games:[game]};assert.equal(refreshDue(idle,now+59999),false);assert.equal(refreshDue(idle,now+60000),true);
  }
  assert.equal(refreshDue({...feed,modelVersion:'old'},now),true);
});

test('hidden soccer cannot accelerate scoreboard caching while its collector remains active',async t=>{
  const now=Date.now(),f=fixture(t,[upcoming(now+300000,{sport:'Soccer',providerPath:'soccer/eng.1'})],now);
  assert.ok(await f.run(now));
  assert.equal(f.boards('soccer/eng.1').length,1,'the soccer collector still runs');
  assert.equal(f.boards('soccer/eng.1')[0].ttl,55,'hidden pregame soccer keeps existing caching');
  assert.equal(f.boards('soccer/uefa.champions')[0].ttl,55,'other soccer sources remain untouched');
});

test('near-start NBA and NHL cache only the matching New York scoreboard date at 10 seconds',async t=>{
  const now=Date.now(),start=now+300000,target=dateKey(start);
  const games=['NBA','NHL'].map(sport=>upcoming(start,{id:sport,sport,division:undefined,providerPath:sport==='NBA'?'basketball/nba':'hockey/nhl'}));
  const f=fixture(t,games,now);assert.ok(await f.run(now));
  for(const path of ['basketball/nba','hockey/nhl']){
    const calls=f.boards(path);assert.equal(calls.length,9);
    for(const {url,ttl} of calls){
      const date=url.searchParams.get('dates');
      assert.equal(ttl,date===target?10:date>dateKey(now)?900:55,`${path} date ${date}`);
    }
  }
  assert.equal(f.boards('baseball/mlb')[0].ttl,55,'unrelated sport remains unchanged');
});

test('near-start daily cache follows the local day across midnight instead of the UTC date',async t=>{
  const current=Date.now(),hour=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'});
  const base=Math.floor(current/3600000)*3600000;
  const now=Array.from({length:26},(_,i)=>base+i*3600000+55*60000).find(at=>at>=current&&hour.format(at)==='23');
  assert.ok(now,'next local 23:55 exists');
  const start=now+10*60000,target=dateKey(start);
  assert.notEqual(dateKey(now),target);
  const f=fixture(t,[upcoming(start,{sport:'NHL',division:undefined,providerPath:'hockey/nhl'})],now);
  assert.ok(await f.run(now));
  const calls=f.boards('hockey/nhl');
  assert.equal(calls.find(c=>c.url.searchParams.get('dates')===target)?.ttl,10,'next-day resource accelerates before midnight');
  assert.equal(calls.find(c=>c.url.searchParams.get('dates')===dateKey(now))?.ttl,55,'old-day resource does not accelerate');
});

test('near-start CFB cache is restricted to the matching division',async t=>{
  const now=Date.now(),f=fixture(t,[upcoming(now+300000,{providerPath:'football/college-football'})],now);
  assert.ok(await f.run(now));
  const calls=f.boards('football/college-football');
  assert.equal(calls.find(c=>c.url.searchParams.get('groups')==='80').ttl,10);
  assert.equal(calls.find(c=>c.url.searchParams.get('groups')==='81').ttl,55);
});

test('near-start NFL adjacent-week cache accelerates only the matching week',async t=>{
  const now=Date.now(),year=new Date(now).getUTCFullYear();
  const f=fixture(t,[upcoming(now+300000,{sport:'NFL',division:undefined,providerPath:'football/nfl',nflWeek:year*1000+211})],now);
  f.nflMeta={season:{year,type:2},week:{number:10}};
  assert.ok(await f.run(now));
  const calls=f.boards('football/nfl');assert.equal(calls.length,3);
  assert.equal(calls.find(c=>!c.url.searchParams.has('week')).ttl,10);
  assert.equal(calls.find(c=>c.url.searchParams.get('week')==='11').ttl,10);
  assert.equal(calls.find(c=>c.url.searchParams.get('week')==='9').ttl,900);
});

test('a live sport keeps its 12-second cache even when the same scoreboard has an upcoming start',async t=>{
  const now=Date.now(),near=upcoming(now+300000,{providerPath:'football/college-football'});
  const f=fixture(t,[near,{...near,id:'live',state:'live'}],now);assert.ok(await f.run(now));
  assert.ok(f.boards('football/college-football').every(c=>c.ttl===12));
});

test('upcoming-to-live discovery uses the near-start cache, then restores 12-second live refresh and 15-second snapshot buckets',async t=>{
  // Exercise the minute boundary deterministically. The upcoming minute bucket
  // collides with the first live 15-second bucket; an isolated pass at another
  // wall-clock alignment must not hide a missing persisted live observation.
  const now=Math.ceil(Date.now()/60000)*60000,f=fixture(t,[],now);
  const event={id:'kickoff',name:'Away at Home',date:new Date(now+300000).toISOString(),competitions:[{
    status:{type:{state:'pre',completed:false,shortDetail:'Scheduled'},period:0,displayClock:'0:00'},
    competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'0'},
      {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'0'}],
    odds:[{details:'AWY -3',spread:3,overUnder:45,awayTeamOdds:{favorite:true}}]
  }]};
  f.events=[event];
  const initial=await f.run(now);assert.equal(initial?.games[0].state,'upcoming');
  const calls=f.calls.length;
  assert.equal((await f.run(now+9999)).updatedAt,initial.updatedAt);assert.equal(f.calls.length,calls);
  event.competitions[0].status={type:{state:'in',completed:false,shortDetail:'Q1 15:00'},period:1,displayClock:'15:00'};
  const live=await f.run(now+10000);assert.equal(live?.games[0].state,'live');
  assert.equal(f.boards('football/college-football').filter(c=>c.url.searchParams.get('groups')==='80').at(-1).ttl,10);
  const liveCalls=f.calls.length;
  assert.equal((await f.run(now+21999)).updatedAt,live.updatedAt);assert.equal(f.calls.length,liveCalls);
  const next=await f.run(now+22000);assert.equal(next?.games[0].state,'live');
  assert.equal(f.boards('football/college-football').filter(c=>c.url.searchParams.get('groups')==='80').at(-1).ttl,12);
  const snapshots=f.db.prepare("SELECT observed_at FROM sports_snapshots WHERE state='live' ORDER BY observed_at").all();
  assert.equal(snapshots.length,2,JSON.stringify({now,snapshots,stored:f.db.prepare('SELECT state,observed_at FROM sports_snapshots ORDER BY observed_at').all()}));assert.equal(snapshots[1].observed_at-snapshots[0].observed_at,15000);
  assert.ok(snapshots.every(s=>s.observed_at%15000===0));
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE state='upcoming'").get().n,1);
});

for(const offset of [0,5000,14999,15000,30000,45000])test(`lifecycle persistence preserves observations, retries and concurrent refreshes at minute offset ${offset}`,async t=>{
  const now=Math.ceil(Date.now()/60000)*60000+offset,f=fixture(t,[],now);
  const event={id:'lifecycle',date:new Date(now+300000).toISOString(),competitions:[{
    status:{type:{state:'pre',completed:false},period:0,displayClock:'0:00'},
    competitors:[{homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'0'},
      {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'0'}],
    odds:[{details:'AWY -3',spread:3,overUnder:45,awayTeamOdds:{favorite:true}}]
  }]};
  f.events=[event];await f.run(now);
  const opening=f.db.prepare("SELECT * FROM sports_snapshots WHERE state='upcoming'").get();assert.ok(opening);
  event.competitions[0].status={type:{state:'in',completed:false},period:1,displayClock:'15:00'};
  await Promise.all([f.run(now+10000),f.run(now+10000)]);
  await f.run(now+10000);await f.run(now+22000);await f.run(now+34000);
  const expected=[...new Set([10000,22000,34000].map(delta=>Math.floor((now+delta)/15000)*15000))];
  assert.deepEqual(f.db.prepare("SELECT observed_at FROM sports_snapshots WHERE state='live' ORDER BY observed_at").all().map(r=>r.observed_at),expected);
  assert.deepEqual(f.db.prepare("SELECT * FROM sports_snapshots WHERE state='upcoming'").get(),opening,'opening row is never overwritten');
  event.competitions[0].status={type:{state:'post',completed:true,detail:'Final'},period:4,displayClock:'0:00'};
  event.competitions[0].competitors[1].score='3';
  await f.run(now+46000);await f.run(now+46000);
  const finals=f.db.prepare("SELECT observed_at FROM sports_snapshots WHERE state='completed'").all();
  assert.deepEqual(finals.map(r=>r.observed_at),[now+46000],'completed observation retains its actual refresh timestamp');
  assert.deepEqual(f.db.prepare("SELECT * FROM sports_snapshots WHERE state='upcoming'").get(),opening);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE state='live'").get().n,expected.length);
});

test('snapshot insertion failure is reported and cannot publish a feed without its history',async t=>{
  const now=Math.ceil(Date.now()/60000)*60000,f=fixture(t,[],now);
  f.events=[{id:'failure',date:new Date(now).toISOString(),competitions:[{
    status:{type:{state:'in',completed:false},period:1,displayClock:'15:00'},
    competitors:[{homeAway:'away',team:{id:'1',displayName:'Away'},score:'0'},{homeAway:'home',team:{id:'2',displayName:'Home'},score:'0'}]
  }]}];
  f.db.exec("CREATE TRIGGER fail_snapshot BEFORE INSERT ON sports_snapshots BEGIN SELECT RAISE(ABORT,'snapshot-storage-failure'); END");
  assert.equal(await f.run(now),null);
  assert.equal(f.metrics.outcome,'failed');assert.equal(f.metrics.failure.stage,'snapshots');
  assert.match(JSON.stringify(f.metrics.failure),/snapshot-storage-failure/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sports_feed').get().n,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,0);
  f.db.exec('DROP TRIGGER fail_snapshot');
  assert.ok(await f.run(now));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,1);
});
