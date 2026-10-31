// Production-only transition. Historical/experimental policies remain reproducible.
const {footballPregameSpread,underdogCandidate} = require('./shared/market.js');
const CALIBRATION = '2026-10-31.football-pregame.1';
const unit = x => Math.max(0,Math.min(1,x));
const smooth = x => {x=unit(x);return x*x*(3-2*x);};
const football = game => ['NFL','CFB'].includes(game.sport);

function preservePregameBaseline(game,previous) {
  if (!football(game) || game.state==='upcoming' || !previous ||
      game.sport!==previous.sport || String(game.id)!==String(previous.id)) return false;
  const ids=g=>(g.teams || []).map(t=>String(t[8] || '')).sort();
  const currentIds=ids(game),priorIds=ids(previous);
  if (currentIds.length!==2 || !currentIds[0] || currentIds[0]===currentIds[1] || currentIds.join('|')!==priorIds.join('|')) return false;
  const baseline=previous.pregameBaseline;
  if (baseline?.calibration!==CALIBRATION || !Number.isFinite(baseline.score)) return false;
  if (game.state==='completed' && baseline.source!=='observed') return false;
  // A recorded upcoming rating is authoritative; a reconstructed fallback may
  // gain missing market evidence from a subsequently accepted summary.
  game.pregameBaseline=JSON.parse(JSON.stringify(baseline));
  return true;
}

function prepareFootballOpening(core,game,competition,summary) {
  if (!football(game) || game.state==='completed') return;
  const recorded=game.state!=='upcoming' && game.pregameBaseline?.calibration===CALIBRATION && game.pregameBaseline.source==='observed';
  if (!recorded) {
    const prior=game.pregameBaseline;
    const summaryOdds=summary?.pickcenter || summary?.header?.competitions?.[0]?.odds;
    const odds=competition?.odds?.length ? competition.odds : summaryOdds?.length ? summaryOdds : prior?.odds;
    const basis={...competition,odds};
    const opening=core.pregameRating(game.sport,game.sourceEvent,basis,game.context,'upcoming');
    game.pregameBaseline={calibration:CALIBRATION,source:game.state==='upcoming'?'observed':'reconstructed',
      score:opening.score,rawPregameScore:opening.rawPregameScore,factors:opening.factors,odds:odds || [],
      spread:footballPregameSpread(basis),underdog:underdogCandidate(game.sport,basis,odds?.[0])};
  }
  const baseline=game.pregameBaseline;
  game.openingScore=baseline.score;
  game.openingFactors=baseline.factors.map(f=>({...f}));
  game.rawPregameScore=baseline.rawPregameScore;
  if (game.state==='live') game.underdog=baseline.underdog;
}

function footballCompetitionEvidence(game,competition,progress,probability) {
  const maturity=smooth(progress/.5);
  const baseline=game.pregameBaseline;
  const spread=baseline?.spread;
  const competitors=competition?.competitors || [];
  const home=competitors.find(t=>t.homeAway==='home'),away=competitors.find(t=>t.homeAway==='away');
  const dog=baseline?.underdog;
  const odds=baseline?.odds?.[0] || {};
  const homeDog=dog ? String(dog.teamId)===String(home?.team?.id) : odds.homeTeamOdds?.underdog===true || odds.awayTeamOdds?.favorite===true;
  const knownDirection=dog || odds.homeTeamOdds?.favorite || odds.awayTeamOdds?.favorite || odds.homeTeamOdds?.underdog || odds.awayTeamOdds?.underdog;
  const margin=home?.score!=null && away?.score!=null ? Number(home.score)-Number(away.score) : 0;
  const remaining=Math.max(.01,1-unit(progress));
  // Expected remaining edge, measured in one-touchdown scoring units. Keep
  // that unit late: a single possession can still break a tie near the finish.
  // If only magnitude is known, retain market uncertainty without inventing a
  // favorite. This estimate is internal evidence, never a displayed ESPN WP.
  const edge=Number.isFinite(spread) ? (knownDirection ? (homeDog?-spread:spread)*remaining+margin : Math.max(0,spread*remaining-Math.abs(margin))) : null;
  const estimate=edge===null ? null : 1/(1+Math.exp(-edge/7));
  const priorUncertainty=estimate===null ? .5 : 1-2*Math.abs(estimate-.5);
  const observed=probability===null ? priorUncertainty : 1-2*Math.abs(probability-.5);
  const uncertainty=priorUncertainty*(1-maturity)+observed*maturity;
  return {maturity,priorUncertainty,uncertainty,probability:.5+(.5-uncertainty/2),source:probability===null?'market-and-score-estimate':'validated-ESPN'};
}

function transitionFootballBase(core,game,prepared,base) {
  const evidence=footballCompetitionEvidence(game,prepared.context.competition,prepared.progress,prepared.probability.probability);
  const m=evidence.maturity,state=base.state;
  const transient=Math.max(0,game.openingScore-state.persistentStakes);
  const replacements={
    'Game-state baseline':12*m,
    'Pregame context carried into play':transient*(1-m)+(base.factors.find(f=>f.label==='Pregame context carried into play')?.points || 0)*m,
    'Persistent postseason stakes':state.persistentStakes*(1-m)+(base.factors.find(f=>f.label==='Persistent postseason stakes')?.points || 0)*m,
    'Current Tension':state.currentTensionPoints*m
  };
  const factors=base.factors.filter(f=>!(f.label in replacements)).map(f=>({...f}));
  for (const [label,points] of Object.entries(replacements)) if(points) factors.push({label,points:Number(points.toFixed(4))});
  const baseScore=core.clampScore(factors.reduce((sum,f)=>sum+f.points,0));
  return {factors,baseScore,state:{...state,factors,score:baseScore,currentTensionPoints:replacements['Current Tension'],footballEvidence:evidence}};
}
module.exports={CALIBRATION,preservePregameBaseline,prepareFootballOpening,footballCompetitionEvidence,transitionFootballBase};
