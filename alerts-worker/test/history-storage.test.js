import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {RETENTION_MS,NFL_RECORD_SQL,NFL_RECORD_PREDICATE,upcomingLookupSql,completedLookupSql,snapshotHistory,recoverPregameRecords,finalContent,shouldSnapshot} from '../src/snapshot-history.js';
import {refreshSportsData,MODEL_VERSION} from '../src/sports-feed.js';
import {createCollector} from '../src/providers/espn.js';
import {normalizeEvent} from '../src/game-model.js';

const schema = fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const migration = fs.readFileSync(new URL('../migrations/0002_history_lookup_indexes.sql',import.meta.url),'utf8');
function database(t,sql=schema) {
  const db = new DatabaseSync(':memory:'); db.exec(sql); t.after(()=>db.close());
  return {db,DB:{prepare(sql) {
    let values=[];
    return {bind(...args){values=args;return this;},
      async first(){return db.prepare(sql).get(...values) || null;},
      async all(){return {results:db.prepare(sql).all(...values)};},
      async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};
  },async batch(statements){
    db.exec('BEGIN');
    try {const results=await Promise.all(statements.map(s=>s.run()));db.exec('COMMIT');return results;}
    catch(error){db.exec('ROLLBACK');throw error;}
  }}};
}
function event(id='42',state='in') {
  return {id,name:'San Francisco at Atlanta',date:'2026-10-25T17:00:00Z',season:{type:2},competitions:[{
    status:{type:{state,completed:state==='post',shortDetail:state==='post'?'Final':'Q4'},period:4,displayClock:'1:00'},
    competitors:[
      {homeAway:'away',team:{id:'25',displayName:'San Francisco',abbreviation:'SF'},score:'20',records:[{type:'total',summary:state==='post'?'6-1':'6-0'}]},
      {homeAway:'home',team:{id:'1',displayName:'Atlanta',abbreviation:'ATL'},score:state==='post'?'29':'20',records:[{type:'total',summary:state==='post'?'4-3':'3-3'}]}
    ],odds:[{details:'SF -7',spread:7,homeTeamOdds:{underdog:true}}]
  }]};
}
function insert(db,game,at,version=MODEL_VERSION) {
  db.prepare(`INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(`${game.sport}:${game.id}`,at,game.sport,game.state,game.score,String(game.teams[0][2]),String(game.teams[1][2]),'4','',JSON.stringify(game),version);
}
const plan = (db,sql,args) => db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(row=>row.detail).join('\n');

test('additive migration indexes existing history; query plans bound all lookups by game and team keys',t=>{
  const env=database(t,schema.slice(0,schema.indexOf('-- Targeted lookups')));
  const now=Date.now(), live=normalizeEvent(event(),'NFL');
  env.db.exec('BEGIN');
  for(let i=0;i<5000;i++) insert(env.db,{...live,id:`unrelated-${i}`},now-60000);
  // A long same-game history, including newer invalid records, must not be paged.
  for(let i=0;i<1000;i++) insert(env.db,live,now-3000000+i*1500);
  for(let i=0;i<1000;i++) insert(env.db,{...live,pregameRecords:['invalid','invalid']},now-1500000+i*1000);
  env.db.exec('COMMIT');
  const old="SELECT DISTINCT game_key FROM sports_snapshots WHERE state='upcoming' AND observed_at>?";
  assert.match(plan(env.db,old,[Math.floor(now/1000)-RETENTION_MS/1000]),/SCAN sports_snapshots/);
  const count=env.db.prepare('SELECT count(*) n FROM sports_snapshots').get().n;
  env.db.exec(migration); env.db.exec(migration); // additive and idempotent
  assert.equal(env.db.prepare('SELECT count(*) n FROM sports_snapshots').get().n,count);
  const upcoming=plan(env.db,upcomingLookupSql(1),['NFL:42',now-RETENTION_MS]);
  const final=plan(env.db,completedLookupSql(1),['NFL:42',now-RETENTION_MS]);
  const recovery=plan(env.db,NFL_RECORD_SQL,['NFL:42','1','25',now-RETENTION_MS,'NFL:42',now]);
  assert.match(upcoming,/SEARCH s USING COVERING INDEX sports_snapshots_upcoming/);
  assert.match(final,/SEARCH f USING COVERING INDEX sports_snapshots_completed/);
  assert.match(recovery,/SEARCH sports_snapshots USING INDEX sports_snapshots_nfl_records.*game_key=\?.*<expr>=\?.*<expr>=\?/);
  assert.match(recovery,/SEARCH sports_snapshots USING COVERING INDEX sports_snapshots_completed/);
  assert.doesNotMatch(upcoming+'\n'+final+'\n'+recovery,/SCAN (sports_snapshots|s\b|f\b)|USE TEMP B-TREE/);
  const row=env.db.prepare(NFL_RECORD_SQL).get('NFL:42','1','25',now-RETENTION_MS,'NFL:42',now);
  assert.deepEqual(JSON.parse(row.normalized_state).pregameRecords,['6-0','3-3']);
});

test('upcoming existence checks use millisecond retention and only requested game keys',async t=>{
  const env=database(t), now=Date.now();
  const old=normalizeEvent(event('old','pre'),'NFL'), recent=normalizeEvent(event('recent','pre'),'NFL');
  insert(env.db,old,now-RETENTION_MS-1); insert(env.db,recent,now-RETENTION_MS+1);
  insert(env.db,normalizeEvent(event('unrequested','pre'),'NFL'),now-1);
  const history=await snapshotHistory(env,[old,recent],now);
  assert.deepEqual([...history.upcoming],['NFL:recent']);
  assert.equal(shouldSnapshot(old,history,now,MODEL_VERSION),true);
  assert.equal(shouldSnapshot(recent,history,now,MODEL_VERSION),false);
});

test('partial record index accepts the same record syntax as recovery validation',t=>{
  const env=database(t),now=Date.now();
  const values=['6-0','10-12','0-0-1','123-456-789','6--0','6-','-6-0','6-0-','6-0-1-2','6-x','6.0-1',' 6-0','6-0 ','６-0',7,{},[]];
  values.forEach((record,index)=>{
    const game=normalizeEvent(event(String(index)),'NFL');game.pregameRecords=[record,'3-3'];
    insert(env.db,game,now);
    const included=env.db.prepare(`SELECT 1 FROM sports_snapshots WHERE ${NFL_RECORD_PREDICATE} AND game_key=?`).get(`NFL:${index}`);
    assert.equal(Boolean(included),typeof record==='string'&&/^\d+-\d+(?:-\d+)?$/.test(record),JSON.stringify(record));
  });
});

test('indexed NFL recovery respects retention, first final, team order and invalid newer records',async t=>{
  const env=database(t),now=Date.now(),live=normalizeEvent(event(),'NFL');
  insert(env.db,live,now-RETENTION_MS-1);
  let final=normalizeEvent(event('42','post'),'NFL');
  await recoverPregameRecords(env,[final],now,null);
  assert.equal(final.pregameRecords,undefined,'expired pregame cannot supply records');
  const reversed={...live,teams:[...live.teams].reverse(),pregameRecords:[...live.pregameRecords].reverse()};
  insert(env.db,reversed,now-240000);
  insert(env.db,{...live,pregameRecords:['6--0','3-3']},now-210000);
  insert(env.db,{...live,id:'42',teams:live.teams.map((team,i)=>i?team:[...team.slice(0,8),'wrong'])},now-200000);
  insert(env.db,final,now-180000);
  insert(env.db,{...live,pregameRecords:['7-0','3-3']},now-150000);
  await recoverPregameRecords(env,[final],now,null);
  assert.deepEqual(final.pregameRecords,['6-0','3-3']);
  assert.equal(final.score,54,'completed unbeaten-start score is unchanged');
  assert.equal(final.factors.find(f=>f.label==='Ended unbeaten start').points,6);
});

test('final comparison ignores acquisition metadata and object order, retains canonical corrections',()=>{
  const game=normalizeEvent(event('42','post'),'NFL');
  const reordered=Object.fromEntries(Object.entries(game).reverse());
  assert.equal(finalContent(game),finalContent({...reordered,updatedAt:'later',detailStale:true,favorite:true,scoreboard:{}}));
  for(const changed of [{...game,score:game.score+1},{...game,why:'Corrected history'},
    {...game,teams:game.teams.map((team,i)=>i?team:[...team.slice(0,2),'21',...team.slice(3)])},
    {...game,factors:[...game.factors,{label:'Corrected drama',points:1}]}]) {
    assert.notEqual(finalContent(game),finalContent(changed));
  }
});

test('final corrections are content-based, rate-bounded and eligible beyond a short post-final window',async t=>{
  const env=database(t),now=Date.now(),game=normalizeEvent(event('42','post'),'NFL');
  insert(env.db,game,now);
  const changed={...game,score:game.score+1};
  const history=await snapshotHistory(env,[game],now+12000);
  assert.equal(shouldSnapshot(game,history,now+60000,MODEL_VERSION),false);
  assert.equal(shouldSnapshot(changed,history,now+12000,MODEL_VERSION),false);
  assert.equal(shouldSnapshot(changed,history,now+60000,MODEL_VERSION),true);
  assert.equal(shouldSnapshot(changed,history,now+7*86400000,MODEL_VERSION),true);
  assert.equal(shouldSnapshot(game,history,now+60000,'new-model'),true);
});

test('full refresh preserves live buckets, snapshots final transition once, then stores a correction',async t=>{
  const env=database(t),original=globalThis.fetch,now=Date.now();
  let current=event();
  globalThis.fetch=async url=>Response.json(String(url).includes('/summary')
    ? {header:{competitions:current.competitions},plays:[],scoringPlays:[],winprobability:[]}
    : {events:String(url).includes('/football/nfl/')?[current]:[]});
  t.after(()=>{globalThis.fetch=original;});
  assert.ok(await refreshSportsData(env,now));
  assert.ok(await refreshSportsData(env,now+15000));
  const live=env.db.prepare("SELECT observed_at FROM sports_snapshots WHERE state='live' ORDER BY observed_at").all();
  assert.equal(live.length,2); assert.equal(live[1].observed_at-live[0].observed_at,15000);
  current=event('42','post');
  assert.ok(await refreshSportsData(env,now+30000));
  const finals=()=>env.db.prepare("SELECT * FROM sports_snapshots WHERE state='completed' ORDER BY observed_at").all();
  assert.equal(finals().length,1); assert.equal(finals()[0].rating,54);
  // Force resource expiry via natural time; fresh instances still compare persisted history.
  assert.ok(await refreshSportsData(env,now+90000));
  env.db.prepare('DELETE FROM sports_feed').run();
  const again=await refreshSportsData(env,now+150000);
  assert.equal(again.games[0].score,54); assert.equal(finals().length,1);
  current.competitions[0].competitors[1].score='30';
  assert.ok(await refreshSportsData(env,now+210000));
  assert.equal(finals().length,2); assert.equal(finals()[1].score_b,'30');
  assert.equal(env.db.prepare("SELECT count(*) n FROM sports_snapshots WHERE state='live'").get().n,2);
});

test('nonempty NFL previous/next weeks are consumed and retain provider paths',async()=>{
  const seen=[];
  const collect=createCollector(async(url,options)=>{
    const parsed=new URL(url); seen.push({url:parsed,options});
    if(!parsed.pathname.includes('/football/nfl/')) return {events:[]};
    const week=parsed.searchParams.get('week');
    return week ? {events:[event(week==='7'?'previous':'next',week==='7'?'post':'pre')]}
      : {season:{year:2026,type:2},week:{number:8},events:[event('current')]};
  });
  const games=await collect();
  assert.deepEqual(new Set(games.map(g=>g.id)),new Set(['previous','current','next']));
  assert.equal(games.find(g=>g.id==='previous').nflWeek,2026207);
  assert.equal(games.find(g=>g.id==='next').nflWeek,2026209);
  assert.ok(games.every(g=>g.providerPath==='football/nfl'));
  assert.equal(seen.filter(x=>x.options.purpose==='adjacent-schedule').length,2);
});

test('NFL adjacent schedule TTL is 15 minutes while current live scoreboard stays 12 seconds',async t=>{
  const env=database(t),now=Date.now(),original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    const parsed=new URL(url);calls.push({url:parsed,ttl:options.cf.cacheTtl});
    if(parsed.pathname.endsWith('/summary')) return Response.json({header:{competitions:event(parsed.searchParams.get('event')).competitions}});
    if(!parsed.pathname.includes('/football/nfl/')) return Response.json({events:[]});
    const week=parsed.searchParams.get('week');
    return Response.json(week ? {events:[event(week==='7'?'previous':'next',week==='7'?'post':'pre')]}
      : {season:{year:2026,type:2},week:{number:8},events:[event('current')]});
  };
  t.after(()=>{globalThis.fetch=original;});
  assert.ok(await refreshSportsData(env,now));
  const adjacent=()=>calls.filter(c=>c.url.searchParams.has('week'));
  assert.equal(adjacent().length,2); assert.ok(adjacent().every(c=>c.ttl===900));
  assert.ok(await refreshSportsData(env,now+60000));
  const current=calls.filter(c=>c.url.pathname.endsWith('/scoreboard')&&c.url.pathname.includes('/football/nfl/')&&!c.url.searchParams.has('week'));
  assert.equal(current.at(-1).ttl,12);
  assert.ok(await refreshSportsData(env,now+75000));
  assert.equal(adjacent().length,2,'neighbor payloads reused in D1 despite live refreshes');
  assert.ok(await refreshSportsData(env,now+900000));
  assert.equal(adjacent().length,4,'schedule resources refetch at expiry');
});

test('a known live game in an adjacent NFL week retains live freshness',async t=>{
  const env=database(t),now=Date.now(),original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    const parsed=new URL(url);calls.push({week:parsed.searchParams.get('week'),ttl:options.cf.cacheTtl});
    if(parsed.pathname.endsWith('/summary')) return Response.json({header:{competitions:event().competitions}});
    if(!parsed.pathname.includes('/football/nfl/')) return Response.json({events:[]});
    const week=parsed.searchParams.get('week');
    return Response.json(week ? {events:week==='7'?[event('delayed-live')]:[]}
      : {season:{year:2026,type:2},week:{number:8},events:[event('current')]});
  };
  t.after(()=>{globalThis.fetch=original;});
  const first=await refreshSportsData(env,now);
  assert.ok(first.games.some(g=>g.id==='delayed-live'&&g.state==='live'));
  assert.ok(await refreshSportsData(env,now+60000));
  assert.deepEqual(calls.filter(c=>c.week==='7').map(c=>c.ttl),[900,12]);
  assert.deepEqual(calls.filter(c=>c.week==='9').map(c=>c.ttl),[900]);
});
