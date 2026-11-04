// Keep the explicit legacy adapter available to captures and frozen regressions.
// All active feed consumers use this facade and the shared production entry.
import * as legacy from './game-model.js';
import runtime from '../../scoring/live-runtime.cjs';
import football from '../../scoring/football-live.cjs';
import footballMarket from '../../scoring/football-market.cjs';
import cfbContext from '../../scoring/cfb-verified-context.cjs';
import {footballSituation,baseballSituation} from './display-model.js';
export {preservePregameRecords} from './game-model.js';

export function preserveFootballPregameMarket(game,previous=null,now=game.marketAsOf ?? Date.now(),previousObservedAt=null) {
  if(!footballMarket.supports(game))return;
  footballMarket.prepareUpcomingMarket(game,game.sourceCompetition,null,previous,now,previousObservedAt);
  finish(game);
}

export function preserveFootballContext(game,previous=null,rerate=true) {
  if (!['NFL','CFB'].includes(game.sport)) return;
  const same=previous && previous.sport===game.sport && String(previous.id)===String(game.id) &&
    game.teams.map(t=>String(t[8])).sort().join('|')===previous.teams?.map(t=>String(t[8])).sort().join('|');
  const prior=same ? previous : null;
  const market=game.state==='upcoming'
    ? game.pregameMarketQuote && football.pregameMarket(game,game.sourceCompetition,game.pregameMarketQuote.raw)
    : prior?.livePregameMarket || game.livePregameMarket || football.pregameMarket(game,game.sourceCompetition);
  if (market) game.livePregameMarket=market;
  else if(game.state==='upcoming')delete game.livePregameMarket;
  const developments=football.mergeDevelopments(game,null,prior);
  if (developments.length) game.verifiedDevelopments=developments;
  if (rerate) finish(game);
}

function finish(game,summary=null) {
  if (!game) return game;
  runtime.applyLiveSnapshot(game,game.sourceCompetition,summary);
  game.modelVersion=runtime.MODEL_VERSION;
  return game;
}
export function normalizeEvent(...args) {
  const game=legacy.normalizeEvent(...args);
  if(game&&footballMarket.supports(game))Object.defineProperty(game,'marketAsOf',{value:Date.now(),writable:true,configurable:true,enumerable:false});
  return finish(game);
}
export function applyContextsToGame(game,factors,now=Date.now()) {
  if(game.sport==='CFB'&&Array.isArray(factors))factors=factors.filter(f=>!f?.registryVersion||cfbContext.verifiedCfbContextEligible(f,game,now));
  const changed=legacy.applyContextsToGame(game,factors);
  if (changed) finish(game);
  return changed;
}
export function enrichGame(game,summary,previousGame=null) {
  if(game.state==='completed' && summary?.header?.competitions?.[0]?.status?.type?.state==='pre'){
    game.scoringPartial=true;game.summaryLifecycleRejected=true;return;
  }
  // Completed ratings read provider progression, never recorded rating history.
  // An impossible ledger must not earn retrospective competitiveness bonuses.
  const scoring=summary?.scoringPlays?.length?summary.scoringPlays:(summary?.plays||[]).filter(p=>p.scoringPlay);
  if(game.state==='completed' && ['NFL','CFB','NBA','NCAAB'].includes(game.sport) && scoring?.some(p=>
     p.homeScore!=null&&p.awayScore!=null&&(!Number.isFinite(Number(p.homeScore))||!Number.isFinite(Number(p.awayScore))||
     Number(p.homeScore)>Number(game.teams[1][2])||Number(p.awayScore)>Number(game.teams[0][2])))){
    summary={...summary,scoringPlays:[],plays:[],drives:undefined,winprobability:[]};
    game.scoringHistoryRejected=true;
  }
  if(footballMarket.supports(game))footballMarket.prepareUpcomingMarket(game,game.sourceCompetition,summary,previousGame);
  preserveFootballContext(game,previousGame,false);
  runtime.preservePregameBaseline(game,previousGame);
  runtime.preserveLiveEvidence(game,previousGame);
  summary=runtime.prepareProviderSummary(game,summary);
  if(game.state==='live'&&game.timingUncertain){
    // Recheck with the newly acquired summary: it may contain a corroborated
    // play clock. Until then, do not let legacy enrichment score a false buzzer.
    finish(game,summary);
    if(game.timingUncertain)return;
  }
  legacy.enrichGame(game,summary,game.liveEvidenceReset==='score-correction' ? null : previousGame?.modelVersion===runtime.MODEL_VERSION ? previousGame : null,runtime.playPeriodLabel);
  finish(game,summary);
  if(['NFL','CFB'].includes(game.sport))game.footballSituation=footballSituation(game,summary);
  if(game.sport==='MLB')game.baseballSituation=baseballSituation(game);
  if(game.state==='completed' && ['NFL','CFB','NBA','NCAAB','NHL'].includes(game.sport)){
    const facts=runtime.completedGameFacts(game,summary);
    if(facts&&(facts.comeback||facts.quarterbackChange||facts.redemption))game.completedFacts=facts;
    const play=runtime.decisiveScoringPlay(game,summary);
    if(play){game.momentLabel='Decisive play';game.moment=[runtime.playPeriodLabel(game,play,summary,`Period ${play.period?.number}`),play.clock?.displayValue,play.text||play.shortText].filter(Boolean).join(' · ');}
    else if(game.moment)game.momentLabel='Last score';
  }
}
