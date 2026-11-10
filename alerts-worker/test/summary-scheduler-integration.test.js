import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData,readFeed} from '../src/sports-feed.js';

const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function waitFor(promise,label) {
  let timer;
  try {
    return await Promise.race([promise,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error(label)),10000);
    })]);
  }finally{clearTimeout(timer);}
}

function database() {
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  return {db,DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){return /^\s*SELECT\b/i.test(sql)
      ? {results:db.prepare(sql).all(...args),meta:{changes:0}}
      : {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };},async batch(statements){const results=[];for(const statement of statements)results.push(await statement.run());return results;}}};
}

function event(id,state,now) {
  return {id,name:'Away at Home',date:new Date(now-86400000).toISOString(),competitions:[{
    status:{type:{state,completed:state==='post',shortDetail:state==='post'?'Final':'Q4'},period:4,displayClock:state==='post'?'0:00':'1:00'},
    competitors:[
      {homeAway:'away',team:{id:'1',displayName:'Away',abbreviation:'AWY'},score:'20'},
      {homeAway:'home',team:{id:'2',displayName:'Home',abbreviation:'HME'},score:'14'}]
  }]};
}
const snapshotRows=env=>env.db.prepare('SELECT game_key,observed_at,state,rating,normalized_state,model_version FROM sports_snapshots ORDER BY game_key,observed_at,state').all();
const json=value=>JSON.parse(JSON.stringify(value));

test('a slow required nonlive summary does not idle other slots or permit incomplete publication',async t=>{
  const now=Date.now();t.mock.method(Date,'now',()=>now);
  const events=[...Array.from({length:7},(_,id)=>event('done'+id,'post',now)),event('live0','in',now)];
  const byId=new Map(events.map(game=>[game.id,game]));
  const reference=database(),delayed=database();
  const first=gate(),seventh=gate(),release=gate();
  const calls=[];let blocking=false,active=0,maxActive=0,published=false,work;
  const original=globalThis.fetch;
  globalThis.fetch=async value=>{
    const url=new URL(value);
    assert.equal(url.hostname,'site.api.espn.com','all provider requests are mocked');
    if(!url.pathname.endsWith('/summary'))return Response.json({events:
      url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?events:[]});
    const id=url.searchParams.get('event'),game=byId.get(id);
    assert.ok(game,`known fixture summary ${id}`);
    if(blocking){
      calls.push(id);active++;maxActive=Math.max(maxActive,active);
      try {
        if(id==='done0'){first.resolve();await release.promise;}
        if(id==='done6')seventh.resolve();
      }finally{active--;}
    }
    return Response.json({header:{competitions:game.competitions},plays:[],scoringPlays:[],winprobability:[]});
  };
  t.after(async()=>{
    release.resolve();if(work)await Promise.allSettled([work]);
    globalThis.fetch=original;reference.db.close();delayed.db.close();
  });

  const expected=await refreshSportsData(reference,now,{log:()=>{}});
  assert.ok(expected);assert.equal(expected.games.length,8);
  blocking=true;
  work=refreshSportsData(delayed,now,{log:()=>{},onPublished:()=>{published=true;}});
  await waitFor(first.promise,'first required nonlive summary did not start');
  await waitFor(seventh.promise,'seventh summary waited for the blocked first summary');
  assert.equal(calls[0],'live0','live summary still precedes every nonlive acquisition');
  assert.equal(published,false,'required validation still gates publication');
  assert.equal(await readFeed(delayed,now),null,'no tentative feed becomes public');
  assert.equal(snapshotRows(delayed).length,0,'no partial observations are written while required work is pending');
  assert.ok(maxActive<=6);

  release.resolve();const actual=await work;
  assert.ok(actual);assert.equal(published,true);
  assert.deepEqual(json(actual.games),json(expected.games),'provider completion order does not change complete game data');
  assert.deepEqual(json(actual.scoreCalculations),json(expected.scoreCalculations),'canonical calculations remain identical');
  assert.deepEqual(snapshotRows(delayed),snapshotRows(reference),'snapshot history remains identical');
  assert.deepEqual(json((await readFeed(delayed,now)).games),json(actual.games));
  assert.equal(delayed.db.prepare("SELECT COUNT(*) AS count FROM sports_leases WHERE key='refresh'").get().count,0);
});
