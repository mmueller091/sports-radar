// Production entry: reuse the reviewed candidate verbatim and the legacy core's
// chronology validator. rating-core.js remains the explicit capture baseline.
const legacy = require('../rating-core.js');
const {candidateGameRating} = require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_WATCHABILITY_POLICY:LIVE_POLICY} = require('../calibration/trajectory-live-policy.cjs');
const MODEL_VERSION = '2026-10-30.cfb-watchability.1';

function applyLiveSnapshot(game, competition, summary) {
  if (game.state !== 'live') return;
  legacy.applyLiveSnapshot(game, competition, summary);
  const current = {...(competition || game.sourceCompetition),
    status:game.liveRawStatus, situation:game.liveRawSituation};
  const accepted = game.lastSummaryAccepted && summary?.header?.competitions?.[0]?.status ? summary : null;
  const result = candidateGameRating(legacy,game,current,accepted,null,LIVE_POLICY);
  Object.assign(game,{
    score:result.score,baseScore:result.baseScore,live:result.live,
    momentumPoints:result.momentumPoints,trajectoryScoring:result.trajectoryScoring,
    historyOwnership:result.historyOwnership,
    factors:[...result.factors,...(result.historyOwnership?.eventFactors || []),
      ...(result.trajectoryScoring.adjustment ? [{label:'History relevance and trajectory',points:result.trajectoryScoring.adjustment}] : [])],
    modelVersion:MODEL_VERSION,scoringPolicy:LIVE_POLICY.id,
    scoringPartial:!accepted
  });
  game.momentumText = (result.historyOwnership?.eventFactors || []).map(f=>f.label).join(', ');
  if (game.sport==='CFB') game.upsetPoints=result.factors.find(f=>f.label==='Underdog threatens upset')?.points || 0;
  delete game.staleEnrichment;
  return result;
}

module.exports = {...legacy,applyLiveSnapshot,MODEL_VERSION,POLICY_ID:LIVE_POLICY.id};
