// Frozen historical reproduction; corrected evaluation lives in replay-input-comparison.mjs.
import {highFidelityCheckpoints} from '../scripts/replay-inputs.historical.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {focusedHistories,historicalWpThinning} from '../calibration/trajectory-checkpoint-fixtures.mjs';
import {evaluateInput,POLICIES,buildReviewPack,renderReviewerPack} from '../scripts/trajectory-review-pack.mjs';
import {prepareCheckpointEvaluation} from '../scripts/shadow-candidate-report.mjs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),core=await loadCore();
const shadow=require('../calibration/shadow-candidate.cjs');
const oracle=require('./helpers/phase31-oracle.cjs');
const key=JSON.parse(readFileSync(new URL('../calibration/trajectory-diagnostic-key.json',import.meta.url)));

test('new paired histories are unsaturated under every frozen comparison policy and preserve current inputs',()=>{
  for(const [group,pair] of Object.entries(focusedHistories())) {
    assert.deepEqual(pair[0].competition,pair[1].competition,group);
    assert.deepEqual(pair[0].summary.plays.at(-1),pair[1].summary.plays.at(-1));
    assert.deepEqual(pair[0].summary.winprobability.at(-1),pair[1].summary.winprobability.at(-1));
    const [a,b]=pair.map(input=>evaluateInput(core,input));
    for(const {label} of POLICIES) {
      assert.deepEqual(a[label].state,b[label].state);
      assert.deepEqual(a[label].live,b[label].live);
      for(const r of [a[label],b[label]]) {
        assert.ok(r.preClampTotal<98.5,`${group} ${label} total ${r.preClampTotal}`);
        assert.ok(r.score<99);
        assert.equal(r.score,Math.round(r.preClampTotal));
      }
    }
    for(const {label} of POLICIES.slice(3)) {
      if(group==='decisive') {
        assert.equal(b[label].trajectoryScoring.decisiveStrength,1);
        assert.equal(b[label].trajectoryScoring.negativeMultiplier,.25);
        assert.equal(b[label].trajectoryScoring.adjustment,-2);
        assert.ok(b[label].score>=b[label].trajectoryScoring.protectedRating);
        assert.deepEqual(b[label].historyOwnership.eventFactors,[{label:'Erased a large deficit',points:6}]);
      }
      if(group==='ordinary') assert.equal(b[label].trajectoryScoring.adjustment,-8);
      if(group==='capacity') {
        assert.equal(a[label].momentumPoints,0);
        assert.ok(a[label].trajectoryScoring.positiveAfterHistoryCaps>0);
        assert.equal(b[label].momentumPoints,15);
        assert.ok(b[label].trajectoryScoring.requestedPositive>0);
        assert.equal(b[label].trajectoryScoring.positiveAfterHistoryCaps,0);
      }
    }
  }
});

test('historical thinning preserves the same valid current observation and all raw current-state scoring',()=>{
  const variants=historicalWpThinning(),full=evaluateInput(core,variants.full);
  for(const input of Object.values(variants)) {
    assert.deepEqual(input.summary.plays,variants.full.summary.plays);
    assert.deepEqual(input.summary.winprobability.at(-1),variants.full.summary.winprobability.at(-1));
    const results=evaluateInput(core,input);
    for(const {label} of POLICIES) {
      assert.equal(results[label].currentWinProbability,.8);
      assert.deepEqual(results[label].state,full[label].state);
      assert.deepEqual(results[label].live,full[label].live);
      assert.equal(results[label].currentTensionPoints,full[label].currentTensionPoints);
      assert.equal(results[label].genericLeveragePoints,full[label].genericLeveragePoints);
    }
  }
  const results=key.historicalWpThinning.results;
  const p='live-owned-45-95';
  assert.equal(results.currentOnly[p].trajectoryScoring.positiveWpConfidence,.65);
  assert.equal(results.full[p].trajectoryScoring.positiveWpConfidence,1);
  assert.equal(results.internalSamplesRemoved[p].trajectory.wpCoverageShare,1);
  assert.match(key.historicalWpThinning.limitation,/does not establish observed coverage/);
  assert.equal(key.missingCurrentWpComparison.results.missing[p].currentWinProbability,null);
});

test('blind pack is reproducible, bounded, blank and contains no diagnostic output or retrospective prose',async()=>{
  const regenerated=await buildReviewPack();
  assert.deepEqual(regenerated,key);
  const text=readFileSync(new URL('../calibration/trajectory-reviewer-pack.md',import.meta.url),'utf8');
  assert.equal(renderReviewerPack(key),text);
  assert.equal(key.counts.total,22);
  assert.equal(key.counts.archived,18);
  assert.equal(key.counts.distinctArchivedGames,17);
  assert.equal(key.counts.synthetic,4);
  const counts=Map.groupBy(key.cases.filter(c=>c.provenance.eventId),c=>c.provenance.eventId);
  assert.ok([...counts.values()].every(g=>g.length<=2));
  assert.ok(!/live-owned|gate-\d|Phase 2|slow-evidence|genuineContinuity|false.close|candidateRating|won the game|eventual|final score/i.test(text));
  for(const c of key.cases) {
    assert.deepEqual(c.public.answers,{switchNow:'',urgencyTier:'',matchedPreference:'',evidence:''});
    assert.ok(!JSON.stringify(c.public).includes('nextPlayScoring'));
    assert.equal(c.provenance.samplingIsGroundTruth,false);
  }
  assert.deepEqual(key.policyProvenance.map(x=>x.label),POLICIES.map(x=>x.label));
});

test('archived review outputs use only their reconstructed checkpoint and retain frozen off parity',()=>{
  const fixtures=loadFixtures(),cache=new Map();
  for(const c of key.cases.filter(c=>c.provenance.eventId)) {
    const p=c.provenance,f=fixtures.find(f=>String(f.eventId)===p.eventId);
    let cps=cache.get(p.eventId);if(!cps){cps=highFidelityCheckpoints(f);cache.set(p.eventId,cps);}
    const cp=cps[p.index];
    assert.equal(String(cp.play.id),p.playId);
    assert.deepEqual(cp.summary.plays.map(p=>String(p.id)),p.acceptedPlayIds);
    const prepared=prepareCheckpointEvaluation(core,f,cp,p.index);
    const off=shadow.candidateGameRating(core,prepared.game,cp.competition,cp.summary);
    assert.deepEqual(off,oracle.candidateGameRating(core,prepared.game,cp.competition,cp.summary));
    for(const {label,policy} of POLICIES) {
      const direct=shadow.candidateGameRating(core,prepared.game,cp.competition,cp.summary,null,policy);
      assert.equal(direct.score,c.results[label].score);
      assert.deepEqual(direct.trajectoryScoring,c.results[label].trajectoryScoring);
    }
  }
  const disagreement=key.cases.filter(c=>Math.abs(c.results['live-owned-35-85'].score-c.results['live-owned-45-95'].score)>=2);
  assert.ok(disagreement.filter(c=>c.provenance.eventId).length>=2);
  assert.ok(key.cases.some(c=>c.provenance.eventId&&c.results['live-owned-45-95'].trajectoryScoring.requestedPositive>0&&c.results['live-owned-45-95'].trajectoryScoring.positiveAfterHistoryCaps===0));
});
