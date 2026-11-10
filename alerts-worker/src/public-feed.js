import runtime from '../../scoring/live-runtime.cjs';

// The compact website view is a projection of the same accepted revision.
// Keep display/context fields intact; only omit duplicate and server-only state.
export function publicFeed(feed,{compact=false}={}) {
  const result={...feed,games:feed.games.map(game=>({
    ...game,
    ...(game.moment?{moment:runtime.displayMoment(game)}:{}),
    basketballEvidence:undefined,providerEventRevisions:undefined,observationEvidence:undefined,
    ...(compact ? {
      scoreboard:undefined,verifiedLiveEvidence:undefined,manpowerEvidence:undefined,
      liveInputEvidence:undefined,priorObservation:undefined,
      basketballLastTrusted:undefined,timedLastTrusted:undefined
    } : game.scoreboard ? {scoreboard:{...game.scoreboard,
      basketballEvidence:undefined,providerEventRevisions:undefined,observationEvidence:undefined
    }} : {})
  }))};
  if (compact) {
    delete result.enrichment;
    delete result.scoreCalculations;
  }
  return result;
}
