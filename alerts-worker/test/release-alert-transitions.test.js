import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {checkGames} from '../src/index.js';
import {drainAlerts} from '../src/alert-delivery.js';
import runtime from '../../scoring/live-runtime.cjs';

const previousModel='2026-11-02.clock-integrity.2';
const key=(model=runtime.MODEL_VERSION,sport='NCAAB',id='release-game')=>`${model}:${sport}:${id}`;
function setup(t){
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  const env={db,DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},
    async first(){return db.prepare(sql).get(...values)||null;},
    async all(){return {results:db.prepare(sql).all(...values)};},
    async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};},
    async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
  db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('device','https://push.invalid/release','key','auth',85,0);
  const sent=[];
  async function observe(score,changes={}){
    const game={id:'release-game',sport:'NCAAB',state:'live',score,modelVersion:runtime.MODEL_VERSION,evidenceQuality:'complete',
      teams:[['Underdog','DOG',65,'','','','','','1'],['Favorite','FAV',64,'','','','','','2']],...changes};
    const feed={modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),games:[game]};
    db.prepare('INSERT OR REPLACE INTO sports_feed VALUES (1,?)').run(JSON.stringify(feed));
    await checkGames(env,feed,async(_env,row,message)=>{sent.push({row,message});return 201;});
  }
  const insertAlert=(gameKey,status='sent',device='device')=>db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,status,created_at) VALUES (?,?,?,?,?,?,?)')
    .run(device,gameKey,90,'Prior alert','Prior alert',status,Math.floor(Date.now()/1000));
  return {env,db,sent,observe,insertAlert};
}

test('release migration uses a fresh verified baseline and never alerts from model rerating alone',async t=>{
  const {db,sent,observe}=setup(t);
  db.prepare('INSERT INTO game_state VALUES (?,?,?)').run(key(previousModel),84,Math.floor(Date.now()/1000));
  await observe(86);await observe(90);
  assert.equal(sent.length,0);
  assert.equal(db.prepare('SELECT score FROM game_state WHERE game_key=?').get(key()).score,90);
  await observe(84);await observe(85);
  assert.equal(sent.length,1,'a later genuine current-model crossing remains eligible');
  await observe(70);await observe(99);
  assert.equal(sent.length,1,'same-model recrossing cannot repeat delivery');
});

for(const changes of [{evidenceQuality:'partial'},{evidenceQuality:'invalid'},{scoringPartial:true},{timingUncertain:true},
  {detailStale:true},{liveUpdateRejected:true},{basketballUpdateRejected:true},{summaryLifecycleRejected:true},{scoringHistoryRejected:true}]){
  test(`release partial/rejected observation cannot establish or move a crossing baseline: ${JSON.stringify(changes)}`,async t=>{
    const {db,sent,observe}=setup(t);
    await observe(84,changes);await observe(99,changes);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM game_state').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM alerts').get().n,0);
    await observe(90);assert.equal(sent.length,0,'first complete evidence is a baseline, even above threshold');
    await observe(60,changes);await observe(95);
    assert.equal(sent.length,0,'partial dip cannot arm a recrossing');
    await observe(84);await observe(99,changes);
    assert.equal(sent.length,0,'partial high cannot queue or deliver');
    assert.equal(db.prepare('SELECT score FROM game_state WHERE game_key=?').get(key()).score,84);
    await observe(85);assert.equal(sent.length,1,'verified crossing after verified low remains eligible');
  });
}

for(const priorStatus of ['sent','delivery_unknown','sending:previous-owner']){
  test(`release model transition cannot repeat a previously consumed game (${priorStatus})`,async t=>{
    const {db,sent,observe,insertAlert}=setup(t);
    insertAlert(key(previousModel),priorStatus);
    await observe(90);await observe(84);await observe(90);
    assert.equal(sent.length,0,'model version must not reset the one-alert-per-device/game rule');
    assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key()),undefined,'already-consumed games do not enqueue');
    assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key(previousModel)).status,priorStatus);
  });
  test(`release delivery claim rechecks older consumed history (${priorStatus})`,async t=>{
    const {db,sent,observe,insertAlert}=setup(t);
    insertAlert(key(),'pending');insertAlert(key(previousModel),priorStatus);
    await observe(90);
    assert.equal(sent.length,0,'an already queued newer-model alert cannot repeat delivery');
    assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key()).status,'cancelled');
  });
}

test('release cancelled/old pending queues do not permanently consume an unsent game',async t=>{
  const {db,sent,observe,insertAlert}=setup(t);
  insertAlert(key(previousModel),'pending');
  await observe(90);assert.equal(sent.length,0);
  assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key(previousModel)).status,'cancelled');
  await observe(84);await observe(90);assert.equal(sent.length,1);
});

test('release atomic claim sees an older-model send that finishes after queue selection',async t=>{
  const {env,db,sent,observe,insertAlert}=setup(t),prepare=env.DB.prepare;
  insertAlert(key(),'pending');
  env.DB.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT a.')){
    const all=statement.all;statement.all=async()=>{const result=await all();insertAlert(key(previousModel),'sent');return result;};
  }return statement;};
  await observe(90);
  assert.equal(sent.length,0);
  assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key()).status,'cancelled');
});

test('release losing concurrent claim does not cancel a retry reopened after a definite rejection',async t=>{
  const {env,db,observe,insertAlert}=setup(t);
  await observe(90);insertAlert(key(),'pending');
  const read=async()=>JSON.parse(db.prepare('SELECT payload FROM sports_feed').get().payload);
  const selected=db.prepare('SELECT token_hash,game_key,created_at FROM alerts').get();
  let release,started,attempts=0;
  const gate=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);
  const first=drainAlerts(env,read,async()=>{attempts++;started();await gate;return 503;});await ready;
  const prepare=env.DB.prepare;
  env.DB.prepare=sql=>{const statement=prepare(sql);
    // The losing drainer selected the pending row before the winning claim.
    if(sql.startsWith('SELECT a.'))statement.all=async()=>({results:[selected]});
    if(sql.startsWith('UPDATE alerts SET status=?')&&sql.includes('AND NOT EXISTS')){
    const run=statement.run;statement.run=async()=>{const result=await run();if(!result.meta.changes){release();await first;}return result;};
  }return statement;};
  await drainAlerts(env,read,async()=>{throw Error('Concurrent loser cannot deliver');});
  assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key()).status,'pending');
  await drainAlerts(env,read,async()=>{attempts++;return 201;});
  assert.equal(attempts,2,'one definite rejection and one accepted retry');
  assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key()).status,'sent');
});

test('release duplicate identity is exact per device, sport, and event; legacy unversioned sends stay consumed',async t=>{
  const {sent,observe,insertAlert}=setup(t);
  insertAlert(key(previousModel),'sent','different-device');
  insertAlert(key(previousModel,'NBA'),'sent');
  insertAlert(key(previousModel,'NCAAB','prefix-release-game'),'sent');
  await observe(84);await observe(85);assert.equal(sent.length,1);
  insertAlert('NCAAB:legacy_game','sent');
  await observe(84,{id:'legacy_game'});await observe(90,{id:'legacy_game'});
  assert.equal(sent.length,1,'pre-version alert history is honored');
});

test('release dedupe treats underscore event IDs literally and does not suppress a distinct game',async t=>{
  const {sent,observe,insertAlert}=setup(t);
  insertAlert(key(previousModel,'NCAAB','releaseXgame'),'sent');
  insertAlert('NCAAB:releaseYgame','sent');
  await observe(84,{id:'release_game'});await observe(85,{id:'release_game'});
  assert.equal(sent.length,1,'underscore is an event-ID character, not a SQL wildcard');
  await observe(84,{id:'release_game'});await observe(90,{id:'release_game'});
  assert.equal(sent.length,1,'the exact delivered game remains consumed');
});

test('release delivery revalidates uncertain clock and rejected summary/history evidence after queueing',async t=>{
  for(const changes of [{timingUncertain:true},{summaryLifecycleRejected:true},{scoringHistoryRejected:true}]){
    const {db,sent,observe,insertAlert}=setup(t);
    insertAlert(key(),'pending');
    await observe(90,changes);
    assert.equal(sent.length,0,JSON.stringify(changes));
    assert.equal(db.prepare('SELECT status FROM alerts WHERE game_key=?').get(key()).status,'cancelled');
  }
});
