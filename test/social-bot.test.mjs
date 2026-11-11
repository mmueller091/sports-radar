import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {runCycle} from '../social-bot/src/engine.mjs';
import {sendToBuffer,discoverXChannel} from '../social-bot/src/buffer.mjs';
import {readStoredFeed} from '../social-bot/src/logic.mjs';

const model='2026-11-05.nhl-manpower.1';
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
  const publishMany=(count,score,at)=>{
    const game=publish(score,at);
    const games=Array.from({length:count},(_,i)=>({...game,id:String(401873024+i)}));
    SOURCE_DB.prepare('UPDATE sports_feed SET payload=? WHERE id=1')
      .bind(JSON.stringify({modelVersion:model,updatedAt:new Date(at).toISOString(),games})).run();
    return games;
  };
  const statuses=async()=>(await BOT_DB.prepare('SELECT * FROM social_post_claims').all()).results;
  return {env,publish,publishMany,statuses};
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
  const publishedText=JSON.parse(calls[0].options.body).variables.input.text;
  assert.match(publishedText,/just crossed SlateMeter's 85\+ excitement threshold/);
  assert.ok(!publishedText.includes('85/99'));
  assert.ok(publishedText.includes('#RavensFlock #FlyEaglesFly #NFL'));
  assert.ok(publishedText.includes('https://slatemeter.app/#game/NFL/401873024'));
});

test('83, 87, 84, 86, 83, 88 posts exactly once across six separate runs',async()=>{
  const f=fixture(),calls=[],outcomes=[];
  for(const [index,rating] of [83,87,84,86,83,88].entries()){
    const at=started+index*60_000;
    f.publish(rating,at);
    outcomes.push(await runCycle({...f.env},{now:at+100,fetchImpl:successfulBuffer(calls),log:silence}));
    assert.equal(calls.length,index===0?0:1);
  }
  assert.deepEqual(outcomes.map(result=>result.crossings),[0,1,0,1,0,1]);
  assert.deepEqual(outcomes.map(result=>result.claimed),[0,1,0,0,0,0]);
  assert.deepEqual(outcomes.map(result=>result.accepted),[0,1,0,0,0,0]);
  const claims=await f.statuses();
  assert.equal(claims.length,1);
  assert.equal(claims[0].status,'accepted');
  assert.equal(claims[0].rating,87);
  assert.equal(claims[0].buffer_post_id,'buffer-123');
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

test('a new crossing posts even after 20 accepted posts in the preceding day',async()=>{
  const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
  f.env.MAX_POSTS_PER_DAY='1'; // A leftover legacy binding must not limit posts.
  for(let i=0;i<20;i++){
    await f.env.BOT_DB.prepare(`INSERT INTO social_post_claims
      (sport,game_id,milestone,status,rating,feed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?)`).bind('NFL',`prior-${i}`,85,'accepted',85,
      started,started,started).run();
  }
  f.publish(84,started);
  await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  f.publish(85,started+60_000);
  const outcome=await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
  assert.equal(outcome.claimed,1);
  assert.equal(outcome.accepted,1);
  assert.equal(calls.length,1);
  assert.equal((await f.statuses()).length,21);
});

for(const count of [4,25])for(const legacyLimit of [undefined,'1']){
  test(`${count} distinct crossings all post with legacy limit ${legacyLimit}, then suppress duplicates`,async()=>{
    const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
    if(legacyLimit!==undefined)f.env.MAX_POSTS_PER_RUN=legacyLimit;
    f.publishMany(count,84,started);
    await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
    f.publishMany(count,86,started+60_000);
    const result=await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
    assert.equal(result.crossings,count);
    assert.equal(result.claimed,count);
    assert.equal(result.accepted,count);
    const claims=await f.statuses();
    assert.equal(claims.length,count);
    assert.equal(new Set(claims.map(row=>row.game_id)).size,count);
    assert.ok(claims.every(row=>row.status==='accepted'));
    const postedIds=calls.map(call=>JSON.parse(call.options.body).variables.input.text.match(/#game\/NFL\/(\d+)/)[1]);
    assert.deepEqual(postedIds.sort(),claims.map(row=>row.game_id).sort());
    await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
    f.publishMany(count,84,started+120_000);
    await runCycle(f.env,{now:started+120_100,fetchImpl,log:silence});
    f.publishMany(count,86,started+180_000);
    const repeated=await runCycle(f.env,{now:started+180_100,fetchImpl,log:silence});
    assert.equal(repeated.claimed,0);
    assert.equal(calls.length,count);
  });
}

test('concurrent runs send all 25 distinct crossings exactly once',async()=>{
  const f=fixture(),calls=[],fetchImpl=successfulBuffer(calls);
  f.publishMany(25,84,started);
  await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  f.publishMany(25,86,started+60_000);
  const results=await Promise.all(Array.from({length:3},()=>
    runCycle(f.env,{now:started+60_100,fetchImpl,log:silence})));
  assert.equal(results.reduce((n,r)=>n+r.claimed,0),25);
  assert.equal(results.reduce((n,r)=>n+r.accepted,0),25);
  assert.equal(calls.length,25);
  assert.equal(new Set(calls.map(call=>JSON.parse(call.options.body).variables.input.text)).size,25);
  const claims=await f.statuses();
  assert.equal(claims.length,25);
  assert.ok(claims.every(row=>row.status==='accepted'));
});

test('failed sends are recorded without suppressing later distinct crossings or retrying claims',async()=>{
  const f=fixture(),calls=[],logs=[];
  const success=successfulBuffer(calls);
  let attempts=0;
  const fetchImpl=async(...args)=>{
    attempts++;
    if(attempts===1)throw Error('Connection lost after send');
    if(attempts===2)return {ok:false,status:429,headers:{get:()=>null}};
    return success(...args);
  };
  const log=line=>logs.push(JSON.parse(line));
  f.publishMany(25,84,started);
  await runCycle(f.env,{now:started+100,fetchImpl,log});
  f.publishMany(25,86,started+60_000);
  const result=await runCycle(f.env,{now:started+60_100,fetchImpl,log});
  assert.equal(result.claimed,25);
  assert.equal(result.accepted,23);
  assert.equal(result.rejected,1);
  assert.equal(result.deliveryUnknown,1);
  const claims=await f.statuses();
  assert.equal(claims.length,25);
  assert.equal(claims.filter(row=>row.status==='accepted').length,23);
  assert.equal(claims.filter(row=>row.status==='rejected'&&row.error_code).length,1);
  assert.equal(claims.filter(row=>row.status==='delivery_unknown'&&row.error_code).length,1);
  assert.equal(logs.filter(row=>row.event==='buffer-result').length,25);
  f.publishMany(25,84,started+120_000);
  await runCycle(f.env,{now:started+120_100,fetchImpl,log});
  f.publishMany(25,86,started+180_000);
  await runCycle(f.env,{now:started+180_100,fetchImpl,log});
  assert.equal(attempts,25);
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

test('disabled bot verifies one X channel once and never posts',async()=>{
  const f=fixture({enabled:false}),queries=[],posts=[];
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
        {id:'channel99',name:'SlateMeter',service:'twitter'}]}})};
    }
    posts.push(body);
    throw Error('Disabled bot attempted to post');
  };
  f.publish(84,started);
  await runCycle(f.env,{now:started+100,fetchImpl,log:silence});
  f.publish(85,started+60_000);
  await runCycle(f.env,{now:started+60_100,fetchImpl,log:silence});
  assert.deepEqual(queries,['organizations','channels']);
  assert.deepEqual(posts,[]);
  const settings=(await f.env.BOT_DB.prepare('SELECT key,value FROM social_settings').all()).results;
  assert.deepEqual(Object.fromEntries(settings.map(row=>[row.key,row.value])),{
    buffer_x_channel_id:'channel99',buffer_x_channel_name:'SlateMeter'});
  assert.equal((await f.statuses()).length,0);
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
