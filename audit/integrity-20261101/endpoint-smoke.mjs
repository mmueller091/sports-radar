// Offline smoke of the actual candidate fetch handler. No cron or push route.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import worker from '../../alerts-worker/src/index.js';
import {normalizeEvent,enrichGame} from '../../alerts-worker/src/live-game-model.js';
import {createCollector,summaryUrl} from '../../alerts-worker/src/providers/espn.js';
import runtime from '../../scoring/live-runtime.cjs';
import {ALERT_DELIVERY_VERSION} from '../../alerts-worker/src/alert-delivery.js';

const read=relative=>JSON.parse(fs.readFileSync(new URL(relative,import.meta.url)));
const db=new DatabaseSync(':memory:');
db.exec(fs.readFileSync(new URL('../../alerts-worker/schema.sql',import.meta.url),'utf8'));
const env={VAPID_SERVER_PUBLIC_KEY:'offline-public-key-marker',DB:{prepare(sql){let args=[];return {
  bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},
  async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}
};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
const finalFixture=read('../../test/fixtures/real-games/NFL-20261011-401872988.json');
const final=normalizeEvent(structuredClone(finalFixture.event),'NFL');enrichGame(final,structuredClone(finalFixture.summary));
const liveFixture=read('../../test/fixtures/audit-evidence-20261101/nfl-correction.json').observations[1];
const live=normalizeEvent(structuredClone(liveFixture.event),'NFL');
const liveSummary={header:{competitions:structuredClone(liveFixture.event.competitions)}};
enrichGame(live,liveSummary);
const tennisFixture=read('../../alerts-worker/test/fixtures/audit-integrity/tennis-contract-20261028.json');
const tennis=await createCollector(async url=>String(url).includes('/tennis/')?tennisFixture.scoreboard:{events:[]})();
const games=[live,final,...tennis],now=Date.now();
const feed={version:1,modelVersion:runtime.MODEL_VERSION,scoringPolicy:runtime.POLICY_ID,updatedAt:new Date(now).toISOString(),source:'offline fixture smoke',sourceErrors:[],games};
db.prepare('INSERT INTO sports_feed VALUES (1,?)').run(JSON.stringify(feed));
for(const [game,summary] of [[live,liveSummary],[final,finalFixture.summary]])
  db.prepare('INSERT INTO sports_resources VALUES (?,?,?)').run(summaryUrl(game),JSON.stringify(summary),now);
// Synthetic local storage row verifies the public history serialization contract;
// it is not represented as a historical production observation.
db.prepare('INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  .run(`NFL:${live.id}`,now,'NFL',live.state,live.score,String(live.teams[0][2]),String(live.teams[1][2]),'',live.liveRawStatus.displayClock,JSON.stringify(live),runtime.MODEL_VERSION);
let networkAttempts=0,backgroundTasks=0;
const previousFetch=globalThis.fetch;
globalThis.fetch=async()=>{networkAttempts++;throw new Error('Offline smoke forbids network');};
const ctx={waitUntil(){backgroundTasks++;throw new Error('Offline smoke forbids background work');}};
const observations=[];
async function get(path,expectedStatus=200,origin='https://mmueller091.github.io'){
  const response=await worker.fetch(new Request(`https://candidate-smoke.invalid${path}`,{headers:{Origin:origin}}),env,ctx);
  assert.equal(response.status,expectedStatus,path);
  assert.match(response.headers.get('content-type')||'',/application\/json/);
  assert.equal(response.headers.get('cache-control'),'no-store');
  if(origin==='https://mmueller091.github.io')assert.equal(response.headers.get('access-control-allow-origin'),origin);
  const body=await response.json();observations.push({path,status:response.status,modelVersion:body.modelVersion || body.sportsRadarGame?.modelVersion || null});return body;
}
try {
  const health=await get('/health');assert.equal(health.ok,true);assert.equal(health.modelVersion,runtime.MODEL_VERSION);
  assert.equal(health.notificationVersion,ALERT_DELIVERY_VERSION);
  assert.deepEqual(health.alertDelivery,{canonicalRevalidation:true,atomicClaim:true,maxQueueAgeMs:120000,ambiguousRetry:false});
  const publicFeed=await get('/feed');assert.equal(publicFeed.modelVersion,health.modelVersion);assert.equal(publicFeed.freshness.stale,false);
  assert.equal(publicFeed.games.length,6);assert.ok(publicFeed.games.every(g=>g.modelVersion===health.modelVersion));
  for(const game of [live,final,tennis.find(g=>g.id==='185198')]){
    const body=await get(`/game/${game.sport}/${game.id}`);
    assert.equal(body.sportsRadarGame.modelVersion,health.modelVersion);assert.equal(body.sportsRadarGame.score,game.score);
    assert.deepEqual(body.sportsRadarGame.teams,JSON.parse(JSON.stringify(game.teams)));
    assert.equal(body.sportsRadarFreshness.stale,false);assert.ok(body.header?.competitions?.[0]);
    if(game===live){assert.equal(body.sportsRadarGame.liveRawStatus.displayClock,'1:38');assert.equal(body.sportsRadarHistory.snapshots.length,1);assert.equal(body.sportsRadarHistory.snapshots[0].modelVersion,health.modelVersion);}
    if(game.sport==='Tennis'){assert.equal(body.sportsRadarCoverage.source,'scoreboard');assert.equal(body.sportsRadarCoverage.pointByPoint,false);}
  }
  const config=await get('/config');assert.deepEqual(config,{publicKey:'offline-public-key-marker',pollSeconds:60});
  const unknown=await get('/game/NFL/unknown',404);assert.equal(unknown.error,'Game not found');
  const denied=await get('/feed',403,'https://untrusted.invalid');assert.equal(denied.error,'Origin not allowed');
  assert.equal(networkAttempts,0);assert.equal(backgroundTasks,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM alerts').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) n FROM subscriptions').get().n,0);
  const files=['../../alerts-worker/src/index.js','../../alerts-worker/src/alert-delivery.js','../../scoring/live-runtime.cjs'];
  const result={executedAt:new Date().toISOString(),mode:'actual candidate fetch handler; local in-memory SQLite; fixture resources; all network blocked',
    modelVersion:health.modelVersion,scoringPolicy:health.scoringPolicy,notificationVersion:health.notificationVersion,alertDelivery:health.alertDelivery,
    routes:observations,networkAttempts,backgroundTasks,notificationsSent:0,productionDatabaseWrites:0,
    sourceSha256:Object.fromEntries(files.map(relative=>[relative.replace('../../',''),createHash('sha256').update(fs.readFileSync(new URL(relative,import.meta.url))).digest('hex')]))};
  fs.writeFileSync(new URL('./endpoint-smoke-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {globalThis.fetch=previousFetch;db.close();}
