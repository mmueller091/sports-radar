// Read-only release checks. Keep payloads in SQLite and bound each rowid scan.
export const SNAPSHOT_STATES = ['upcoming','live','completed'];
export const SNAPSHOT_SUMS = {rowids:'rowid',timestamps:'observed_at',ratings:'rating',payloadCharacters:'length(normalized_state)'};
export const MAX_RANGE_ROWS = 5000n;
const MIN_ROWID=-(1n<<63n),MAX_ROWID=(1n<<63n)-1n;
function integer(value){
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Unsafe rowid');
  if(!/^-?\d+$/.test(String(value)))throw new Error('Invalid rowid');
  const n=BigInt(value);if(n<MIN_ROWID||n>MAX_ROWID)throw new Error('Rowid outside SQLite integer range');return n;
}
export const snapshotBoundsSql="SELECT CAST(MIN(rowid) AS TEXT) AS firstRowid,CAST(MAX(rowid) AS TEXT) AS lastRowid,COUNT(*) AS rows FROM sports_snapshots";
export function snapshotRangeSql(first,last){
  const lo=integer(first),hi=integer(last);if(hi<lo||hi-lo+1n>MAX_RANGE_ROWS)throw new Error('Unbounded snapshot range');
  const fields=['COUNT(*) AS totalRows',"COUNT(*) FILTER(WHERE state NOT IN ('upcoming','live','completed')) AS unknownStates"];
  for(const state of SNAPSHOT_STATES){
    fields.push(`COUNT(*) FILTER(WHERE state='${state}') AS ${state}_rows`);
    for(const [name,expr] of Object.entries(SNAPSHOT_SUMS))fields.push(`CAST(COALESCE(SUM(${expr}) FILTER(WHERE state='${state}'),0) AS TEXT) AS ${state}_${name}`);
  }
  return `SELECT ${fields.join(',')} FROM sports_snapshots WHERE rowid>=${lo} AND rowid<=${hi}`;
}
export function snapshotRanges(first,last){
  if(first==null&&last==null)return [];
  let lo=integer(first);const end=integer(last);if(lo>end)throw new Error('Reversed snapshot bounds');
  const ranges=[];for(;lo<=end;lo+=MAX_RANGE_ROWS){const hi=lo+MAX_RANGE_ROWS-1n<end?lo+MAX_RANGE_ROWS-1n:end;ranges.push({first:String(lo),last:String(hi),sql:snapshotRangeSql(lo,hi)});}return ranges;
}
export function mergeSnapshotAggregates(rows){
  const totals=Object.fromEntries(SNAPSHOT_STATES.map(s=>[s,Object.fromEntries(['rows',...Object.keys(SNAPSHOT_SUMS)].map(k=>[k,0n]))]));let totalRows=0n;
  for(const row of rows){if(BigInt(row.unknownStates)!==0n)throw new Error('Unknown snapshot lifecycle state');
    totalRows+=BigInt(row.totalRows);for(const state of SNAPSHOT_STATES)for(const key of Object.keys(totals[state])){
      const value=row[state+'_'+key];if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Unsafe aggregate integer');totals[state][key]+=BigInt(value);
    }
  }
  if(Object.values(totals).reduce((n,s)=>n+s.rows,0n)!==totalRows)throw new Error('Snapshot count disagreement');
  return {totalRows:String(totalRows),states:Object.fromEntries(Object.entries(totals).map(([s,v])=>[s,Object.fromEntries(Object.entries(v).map(([k,n])=>[k,String(n)]))]))};
}
