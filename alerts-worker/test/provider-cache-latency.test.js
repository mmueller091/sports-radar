import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {providerJson} from '../src/sports-feed.js';
import {refreshBudget} from '../src/refresh-policy.js';
import {measuredDatabase} from '../src/refresh-diagnostics.js';

const paths={NFL:'football/nfl',CFB:'football/college-football',NCAAB:'basketball/mens-college-basketball',
  NHL:'hockey/nhl',MLB:'baseball/mlb',NBA:'basketball/nba',Soccer:'soccer/eng.1',Tennis:'tennis/atp'};
const source=sport=>`https://site.api.espn.com/apis/site/v2/sports/${paths[sport]}/summary?event=42`;
const payload=(marker,state='in')=>({marker,header:{competitions:[{status:{type:{state}}}]},plays:[{id:marker}]});
const schema=`CREATE TABLE sports_resources(key TEXT PRIMARY KEY,payload TEXT NOT NULL,updated_at INTEGER NOT NULL);
  CREATE TABLE sports_leases(key TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL);`;
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

function fixture(t) {
  const db=new DatabaseSync(':memory:');db.exec(schema);
  const f={db,now:Date.now(),elapsed:0,calls:[],executed:[],errors:[],fetches:0};
  const execute=(sql,args,kind)=>{
    f.beforeStatement?.(sql,args,kind);f.executed.push(sql);
    const statement=db.prepare(sql);
    if(statement.columns().length)return {success:true,results:statement.all(...args),meta:{changes:0}};
    return {success:true,results:[],meta:{changes:Number(statement.run(...args).changes)}};
  };
  const one=async(kind,sql,args)=>{
    f.calls.push({kind,sql});await f.beforeCall?.(kind,[{sql,args}]);
    return execute(sql,args,kind);
  };
  const DB={prepare(sql){let args=[];return {
    get sql(){return sql;},get args(){return args;},bind(...values){args=values;return this;},
    async first(){return (await one('first',sql,args)).results[0] || null;},
    async all(){return one('all',sql,args);},async run(){return one('run',sql,args);}
  };},async batch(statements){
    f.calls.push({kind:'batch',sql:statements.map(s=>s.sql)});
    await f.beforeCall?.('batch',statements);
    // Execute real SQLite SQL synchronously inside a transaction, as D1 batch
    // does. No Promise.all or mocked SELECT/write result shapes.
    db.exec('BEGIN IMMEDIATE');let results;
    try {results=statements.map(s=>execute(s.sql,s.args,'batch'));db.exec('COMMIT');}
    catch(error){db.exec('ROLLBACK');throw error;}
    f.afterBatch?.(statements,results);return results;
  }};
  f.env={DB};
  f.put=(url,value,at=f.now-60000)=>db.prepare('INSERT INTO sports_resources VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(url,JSON.stringify(value),at);
  f.cached=url=>{const row=db.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').get(url);return row?{payload:JSON.parse(row.payload),updatedAt:row.updated_at}:null;};
  f.owner=url=>db.prepare('SELECT owner FROM sports_leases WHERE key=?').get(url)?.owner;
  f.call=async(url=source('NFL'),{state='in',phase='liveSummary',time=f.now,budget=true}={})=>{
    const active=budget?refreshBudget(time,{clock:()=>f.elapsed}):null;
    if(active)active.phase=()=>phase;
    try {return await providerJson(f.env,url,12000,time,f.errors,active,{status:{type:{state}}});}
    finally {active?.close();}
  };
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>{f.fetches++;return f.fetchHook?f.fetchHook(url,options):Response.json(payload('new'));};
  t.after(()=>{globalThis.fetch=original;db.close();});
  return f;
}

for(const sport of ['NFL','CFB','NCAAB','NHL','MLB','NBA'])test(`${sport} canonical live summary uses three round trips with unchanged payload and SQL count`,async t=>{
  const f=fixture(t),url=source(sport);f.put(url,payload('old'));
  const result=await f.call(url);
  assert.deepEqual(result,{payload:payload('new'),updatedAt:f.now});
  assert.deepEqual(f.cached(url),result);assert.equal(f.owner(url),undefined);
  assert.equal(f.calls.length,3);assert.equal(f.executed.length,6);assert.equal(f.fetches,1);
  assert.deepEqual(f.calls.map(c=>c.kind),['first','batch','batch']);assert.deepEqual(f.errors,[]);
});

test('fresh live cache still performs one read with no writes or provider fetch',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('cached'),f.now-1000);
  assert.deepEqual(await f.call(url),{payload:payload('cached'),updatedAt:f.now-1000});
  assert.equal(f.calls.length,1);assert.equal(f.fetches,0);assert.equal(f.owner(url),undefined);
});

for(const [name,sport,options] of [
  ['soccer','Soccer',{}],['tennis','Tennis',{}],['pregame','NFL',{state:'pre'}],
  ['completed','NBA',{state:'post'}],['detail','NHL',{budget:false}],['maintenance','MLB',{phase:'maintenance'}]
])test(`${name} retains the existing unbatched path`,async t=>{
  const f=fixture(t),url=source(sport);f.put(url,payload('old',options.state || 'in'));
  f.fetchHook=async()=>Response.json(payload('new',options.state || 'in'));
  assert.deepEqual(await f.call(url,options),{payload:payload('new',options.state || 'in'),updatedAt:f.now});
  assert.equal(f.calls.length,6);assert.equal(f.executed.length,6);assert.equal(f.fetches,1);
  assert.ok(f.calls.every(c=>c.kind!=='batch'));assert.equal(f.owner(url),undefined);
});

test('cache refreshed between first read and claim is reread without another provider fetch',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.beforeCall=(kind,statements)=>{
    if(kind==='batch'&&statements[0].sql.startsWith('INSERT INTO sports_leases'))f.put(url,payload('other'),f.now-1);
  };
  assert.deepEqual(await f.call(url),{payload:payload('other'),updatedAt:f.now-1});
  assert.equal(f.fetches,0);assert.equal(f.owner(url),undefined);assert.equal(f.calls.length,3);
});

test('contended live acquisition returns the old resource and preserves its owner',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run(url,'other',f.now+15000);
  assert.deepEqual(await f.call(url),{payload:payload('old'),updatedAt:f.now-60000});
  assert.equal(f.owner(url),'other');assert.equal(f.fetches,0);assert.equal(f.calls.length,2);
  assert.deepEqual(f.errors,[url]);
});

test('contended acquisition without a usable cache still fails without duplicate fetch',async t=>{
  const f=fixture(t),url=source('NBA');f.put(url,payload('prematch','pre'));
  f.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run(url,'other',f.now+15000);
  await assert.rejects(f.call(url),/Source refresh in progress/);
  assert.equal(f.fetches,0);assert.equal(f.owner(url),'other');assert.deepEqual(f.errors,[url]);
});

test('a provider result arriving after lease takeover cannot overwrite or release its successor',async t=>{
  const f=fixture(t),url=source('NFL'),first=gate(),second=gate();f.put(url,payload('old'));
  const enteredFirst=gate(),enteredSecond=gate();
  f.fetchHook=async()=>{if(f.fetches===1){enteredFirst.resolve();await first.promise;return Response.json(payload('late'));}
    enteredSecond.resolve();await second.promise;return Response.json(payload('successor'));};
  t.after(()=>{first.resolve();second.resolve();});
  const pending=f.call(url);await enteredFirst.promise;
  const next=f.call(url,{time:f.now+16000});await enteredSecond.promise;
  const successor=f.owner(url);first.resolve();
  assert.deepEqual(await pending,{payload:payload('old'),updatedAt:f.now-60000});
  assert.equal(f.owner(url),successor,'old owner cannot release successor');
  assert.equal(f.cached(url).payload.marker,'old','old owner cannot write');
  second.resolve();assert.deepEqual(await next,{payload:payload('successor'),updatedAt:f.now+16000});
  assert.equal(f.owner(url),undefined);assert.deepEqual(f.errors,[url]);
});

test('late owner reads an already committed successor payload with its actual timestamp',async t=>{
  const f=fixture(t),url=source('NFL'),blocked=gate(),entered=gate();f.put(url,payload('old'));
  f.fetchHook=async()=>{if(f.fetches===1){entered.resolve();await blocked.promise;return Response.json(payload('late'));}
    return Response.json(payload('successor'));};
  t.after(()=>blocked.resolve());const pending=f.call(url);await entered.promise;
  const newer=await f.call(url,{time:f.now+16000});blocked.resolve();
  assert.deepEqual(await pending,newer);assert.deepEqual(f.cached(url),newer);assert.equal(f.owner(url),undefined);
  assert.deepEqual(f.errors,[url]);
});

for(const delta of [0,1])test(`monotonic cache guard retains a ${delta?'newer':'same-version'} timestamp even under valid ownership`,async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.fetchHook=async()=>{f.put(url,payload('newer'),f.now+delta);return Response.json(payload('late'));};
  assert.deepEqual(await f.call(url),{payload:payload('newer'),updatedAt:f.now+delta});
  assert.equal(f.owner(url),undefined);assert.deepEqual(f.errors,delta?[url]:[]);
});

test('prematch regression preserves played cache and a genuine final-to-live correction remains admissible',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('played','post'));
  f.fetchHook=async()=>Response.json(payload('regressed','pre'));
  assert.deepEqual(await f.call(url),{payload:payload('played','post'),updatedAt:f.now-60000});
  assert.equal(f.owner(url),undefined);assert.deepEqual(f.errors,[url]);
  f.fetchHook=async()=>Response.json(payload('corrected','in'));f.errors.length=0;
  assert.deepEqual(await f.call(url),{payload:payload('corrected','in'),updatedAt:f.now});
  assert.deepEqual(f.errors,[]);
});

test('provider timeout retains original resource age and releases acquired ownership',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.fetchHook=async()=>{throw new DOMException('fixture timeout','TimeoutError');};
  assert.deepEqual(await f.call(url),{payload:payload('old'),updatedAt:f.now-60000});
  assert.equal(f.owner(url),undefined);assert.deepEqual(f.errors,[url]);
});

test('claim batch read failure rolls back acquisition before provider work starts',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.beforeStatement=(sql,args,kind)=>{if(kind==='batch'&&sql.startsWith('SELECT'))throw Error('fixture read failure');};
  await assert.rejects(f.call(url),/fixture read failure/);
  assert.equal(f.owner(url),undefined);assert.equal(f.fetches,0);assert.equal(f.cached(url).payload.marker,'old');
});

for(const failedPhase of ['write','read','release'])test(`commit batch ${failedPhase} failure rolls back its cache write and fallback releases the original lease`,async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));let failed=false;
  let committing=false;
  f.beforeCall=(kind,statements)=>{committing=kind==='batch'&&statements[0].sql.startsWith('INSERT INTO sports_resources');};
  const prefix={write:'INSERT INTO sports_resources',read:'SELECT',release:'DELETE'}[failedPhase];
  f.beforeStatement=(sql,args,kind)=>{if(!failed&&committing&&kind==='batch'&&sql.startsWith(prefix)){failed=true;throw Error(`fixture ${failedPhase} failure`);}};
  assert.deepEqual(await f.call(url),{payload:payload('old'),updatedAt:f.now-60000});
  assert.deepEqual(f.cached(url),{payload:payload('old'),updatedAt:f.now-60000});
  assert.equal(f.owner(url),undefined);assert.deepEqual(f.errors,[url]);
});

test('successful batch release remains recorded if readback parsing fails',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.afterBatch=(statements,results)=>{if(statements[0].sql.startsWith('INSERT INTO sports_resources')){
    results[1].results[0].payload='{';
    f.db.prepare('INSERT INTO sports_leases VALUES (?,?,?)').run(url,'successor',f.now+30000);
  }};
  assert.deepEqual(await f.call(url),{payload:payload('new'),updatedAt:f.now});
  assert.equal(f.owner(url),'successor');assert.equal(f.calls.length,4);
  assert.ok(!f.calls.some(c=>c.kind==='run'&&c.sql.startsWith('DELETE')));assert.deepEqual(f.errors,[url]);
});

test('refresh deadline after provider response still forbids cache commit and releases ownership',async t=>{
  const f=fixture(t),url=source('NFL');f.put(url,payload('old'));
  f.fetchHook=async()=>{f.elapsed=26000;return Response.json(payload('late'));};
  await assert.rejects(f.call(url),/Refresh deadline/);
  assert.deepEqual(f.cached(url),{payload:payload('old'),updatedAt:f.now-60000});assert.equal(f.owner(url),undefined);
});

test('actual local D1 binding supports batched claim/read and fenced write/read/release',async t=>{
  const {Miniflare,convertV4MiniflareOptions}=await import('miniflare');
  const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:'export default { fetch() { return new Response("test"); } };',
    compatibilityDate:'2026-10-21',d1Databases:['DB'],cf:false}));
  t.after(()=>mf.dispose());const DB=await mf.getD1Database('DB');await DB.exec(schema.replaceAll('\n',' '));
  const now=Date.now(),url=source('NFL');
  await DB.prepare('INSERT INTO sports_resources VALUES (?,?,?)').bind(url,JSON.stringify(payload('old')),now-60000).run();
  const budget=refreshBudget(now);budget.phase=()=> 'liveSummary';t.after(()=>budget.close());
  const metrics={},env={DB:measuredDatabase(DB,budget,metrics,()=> 'liveSummary')},errors=[];
  const original=globalThis.fetch;
  globalThis.fetch=async(url,options)=>String(url).startsWith('https://site.api.espn.com/')?Response.json(payload('new')):original(url,options);
  t.after(()=>{globalThis.fetch=original;});
  const result=await providerJson(env,url,12000,now,errors,budget,{status:{type:{state:'in'}}});
  assert.deepEqual(result,{payload:payload('new'),updatedAt:now});assert.deepEqual(errors,[]);
  assert.equal(metrics.d1.calls,3);assert.equal(metrics.d1.statements,6);
  assert.equal(await DB.prepare('SELECT owner FROM sports_leases WHERE key=?').bind(url).first(),null);
  assert.equal(JSON.parse((await DB.prepare('SELECT payload FROM sports_resources WHERE key=?').bind(url).first()).payload).marker,'new');
});
