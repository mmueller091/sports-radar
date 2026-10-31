// Offline/review-only entry. Production runtime does not import this module.
const {candidateGameRating}=require('./shadow-candidate.cjs');
const {LIVE_CFB_COMPETITION_POLICY,liveTrajectory}=require('./trajectory-live-policy.cjs');
const {aggregateLiveBonus}=require('../scoring/shared/pressure.js');
const {hockeySituationImpact,hockeyLiveTiming,nhlLiveMarginCloseness}=require('../scoring/sports/nhl.js');
const {nhlAdvancedStats,nhlAbbreviation}=require('../scoring/nhl-advanced.cjs');
const DEFAULT_FLAGS=Object.freeze({nhlAdvancedPressure:false});
const unit=value=>Math.max(0,Math.min(1,Number(value)||0));
function pressureComponent(stats,{progress,gap,overtime=false}={}) {
  if (!stats?.available || !stats.pressureEligible || !Number.isFinite(gap) || gap>=3)
    return {points:0,reason:'Insufficient current reliable pressure evidence or noncompetitive margin'};
  const rolling=Object.values(stats.rollingFiveMinutes.teams);
  // Fenwick is a subset of Corsi, never a separate additive reward. Full-game
  // possession is display context only. Goals are excluded from recentPressure.
  const volume=unit((rolling.reduce((s,t)=>s+t.cf,0)-6)/10);
  const activity=unit((stats.recentPressure.weightedAttempts-2)/6);
  const trail=stats.trailingTeamId ? stats.recentPressure.teams[stats.trailingTeamId] : null;
  const dominance=trail ? unit((trail.cf/(trail.cf+trail.ca || 1)-.5)*2) : 0;
  const last=stats.recentPressure.latestTrailingAttempt;
  const freshness=last===null ? 0 : unit(1-(stats.asOfElapsed-last)/120);
  const comeback=trail ? unit(stats.recentPressure.weightedTrailingAttempts/5)*dominance*freshness : activity;
  const leverage=(.35+.65*unit(progress))*nhlLiveMarginCloseness(gap,progress);
  const points=Math.min(4,Math.max(0,Math.round((2*volume*activity+2*comeback)*leverage*(overtime ? .5 : 1))));
  return {points,volume,activity,comeback,leverage,reason:'Recent shot attempts; overlapping legacy pressure replaced'};
}
function experimentalNhlRating(core,game,competition,summary,pbp,flags=DEFAULT_FLAGS) {
  const baseline=candidateGameRating(core,game,competition,summary,null,LIVE_CFB_COMPETITION_POLICY);
  if (flags.nhlAdvancedPressure!==true || game.sport!=='NHL' || game.state!=='live') return baseline;
  const timing=hockeyLiveTiming(game.sourceEvent,competition,summary);
  const stats=nhlAdvancedStats(pbp,{asOfElapsed:timing.elapsed});
  const sides=competition.competitors || [];
  const aligned=stats.available && timing.elapsed!==null && sides.length===2 && sides.every(c=>{
    const side=stats.teams.find(t=>t.side===c.homeAway);
    const identity=side && (String(side.id)===String(c.team?.id) ||
      (side.abbreviation && nhlAbbreviation(c.team?.abbreviation)===side.abbreviation));
    return identity && stats.score[side.id]===Number(c.score);
  });
  // Missing, late or inconsistent NHL data retains the exact old model.
  if (!aligned || !stats.pressureEligible) return {...baseline,pressureExperiment:{applied:false,reason:'PBP unavailable, stale, or does not match current score/clock'}};
  const pressure=pressureComponent(stats,{progress:baseline.progress,gap:baseline.gap,overtime:timing.depth>0});
  // Recalculate ONLY the situation with non-scoring shots removed, to remove
  // the old half-pressure top-up embedded in its target. On-ice state remains.
  const noShotSummary={...summary,plays:(summary?.plays || []).filter(p=>p.scoringPlay)};
  const allocation=baseline.live.sportImpact.allocation;
  const plainImpact=hockeySituationImpact({...game,sourceEvent:game.sourceEvent,baseScore:baseline.baseScore},competition,noShotSummary,
    competition.status,baseline.progress,baseline.gap,allocation);
  const sportImpact={...plainImpact,competitiveFloor:plainImpact.competitiveFloor>0 ? plainImpact.competitiveFloor+pressure.points : 0,
    competitiveTarget:plainImpact.competitiveTarget>0 ? plainImpact.competitiveTarget+pressure.points : 0};
  // A floor and summed support meet through max, so the pressure award appears
  // once even when it supports a close-game floor. No +7 legacy shot component.
  const components={...baseline.live.components,pressure:pressure.points};
  const aggregation=aggregateLiveBonus({situationPoints:components.situation,pressurePoints:components.pressure,
    milestonePoints:components.milestone,eventShockPoints:components.eventShock,sportImpact,
    decisiveFloorEnabled:true,preserveCompetitiveSupport:true});
  const openingFloor=require('../scoring/sports/nhl.js').nhlModel.liveFloor({game,competition,progress:baseline.progress,scoreGap:baseline.gap});
  const bonus=Math.max(aggregation.bonus,openingFloor>0?Math.round(openingFloor)-baseline.baseScore:-Infinity);
  const reasons=baseline.live.reasons.filter(reason=>!/^\d+ dangerous chances (?:in the last 90 seconds|in recent records)/.test(reason));
  if (pressure.points) reasons.push(`NHL recent shot-attempt pressure (+${pressure.points})`);
  const live={...baseline.live,components,sportImpact,aggregation,bonus,reasons};
  const prepared={progress:baseline.progress,gap:baseline.gap,trajectory:baseline.trajectory,context:{competition,summary}};
  const owned=liveTrajectory(core,game,prepared,{state:baseline.state,baseScore:baseline.baseScore},live,LIVE_CFB_COMPETITION_POLICY);
  const score=core.clampScore(baseline.baseScore+bonus+owned.momentumPoints+owned.trajectoryScoring.adjustment);
  return {...baseline,...owned,score,live,liveBonus:bonus,pressureExperiment:{applied:true,...pressure,
    oldPressure:baseline.live.components.pressure,oldTarget:baseline.live.sportImpact.competitiveTarget,
    pressureFreeTarget:plainImpact.competitiveTarget,delta:score-baseline.score},productionUnchanged:true};
}
module.exports={DEFAULT_FLAGS,pressureComponent,experimentalNhlRating};
