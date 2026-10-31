import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nhlGameCenterStats} from '../src/providers/nhl.js';
import {DatabaseSync} from 'node:sqlite';
import {gameDetails} from '../src/sports-feed.js';
const raw=JSON.parse(readFileSync(new URL('../../test/fixtures/nhl-public/2023030417.json',import.meta.url)));
const game={sport:'NHL',state:'completed',id:'espn-123',sourceEvent:{date:raw.startTimeUTC,season:{type:3}}};
const summary={header:{season:{type:3},competitions:[{status:{period:3,displayClock:'0:00',type:{state:'post'}},competitors:[
  {homeAway:'home',score:'2',team:{id:'espn-home',abbreviation:'FLA'}},
  {homeAway:'away',score:'1',team:{id:'espn-away',abbreviation:'EDM'}}]}]}};
function reader({schedule,stale=false}={}) {
  const calls=[];
  return {calls,read:async url=>{calls.push(url);return {updatedAt:1000,stale,payload:url.includes('/schedule/')?
    {gameWeek:[{games:schedule || [{id:raw.id,startTimeUTC:raw.startTimeUTC,homeTeam:raw.homeTeam,awayTeam:raw.awayTeam}]}]}:raw};}};
}
test('NHL details map ESPN IDs by both teams/date, fetch public PBP and reuse caller caching',async()=>{
  const r=reader(),stats=await nhlGameCenterStats(game,summary,r.read);
  assert.equal(stats.available,true);assert.equal(stats.scoreMatches,true);
  assert.deepEqual(stats.teamIdMap,{'espn-home':'13','espn-away':'22'});
  assert.ok(r.calls[0].endsWith('/schedule/2024-06-24'));assert.ok(r.calls[1].endsWith('/2023030417/play-by-play'));
  assert.ok(r.calls.every(url=>!url.includes('espn-123')));
});
test('ambiguous identity, provider failure, and upstream mismatches fail closed without losing ESPN summary',async()=>{
  const invalid=reader({schedule:[]});assert.equal((await nhlGameCenterStats(game,summary,invalid.read)).available,false);
  assert.equal(invalid.calls.length,1);
  const broken=await nhlGameCenterStats(game,summary,async()=>{throw new Error('timeout');});assert.equal(broken.available,false);
  const bad=reader({schedule:[{id:raw.id,startTimeUTC:raw.startTimeUTC,homeTeam:raw.homeTeam,awayTeam:{abbrev:'NYR'}}]});
  assert.equal((await nhlGameCenterStats(game,summary,bad.read)).available,false);
});
test('stale and score-mismatched NHL details are visible but ineligible for experimental scoring',async()=>{
  const stale=reader({stale:true}),s=await nhlGameCenterStats(game,summary,stale.read);
  assert.equal(s.available,true);assert.equal(s.stale,true);assert.equal(s.pressureEligible,false);
  const changed=structuredClone(summary);changed.header.competitions[0].competitors[0].score='3';
  const r=reader(),mismatch=await nhlGameCenterStats(game,changed,r.read);
  assert.equal(mismatch.scoreMatches,false);assert.equal(mismatch.pressureEligible,false);
});
test('upcoming and other sports never request NHL data',async()=>{
  for(const change of [{state:'upcoming'},{sport:'NFL'}]) {
    const r=reader();await nhlGameCenterStats({...game,...change},summary,r.read);assert.equal(r.calls.length,0);
  }
});
test('completed shootout scores reconcile without adding deciding goals to shot attempts',async()=>{
  const so=JSON.parse(readFileSync(new URL('../../test/fixtures/nhl-public/2024020022.json',import.meta.url)));
  const comp={status:{period:5,type:{state:'post',detail:'Final/SO'}},competitors:[
    {homeAway:'home',score:String(so.homeTeam.score),team:{id:'v',abbreviation:'VAN'}},
    {homeAway:'away',score:String(so.awayTeam.score),team:{id:'p',abbreviation:'PHI'}}]};
  const stats=await nhlGameCenterStats({...game,startTime:so.startTimeUTC,sourceEvent:null},{header:{competitions:[comp]}},async url=>({
    updatedAt:1000,payload:url.includes('/schedule/')?{gameWeek:[{games:[{id:so.id,startTimeUTC:so.startTimeUTC,homeTeam:so.homeTeam,awayTeam:so.awayTeam}]}]}:so}));
  assert.equal(stats.scoreMatches,true);assert.equal(stats.score[String(so.awayTeam.id)],2);assert.equal(so.awayTeam.score,3);
});
test('real Game Center route enriches serialized feed games, caches public resources, leaves feed ratings/history unchanged',async t=>{
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},
    async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},
    async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};}}};
  const now=Date.now(),feed={updatedAt:new Date(now).toISOString(),games:[{id:game.id,sport:'NHL',state:'completed',startTime:raw.startTimeUTC,score:70,modelVersion:'unchanged'}]};
  const before=JSON.stringify(feed);db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(before);
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async url=>{calls.push(String(url));return Response.json(String(url).includes('/summary')?summary:String(url).includes('/schedule/')?
    {gameWeek:[{games:[{id:raw.id,startTimeUTC:raw.startTimeUTC,homeTeam:raw.homeTeam,awayTeam:raw.awayTeam}]}]}:raw);};
  t.after(()=>{globalThis.fetch=original;db.close();});
  const result=await gameDetails(env,'NHL',game.id,now);
  assert.equal(result.nhlAdvanced.available,true);assert.equal(result.nhlAdvanced.fullGame['13'].cf>0,true);
  assert.equal(calls.length,3);
  const cached=await gameDetails(env,'NHL',game.id,now+1000);assert.equal(calls.length,3);assert.deepEqual(cached.nhlAdvanced.fullGame,result.nhlAdvanced.fullGame);
  assert.equal(db.prepare('SELECT payload FROM sports_feed WHERE id=1').get().payload,before);
  assert.equal(await gameDetails(env,'NHL','unrecognized-id',now),null);assert.equal(calls.length,3);
});
