import test from 'node:test';
import assert from 'node:assert/strict';
import {trace} from '../../scripts/pregame-research-trace.mjs';
test('captured production rows reproduce the empty upcoming public story list without relaxing verification',()=>{
  assert.equal(trace.rows.length,13);
  assert.equal(trace.rows.filter(r=>r.upcomingInCapturedFeed).length,6);
  assert.equal(trace.rows.filter(r=>r.readAccepted).length,0);
  assert.equal(trace.rows.filter(r=>r.publiclyLinked).length,0);
  const latest=trace.rows.filter(r=>r.updatedAt==='2026-11-03T18:17:42.000Z');
  assert.equal(latest.length,3);
  assert.ok(latest.every(r=>!r.pregameEvidenceEligible));
  assert.ok(latest.every(r=>Date.parse(r.updatedAt)<Date.parse(trace.workerDeployment.createdAt)));
});
