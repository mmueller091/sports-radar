import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {CEILINGS,FORMULAS,legacyApproximateRescoreRow} from '../scripts/current-tension-calibration.mjs';
import {
  evaluateCheckpoint,highFidelityCheckpoints,prepareCheckpointEvaluation,
  evaluatePreparedCheckpoint,evaluatePreparedCheckpointPolicies,assertPreparedCheckpointUnchanged
} from '../scripts/shadow-candidate-report.mjs';

const require = createRequire(import.meta.url);
const shadow = require('../calibration/shadow-candidate.cjs');

test('calibration grid includes every required ceiling and weighting family', () => {
  assert.deepEqual(CEILINGS,[24,28,32,34,36,40]);
  assert.ok([24,28,32,36,40].every(ceiling => CEILINGS.includes(ceiling)));
  assert.deepEqual(
    FORMULAS.filter(item => item.kind === 'linear').map(item => item.marginWeight),
    [.30,.50,.60,.65,.70]
  );
  assert.ok(FORMULAS.some(item => item.kind === 'margin-modifier' && item.uncertaintyWeight === .35));
});

test('approved explicit policy exactly equals the implicit shadow default across component inputs', () => {
  assert.deepEqual(shadow.DEFAULT_CURRENT_TENSION_POLICY,{
    kind:'margin-modifier',uncertaintyWeight:.35,currentTensionCeiling:34
  });
  for (const margin of [0,.25,.65,1]) {
    for (const wp of [null,.05,.10,.50,.90,.95]) {
      for (const progress of [.25,.55,.75,.95]) {
        for (const uncertaintyCeiling of [.35,.82,1]) {
          const implicit = shadow.candidateComponents(margin,wp,uncertaintyCeiling,progress);
          const explicit = shadow.candidateComponents(
            margin,wp,uncertaintyCeiling,progress,shadow.DEFAULT_CURRENT_TENSION_POLICY
          );
          assert.deepEqual(explicit,implicit);
        }
      }
    }
  }
  assert.equal(shadow.candidateComponents(.7,.5,1,.9,{
    kind:'linear',marginWeight:.30
  }).currentTensionCeiling,24,'explicit linear fallback remains unchanged');
  assert.equal(shadow.candidateComponents(.7,.5,1,.9,{
    kind:'margin-modifier',uncertaintyWeight:.35
  }).currentTensionCeiling,24,'explicit modifier fallback remains unchanged');
});

test('margin-led modifiers are bounded, monotonic, and cannot create blowout tension', () => {
  for (const formula of FORMULAS.filter(item => item.kind === 'margin-modifier')) {
    const blowout = shadow.currentClosenessFor(0,1,formula);
    const falseClose = shadow.currentClosenessFor(1,.2,formula);
    const uncertain = shadow.currentClosenessFor(1,1,formula);
    assert.equal(blowout,0);
    assert.ok(falseClose > 0 && falseClose < uncertain);
    assert.equal(uncertain,1);
  }
});

test('legacy algebraic rescore is explicitly marked approximate and is not a calibration result', () => {
  const row = {
    uncertainty:.6,uncertaintyCeiling:.8,marginCloseness:.7,progress:.9,
    genericIndependentBaseScore:20,aggregationBonus:5,retainedLiveFloorScore:null,
    momentum:3,legacyRating:60,sportSituation:0,decisive:false
  };
  const rescored = legacyApproximateRescoreRow(row,FORMULAS[0],24);
  const components = shadow.candidateComponents(.7,.7,.8,.9,{
    kind:'linear',marginWeight:.30,currentTensionCeiling:24
  });
  assert.equal(rescored.currentTension,components.currentTensionPoints);
  assert.equal(rescored.genericLeverage,components.genericLeveragePoints);
  assert.equal(rescored.candidateRating,rescored.baseScore+5+3);
  assert.equal(rescored.approximate,true);
});

test('batched calibration exactly matches independent direct scoring across base-sensitive states', async () => {
  const fixtures = loadFixtures();
  const core = await loadCore();
  const cases = [
    ['NFL ordinary close','401872983','4018729833851'],
    ['NFL decisive late drive','401873002','4018730023915'],
    ['CFB ordinary close and restrictive ceiling','401858490','401858490648'],
    ['CFB late decisive','401858491','401858491644'],
    ['NHL ordinary without WP','401892519','401892519000004520'],
    ['NHL late one-goal competitive floor','401892520','401892520000000440']
  ];
  const policies = [
    {kind:'linear',marginWeight:.30,currentTensionCeiling:24},
    {kind:'margin-modifier',uncertaintyWeight:.35,currentTensionCeiling:34},
    {kind:'margin-modifier',uncertaintyWeight:.30,currentTensionCeiling:32}
  ];
  const approvedDefault = policies[1];
  const snapshot = row => ({
    currentCloseness:row.currentCloseness,effectiveUncertainty:row.effectiveUncertainty,
    currentTensionPoints:row.candidateCurrentTension,
    genericLeveragePoints:row.candidateGenericLeverage,
    baseScore:row.candidateBaseScore,sportSituation:row.sportSituation,
    pressure:row.sportPressure,competitiveFloor:row.competitiveFloor,
    decisiveFloor:row.decisiveFloor,aggregationBonus:row.aggregationBonus,
    liveBonus:row.candidateLiveBonus,momentum:row.momentum,
    finalRating:row.candidateRating
  });

  for (const [name,eventId,playId] of cases) {
    const fixture = fixtures.find(item => String(item.eventId) === eventId);
    const checkpoints = highFidelityCheckpoints(fixture);
    const index = checkpoints.findIndex(item => String(item.play.id) === playId);
    assert.ok(index >= 0,`${name}: checkpoint`);
    const prepared = prepareCheckpointEvaluation(core,fixture,checkpoints[index],index);
    const batched = evaluatePreparedCheckpointPolicies(prepared,policies,{verifyInputs:false});
    const independent = policies.map(policy =>
      evaluatePreparedCheckpoint(prepared,policy,{verifyInputs:false}));
    assert.deepEqual(batched.map(snapshot),independent.map(snapshot),name);
    assert.deepEqual(
      snapshot(evaluatePreparedCheckpoint(prepared,null,{verifyInputs:false})),
      snapshot(evaluatePreparedCheckpoint(prepared,approvedDefault,{verifyInputs:false})),
      `${name}: implicit approved default`
    );

    for (const [policyIndex,policy] of policies.entries()) {
      const row = batched[policyIndex];
      const context = {
        competition:checkpoints[index].competition,teams:prepared.game.teams,
        championship:prepared.game.championshipStakes,
        situation:checkpoints[index].competition?.situation,
        summary:checkpoints[index].summary
      };
      const state = shadow.candidateStateRating(
        core,prepared.game.openingScore,prepared.game.sport,'live',row.margin,row.progress,
        row.currentWp,context,prepared.game.openingFactors || [],policy
      );
      assert.deepEqual({
        currentCloseness:state.currentCloseness,
        effectiveUncertainty:state.effectiveUncertainty,
        currentTensionPoints:state.currentTensionPoints,
        genericLeveragePoints:state.genericLeveragePoints,
        baseScore:state.score
      },{
        currentCloseness:row.currentCloseness,
        effectiveUncertainty:row.effectiveUncertainty,
        currentTensionPoints:row.candidateCurrentTension,
        genericLeveragePoints:row.candidateGenericLeverage,
        baseScore:row.candidateBaseScore
      },`${name}: direct state ${policyIndex}`);
    }
    assertPreparedCheckpointUnchanged(prepared);
  }

  const noWp = cases.filter(([name]) => name.includes('NHL')).map(([,eventId,playId]) => {
    const fixture = fixtures.find(item => String(item.eventId) === eventId);
    const checkpoints = highFidelityCheckpoints(fixture);
    const index = checkpoints.findIndex(item => String(item.play.id) === playId);
    return evaluateCheckpoint(core,fixture,checkpoints[index],index,policies[1]);
  });
  assert.ok(noWp.every(row => row.currentWp === null));
  const restrictiveFixture = fixtures.find(item => String(item.eventId) === '401858490');
  const restrictiveCheckpoint = highFidelityCheckpoints(restrictiveFixture)
    .find(item => String(item.play.id) === '401858490648');
  assert.ok(evaluateCheckpoint(core,restrictiveFixture,restrictiveCheckpoint,0,policies[1])
    .uncertaintyCeiling < 1);
});

test('corrected calibration artifact records direct equivalence and corrected 65/35 distribution', () => {
  const result = JSON.parse(readFileSync(
    new URL('../calibration/output/current-tension-calibration.json',import.meta.url),'utf8'
  ));
  assert.deepEqual(result.directEquivalence,{
    exact:true,mismatches:0,states:24562,configuration:'modifier-65-35-c34',
    comparedComponents:[
      'effectiveUncertainty','currentCloseness','currentTensionPoints',
      'genericLeveragePoints','baseScore','sportSituation','pressure','competitiveFloor',
      'decisiveFloor','aggregationBonus','liveBonus','momentum','candidateRating'
    ]
  });
  assert.deepEqual(result.historicalApproximate65_35_c34,{
    mean:52.52,median:56,
    bands:{'<50':34.68,'50-69':53.19,'70-84':6.29,'85+':5.84}
  });
  const corrected = result.corrected65_35_c34;
  assert.equal(corrected.meanCandidate,52.09);
  assert.equal(corrected.medianCandidate,56);
  assert.deepEqual(Object.fromEntries(Object.entries(corrected.bands)
    .map(([name,value]) => [name,value.percentage])),{
    '<50':34.69,'50-69':53.51,'70-84':7.74,'85+':4.06
  });
  assert.deepEqual(Object.fromEntries(Object.entries(corrected.thresholds)
    .map(([name,value]) => [name,value.count])),{
    '50':16042,'70':2899,'80':1454,'85':997,'90':734
  });
  assert.deepEqual(result.invariants.shadowDefaultPolicy,{
    kind:'margin-modifier',uncertaintyWeight:.35,currentTensionCeiling:34
  });
  const preferred = result.configurations.find(item => item.id === 'modifier-65-35-c34');
  assert.deepEqual(Object.fromEntries(Object.entries(preferred.anchors)
    .map(([name,value]) => [name,value.candidateRating])),{
    requiredCFB:50,
    closeCFB5050:86,
    nflCloseOneSided:59,
    nflLateUncertain:74,
    decisiveNFLDrive:90,
    blowout:1,
    strongEarly:75,
    ordinaryCloseEarly:59
  });
  assert.equal(result.recommendation.preferred.formulaId,'modifier-65-35');
  assert.equal(result.recommendation.preferred.ceiling,34);
});
