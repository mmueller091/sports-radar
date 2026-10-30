/* Phase 3.1 experiment. Existing Phase 3 policies remain immutable baselines. */
const {TRAJECTORY_POLICIES,trajectoryAdjustment} = require('./trajectory-policy.cjs');
const {SPORT_MODELS} = require('../scoring/models.js');
const {historyImpact} = require('../scoring/shared/history.js');
const {scoringMoments} = require('../scoring/shared/trajectory.js');
const {eventPosition} = require('../scoring/shared/time.js');
const unit = value => Math.max(0,Math.min(1,Number(value)||0));
const baseline = TRAJECTORY_POLICIES.find(p => p.id === 'gate-45-95-wp-65');
const LIVE_TRAJECTORY_POLICIES = Object.freeze([
  [.35,.85],[.45,.95]
].map(([gateStart,gateEnd]) => Object.freeze({...baseline,
  id:`live-owned-${gateStart*100}-${gateEnd*100}`,description:'Replace sustained history before caps; no revival; protect sport-owned current floors.',
  liveOwnership:true,gateStart,gateEnd,revivalPoints:0,negativeRetention:.25})));
// Separate opt-in export: historical policy lists/reproduction runners stay frozen.
const LIVE_HISTORY_RELEVANCE_POLICY = Object.freeze({...LIVE_TRAJECTORY_POLICIES[1],
  id:'live-owned-45-95-relevant-history',liveHistoryRelevance:true,
  description:'Current relevance before history caps; supported recovery shares the decisive-state discount taper.'});
const LIVE_ENDGAME_ALLOCATION_POLICY = Object.freeze({...LIVE_HISTORY_RELEVANCE_POLICY,
  id:'live-owned-45-95-relevant-history-endgame-allocation',endgameAllocation:true,
  description:'NFL floors consume earned positive history; retain existing context outside floor headroom. NHL unchanged.'});
const LIVE_NHL_ALLOCATION_POLICY = Object.freeze({...LIVE_ENDGAME_ALLOCATION_POLICY,
  id:'live-owned-45-95-relevant-history-nhl-allocation',nhlAllocation:true,
  description:'NHL normalized clocks, context-preserving targets and independent bounded history; NFL allocation unchanged.'});
const LIVE_CFB_CONTEXT_POLICY = Object.freeze({...LIVE_NHL_ALLOCATION_POLICY,
  id:'live-owned-45-95-relevant-history-cfb-context',cfbContextRetention:true,
  description:'CFB supported matchup context retains its opening-live weight with existing viability; NFL/NHL unchanged.'});
const LIVE_CFB_WATCHABILITY_POLICY = Object.freeze({...LIVE_CFB_CONTEXT_POLICY,
  id:'live-owned-45-95-relevant-history-cfb-watchability',
  cfbCurrentState:Object.freeze({openingCeiling:34,matureCeiling:48,matureProgress:.5,contextScale:.4}),
  description:'CFB current competition owns more of the watch scale by halftime; discretionary context is supplementary. Other sports and history rules unchanged.'});

function cfbContextRetention(core,game,state,matchupScale=1) {
  const transient=Math.max(0,game.openingScore-state.persistentStakes);
  const ordinary=Math.min(transient,game.openingFactors?.length ? game.openingFactors
    .filter(f=>['Sport baseline','Schedule scarcity'].includes(f.label))
    .reduce((sum,f)=>sum+Math.max(0,Number(f.points)||0),0) : transient);
  // Only context already admitted by the capped opening score. Preserve signed
  // pregame reductions in that basis; never re-add individual positive factors.
  const matchup=Math.max(0,transient-ordinary);
  const viability=state.contextWeight>0 ? state.retainedContextWeight/state.contextWeight : 0;
  const matchupWeight=core.contextCarryWeight(0,'live','CFB')*viability*matchupScale;
  const points=Math.round(ordinary*state.retainedContextWeight+matchup*matchupWeight);
  return {ordinary,matchup,ordinaryWeight:state.retainedContextWeight,matchupWeight,viability,points};
}

function endgameFloorBudget(game,base,live,owned) {
  // NHL's tied third-period target is a single continuous regulation branch,
  // including ordinary earlier regulation. It has no separate late-regulation
  // activation to reuse safely. Keep NHL unchanged rather than add a time gate
  // (or alter only OT and create a new regulation-to-OT allocation boundary).
  if (game.sport!=='NFL' || !(live.sportImpact?.competitiveFloor>0)) return null;
  const points=label=>base.state.factors.find(f=>f.label===label)?.points||0;
  // Preserve only context already carried by stateRating, above ordinary sport
  // baseline/scarcity. No new context weights or evidence inference.
  const ordinaryOpening=(game.openingFactors||[])
    .filter(f=>['Sport baseline','Schedule scarcity'].includes(f.label))
    .reduce((sum,f)=>sum+Math.max(0,Number(f.points)||0),0);
  const ordinaryContext=Math.round(Math.min(ordinaryOpening,
    Math.max(0,game.openingScore-base.state.persistentStakes))*base.state.retainedContextWeight);
  const matchupContext=Math.max(0,points('Pregame context carried into play')-ordinaryContext);
  const stakes=Math.max(0,points('Persistent postseason stakes'));
  const retainedContext=matchupContext+stakes;
  const positiveHistory=owned.historyOwnership.combinedFactors
    .reduce((sum,f)=>sum+Math.max(0,f.points),0);
  return {positiveHistory,matchupContext,stakes,retainedContext,
    floorBaseScore:base.baseScore+positiveHistory-retainedContext,
    originalFloor:live.sportImpact.competitiveFloor};
}

function ownedHistory(sport,summary,progress,trajectoryPositive=0,liveRelevance=null,nhlAllocation=null) {
  const model = SPORT_MODELS[sport] || {};
  const options = {replaceSustained:true,trajectoryPositive,...(liveRelevance === null ? {} : {liveRelevance}),
    ...(sport==='NHL' && nhlAllocation ? {nhlAllocation} : {})};
  return model.historyImpact ? model.historyImpact(summary,progress,'live',options)
    : historyImpact(sport,summary,progress,'live',model.history,options);
}

function historyRelevance(game,prepared,base,decisiveStrength) {
  const state=base.state, margin=state.marginCloseness;
  const viability=state.comebackViability;
  const hasRunway=Number.isFinite(state.footballState?.comebackFeasibility) ||
    Number.isFinite(state.basketballState?.comebackFeasibility);
  const ramp=value=>unit((value-.15)/.30);
  // Margin/runway, never WP, establishes obsolescence. Without an explicit
  // feasibility model, require a late state and the sport's wide-margin penalty.
  const canReduce=state.widePenalty>0 && Number.isFinite(margin) &&
    (hasRunway || prepared.progress>=.75);
  const eventRetention=canReduce
    ? Math.max(ramp(margin),hasRunway ? ramp(viability) : 0,decisiveStrength) : 1;
  const currentPosition=eventPosition(game.sport,prepared.context.competition);
  const end=Number.isFinite(currentPosition) ? currentPosition : prepared.progress;
  const moments=scoringMoments(game.sport,prepared.context.summary)
    .filter(m=>m.position<=end+1e-9 && m.play.homeScore!=null && m.play.awayScore!=null);
  const scores=Object.fromEntries((prepared.context.competition?.competitors||[])
    .map(t=>[t.homeAway,t.score == null ? NaN : Number(t.score)]));
  const latest=moments.at(-1);
  const ledgerMatches=Boolean(latest && latest.home===scores.home && latest.away===scores.away);
  const threshold=SPORT_MODELS[game.sport]?.history?.threshold;
  const viable=Number.isFinite(prepared.gap) && prepared.gap<=threshold && margin>=.5 &&
    (!hasRunway || viability>=.45);
  let recovery=null;
  if (ledgerMatches && viable) for (const side of ['home','away']) {
    const opponent=side==='home' ? 'away' : 'home';
    let deepest=0, start=-1;
    for (const [i,m] of moments.entries()) if (m[opponent]-m[side]>deepest) {
      deepest=m[opponent]-m[side]; start=i;
    }
    const recovered=deepest-Math.max(0,scores[opponent]-scores[side]);
    let scoringEvents=0,lastGain=null,valid=true;
    for (let i=start+1;i<moments.length;i++) {
      const prior=moments[i-1];
      if (!prior) continue;
      const own=moments[i][side]-prior[side],other=moments[i][opponent]-prior[opponent];
      if (own<0 || other<0 || (own>0 && other>0)) valid=false;
      if (own>0 && other===0) {scoringEvents++;lastGain=moments[i].position;}
    }
    if (valid && deepest>=threshold && recovered>=threshold && scoringEvents>=2 &&
        lastGain!==null && end-lastGain<=.16 && (!recovery || recovered>recovery.recovered)) {
      recovery={side,deepestDeficit:deepest,recovered,scoringEvents,lastGain,age:end-lastGain};
    }
  }
  return {eventRetention,marginCloseness:margin,comebackViability:viability,ledgerMatches,
    recovery,recoveryStrength:recovery ? .75 : 0,
    eventReason:eventRetention<1 ? 'Current sport margin/runway limits historical competition relevance' : 'Current competition history retained',
    recoveryReason:recovery ? 'Material score recovery with recent scoring and viable current runway' : 'No supported recent material recovery with viable current runway'};
}

function liveTrajectory(core,game,prepared,base,live,policy) {
  const raw = trajectoryAdjustment(prepared.trajectory,base.state.currentCloseness,policy);
  const impact = live.sportImpact || {}, aggregation = live.aggregation || {};
  // These are incremental bonus floors, NOT absolute ratings. 20 is the
  // existing ordinary competitive-situation cap in aggregateLiveBonus.
  const floorBonus = Math.max(0,aggregation.driveFloor||0,impact.competitiveFloor||0);
  const decisiveStrength = Math.max(unit(impact.decisiveDrive?.urgency),unit(impact.finalPossession?.urgency),unit(floorBonus/20));
  const relevance=policy.liveHistoryRelevance ? historyRelevance(game,prepared,base,decisiveStrength) : null;
  const effectivePositiveGate = Math.max(raw.positiveCurrentStateGate,.5*decisiveStrength);
  const requestedPositive = Math.max(0,raw.boundedTrajectory)*raw.evidenceWeight*effectivePositiveGate;
  const nhlAllocation=policy.nhlAllocation && game.sport==='NHL' ? impact.allocation : null;
  const eventHistory = ownedHistory(game.sport,prepared.context.summary,prepared.progress,0,relevance?.eventRetention??null,nhlAllocation);
  const combinedHistory = requestedPositive > 0
    ? ownedHistory(game.sport,prepared.context.summary,prepared.progress,requestedPositive,relevance?.eventRetention??null,nhlAllocation) : eventHistory;
  const positiveAfterHistoryCaps = combinedHistory.points-eventHistory.points;
  // Competing explanations for the same discount use the stronger protection,
  // never multiplied gates. Recovery retains at least 43.75% of the discount.
  const protectionStrength=Math.max(decisiveStrength,relevance?.recoveryStrength||0);
  const negativeMultiplier = 1-(1-policy.negativeRetention)*protectionStrength;
  const negativeAfterTaper = Math.min(0,raw.boundedTrajectory)*raw.evidenceWeight*negativeMultiplier;
  const beforeNegative = base.baseScore+live.bonus+combinedHistory.points;
  const protectedRating = floorBonus > 0 ? base.baseScore+floorBonus : null;
  // Only reduce this trajectory penalty. Never synthesize a new rating floor
  // or repair unrelated pre-existing penalties with positive trajectory points.
  const negativeAfterFloor = protectedRating === null ? negativeAfterTaper
    : Math.max(negativeAfterTaper,Math.min(0,protectedRating-beforeNegative));
  return {
    momentumPoints:eventHistory.points,
    trajectoryScoring:{...raw,unprotectedAdjustment:raw.adjustment,
      adjustment:positiveAfterHistoryCaps+negativeAfterFloor,
      effectivePositiveGate,decisiveStrength,requestedPositive,positiveAfterHistoryCaps,
      ...(relevance ? {protectionStrength,positiveReducedByRelevance:requestedPositive*(1-relevance.eventRetention)} : {}),
      negativeMultiplier,negativeAfterTaper,negativeAfterFloor,protectedRating,floorBonus},
    historyOwnership:{originalPoints:Number(game.momentumPoints)||0,eventPoints:eventHistory.points,
      ...(relevance ? {relevance,allocation:combinedHistory.relevance} : {}),
      replacedPoints:(Number(game.momentumPoints)||0)-eventHistory.points,
      originalSustainedFactors:(game.factors||[]).filter(f => ['Sustained competitive game','Time tied or within one goal'].includes(f.label)),
      eventFactors:eventHistory.factors,combinedFactors:combinedHistory.factors,
      combinedPoints:combinedHistory.points,positiveLimitedByCaps:requestedPositive*(relevance?.eventRetention??1)-positiveAfterHistoryCaps}
  };
}
module.exports = {LIVE_TRAJECTORY_POLICIES,LIVE_HISTORY_RELEVANCE_POLICY,LIVE_ENDGAME_ALLOCATION_POLICY,LIVE_NHL_ALLOCATION_POLICY,LIVE_CFB_CONTEXT_POLICY,LIVE_CFB_WATCHABILITY_POLICY,
  cfbContextRetention,endgameFloorBudget,ownedHistory,liveTrajectory};
