import {compareGameStates,classifySourceErrors} from './comparison.js';
// Reinterpretation is additive: original findings and recovery events are immutable.
export function reviewHistoricalFindings(data){
  const games=data.games||[],byKey=new Map(games.map(g=>[g.gameKey,g]));
  const peerRows=games.flatMap(g=>(g.observations||[]).map(o=>({game_key:g.gameKey,rating:o.rating,observed_at:o.observedAt,
    evidence:{state:o.state,scoringVersion:o.scoringVersion,qualityEvidence:o.qualityEvidence}})));
  return (data.findings||[]).map(f=>{
    const game=byKey.get(f.gameKey),at=f.firstSeen,obs=game?.observations?.find(o=>o.observedAt===at)||
      game?.observations?.find(o=>o.auditCandidates?.some(c=>c.reasonCode===f.reasonCode));
    const result={gameKey:f.gameKey,reasonCode:f.reasonCode,originalClassification:f.classification,originalStatus:f.status,
      observedAt:at,classification:f.deterministic?'confirmed_defect':'insufficient_evidence',
      reason:f.deterministic?'Deterministic integrity failure remains actionable':'Historical heuristic retained; its original evidence is not proof of a scoring defect',
      supportingObservations:obs?[{gameKey:f.gameKey,observedAt:obs.observedAt,modelVersion:obs.scoringVersion}]:[],
      evidence:null};
    if(f.reasonCode==='SIMILAR_STATE_OUTLIER'&&obs?.state){
      const comparison=compareGameStates({...obs.state,modelVersion:obs.scoringVersion},peerRows,obs.scoringVersion);
      result.evidence=comparison;result.classification=comparison.available?'calibration_hypothesis':'insufficient_evidence';
      result.reason=comparison.available?'Matched peers are available; investigate context before inferring over/underrating':
        'Original broad late/close median is not a valid matched-state comparison. Actual period, remaining clock, model and observed context do not supply five independent peers.';
    }else if(f.reasonCode==='SOURCE_ERRORS'){
      const eventReviews=(f.events||[]).filter(e=>e.type==='opened').map(e=>{
        const observedGames=games.flatMap(g=>{const o=[...(g.observations||[])].filter(o=>o.observedAt<=e.at&&e.at-o.observedAt<=360000).at(-1);return o?.state?[o.state]:[];});
        const refs=(e.evidence?.rawInputReferences||[]).map(r=>typeof r==='string'?r:r.source||r.error||'unknown request');
        return {at:e.at,...classifySourceErrors(refs,observedGames),recordedErrorCount:e.evidence?.observed?.count??null,
          limitation:'Only retained request references were checked; omitted URLs and earlier recovery cannot be reconstructed'};
      });
      result.evidence={eventReviews,activeReferences:eventReviews.reduce((n,r)=>n+r.active.length,0),inactiveReferences:eventReviews.reduce((n,r)=>n+r.inactive.length,0),unknownReferences:eventReviews.reduce((n,r)=>n+r.unknown.length,0)};
      result.classification='data_quality_limitation';
      result.reason='Recurring feed-wide warning mixed active-game failures with non-active requests. Review retained URL scope, freshness and recovery separately; truncated references cannot establish all failures were irrelevant.';
    }else if(f.reasonCode.startsWith('TIMELINE_')){
      const review=game?.retainedTimelineReview;
      if(review){
        result.evidence=review;
        if(review.findings?.some(x=>x.reasonCode===f.reasonCode)){
          result.classification='data_quality_limitation';result.reason='The later retained provider revision still exhibits this anomaly; inspect source corrections and ordering before blaming scoring.';
        }else if(f.reasonCode==='TIMELINE_SCORE_ROLLBACK'&&review.diagnostics?.shootoutTransitions?.length){
          result.classification='expected_behavior';result.reason='Later retained provider plays explicitly switch from regulation/OT totals to shootout attempt totals. This explains the observed warning pattern; the exact original cached revision is unavailable.';
        }else if(f.reasonCode==='TIMELINE_CLOCK_ORDER'&&Object.values(review.diagnostics?.clockEvidence||{}).some(e=>e.mode==='elapsed')){
          result.classification='expected_behavior';result.reason='Later retained play clocks advance as elapsed time alongside wallclock. Treating these as countdown clocks created apparent rollbacks; exact original cached revision unavailable.';
        }else result.reason='The current retained revision does not reproduce the original warning. Correction versus cache ordering cannot be determined without the earlier payload.';
      }else result.reason='Original finding lacks sufficient before/after play evidence; preserve it as unresolved until the provider revision can be inspected.';
    }else if(f.reasonCode==='GAME_SOURCE_STALE'){
      result.classification='data_quality_limitation';result.reason=`Active-game source freshness concern remains valid (${f.status}); exclude affected intervals from calibration and latency claims.`;
    }
    return result;
  });
}
