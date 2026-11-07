import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {boundedSnapshotMigration,snapshotCleanupSql,finishSnapshotCleanupSql} from '../scripts/prepare-snapshot-state-migration.mjs';
const template=fs.readFileSync(new URL('../alerts-worker/migrations/0003_snapshot_state_identity.sql',import.meta.url),'utf8');
test('bounded import retains exact field guards and checks coverage before destructive cutover',()=>{
  const result=boundedSnapshotMigration(template,-1,10001);assert.equal(result.ranges.length,11);
  assert.deepEqual(result.ranges.at(0),{first:'-1',last:'998'});assert.deepEqual(result.ranges.at(-1),{first:'9999',last:'10001'});
  assert.equal((result.sql.match(/INSERT INTO sports_snapshots_state_key/g)||[]).length,11);
  assert.equal((result.sql.match(/typeof\(old\.normalized_state\)=typeof\(copy\.normalized_state\) AND old\.normalized_state IS copy\.normalized_state/g)||[]).length,11);
  assert.ok(result.sql.indexOf('SELECT COUNT(*) FROM sports_snapshots')<result.sql.indexOf('ALTER TABLE sports_snapshots RENAME TO sports_snapshots_pre_state_key;'));
  assert.ok(!result.sql.includes('DROP TABLE sports_snapshots;'),'retain the source until bounded verified cleanup');
  assert.ok(result.sql.includes('PRIMARY KEY (game_key, observed_at, state)'));assert.ok(result.sql.endsWith("INSERT INTO d1_migrations(name) VALUES('0003_snapshot_state_identity.sql');\n"));
  assert.throws(()=>boundedSnapshotMigration(template.replace('score_a,score_b','score_b,score_a'),1,2));
});

function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const schema=fs.readFileSync(new URL('../alerts-worker/schema.sql',import.meta.url),'utf8').replace('PRIMARY KEY (game_key, observed_at, state)','PRIMARY KEY (game_key, observed_at)');
  db.exec(schema);db.exec(template.slice(template.indexOf('CREATE INDEX IF NOT EXISTS sports_snapshots_age')));
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE)');
  const insert=db.prepare('INSERT INTO sports_snapshots(rowid,game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  insert.run(1,'CFB:a',1794038400000,'CFB','upcoming',45,'0','0','','','{"original":true}','model');
  insert.run(5001,'CFB:b',1794038400000,'CFB','completed',43,'17','20','Q4','0:00','{"original":true}','model');
  return db;
}
function atomic(db,sql){db.exec('BEGIN');try{db.exec(sql);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
const rows=db=>db.prepare('SELECT rowid,* FROM sports_snapshots ORDER BY rowid').all();

test('retained-source switch rolls back late failure and rejects incomplete copy coverage',t=>{
  const db=fixture(t),before=rows(db),migration=boundedSnapshotMigration(template,1,5001).sql;
  assert.throws(()=>atomic(db,migration+'CREATE TABLE fail(ok CHECK(ok=1)); INSERT INTO fail VALUES(0);'),/CHECK/);
  assert.deepEqual(rows(db),before);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='sports_snapshots_pre_state_key'").get().n,0);
  assert.throws(()=>atomic(db,boundedSnapshotMigration(template,1,5000).sql),/CHECK/);
  assert.deepEqual(rows(db),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n,0);
});

test('bounded cleanup is retryable and preserves original fields plus new lifecycle collisions',t=>{
  const db=fixture(t),before=rows(db);atomic(db,boundedSnapshotMigration(template,1,5001).sql);
  db.exec("INSERT INTO sports_snapshots SELECT game_key,observed_at,sport,'live',50,score_a,score_b,'Q1','15:00',normalized_state,model_version FROM sports_snapshots WHERE rowid=1");
  const withLive=rows(db);assert.equal(withLive.length,3);
  assert.throws(()=>atomic(db,finishSnapshotCleanupSql),/CHECK/);
  atomic(db,snapshotCleanupSql(1,5000));atomic(db,snapshotCleanupSql(1,5000));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sports_snapshots_pre_state_key').get().n,1);
  atomic(db,snapshotCleanupSql(5001,5001));atomic(db,finishSnapshotCleanupSql);
  assert.deepEqual(rows(db),withLive);assert.deepEqual(rows(db).slice(0,2),before);
  assert.throws(()=>snapshotCleanupSql(1,5001),/5000/);
});

test('cleanup rejects changed, missing, and wrong-identity authoritative rows before deleting a duplicate',t=>{
  const db=fixture(t);atomic(db,boundedSnapshotMigration(template,1,5001).sql);
  for(const mutation of ["UPDATE sports_snapshots SET normalized_state='changed' WHERE rowid=1",'DELETE FROM sports_snapshots WHERE rowid=1',"UPDATE sports_snapshots SET game_key='CFB:wrong' WHERE rowid=1"]){
    db.exec('SAVEPOINT scenario');db.exec(mutation);
    assert.throws(()=>db.exec(snapshotCleanupSql(1,1000)),/CHECK/);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sports_snapshots_pre_state_key WHERE rowid=1').get().n,1);
    db.exec('ROLLBACK TO scenario; RELEASE scenario');
  }
  const before=rows(db);
  assert.throws(()=>atomic(db,snapshotCleanupSql(1,1000)+'CREATE TABLE fail(ok CHECK(ok=1)); INSERT INTO fail VALUES(0);'),/CHECK/);
  assert.deepEqual(rows(db),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sports_snapshots_pre_state_key').get().n,2);
});
