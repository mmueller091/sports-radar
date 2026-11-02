import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import {createCollector,LIVE_FEEDS} from '../src/providers/espn.js';
import {tennisEvents,tournamentIdentity,mainDrawMatch,currentGameAllowed} from '../src/providers/tennis.js';
import {readFeed,publishFeed,gameDetails,refreshSportsData} from '../src/sports-feed.js';
import {currentAlertGame,drainAlerts} from '../src/alert-delivery.js';
import {notificationEligible} from '../src/notification-preferences.js';
import worker,{checkGames} from '../src/index.js';
import runtime from '../../scoring/live-runtime.cjs';

const directory=new URL('./fixtures/tennis-grand-slams/',import.meta.url);
const fixtures=fs.readdirSync(directory).filter(f=>f.endsWith('.json')).map(file=>({file,...JSON.parse(fs.readFileSync(new URL(file,directory)))}));
const sample=()=>structuredClone(fixtures.find(f=>f.file==='atp-20250907.json').events[0]);
const mainMatch=e=>e.groupings[0].competitions.find(c=>Number(c.round.id)<8);
const collector=(payload,now)=>createCollector(async url=>String(url).includes('/tennis/')?payload:{events:[]},now)();
const preferences={enabled:true,sports:['Tennis'],teams:[]};

for(const fixture of fixtures)test(`verified ESPN ${fixture.file}: all adult main draws accepted, qualifying excluded`,async()=>{
  assert.equal(fixture.events.length,1);
  const tournament=fixture.events[0],now=Date.parse(tournament.endDate)-1000;
  assert.ok(tournamentIdentity(tournament));
  const raw=tennisEvents(fixture),games=await collector(fixture,now);
  assert.equal(games.length,5);assert.equal(raw.length,5);
  assert.deepEqual(new Set(games.map(g=>g.tennisMatch.type.id)),new Set(['1','2','3','4','6']));
  for(const game of games){
    assert.equal(currentGameAllowed(game,now),true);
    const original=raw.find(e=>e.id===game.id).competitions[0];
    assert.deepEqual(game.tennisMatch.format,original.format,'provider format is unchanged, never inferred');
    assert.deepEqual(game.tennisMatch.competitors.map(c=>c.linescores),original.competitors.map(c=>c.linescores));
    assert.equal(game.tennisCoverage.pointByPoint,false);assert.equal(game.tennisCoverage.history,false);
    assert.equal(game.scoringPartial,true,'completed scoreboard-only matches retain partial-history protection');
    assert.equal(game.modelVersion,runtime.MODEL_VERSION);
    assert.ok(game.teams.every(t=>t[8] && t[0]!=='Unknown'));
  }
});

test('both tours are collected once and overlapping matches deduplicate by stable match ID',async()=>{
  const atp=fixtures.find(f=>f.file==='atp-20250907.json'),wta=fixtures.find(f=>f.file==='wta-20250907.json'),urls=[];
  const now=Date.parse(atp.events[0].endDate)-1000;
  const games=await createCollector(async url=>{urls.push(url);return url.includes('/tennis/atp/')?atp:url.includes('/tennis/wta/')?wta:{events:[]};},now)();
  assert.equal(urls.filter(url=>url.includes('/tennis/')).length,2);
  assert.equal(games.length,5);assert.equal(new Set(games.map(g=>g.id)).size,5);
  assert.ok(games.some(g=>g.tennisMatch.type.id==='2'));
  // WTA-only results also work; no assumption that ATP always carries women.
  const women=await createCollector(async url=>url.includes('/tennis/wta/')?wta:{events:[]},now)();
  assert.equal(women.length,5);assert.ok(women.every(g=>g.providerPath==='tennis/wta'));
  assert.equal(LIVE_FEEDS.filter(f=>f.sport==='Tennis').length,2);
});

test('season identity uses base ID plus corroborating edition metadata and exact name aliases',()=>{
  for(const [id,names] of Object.entries({'154':['Australian Open'],'172':['French Open','Roland-Garros','Roland Garros'],'188':['Wimbledon','The Championships, Wimbledon'],'189':['US Open','U.S. Open']})){
    for(const name of names)for(const year of [2024,2025,2026,2027]){
      const e={...sample(),id:`${id}-${year}`,name,shortName:name,season:{year}};
      assert.deepEqual(tournamentIdentity(e),{id,year});
      e.name=`${name} ${year}`;assert.ok(tournamentIdentity(e));
    }
  }
  const e=sample();e.season.year=2024;assert.equal(tournamentIdentity(e),null);
  e.season.year=2025;e.name='Australian Open';assert.equal(tournamentIdentity(e),null);
});

for(const [id,name] of [
  [13,'Rolex Paris Masters'],[10,'Erste Bank Open'],[315,'Rolex Shanghai Masters'],
  [404,'BNP Paribas Open'],[403,'Miami Open'],[1005,'SP Open'],[887,'Guadalajara Open presentado por Santander'],
  [998,'Montreux Nestlé Open'],[1023,'Open Internacional de San Sebastian'],[1027,'Huzhou Open'],
  [999,'ATP 250'],[999,'ATP 500'],[999,'ATP 1000'],[999,'WTA 1000'],[999,'Challenger'],[999,'ITF'],[999,'Exhibition']
])test(`excluded tournament ${name} cannot pass even with major=true`,()=>{
  const e={...sample(),id:`${id}-2025`,name,shortName:name,major:true};
  assert.equal(tournamentIdentity(e),null);assert.deepEqual(tennisEvents({events:[e]}),[]);
});

test('missing or contradictory identity and draw metadata fail closed',()=>{
  const mutations=[e=>delete e.id,e=>e.id='189',e=>e.id='999-2025',e=>delete e.major,e=>e.major=false,
    e=>delete e.season,e=>e.name='US Open Juniors',e=>e.shortName='US Open Wheelchair',e=>delete e.name && delete e.shortName];
  for(const mutate of mutations){const e=sample();mutate(e);assert.deepEqual(tennisEvents({events:[e]}),[]);}
  const e=sample(),original=mainMatch(e),group=e.groupings[0].grouping;
  const changes=[m=>delete m.tournamentId,m=>m.tournamentId=154,m=>delete m.round,
    m=>m.round={id:'11',displayName:'Qualifying 1st Round'},m=>m.round={id:'14',displayName:'Qualifying Final'},
    m=>m.round={id:'1',displayName:'Qualifying'},m=>m.round={id:'99',displayName:'Final'},m=>m.round={id:'15',displayName:'Group Stage'},
    m=>m.type={id:'1',text:'Boys Singles'},m=>m.type={id:'1',text:'Wheelchair Singles'},
    m=>m.type={id:'1',text:'Exhibition'},m=>m.type={id:'1',text:'Junior Singles'},m=>m.isExhibition=true];
  for(const mutate of changes){const m=structuredClone(original);mutate(m);assert.equal(mainDrawMatch(e,m,group),false);}
  assert.equal(mainDrawMatch(e,original,{id:'unknown',displayName:"Men's Singles"}),false);
});

test('flat and nested verified major structures deduplicate without requiring tournament status',()=>{
  const e=sample(),m=structuredClone(mainMatch(e)),baseline=tennisEvents({events:[e]});
  delete e.status;e.competitions=[m];e.groupings[0].competitions.push(structuredClone(m));
  assert.equal(tennisEvents({events:[e]}).length,baseline.length);
  delete e.groupings;assert.equal(tennisEvents({events:[e]}).length,1);
});

test('outside provider tournament window no matches leak from a stale major scoreboard',async()=>{
  const e=sample();
  for(const now of [Date.parse(e.date)-1,Date.parse(e.endDate)+1,Date.parse('2026-11-02T12:00:00Z')])assert.deepEqual(await collector({events:[e]},now),[]);
  delete e.endDate;assert.deepEqual(await collector({events:[e]},Date.now()),[]);
});

function database(t){
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  return {db,DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(s){return Promise.all(s.map(x=>x.run()));}}};
}
const feed=games=>({modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),games});
async function currentMajor(){
  const e=sample();e.date=new Date(Date.now()-86400000).toISOString();e.endDate=new Date(Date.now()+86400000).toISOString();
  return (await collector({events:[e]},Date.now()))[0];
}

test('inline and multipart old feeds filter on every read; publication filters; history and preferences remain intact',async t=>{
  const env=database(t),major=await currentMajor(),excluded={...major,id:'excluded',tennisTournament:{id:'13-2026',name:'Rolex Paris Masters'}};
  const other={id:'nfl',sport:'NFL',state:'upcoming'},value=feed([excluded,major,other]);
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify(value));
  env.db.prepare('INSERT INTO notification_preferences VALUES (?,?,?,?,?,?)').run('device',1,'["Tennis"]','[]',80,0);
  env.db.prepare('INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('Tennis:excluded',Date.now(),'Tennis','completed',50,'2','0','','',JSON.stringify(excluded));
  for(let i=0;i<2;i++)assert.deepEqual((await readFeed(env)).games.map(g=>g.id),[major.id,'nfl']);
  const response=await worker.fetch(new Request('https://test/feed'),env,{});assert.equal(response.status,200);
  assert.deepEqual((await response.json()).games.map(g=>g.id),[major.id,'nfl']);
  env.db.prepare('UPDATE sports_feed SET payload=?').run(JSON.stringify({...value,games:undefined,revision:'old',parts:1}));
  env.db.prepare('INSERT INTO sports_feed_parts VALUES (?,?,?)').run('old',0,JSON.stringify(value.games));
  assert.deepEqual((await readFeed(env)).games.map(g=>g.id),[major.id,'nfl']);
  const now=Date.now()+1,newFeed={...value,updatedAt:new Date(now).toISOString()};
  env.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run('refresh','test',now+60000);
  const published=await publishFeed(env,newFeed,'test',()=>now);
  assert.deepEqual(published.games.map(g=>g.id),[major.id,'nfl']);
  assert.deepEqual((await readFeed(env,now)).games.map(g=>g.id),[major.id,'nfl']);
  assert.equal(env.db.prepare('SELECT normalized_state FROM sports_snapshots').get().normalized_state,JSON.stringify(excluded));
  assert.equal(env.db.prepare('SELECT sports_json FROM notification_preferences').get().sports_json,'["Tennis"]');
});

test('excluded cached live/scheduled matches cannot resolve as current Game Center API results; completed archives survive',async t=>{
  const env=database(t),major=await currentMajor(),excluded={...major,id:'old',state:'live',tennisTournament:{id:'13-2026',name:'Rolex Paris Masters'}};
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify(feed([excluded])));
  env.db.prepare('INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run('Tennis:old',Date.now(),'Tennis','live',90,'1','1','','',JSON.stringify(excluded));
  assert.equal(await gameDetails(env,'Tennis','old'),null);
  assert.equal((await worker.fetch(new Request('https://test/game/Tennis/old'),env,{})).status,404);
  excluded.state='completed';env.db.prepare('UPDATE sports_snapshots SET normalized_state=?').run(JSON.stringify(excluded));
  const archived=await gameDetails(env,'Tennis','old');assert.equal(archived.sportsRadarArchived,true);assert.equal(archived.sportsRadarFreshness.stale,true);
});

test('non-major matches cannot create new notifications or pass queued delivery even with a high complete score',async t=>{
  const env=database(t),major=await currentMajor(),now=Date.now();
  const excluded={...major,id:'excluded',state:'live',score:99,scoringPartial:false,tennisTournament:{...major.tennisTournament,id:'13-2025',name:'Rolex Paris Masters'}};
  const value=feed([excluded]);
  assert.equal(currentAlertGame(value,excluded),false);assert.equal(notificationEligible(excluded,preferences),false);
  const liveMajor={...major,state:'live',score:99,scoringPartial:false};
  assert.equal(currentAlertGame(feed([liveMajor]),liveMajor),true,'coverage gate preserves independent evidence eligibility');
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify(value));
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('device','https://push.invalid','key','auth',80,Math.floor(now/1000));
  const key=runtime.MODEL_VERSION+':Tennis:excluded';
  env.db.prepare('INSERT INTO game_state VALUES (?,?,?)').run(key,60,Math.floor(now/1000));
  const sent=[];await checkGames(env,value,async(...args)=>{sent.push(args);return 201;});
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM alerts').get().n,0);
  env.db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,created_at) VALUES (?,?,?,?,?,?)').run('device',key,99,'Old','Old',Math.floor(now/1000));
  // Also exercise the queue with an unfiltered caller to prove defense in depth.
  await drainAlerts(env,async()=>value,async(...args)=>{sent.push(args);return 201;});
  assert.deepEqual(sent,[]);assert.equal(env.db.prepare('SELECT status FROM alerts').get().status,'cancelled');
});

test('excluded tournaments do not trigger enrichment, history writes or AI calls during ingestion',async t=>{
  const env=database(t),e=sample(),requests=[],original=globalThis.fetch;
  e.id='13-2025';e.name='Rolex Paris Masters';e.shortName=e.name;
  globalThis.fetch=async url=>{requests.push(String(url));assert.match(String(url),/scoreboard/);return Response.json(String(url).includes('/tennis/')?{events:[e]}:{events:[]});};
  t.after(()=>globalThis.fetch=original);
  env.AI={run(){assert.fail('excluded Tennis must never use AI');}};
  const result=await refreshSportsData(env,Date.now(),{log:()=>{}});
  assert.ok(result);assert.deepEqual(result.games,[]);assert.deepEqual(result.sourceErrors,[]);
  assert.equal(requests.filter(url=>url.includes('/tennis/')).length,2);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,0);
});

test('browser uses the identical policy before games enter cards, filters, rankings, watch recommendations and search',async()=>{
  const source=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8'),context=vm.createContext({favoriteFor:()=>false});
  vm.runInContext(fs.readFileSync(new URL('../../tennis-coverage.js',import.meta.url),'utf8'),context);
  vm.runInContext(source.slice(source.indexOf('function canonicalFeedGames('),source.indexOf('\nasync function loadLiveGames')),context);
  const major=await currentMajor(),excluded={...major,id:'excluded',tennisTournament:{id:'13-2026',name:'Rolex Paris Masters'}},nfl={id:'nfl',sport:'NFL'};
  context.input=[excluded,major,nfl];
  assert.deepEqual(Array.from(vm.runInContext('canonicalFeedGames(input).map(g=>g.id)',context)),[major.id,'nfl']);
  context.input=[excluded];assert.equal(vm.runInContext('canonicalFeedGames(input).length',context),0);
  assert.match(source,/No Grand Slam matches are available/);
});
