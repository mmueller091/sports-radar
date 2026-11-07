import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {boundedSnapshotMigration} from '../scripts/prepare-snapshot-state-migration.mjs';
const template=fs.readFileSync(new URL('../alerts-worker/migrations/0003_snapshot_state_identity.sql',import.meta.url),'utf8');
test('bounded import retains exact field guards and checks coverage before destructive cutover',()=>{
  const result=boundedSnapshotMigration(template,-1,10001);assert.equal(result.ranges.length,11);
  assert.deepEqual(result.ranges.at(0),{first:'-1',last:'998'});assert.deepEqual(result.ranges.at(-1),{first:'9999',last:'10001'});
  assert.equal((result.sql.match(/INSERT INTO sports_snapshots_state_key/g)||[]).length,11);
  assert.equal((result.sql.match(/typeof\(old\.normalized_state\)=typeof\(copy\.normalized_state\) AND old\.normalized_state IS copy\.normalized_state/g)||[]).length,11);
  assert.ok(result.sql.indexOf('SELECT COUNT(*) FROM sports_snapshots')<result.sql.indexOf('DROP TABLE sports_snapshots;'));
  assert.ok(result.sql.includes('PRIMARY KEY (game_key, observed_at, state)'));assert.ok(result.sql.endsWith("INSERT INTO d1_migrations(name) VALUES('0003_snapshot_state_identity.sql');\n"));
  assert.throws(()=>boundedSnapshotMigration(template.replace('score_a,score_b','score_b,score_a'),1,2));
});
