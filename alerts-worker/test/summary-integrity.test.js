import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {read} from '../../test/helpers/production-integrity.mjs';
import {refreshSportsData,gameDetails} from '../src/sports-feed.js';
import {normalizeEvent,enrichGame} from '../src/live-game-model.js';
import {shouldSnapshot} from '../src/snapshot-history.js';

function database(t){
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 t.after(()=>db.close());
 return {db,DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},
  async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},
  async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};},
  async batch(items){return Promise.all(items.map(i=>i.run()));}}};
}
const full=read('NFL-401873033-final'),pre=read('NFL-401873033-prematch');
const event=()=>({...structuredClone(full.header),competitions:structuredClone(full.header.competitions)});
const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401873033';

test('real Chiefs final resource survives provider reversion to prematch without losing final bonuses',async t=>{
 const env=database(t),original=globalThis.fetch;let response=full;
 t.after(()=>{globalThis.fetch=original;});
 globalThis.fetch=async input=>Response.json(String(input).includes('/summary')?structuredClone(response):
  {events:String(input).includes('/football/nfl/')?[event()]:[]});
 const now=Date.now(),first=await refreshSportsData(env,now,{log:()=>{}});
 const score=first.games[0].score;assert.ok(first.games[0].momentumPoints>0);
 assert.equal(pre.header.competitions[0].status.type.state,'pre');
 assert.equal(pre.scoringPlays,undefined);
 response=pre;
 for(let i=1;i<=3;i++){
  const next=await refreshSportsData(env,now+i*61000,{log:()=>{}});
  assert.equal(next.games[0].score,score);
  assert.equal(next.games[0].moment,first.games[0].moment);
  const saved=env.db.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').get(url);
  assert.equal(JSON.parse(saved.payload).header.competitions[0].status.type.state,'post');
  assert.equal(saved.updated_at,now,'rejected payload must not refresh evidence age');
 }
 const detail=await gameDetails(env,'NFL','401873033',now+244000);
 assert.equal(detail.scoringPlays.length,full.scoringPlays.length);
 assert.equal(detail.sportsRadarFreshness.stale,true);
 assert.ok(env.db.prepare('SELECT rating FROM sports_snapshots').all().every(r=>r.rating===score));
});

test('a prematch resource cannot seed completed bonuses or a completed snapshot',async t=>{
 const game=normalizeEvent(event(),'NFL');enrichGame(game,pre);
 assert.equal(game.scoringPartial,true);assert.equal(game.summaryLifecycleRejected,true);
 assert.equal(shouldSnapshot(game,{completed:new Map()},Date.now(),'test'),false);
 const env=database(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 env.db.prepare('INSERT INTO sports_feed VALUES(1,?)').run(JSON.stringify({updatedAt:new Date().toISOString(),games:[game]}));
 env.db.prepare('INSERT INTO sports_resources VALUES(?,?,?)').run(url,JSON.stringify(pre),Date.now());
 globalThis.fetch=async()=>Response.json(pre);
 await assert.rejects(gameDetails(env,'NFL','401873033'),/prematch/);
});

test('real final score corrections and a final-to-live overtime correction still replace the resource',async t=>{
 const env=database(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
 const game=normalizeEvent(event(),'NFL'),now=Date.now();
 env.db.prepare('INSERT INTO sports_feed VALUES(1,?)').run(JSON.stringify({updatedAt:new Date(now).toISOString(),games:[game]}));
 env.db.prepare('INSERT INTO sports_resources VALUES(?,?,?)').run(url,JSON.stringify(full),now-60000);
 const correction=structuredClone(full);correction.header.competitions[0].competitors[0].score='27';
 globalThis.fetch=async()=>Response.json(correction);
 await gameDetails(env,'NFL','401873033',now);
 assert.equal(JSON.parse(env.db.prepare('SELECT payload FROM sports_resources WHERE key=?').get(url).payload).header.competitions[0].competitors[0].score,'27');
 const resumed=structuredClone(full);resumed.header.competitions[0].status={period:5,displayClock:'10:00',type:{state:'in',completed:false}};
 globalThis.fetch=async()=>Response.json(resumed);
 await gameDetails(env,'NFL','401873033',now+61000);
 assert.equal(JSON.parse(env.db.prepare('SELECT payload FROM sports_resources WHERE key=?').get(url).payload).header.competitions[0].status.type.state,'in');
});
