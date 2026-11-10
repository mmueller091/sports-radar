import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {RETENTION_MS,FOOTBALL_RETENTION_MS,SNAPSHOT_CLEANUP_BATCH,retentionMs,pruneSnapshots,NFL_RECORD_SQL,NFL_RECORD_PREDICATE,upcomingLookupSql,completedLookupSql,snapshotHistory,recoverPregameRecords,recoverPregameBaselines,gameHistory,finalContent,shouldSnapshot} from '../src/snapshot-history.js';
import {refreshSportsData,MODEL_VERSION} from '../src/sports-feed.js';
import {createCollector} from '../src/providers/espn.js';
import {normalizeEvent} from '../src/game-model.js';

const schema = fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
const migration = fs.readFileSync(new URL('../migrations/0002_history_lookup_indexes.sql',import.meta.url),'utf8');
const stateMigration = fs.readFileSync(new URL('../migrations/0003_snapshot_state_identity.sql',import.meta.url),'utf8');
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

test('state-key migration preserves every field and rowid; a failed equality guard rolls back the complete migration',t=>{
  const old=schema.replace('PRIMARY KEY (game_key, observed_at, state)','PRIMARY KEY (game_key, observed_at)');
  assert.notEqual(old,schema);
  for(const corrupt of [false,true]){
    const env=database(t,old),now=Date.now();
    insert(env.db,{...normalizeEvent(event(),'NFL'),why:'Unicode: ✓ and preserved whitespace\r\n'},now);
    const before=env.db.prepare('SELECT rowid,* FROM sports_snapshots').all();
    env.db.exec('BEGIN');
    if(corrupt){
      const broken=stateMigration.replace('CREATE TABLE snapshot_key_migration_check',"UPDATE sports_snapshots_state_key SET observed_at=observed_at+1;\nCREATE TABLE snapshot_key_migration_check");
      assert.notEqual(broken,stateMigration);
      assert.throws(()=>env.db.exec(broken),/CHECK constraint failed/);env.db.exec('ROLLBACK');
    }else{env.db.exec(stateMigration);env.db.exec('COMMIT');}
    assert.deepEqual(env.db.prepare('SELECT rowid,* FROM sports_snapshots').all(),before);
    assert.equal(env.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    const pk=env.db.prepare('PRAGMA table_info(sports_snapshots)').all().filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
    assert.deepEqual(pk,corrupt?['game_key','observed_at']:['game_key','observed_at','state']);
    assert.equal(env.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name IN ('sports_snapshots_state_key','snapshot_key_migration_check')").get().n,0);
  }
});

test('same-time lifecycle rows preserve pregame recovery, final lookup, record recovery and timeline ordering',async t=>{
  const env=database(t),now=Date.now(),at=now-60000;
  const pre=normalizeEvent(event('42','pre'),'NFL'),live=normalizeEvent(event(),'NFL'),final=normalizeEvent(event('42','post'),'NFL');
  insert(env.db,pre,at);insert(env.db,{...live,pregameRecords:['5-0','2-3']},at);insert(env.db,final,at);
  const original=env.db.prepare('SELECT rowid,* FROM sports_snapshots ORDER BY rowid').all();
  const fresh=normalizeEvent(event(),'NFL');
  await recoverPregameBaselines(env,[fresh],now,null);
  assert.deepEqual(fresh.pregameBaseline,pre.pregameBaseline,'only the upcoming row can recover the observed baseline');
  const completed=await snapshotHistory(env,[final],now);
  assert.equal(completed.completed.size,1);
  assert.equal(JSON.parse(completed.completed.get('NFL:42').normalized_state).state,'completed');
  await recoverPregameRecords(env,[final],now,null);
  assert.deepEqual(final.pregameRecords,['5-0','2-3'],'live at the final timestamp precedes the completed state');
  const history=await gameHistory(env,'NFL','42',now);
  assert.deepEqual(history.snapshots.map(p=>[p.observedAt,p.state]),[['upcoming'],['live'],['completed']].map(([s])=>[at,s]));
  assert.deepEqual(env.db.prepare('SELECT rowid,* FROM sports_snapshots ORDER BY rowid').all(),original);
  assert.throws(()=>insert(env.db,live,at),/UNIQUE constraint failed/,'same state and bucket remain unique');
});

test('same-time lifecycle retention keeps the last final and all rows under an unresolved audit hold',async t=>{
  const env=database(t),now=Date.now(),at=now-RETENTION_MS-1000;
  env.db.exec('CREATE TABLE live_audit_findings(game_key TEXT,status TEXT)');
  for(const id of ['expired','held'])for(const state of ['upcoming','live','completed'])
    insert(env.db,{sport:'NBA',id,state,score:42,teams:[['Away','AWY','1'],['Home','HME','1']]},at);
  env.db.prepare('INSERT INTO live_audit_findings VALUES (?,?)').run('NBA:held','open');
  assert.equal(await pruneSnapshots(env,now),2);
  assert.deepEqual(env.db.prepare("SELECT state FROM sports_snapshots WHERE game_key='NBA:expired'").all().map(r=>r.state),['completed']);
  assert.equal(env.db.prepare("SELECT count(*) n FROM sports_snapshots WHERE game_key='NBA:held'").get().n,3);
});

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
  assert.match(plan(env.db,old,[Math.floor(now/1000)-FOOTBALL_RETENTION_MS/1000]),/SCAN sports_snapshots/);
  const count=env.db.prepare('SELECT count(*) n FROM sports_snapshots').get().n;
  env.db.exec(migration); env.db.exec(migration); // additive and idempotent
  assert.equal(env.db.prepare('SELECT count(*) n FROM sports_snapshots').get().n,count);
  env.db.exec('BEGIN');env.db.exec(stateMigration);env.db.exec('COMMIT');
  assert.equal(env.db.prepare('SELECT count(*) n FROM sports_snapshots').get().n,count);
  const upcoming=plan(env.db,upcomingLookupSql(1),['NFL:42',now-FOOTBALL_RETENTION_MS]);
  const final=plan(env.db,completedLookupSql(1),['NFL:42',now-FOOTBALL_RETENTION_MS]);
  const recovery=plan(env.db,NFL_RECORD_SQL,['NFL:42','1','25',now-FOOTBALL_RETENTION_MS,'NFL:42',now]);
  assert.match(upcoming,/SEARCH s USING COVERING INDEX sports_snapshots_upcoming/);
  assert.match(final,/SEARCH f USING COVERING INDEX sports_snapshots_completed/);
  assert.match(recovery,/SEARCH sports_snapshots USING INDEX sports_snapshots_nfl_records.*game_key=\?.*<expr>=\?.*<expr>=\?/);
  assert.match(recovery,/SEARCH sports_snapshots USING COVERING INDEX sports_snapshots_completed/);
  assert.doesNotMatch(upcoming+'\n'+final+'\n'+recovery,/SCAN (sports_snapshots|s\b|f\b)|USE TEMP B-TREE/);
  const row=env.db.prepare(NFL_RECORD_SQL).get('NFL:42','1','25',now-FOOTBALL_RETENTION_MS,'NFL:42',now);
  assert.deepEqual(JSON.parse(row.normalized_state).pregameRecords,['6-0','3-3']);
});

test('upcoming existence checks use millisecond retention and only requested game keys',async t=>{
  const env=database(t), now=Date.now();
  const old=normalizeEvent(event('old','pre'),'NFL'), recent=normalizeEvent(event('recent','pre'),'NFL');
  insert(env.db,old,now-FOOTBALL_RETENTION_MS-1); insert(env.db,recent,now-FOOTBALL_RETENTION_MS+1);
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
  insert(env.db,live,now-FOOTBALL_RETENTION_MS-1);
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

test('retention distinguishes football from other sports and protects unresolved audit evidence and last finals',async t=>{
  const env=database(t),now=Date.now(),day=86400000;
  env.db.exec(`CREATE TABLE live_audit_findings (game_key TEXT,reason_code TEXT,status TEXT,
    PRIMARY KEY(game_key,reason_code))`);
  const add=(sport,id,age,state='live')=>insert(env.db,{sport,id,state,score:42,teams:[['Away','AWY','1'],['Home','HME','1']]},now-age*day);
  add('NBA','old',8);add('NHL','recent',6);add('NCAAB','old',8);add('MLB','old',8);
  add('NFL','recent',8);add('NFL','old',15);add('CFB','recent',13);add('CFB','old',15);
  add('NBA','open',8);add('NBA','watch',8);add('NBA','recovered',8);
  add('NBA','final',9,'completed');add('NBA','final',8,'completed');
  env.db.prepare('INSERT INTO live_audit_findings VALUES (?,?,?)').run('NBA:open','clock','open');
  env.db.prepare('INSERT INTO live_audit_findings VALUES (?,?,?)').run('NBA:watch','suspicious','watch');
  env.db.prepare('INSERT INTO live_audit_findings VALUES (?,?,?)').run('NBA:recovered','resolved','recovered');
  assert.equal(retentionMs('NFL'),14*day);assert.equal(retentionMs('CFB'),14*day);
  for(const sport of ['NBA','NHL','MLB','NCAAB','Tennis','Soccer'])assert.equal(retentionMs(sport),7*day);
  assert.equal(await pruneSnapshots(env,now),7);
  const remaining=env.db.prepare('SELECT game_key,observed_at FROM sports_snapshots ORDER BY game_key,observed_at').all();
  assert.deepEqual(remaining.map(row=>row.game_key),['CFB:recent','NBA:final','NBA:open','NBA:watch','NFL:recent','NHL:recent']);
  assert.equal(remaining.find(row=>row.game_key==='NBA:final').observed_at,now-8*day);
});

test('large expired history is pruned in bounded batches',async t=>{
  const env=database(t),now=Date.now();
  const row={sport:'NBA',state:'live',score:20,teams:[['Away','AWY','1'],['Home','HME','1']]};
  for(let i=0;i<SNAPSHOT_CLEANUP_BATCH+1;i++)insert(env.db,{...row,id:String(i)},now-RETENTION_MS-60000);
  assert.equal(await pruneSnapshots(env,now),SNAPSHOT_CLEANUP_BATCH);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,1);
  assert.equal(await pruneSnapshots(env,now),1);
  assert.equal(env.db.prepare('SELECT COUNT(*) n FROM sports_snapshots').get().n,0);
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

test('NFL adjacent schedule TTL stays 15 minutes while current live scoreboard uses 5 seconds',async t=>{
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
  assert.equal(current.at(-1).ttl,5);
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
  assert.deepEqual(calls.filter(c=>c.week==='7').map(c=>c.ttl),[900,5]);
  assert.deepEqual(calls.filter(c=>c.week==='9').map(c=>c.ttl),[900]);
});
