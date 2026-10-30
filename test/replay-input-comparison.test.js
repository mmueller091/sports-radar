import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {historicalFixtureSha256,verifyFixtureBytes} from '../calibration/fixture-provenance.mjs';
import {gunzipSync} from 'node:zlib';
import {INPUT_PIPELINE_VERSION} from '../scripts/replay-inputs.mjs';
import {currentSourceHashes} from '../scripts/replay-input-comparison.mjs';
import {loadCore} from '../calibration/helpers.mjs';
import {pairedHistories,prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
import {POLICIES} from '../scripts/trajectory-review-pack.mjs';
const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p));
const scope=json('calibration/output/replay-input-scope.v2.json');
const result=json('calibration/output/replay-input-comparison.v2.json');
const review=json('calibration/trajectory-diagnostic-key.replay-v2.json');
const rows=JSON.parse(gunzipSync(read('calibration/output/replay-input-states.v2.json.gz')));
const hash=b=>createHash('sha256').update(b).digest('hex');
// The commit that records the replay-v2 checkpoint manifest, not a moving HEAD
// or the deliberately extended working tree. The original generator already
// has a frozen-source replacement recorded in that manifest.
const historicalRevision='1bf1c66703a097c97fcde55b4c7af13055c3c593';
const historicalRead=path=>execFileSync('git',['show',`${historicalRevision}:${path}`],{cwd:root,maxBuffer:16*1024*1024});
const manifest=JSON.parse(historicalRead('calibration/trajectory-current-checkpoint-manifest.json'));
function verifyFrozenArtifact(path,bytes=read(path)) {
  assert.equal(hash(bytes),manifest.entries.find(e=>e.path===path).sha256,`${path}: frozen artifact changed`);
}
function verifyHistoricalComparison(bytes=read('calibration/output/replay-input-comparison.v2.json')) {
  verifyFrozenArtifact('calibration/output/replay-input-comparison.v2.json',bytes);
  const artifact=JSON.parse(bytes);
  for(const f of artifact.fixtureHashes)assert.equal(historicalFixtureSha256(f.path),f.sha256,f.path);
  for(const f of artifact.sourceHashes) {
    const supersession=manifest.provenanceCompatibility.sourceSupersession;
    const source=f.path===supersession.path ? supersession.frozenRawSource : f.path;
    assert.equal(hash(historicalRead(source)),f.sha256,`${f.path}: historical source identity`);
    if(source!==f.path) {
      assert.equal(hash(read(source)),f.sha256,'Retained original generator bytes');
      assert.equal(hash(historicalRead(f.path)),manifest.entries.find(e=>e.path===f.path).sha256,
        'Repaired generator matches its historical checkpoint');
    }
  }
}

test('bounded repaired comparison preserves policies and input/fixture provenance',()=>{
  assert.equal(scope.fixtures,107);
  assert.equal(result.inputPipelineVersion,INPUT_PIPELINE_VERSION);
  assert.equal(scope.pipelineSha256,hash(read('scripts/replay-inputs.mjs')));
  verifyHistoricalComparison();
  for(const path of ['calibration/output/replay-input-scope.v2.json','calibration/output/replay-input-provenance.v2.json',
    'calibration/output/replay-input-states.v2.json.gz','calibration/trajectory-diagnostic-key.replay-v2.json',
    'calibration/trajectory-reviewer-pack.replay-v2.md'])verifyFrozenArtifact(path);
  assert.deepEqual(result.policies,POLICIES);
  assert.equal(result.selectedPolicy,null);assert.equal(result.promotionReady,false);
  assert.equal(result.oldStagingManifestValidatesRepair,false);
  assert.equal(result.invariants.identicalInputs,result.invariants.offScorerParity);
  assert.ok(result.invariants.unchangedInputReuse>0);
});

test('new opt-in evaluation identifies current source separately from historical evidence',async()=>{
  const require=createRequire(import.meta.url),core=await loadCore();
  const shadow=require('../calibration/shadow-candidate.cjs');
  const {LIVE_TRAJECTORY_POLICIES,LIVE_HISTORY_RELEVANCE_POLICY}=require('../calibration/trajectory-live-policy.cjs');
  const input=pairedHistories().decisive[0],policies=[LIVE_TRAJECTORY_POLICIES[1],LIVE_HISTORY_RELEVANCE_POLICY];
  const evaluation={sourceHashes:currentSourceHashes(),policies:policies.map(p=>p.id),
    results:shadow.candidateTrajectoryRatings(core,prepareSynthetic(input),input.competition,input.summary,policies)};
  assert.equal(evaluation.results.length,2);
  assert.ok(evaluation.results.every(r=>Number.isFinite(r.score)));
  assert.notEqual(evaluation.policies[0],evaluation.policies[1]);
  assert.equal(new Set(evaluation.sourceHashes.map(f=>f.path)).size,evaluation.sourceHashes.length);
  for(const f of evaluation.sourceHashes)assert.equal(f.sha256,hash(read(f.path)),f.path);
  for(const path of ['scripts/replay-input-comparison.mjs','calibration/trajectory-live-policy.cjs',
    'scoring/shared/history.js','scoring/sports/nhl.js']) {
    const current=evaluation.sourceHashes.find(f=>f.path===path);
    assert.ok(current,`${path}: new evaluation records changed source`);
    assert.notEqual(current.sha256,hash(historicalRead(path)),path);
  }
  verifyHistoricalComparison();
});

test('altered frozen results, source records, retained source and fixture bytes fail verification',()=>{
  const changed=structuredClone(result);
  changed.comparisons['Phase 2'].inputEffect.count++;
  assert.throws(()=>verifyHistoricalComparison(Buffer.from(JSON.stringify(changed))),/frozen artifact changed/);
  const claimedCurrent=structuredClone(result);
  claimedCurrent.sourceHashes=currentSourceHashes();
  assert.throws(()=>verifyHistoricalComparison(Buffer.from(JSON.stringify(claimedCurrent))),/frozen artifact changed/);
  const source=manifest.provenanceCompatibility.sourceSupersession.frozenRawSource;
  assert.throws(()=>verifyFrozenArtifact(source,Buffer.concat([read(source),Buffer.from(' ')])),/frozen artifact changed/);
  const fixture=result.fixtureHashes[0];
  assert.throws(()=>verifyFixtureBytes(fixture.path,Buffer.concat([read(fixture.path),Buffer.from(' ')])),/content changed/);
});

test('membership uses disjoint stable identities and separates input from policy effects',()=>{
  const all=Object.values(result.membership).flat();
  assert.equal(new Set(all).size,all.length);
  assert.equal(new Set(rows.map(r=>r.stateId)).size,rows.length);
  assert.deepEqual([...all].sort(),rows.map(r=>r.stateId).sort());
  assert.equal(rows.filter(r=>r.after).length,scope.summary.after);
  assert.equal(rows.filter(r=>r.before).length,scope.summary.before);
  for(const {label} of POLICIES) {
    const c=result.comparisons[label];
    assert.equal(c.inputEffect.count,result.membership.matched.length);
    assert.equal(c.policyEffectOnCorrectedInputs.count,scope.summary.after);
    assert.equal(c.allNew.exact99.after,rows.filter(r=>r.after?.[label].score===99).length);
    for(const t of [70,80,85,90,99])assert.equal(c.inputEffect.thresholds[t].up,
      rows.filter(r=>r.before&&r.after&&r.before[label].score<t&&r.after[label].score>=t).length);
  }
  assert.equal(result.comparisons['Phase 2'].policyEffectOnCorrectedInputs.checkpointWeighted.delta,0);
});

test('review diagnostics and cards use the evaluated corrected checkpoints and preserve exclusions',()=>{
  const pack=read('calibration/trajectory-reviewer-pack.replay-v2.md').toString();
  const old=json('calibration/trajectory-diagnostic-key.json');
  assert.deepEqual(review.cases.map(c=>c.id),old.cases.map(c=>c.id));
  for(const c of review.cases) {
    assert.ok(Object.values(c.public.answers).every(v=>v===''));
    for(const t of c.provenance.teams||[])assert.ok(!pack.includes(t.name));
    if(!c.provenance.eventId)continue;
    const row=rows.find(r=>r.stateId===`${c.provenance.eventId}:${c.provenance.playId}`);
    assert.equal(c.provenance.checkpointHash,row.afterInputHash);
    if(row.after)for(const {label} of POLICIES)assert.equal(c.results[label].score,row.after[label].score);
    else assert.equal(c.results,null);
  }
  for(const id of ['R05','R21']) {
    const c=review.cases.find(c=>c.id===id);assert.match(c.reviewAudit.status,/excluded/);
    assert.deepEqual(c.public.situation,{});
    assert.equal(c.results['Phase 2'].live.sportImpact.competitiveFloor||0,0);
    assert.equal(c.results['live-owned-45-95'].trajectoryScoring.decisiveStrength,0);
  }
  for(const p of POLICIES)assert.ok(!pack.includes(p.label));
});
