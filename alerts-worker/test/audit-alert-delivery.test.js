import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker,{checkGames} from '../src/index.js';
import runtime from '../../scoring/live-runtime.cjs';

function database(t) {
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  return {db,DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},
    async first(){return db.prepare(sql).get(...values)||null;},
    async all(){return {results:db.prepare(sql).all(...values)};},
    async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};},
    async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
}
const key=()=>runtime.MODEL_VERSION+':NFL:audit-game';
const game=(changes={})=>({id:'audit-game',sport:'NFL',state:'live',score:90,modelVersion:runtime.MODEL_VERSION,
  teams:[['Away','AWY',21,'','','','','','1'],['Home','HME',20,'','','','','','2']],why:'Current fourth-down threat',...changes});
function setup(t,changes={},feedChanges={}) {
  const env=database(t),now=Date.now();
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('device','https://push.invalid/test','key','auth',80,Math.floor(now/1000));
  env.db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,created_at) VALUES (?,?,?,?,?,?)')
    .run('device',key(),90,'Obsolete 90','Old reason',Math.floor(now/1000));
  const feed={modelVersion:runtime.MODEL_VERSION,updatedAt:new Date(now).toISOString(),games:[game(changes)],...feedChanges};
  publish(env,feed);return {env,feed};
}
function publish(env,feed){env.db.prepare('INSERT OR REPLACE INTO sports_feed VALUES (1,?)').run(JSON.stringify(feed));}
const status=env=>env.db.prepare('SELECT status FROM alerts').get()?.status;

for (const [name,changes] of [
  ['sharp decline',{score:10}],['completion',{state:'completed'}],['missing current rating',{score:null}],
  ['partial evidence',{scoringPartial:true}],['stale detail',{detailStale:true}],['rejected current observation',{liveUpdateRejected:true}]
  ,['partial quality',{evidenceQuality:'partial'}],['invalid quality',{evidenceQuality:'invalid'}],['rejected basketball observation',{basketballUpdateRejected:true}]
]) test(`F9 cancels queued 90 after ${name}`,async t=>{
  const {env,feed}=setup(t,changes),sent=[];
  await checkGames(env,feed,async(...args)=>{sent.push(args);return 201;});
  assert.equal(sent.length,0);assert.equal(status(env),'cancelled');
});

for (const [name,change] of [
  ['stale feed',f=>({...f,updatedAt:new Date(Date.now()-121000).toISOString()})],
  ['missing timestamp',f=>({...f,updatedAt:undefined})],['future timestamp',f=>({...f,updatedAt:new Date(Date.now()+60000).toISOString()})],
  ['removed game',f=>({...f,games:[]})]
]) test(`F9 cancels when latest canonical data has ${name}`,async t=>{
  const {env,feed}=setup(t),sent=[];publish(env,change(feed));
  await checkGames(env,feed,async(...args)=>{sent.push(args);return 201;});
  assert.equal(sent.length,0);assert.equal(status(env),'cancelled');
});

test('F9 re-reads canonical state immediately before delivery and uses current copy',async t=>{
  const {env,feed}=setup(t),sent=[];
  publish(env,{...feed,games:[game({score:88,why:'Fresh verified reason'})]});
  await checkGames(env,feed,async(_env,_row,message)=>{sent.push(message);return 201;});
  assert.equal(sent.length,1);assert.match(sent[0].title,/88/);assert.doesNotMatch(sent[0].title,/90/);
  assert.equal(sent[0].body,'Fresh verified reason');assert.equal(status(env),'sent');
  await checkGames(env,feed,async()=>{throw new Error('Already sent');});
});

test('F9 missing canonical storage and expired queued crossings do not send',async t=>{
  for(const expired of [false,true]){
    const {env,feed}=setup(t),sent=[];
    if(expired)env.db.prepare('UPDATE alerts SET created_at=?').run(Math.floor(Date.now()/1000)-301);
    else env.db.prepare('DELETE FROM sports_feed').run();
    await checkGames(env,feed,async(...args)=>{sent.push(args);return 201;});
    assert.equal(sent.length,0);assert.equal(status(env),'cancelled');
  }
});

test('F9 concurrent queue drains claim a delivery once',async t=>{
  const {env,feed}=setup(t),sent=[];
  let release,reads=0;const gate=new Promise(resolve=>release=resolve),prepare=env.DB.prepare;
  env.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT a.')){
    const all=statement.all;statement.all=async()=>{const result=await all();if(++reads===2)release();await gate;return result;};
  }return statement;};
  const deliver=async()=>{sent.push(1);return 201;};
  await Promise.all([checkGames(env,feed,deliver),checkGames(env,feed,deliver)]);
  assert.equal(sent.length,1);assert.equal(status(env),'sent');
});

test('F9 definitive rejection can retry only while current eligibility survives',async t=>{
  const {env,feed}=setup(t);let sends=0;
  await checkGames(env,feed,async()=>{sends++;return 503;});
  assert.equal(status(env),'pending');
  publish(env,{...feed,games:[game({score:10})]});
  await checkGames(env,feed,async()=>{sends++;return 201;});
  assert.equal(sends,1);assert.equal(status(env),'cancelled');
});

test('F9 ambiguous transport failures never retry a possibly accepted push',async t=>{
  const {env,feed}=setup(t);let sends=0;
  const deliver=async()=>{sends++;throw new Error('Connection lost after send');};
  await checkGames(env,feed,deliver);await checkGames(env,feed,deliver);
  assert.equal(sends,1);assert.equal(status(env),'delivery_unknown');
});

test('F9 preference and threshold changes after queue selection are revalidated',async t=>{
  for(const change of ['threshold','preference','unsubscribe']){
    const {env,feed}=setup(t),prepare=env.DB.prepare;let sends=0;
    env.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT a.')){
      const all=statement.all;statement.all=async()=>{const result=await all();
        if(change==='threshold')env.db.prepare('UPDATE subscriptions SET threshold=95').run();
        if(change==='preference')env.db.prepare('INSERT INTO notification_preferences VALUES (?,?,?,?,?,?)').run('device',0,'["NFL"]','[]',80,0);
        if(change==='unsubscribe')env.db.prepare('DELETE FROM subscriptions').run();
        return result;};
    }return statement;};
    await checkGames(env,feed,async()=>{sends++;return 201;});assert.equal(sends,0,change);assert.equal(status(env),'cancelled');
  }
});

test('F9 unavailable canonical database read cancels a claim rather than leaving it pending',async t=>{
  const {env,feed}=setup(t),prepare=env.DB.prepare;let sends=0;
  env.DB.prepare=sql=>{const statement=prepare(sql);if(sql==='SELECT payload FROM sports_feed WHERE id=1')statement.first=async()=>{throw new Error('Canonical read unavailable');};return statement;};
  await checkGames(env,feed,async()=>{sends++;return 201;});assert.equal(sends,0);assert.equal(status(env),'cancelled');
});

test('F9 successful push followed by an acknowledgement write failure is not delivered twice',async t=>{
  const {env,feed}=setup(t),prepare=env.DB.prepare;let sends=0;
  env.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE alerts SET status=?')){
    const bind=statement.bind;statement.bind=(...values)=>{bind(...values);if(values[0]==='sent')statement.run=async()=>{throw new Error('Acknowledgement unavailable');};return statement;};
  }return statement;};
  const deliver=async()=>{sends++;return 201;};
  await checkGames(env,feed,deliver);await checkGames(env,feed,deliver);
  assert.equal(sends,1);assert.equal(status(env),'delivery_unknown');
});

test('F9 retry after a definite rejection preserves a legitimate current alert exactly once',async t=>{
  const {env,feed}=setup(t);let sends=0;
  const deliver=async()=>++sends===1?503:201;
  await checkGames(env,feed,deliver);assert.equal(status(env),'pending');
  await checkGames(env,feed,deliver);await checkGames(env,feed,deliver);
  assert.equal(sends,2);assert.equal(status(env),'sent');
});

test('F9 abandoned subscription and old-model queues are cancelled without delivery',async t=>{
  for(const abandoned of ['subscription','model']){
    const {env,feed}=setup(t);let sends=0;
    if(abandoned==='subscription')env.db.prepare('DELETE FROM subscriptions').run();
    else env.db.prepare('UPDATE alerts SET game_key=?').run('previous-model:NFL:audit-game');
    await checkGames(env,feed,async()=>{sends++;return 201;});
    assert.equal(sends,0);assert.equal(status(env),'cancelled');
  }
});

test('F9 a cancelled unsent alert can be replaced only by a new genuine threshold crossing',async t=>{
  const {env,feed}=setup(t,{score:10});let sends=0;
  const deliver=async()=>{sends++;return 201;};
  await checkGames(env,feed,deliver);assert.equal(status(env),'cancelled');assert.equal(sends,0);
  const revived={...feed,updatedAt:new Date().toISOString(),games:[game({score:90})]};publish(env,revived);
  await checkGames(env,revived,deliver);assert.equal(sends,1);assert.equal(status(env),'sent');
  publish(env,feed);await checkGames(env,feed,deliver);publish(env,revived);await checkGames(env,revived,deliver);
  assert.equal(sends,1,'a delivered game stays suppressed on later recrossings');
});

test('F9 an invalid old endpoint cannot delete a replacement subscription',async t=>{
  const {env,feed}=setup(t);
  await checkGames(env,feed,async()=>{
    env.db.prepare('UPDATE subscriptions SET endpoint=? WHERE token_hash=?').run('https://push.invalid/replacement','device');return 410;
  });
  assert.equal(env.db.prepare('SELECT endpoint FROM subscriptions').get()?.endpoint,'https://push.invalid/replacement');
  assert.equal(status(env),'pending');
  let sent=0;await checkGames(env,feed,async(_env,row)=>{assert.equal(row.endpoint,'https://push.invalid/replacement');sent++;return 201;});
  assert.equal(sent,1);assert.equal(status(env),'sent');
});

test('F9 claim-owner fencing prevents an old completion from finalizing a replacement row',async t=>{
  const {env,feed}=setup(t);
  let releaseOld,startOld,releaseNew,startNew;
  const oldGate=new Promise(r=>releaseOld=r),oldStarted=new Promise(r=>startOld=r);
  const newGate=new Promise(r=>releaseNew=r),newStarted=new Promise(r=>startNew=r);
  const old=checkGames(env,feed,async()=>{startOld();await oldGate;return 201;});await oldStarted;
  // Simulate another writer revoking/replacing a row, with the same second-level
  // created_at. The old transport completion must not own this newer claim.
  env.db.prepare("UPDATE alerts SET status='cancelled'").run();
  env.db.prepare('UPDATE game_state SET score=10').run();
  const next=checkGames(env,feed,async()=>{startNew();await newGate;return 201;});await newStarted;
  const newerClaim=status(env);assert.match(newerClaim,/^sending:/);
  releaseOld();await old;assert.equal(status(env),newerClaim);
  releaseNew();await next;assert.equal(status(env),'sent');
});

test('public feed omits revision/fingerprint caches but canonical storage keeps them',async t=>{
  const {env,feed}=setup(t),internal={schema:1,records:['private reconciliation evidence']};
  const stored={...feed,games:[{...game(),providerEventRevisions:internal,observationEvidence:internal,
    scoreboard:{score:90,providerEventRevisions:internal,observationEvidence:internal}}]};publish(env,stored);
  const response=await worker.fetch(new Request('https://test.invalid/feed'),env,{}),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.games[0].providerEventRevisions,undefined);
  assert.equal(body.games[0].observationEvidence,undefined);assert.equal(body.games[0].scoreboard.providerEventRevisions,undefined);
  assert.equal(body.games[0].scoreboard.observationEvidence,undefined);
  assert.deepEqual(JSON.parse(env.db.prepare('SELECT payload FROM sports_feed').get().payload).games[0].providerEventRevisions,internal);
});
