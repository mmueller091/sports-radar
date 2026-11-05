import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runCycle} from '../social-bot/src/engine.mjs';
import {sendToBuffer,discoverXChannel} from '../social-bot/src/buffer.mjs';
import {readStoredFeed} from '../social-bot/src/logic.mjs';

const model='2026-11-05.live-integrity.1';
const started=Date.parse('2026-11-05T21:00:00Z');
const silence=()=>{};

class TestD1 {
  constructor(){this.sqlite=new DatabaseSync(':memory:');}
  exec(sql){this.sqlite.exec(sql);}
  prepare(sql){
    const stmt=this.sqlite.prepare(sql);
    let values=[];
    const result={
      bind(...args){values=args;return result;},
      async first(){return stmt.get(...values)||null;},
      async all(){return {results:stmt.all(...values)};},
      async run(){const info=stmt.run(...values);return {meta:{changes:Number(info.changes)}};}
    };
    return result;
  }
}

function fixture({enabled=true}={}){
  const SOURCE_DB=new TestD1(),BOT_DB=new TestD1();
  SOURCE_DB.exec(`CREATE TABLE sports_feed(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);
    CREATE TABLE sports_feed_parts(revision TEXT,part INTEGER,payload TEXT);`);
  BOT_DB.exec(readFileSync(new URL('../social-bot/schema.sql',import.meta.url),'utf8'));
  const env={SOURCE_DB,BOT_DB,POSTING_ENABLED:String(enabled),EXPECTED_SCORING_MODEL:model,
    BUFFER_API_KEY:'unit-test-only',BUFFER_X_CHANNEL_ID:'channel-unit-test'};
  const teams=[['Baltimore Ravens','BAL','','','','',null,'Baltimore','33'],
    ['Philadelphia Eagles','PHI','','','','',null,'Philadelphia','21']];
  const publish=(score,at,overrides={})=>{
    const game={sport:'NFL',id:'401873024',state:'live',modelVersion:model,score,
      teams,why:'A late lead change has made this a close game.',...overrides};
    const feed={modelVersion:model,updatedAt:new Date(at).toISOString(),games:[game]};
    SOURCE_DB.prepare('INSERT INTO sports_feed(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload')
      .bind(JSON.stringify(feed)).run();
    return game;
  };
  const statuses=async()=>(await BOT_DB.prepare('SELECT * FROM social_post_claims').all()).results;
  return {env,publish,statuses};
}

function successfulBuffer(calls){
  return async (url,options)=>{
    calls.push({url,options});
    return {ok:true,status:200,headers:{get:()=>null},
      json:async()=>({data:{createPost:{post:{id:'buffer-123'}}}})};
  };
}

test('84, 85, 84, 86 posts once across repeated and restarted cron runs',async()=>{
  const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
  f.publish(84,started);
  assert.equal((await runCycle(f.env,{now:started+100,fetchImpl,log:silence})).claimed,0);
  f.publish(85,started+60_000);
  const at85=await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
  assert.equal(at85.claimed,1);
  assert.equal(at85.accepted,1);
  f.publish(84,started+120_000);
  await runCycle(f.env,{now:started+120_100,fetchImpl,log:silence});
  f.publish(86,started+180_000);
  assert.equal((await runCycle(f.env,{now:started+180_100,fetchImpl,log:silence})).claimed,0);
  assert.equal((await runCycle(f.env,{now:started+180_100,fetchImpl,log:silence})).claimed,0);
  assert.equal(calls.length,1);
  assert.equal((await f.statuses()).length,1);
  assert.equal((await f.statuses())[0].status,'accepted');
  assert.equal((await f.statuses())[0].buffer_post_id,'buffer-123');
  assert.equal(JSON.parse(calls[0].options.body).variables.input.mode,'shareNow');
  assert.ok(calls[0].options.body.includes('#RavensFlock'));
});

test('simultaneous cycles cannot claim or send the same threshold twice',async()=>{
  const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
  f.publish(84,started);await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  f.publish(86,started+60_000);
  await Promise.all([runCycle(f.env,{now:started+60_100,fetchImpl,log:silence}),
    runCycle(f.env,{now:started+60_100,fetchImpl,log:silence})]);
  assert.equal(calls.length,1);
  assert.equal((await f.statuses()).length,1);
});

test('unknown Buffer delivery is consumed and never automatically retried',async()=>{
  const f=fixture(),calls=[];
  const failed=async()=>{calls.push('attempt');throw Error('Connection lost after send');};
  f.publish(84,started);await runCycle(f.env,{now:started+100,fetchImpl:failed,log:silence});
  f.publish(85,started+60_000);await runCycle(f.env,{now:started+60_100,fetchImpl:failed,log:silence});
  f.publish(84,started+120_000);await runCycle(f.env,{now:started+120_100,fetchImpl:failed,log:silence});
  f.publish(86,started+180_000);await runCycle(f.env,{now:started+180_100,fetchImpl:failed,log:silence});
  assert.deepEqual(calls,['attempt']);
  assert.equal((await f.statuses())[0].status,'delivery_unknown');
});

test('dry run records observations but never creates a claim or reaches Buffer',async()=>{
  const f=fixture({enabled:false}),calls=[];
  f.publish(84,started);await runCycle(f.env,{now:started+100,fetchImpl:successfulBuffer(calls),log:silence});
  f.publish(85,started+60_000);
  const output=await runCycle(f.env,{now:started+60_100,fetchImpl:successfulBuffer(calls),log:silence});
  assert.equal(output.crossings,1);
  assert.equal(output.claimed,0);
  assert.equal(calls.length,0);
  assert.equal((await f.statuses()).length,0);
});

test('old model, partial game, and stale feed cannot trigger a post',async()=>{
  const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
  f.publish(84,started);await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  f.publish(85,started+60_000,{scoringPartial:true});
  await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
  f.publish(86,started+120_000,{modelVersion:'old'});
  await runCycle(f.env,{now:started+120_100,fetchImpl,log:silence});
  f.publish(87,started+180_000);
  await runCycle(f.env,{now:started+500_000,fetchImpl,log:silence});
  assert.equal(calls.length,0);
  assert.equal((await f.statuses()).length,0);
});

test('the first live observation above threshold seeds a baseline but never back-posts',async()=>{
  const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
  f.publish(90,started);
  await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  assert.equal(calls.length,0);
  assert.equal((await f.statuses()).length,0);
});

test('publication parts reconstruct only the canonical persisted feed',async()=>{
  const f=fixture();
  f.env.SOURCE_DB.prepare('INSERT INTO sports_feed(id,payload) VALUES(1,?)')
    .bind(JSON.stringify({modelVersion:model,updatedAt:new Date(started).toISOString(),revision:'99',parts:2})).run();
  for(const [i,games] of [[],[{id:'one'}]].entries()){
    f.env.SOURCE_DB.prepare('INSERT INTO sports_feed_parts(revision,part,payload) VALUES(?,?,?)')
      .bind('99',i,JSON.stringify(games)).run();
  }
  assert.deepEqual((await readStoredFeed(f.env.SOURCE_DB)).games,[{id:'one'}]);
});

test('GraphQL typed rejection does not count as an accepted post',async()=>{
  const result=await sendToBuffer({apiKey:'unit',channelId:'channel',text:'test',
    fetchImpl:async()=>({ok:true,status:200,headers:{get:()=>null},
      json:async()=>({data:{createPost:{message:'Channel paused'}}})})});
  assert.equal(result.status,'rejected');
});

test('read-only Buffer channel discovery identifies one X account and caches its ID',async()=>{
  const f=fixture(),queries=[],postCalls=[];
  delete f.env.BUFFER_X_CHANNEL_ID;
  const fetchImpl=async(url,options)=>{
    const body=JSON.parse(options.body);
    if(body.query?.includes('organizations')){
      queries.push('organizations');
      return {ok:true,status:200,json:async()=>({data:{account:{organizations:[{id:'org1'}]}}})};
    }
    if(body.query?.includes('channels(')){
      queries.push('channels');
      return {ok:true,status:200,json:async()=>({data:{channels:[
        {id:'channel99',name:'SlateMeter',service:'twitter'},
        {id:'not-twitter',name:'Other',service:'instagram'}]}})};
    }
    postCalls.push(body.variables.input);
    return {ok:true,status:200,headers:{get:()=>null},
      json:async()=>({data:{createPost:{post:{id:'post99'}}}})};
  };
  f.publish(84,started);await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  f.publish(85,started+60_000);await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
  assert.deepEqual(queries,['organizations','channels']);
  assert.equal(postCalls.length,1);
  assert.equal(postCalls[0].channelId,'channel99');
});

test('multiple matching Buffer X channels fail closed',async()=>{
  const fetchImpl=async(url,options)=>{
    const q=JSON.parse(options.body).query;
    return {ok:true,status:200,json:async()=>({data:q.includes('organizations')
      ?{account:{organizations:[{id:'org1'}]}}
      :{channels:[{id:'a',name:'First',service:'twitter'},{id:'b',name:'Second',service:'twitter'}]}})};
  };
  await assert.rejects(discoverXChannel('key',{fetchImpl}),/exactly one/);
});
