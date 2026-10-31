const {isHalftimeStatus} = require('./shared/time.js');
// Production entry: reuse the reviewed candidate verbatim and the legacy core's
// chronology validator. rating-core.js remains the explicit capture baseline.
const legacy = require('../rating-core.js');
const {candidateGameRating} = require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_COMPETITION_POLICY:LIVE_POLICY} = require('../calibration/trajectory-live-policy.cjs');
const {prepareFootballOpening,preservePregameBaseline} = require('./football-transition.cjs');
const PRODUCTION_POLICY = Object.freeze({...LIVE_POLICY,id:LIVE_POLICY.id+'-football-transition',footballTransition:true});
const MODEL_VERSION = '2026-10-31.football-transition.1';

function applyLiveSnapshot(game, competition, summary) {
  prepareFootballOpening(legacy,game,competition || game.sourceCompetition,null);
  if (game.state !== 'live') return;
  legacy.applyLiveSnapshot(game, competition, summary);
  const current = {...(competition || game.sourceCompetition),
    status:game.liveRawStatus, situation:game.liveRawSituation};
  const accepted = game.lastSummaryAccepted && summary?.header?.competitions?.[0]?.status ? summary : null;
  prepareFootballOpening(legacy,game,competition || game.sourceCompetition,accepted);
  if (['NFL','CFB'].includes(game.sport)) {
    const upset=legacy.upsetImpact(game.underdog,game.teams,'live',legacy.gameProgress(game.sport,current),game.sport,current);
    game.factors=game.factors.filter(f=>f.label!=='Underdog threatens upset');
    if (upset.points) game.factors.push({label:'Underdog threatens upset',points:upset.points});
    game.upsetPoints=upset.points;game.upsetText=upset.text;
  }
  const result = candidateGameRating(legacy,game,current,accepted,null,PRODUCTION_POLICY);
  Object.assign(game,{
    score:result.score,baseScore:result.baseScore,live:result.live,
    momentumPoints:result.momentumPoints,trajectoryScoring:result.trajectoryScoring,
    historyOwnership:result.historyOwnership,
    factors:[...result.factors,...(result.historyOwnership?.eventFactors || []),
      ...(result.trajectoryScoring.adjustment ? [{label:'History relevance and trajectory',points:result.trajectoryScoring.adjustment}] : [])],
    modelVersion:MODEL_VERSION,scoringPolicy:PRODUCTION_POLICY.id,
    scoringPartial:!accepted
  });
  if (game.sport==='CFB' && isHalftimeStatus(game.liveRawStatus)) game.live.note='';
  game.momentumText = (result.historyOwnership?.eventFactors || []).map(f=>f.label).join(', ');
  if (game.sport==='CFB') game.upsetPoints=result.factors.find(f=>f.label==='Underdog threatens upset')?.points || 0;
  delete game.staleEnrichment;
  return result;
}

module.exports = {...legacy,isHalftimeStatus,applyLiveSnapshot,preservePregameBaseline,MODEL_VERSION,POLICY_ID:PRODUCTION_POLICY.id,PRODUCTION_POLICY};
