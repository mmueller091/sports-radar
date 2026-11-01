// Production-only ownership transfer; football retains its reviewed implementation.
const football = require('./football-transition.cjs');
const {footballPregameSpread,moneylinePrices,underdogCandidate} = require('./shared/market.js');
const {normalizedTime} = require('./shared/time.js');
const {hockeyLiveTiming} = require('./sports/nhl.js');
const {CONTEXT_LABELS} = require('./shared/config.js');
const occasion=require('./event-occasion.cjs');
const college=require('./basketball-calibration.cjs');
const SPORTS = Object.freeze(['NHL','NBA','NCAAB','MLB','Soccer','Tennis']);
const CALIBRATION = '2026-10-31.opening-transition.1';
const unit = n => Math.max(0,Math.min(1,n));
const smooth = n => {n=unit(n);return n*n*(3-2*n);};
const supports = g => SPORTS.includes(g.sport);
function validBaseline(baseline) {
  if (baseline?.calibration!==CALIBRATION || !Number.isFinite(baseline.score) || !Number.isFinite(baseline.rawPregameScore) ||
      !Array.isArray(baseline.factors) || !baseline.factors.length || baseline.factors.some(f=>!Number.isFinite(f.points))) return false;
  const raw=baseline.factors.reduce((sum,f)=>sum+f.points,0);
  return Math.abs(raw-baseline.rawPregameScore)<1e-6 && baseline.score===Math.min(90,Math.max(1,Math.min(99,Math.round(raw))));
}

function preservePregameBaseline(game,previous) {
  if (!supports(game)) return football.preservePregameBaseline(game,previous);
  if (game.state==='upcoming' || !previous || game.sport!==previous.sport || String(game.id)!==String(previous.id)) return false;
  const ids=g=>(g.teams || []).map(t=>String(t[8] || '')).sort();
  const a=ids(game),b=ids(previous);
  if (a.length!==2 || !a[0] || a[0]===a[1] || a.join('|')!==b.join('|')) return false;
  const baseline=previous.pregameBaseline;
  if (!validBaseline(baseline)) return false;
  if (game.state==='completed' && baseline.source!=='observed') return false;
  // Never replace an observed baseline with a reconstructed one on a refresh.
  if (game.pregameBaseline?.source==='observed' && baseline.source!=='observed') return false;
  game.pregameBaseline=JSON.parse(JSON.stringify(baseline));
  return true;
}

function prepareOpening(core,game,competition,summary) {
  if (!supports(game)) return football.prepareFootballOpening(core,game,competition,summary);
  if (game.state==='completed') return;
  const prior=game.pregameBaseline;
  const observed=game.state!=='upcoming' && validBaseline(prior) && prior.source==='observed';
  const occasionFactors=occasion.factorsFor(game,competition);
  const withOccasion=opening=>{
    const factors=[...opening.factors,...occasionFactors.filter(f=>!opening.factors.some(o=>o.contextType===f.contextType))];
    const rawPregameScore=factors.reduce((sum,f)=>sum+f.points,0);
    return {...opening,factors,rawPregameScore,score:Math.min(90,core.clampScore(rawPregameScore))};
  };
  if (!observed) {
    const summaryOdds=summary?.pickcenter || summary?.header?.competitions?.[0]?.odds;
    const odds=competition?.odds?.length ? competition.odds : summaryOdds?.length ? summaryOdds : prior?.odds || [];
    const basis={...competition,odds};
    const opening=withOccasion(core.pregameRating(game.sport,game.sourceEvent,basis,game.context,'upcoming'));
    game.pregameBaseline={calibration:CALIBRATION,source:game.state==='upcoming'?'observed':'reconstructed',
      score:opening.score,rawPregameScore:opening.rawPregameScore,factors:opening.factors,odds,
      spread:footballPregameSpread(basis),underdog:underdogCandidate(game.sport,basis,odds[0])};
  }
  const baseline=game.pregameBaseline;
  game.openingScore=baseline.score;game.rawPregameScore=baseline.rawPregameScore;
  game.openingFactors=baseline.factors.map(f=>({...f}));
  // Late research is live context, not an observation of a past pregame score.
  // Compare only verified qualitative factors so disappearing odds cannot erase the baseline.
  const labels=new Set([...Object.values(CONTEXT_LABELS),'Season opener','International showcase']);
  const enriched=withOccasion(core.pregameRating(game.sport,game.sourceEvent,{...competition,odds:baseline.odds},game.context,'upcoming'));
  game.liveOpeningContext=observed ? enriched.factors.filter(f=>labels.has(f.label))
    .reduce((sum,f)=>sum+f.points-(baseline.factors.find(b=>b.label===f.label)?.points || 0),0) : 0;
  if (game.state==='live') game.underdog=baseline.underdog || college.underdog(game,competition,baseline.odds?.[0]) || game.recoveredCollegeUnderdog || null;
  if(game.sport==='NCAAB'&&summary&&!game.underdog){
    // Recover only explicit closing lines when an observed opening lacked odds.
    const raw=(summary.pickcenter||[]).find(o=>o.close||o.closing||o.pointSpread?.home?.close?.line!=null);
    const recovered=college.underdog(game,competition,raw);
    if(recovered){game.recoveredCollegeUnderdog=recovered;game.underdog=recovered;}
  }
  if(game.state==='upcoming'){game.score=baseline.score;game.baseScore=baseline.score;game.factors=baseline.factors.map(f=>({...f}));}
}

function gameplayProgress(game,competition,summary) {
  const status=competition?.status || {},period=Number(status.period || 1);
  if (game.sport==='NHL') {
    const timing=hockeyLiveTiming(game.sourceEvent,competition,summary);
    return timing.shootout || timing.depth ? 1 : unit((timing.elapsed || 0)/3600);
  }
  if (game.sport==='MLB') {
    const s=competition?.situation || {},detail=[status.type?.detail,status.type?.shortDetail,status.inningHalf].join(' ');
    const bottom=/bottom|bot\b|middle|mid\b/i.test(detail);
    // Outs measure completed action. A half-inning label does not represent a quarter inning of play.
    const outs=Math.max(0,Math.min(3,Number(s.outs) || 0));
    return unit(((period-1)*6+(/end/i.test(detail)?6:(bottom?3:0)+outs))/54);
  }
  if (game.sport==='Tennis') {
    const bestOf=Number(competition?.format?.regulation?.periods || competition?.format?.bestOf || 3);
    const competitors=competition?.competitors || [];
    // Games already played in the current set, rather than a synthetic half set at first serve.
    const games=competitors.reduce((sum,t)=>sum+(t.linescores || []).reduce((n,set)=>n+(Number(set.value) || 0),0),0);
    // Completed sets are evidence if per-set game scores are unavailable.
    const completed=competitors.reduce((sum,t)=>sum+(Number(t.score) || 0),0);
    return unit(Math.max(games,completed*8)/(bestOf*8));
  }
  const time=normalizedTime(game.sport,competition);
  // Missing clock at a new period means its start, never its midpoint.
  if (time.elapsedSeconds===null) return unit((period-1)/({NBA:4,NCAAB:2,Soccer:2}[game.sport] || 1));
  return time.progress;
}

function competitionEvidence(game,competition,progress,probability) {
  const maturity=smooth(progress/.5),baseline=game.pregameBaseline;
  const prices=moneylinePrices(baseline?.odds?.[0]);
  const implied=p=>p<0 ? -p/(-p+100) : 100/(p+100);
  let uncertainty=.5;
  if (prices.length>=2) {
    const a=implied(prices[0]),b=implied(prices[1]);
    uncertainty=1-2*Math.abs(a/(a+b)-.5);
  } else if (prices.length===1) uncertainty=1-2*Math.abs(implied(prices[0])-.5);
  else if (Number.isFinite(baseline?.spread)) {
    const scale=({NBA:8,NCAAB:8,NHL:1.5,MLB:2,Soccer:1.5,Tennis:2})[game.sport];
    uncertainty=2/(1+Math.exp(baseline.spread/scale));
  }
  // The scoreboard can establish competition as regulation develops. An opening tie cannot.
  const scores=(competition?.competitors || []).map(t=>Number(t.score));
  const gap=scores.length===2 && scores.every(Number.isFinite) ? Math.abs(scores[0]-scores[1]) : null;
  // Margin viability already belongs to the sport model. Do not apply a second
  // margin discount here. A developed, observed scoreboard can establish the
  // competition signal; its margin/runway still controls Current Tension.
  const scoreboard=gap===null ? uncertainty : 1;
  const observed=probability===null ? scoreboard : 1-2*Math.abs(probability-.5);
  const effective=uncertainty*(1-maturity)+observed*maturity;
  return {maturity,priorUncertainty:uncertainty,uncertainty:effective,probability:1-effective/2,
    source:probability===null?'market-and-score-estimate':'validated-ESPN'};
}

function transitionBase(core,game,prepared,base) {
  const evidence=competitionEvidence(game,prepared.context.competition,prepared.progress,prepared.probability.probability);
  const m=evidence.maturity,state=base.state,points=label=>base.factors.find(f=>f.label===label)?.points || 0;
  const replacements={
    'Game-state baseline':points('Game-state baseline')*m,
    'Pregame context carried into play':Math.max(0,game.openingScore-state.persistentStakes)*(1-m)+points('Pregame context carried into play')*m,
    'Persistent postseason stakes':state.persistentStakes*(1-m)+points('Persistent postseason stakes')*m,
    'Current Tension':points('Current Tension')*m
  };
  const newContext=(game.liveOpeningContext || 0)*((1-m)+state.retainedContextWeight*m);
  if (newContext) replacements['Verified context learned during play']=newContext;
  const factors=base.factors.filter(f=>!(f.label in replacements)).map(f=>({...f}));
  for (const [label,points] of Object.entries(replacements)) if (points) factors.push({label,points:Number(points.toFixed(4))});
  const baseScore=core.clampScore(factors.reduce((sum,f)=>sum+f.points,0));
  return {factors,baseScore,state:{...state,factors,score:baseScore,currentTensionPoints:replacements['Current Tension'],openingEvidence:evidence}};
}

function openingEventModel(sport,model) {
  const points={NHL:4,Soccer:4,MLB:2,NBA:1,NCAAB:1}[sport];
  if (!points) return model;
  return {...model,eventShock:input=>model.eventShock?.(input) ||
    (input.play.scoringPlay===true ? {value:points,label:'Opening scoring play'} : null)};
}
module.exports={SPORTS,CALIBRATION,supports,preservePregameBaseline,prepareOpening,gameplayProgress,competitionEvidence,transitionBase,openingEventModel};
