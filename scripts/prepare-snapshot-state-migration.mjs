import fs from 'node:fs';import {pathToFileURL} from 'node:url';
import {snapshotRanges} from './snapshot-release-preflight.mjs';
const columns=['rowid','game_key','observed_at','sport','state','rating','score_a','score_b','phase','clock','normalized_state','model_version'];
export function boundedSnapshotMigration(template,first,last){
  // This is one asynchronous import, not a sequence of independent REST writes.
  // The import must block other database access and roll back the entire file on failure.
  const copyStart=template.indexOf('INSERT INTO sports_snapshots_state_key('),copyEnd=template.indexOf(';',copyStart)+1;
  const guardStart=template.indexOf('CREATE TABLE snapshot_key_migration_check'),guardEnd=template.indexOf('DROP TABLE snapshot_key_migration_check');
  if(copyStart<0||copyEnd<=copyStart||guardStart<copyEnd||guardEnd<guardStart)throw new Error('Unexpected migration template');
  const copy=template.slice(copyStart,copyEnd).trim();
  if(!copy.endsWith('FROM sports_snapshots;')||!copy.includes('('+columns.join(',')+')'))throw new Error('Migration field list changed');
  const equality=columns.map(c=>`typeof(old.${c})=typeof(copy.${c}) AND old.${c} IS copy.${c}`).join(' AND ');
  const ranges=snapshotRanges(first,last).flatMap(r=>{const out=[];for(let lo=BigInt(r.first);lo<=BigInt(r.last);lo+=1000n){const hi=lo+999n<BigInt(r.last)?lo+999n:BigInt(r.last);out.push({first:String(lo),last:String(hi)});}return out;});
  const parts=[template.slice(0,copyStart).trim()];
  for(const r of ranges)parts.push(copy.slice(0,-1)+` WHERE rowid>=${r.first} AND rowid<=${r.last};`);
  parts.push('CREATE TABLE snapshot_key_migration_check(ok INTEGER NOT NULL CHECK(ok=1));');
  parts.push('INSERT INTO snapshot_key_migration_check SELECT (SELECT COUNT(*) FROM sports_snapshots)=(SELECT COUNT(*) FROM sports_snapshots_state_key);');
  for(const r of ranges)parts.push(`INSERT INTO snapshot_key_migration_check SELECT NOT EXISTS (SELECT 1 FROM sports_snapshots old LEFT JOIN sports_snapshots_state_key copy ON copy.rowid=old.rowid WHERE old.rowid>=${r.first} AND old.rowid<=${r.last} AND (copy.rowid IS NULL OR NOT (${equality})));`);
  parts.push(template.slice(guardEnd).trim());
  parts.push("INSERT INTO d1_migrations(name) VALUES('0003_snapshot_state_identity.sql');");
  const sql=parts.join('\n')+'\n';if(parts.some(p=>Buffer.byteLength(p)>=100000))throw new Error('Oversized migration statement');
  return {sql,ranges,recordGuard:'Counts plus exact SQLite type/value equality for every original rowid and all eleven fields',execution:'Single D1 asynchronous file import; never use REST /query for the whole file'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [first,last,output]=process.argv.slice(2);if(!output)throw new Error('Usage: firstRowid lastRowid output.sql');
  const template=fs.readFileSync(new URL('../alerts-worker/migrations/0003_snapshot_state_identity.sql',import.meta.url),'utf8');
  const result=boundedSnapshotMigration(template,first,last);fs.writeFileSync(output,result.sql,{flag:'wx'});console.log(JSON.stringify({file:output,ranges:result.ranges.length,bytes:Buffer.byteLength(result.sql),recordGuard:result.recordGuard,execution:result.execution}));
}
