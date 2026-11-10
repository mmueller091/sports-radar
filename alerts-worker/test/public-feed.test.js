import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';
import {publicFeed} from '../src/public-feed.js';
import {MODEL_VERSION} from '../src/sports-feed.js';

const json=value=>JSON.parse(JSON.stringify(value));
const fixture=(now=Date.now())=>({
  version:1,revision:now,parts:1,updatedAt:new Date(now).toISOString(),
  modelVersion:MODEL_VERSION,scoringPolicy:'unchanged-policy',source:'ESPN',sourceErrors:['one-degraded-source'],
  freshness:{ageMs:500,stale:false,degraded:true,maxAgeMs:120000},
  enrichment:{'NFL:1':{summaryHash:'server-hash',summaryVersion:now}},
  scoreCalculations:{'NFL:1':{total:87,terms:[{label:'Current game',points:87}]}},
  games:[{
    id:'1',sport:'NFL',state:'live',score:87,baseScore:70,modelVersion:MODEL_VERSION,
    teams:[['Away','AWY','24','#123456','away.png','6-2',null,'Away','1'],['Home','HME','21','#abcdef','home.png','5-3',null,'Home','2']],
    liveRawStatus:{period:4,displayClock:'1:10',type:{state:'in',completed:false}},
    footballSituation:{possessionTeamId:'2',downAndDistance:'3rd & 4',fieldPosition:'AWY 38'},
    live:{bonus:17,sportImpact:{manpower:{powerPlay:false}}},
    timingUncertain:true,heldRatingProvisional:false,scoringPartial:true,evidenceReasons:['clock-updating'],
    sourceEvent:{season:{type:3},links:[{rel:['watch'],href:'https://www.espn.com/watch/player?id=game'}]},
    sourceCompetition:{format:{regulation:{periods:4}}},
    pregameBaseline:{source:'observed',score:60,odds:[{details:'AWY -3'}]},
    qualitativeContexts:[{publicText:'A verified rivalry',sourceUrl:'https://example.test/source'}],
    scoreCalculation:{total:87,terms:[{label:'Current game',points:87}]},
    futureDisplayField:{preserve:true},
    scoreboard:{score:9,teams:[['Old score','OLD','0']],basketballEvidence:{private:true}},
    basketballEvidence:{private:true},providerEventRevisions:{private:true},observationEvidence:{private:true},
    verifiedLiveEvidence:{scoringPlays:['retained']},manpowerEvidence:{expires:now},
    liveInputEvidence:{summary:{plays:['retained']}},priorObservation:{competition:{status:{period:3}}},
    basketballLastTrusted:{score:86},timedLastTrusted:{score:86}
  }]
});

test('compact projection preserves the accepted game, model, revision and freshness without changing stored state',()=>{
  const feed=fixture(),original=JSON.stringify(feed),full=json(publicFeed(feed)),compact=json(publicFeed(feed,{compact:true}));
  for(const key of ['version','revision','parts','updatedAt','modelVersion','scoringPolicy','source','sourceErrors','freshness'])
    assert.deepEqual(compact[key],full[key],key);
  for(const key of ['id','sport','state','score','baseScore','modelVersion','teams','liveRawStatus','footballSituation',
    'live','timingUncertain','heldRatingProvisional','scoringPartial','evidenceReasons','sourceEvent','sourceCompetition',
    'pregameBaseline','qualitativeContexts','scoreCalculation','futureDisplayField'])
    assert.deepEqual(compact.games[0][key],full.games[0][key],key);
  assert.equal(compact.games[0].score,87,'the accepted rating is never replaced with the duplicate scoreboard copy');
  assert.equal(JSON.stringify(feed),original,'projection cannot mutate the canonical feed or retained evidence');
  assert.ok(JSON.stringify(compact).length<JSON.stringify(full).length);
});

test('full feed retains its existing contract while compact view excludes only redundant server state',()=>{
  const full=json(publicFeed(fixture())),compact=json(publicFeed(fixture(),{compact:true}));
  assert.ok(full.enrichment);assert.ok(full.scoreCalculations);assert.ok(full.games[0].scoreboard);
  assert.ok(full.games[0].liveInputEvidence);assert.ok(full.games[0].verifiedLiveEvidence);
  for(const game of [full.games[0],full.games[0].scoreboard,compact.games[0]])
    for(const key of ['basketballEvidence','providerEventRevisions','observationEvidence'])assert.equal(Object.hasOwn(game,key),false,key);
  for(const key of ['enrichment','scoreCalculations'])assert.equal(Object.hasOwn(compact,key),false,key);
  for(const key of ['scoreboard','verifiedLiveEvidence','manpowerEvidence','liveInputEvidence','priorObservation','basketballLastTrusted','timedLastTrusted'])
    assert.equal(Object.hasOwn(compact.games[0],key),false,key);
});

test('compact HTTP view reads the same committed revision and preserves CORS, no-store and degradation flags',async t=>{
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  const feed=fixture(),stored=JSON.stringify({...feed,games:undefined});
  db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(stored);
  db.prepare('INSERT INTO sports_feed_parts (revision,part,payload) VALUES (?,?,?)').run(feed.revision,0,JSON.stringify(feed.games));
  const env={DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){throw Error('A fresh public view must not write data');}
  };}}};
  const call=view=>worker.fetch(new Request('https://worker.test/feed'+view,{headers:{Origin:'https://slatemeter.app'}}),env,{});
  const full=await call(''),compact=await call('?view=compact'),unknown=await call('?view=unrecognized');
  for(const response of [full,compact,unknown]){
    assert.equal(response.status,200);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://slatemeter.app');
  }
  const [a,b,c]=await Promise.all([full.json(),compact.json(),unknown.json()]);
  assert.equal(a.revision,b.revision);assert.equal(b.modelVersion,a.modelVersion);assert.equal(b.updatedAt,a.updatedAt);
  assert.equal(b.games[0].score,a.games[0].score);assert.deepEqual(b.games[0].teams,a.games[0].teams);
  assert.equal(b.freshness.stale,false);assert.equal(b.freshness.degraded,true);
  assert.equal(b.freshness.maxAgeMs,a.freshness.maxAgeMs);
  assert.equal(b.games[0].scoreboard,undefined);assert.ok(a.games[0].scoreboard);assert.ok(c.games[0].scoreboard);
  assert.equal(db.prepare('SELECT payload FROM sports_feed WHERE id=1').get().payload,stored);
});
