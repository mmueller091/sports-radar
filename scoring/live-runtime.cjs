const calculation=require('./shared/calculation.js');
const {verifiedCfbContextEligible}=require('./cfb-verified-context.cjs');
const {isHalftimeStatus,playPeriodLabel,displayMoment} = require('./shared/time.js');
// Production entry: reuse the reviewed candidate verbatim and the legacy core's
// chronology validator. rating-core.js remains the explicit capture baseline.
const legacy = require('../rating-core.js');
const {candidateGameRating} = require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_COMPETITION_POLICY:LIVE_POLICY} = require('../calibration/trajectory-live-policy.cjs');
const {prepareOpening,preservePregameBaseline} = require('./opening-transition.cjs');
const {preserveLiveEvidence,historyFor,rememberHistory,currentManpower,validLedger,ledgerQuality}=require('./live-evidence.cjs');
const providerEvidence=require('./provider-evidence.cjs');
const basketball=require('./basketball-state.cjs');
const {analyzeTrajectory}=require('./models.js');
const basketballCalibration=require('./basketball-calibration.cjs');
const basketballUpset=require('./basketball-upset.cjs');
const {canonicalDetailSummary}=require('./detail-state.cjs');
const footballLive=require('./football-live.cjs');
const footballMarket=require('./football-market.cjs');
const integrity=require('./snapshot-integrity.cjs');
const gameFacts=require('./game-facts.cjs');
const PRODUCTION_POLICY = Object.freeze({...LIVE_POLICY,id:LIVE_POLICY.id+'-opening-transition',footballTransition:true,openingTransition:true});
const MODEL_VERSION = '2026-11-05.nhl-manpower.1';

function describeCfbQualitySoFar(game,current,summary) {
  delete game.gameQualitySoFar;
  if (game.sport!=='CFB' || !summary || !game.trajectoryScoring?.hasHistory || Number(current.status?.period)!==4) return;
  const seconds=legacy.clockSeconds(current.status),gap=Math.abs(Number(game.teams[0][2])-Number(game.teams[1][2]));
  if (seconds===null || seconds>120 || gap===0) return;
  const competition={...current,status:{...current.status,type:{state:'post',completed:true,detail:'Final'}}};
  const teams=game.teams.map(t=>({name:t[0],abbr:t[1],score:t[2],record:t[5],rank:t[6],id:t[8]}));
  const rating=legacy.rateGame('CFB','completed',teams,game.sourceEvent,competition,game.context || '');
  const finalGame={...game,state:'completed',score:rating.score,factors:rating.factors,upsetPoints:rating.upsetPoints,sourceCompetition:competition};
  const finish=legacy.defensiveFinishFactor('CFB',summary)?.points||0;
  const history=legacy.momentumImpact('CFB',summary,1,'completed',{game:finalGame,finishPoints:finish});
  const target=legacy.clampScore(rating.score+history.points+finish);
  // This is a retrospective estimate of the observed game so far, assuming
  // the current result stood. It is not a prediction or a live urgency bonus.
  // The actual completed assessment still runs only when the provider is final.
  game.gameQualitySoFar={score:target,provisional:true,basis:'current-score-and-observed-history'};
}

function applyLiveSnapshot(game, competition, summary) {
  competition=integrity.reconcileObservation(game,competition || game.sourceCompetition,summary);
  // Generic clock reconciliation covers football and hockey. A basketball
  // timing flag may already be set by an earlier pass; recheck it below so a
  // later enrichment pass restores the same last trusted rating.
  if(game.timingUncertain && !basketball.supports(game))return null;
  summary=providerEvidence.normalizeSummary(game,competition || game.sourceCompetition,summary);
  if(footballMarket.supports(game))competition=footballMarket.prepareUpcomingMarket(game,competition || game.sourceCompetition,summary);
  const reconciled=basketball.reconcileBasketball(game,competition || game.sourceCompetition,summary);
  competition=reconciled.competition;summary=reconciled.summary;
  if(reconciled.timingUncertain){game.lastSummaryAccepted=false;return null;}
  prepareOpening(legacy,game,competition || game.sourceCompetition,null);
  if (game.state !== 'live') {
    if(game.state==='upcoming')calculation.set(game,calculation.fromFactors(game.factors,game.score,'Pregame',90));
    return;
  }
  legacy.applyLiveSnapshot(game, competition, summary);
  const current = {...(competition || game.sourceCompetition),
    ...(game.sport==='NFL' ? {season:{...game.sourceEvent?.season,...game.sourceCompetition?.season,...competition?.season}} : {}),
    status:game.liveRawStatus, situation:game.liveRawSituation};
  const rawAccepted = game.lastSummaryAccepted && summary?.header?.competitions?.[0]?.status ? summary : null;
  const accepted = providerEvidence.normalizeSummary(game,current,integrity.sameStateSummary(game,current,rawAccepted));
  const evidence=ledgerQuality(accepted,current,game.sport);
  const validHistory=evidence.state!=='invalid';
  if(!validHistory){delete game.verifiedLiveEvidence;delete game.manpowerEvidence;delete game.liveInputEvidence;}
  const ratingSummary=validHistory ? accepted : {...accepted,scoringPlays:[],plays:[],drives:undefined,winprobability:[]};
  delete game.manpowerRetained;
  const effective=currentManpower(game,current,ratingSummary);
  if(game.manpowerQuality?.state==='conflict'){
    if(evidence.state==='complete')evidence.state='partial';
    evidence.reasons=[...new Set([...evidence.reasons,...game.manpowerQuality.reasons.map(reason=>`manpower:${reason}`)])];
  }
  let history=basketball.supports(game) ? {summary:reconciled.history,trajectory:analyzeTrajectory(game.sport,reconciled.history,legacy.gameProgress(game.sport,current),'live')} : historyFor(game,current,accepted);
  if(history){
    const historical=providerEvidence.normalizeSummary(game,current,history.summary);
    history={summary:historical,trajectory:analyzeTrajectory(game.sport,historical,legacy.gameProgress(game.sport,current),'live')};
  }
  const latestProbability=effective?.winprobability?.at(-1);
  const probabilityPlays=[...(effective?.plays||[]),...(effective?.drives?.previous||[]).flatMap(d=>d.plays||[]),...(effective?.drives?.current?.plays||[])];
  const unanchoredProbability=(history || game.sameStateEvidenceRetained) && latestProbability && (latestProbability.playId==null || !probabilityPlays.some(p=>String(p.id)===String(latestProbability.playId)));
  const currentSummary=unanchoredProbability ? {...effective,winprobability:[]} : effective;
  prepareOpening(legacy,game,competition || game.sourceCompetition,accepted);
  if (['NFL','CFB'].includes(game.sport)) {
    const upset=legacy.upsetImpact(game.underdog,game.teams,'live',legacy.gameProgress(game.sport,current),game.sport,current);
    game.factors=game.factors.filter(f=>f.label!=='Underdog threatens upset');
    if (upset.points) game.factors.push({label:'Underdog threatens upset',points:upset.points});
    game.upsetPoints=upset.points;game.upsetText=upset.text;
  }
  if (basketball.supports(game)) {
    const upset=basketballUpset.liveSurprise(legacy,game,current,currentSummary,history?.summary||currentSummary);
    if(upset.market)game.liveUpsetMarket=upset.market;
    Object.assign(game,{liveUpset:upset,upsetPoints:upset.points,upsetText:upset.text});
    game.factors=game.factors.filter(f=>f.label!=='Underdog threatens upset');
    if(upset.points)game.factors.push({label:'Underdog threatens upset',points:upset.points,liveUpset:true});
  }
  let scoringGame=game;
  if (['NFL','CFB'].includes(game.sport)) {
    game.livePregameMarket ||= footballLive.pregameMarket(game,current) ||
      footballLive.pregameMarket(game,{...current,odds:game.pregameBaseline?.odds}) ||
      footballLive.pregameMarket(game,{...current,odds:game.recoveredUnderdog?.odds});
    if (accepted) game.verifiedDevelopments=footballLive.mergeDevelopments(game,accepted);
    // Retained scoring facts may establish sustained leadership and overlap;
    // current win probability is always taken from this update alone.
    const surpriseSummary=history ? {...currentSummary,header:{competitions:[current]},
      scoringPlays:history.summary?.scoringPlays,plays:history.summary?.plays,
      winprobability:currentSummary?.winprobability || []} : currentSummary;
    const surprise=footballLive.liveSurprise(legacy,game,current,surpriseSummary,history?.summary || surpriseSummary);
    const gap=Math.abs(Number(game.teams[0][2])-Number(game.teams[1][2]));
    const developments=footballLive.developmentImpact(game,legacy.gameProgress(game.sport,current),gap);
    Object.assign(game,{liveSurprise:surprise,upsetPoints:surprise.points,upsetText:surprise.text});
    const factors=game.factors.filter(f=>!['Underdog threatens upset','Verified live development'].includes(f.label));
    // The new signal already has its own CFB calibration; the old discretionary
    // context multiplier must not scale it a second time.
    if (surprise.points) factors.push({label:'Underdog threatens upset',points:surprise.points,liveSurprise:true});
    if (developments.points) factors.push({label:'Verified live development',points:developments.points});
    const contradictedContexts=(game.qualitativeContexts||[]).filter(c=>
      developments.active.some(d=>(c.text||'').toLowerCase().includes(d.subject.toLowerCase()) &&
        (d.status==='returned' ? /absence/.test(c.type) : /return|first_game_back|confirmed_key_starters/.test(c.type))));
    const contradicted=f=>contradictedContexts.some(c=>c.type===f.contextType);
    const removed=(game.openingFactors||[]).filter(contradicted);
    game.suppressedContextTypes=contradictedContexts.map(c=>c.type);
    // The observed opening score/history is immutable. Only its current live
    // carry is reconciled; preserve non-enumerable source metadata in the clone.
    scoringGame={...game,sourceEvent:game.sourceEvent,sourceCompetition:game.sourceCompetition,factors,
      openingFactors:(game.openingFactors||[]).filter(f=>!contradicted(f)),
      openingScore:game.openingScore-removed.reduce((sum,f)=>sum+f.points,0)};
  }
  const result = candidateGameRating(legacy,history?{...scoringGame,_historicalEvidence:history}:scoringGame,current,currentSummary,basketballCalibration.tensionPolicy(game,current),{...PRODUCTION_POLICY,collegeFinish:true});
  Object.assign(game,{
    score:result.score,baseScore:result.baseScore,live:result.live,
    momentumPoints:result.momentumPoints,trajectoryScoring:result.trajectoryScoring,
    historyOwnership:result.historyOwnership,
    factors:[...result.factors,...(result.historyOwnership?.eventFactors || []),
      ...(result.trajectoryScoring.adjustment ? [{label:'History relevance and trajectory',points:result.trajectoryScoring.adjustment}] : [])],
    modelVersion:MODEL_VERSION,scoringPolicy:PRODUCTION_POLICY.id,
    evidenceQuality:evidence.state,evidenceReasons:evidence.reasons,evidenceCoverage:evidence.coverage,
    inputEvidence:accepted?.sportsRadarEvidence||summary?.sportsRadarEvidence||null,
    scoringPartial:evidence.state!=='complete'||basketball.supports(game)&&!reconciled.rawCurrent
  });
  calculation.set(game,calculation.liveResult(result));
  if (game.sport==='CFB' && isHalftimeStatus(game.liveRawStatus)) game.live.note='';
  game.momentumText = (result.historyOwnership?.eventFactors || []).map(f=>f.label).join(', ');
  if (game.sport==='CFB') game.upsetPoints=result.factors.find(f=>f.label==='Underdog threatens upset')?.points || 0;
  describeCfbQualitySoFar(game,current,validHistory ? accepted || history?.summary : null);
  if(accepted && validHistory && !history && !game.sameStateEvidenceRetained)rememberHistory(game,current,accepted,result);
  if(rawAccepted && validHistory)integrity.rememberInputs(game,current,accepted);
  if(!basketball.supports(game))game.historicalEvidenceRetained=Boolean(history || game.sameStateEvidenceRetained);
  delete game.basketballHistory;
  if(basketball.supports(game))game.lastSummaryAccepted=reconciled.rawCurrent;
  if(basketball.supports(game) && Number.isFinite(game.score) && !game.scoringPartial){
    game.basketballLastTrusted=JSON.parse(JSON.stringify(Object.fromEntries(
      ['score','baseScore','openingScore','rawPregameScore','factors','live','momentumPoints','trajectoryScoring','historyOwnership','why','upsetText','upsetPoints','modelVersion','scoringPolicy']
        .map(key=>[key,game[key]]).filter(([,value])=>value!==undefined))));
  }
  if(['NFL','CFB','NHL'].includes(game.sport) && Number.isFinite(game.score) && !game.scoringPartial){
    game.timedLastTrusted=JSON.parse(JSON.stringify(Object.fromEntries(
      ['score','baseScore','openingScore','rawPregameScore','factors','live','momentumPoints','trajectoryScoring','historyOwnership','why','upsetText','upsetPoints','modelVersion','scoringPolicy']
        .map(key=>[key,game[key]]).filter(([,value])=>value!==undefined))));
  }
  delete game.staleEnrichment;
  return result;
}

function preserveEvidence(game,previous){preserveLiveEvidence(game,previous);basketball.preserveBasketballState(game,previous);basketballUpset.preserveMarket(game,previous);integrity.preserveObservation(game,previous);}
function prepareProviderSummary(game,summary){
 const competition=integrity.reconcileObservation(game,game.sourceCompetition,summary);
 return providerEvidence.normalizeSummary(game,competition,summary);
}
module.exports = {...legacy,...gameFacts,verifiedCfbContextEligible,isHalftimeStatus,playPeriodLabel,displayMoment,canonicalDetailSummary,applyLiveSnapshot,prepareProviderSummary,preservePregameBaseline,preserveLiveEvidence:preserveEvidence,footballLiveExplanation:footballLive.footballLiveExplanation,MODEL_VERSION,POLICY_ID:PRODUCTION_POLICY.id,PRODUCTION_POLICY};
