import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildScoringQuality} from '../src/quality.js';
import {auditTimeline} from '../src/audit.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/november-3-observed.json',import.meta.url),'utf8'));
const byKey=key=>fixture.cases.find(c=>c.gameKey===key);

test('observed November 3 fixture carries immutable source hashes and no replay claim',()=>{
  assert.equal(fixture.provenance.kind,'observed-production-retained-data');
  assert.match(fixture.provenance.baselineSha256,/^[a-f0-9]{64}$/);
  assert.match(fixture.provenance.d1Sha256,/^[a-f0-9]{64}$/);
  assert.equal(fixture.baseline.observations,1256);assert.equal(fixture.baseline.scheduledRuns,223);
});

test('Winnipeg post-winner 59 is excluded from potentially underrated live observations',()=>{
  const game=byKey('NHL:401892634'),last=game.observations.at(-1);
  assert.equal(last.rating,59);assert.equal(last.state.state,'live');assert.deepEqual(last.scores,[5,4]);
  const q=buildScoringQuality([game]);
  assert.ok(!q.topUnderrated.some(f=>f.observedAt===last.observedAt));
  assert.ok(!q.games.flatMap(g=>g.decisiveMoments).some(f=>f.observedAt===last.observedAt));
});

test('Winnipeg tied dip has retained partial-ledger evidence followed by complete recognition',()=>{
  const rows=byKey('NHL:401892634').snapshots;
  const partial=rows.find(r=>r.observed_at===1793760870000),complete=rows.find(r=>r.observed_at===1793760900000);
  assert.equal(partial.rating,87);assert.equal(partial.state.evidenceQuality,'partial');
  assert.ok(partial.state.evidenceReasons.includes('ledger-behind-scoreboard'));
  assert.equal(complete.rating,92);assert.equal(complete.state.evidenceQuality,'complete');
  assert.equal(complete.state.historyOwnership.relevance.recovery.deepestDeficit,4);
  const erased=complete.state.historyOwnership.allocation.factors.find(f=>f.label==='Erased a multi-goal deficit');
  assert.equal(erased.rawPoints,10);assert.equal(erased.retainedPoints,0);
});

test('Dallas first audit 85+ at seven seconds is not mistaken for the earliest retained 85+ snapshot',()=>{
  const game=byKey('NHL:401892640');
  const audit=game.observations.find(o=>o.rating>=85),snapshot=game.snapshots.find(o=>o.rating>=85);
  assert.equal(audit.clockSeconds,7);assert.equal(snapshot.clock,'1:02');assert.equal(snapshot.rating,88);
  assert.equal(snapshot.state.evidenceQuality,'complete');assert.ok(snapshot.observed_at<audit.observedAt);
});

test('cached Edmonton OT to shootout namespace change does not become regulation score rollback',()=>{
  const summary=byKey('NHL:401892636').cachedSummary;
  const result=auditTimeline(summary,'NHL');
  assert.ok(!result.findings.some(f=>f.reasonCode==='TIMELINE_SCORE_ROLLBACK'));
  assert.ok(result.diagnostics.shootoutTransitions.some(t=>t.before==='401892636000004600'&&t.after==='401892636000004650'));
});

test('NHL cached elapsed-clock examples retain their distinct source clocks and forward wallclocks',()=>{
  for(const [key,a,b] of [['NHL:401892639','401892639000007720','401892639000007840'],['NHL:401892641','401892641000004030','401892641000000280']]){
    const plays=byKey(key).cachedSummary.plays,before=plays.find(p=>p.id===a),after=plays.find(p=>p.id===b);
    assert.ok(Date.parse(after.wallclock)>Date.parse(before.wallclock));
    const result=auditTimeline({plays},'NHL');assert.ok(!result.findings.some(f=>f.reasonCode==='TIMELINE_CLOCK_ORDER'));
  }
});
