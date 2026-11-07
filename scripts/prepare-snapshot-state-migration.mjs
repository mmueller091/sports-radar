import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {snapshotRanges,SNAPSHOT_STATES,SNAPSHOT_SUMS} from './snapshot-release-preflight.mjs';
const columns=['rowid','game_key','observed_at','sport','state','rating','score_a','score_b','phase','clock','normalized_state','model_version'];
const equality=columns.map(c=>`typeof(old.${c})=typeof(copy.${c}) AND old.${c} IS copy.${c}`).join(' AND ');
export const retainedSnapshotTable='sports_snapshots_pre_state_key';
// Each cleanup call is its own bounded, atomic REST request. The authoritative
// table is never deleted or modified. A failed/unfinished cleanup leaves a
// redundant recovery copy, and can be retried without affecting live history.
export function snapshotCleanupSql(first,last){
  const ranges=snapshotRanges(first,last);
  if(ranges.length!==1)throw new Error('Cleanup must cover at most 5000 rowids');
  const r=ranges[0],where=`old.rowid>=${r.first} AND old.rowid<=${r.last}`;
  return `CREATE TABLE snapshot_key_cleanup_check(ok INTEGER NOT NULL CHECK(ok=1));\nINSERT INTO snapshot_key_cleanup_check SELECT NOT EXISTS (SELECT 1 FROM ${retainedSnapshotTable} old LEFT JOIN sports_snapshots copy ON copy.rowid=old.rowid WHERE ${where} AND (copy.rowid IS NULL OR NOT (${equality})));\nDELETE FROM ${retainedSnapshotTable} WHERE rowid>=${r.first} AND rowid<=${r.last};\nDROP TABLE snapshot_key_cleanup_check;\n`;
}
export const finishSnapshotCleanupSql=`CREATE TABLE snapshot_key_cleanup_check(ok INTEGER NOT NULL CHECK(ok=1));\nINSERT INTO snapshot_key_cleanup_check SELECT COUNT(*)=0 FROM ${retainedSnapshotTable};\nDROP TABLE ${retainedSnapshotTable};\nDROP TABLE snapshot_key_release_baseline;\nDROP TABLE snapshot_key_cleanup_check;\n`;
export function boundedSnapshotMigration(template,first,last){
  // This is one asynchronous import, not a sequence of independent REST writes.
  // The import must block other database access and roll back the entire file on failure.
  const copyStart=template.indexOf('INSERT INTO sports_snapshots_state_key('),copyEnd=template.indexOf(';',copyStart)+1;
  const guardStart=template.indexOf('CREATE TABLE snapshot_key_migration_check'),guardEnd=template.indexOf('DROP TABLE snapshot_key_migration_check');
  if(copyStart<0||copyEnd<=copyStart||guardStart<copyEnd||guardEnd<guardStart)throw new Error('Unexpected migration template');
  const copy=template.slice(copyStart,copyEnd).trim();
  if(!copy.endsWith('FROM sports_snapshots;')||!copy.includes('('+columns.join(',')+')'))throw new Error('Migration field list changed');
  const ranges=snapshotRanges(first,last).flatMap(r=>{const out=[];for(let lo=BigInt(r.first);lo<=BigInt(r.last);lo+=1000n){const hi=lo+999n<BigInt(r.last)?lo+999n:BigInt(r.last);out.push({first:String(lo),last:String(hi)});}return out;});
  const aggregateRanges=snapshotRanges(first,last);
  const names=['totalRows','unknownStates',...SNAPSHOT_STATES.flatMap(s=>['rows',...Object.keys(SNAPSHOT_SUMS)].map(n=>s+'_'+n))];
  const capture=sql=>`SELECT json_object(${names.map(n=>`'${n}',${n}`).join(',')}) FROM (${sql})`;
  const parts=[template.slice(0,copyStart).trim(),
    'CREATE TABLE snapshot_key_release_baseline(first_rowid INTEGER PRIMARY KEY,last_rowid INTEGER NOT NULL,before_payload TEXT NOT NULL,after_payload TEXT);'];
  // Keep the complete pre/post aggregates inside the already-blocking import.
  // Bursting the equivalent REST reads hit D1's ten-second resource limiter.
  for(const r of aggregateRanges)parts.push(`INSERT INTO snapshot_key_release_baseline(first_rowid,last_rowid,before_payload) VALUES(${r.first},${r.last},(${capture(r.sql)}));`);
  for(const r of ranges)parts.push(copy.slice(0,-1)+` WHERE rowid>=${r.first} AND rowid<=${r.last};`);
  parts.push('CREATE TABLE snapshot_key_migration_check(ok INTEGER NOT NULL CHECK(ok=1));');
  parts.push('INSERT INTO snapshot_key_migration_check SELECT (SELECT COUNT(*) FROM sports_snapshots)=(SELECT COUNT(*) FROM sports_snapshots_state_key);');
  for(const r of ranges)parts.push(`INSERT INTO snapshot_key_migration_check SELECT NOT EXISTS (SELECT 1 FROM sports_snapshots old LEFT JOIN sports_snapshots_state_key copy ON copy.rowid=old.rowid WHERE old.rowid>=${r.first} AND old.rowid<=${r.last} AND (copy.rowid IS NULL OR NOT (${equality})));`);
  for(const r of aggregateRanges)parts.push(`UPDATE snapshot_key_release_baseline SET after_payload=(${capture(r.sql.replace('FROM sports_snapshots WHERE','FROM sports_snapshots_state_key WHERE'))}) WHERE first_rowid=${r.first};`);
  parts.push(`INSERT INTO snapshot_key_migration_check SELECT COUNT(*)=${aggregateRanges.length} AND NOT EXISTS (SELECT 1 FROM snapshot_key_release_baseline WHERE after_payload IS NULL OR before_payload<>after_payload OR json_extract(before_payload,'$.unknownStates')<>0) FROM snapshot_key_release_baseline;`);
  const cutover=template.slice(guardEnd).trim();
  if(cutover.split('DROP TABLE sports_snapshots;').length!==2)throw new Error('Unexpected source-table replacement');
  // A full-copy D1 rehearsal proved that copying and deleting the multi-GB
  // source in one successful import times out. Retaining it makes the atomic
  // switch small enough to commit; remove only verified duplicates afterward.
  parts.push(cutover.replace('DROP TABLE sports_snapshots;',`ALTER TABLE sports_snapshots RENAME TO ${retainedSnapshotTable};\nDROP INDEX sports_snapshots_age;\nDROP INDEX sports_snapshots_upcoming;\nDROP INDEX sports_snapshots_completed;\nDROP INDEX sports_snapshots_nfl_records;`));
  parts.push("INSERT INTO d1_migrations(name) VALUES('0003_snapshot_state_identity.sql');");
  const sql=parts.join('\n')+'\n';if(parts.some(p=>Buffer.byteLength(p)>=100000))throw new Error('Oversized migration statement');
  return {sql,ranges,recordGuard:'Counts plus exact SQLite type/value equality for every original rowid and all eleven fields',execution:'Single D1 asynchronous file import; never use REST /query for the whole file'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [first,last,output]=process.argv.slice(2);if(!output)throw new Error('Usage: firstRowid lastRowid output.sql');
  const template=fs.readFileSync(new URL('../alerts-worker/migrations/0003_snapshot_state_identity.sql',import.meta.url),'utf8');
  const result=boundedSnapshotMigration(template,first,last);fs.writeFileSync(output,result.sql,{flag:'wx'});console.log(JSON.stringify({file:output,ranges:result.ranges.length,bytes:Buffer.byteLength(result.sql),recordGuard:result.recordGuard,execution:result.execution}));
}
