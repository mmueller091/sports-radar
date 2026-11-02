import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import {createCollector} from '../src/providers/espn.js';
import {refreshSportsData} from '../src/sports-feed.js';
import worker from '../src/index.js';
import runtime from '../../scoring/live-runtime.cjs';

const capture=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/audit-integrity/tennis-20261101.json.gz',import.meta.url))));
const contract=JSON.parse(fs.readFileSync(new URL('./fixtures/audit-integrity/tennis-contract-20261028.json',import.meta.url)));
const collect=payload=>createCollector(async url=>String(url).includes('/tennis/')?payload:{events:[]})();
function database(t,games){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:runtime.MODEL_VERSION,games,updatedAt:new Date().toISOString()}));
  return {db,DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};}

test('F8 full captured ATP scoreboard collects all 225 individual matches with actual status',async()=>{
  const games=await collect(capture.payload);
  assert.equal(games.length,225);assert.equal(new Set(games.map(g=>g.id)).size,225);
  assert.equal(games.filter(g=>g.state==='completed').length,143);
  assert.equal(games.filter(g=>g.state==='upcoming').length,82);
  assert.equal(games.filter(g=>g.state==='live').length,0);
  for(const upcoming of games.filter(g=>g.state==='upcoming')){assert.equal(upcoming.tennisCoverage.sets,false);assert.deepEqual(upcoming.teams.map(t=>t[2]),['—','—']);}
  for(const game of games){assert.equal(game.sport,'Tennis');assert.equal(game.teams.length,2);for(const team of game.teams){assert.ok(team[8]);assert.notEqual(team[0],'Unknown');}}
});

test('F8 real live singles and doubles retain IDs, names and score detail without fake point state',async()=>{
  const games=await collect(contract.scoreboard),live=games.find(g=>g.id==='185198'),doubles=games.find(g=>g.id==='185215');
  assert.ok(live);assert.equal(live.state,'live');assert.deepEqual(live.teams.map(t=>t[8]),['2651','10386']);
  assert.match(doubles.teams[0][0],/Andreozzi.*Guinard/);assert.equal(doubles.teams[0][8],'2292-3735');
  assert.equal(live.tennisCoverage.pointByPoint,false);assert.equal(live.tennisCoverage.history,false);
  assert.equal(live.scoringPartial,true);assert.equal(live.liveRawSituation.matchPoint,undefined);
  const final=games.find(g=>g.id==='187149');assert.deepEqual(final.teams.map(t=>t[2]),['1','2']);
});

test('F8 duplicate nested competitions and flat matches appear once',async()=>{
  const payload=structuredClone(contract.scoreboard),match=payload.events[0].groupings[0].competitions[0];
  const baseline=await collect(payload);
  payload.events.push({id:match.id,date:match.date,competitions:[structuredClone(match)]});
  payload.events[0].groupings[0].competitions.push(structuredClone(match));
  const repeated=await collect(payload);
  assert.ok(baseline.length>0);assert.equal(repeated.length,baseline.length);
  assert.equal(repeated.filter(g=>g.id===match.id).length,1);
});

test('F8 /feed and /game use the same canonical Tennis match and expose available sets/tiebreaks',async t=>{
  const games=await collect(contract.scoreboard),env=database(t,games);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('No generic Tennis summary route or real network');};t.after(()=>globalThis.fetch=original);
  const feed=await worker.fetch(new Request('https://test.invalid/feed'),env,{});
  assert.equal(feed.status,200);assert.equal((await feed.json()).games.length,4);
  const response=await worker.fetch(new Request('https://test.invalid/game/Tennis/187153'),env,{});
  assert.equal(response.status,200);const detail=await response.json(),game=games.find(g=>g.id==='187153');
  assert.equal(detail.sportsRadarGame.id,game.id);assert.equal(detail.sportsRadarGame.score,game.score);
  assert.equal(detail.header.competitions[0].competitors[0].linescores[1].tiebreak,7);
  assert.equal(detail.sportsRadarCoverage.source,'scoreboard');assert.equal(detail.sportsRadarCoverage.pointByPoint,false);
  const unknown=await worker.fetch(new Request('https://test.invalid/game/Tennis/unknown'),env,{});assert.equal(unknown.status,404);
});

test('F8 ingestion persists live Tennis coverage without any unsupported summary requests',async t=>{
  const env=database(t,[]),original=globalThis.fetch,urls=[];env.db.prepare('DELETE FROM sports_feed').run();
  globalThis.fetch=async url=>{urls.push(String(url));assert.doesNotMatch(String(url),/\/tennis\/atp\/summary/);
    return Response.json(String(url).includes('/tennis/atp/scoreboard')?contract.scoreboard:{events:[]});};t.after(()=>globalThis.fetch=original);
  const feed=await refreshSportsData(env,Date.now(),{log:()=>{}});
  assert.ok(feed);assert.equal(feed.games.length,4);assert.equal(feed.sourceErrors.length,0);
  assert.ok(urls.some(url=>url.includes('/tennis/atp/scoreboard')));
  for(const live of feed.games.filter(g=>g.state==='live')){assert.equal(live.scoringPartial,true);assert.equal(live.tennisCoverage.history,false);}
  const response=await worker.fetch(new Request('https://test.invalid/game/Tennis/185198'),env,{});
  assert.equal(response.status,200);assert.equal((await response.json()).sportsRadarGame.state,'live');
});

test('F8 first model-transition publication ingests all 225 captured matches without summary work',async t=>{
  const env=database(t,[]),now=Date.now(),urls=[],statements=[],batches=[];
  env.db.prepare('UPDATE sports_feed SET payload=?').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
  // Deterministic, conservative latency control: each mocked D1 round trip and
  // provider request consumes 100 ms, even when requests run concurrently.
  let elapsed=0,inBatch=false;
  const originalPrepare=env.DB.prepare.bind(env.DB),originalBatch=env.DB.batch.bind(env.DB);
  env.DB.prepare=sql=>{const statement=originalPrepare(sql);
    for(const operation of ['first','all','run']){const original=statement[operation].bind(statement);statement[operation]=async()=>{statements.push(sql);if(!inBatch)elapsed+=100;return original();};}
    return statement;
  };
  env.DB.batch=async statements=>{elapsed+=100;batches.push(statements.length);inBatch=true;try{return await originalBatch(statements);}finally{inBatch=false;}};
  const originalFetch=globalThis.fetch;t.after(()=>globalThis.fetch=originalFetch);
  globalThis.fetch=async url=>{elapsed+=100;urls.push(String(url));assert.doesNotMatch(String(url),/\/summary/);
    return Response.json(String(url).includes('/tennis/atp/scoreboard')?capture.payload:{events:[]});};
  let metrics;const feed=await refreshSportsData(env,now,{clock:()=>elapsed,log:entry=>metrics=entry});
  assert.ok(feed,JSON.stringify(metrics));assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
  assert.equal(feed.games.length,225);assert.ok(feed.games.every(g=>g.modelVersion===runtime.MODEL_VERSION));
  assert.equal(metrics.candidates,0);assert.equal(metrics.criticalCandidates,0);assert.equal(metrics.cachedSummaryReads,0);
  assert.equal(metrics.published,true);assert.ok(metrics.publicationMs<25000);
  assert.equal(feed.games.filter(g=>g.state==='completed'&&g.scoringPartial).length,143);
  assert.equal(feed.games.filter(g=>g.state==='upcoming').length,82);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,82,'only schedules are stored; partial finals are not promoted to complete history');
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM sports_resources WHERE key LIKE '%/summary%'").get().n,0);
  console.log('TENNIS_MODEL_TRANSITION '+JSON.stringify({games:feed.games.length,completedPartial:143,upcoming:82,
    providerRequests:urls.length,summaryRequests:0,criticalCandidates:metrics.criticalCandidates,
    snapshotStatements:statements.filter(sql=>sql.includes('INSERT OR IGNORE INTO sports_snapshots')).length,
    batches,simulatedPublicationMs:metrics.publicationMs,feedParts:feed.parts}));
});

test('F8 missing set evidence remains missing and tournament status never creates a live match',async()=>{
  const payload=structuredClone(contract.scoreboard),tournament=payload.events[0];
  tournament.status={type:{state:'in',completed:false}};
  for(const group of tournament.groupings)for(const match of group.competitions){
    match.status={period:2,type:{state:'pre',completed:false,shortDetail:'Scheduled'}};
    for(const competitor of match.competitors){delete competitor.linescores;delete competitor.score;}
  }
  const games=await collect(payload);assert.equal(games.length,4);assert.ok(games.every(g=>g.state==='upcoming'));
  for(const game of games){assert.deepEqual(game.teams.map(t=>t[2]),['—','—']);assert.equal(game.tennisCoverage.sets,false);}
  const match=tournament.groupings[0].competitions[0];match.status={period:2,type:{state:'in',completed:false}};
  for(const competitor of match.competitors)competitor.linescores=[{value:6},{value:1}];
  const live=(await collect(payload)).find(g=>g.id===match.id);
  assert.deepEqual(live.teams.map(t=>t[2]),['—','—'],'missing winner flags do not invent historical set results');
});

test('F8 live set totals exclude future set records but preserve an explicit just-completed current set',async()=>{
  const payload=structuredClone(contract.scoreboard),match=payload.events[0].groupings[0].competitions.find(c=>c.id==='185198');
  match.status.period=1;
  match.competitors[0].linescores=[{value:1},{value:6,winner:true}];
  match.competitors[1].linescores=[{value:2},{value:3,winner:false}];
  const game=(await collect(payload)).find(g=>g.id===match.id);
  assert.deepEqual(game.teams.map(t=>t[2]),['0','0']);
  assert.equal(game.tennisMatch.competitors[0].linescores.length,1);
  match.competitors[0].linescores=[{value:6,winner:true}];match.competitors[1].linescores=[{value:4,winner:false}];
  assert.deepEqual((await collect(payload)).find(g=>g.id===match.id).teams.map(t=>t[2]),['1','0']);
});

test('F8 null, empty and invalid explicit set scores stay unavailable; genuine zero remains zero',async()=>{
  for(const value of [null,undefined,'',' ',false,NaN,Infinity,'unavailable',0,'0']){
    const payload=structuredClone(contract.scoreboard),match=payload.events[0].groupings[0].competitions[0];
    match.status={period:1,type:{state:'pre',completed:false}};
    for(const c of match.competitors){delete c.linescores;c.score=value;}
    const actual=(await collect(payload)).find(g=>g.id===match.id).teams.map(t=>t[2]);
    assert.deepEqual(actual,value===0||value==='0'?['0','0']:['—','—'],String(value));
  }
});
