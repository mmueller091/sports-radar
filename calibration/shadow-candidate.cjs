const {cfbImmediateTension} = require('../scoring/sports/cfb.js');
/*
 * Authoritative candidate scoring, explicitly selected by scoring/live-runtime.
 * It replaces only generic live closeness/time/WP awards and reuses the
 * production sport models, context behavior, penalties, and live aggregation.
 * Original explicit Phase 3 policies add trajectory at final aggregation.
 * Explicit Phase 3.1 policies replace sustained history before history caps;
 * the implicit shadow default remains Phase 2 with trajectory disabled.
 */
const {SPORT_MODELS,analyzeTrajectory} = require('../scoring/models.js');
const {aggregateLiveBonus} = require('../scoring/shared/pressure.js');
const {eventShockFor} = require('../scoring/shared/events.js');
const {hockeyLiveTiming,hockeyPlayClockMode} = require('../scoring/sports/nhl.js');
const {trajectoryAdjustment} = require('./trajectory-policy.cjs');
const {liveTrajectory,endgameFloorBudget,cfbContextRetention} = require('./trajectory-live-policy.cjs');

const DEFAULT_CURRENT_TENSION_POLICY = Object.freeze({
  kind:'margin-modifier',
  uncertaintyWeight:.35,
  currentTensionCeiling:34
});
const CURRENT_TENSION_CEILING = DEFAULT_CURRENT_TENSION_POLICY.currentTensionCeiling;
const PARAMETERIZED_CURRENT_TENSION_CEILING = 24;
const GENERIC_LEVERAGE_CAP = 8;
const GENERIC_LEVERAGE_START = .55;
const GENERIC_LEVERAGE_SPAN = .40;

const unit = value => Math.max(0,Math.min(1,Number(value) || 0));

function currentClosenessFor(marginCloseness,effectiveUncertainty,policy=null) {
  const margin = unit(marginCloseness);
  const appliedPolicy = policy ?? DEFAULT_CURRENT_TENSION_POLICY;
  if (appliedPolicy.kind === 'linear') {
    const marginWeight = appliedPolicy.marginWeight ?? .30;
    return unit(marginWeight)*margin+(1-unit(marginWeight))*effectiveUncertainty;
  }
  if (appliedPolicy.kind === 'margin-modifier') {
    const uncertaintyWeight = unit(appliedPolicy.uncertaintyWeight ?? .35);
    return margin*((1-uncertaintyWeight)+uncertaintyWeight*effectiveUncertainty);
  }
  throw new Error(`Unsupported Current Tension policy kind: ${appliedPolicy.kind}`);
}

function candidateComponents(
  marginCloseness,currentWinProbability,uncertaintyCeiling=1,progress=0,policy=null
) {
  const probability = currentWinProbability === null ? null : Number(currentWinProbability);
  const uncertainty = probability === null || !Number.isFinite(probability)
    ? null
    : unit(1-2*Math.abs(probability-.5));
  const effectiveUncertainty = uncertainty === null
    ? null
    : Math.min(uncertainty,unit(uncertaintyCeiling));
  const currentCloseness = uncertainty === null
    ? unit(marginCloseness)
    : currentClosenessFor(marginCloseness,effectiveUncertainty,policy);
  const x = unit((unit(progress)-GENERIC_LEVERAGE_START)/GENERIC_LEVERAGE_SPAN);
  const urgency = x*x*(3-2*x);
  const appliedPolicy = policy ?? DEFAULT_CURRENT_TENSION_POLICY;
  const currentTensionCeiling = Number.isFinite(Number(appliedPolicy.currentTensionCeiling))
    ? Math.max(0,Number(appliedPolicy.currentTensionCeiling))
    : PARAMETERIZED_CURRENT_TENSION_CEILING;
  return {
    marginCloseness:unit(marginCloseness),
    currentWinProbability:probability,
    uncertainty,
    uncertaintyCeiling:unit(uncertaintyCeiling),
    effectiveUncertainty,
    currentCloseness,
    currentTensionCeiling,
    currentTensionPoints:Math.round(currentTensionCeiling*currentCloseness),
    genericLeverageUrgency:urgency,
    genericLeveragePoints:Math.round(GENERIC_LEVERAGE_CAP*urgency*currentCloseness)
  };
}

function validateCurrentWinProbability(core,summary,progress,state='live',sport='') {
  if (!summary) return {points:0,text:'',probability:null,uncertainty:null};
  return core.winProbabilityImpact(summary,progress,state,sport);
}

function candidateStateRating(
  core,
  openingScore,
  sport,
  gameState,
  gap,
  progress,
  homeWinProbability=null,
  context=null,
  openingFactors=[],
  policy=null
) {
  const legacy = core.stateRating(
    openingScore,sport,gameState,gap,progress,homeWinProbability,context,openingFactors
  );
  if (gameState !== 'live') {
    return {
      ...legacy,
      policy:'legacy-non-live',
      currentTensionPoints:legacy.closePoints,
      genericLeveragePoints:0,
      currentCloseness:null,
      marginCloseness:null,
      currentWinProbability:null
    };
  }

  const closeLimit = core.CLOSE_MARGIN[sport] || 10;
  const modelState = SPORT_MODELS[sport]?.gameState?.({
    sport,gameState,gap,progress,context,closeLimit
  }) || {};
  const completedCloseLimit = modelState.completedCloseLimit ?? closeLimit;
  const marginCloseness = gap === null
    ? 0
    : modelState.marginClose ?? Math.max(0,1-gap/completedCloseLimit);
  const probability = core.normalizeWinProbability(homeWinProbability);
  const candidate = candidateComponents(
    marginCloseness,
    probability,
    modelState.uncertaintyCeiling ?? 1,
    progress,
    policy
  );

  if (sport==='CFB' && policy?.cfbImmediateTension && Number(context?.competition?.status?.period || 0)<=4) {
    const immediateMargin=cfbImmediateTension(gap,candidate.marginCloseness);
    const immediate=candidateComponents(immediateMargin,probability,modelState.uncertaintyCeiling ?? 1,progress,policy);
    candidate.immediateTensionMargin=immediateMargin;
    candidate.currentTensionPoints=immediate.currentTensionPoints;
  }

  const genericLabels = new Set([
    'Score closeness and leverage',
    'Outcome uncertainty and score closeness',
    'Late-game leverage'
  ]);
  const factors = [];
  let inserted = false;
  const insertCandidate = () => {
    if (inserted) return;
    inserted = true;
    if (candidate.currentTensionPoints) {
      factors.push({label:'Current Tension',points:candidate.currentTensionPoints});
    }
    if (candidate.genericLeveragePoints) {
      factors.push({label:'Generic Leverage',points:candidate.genericLeveragePoints});
    }
  };
  for (const factor of legacy.factors) {
    if (genericLabels.has(factor.label)) {
      insertCandidate();
      continue;
    }
    if (!inserted && ['Limited comeback runway','Wide margin'].includes(factor.label)) {
      insertCandidate();
    }
    factors.push({...factor});
  }
  insertCandidate();

  return {
    ...legacy,
    ...candidate,
    policy:'shadow-candidate-v1',
    score:core.clampScore(factors.reduce((sum,factor) => sum+factor.points,0)),
    factors,
    closePoints:candidate.currentTensionPoints,
    phasePoints:0
  };
}

function candidateLiveSnapshot(core,game,competition,summary,floorBudget=null,nhlAllocation=null) {
  const status = competition?.status || game.liveRawStatus;
  const situation = competition?.situation || game.liveRawSituation || {};
  const progress = core.gameProgress(game.sport,{...competition,status});
  const scoreGap = Math.abs(Number(game.teams?.[0]?.[2])-Number(game.teams?.[1]?.[2]));
  const sportImpact = SPORT_MODELS[game.sport]?.situation?.({
    game:floorBudget===null ? game : {...game,baseScore:floorBudget.floorBaseScore},
    competition,summary,status,situation,progress,scoreGap,nhlAllocation
  }) || {points:0,note:'',reasons:[],bases:null};
  if (floorBudget) sportImpact.competitiveFloor=Math.min(floorBudget.originalFloor,sportImpact.competitiveFloor);
  const legacy = core.liveSnapshot(game,competition,summary);
  const probabilityTelemetry = validateCurrentWinProbability(core,summary,progress,'live',game.sport);
  const components = {
    ...legacy.components,
    probability:0,
    situation:Math.min(12,Math.max(0,Number(sportImpact.candidatePoints ?? sportImpact.points) || 0))
  };
  if (nhlAllocation && game.sport==='NHL') {
    components.pressure=SPORT_MODELS.NHL.pressure.impact(summary,progress,scoreGap,competition,nhlAllocation).points;
    const clockMode=hockeyPlayClockMode(summary || {});
    components.eventShock=eventShockFor('NHL',summary,status,SPORT_MODELS.NHL,value=>{
      const elapsed=hockeyLiveTiming(game.sourceEvent,{...competition,status:value===status ? value : {...value,clockMode}},summary).elapsed;
      return elapsed===null ? null : elapsed/3600;
    }).points;
  }
  const aggregation = aggregateLiveBonus({
    probabilityPoints:0,
    situationPoints:components.situation,
    pressurePoints:components.pressure,
    milestonePoints:components.milestone,
    eventShockPoints:components.eventShock,
    sportImpact,
    decisiveFloorEnabled:Boolean(SPORT_MODELS[game.sport]?.decisiveFloor),
    preserveCompetitiveSupport:game.sport==='NHL' && Boolean(nhlAllocation),
    nfl:game.sport === 'NFL'
  });
  let bonus = aggregation.bonus;
  // CFB's production midgame floor is a second generic time/close award. It is
  // deliberately absent from the shadow policy. NHL's floor is opening-context
  // retention/decay and remains in scope under the unchanged context policy.
  const liveFloor = game.sport === 'CFB'
    ? 0
    : SPORT_MODELS[game.sport]?.liveFloor?.({game,competition,progress,scoreGap});
  if (Number.isFinite(liveFloor) && liveFloor > 0) {
    bonus = Math.max(bonus,Math.round(liveFloor)-game.baseScore);
  }
  return {
    ...legacy,
    bonus,
    components,
    reasons:legacy.reasons.filter(reason => !(sportImpact.genericTimeReasons || []).includes(reason)),
    probabilityTelemetry:{...probabilityTelemetry,awardedPoints:0},
    aggregation,
    sportImpact
  };
}

function nonLiveCandidateRating(game,summary) {
  return {
    score:game.score,
    baseScore:game.baseScore,
    liveBonus:game.live?.bonus || 0,
    factors:game.factors,
    currentTensionPoints:0,
    genericLeveragePoints:0,
    currentWinProbability:null,
    trajectory:analyzeTrajectory(game.sport,summary,game.state === 'completed' ? 1 : null,game.state),
    productionUnchanged:true
  };
}

function prepareCandidateGameRating(core,game,competition,summary) {
  const progress = core.gameProgress(game.sport,competition);
  const scores = game.teams.map(team => Number(team[2]));
  const gap = scores.every(Number.isFinite) ? Math.abs(scores[0]-scores[1]) : null;
  const probability = validateCurrentWinProbability(core,summary,progress,'live',game.sport);
  return {
    progress,gap,probability,
    context:{
      competition,
      teams:game.teams,
      championship:game.championshipStakes,
      situation:competition?.situation,
      summary
    },
    extraFactors:(game.factors || [])
      .filter(factor => factor.label === 'Underdog threatens upset')
      .map(factor => ({...factor})),
    trajectory:analyzeTrajectory(game.sport,summary,progress,'live')
  };
}

function candidateBaseForPolicy(core,game,prepared,policy) {
  const state = candidateStateRating(
    core,game.openingScore,game.sport,'live',prepared.gap,prepared.progress,
    prepared.probability.probability,prepared.context,game.openingFactors || [],policy
  );
  const factors = [...state.factors,...prepared.extraFactors.map(factor => ({...factor}))];
  const baseScore = core.clampScore(factors.reduce((sum,factor) => sum+factor.points,0));
  return {state,factors,baseScore};
}

function finishCandidateGameRating(core,game,prepared,base,live,trajectoryPolicy=null,currentTensionPolicy=null) {
  if (game.sport==='CFB' && trajectoryPolicy?.cfbContextRetention) {
    const scale=trajectoryPolicy.cfbCurrentState;
    if (scale) {
      // Change only CFB's existing Current Tension award. Keep the shared
      // closeness signal intact for Generic Leverage and history relevance.
      // A smooth first-half ramp avoids treating a routine opening tie as a
      // mature contest; no extra fourth-quarter urgency is introduced.
      const x=unit(prepared.progress/scale.matureProgress);
      const currentTensionCeiling=scale.openingCeiling+(scale.matureCeiling-scale.openingCeiling)*x*x*(3-2*x);
      base=candidateBaseForPolicy(core,game,prepared,{...(currentTensionPolicy || DEFAULT_CURRENT_TENSION_POLICY),currentTensionCeiling,cfbImmediateTension:trajectoryPolicy.cfbImmediateTension});
      // Rebalance the same discretionary context pool: supported matchup
      // reputation and the existing upset factor, never history or stakes.
      base.factors=base.factors.map(f=>f.label==='Underdog threatens upset'
        ? {...f,points:Math.round(f.points*scale.contextScale)} : f);
    }
    const retention=cfbContextRetention(core,game,base.state,scale?.contextScale ?? 1);
    const replace=items=>{
      const label='Pregame context carried into play';
      const factors=items.map(f=>f.label===label ? {...f,points:retention.points} : {...f});
      if(retention.points && !factors.some(f=>f.label===label))factors.splice(1,0,{label,points:retention.points});
      return factors;
    };
    const stateFactors=replace(base.state.factors),factors=replace(base.factors);
    base={state:{...base.state,cfbContextRetention:retention,factors:stateFactors,
      score:core.clampScore(stateFactors.reduce((sum,f)=>sum+f.points,0))},factors,
      baseScore:core.clampScore(factors.reduce((sum,f)=>sum+f.points,0))};
    live=candidateLiveSnapshot(core,{...game,baseScore:base.baseScore,factors:base.factors},
      prepared.context.competition,prepared.context.summary);
  }
  if (game.sport==='NHL' && trajectoryPolicy?.nhlAllocation) {
    // Reuse the state model with its opt-in clock interpretation; Current
    // Tension/Generic Leverage and context weights are not changed.
    base=candidateBaseForPolicy(core,game,{...prepared,context:{...prepared.context,nhlAllocation:true}},currentTensionPolicy);
    const ordinary=(game.openingFactors||[]).filter(f=>['Sport baseline','Schedule scarcity'].includes(f.label))
      .reduce((sum,f)=>sum+Math.max(0,Number(f.points)||0),0);
    const ordinaryCarry=Math.round(Math.min(ordinary,Math.max(0,game.openingScore-base.state.persistentStakes))*base.state.retainedContextWeight);
    const context=Math.max(0,(base.state.factors.find(f=>f.label==='Pregame context carried into play')?.points||0)-ordinaryCarry);
    live=candidateLiveSnapshot(core,{...game,sourceEvent:game.sourceEvent,baseScore:base.baseScore,factors:base.factors},
      prepared.context.competition,prepared.context.summary,null,{context});
  }
  const owned = trajectoryPolicy?.liveOwnership
    ? liveTrajectory(core,game,prepared,base,live,trajectoryPolicy) : null;
  const budget=trajectoryPolicy?.endgameAllocation && owned
    ? endgameFloorBudget(game,base,live,owned) : null;
  if (budget) {
    const originalLive=live;
    live=candidateLiveSnapshot(core,{...game,baseScore:base.baseScore,factors:base.factors},
      prepared.context.competition,prepared.context.summary,budget);
    // Preserve the baseline's entire signed history/trajectory allocation.
    // Its floor/taper diagnostics describe the original allocation, while the
    // live diagnostic below describes the subsequent floor headroom correction.
    live={...live,endgameAllocation:{...budget,originalFloor:originalLive.sportImpact.competitiveFloor,
      allocatedFloor:live.sportImpact.competitiveFloor,originalBonus:originalLive.bonus}};
  }
  const momentumPoints = owned?.momentumPoints ?? (Number(game.momentumPoints) || 0);
  const trajectoryScoring = owned?.trajectoryScoring ?? trajectoryAdjustment(prepared.trajectory,base.state.currentCloseness,trajectoryPolicy);
  // Final aggregation only, BEFORE the final clamp/round. Never patch a finalized
  // rating: headroom and sport floors already used the selected policy's base.
  const score = core.clampScore(base.baseScore+live.bonus+momentumPoints+trajectoryScoring.adjustment);
  return {
    score,
    trajectoryScoring,
    ...(owned ? {historyOwnership:owned.historyOwnership} : {}),
    baseScore:base.baseScore,
    liveBonus:live.bonus,
    momentumPoints,
    factors:base.factors,
    state:base.state,
    live,
    progress:prepared.progress,
    gap:prepared.gap,
    currentWinProbability:prepared.probability.probability,
    currentTensionPoints:base.state.currentTensionPoints,
    genericLeveragePoints:base.state.genericLeveragePoints,
    trajectory:prepared.trajectory,
    productionUnchanged:true
  };
}

function candidateGameRating(core,game,competition,summary,policy=null,trajectoryPolicy=null) {
  if (game.state !== 'live') {
    return nonLiveCandidateRating(game,summary);
  }
  const prepared = prepareCandidateGameRating(core,game,competition,summary);
  const base = candidateBaseForPolicy(core,game,prepared,policy);
  const candidateGame = {...game,baseScore:base.baseScore,factors:base.factors};
  const live = candidateLiveSnapshot(core,candidateGame,competition,summary);
  return finishCandidateGameRating(core,game,prepared,base,live,trajectoryPolicy,policy);
}

function candidateTrajectoryRatings(core,game,competition,summary,trajectoryPolicies=[]) {
  if (game.state !== 'live') return trajectoryPolicies.map(() => nonLiveCandidateRating(game,summary));
  const prepared = prepareCandidateGameRating(core,game,competition,summary);
  const base = candidateBaseForPolicy(core,game,prepared,null);
  const live = candidateLiveSnapshot(core,{...game,baseScore:base.baseScore,factors:base.factors},competition,summary);
  return trajectoryPolicies.map(policy => finishCandidateGameRating(core,game,prepared,base,live,policy));
}

function candidateGameRatings(core,game,competition,summary,policies=[]) {
  if (game.state !== 'live') return policies.map(() => nonLiveCandidateRating(game,summary));
  const prepared = prepareCandidateGameRating(core,game,competition,summary);
  const bases = policies.map(policy => candidateBaseForPolicy(core,game,prepared,policy));
  const liveByBase = new Map();
  return bases.map(base => {
    // The live-path audit found candidate-policy input only through baseScore;
    // all other game/competition/summary inputs are identical at this checkpoint.
    // Independent-vs-batch regressions cover every base-sensitive sport family.
    let live = liveByBase.get(base.baseScore);
    if (!live) {
      live = candidateLiveSnapshot(core,{...game,baseScore:base.baseScore,factors:base.factors},
        competition,summary);
      liveByBase.set(base.baseScore,live);
    }
    return finishCandidateGameRating(core,game,prepared,base,live);
  });
}

module.exports = {
  DEFAULT_CURRENT_TENSION_POLICY,
  CURRENT_TENSION_CEILING,
  GENERIC_LEVERAGE_CAP,
  GENERIC_LEVERAGE_START,
  GENERIC_LEVERAGE_SPAN,
  currentClosenessFor,
  candidateComponents,
  validateCurrentWinProbability,
  candidateStateRating,
  candidateLiveSnapshot,
  candidateGameRating,
  candidateTrajectoryRatings,
  candidateGameRatings
};
