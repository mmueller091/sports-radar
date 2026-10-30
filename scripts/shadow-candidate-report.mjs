import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {
  loadCore,loadFixtures,readJson,contextOverridesPath,applyContextOverride
} from '../calibration/helpers.mjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

const require = createRequire(import.meta.url);
const shadow = require('../calibration/shadow-candidate.cjs');
import {statusFor,periodFor,availableFields} from './replay-inputs.historical.mjs';
import {highFidelityCheckpoints} from './replay-inputs.mjs';
export {highFidelityCheckpoints};
const overrides = readJson(contextOverridesPath,{events:{}});
const EXPECTED_SPORTS = ['CFB','MLB','NBA','NCAAB','NFL','NHL','Soccer','Tennis'];
const GENERIC_LABELS = new Set([
  'Score closeness and leverage','Outcome uncertainty and score closeness','Late-game leverage'
]);

const clone = value => structuredClone(value);
const has = (object,key) => Object.prototype.hasOwnProperty.call(object || {},key);
const mean = values => values.length ? values.reduce((sum,value) => sum+value,0)/values.length : null;
const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length/2);
  return sorted.length%2 ? sorted[middle] : (sorted[middle-1]+sorted[middle])/2;
};
const round = value => value === null ? null : Math.round(value*100)/100;
const numeric = value => value != null && value !== '' && Number.isFinite(Number(value));

export function scoringStateCheckpoints(fixture) {
  const sourceEvent = fixture.event || {};
  const sourceCompetition = sourceEvent.competitions?.[0];
  const sourceSummary = fixture.summary || {};
  const plays = sourceSummary.scoringPlays?.length
    ? sourceSummary.scoringPlays
    : (sourceSummary.plays || []).filter(play => play.scoringPlay === true);
  if (!sourceCompetition || !plays.length) return [];
  const acceptedPlays = [];
  const acceptedWp = [];
  const wpByPlay = new Map((sourceSummary.winprobability || [])
    .filter(item => item.playId != null)
    .map(item => [String(item.playId),item]));
  const checkpoints = [];
  for (const play of plays) {
    if (!periodFor(play) || !Number.isFinite(Number(play.homeScore)) ||
      !Number.isFinite(Number(play.awayScore))) continue;
    acceptedPlays.push(play);
    const wp = wpByPlay.get(String(play.id));
    if (wp) acceptedWp.push(wp);
    const competition = {
      ...sourceCompetition,
      competitors:(sourceCompetition.competitors || []).map(competitor => ({...competitor}))
    };
    competition.status = statusFor(fixture.modelSport,play);
    competition.situation = {};
    for (const competitor of competition.competitors || []) {
      competitor.score = String(competitor.homeAway === 'home' ? play.homeScore : play.awayScore);
    }
    const injected = applyContextOverride(
      sourceEvent,competition,String(fixture.eventId || sourceEvent.id || ''),overrides
    );
    const event = {...injected.event,competitions:[injected.competition]};
    const summary = {
      header:{...(sourceSummary.header || {}),competitions:[injected.competition]},
      plays:acceptedPlays.slice(),
      scoringPlays:acceptedPlays.slice(),
      winprobability:acceptedWp.slice()
    };
    checkpoints.push({
      view:'generic-scoring-state',event,competition:injected.competition,summary,play,
      nextPlayScoring:false,fullStreamAvailable:false,
      wpSourceAvailable:Boolean(sourceSummary.winprobability?.length),
      wpHistoryPositioned:true,latestWpPositioned:Boolean(wp),
      availableSituationFields:availableFields(injected.competition,summary),
      sportSpecificSituationUsable:false
    });
  }
  return checkpoints;
}

function scoreObject(competition) {
  return Object.fromEntries((competition.competitors || [])
    .filter(item => item.homeAway)
    .map(item => [item.homeAway,Number(item.score)]));
}

export function prepareCheckpointEvaluation(core,fixture,checkpoint,index) {
  const inputBefore = JSON.stringify([checkpoint.event,checkpoint.competition,checkpoint.summary]);
  const game = normalizeEvent(checkpoint.event,fixture.modelSport);
  if (!game) return null;
  enrichGame(game,checkpoint.summary);
  assert.equal(game.sourceCompetition,checkpoint.competition,'Legacy competition must be the reconstructed input');
  assert.equal(JSON.stringify([checkpoint.event,checkpoint.competition,checkpoint.summary]),inputBefore,
    'Legacy evaluation mutated replay inputs');
  return {core,fixture,checkpoint,index,inputBefore,game};
}

export function assertPreparedCheckpointUnchanged(prepared) {
  const {checkpoint,inputBefore} = prepared;
  assert.equal(JSON.stringify([checkpoint.event,checkpoint.competition,checkpoint.summary]),inputBefore,
    'Candidate evaluation mutated replay inputs');
}

function rowForCandidate(prepared,candidate) {
  const {core,fixture,checkpoint,index,game} = prepared;
  const legacyGeneric = (game.factors || [])
    .filter(factor => GENERIC_LABELS.has(factor.label))
    .map(factor => ({label:factor.label,points:factor.points}));
  const trajectory = candidate.trajectory || {};
  const aggregation = candidate.live?.aggregation || {};
  const sportImpact = candidate.live?.sportImpact || {};
  const currentWpPositioned = checkpoint.latestWpPositioned && candidate.currentWinProbability !== null;
  const fidelity = checkpoint.view === 'generic-scoring-state'
    ? 'generic'
    : !checkpoint.fullStreamAvailable ? 'generic'
    : checkpoint.sportSpecificSituationUsable && !checkpoint.missingSituationFields?.length &&
      (!checkpoint.wpSourceAvailable || currentWpPositioned) ? 'full' : 'partial';
  const decisive = Boolean(
    aggregation.driveFloor > 0 || aggregation.decisiveFloor > 0 ||
    sportImpact.decisiveDrive || sportImpact.finalPossession || sportImpact.competitiveFloor > 0
  );
  return {
    view:checkpoint.view,
    sport:fixture.modelSport,
    eventId:String(fixture.eventId || fixture.event?.id || ''),
    stateId:`${fixture.eventId || fixture.event?.id}:${checkpoint.play.id || index}`,
    playId:String(checkpoint.play.id || index),
    playText:checkpoint.play.text || checkpoint.play.type?.text || '',
    scoringPlay:checkpoint.play.scoringPlay === true,
    nextPlayScoring:checkpoint.nextPlayScoring,
    progress:candidate.progress,
    score:scoreObject(checkpoint.competition),
    margin:candidate.gap,
    currentWp:candidate.currentWinProbability,
    trajectory:{...trajectory},
    trajectoryScoring:candidate.trajectoryScoring,
    legacyRating:game.score,
    candidateRating:candidate.score,
    candidateBaseScore:candidate.baseScore,
    candidateLiveBonus:candidate.liveBonus,
    aggregationBonus:candidate.live?.aggregation?.bonus || 0,
    retainedLiveFloorScore:candidate.liveBonus > (candidate.live?.aggregation?.bonus || 0)
      ? candidate.baseScore+candidate.liveBonus
      : null,
    genericIndependentBaseScore:candidate.factors.reduce((sum,factor) =>
      sum+Number(factor.points || 0),0)-candidate.currentTensionPoints-candidate.genericLeveragePoints,
    delta:candidate.score-game.score,
    legacyGenericTimePoints:legacyGeneric.reduce((sum,factor) => sum+Number(factor.points || 0),0),
    legacyGenericTime:legacyGeneric,
    candidateCurrentTension:candidate.currentTensionPoints,
    candidateGenericLeverage:candidate.genericLeveragePoints,
    marginCloseness:candidate.state?.marginCloseness ?? null,
    uncertainty:candidate.state?.uncertainty ?? null,
    uncertaintyCeiling:candidate.state?.uncertaintyCeiling ?? null,
    effectiveUncertainty:candidate.state?.effectiveUncertainty ?? null,
    currentCloseness:candidate.state?.currentCloseness ?? null,
    sportSituation:candidate.live?.components?.situation || 0,
    sportPressure:candidate.live?.components?.pressure || 0,
    momentum:candidate.momentumPoints || 0,
    decisiveFloor:aggregation.decisiveFloor || 0,
    driveFloor:aggregation.driveFloor || 0,
    competitiveFloor:sportImpact.competitiveFloor || 0,
    decisiveDrive:Boolean(sportImpact.decisiveDrive),
    finalPossession:Boolean(sportImpact.finalPossession),
    manpower:sportImpact.manpower || null,
    decisive,
    situation:clone(checkpoint.competition.situation || {}),
    fidelity,
    fidelityLimitations:[...(checkpoint.missingSituationFields || []),
      ...(!checkpoint.fullStreamAvailable ? ['scoring-only stream'] : []),
      ...(checkpoint.wpSourceAvailable && !currentWpPositioned ? ['no valid positioned current WP'] : [])],
    unpositionedWpExcluded:checkpoint.unpositionedWpExcluded || 0,
    availableSituationFields:checkpoint.availableSituationFields,
    currentWpPositioned,
    wpHistoryPositioned:checkpoint.wpHistoryPositioned,
    sportSpecificSituationUsable:checkpoint.sportSpecificSituationUsable,
    inputsIdentical:true
  };
}

export function evaluatePreparedCheckpoint(prepared,policy=null,{verifyInputs=true}={}) {
  const {core,checkpoint,game} = prepared;
  const candidate = shadow.candidateGameRating(
    core,game,checkpoint.competition,checkpoint.summary,policy
  );
  if (verifyInputs) assertPreparedCheckpointUnchanged(prepared);
  return rowForCandidate(prepared,candidate);
}

export function evaluatePreparedCheckpointPolicies(prepared,policies,{verifyInputs=true}={}) {
  const {core,checkpoint,game} = prepared;
  const candidates = shadow.candidateGameRatings(
    core,game,checkpoint.competition,checkpoint.summary,policies
  );
  if (verifyInputs) assertPreparedCheckpointUnchanged(prepared);
  return candidates.map(candidate => rowForCandidate(prepared,candidate));
}

export function evaluatePreparedCheckpointTrajectories(prepared,policies,{verifyInputs=true}={}) {
  const {core,checkpoint,game} = prepared;
  const candidates = shadow.candidateTrajectoryRatings(core,game,checkpoint.competition,checkpoint.summary,policies);
  if (verifyInputs) assertPreparedCheckpointUnchanged(prepared);
  return candidates.map(candidate => rowForCandidate(prepared,candidate));
}

export function evaluateCheckpoint(core,fixture,checkpoint,index,policy=null) {
  const prepared = prepareCheckpointEvaluation(core,fixture,checkpoint,index);
  return prepared ? evaluatePreparedCheckpoint(prepared,policy) : null;
}

function groupStats(items) {
  const deltas = items.map(row => row.delta);
  const legacy = items.map(row => row.legacyRating);
  const candidate = items.map(row => row.candidateRating);
  return {
    count:items.length,
    meanLegacyRating:round(mean(legacy)),medianLegacyRating:round(median(legacy)),
    meanCandidateRating:round(mean(candidate)),medianCandidateRating:round(median(candidate)),
    meanDelta:round(mean(deltas)),medianDelta:round(median(deltas)),
    minDelta:deltas.length ? Math.min(...deltas) : null,
    maxDelta:deltas.length ? Math.max(...deltas) : null,
    thresholdMovement:thresholdMovement(items)
  };
}

function thresholdMovement(rows) {
  return Object.fromEntries([70,80,85,90].map(threshold => [threshold,{
    legacyAtOrAboveCandidateBelow:rows.filter(row =>
      row.legacyRating >= threshold && row.candidateRating < threshold).length,
    legacyBelowCandidateAtOrAbove:rows.filter(row =>
      row.legacyRating < threshold && row.candidateRating >= threshold).length
  }]));
}

function diagnostic(row) {
  return {
    sport:row.sport,stateId:row.stateId,progress:row.progress,score:row.score,margin:row.margin,
    legacyRating:row.legacyRating,candidateRating:row.candidateRating,delta:row.delta,
    currentWp:row.currentWp,legacyGenericTimePoints:row.legacyGenericTimePoints,
    legacyGenericTime:row.legacyGenericTime,candidateCurrentTension:row.candidateCurrentTension,
    candidateGenericLeverage:row.candidateGenericLeverage,sportSituation:row.sportSituation,
    sportPressure:row.sportPressure,decisiveFloor:row.decisiveFloor,driveFloor:row.driveFloor,
    competitiveFloor:row.competitiveFloor,
    fidelity:row.fidelity,availableSituationFields:row.availableSituationFields,
    fidelityLimitations:row.fidelityLimitations,
    currentWpPositioned:row.currentWpPositioned,
    sportSpecificSituationUsable:row.sportSpecificSituationUsable,
    situation:row.situation,
    diagnosis:row.fidelity === 'full'
      ? 'A-consistent: core situation inputs are present; generic-award removal can explain a drop, but this is not causal proof'
      : 'B-risk: replay is missing current sport-specific and/or positioned WP data; do not tune from this state alone'
  };
}

function example(rows,predicate,unavailableReason) {
  const row = rows.find(predicate);
  return row ? {
    available:true,stateId:row.stateId,sport:row.sport,progress:row.progress,
    situation:row.situation,sportSituation:row.sportSituation,decisiveFloor:row.decisiveFloor,
    fidelity:row.fidelity
  } : {available:false,reason:unavailableReason};
}

function regressionExamples(rows) {
  return {
    nflActiveLateDriveBeforeScore:example(rows,row =>
      row.sport === 'NFL' && !row.scoringPlay && row.nextPlayScoring && row.decisiveDrive,
    'No NFL fixture checkpoint combined a non-scoring decisive drive with the next play scoring.'),
    footballFourthDown:example(rows,row =>
      ['NFL','CFB'].includes(row.sport) && Number(row.situation.down) === 4,
    'No football fourth-down state was present.'),
    basketballPotentialFinalPossession:example(rows,row =>
      ['NBA','NCAAB'].includes(row.sport) && row.finalPossession,
    'Insufficient archive coverage: no captured basketball checkpoint establishes a potential tying/winning final possession; no possession is fabricated.'),
    mlbRunnersAndOuts:example(rows,row =>
      row.sport === 'MLB' && Number.isInteger(Number(row.situation.outs)) &&
      (row.situation.onFirst || row.situation.onSecond || row.situation.onThird),
    'No MLB runner/outs state was present.'),
    nhlSpecificOnIceLeverage:example(rows,row =>
      row.sport === 'NHL' && row.sportSpecificSituationUsable &&
      (row.manpower?.pulled || row.manpower?.powerPlay || row.manpower?.advantage > 0),
    'Unavailable: fixtures retain play strength but only a final onIce snapshot; historical skaters/goalie state cannot be causally positioned without fabrication.')
  };
}

function coverage(rows,fixtures) {
  return Object.fromEntries(EXPECTED_SPORTS.map(sport => {
    const sportRows = rows.filter(row => row.sport === sport);
    const games = new Set(sportRows.map(row => row.eventId)).size;
    const fixtureGames = new Set(fixtures.filter(fixture => fixture.modelSport === sport)
      .map(fixture => String(fixture.eventId || fixture.event?.id || ''))).size;
    const fullStates = sportRows.filter(row => row.fidelity === 'full').length;
    const insufficient = games < 5 || sportRows.length < 30 || fullStates < 30;
    return [sport,{
      games,fixtureGames,states:sportRows.length,fullStates,insufficient,
      warning:insufficient
        ? 'Insufficient independent games, states, or full-fidelity situation coverage; do not draw tuning conclusions.'
        : null
    }];
  }));
}

export function summarizeRows(rows,fixtures=[]) {
  const progressBuckets = [
    ['0-25%',0,.25],['25-50%',.25,.50],['50-75%',.50,.75],
    ['75-90%',.75,.90],['90%+',.90,Infinity]
  ].map(([name,min,max]) => [name,groupStats(rows.filter(row => row.progress >= min && row.progress < max))]);
  const sports = EXPECTED_SPORTS.map(sport => [sport,groupStats(rows.filter(row => row.sport === sport))]);
  const fidelityBuckets = ['full','partial','generic']
    .map(fidelity => [fidelity,groupStats(rows.filter(row => row.fidelity === fidelity))]);
  const ordered = [...rows].sort((a,b) => b.delta-a.delta);
  return {
    totalStates:rows.length,
    ...groupStats(rows),
    progressBuckets:Object.fromEntries(progressBuckets),
    sports:Object.fromEntries(sports),
    fidelityBuckets:Object.fromEntries(fidelityBuckets),
    groups:{
      neutralStates:groupStats(rows.filter(row => row.sportSituation <= 0 && !row.decisive)),
      specificLeverageStates:groupStats(rows.filter(row => row.sportSituation > 0)),
      decisiveStates:groupStats(rows.filter(row => row.decisive))
    },
    thresholdMovement:thresholdMovement(rows),
    largestIncreases:ordered.filter(row => row.delta > 0).slice(0,10).map(row => ({
      sport:row.sport,stateId:row.stateId,progress:row.progress,
      legacyRating:row.legacyRating,candidateRating:row.candidateRating,delta:row.delta,
      fidelity:row.fidelity
    })),
    largestDecreases:ordered.filter(row => row.delta < 0).slice(-10).reverse().map(diagnostic),
    regressionExamples:regressionExamples(rows),
    coverage:coverage(rows,fixtures)
  };
}

export async function buildReplayReport(fixtures=loadFixtures(),core=null) {
  core ||= await loadCore();
  const primaryRows = [];
  const genericRows = [];
  for (const fixture of fixtures) {
    highFidelityCheckpoints(fixture).forEach((checkpoint,index) => {
      const row = evaluateCheckpoint(core,fixture,checkpoint,index);
      if (row) primaryRows.push(row);
    });
    scoringStateCheckpoints(fixture).forEach((checkpoint,index) => {
      const row = evaluateCheckpoint(core,fixture,checkpoint,index);
      if (row) genericRows.push(row);
    });
  }
  return {
    reportVersion:3,
    methodology:{
      fidelity:'full = full stream, core sport inputs and valid positioned WP when provided; partial = missing core inputs/WP; generic = scoring-only stream. Full does not certify all live information.',
      limitations:['Football timeout balances are unavailable unless explicitly captured; no balances are inferred from timeout events.',
        'MLB sparse bases use the captured at-bat schema; provider outs/count values are replayed as recorded, including retrospective inconsistencies.',
        'Only checkpoint-local basketball control events establish possession; shot/foul team IDs do not.',
        'NHL play strength cannot establish historical skater counts or goalie presence.',
        'Static context/records are retained from the fixture; final statistics, line scores, winners and current-drive outcomes are excluded from the primary view.'],
      coverageRule:'At least 5 replayed games, 30 states and 30 full states; a warning heuristic, not statistical sufficiency.',
      groups:'Specific and decisive groups may overlap. Neutral means no observed situation award or decisive condition; partial neutral states may hide unobserved leverage.',
      weighting:'Checkpoint-weighted; consecutive states from one game are correlated, not independent observations.'
    },
    primaryCalibrationView:{
      name:'high-fidelity chronological replay',
      summary:summarizeRows(primaryRows,fixtures),rows:primaryRows
    },
    genericScoringStateView:{
      name:'generic scoring-state comparison',
      purpose:'Measures removal of generic time inflation using the legacy scoring-play-only replay.',
      summary:summarizeRows(genericRows,fixtures),rows:genericRows
    }
  };
}

async function main() {
  const report = await buildReplayReport();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report,null,2));
    return;
  }
  console.log('SHADOW CANDIDATE PROVIDER-FIXTURE REPLAY');
  console.log(JSON.stringify({
    primaryCalibrationView:report.primaryCalibrationView.summary,
    genericScoringStateView:report.genericScoringStateView.summary
  },null,2));
  if (!process.argv.includes('--summary')) {
    console.log('\nHIGH-FIDELITY EVALUATED STATES');
    for (const row of report.primaryCalibrationView.rows) console.log(JSON.stringify(row));
    console.log('\nGENERIC SCORING-STATE EVALUATED STATES');
    for (const row of report.genericScoringStateView.rows) console.log(JSON.stringify(row));
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invoked) await main();
