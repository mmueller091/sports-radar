import test from 'node:test';import assert from 'node:assert/strict';
import {snapshotRanges,snapshotRangeSql,mergeSnapshotAggregates,SNAPSHOT_STATES,SNAPSHOT_SUMS} from '../scripts/snapshot-release-preflight.mjs';
test('preflight ranges cover negative, sparse and boundary rowids exactly without a payload sort',()=>{
  const ranges=snapshotRanges('-1','10000');assert.deepEqual(ranges.map(r=>[r.first,r.last]),[['-1','4998'],['4999','9998'],['9999','10000']]);
  assert.ok(ranges.every(r=>!r.sql.includes('GROUP BY')&&!r.sql.includes('ORDER BY')));assert.deepEqual(snapshotRanges(null,null),[]);
  assert.equal(snapshotRanges('9223372036854775807','9223372036854775807').length,1);
  for(const args of [[0,5000],[2,1],['1;DELETE',5],[9007199254740992,9007199254740992]])assert.throws(()=>snapshotRangeSql(...args));
});
test('preflight sums preserve integer precision and reject omitted lifecycle states',()=>{
  const row={totalRows:1,unknownStates:0};for(const state of SNAPSHOT_STATES){row[state+'_rows']=state==='live'?1:0;for(const key of Object.keys(SNAPSHOT_SUMS))row[state+'_'+key]=state==='live'?'9007199254740993':'0';}
  const merged=mergeSnapshotAggregates([row,row]);assert.equal(merged.states.live.timestamps,'18014398509481986');assert.equal(merged.totalRows,'2');
  assert.throws(()=>mergeSnapshotAggregates([{...row,unknownStates:1}]));assert.throws(()=>mergeSnapshotAggregates([{...row,totalRows:2}]));
});
