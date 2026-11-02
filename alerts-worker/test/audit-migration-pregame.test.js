import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData,MODEL_VERSION} from '../src/sports-feed.js';

function database(t){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  return {db,DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};}

for(const [sport,provider] of [['NHL','hockey/nhl'],['NBA','basketball/nba']])for(const absent of ['omitted','null'])
test(`migration accepts ${sport} pregame summary ${absent} scores with scoreboard zero placeholders`,async t=>{
  const env=database(t),now=Date.now(),id=`pregame-${sport}-${absent}`;
  const competition={status:{type:{state:'pre',completed:false,shortDetail:'Scheduled'},period:0},competitors:[
    {homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'0'},
    {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'0'}]};
  const event={id,date:new Date(now+86400000).toISOString(),name:'Away at Home',competitions:[competition]};
  const header=structuredClone(competition);for(const c of header.competitors){if(absent==='null')c.score=null;else delete c.score;}
  const summary={header:{competitions:[header]}};
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
  const url=`https://site.api.espn.com/apis/site/v2/sports/${provider}/summary?event=${id}`;
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify(summary),now);
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let summaryRequests=0;
  globalThis.fetch=async value=>{const request=new URL(value);if(request.pathname.endsWith('/summary')){summaryRequests++;return Response.json(summary);}
    return Response.json({events:request.pathname.includes(`/${provider}/`)?[event]:[]});};
  const feed=await refreshSportsData(env,now,{log:()=>{}}),game=feed?.games.find(g=>g.id===id);
  assert.ok(game);assert.equal(game.state,'upcoming');assert.equal(game.modelVersion,MODEL_VERSION);
  assert.equal(game.enrichmentPending,undefined,'normal pregame absent scores do not create permanent migration pending');
  assert.notEqual(game.scoringPartial,true);assert.equal(game.detailStale,false);assert.equal(summaryRequests,0,'compatible cached provider facts need no forced refetch');
  assert.ok(feed.enrichment[`${sport}:${id}`]);
  assert.deepEqual(game.teams.map(team=>team[2]),['0','0'],'scoreboard placeholders remain unchanged');
  assert.deepEqual(JSON.parse(env.db.prepare('SELECT payload FROM sports_resources WHERE key=?').get(url).payload),summary,'compatibility does not manufacture score fields in provider evidence');
});

for(const [state,incomingScore] of [['pre','1'],['pre',false],['post',undefined],['post',null]])
test(`migration rejects ${state} summary score ${String(incomingScore)} against scoreboard zero`,async t=>{
  const env=database(t),now=Date.now(),id=`reject-${state}-${String(incomingScore)}`;
  const competition={status:{type:{state,completed:state==='post',shortDetail:state==='post'?'Final':'Scheduled'},period:state==='post'?3:0,displayClock:'0:00'},competitors:[
    {homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'0'},
    {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'0'}]};
  const event={id,date:new Date(now+86400000).toISOString(),name:'Away at Home',competitions:[competition]};
  const header=structuredClone(competition);for(const c of header.competitors){if(incomingScore===undefined)delete c.score;else c.score=incomingScore;}
  const summary={header:{competitions:[header]}};
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
  const url=`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=${id}`;
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify(summary),now);
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async value=>{const request=new URL(value);return Response.json(request.pathname.endsWith('/summary')?summary:{events:request.pathname.includes('/hockey/nhl/')?[event]:[]});};
  const feed=await refreshSportsData(env,now,{log:()=>{}}),game=feed?.games.find(g=>g.id===id);
  assert.ok(game);assert.equal(game.enrichmentPending,true);assert.equal(game.scoringPartial,true);assert.equal(game.evidenceQuality,'partial');
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE state='completed'").get().n,0);
});
