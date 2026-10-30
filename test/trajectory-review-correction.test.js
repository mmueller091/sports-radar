import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCorrectedReview,renderCorrectedReviewer} from '../scripts/trajectory-review-correction.mjs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const original=JSON.parse(read('calibration/trajectory-diagnostic-key.json'));
const key=buildCorrectedReview(),reviewer=renderCorrectedReviewer(key);
const get=id=>key.cases.find(c=>c.id===id);
const card=id=>reviewer.split(`## ${id} - `)[1].split('\n## ')[0];

test('separate corrected artifacts preserve IDs, frozen results and source hashes',()=>{
  assert.deepEqual(key.cases.map(c=>c.id),original.cases.map(c=>c.id));
  assert.deepEqual(key.cases.map(c=>c.results),original.cases.map(c=>c.results));
  for(const {path,sha256} of key.correction.sources)
    assert.equal(createHash('sha256').update(read(path)).digest('hex'),sha256,path);
  assert.equal(read('calibration/trajectory-reviewer-pack.corrected.md').toString(),reviewer);
  assert.equal(createHash('sha256').update(read('calibration/trajectory-diagnostic-key.corrected.json')).digest('hex'),
    createHash('sha256').update(JSON.stringify(key,null,2)+'\n').digest('hex'),'Corrected diagnostic is reproducible');
  assert.equal(key.correction.scoringRerun,false);
  assert.match(key.correction.calibrationValidity,/Pending/);
});

test('R10 identifies upstream sequence disorder and repairs display using source evidence',()=>{
  const c=get('R10'),audit=c.reviewAudit.chronology;
  const early=audit.sourceOrder.findIndex(p=>p.clock?.displayValue==='16:19');
  const later=audit.sourceOrder.findIndex(p=>p.clock?.displayValue==='14:30');
  assert.ok(early<later);
  assert.ok(Number(audit.sourceOrder[early].sequenceNumber)>Number(audit.sourceOrder[later].sequenceNumber));
  assert.ok(audit.sourceOrder[early].wallclock<audit.sourceOrder[later].wallclock);
  assert.ok(audit.replayOrder.findIndex(p=>p.clock?.displayValue==='14:30')<audit.replayOrder.findIndex(p=>p.clock?.displayValue==='16:19'));
  assert.deepEqual(audit.sourceOrder.map(p=>p.id).sort(),audit.replayOrder.map(p=>p.id).sort());
  const seconds=clock=>clock.split(':').reduce((n,v)=>60*n+Number(v),0);
  for(let i=1;i<c.public.scoringUpdates.length;i++) {
    const a=c.public.scoringUpdates[i-1],b=c.public.scoringUpdates[i];
    assert.ok(b.period>a.period || (b.period===a.period && seconds(b.clock)<=seconds(a.clock)));
    assert.ok(b.home>=a.home && b.away>=a.away);
  }
  assert.match(audit.providerCorrection,/Not established/);
  assert.match(c.reviewAudit.status,/exclude/);
});

test('postseason context is evidence-backed and conflicting series details stay unverified',()=>{
  for(const id of ['R02','R10']) {
    const a=get(id).reviewAudit;
    assert.equal(a.contextEvidence.eventSeason.type,3);
    assert.equal(a.contextEvidence.summarySeason.type,3);
    assert.match(card(id),/Verified watchability context: Retained provider fixture identifies a postseason/);
    assert.match(card(id),/Unverified inputs:/);
    assert.ok(a.fixture.sha256);
  }
  assert.match(card('R02'),/series snapshots conflict/);
  assert.doesNotMatch(card('R02'),/Series tied 3-3|leads series 3-2|Game 5/);
  assert.match(card('R10'),/Elite Eight/);
});

test('football timeout transitions are excluded without inventing possession or a normal down',()=>{
  for(const [id,down] of [['R21',-1],['R05',0]]) {
    const c=get(id),a=c.reviewAudit;
    assert.equal(a.transition.record.type.text,'Timeout');
    assert.equal(a.transition.replaySituation.down,down);
    assert.deepEqual(c.public.situation,{});
    assert.match(card(id),/unsuitable for confident judgment; excluded/);
    assert.match(card(id),/current possession, down, distance and field position are not established/);
    assert.doesNotMatch(card(id),/"possession"|"down"|drive in progress/);
    assert.ok(c.results['live-owned-45-95'].live.sportImpact.competitiveFloor>0);
  }
  assert.equal(get('R21').reviewAudit.transition.record.end.yardsToEndzone,0);
  assert.equal(get('R21').reviewAudit.transition.record.end.distance,0);
  assert.match(get('R21').reviewAudit.issues[0],/No explicit pending try/);
  assert.match(get('R05').reviewAudit.issues[0],/fourth-and-16/);
});

test('synthetic missing-situation cases are not described as verified ordinary possessions',()=>{
  for(const id of ['R01','R15']) {
    assert.deepEqual(get(id).public.situation,{});
    assert.match(card(id),/possession and situation information are unavailable/);
    assert.match(card(id),/No ordinary possession is verified/);
  }
});

test('reviewer whitelist conceals teams, policies, model scores and points, and leaves answers blank',()=>{
  for(const c of key.cases) {
    for(const value of Object.values(c.public.answers)) assert.equal(value,'');
    for(const team of c.provenance.teams||[]) assert.ok(!reviewer.includes(team.name));
    assert.match(card(c.id),/Would you switch to this game now\? __________/);
  }
  for(const {label} of key.policyProvenance) assert.ok(!reviewer.includes(label));
  assert.doesNotMatch(reviewer,/preClampTotal|reviewBreakdown|protectedRating|Persistent postseason stakes|\bpoints\s*[:=]\s*\d|Final score|Policy score/);
});
