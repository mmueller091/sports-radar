import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {AUDIT_VERSION} from '../src/audit.js';
import {sqliteD1} from './helpers/sqlite-d1.js';

test('report interprets legacy null coercion without modifying raw evidence or hiding true zero',async t=>{
  const db=sqliteD1();t.after(()=>db.close());
  const at=Date.parse('2026-11-06T01:00:00Z');
  const rows=[['unavailable',43,43],['unavailable',0,null],['unavailable',43,43],['actual-zero',0,0],['blank',0,'']];
  rows.forEach(([id,rating,score],i)=>db.sqlite.prepare(`INSERT INTO live_audit_observations
    (run_id,game_key,observed_at,slate_date,sport,state_bucket,rating,evidence) VALUES (?,?,?,?,?,?,?,?)`)
    .run(i+1,'CFB:'+id,at+i*1000,'2026-11-05','CFB','live',rating,
      JSON.stringify({state:{id,sport:'CFB',state:'live',score,teams:[['Away','AWY',14],['Home','HOM',17]],liveUpdateRejected:score===null}})));
  const original=db.sqlite.prepare('SELECT * FROM live_audit_observations ORDER BY run_id').all();
  const response=await worker.fetch(new Request('https://audit.example/report?date=2026-11-05',
    {headers:{Authorization:'Bearer fixture-only'}}),{DB:db.DB,AUDIT_READ_TOKEN:'fixture-only'});
  assert.equal(response.status,200);
  const report=await response.json(),games=new Map(report.postSlate.gameSummaries.map(g=>[g.game_key,g]));
  assert.equal(games.get('CFB:unavailable').min_rating,43);
  assert.equal(games.get('CFB:unavailable').peak_rating,43);
  assert.equal(games.get('CFB:unavailable').raw_min_rating,0);
  assert.equal(games.get('CFB:unavailable').legacy_unavailable_rating_rows,1);
  assert.equal(games.get('CFB:actual-zero').min_rating,0);
  assert.equal(games.get('CFB:actual-zero').legacy_unavailable_rating_rows,0);
  assert.equal(games.get('CFB:blank').min_rating,null);
  assert.equal(games.get('CFB:blank').raw_min_rating,0);
  assert.deepEqual(db.sqlite.prepare('SELECT * FROM live_audit_observations ORDER BY run_id').all(),original);
  assert.equal(db.operations.filter(o=>o.kind==='write').length,0);
});

test('health exposes audit code identity without opening protected report access',async t=>{
  const db=sqliteD1();t.after(()=>db.close());
  const response=await worker.fetch(new Request('https://audit.example/health'),{DB:db.DB});
  assert.equal((await response.json()).auditVersion,AUDIT_VERSION);
  assert.equal((await worker.fetch(new Request('https://audit.example/report'),{DB:db.DB})).status,401);
});
