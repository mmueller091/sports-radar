import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {refreshSportsData,gameDetails,MODEL_VERSION} from '../src/sports-feed.js';
import {finalArchiveKey,finalArchivePrefix,eligibleFinalArchive,FINAL_SETTLEMENT_MS} from '../src/finalized-game-cache.js';

function fixture(t) {
  const db=new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  t.after(()=>db.close());
  const env={DB:{prepare(sql){let args=[];return {
    bind(...values){args=values;return this;},
    async first(){return db.prepare(sql).get(...args)||null;},
    async all(){return {results:db.prepare(sql).all(...args)};},
    async run(){if(sql.startsWith('SELECT'))return {results:db.prepare(sql).all(...args),meta:{changes:0}};return {meta:{changes:db.prepare(sql).run(...args).changes}};}
  };},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
  const event={id:'final-1',name:'Away at Home',date:new Date(Date.now()-86400000).toISOString(),competitions:[{
    status:{type:{state:'post',completed:true,shortDetail:'Final'},period:4,displayClock:'0:00'},
    competitors:[
      {homeAway:'away',team:{id:'11',displayName:'Away',abbreviation:'AWY'},score:'20'},
      {homeAway:'home',team:{id:'22',displayName:'Home',abbreviation:'HME'},score:'14'}
    ]
  }]};
  let summaryCalls=0,hidden=false;
  const original=globalThis.fetch;
  globalThis.fetch=async value=>{
    const url=new URL(value);
    if(url.pathname.endsWith('/summary')) {
      summaryCalls++;
      return Response.json({header:{competitions:event.competitions},plays:[],scoringPlays:[
        {id:'game-winning-play',scoringPlay:true,period:{number:4},clock:{displayValue:'0:02'},
          text:'Late go-ahead touchdown',homeScore:'14',awayScore:event.competitions[0].competitors[0].score,
          team:{id:'11'}}],winprobability:[]});
    }
    return Response.json({events:!hidden&&url.pathname.includes('/college-football/')&&url.searchParams.get('groups')==='80'?[event]:[]});
  };
  t.after(()=>{globalThis.fetch=original;});
  const fixtureState={env,db,event,summaryCalls:()=>summaryCalls,hideGame:()=>{hidden=true;}};
  fixtureState.run=(now)=>refreshSportsData(env,now,{log:metrics=>{fixtureState.metrics=metrics;}});
  return fixtureState;
}

test('an archive key is bound to authoritative final status, identities, period and scores',()=>{
  const e={sport:'CFB',id:'42',state:'completed',liveRawStatus:{type:{state:'post'},period:4},
    teams:[[null,null,'21',null,null,null,null,null,'1'],[null,null,'20',null,null,null,null,null,'2']]};
  const key=finalArchiveKey(e);
  assert.ok(key.startsWith(finalArchivePrefix('CFB','42')));
  assert.notEqual(finalArchiveKey({...e,liveRawStatus:{type:{state:'post'},period:5}}),key);
  assert.notEqual(finalArchiveKey({...e,teams:[[null,null,'22',null,null,null,null,null,'1'],e.teams[1]]}),key);
  assert.equal(finalArchiveKey({...e,state:'live'}),null);
  assert.equal(finalArchiveKey({...e,liveRawStatus:{type:{state:'in'}}}),null);
  const history={completed:new Map([['CFB:42',{observed_at:0,model_version:MODEL_VERSION}]])};
  const complete={...e,score:80,modelVersion:MODEL_VERSION,evidenceQuality:'complete'};
  const meta={summaryHash:'abc',model:MODEL_VERSION};
  assert.equal(eligibleFinalArchive(complete,complete,meta,history,FINAL_SETTLEMENT_MS+1,MODEL_VERSION),true);
  assert.equal(eligibleFinalArchive({...complete,scoringPartial:true},complete,meta,history,FINAL_SETTLEMENT_MS+1,MODEL_VERSION),false);
  assert.equal(eligibleFinalArchive({...complete,detailStale:true},complete,meta,history,FINAL_SETTLEMENT_MS+1,MODEL_VERSION),false);
  assert.equal(eligibleFinalArchive({...complete,summaryValidationPending:true},complete,meta,history,FINAL_SETTLEMENT_MS+1,MODEL_VERSION),false);
});

test('settled verified finals archive once and remain available without recurring summary requests',async t=>{
  const f=fixture(t),now=Date.now();
  const first=await f.run(now),original=first.games[0];
  assert.equal(original.state,'completed');
  assert.equal(original.scoringPartial,undefined);
  const startCalls=f.summaryCalls();
  const early=await f.run(now+60000);
  assert.equal(early.games[0].score,original.score);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get().n,0);
  let settled;
  for(let minute=2;minute<=17;minute++)settled=await f.run(now+minute*60000);
  assert.ok(settled);
  const row=f.db.prepare("SELECT key,payload FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get();
  assert.ok(row,'a verified stable final must enter durable archive after settlement');
  const saved=JSON.parse(row.payload);
  assert.equal(saved.game.score,original.score);
  assert.equal(saved.modelVersion,MODEL_VERSION);
  const archivedCalls=f.summaryCalls();
  for(let minute=18;minute<=25;minute++){
    const feed=await f.run(now+minute*60000);
    assert.equal(feed.games[0].score,original.score);
    assert.equal(feed.games[0].detailStale,false);
    assert.equal(feed.sourceErrors.length,0);
  }
  assert.equal(f.summaryCalls(),archivedCalls,'finals never revalidate ESPN summaries after archival');
  assert.ok(archivedCalls>=startCalls,'verification is allowed before archive is settled');
  const details=await gameDetails(f.env,'CFB','final-1',now+26*60000);
  assert.equal(details.sportsRadarGame.score,original.score);
  assert.equal(details.sportsRadarFreshness.stale,false);
  assert.equal(f.summaryCalls(),archivedCalls,'Game Center uses archived ESPN detail');
  const historical=await f.run(now+8*86400000);
  assert.equal(historical.games[0].score,original.score);
  assert.equal(f.summaryCalls(),archivedCalls,'seven-day cache cleanup never reloads archived finals');
  assert.ok(f.db.prepare('SELECT key FROM sports_resources WHERE key=?').get(row.key));
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sports_resources WHERE key LIKE '%/summary%' ").get().n,0);
  f.hideGame();
  await f.run(now+8*86400000+60000);
  const bookmarked=await gameDetails(f.env,'CFB','final-1',now+32*86400000);
  assert.equal(bookmarked.sportsRadarArchived,true);
  assert.equal(bookmarked.sportsRadarGame.score,original.score);
  assert.equal(bookmarked.sportsRadarFreshness.stale,false);
  assert.equal(f.summaryCalls(),archivedCalls,'old bookmarks work without ESPN or retained snapshots');
});

test('an official final-score correction exits the archive and is recertified',async t=>{
  const f=fixture(t),now=Date.now();
  await f.run(now);
  for(let minute=1;minute<=17;minute++)await f.run(now+minute*60000);
  const initial=f.db.prepare("SELECT key FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get();
  assert.ok(initial);
  const before=f.summaryCalls();
  f.event.competitions[0].competitors[0].score='21';
  const changed=await f.run(now+18*60000);
  assert.equal(changed.games[0].teams[0][2],'21');
  assert.ok(f.summaryCalls()>before,'new official scoreboard result forces fresh verification');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get().n,1);
  assert.notEqual(finalArchiveKey(changed.games[0]),initial.key);
  let latest;
  for(let minute=19;minute<=35;minute++)latest=await f.run(now+minute*60000);
  assert.equal(latest.games[0].teams[0][2],'21');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get().n,2,
    'a corrected result gets its own archive, preserving the original history');
});

test('a restarted final leaves the archive without suppressing live acquisition',async t=>{
  const f=fixture(t),now=Date.now();
  await f.run(now);
  for(let minute=1;minute<=16;minute++)await f.run(now+minute*60000);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get().n,1);
  const before=f.summaryCalls();
  f.event.competitions[0].status={type:{state:'in',completed:false,shortDetail:'Q4'},period:4,displayClock:'2:10'};
  const resumed=await f.run(now+17*60000);
  assert.equal(resumed.games[0].state,'live');
  assert.ok(f.summaryCalls()>before);
  assert.equal(resumed.games[0].enrichmentPending,undefined);
});

test('a model transition preserves a finalized historical rating and its original provenance',async t=>{
  const f=fixture(t),now=Date.now();
  await f.run(now);
  for(let minute=1;minute<=16;minute++)await f.run(now+minute*60000);
  const before=f.summaryCalls();
  const saved=JSON.parse(f.db.prepare('SELECT payload FROM sports_feed WHERE id=1').get().payload);
  saved.modelVersion='prior-release';
  saved.enrichment['CFB:final-1'].model='prior-release';
  f.db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify(saved));
  const oldSnapshots=f.db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE game_key='CFB:final-1'").get().n;
  const migrated=await f.run(now+17*60000);
  assert.equal(migrated.modelVersion,MODEL_VERSION);
  assert.equal(migrated.games[0].score,JSON.parse(f.db.prepare("SELECT payload FROM sports_resources WHERE key LIKE 'finalized-game:v1:%'").get().payload).game.score);
  assert.equal(f.summaryCalls(),before,'no old finalized game is reprocessed by a model release');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sports_snapshots WHERE game_key='CFB:final-1'").get().n,oldSnapshots,
    'a new scoring model cannot rewrite archived final history');
});
