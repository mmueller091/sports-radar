import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData} from '../src/sports-feed.js';

function database(t){const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  return {db,DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};}

for(const [label,score,valid] of [['omitted',undefined,false],['null',null,false],['blank','',false],['boolean',false,false],['nonnumeric','unknown',false],['numeric zero',0,true],['string zero','0',true]])
test(`matching completed ${label} scores ${valid?'establish':'cannot establish'} known final evidence`,async t=>{
  const env=database(t),now=Date.now(),id=`played-${label.replaceAll(' ','-')}`;
  const competition={status:{type:{state:'post',completed:true,shortDetail:'Final'},period:3,displayClock:'0:00'},competitors:[
    {homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'}},
    {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'}}]};
  if(score!==undefined)for(const team of competition.competitors)team.score=score;
  const event={id,date:new Date(now-3600000).toISOString(),name:'Away at Home',competitions:[competition]};
  const summary={header:{competitions:[structuredClone(competition)]}};
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:'previous-model',updatedAt:new Date(now-60000).toISOString(),games:[]}));
  const url=`https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=${id}`;
  env.db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(url,JSON.stringify(summary),now);
  const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
  globalThis.fetch=async value=>{const request=new URL(value);return Response.json(request.pathname.endsWith('/summary')?summary:{events:request.pathname.includes('/hockey/nhl/')?[event]:[]});};
  const feed=await refreshSportsData(env,now,{log:()=>{}}),game=feed?.games.find(g=>g.id===id);assert.ok(game);
  if(valid){assert.equal(game.enrichmentPending,undefined);assert.notEqual(game.scoringPartial,true);}
  else for(const target of [game,game.scoreboard]){assert.equal(target.enrichmentPending,true);assert.equal(target.scoringPartial,true);assert.equal(target.evidenceQuality,'partial');}
  assert.equal(env.db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE state='completed'").get().n,valid?1:0);
  assert.deepEqual(JSON.parse(env.db.prepare('SELECT payload FROM sports_resources WHERE key=?').get(url).payload),summary,'compatibility never fills missing raw scores');
});
