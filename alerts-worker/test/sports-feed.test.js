import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import worker,{checkGames} from '../src/index.js';
import {refreshSportsData,readFeed,gameDetails} from '../src/sports-feed.js';
import {normalizeEvent,enrichGame} from '../src/game-model.js';
import {footballSituation} from '../src/display-model.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  return {db,DB:{
    prepare(sql) {
      let values=[];
      return {bind(...args) {values=args;return this;},
        async first() {return db.prepare(sql).get(...values) || null;},
        async all() {return {results:db.prepare(sql).all(...values)};},
        async run() {return {meta:{changes:db.prepare(sql).run(...values).changes}};}};
    },
    async batch(statements) {return Promise.all(statements.map(s=>s.run()));}
  }};
}
const event = {id:'42',name:'Away at Home',date:'2026-10-22T20:00:00Z',competitions:[{
  status:{type:{state:'in',shortDetail:'Q4 1:00'},period:4,displayClock:'1:00'},
  competitors:[{team:{id:'1',displayName:'Home',abbreviation:'H'},score:'24'},{team:{id:'2',displayName:'Away',abbreviation:'A'},score:'23'}]
}]};
const summary = {header:{competitions:event.competitions},boxscore:{teams:[],players:[]},plays:[],scoringPlays:[],winprobability:[]};

test('basketball detail API adds normalized players using the existing cached summary',async t=>{
  const env=database();
  t.after(()=>env.db.close());
  const now=Date.now();
  for (const sport of ['NBA','NCAAB']) {
    const game=normalizeEvent(structuredClone(event),sport);
    env.db.prepare('INSERT OR REPLACE INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({games:[game],updatedAt:new Date(now).toISOString()}));
    const {summaryUrl}=await import('../src/providers/espn.js');
    const payload={...summary,boxscore:{players:[{team:{id:'1',displayName:'Home'},statistics:[{labels:['PTS','MIN'],athletes:[{athlete:{id:'7',displayName:'Player Seven'},starter:true,stats:['23','31']}]}]}]}};
    env.db.prepare('INSERT OR REPLACE INTO sports_resources (key,payload,updated_at) VALUES (?,?,?)').run(summaryUrl(game),JSON.stringify(payload),now);
    const detail=await gameDetails(env,sport,'42',now);
    assert.equal(detail.basketballBoxScore.teams[0].players[0].stats.points,'23');
    assert.equal(detail.basketballBoxScore.teams[0].players[0].stats.minutes,'31');
    assert.deepEqual(detail.boxscore,payload.boxscore,'existing summary contract preserved');
  }
});

test('central refresh, API, shared alerts, history, failures and CORS',async t=>{
  const env=database();
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async url=>{
    calls.push(String(url));
    return Response.json(String(url).includes('/summary') ? summary : {events:String(url).includes('/football/nfl/') ? [structuredClone(event)] : []});
  };
  t.after(()=>{globalThis.fetch=original;env.db.close();});
  const now=Date.now();
  const feed=await refreshSportsData(env,now);
  assert.equal(feed.games.length,1,'works with zero push subscribers');
  assert.equal(feed.games[0].sport,'NFL');
  assert.equal(feed.games[0].teams[0][2],'24');
  assert.equal(feed.freshness.stale,false);
  assert.equal(feed.updatedAt,new Date(now).toISOString());
  assert.equal(new Set(calls).size,calls.length,'each source fetched only once');
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM sports_snapshots').get().n,1);
  const snapshot=env.db.prepare('SELECT * FROM sports_snapshots').get();
  assert.equal(snapshot.rating,feed.games[0].score);
  assert.equal(snapshot.clock,'1:00');
  assert.equal(JSON.parse(snapshot.normalized_state).teams[1][2],'23');
  await refreshSportsData(env,now+1);
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM sports_snapshots').get().n,1);
  const before=calls.length;
  const response=await worker.fetch(new Request('https://test/feed',{headers:{Origin:'https://mmueller091.github.io'}}),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://mmueller091.github.io');
  assert.equal((await response.json()).games[0].id,'42');
  await Promise.all(Array.from({length:100},()=>readFeed(env)));
  assert.equal(calls.length,before,'public feed reads never fetch ESPN');
  const detail=await worker.fetch(new Request('https://test/game/NFL/42'),env);
  assert.equal(detail.status,200);
  const details=await detail.json();
  assert.deepEqual(details.header,summary.header);
  assert.deepEqual(details.boxscore,summary.boxscore);
  assert.ok(details.sportsRadarFreshness.updatedAt);
  assert.equal(calls.length,before,'detail reuses ingestion cache');
  assert.equal(await gameDetails(env,'NFL','unknown'),null);
  assert.equal((await worker.fetch(new Request('https://test/feed',{headers:{Origin:'https://evil.example'}}),env)).status,403);
  assert.deepEqual(await (await worker.fetch(new Request('https://test/contexts?games=NFL:42'),env)).json(),{contexts:{}});
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('device','https://example.test','key','auth',99,now);
  await checkGames(env,feed);
  assert.equal(env.db.prepare('SELECT score FROM game_state WHERE game_key=?').get('NFL:42').score,feed.games[0].score);
  assert.equal(calls.length,before,'alert evaluation does not acquire sports data');
  globalThis.fetch=async()=>{throw new Error('ESPN unavailable');};
  assert.equal(await refreshSportsData(env,now+180000),null);
  const stale=await readFeed(env,now+180000);
  assert.equal(stale.updatedAt,feed.updatedAt);
  assert.equal(stale.freshness.stale,true);
  assert.deepEqual(stale.games,JSON.parse(JSON.stringify(feed.games)));
});

test('overlapping refreshes acquire one ingestion lease and retention removes old snapshots',async t=>{
  const env=database();const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;env.db.close();});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  globalThis.fetch=async()=>{await gate;return Response.json({events:[]});};
  const now=Date.now();
  const first=refreshSportsData(env,now);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(await refreshSportsData(env,now),null);
  release();
  assert.ok(await first);
  env.db.prepare('INSERT INTO sports_snapshots VALUES (?,?,?,?,?,?,?,?,?,?)').run('NFL:old',0,'NFL','live',50,'0','0','1','','{}');
  await refreshSportsData(env,now+60000);
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM sports_snapshots').get().n,0);
});

test('browser source has no ESPN acquisition or secondary enrichment',()=>{
  const app=fs.readFileSync(new URL('../../app.js',import.meta.url),'utf8');
  const sw=fs.readFileSync(new URL('../../sw.js',import.meta.url),'utf8');
  assert.doesNotMatch(app,/site\.api\.espn|ESPN_BASE|fetchScoreboard|fetchNFLWindow|enrichGameSignals/);
  assert.doesNotMatch(sw,/espn\.com/);
  assert.match(app,/\/feed/);
  assert.match(app,/\/game\//);
  assert.match(app,/feed.updatedAt/);
});

test('detail failure is identified without discarding fresh scoreboards or evaluating incomplete alerts',async t=>{
  const env=database();const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;env.db.close();});
  globalThis.fetch=async url=>String(url).includes('/summary')
    ? new Response('Unavailable',{status:503})
    : Response.json({events:String(url).includes('/football/nfl/') ? [structuredClone(event)] : []});
  const feed=await refreshSportsData(env);
  assert.equal(feed.games.length,1);
  assert.equal(feed.freshness.stale,false);
  assert.equal(feed.freshness.degraded,true);
  assert.equal(feed.games[0].detailStale,true);
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('device','https://example.test','key','auth',99,Date.now());
  await checkGames(env,feed);
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM game_state').get().n,0);
});

test('moved normalization and enrichment preserve pre-migration fixture ratings and factors',()=>{
  // Golden values captured from the original browser functions before migration.
  // Pin their original core: later independent scoring commits must not rewrite them.
  const originalCore=gunzipSync(fs.readFileSync(new URL('./fixtures/pre-migration-core.js.gz',import.meta.url))).toString();
  const model=fs.readFileSync(new URL('../src/game-model.js',import.meta.url),'utf8')
    .replace(/^import .*;\s*$/gm,'').replace(/^export .*;\s*$/gm,'');
  const {normalizeEvent,enrichGame}=vm.runInNewContext(`${originalCore}\n${model}\n({normalizeEvent,enrichGame})`,{footballSituation});
  const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/migration-parity.json',import.meta.url),'utf8'));
  const inputs=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/migration-inputs.json.gz',import.meta.url))));
  assert.equal(Object.keys(expected).length,107);
  for (const [file,value] of Object.entries(expected)) {
    const fixture=inputs[file];
    const game=normalizeEvent(fixture.event,fixture.modelSport);
    if ((game.state!=='upcoming'||!game.line)&&!(game.division==='FCS'&&game.state==='upcoming')) enrichGame(game,fixture.summary);
    const actual=JSON.parse(JSON.stringify({score:game.score,baseScore:game.baseScore,openingScore:game.openingScore,factors:game.factors,teams:game.teams}));
    assert.deepEqual(actual,value,file);
  }
});

test('current shared core preserves all 107 games between the original browser adapter and Worker',async()=>{
  const source=gunzipSync(fs.readFileSync(new URL('./fixtures/pre-migration-browser.js.gz',import.meta.url))).toString().replace(/\r\n/g,'\n');
  const core=fs.readFileSync(new URL('../../rating-core.js',import.meta.url),'utf8');
  const names=['iconFor','stateFromEvent','scoreValue','broadcastFor','normalizeEvent','playPosition','scoringEvents','compactPlay','summarySpecificWhy','enrichGameSignals'];
  const functions=names.map(name=>{
    const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
    assert.ok(start>=0,`original browser function ${name} is present`);
    return source.slice(start,source.indexOf('\n}',start)+2);
  }).join('\n');
  const bindings=source.slice(source.indexOf('const {\n  SPORT_BASE,'),source.indexOf('function normalizedTeamName'));
  const logos=source.slice(source.indexOf('const LEAGUE_LOGOS'),source.indexOf('const DEMO_GAMES'));
  const context=vm.createContext({games:[],summary:null,favoriteFor:()=>false,isWatched:()=>false,summaryUrlFor:()=>'',rememberPregameLine:()=>{},recordRatingSnapshot:()=>{},render:()=>{}});
  context.fetchGameSummary=async()=>context.summary;
  vm.runInContext(`${core}\n${bindings}\n${logos}\n${functions}`,context);
  const inputs=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/migration-inputs.json.gz',import.meta.url))));
  assert.equal(Object.keys(inputs).length,107);
  for (const [file,fixture] of Object.entries(inputs)) {
    const original=context.normalizeEvent(structuredClone(fixture.event),fixture.modelSport);
    context.games=[original];context.summary=structuredClone(fixture.summary);
    await context.enrichGameSignals();
    const migrated=normalizeEvent(structuredClone(fixture.event),fixture.modelSport);
    if ((migrated.state!=='upcoming'||!migrated.line)&&!(migrated.division==='FCS'&&migrated.state==='upcoming')) enrichGame(migrated,structuredClone(fixture.summary));
    const clean=game=>{const value=JSON.parse(JSON.stringify(game));delete value.summaryUrl;delete value.footballSituation;return value;};
    assert.deepEqual(clean(migrated),clean(original),file);
  }
});
