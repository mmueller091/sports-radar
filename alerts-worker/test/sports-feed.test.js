import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import vm from 'node:vm';
import sourceHelper from '../../test/helpers/scoring-source.cjs';
import worker,{checkGames} from '../src/index.js';
import {refreshSportsData,readFeed,gameDetails,teamDetails,refreshDue,normalizeTeamSchedule,normalizeTeamLeaders} from '../src/sports-feed.js';
import {coreTeamProfileUrl,teamLeadersUrl} from '../src/providers/espn.js';
import {normalizeEvent,enrichGame} from '../src/game-model.js';
import {baseballSituation,footballSituation} from '../src/display-model.js';

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
  competitors:[{team:{id:'1',displayName:'Home',abbreviation:'HME'},score:'24'},{team:{id:'2',displayName:'Away',abbreviation:'AWY'},score:'23'}]
}]};
const summary = {header:{competitions:event.competitions},boxscore:{teams:[],players:[]},plays:[],scoringPlays:[],winprobability:[]};

function awayHomeTeams(teams,fixture){
  const competitors=fixture.event.competitions?.[0]?.competitors||[];
  const order=new Map(competitors.map(competitor=>[String(competitor.team?.id||''),competitor.homeAway==='home'?1:competitor.homeAway==='away'?0:2]));
  return [...teams].sort((a,b)=>(order.get(String(a[8]||''))??2)-(order.get(String(b[8]||''))??2));
}

test('refresh cadence is 12 seconds for live feeds and 60 seconds otherwise',()=>{
  const live={updatedAt:new Date(100000).toISOString(),games:[{state:'live'}]};
  const idle={updatedAt:new Date(100000).toISOString(),games:[{state:'upcoming'}]};
  assert.equal(refreshDue(null,100000),true);
  assert.equal(refreshDue(live,111999),false);
  assert.equal(refreshDue(live,112000),true);
  assert.equal(refreshDue(idle,159999),false);
  assert.equal(refreshDue(idle,160000),true);
});

test('feed carries an NFL entering record from live scoreboard to final result',async t=>{
  const env=database();
  const original=globalThis.fetch;
  const gameEvent={id:'sf-atl',name:'San Francisco 49ers at Atlanta Falcons',date:'2026-10-25T17:00:00Z',season:{type:2},competitions:[{
    status:{type:{state:'in',shortDetail:'Q4'},period:4},
    competitors:[
      {homeAway:'away',team:{id:'25',displayName:'San Francisco 49ers',abbreviation:'SF'},score:'20',records:[{type:'total',summary:'6-0'}]},
      {homeAway:'home',team:{id:'1',displayName:'Atlanta Falcons',abbreviation:'ATL'},score:'20',records:[{type:'total',summary:'3-3'}]}
    ],
    odds:[{details:'SF -3',spread:3,homeTeamOdds:{underdog:true}}]
  }]};
  globalThis.fetch=async url=>Response.json(String(url).includes('/summary')
    ? {header:{competitions:structuredClone(gameEvent.competitions)},plays:[],scoringPlays:[],winprobability:[]}
    : {events:String(url).includes('/football/nfl/') ? [structuredClone(gameEvent)] : []});
  t.after(()=>{globalThis.fetch=original;env.db.close();});
  const now=Date.now();
  const live=await refreshSportsData(env,now);
  assert.deepEqual(live.games[0].pregameRecords,['6-0','3-3']);
  gameEvent.competitions[0].status={type:{state:'post',completed:true,shortDetail:'Final'},period:4};
  gameEvent.competitions[0].competitors[0].records[0].summary='6-1';
  gameEvent.competitions[0].competitors[1].records[0].summary='4-3';
  gameEvent.competitions[0].competitors[1].score='29';
  const baseline=normalizeEvent(structuredClone(gameEvent),'NFL').score;
  const final=await refreshSportsData(env,now+15000);
  const game=final.games[0];
  assert.deepEqual(game.pregameRecords,['6-0','3-3']);
  assert.equal(game.factors.filter(factor=>factor.label==='Ended unbeaten start').length,1);
  assert.equal(game.factors.find(factor=>factor.label==='Ended unbeaten start').points,6);
  assert.equal(game.score,baseline+6);
});

test('completed NFL refresh recovers the latest valid pre-final records by team ID',async t=>{
  const original=globalThis.fetch;
  t.after(()=>{globalThis.fetch=original;});
  const now=Date.now();
  const finalEvent={id:'sf-atl',name:'San Francisco 49ers at Atlanta Falcons',date:'2026-10-25T17:00:00Z',season:{type:2},competitions:[{
    status:{type:{state:'post',completed:true,shortDetail:'Final'},period:4},
    competitors:[
      {homeAway:'away',team:{id:'25',displayName:'San Francisco 49ers',abbreviation:'SF'},score:'20',records:[{type:'total',summary:'6-1'}]},
      {homeAway:'home',team:{id:'1',displayName:'Atlanta Falcons',abbreviation:'ATL'},score:'29',records:[{type:'total',summary:'4-3'}]}
    ],
    odds:[{details:'SF -7',spread:7,homeTeamOdds:{underdog:true}}]
  }]};
  const baseline=normalizeEvent(structuredClone(finalEvent),'NFL');
  assert.equal(baseline.score,48);
  globalThis.fetch=async url=>Response.json(String(url).includes('/summary')
    ? {header:{competitions:structuredClone(finalEvent.competitions)},plays:[],scoringPlays:[],winprobability:[]}
    : {events:String(url).includes('/football/nfl/') ? [structuredClone(finalEvent)] : []});

  async function runCase({record,reverse=false,invalidBeforeFinal=false,lateBad=false,context=false}={}) {
    const env=database();
    t.after(()=>env.db.close());
    env.db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({updatedAt:new Date(now-120000).toISOString(),games:[baseline]}));
    const insert=env.db.prepare(`INSERT INTO sports_snapshots
      (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state)
      VALUES (?,?,?,?,?,?,?,?,?,?)`);
    const snapshot=(state,at,game)=>insert.run('NFL:sf-atl',at,'NFL',state,48,'20','29','4','',JSON.stringify(game));
    if (record) {
      const earlier={...baseline,state:'live',teams:structuredClone(baseline.teams)};
      earlier.teams.find(team=>String(team[8])==='25')[5]=record;
      earlier.teams.find(team=>String(team[8])==='1')[5]='3-3';
      if (reverse) earlier.teams.reverse();
      snapshot('live',now-240000,earlier);
    }
    if (invalidBeforeFinal) {
      const invalid={...baseline,state:'live',teams:structuredClone(baseline.teams)};
      invalid.teams.forEach(team=>{team[5]='unknown';});
      snapshot('live',now-210000,invalid);
    }
    snapshot('completed',now-180000,baseline);
    if (lateBad) snapshot('live',now-150000,{...baseline,state:'live',pregameRecords:['6-0','3-3']});
    if (context) env.db.prepare(`INSERT INTO game_context
      (event_id,sport,factor_type,context_text,confidence,source_title,source_url,expires_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run('sf-atl','NFL','playoff_rematch','Verified rematch',.9,'Test','https://example.test',Math.floor(now/1000)+86400,now);
    const feed=await refreshSportsData(env,now);
    assert.ok(feed);
    return {env,game:feed.games[0]};
  }

  const recovered=await runCase({record:'6-0',reverse:true,invalidBeforeFinal:true,lateBad:true,context:true});
  assert.equal(recovered.game.pregameRecords[recovered.game.teams.findIndex(team=>String(team[8])==='25')],'6-0');
  assert.equal(recovered.game.pregameRecords[recovered.game.teams.findIndex(team=>String(team[8])==='1')],'3-3');
  assert.equal(recovered.game.score,54,'49ers-Falcons rises from 48 to 54');
  assert.equal(recovered.game.factors.filter(f=>f.label==='Ended unbeaten start').length,1);
  assert.equal(recovered.game.factors.find(f=>f.label==='Ended unbeaten start').points,6);
  assert.equal(recovered.game.factors.find(f=>f.label==='Underdog won outright').points,18);
  assert.ok(recovered.game.qualitativeContexts?.length,'context rerating retains the bonus');
  const again=await refreshSportsData(recovered.env,now+60000);
  assert.equal(again.games[0].score,54);
  assert.equal(again.games[0].factors.filter(f=>f.label==='Ended unbeaten start').length,1);

  for (const options of [{lateBad:true},{record:'6-1'}]) {
    const {game}=await runCase(options);
    assert.equal(game.score,48);
    assert.equal(game.factors.filter(f=>f.label==='Ended unbeaten start').length,0);
  }
});

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
    const summaryWithSituation={...summary,drives:{current:{plays:[{end:{down:3,distance:4,downDistanceText:'3rd & 4 at AWY 38',shortDownDistanceText:'3rd & 4',possessionText:'AWY 38',team:{id:'2'}}}]}}};
    return Response.json(String(url).includes('/summary') ? summaryWithSituation : {events:String(url).includes('/football/nfl/') ? [structuredClone(event)] : []});
  };
  t.after(()=>{globalThis.fetch=original;env.db.close();});
  const now=Date.now();
  const feed=await refreshSportsData(env,now);
  assert.equal(feed.games.length,1,'works with zero push subscribers');
  assert.equal(feed.games[0].sport,'NFL');
  assert.equal(feed.games[0].teams[0][2],'24');
  assert.deepEqual(feed.games[0].footballSituation,{possessionTeamId:'2',downAndDistance:'3rd & 4',fieldPosition:'AWY 38'});
  assert.deepEqual(feed.games[0].scoreboard.footballSituation,feed.games[0].footballSituation,'browser-selected snapshot keeps the refreshed presentation-only situation');
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
  const callsBeforeLiveRefresh=calls.length;
  const refreshed=await refreshSportsData(env,now+15000);
  assert.equal(refreshed.updatedAt,new Date(now+15000).toISOString());
  assert.ok(calls.length>callsBeforeLiveRefresh,'live ESPN scoreboard and summary caches expire in time for the demand refresh');
  assert.equal(env.db.prepare('SELECT count(*) AS n FROM sports_snapshots').get().n,2);
  const snapshotTimes=env.db.prepare('SELECT observed_at FROM sports_snapshots ORDER BY observed_at').all().map(row=>row.observed_at);
  assert.equal(snapshotTimes[1]-snapshotTimes[0],15000,'live audit observations retain 15-second resolution');
  const before=calls.length;
  env.db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify({...refreshed,games:undefined,revision:undefined,parts:undefined,updatedAt:new Date(Date.now()-13000).toISOString(),games:refreshed.games}));
  env.db.prepare('UPDATE sports_resources SET updated_at=?').run(Date.now()-60000);
  const response=await worker.fetch(new Request('https://test/feed',{headers:{Origin:'https://mmueller091.github.io'}}),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://mmueller091.github.io');
  const demandFeed=await response.json();
  assert.equal(demandFeed.games[0].id,'42');
  assert.ok(calls.length>before,'a stale live /feed request performs a demand refresh');
  const afterDemandRefresh=calls.length;
  await Promise.all(Array.from({length:100},()=>readFeed(env)));
  assert.equal(calls.length,afterDemandRefresh,'fresh public feed reads reuse the stored data');
  const detail=await worker.fetch(new Request('https://test/game/NFL/42'),env);
  assert.equal(detail.status,200);
  const details=await detail.json();
  assert.deepEqual(details.header,summary.header);
  assert.deepEqual(details.boxscore,summary.boxscore);
  assert.ok(details.sportsRadarFreshness.updatedAt);
  assert.equal(calls.length,afterDemandRefresh,'detail reuses ingestion cache');
  assert.equal(await gameDetails(env,'NFL','unknown'),null);
  assert.equal((await worker.fetch(new Request('https://test/feed',{headers:{Origin:'https://evil.example'}}),env)).status,403);
  assert.deepEqual(await (await worker.fetch(new Request('https://test/contexts?games=NFL:42'),env)).json(),{contexts:{}});
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('device','https://example.test','key','auth',99,now);
  await checkGames(env,feed);
  assert.equal(env.db.prepare('SELECT score FROM game_state WHERE game_key=?').get('NFL:42').score,feed.games[0].score);
  assert.equal(calls.length,afterDemandRefresh,'alert evaluation does not acquire sports data');
  globalThis.fetch=async()=>{throw new Error('ESPN unavailable');};
  assert.equal(await refreshSportsData(env,now+180000),null);
  const stale=await readFeed(env,now+180000);
  assert.equal(stale.updatedAt,demandFeed.updatedAt);
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
  env.db.prepare('INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state) VALUES (?,?,?,?,?,?,?,?,?,?)').run('NFL:old',0,'NFL','live',50,'0','0','1','','{}');
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
  const {normalizeEvent,enrichGame}=vm.runInNewContext(`${originalCore}\n${model}\n({normalizeEvent,enrichGame})`,{baseballSituation,footballSituation});
  const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/migration-parity.json',import.meta.url),'utf8'));
  const inputs=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/migration-inputs.json.gz',import.meta.url))));
  assert.equal(Object.keys(expected).length,107);
  for (const [file,value] of Object.entries(expected)) {
    const fixture=inputs[file];
    const game=normalizeEvent(fixture.event,fixture.modelSport);
    if ((game.state!=='upcoming'||!game.line)&&!(game.division==='FCS'&&game.state==='upcoming')) enrichGame(game,fixture.summary);
    const actual=JSON.parse(JSON.stringify({score:game.score,baseScore:game.baseScore,openingScore:game.openingScore,factors:game.factors,teams:awayHomeTeams(game.teams,fixture)}));
    const canonicalExpected={...value,teams:awayHomeTeams(value.teams,fixture)};
    assert.deepEqual(actual,canonicalExpected,file);
  }
});

test('current shared core preserves all 107 games between the original browser adapter and Worker',async()=>{
  const source=gunzipSync(fs.readFileSync(new URL('./fixtures/pre-migration-browser.js.gz',import.meta.url))).toString().replace(/\r\n/g,'\n');
  const core=sourceHelper.scoringSource();
  const names=['iconFor','stateFromEvent','scoreValue','broadcastFor','normalizeEvent','playPosition','scoringEvents','compactPlay','summarySpecificWhy','enrichGameSignals'];
  let functions=names.map(name=>{
    const start=source.search(new RegExp(`^(?:async )?function ${name}\\(`,'m'));
    assert.ok(start>=0,`original browser function ${name} is present`);
    return source.slice(start,source.indexOf('\n}',start)+2);
  }).join('\n');
  // The archived adapter predates the optional completed aggregation context.
  // Supply it for the calibrated completed CFB and NHL aggregation hooks.
  functions=functions.replace(/(momentumImpact\([\s\S]*?\n\s+game\.state)\n(\s+\);)/,
    "$1,\n                  ['CFB','NHL'].includes(game.sport) && game.state === 'completed' ? {game,finishPoints:completedFinishPoints(game,summary)} : null\n$2");
  functions=functions.replace(/(upsetImpact\([\s\S]*?summaryCompetition\n\s+\))\n(\s+\);)/,
    '$1, game.sport, summaryCompetition\n$2');
  // NHL history now owns its finishing award; raw opening total is audit metadata.
  functions=functions.replace(/(openingScore:\s*rating\.openingScore,)/g,'$1 rawPregameScore:rating.rawPregameScore,');
  functions=functions.replace('/(0:00|last second|game[- ]winning)/i',"game.sport !== 'NHL' && /(0:00|last second|game[- ]winning)/i");
  const currentModel=fs.readFileSync(new URL('../src/game-model.js',import.meta.url),'utf8');
  const finishHelper=currentModel.slice(currentModel.indexOf('function completedFinishPoints('),currentModel.indexOf('\nexport {normalizeEvent'));
  const bindings=source.slice(source.indexOf('const {\n  SPORT_BASE,'),source.indexOf('function normalizedTeamName'));
  const logos=source.slice(source.indexOf('const LEAGUE_LOGOS'),source.indexOf('const DEMO_GAMES'));
  const context=vm.createContext({games:[],summary:null,favoriteFor:()=>false,isWatched:()=>false,summaryUrlFor:()=>'',rememberPregameLine:()=>{},recordRatingSnapshot:()=>{},render:()=>{}});
  context.fetchGameSummary=async()=>context.summary;
  vm.runInContext(`${core}\n${bindings}\n${logos}\n${functions}\n${finishHelper}`,context);
  const inputs=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/migration-inputs.json.gz',import.meta.url))));
  assert.equal(Object.keys(inputs).length,107);
  for (const [file,fixture] of Object.entries(inputs)) {
    const original=context.normalizeEvent(structuredClone(fixture.event),fixture.modelSport);
    context.games=[original];context.summary=structuredClone(fixture.summary);
    await context.enrichGameSignals();
    const migrated=normalizeEvent(structuredClone(fixture.event),fixture.modelSport);
    if ((migrated.state!=='upcoming'||!migrated.line)&&!(migrated.division==='FCS'&&migrated.state==='upcoming')) enrichGame(migrated,structuredClone(fixture.summary));
    // The Worker now uses normalized decimal clocks to choose the actual latest play;
    // the archived browser adapter still misorders those NBA plays.
    const clean=(game,fixture)=>{const value=JSON.parse(JSON.stringify(game));delete value.summaryUrl;delete value.footballSituation;delete value.baseballSituation;delete value.moment;delete value.momentLabel;value.teams=awayHomeTeams(value.teams,fixture);return value;};
    assert.deepEqual(clean(migrated,fixture),clean(original,fixture),file);
  }
});

test('detail cache hit performs no D1 writes or provider requests',async t=>{
  const env=database();t.after(()=>env.db.close());const now=Date.now();
  const game=normalizeEvent(event,'NFL');
  env.db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({updatedAt:new Date(now).toISOString(),games:[game]}));
  const {summaryUrl}=await import('../src/providers/espn.js');const url=summaryUrl(game);
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify(summary),now);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Unexpected provider call');};t.after(()=>{globalThis.fetch=original;});
  const before=env.db.prepare('SELECT total_changes() AS n').get().n;
  const result=await gameDetails(env,'NFL','42',now+1000);
  assert.equal(env.db.prepare('SELECT total_changes() AS n').get().n,before);
  assert.equal(result.sportsRadarFreshness.updatedAt,new Date(now).toISOString());
  assert.equal(result.sportsRadarFreshness.canonicalUpdatedAt,new Date(now).toISOString());
});

test('canonical summary contender reuses detail-owned resource and cannot duplicate fetch',async t=>{
  const env=database();t.after(()=>env.db.close());const now=Date.now();const game=normalizeEvent(event,'NFL');
  const {summaryUrl}=await import('../src/providers/espn.js');const url=summaryUrl(game);
  env.db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({updatedAt:new Date(now-60000).toISOString(),games:[game]}));
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify(summary),now-60000);
  let resolve,started;const ready=new Promise(r=>started=r);let calls=0;
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async value=>{
    if(String(value).includes('/summary')){calls++;started();return new Promise(r=>resolve=r);}
    return Response.json({events:String(value).includes('/football/nfl/')?[event]:[]});
  };
  const pending=gameDetails(env,'NFL','42',now);await ready;
  const feed=await refreshSportsData(env,now+1);
  assert.equal(calls,1);assert.equal(feed.games[0].detailStale,true);
  resolve(Response.json({...summary,marker:'detail'}));await pending;
  assert.equal(JSON.parse(env.db.prepare('SELECT payload FROM sports_resources WHERE key=?').get(url).payload).marker,'detail');
});

test('expired detail owner cannot overwrite canonical successor summary or mislabel version',async t=>{
  const env=database();t.after(()=>env.db.close());const now=Date.now();const game=normalizeEvent(event,'NFL');
  const {summaryUrl}=await import('../src/providers/espn.js');const url=summaryUrl(game);
  env.db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({updatedAt:new Date(now-60000).toISOString(),games:[game]}));
  let resolve,started;const ready=new Promise(r=>started=r);let calls=0;
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async value=>{
    if(String(value).includes('/summary')){
      calls++;if(calls===1){started();return new Promise(r=>resolve=r);}
      return Response.json({...summary,marker:'new'});
    }
    return Response.json({events:String(value).includes('/football/nfl/')?[event]:[]});
  };
  const pending=gameDetails(env,'NFL','42',now);await ready;
  await refreshSportsData(env,now+16000);
  resolve(Response.json({...summary,marker:'old'}));const result=await pending;
  assert.equal(result.marker,'new');assert.equal(result.sportsRadarFreshness.updatedAt,new Date(now+16000).toISOString());
  assert.equal(result.sportsRadarFreshness.stale,true);
  assert.equal(JSON.parse(env.db.prepare('SELECT payload FROM sports_resources WHERE key=?').get(url).payload).marker,'new');
});

test('detail provider timeout returns last stored payload and its original timestamp',async t=>{
  const env=database();t.after(()=>env.db.close());const now=Date.now();const game=normalizeEvent(event,'NFL');
  const {summaryUrl}=await import('../src/providers/espn.js');
  env.db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({updatedAt:new Date(now).toISOString(),games:[game]}));
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(summaryUrl(game),JSON.stringify(summary),now-60000);
  const original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});globalThis.fetch=async()=>{throw new DOMException('timeout','TimeoutError');};
  const result=await gameDetails(env,'NFL','42',now);
  assert.equal(result.sportsRadarFreshness.stale,true);assert.equal(result.sportsRadarFreshness.updatedAt,new Date(now-60000).toISOString());
});

test('team schedule and leader normalizers produce compact team-page data',() => {
  const schedule = normalizeTeamSchedule({
    team:{id:'33',abbreviation:'BAL',displayName:'Baltimore Ravens'},
    season:{year:2026,type:2},
    events:[
      {
        id:'game-1',
        date:'2026-10-25T17:00:00Z',
        competitions:[{
          status:{type:{state:'post',completed:true,shortDetail:'Final'}},
          broadcasts:[{names:['CBS']}],
          competitors:[
            {homeAway:'home',winner:true,score:'27',team:{id:'33',displayName:'Baltimore Ravens',abbreviation:'BAL',logos:[{href:'bal.png'}]}},
            {homeAway:'away',winner:false,score:'20',team:{id:'4',displayName:'Cincinnati Bengals',abbreviation:'CIN',logos:[{href:'cin.png'}]}}
          ]
        }]
      },
      {
        id:'game-2',
        date:'2026-11-01T18:00:00Z',
        competitions:[{
          status:{type:{state:'pre',shortDetail:'Sun 1:00 PM'}},
          broadcasts:[{names:['FOX']}],
          competitors:[
            {homeAway:'away',team:{id:'33',displayName:'Baltimore Ravens',abbreviation:'BAL'}},
            {homeAway:'home',team:{id:'23',displayName:'Pittsburgh Steelers',abbreviation:'PIT',logos:[{href:'pit.png'}]}}
          ]
        }]
      }
    ]
  },'33','NFL');

  assert.equal(schedule.length,2);
  assert.equal(schedule[0].state,'completed');
  assert.equal(schedule[0].result,'W');
  assert.equal(schedule[0].opponent.name,'Cincinnati Bengals');
  assert.equal(schedule[0].broadcast,'CBS');
  assert.equal(schedule[1].state,'upcoming');
  assert.equal(schedule[1].homeAway,'away');
  assert.equal(schedule[1].opponent.abbreviation,'PIT');

  const leaders = normalizeTeamLeaders({
    leaders:{
      categories:[
        {
          name:'passingYards',
          displayName:'Passing Yards',
          abbreviation:'YDS',
          leaders:[{displayValue:'2,104',value:2104,athlete:{id:'1',displayName:'Lamar Jackson',position:{abbreviation:'QB'},headshot:{href:'lamar.png'}}}]
        },
        {
          name:'rushingYards',
          displayName:'Rushing Yards',
          abbreviation:'YDS',
          leaders:[{displayValue:'811',value:811,athlete:{id:'2',displayName:'Derrick Henry',position:{abbreviation:'RB'}}}]
        },
        {
          name:'receivingYards',
          displayName:'Receiving Yards',
          abbreviation:'YDS',
          leaders:[{displayValue:'702',value:702,athlete:{id:'3',displayName:'Zay Flowers',position:{abbreviation:'WR'}}}]
        },
        {
          name:'sacks',
          displayName:'Sacks',
          abbreviation:'SACK',
          leaders:[{displayValue:'7.5',value:7.5,athlete:{id:'4',displayName:'Kyle Van Noy',position:{abbreviation:'LB'}}}]
        }
      ]
    }
  },'NFL');

  assert.equal(leaders.length,4);
  assert.deepEqual(leaders.map(item=>item.athlete.name),['Lamar Jackson','Derrick Henry','Zay Flowers','Kyle Van Noy']);
  assert.equal(leaders[0].athlete.headshot,'lamar.png');
});

test('Core team leader refs hydrate into the four requested NFL tiles',() => {
  const ref = id =>
    `http://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/${id}?lang=en&region=us`;

  const payload = {
    categories:[
      {name:'passingYards',displayName:'Passing Yards',leaders:[{value:967,displayValue:'967',athlete:{'$ref':ref('3916387')}}]},
      {name:'rushingYards',displayName:'Rushing Yards',leaders:[{value:579,displayValue:'579',athlete:{'$ref':ref('3043078')}}]},
      {name:'receivingYards',displayName:'Receiving Yards',leaders:[{value:608,displayValue:'608',athlete:{'$ref':ref('4429615')}}]},
      {name:'sacks',displayName:'Sacks',leaders:[{value:3.5,displayValue:'3.5',athlete:{'$ref':ref('4690179')}}]},
      {name:'interceptions',displayName:'Interceptions',leaders:[{value:1,displayValue:'1',athlete:{'$ref':ref('x')}}]}
    ]
  };

  const athletes = new Map([
    [ref('3916387').replace(/^http:/,'https:'),{id:'3916387',displayName:'Lamar Jackson',headshot:{href:'lamar.png'}}],
    [ref('3043078').replace(/^http:/,'https:'),{id:'3043078',displayName:'Derrick Henry'}],
    [ref('4429615').replace(/^http:/,'https:'),{id:'4429615',displayName:'Zay Flowers'}],
    [ref('4690179').replace(/^http:/,'https:'),{id:'4690179',displayName:'Tavius Robinson'}]
  ]);

  const leaders =
    normalizeTeamLeaders(
      payload,
      'NFL',
      athletes
    );

  assert.deepEqual(
    leaders.map(item => [item.category,item.value,item.athlete.name]),
    [
      ['Passing Yards',967,'Lamar Jackson'],
      ['Rushing Yards',579,'Derrick Henry'],
      ['Receiving Yards',608,'Zay Flowers'],
      ['Sacks',3.5,'Tavius Robinson']
    ]
  );
  assert.equal(leaders[0].athlete.headshot,'lamar.png');
  assert.equal(leaders[3].athlete.id,'4690179');
});

test('Core team profile URL targets the requested ESPN season',() => {
  assert.equal(
    coreTeamProfileUrl('NFL','33',2026),
    'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/teams/33?lang=en&region=us'
  );
  assert.equal(
    coreTeamProfileUrl('NBA','13',2027),
    'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/seasons/2027/teams/13?lang=en&region=us'
  );
});

function teamLeaderFixture(sport,id) {
  return JSON.parse(fs.readFileSync(new URL(`./fixtures/team-leaders/${sport}-${id}.json`,import.meta.url),'utf8'));
}

function mockTeamLeaderProvider(t,fixture,{fail='profile',fallback=fixture.fallback.payload}={}) {
  const original = globalThis.fetch;
  const calls = [];
  const unexpected = [];
  const resources = new Map([
    [fixture.team.url,fixture.team.payload],
    [fixture.schedule.url,fixture.schedule.payload],
    [fixture.profile.url,fixture.profile.payload],
    ...(fixture.core ? [[fixture.core.url,fixture.core.payload]] : []),
    ...Object.entries(fixture.athletes),
    [fixture.fallback.url,fallback]
  ]);
  globalThis.fetch = async (input,options) => {
    const url = String(input);
    calls.push({url,options});
    if (!resources.has(url)) {
      unexpected.push(url);
      throw new Error(`Unexpected provider URL: ${url}`);
    }
    if ((fail === 'profile' && url === fixture.profile.url) ||
        (fail === 'leaders' && url === fixture.core?.url) ||
        (fail?.includes('athletes') && Object.hasOwn(fixture.athletes,url)) ||
        (fail === 'all' && url !== fixture.team.url && url !== fixture.schedule.url) ||
        (fail === 'athletes-and-fallback' && url === fixture.fallback.url)) {
      return new Response('<html><h1>403 Forbidden</h1></html>',{status:403});
    }
    return Response.json(resources.get(url));
  };
  t.after(() => {
    globalThis.fetch = original;
    assert.deepEqual(unexpected,[]);
  });
  return calls;
}

const liveLeaderExpectations = [
  ['NFL','33',['Passing Yards','Rushing Yards','Receiving Yards','Sacks'],['Lamar Jackson','Derrick Henry','Zay Flowers','Tavius Robinson']],
  ['MLB','1',['Batting Average','Home Runs','Runs Batted In','Strikeouts'],['Pete Alonso','Pete Alonso','Pete Alonso','Trevor Rogers']],
  ['NHL','23',['Goals','Assists','Points','Save Percentage'],['Alex Tuch','Dylan Strome','Dylan Strome','Logan Thompson']],
  ['NBA','13',['Points Per Game','Rebounds Per Game','Assists Per Game','Blocks Per Game'],['Luka Doncic','Walker Kessler','Luka Doncic','Walker Kessler']],
  ['CFB','120',['Passing Yards','Rushing Yards','Receiving Yards','Sacks'],['Malik Washington','DeJuan Williams','Chris Durr Jr.','Zion Elee']]
];

for (const [sport,id,categories,names] of liveLeaderExpectations) {
  test(`production Core 403 -> team-season fallback serves four ${sport}/${id} leaders`,async t => {
    const fixture = teamLeaderFixture(sport,id);
    const env = database();
    t.after(() => env.db.close());
    const calls = mockTeamLeaderProvider(t,fixture);
    const response = await worker.fetch(new Request(`https://worker.test/team/${sport}/${id}`),env,{});
    assert.equal(response.status,200);
    const result = await response.json();
    assert.equal(result.team.id,id);
    assert.equal(result.schedule.length,fixture.schedule.payload.events.length);
    assert.deepEqual(result.leaders.map(l => l.category),categories);
    assert.deepEqual(result.leaders.map(l => l.athlete.name),names);
    assert.ok(result.leaders.every(l => l.athlete.id && l.athlete.headshot && l.athlete.position));
    const core = normalizeTeamLeaders(fixture.core.payload,sport,new Map(Object.entries(fixture.athletes)));
    assert.deepEqual(result.leaders.map(l => [l.athlete.id,l.value,l.displayValue]),core.map(l => [l.athlete.id,l.value,l.displayValue]));
    assert.deepEqual(calls.map(c => c.url),[fixture.team.url,fixture.schedule.url,fixture.profile.url,fixture.fallback.url]);
    assert.equal(calls.at(-1).options.cf.cacheTtl,6*60*60);
    assert.ok(env.db.prepare('SELECT key FROM sports_resources WHERE key=?').get(`team-details:v3:${sport}:${id}`));
  });
}

test('production Core categories hydrate successfully without requesting the fallback',async t => {
  const fixture = teamLeaderFixture('NFL','33');
  const env = database();
  t.after(() => env.db.close());
  const calls = mockTeamLeaderProvider(t,fixture,{fail:null});
  const now = Date.parse('2026-10-29T14:00:00Z');
  const result = await teamDetails(env,'NFL','33',now);
  assert.deepEqual(result.leaders.map(l => l.athlete.name),liveLeaderExpectations[0][3]);
  assert.equal(calls.some(c => c.url === fixture.fallback.url),false);
  for (const call of calls.filter(c => Object.hasOwn(fixture.athletes,c.url) || c.url === fixture.profile.url)) {
    assert.equal(call.options.cf.cacheTtl,24*60*60);
  }
  const count = calls.length;
  await teamDetails(env,'NFL','33',now+6*60*60*1000-1);
  assert.equal(calls.length,count);
  await teamDetails(env,'NFL','33',now+6*60*60*1000);
  assert.deepEqual(calls.slice(count).map(c => c.url),[fixture.team.url,fixture.schedule.url,fixture.core.url]);
  const refreshed = calls.length;
  await teamDetails(env,'NFL','33',now+24*60*60*1000);
  assert.equal(calls.slice(refreshed).filter(c => Object.hasOwn(fixture.athletes,c.url)).length,4);
  assert.ok(calls.slice(refreshed).some(c => c.url === fixture.profile.url));
});

for (const fail of ['leaders','athletes']) {
  test(`Core ${fail} failure uses expanded team-season fallback identities`,async t => {
    const fixture = teamLeaderFixture('NFL','33');
    const env = database();
    t.after(() => env.db.close());
    mockTeamLeaderProvider(t,fixture,{fail});
    const result = await teamDetails(env,'NFL','33');
    assert.deepEqual(result.leaders.map(l => l.athlete.name),liveLeaderExpectations[0][3]);
  });
}

test('athlete and fallback failures preserve valid Core stat tiles without invented names',async t => {
  const fixture = teamLeaderFixture('NFL','33');
  const env = database();
  t.after(() => env.db.close());
  mockTeamLeaderProvider(t,fixture,{fail:'athletes-and-fallback'});
  const result = await teamDetails(env,'NFL','33');
  assert.deepEqual(result.leaders.map(l => l.category),liveLeaderExpectations[0][2]);
  assert.deepEqual(result.leaders.map(l => l.displayValue),['967','579','608','3.5']);
  assert.ok(result.leaders.every(l => l.athlete.id && l.athlete.name === ''));
});

test('leader normalization preserves inline identity when hydration is incomplete',() => {
  const fixture = teamLeaderFixture('NFL','33');
  const category = fixture.core.payload.categories.find(c => c.name === 'sacks');
  const ref = category.leaders[0].athlete.$ref.replace(/^http:/,'https:');
  category.leaders[0].athlete.displayName = 'Tavius Robinson';
  const result = normalizeTeamLeaders({categories:[category]},'NFL',new Map([[ref,{id:'4690179'}]]));
  assert.equal(result[0].athlete.name,'Tavius Robinson');
});

test('NCAAB without current-season stats rejects the fallback previous season',async t => {
  const fixture = teamLeaderFixture('NCAAB','120');
  const env = database();
  t.after(() => env.db.close());
  assert.equal(fixture.season,2027);
  assert.equal(fixture.fallback.payload.requestedSeason.year,2026);
  const calls = mockTeamLeaderProvider(t,fixture,{fail:null});
  const result = await teamDetails(env,'NCAAB','120');
  assert.equal(result.team.id,'120');
  assert.equal(result.schedule.length,fixture.schedule.payload.events.length);
  assert.deepEqual(result.leaders,[]);
  const count = calls.length;
  await teamDetails(env,'NCAAB','120');
  assert.equal(calls.length,count);
});

for (const invalid of ['team','season']) {
  test(`fallback rejects a mismatched ${invalid} and leaves the team page available`,async t => {
    const fixture = teamLeaderFixture('NFL','33');
    const fallback = structuredClone(fixture.fallback.payload);
    if (invalid === 'season') fallback.requestedSeason.year = 2025;
    else fallback.leaders.categories.forEach(c => c.leaders?.forEach(l => {l.team.id='1';}));
    const env = database();
    t.after(() => env.db.close());
    mockTeamLeaderProvider(t,fixture,{fallback});
    const result = await teamDetails(env,'NFL','33');
    assert.equal(result.team.name,'Baltimore Ravens');
    assert.deepEqual(result.leaders,[]);
  });
}

test('all leader sources failing remains nonfatal to team identity, schedule and spotlights',async t => {
  const fixture = teamLeaderFixture('NFL','33');
  const env = database();
  t.after(() => env.db.close());
  mockTeamLeaderProvider(t,fixture,{fail:'all'});
  const result = await teamDetails(env,'NFL','33');
  assert.equal(result.team.name,'Baltimore Ravens');
  assert.equal(result.schedule.length,2);
  assert.ok(result.spotlights.last);
  assert.deepEqual(result.leaders,[]);
});

test('partial provider categories never substitute unrelated stats for the requested four',() => {
  const fixture = teamLeaderFixture('NFL','33');
  fixture.fallback.payload.leaders.categories = fixture.fallback.payload.leaders.categories.filter(c => c.name !== 'sacks');
  assert.deepEqual(normalizeTeamLeaders(fixture.fallback.payload,'NFL').map(l => l.category),['Passing Yards','Rushing Yards','Receiving Yards']);
  assert.equal(teamLeadersUrl('NFL','33',2026),fixture.fallback.url);
  assert.equal(teamLeadersUrl('Tennis','1',2026),null);
});
