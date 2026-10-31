import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import worker,{checkGames} from '../src/index.js';
import runtime from '../../scoring/live-runtime.cjs';
import {gameDetails} from '../src/sports-feed.js';
import {normalizeEvent,enrichGame} from '../src/live-game-model.js';
import {NOTIFICATION_SPORTS,normalizeNotificationPreferences,notificationEligible} from '../src/notification-preferences.js';

function database(t) {
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  return {db,DB:{prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
}
const game=(score=84)=>({id:'stable-game',sport:'NFL',state:'live',score,teams:[['Away','AWY',21,'','','','','','1'],['Home','HME',20,'','','','','','2']]});
const feed=game=>({modelVersion:runtime.MODEL_VERSION,games:[game]});
function subscriber(env,id,preferences,threshold=85) {
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run(id,'https://web.push.apple.com/'+id,'key','auth',threshold,Math.floor(Date.now()/1000));
  if(preferences)env.db.prepare('INSERT INTO notification_preferences VALUES (?,?,?,?,?,?)').run(id,Number(preferences.enabled),JSON.stringify(preferences.sports),JSON.stringify(preferences.teams),threshold,0);
}
const prefs=(sports=[],teams=[],enabled=true)=>({enabled,sports,teams});
const team={sport:'NFL',id:'1',name:'Selected favorite'};
const browserSub={endpoint:'https://web.push.apple.com/test-device',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
const bearer='test_device_token_'.repeat(3);
async function request(env,method,body,token=bearer,path='/subscription') {
  return worker.fetch(new Request('https://worker.test'+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{});
}

test('eligibility is enabled sport OR stable selected team, always gated by master',()=>{
  for(const sport of NOTIFICATION_SPORTS)assert.equal(notificationEligible({...game(),sport},prefs([sport])),true);
  assert.equal(notificationEligible(game(),prefs([], [team])),true,'team/favorite works with NFL disabled');
  assert.equal(notificationEligible(game(),prefs(['NHL'],[{sport:'NHL',id:'1'}])),false,'team IDs are scoped by sport');
  assert.equal(notificationEligible(game(),prefs(['NFL'],[team],false)),false);
  assert.equal(notificationEligible(game(),prefs()),false);
  assert.equal(normalizeNotificationPreferences(prefs(['invalid'])),null);
  assert.equal(normalizeNotificationPreferences(prefs([],[{sport:'NFL',id:'bad/id'}])),null);
  assert.deepEqual(normalizeNotificationPreferences(prefs(['NFL','NFL'],[team,team])),prefs(['NFL'],[team]));
});

test('preferences and threshold round-trip by device without requiring push enrollment',async t=>{
  const env=database(t),selected=prefs(['NHL'],[team],false);
  assert.equal((await request(env,'PUT',{threshold:91,preferences:selected})).status,200);
  let saved=await (await request(env,'GET')).json();assert.deepEqual(saved,{subscribed:false,threshold:91,preferences:selected});
  assert.equal((await request(env,'PUT',{threshold:91,preferences:{...selected,enabled:true},subscription:browserSub})).status,200);
  saved=await (await request(env,'GET')).json();assert.equal(saved.subscribed,true);assert.equal(saved.preferences.enabled,true);
  await request(env,'PUT',{threshold:90,subscription:browserSub});
  saved=await (await request(env,'GET')).json();assert.deepEqual(saved.preferences,{...selected,enabled:true});assert.equal(saved.threshold,90);
  const other=await (await request(env,'GET',null,'another_device_token_'.repeat(3))).json();assert.equal(other.subscribed,false);assert.equal(other.preferences.enabled,false);
  await request(env,'DELETE');saved=await (await request(env,'GET')).json();assert.equal(saved.subscribed,false);assert.deepEqual(saved.preferences,selected);assert.equal(saved.threshold,90);
});

test('closed-app delivery keeps crossing, first-observation and duplicate rules and includes deep links',async t=>{
  const env=database(t),sent=[];subscriber(env,'sport',prefs(['NFL']));subscriber(env,'team',prefs([],[team]));subscriber(env,'off',prefs(['NFL'],[team],false));subscriber(env,'other',prefs(['NHL']));subscriber(env,'legacy',null);
  const deliver=async(env,row,message)=>{sent.push({device:row.token_hash,...message});return 201;};
  await checkGames(env,feed(game(90)),deliver);assert.equal(sent.length,0,'first observation is a baseline');
  await checkGames(env,feed(game(84)),deliver);await checkGames(env,feed(game(85)),deliver);
  assert.deepEqual(sent.map(x=>x.device).sort(),['legacy','sport','team']);
  for(const push of sent){assert.equal(push.gameId,'stable-game');assert.equal(push.sport,'NFL');assert.equal(push.gameKey,'NFL:stable-game');assert.equal(push.url,'https://mmueller091.github.io/sports-radar/#game/NFL/stable-game');}
  await checkGames(env,feed(game(70)),deliver);await checkGames(env,feed(game(99)),deliver);assert.equal(sent.length,3,'one alert per subscription/game remains enforced');
});

test('the actual background sender encrypts and delivers through the existing Web Push transport',async t=>{
  const env=database(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const pair=()=>{const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});const jwk=privateKey.export({format:'jwk'});return {private:jwk.d,public:Buffer.concat([Buffer.from([4]),Buffer.from(jwk.x,'base64url'),Buffer.from(jwk.y,'base64url')]).toString('base64url')};};
  const vapid=pair(),receiver=pair();Object.assign(env,{VAPID_SUBJECT:'mailto:test@example.com',VAPID_SERVER_PUBLIC_KEY:vapid.public,VAPID_SERVER_PRIVATE_KEY:vapid.private});
  env.db.prepare('INSERT INTO subscriptions VALUES (?,?,?,?,?,?)').run('real-transport','https://web.push.apple.com/unit-test',receiver.public,randomBytes(16).toString('base64url'),85,0);
  env.db.prepare('INSERT INTO game_state VALUES (?,?,?)').run(runtime.MODEL_VERSION+':NFL:stable-game',84,Math.floor(Date.now()/1000));
  const deliveries=[];globalThis.fetch=async(url,options)=>{deliveries.push({url,options});return new Response(null,{status:201});};
  await checkGames(env,feed(game(90)));
  assert.equal(deliveries.length,1);assert.equal(deliveries[0].url,'https://web.push.apple.com/unit-test');
  const headers=new Headers(deliveries[0].options.headers);assert.equal(headers.get('Content-Encoding'),'aes128gcm');assert.match(headers.get('Authorization'),/^vapid /);assert.ok(deliveries[0].options.body);
  assert.equal(env.db.prepare('SELECT status FROM alerts').get().status,'sent');
});

test('queued delivery rechecks current preferences and threshold, including after final',async t=>{
  const env=database(t),sent=[];subscriber(env,'disabled',prefs([],[],false));subscriber(env,'changed-sport',prefs(['NHL']));subscriber(env,'raised-threshold',prefs(['NFL']),95);subscriber(env,'eligible-final',prefs([],[team]));
  for(const id of ['disabled','changed-sport','raised-threshold','eligible-final'])env.db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,created_at) VALUES (?,?,?,?,?,?)').run(id,runtime.MODEL_VERSION+':NFL:stable-game',90,'Reached 90','Real threshold crossing',Math.floor(Date.now()/1000));
  await checkGames(env,feed({...game(),state:'completed'}),async(env,row,message)=>{sent.push(row.token_hash);return 201;});
  assert.deepEqual(sent,['eligible-final']);assert.equal(env.db.prepare("SELECT COUNT(*) n FROM alerts WHERE status='cancelled'").get().n,3);
});

test('master off cancels pending work and also blocks manual test pushes',async t=>{
  const env=database(t);
  await request(env,'PUT',{threshold:85,preferences:prefs(['NFL']),subscription:browserSub});
  const id=env.db.prepare('SELECT token_hash FROM subscriptions').get().token_hash;
  env.db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,created_at) VALUES (?,?,?,?,?,?)').run(id,runtime.MODEL_VERSION+':NFL:stable-game',90,'Title','Body',0);
  await request(env,'PUT',{threshold:85,preferences:prefs(['NFL'],[],false)});
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM subscriptions').get().n,0,'disabled endpoints do not occupy active subscription capacity');
  assert.equal(env.db.prepare('SELECT status FROM alerts').get().status,'cancelled');assert.equal((await request(env,'POST',null,bearer,'/test')).status,409);
});

test('additive migration is idempotent and preserves existing subscriptions',t=>{
  const env=database(t);subscriber(env,'legacy',null);
  const migration=fs.readFileSync(new URL('../migrations/0003_notification_preferences.sql',import.meta.url),'utf8');env.db.exec(migration);env.db.exec(migration);
  assert.equal(env.db.prepare('SELECT threshold FROM subscriptions').get().threshold,85);assert.equal(env.db.prepare('PRAGMA table_info(subscriptions)').all().length,6);
});

test('finished stored games remain reachable after leaving the feed; unknown games never proxy upstream',async t=>{
  const env=database(t),original=globalThis.fetch;t.after(()=>{globalThis.fetch=original;});
  const fixture=JSON.parse(fs.readFileSync(new URL('../../test/fixtures/real-games/CFB-20261017-401858264.json',import.meta.url),'utf8'));
  const archived=normalizeEvent(fixture.event,'CFB');enrichGame(archived,fixture.summary);
  env.db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify({modelVersion:runtime.MODEL_VERSION,updatedAt:new Date().toISOString(),games:[]}));
  env.db.prepare('INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state) VALUES (?,?,?,?,?,?,?,?,?,?)').run('CFB:'+archived.id,Date.now(),'CFB','completed',archived.score,'0','0','','',JSON.stringify(archived));
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(fixture.summary);};
  const details=await gameDetails(env,'CFB',archived.id);assert.equal(details.sportsRadarGame.id,archived.id);assert.equal(details.sportsRadarGame.state,'completed');assert.equal(details.sportsRadarArchived,true);assert.ok(details.header);assert.equal(calls,1);
  for(const team of details.sportsRadarGame.teams)assert.ok(team[4],'archived provider logos remain available');
  if(fixture.summary.gameInfo?.venue?.fullName)assert.equal(details.sportsRadarGame.sub,fixture.summary.gameInfo.venue.fullName);
  assert.equal(await gameDetails(env,'CFB','unknown'),null);assert.equal(calls,1);
  globalThis.fetch=async()=>{throw new Error('offline');};env.db.prepare('DELETE FROM sports_resources').run();
  const fallback=await gameDetails(env,'CFB',archived.id);assert.equal(fallback.sportsRadarGame.id,archived.id);assert.equal(fallback.sportsRadarFreshness.stale,true);
});
