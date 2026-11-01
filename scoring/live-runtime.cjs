const {isHalftimeStatus} = require('./shared/time.js');
// Production entry: reuse the reviewed candidate verbatim and the legacy core's
// chronology validator. rating-core.js remains the explicit capture baseline.
const legacy = require('../rating-core.js');
const {candidateGameRating} = require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_COMPETITION_POLICY:LIVE_POLICY} = require('../calibration/trajectory-live-policy.cjs');
const {prepareOpening,preservePregameBaseline} = require('./opening-transition.cjs');
const {preserveLiveEvidence,historyFor,rememberHistory,currentManpower,validLedger}=require('./live-evidence.cjs');
const PRODUCTION_POLICY = Object.freeze({...LIVE_POLICY,id:LIVE_POLICY.id+'-opening-transition',footballTransition:true,openingTransition:true});
const MODEL_VERSION = '2026-11-01.live-evidence.1';

function retainSettledCfbPath(game,current,summary) {
  if (game.sport!=='CFB' || !summary || Number(current.status?.period)!==4) return;
  const seconds=legacy.clockSeconds(current.status),gap=Math.abs(Number(game.teams[0][2])-Number(game.teams[1][2]));
  if (seconds===null || seconds>120 || gap===0) return;
  const x=Math.max(0,Math.min(1,(120-seconds)/120)),weight=x*x*(3-2*x);
  if (!weight) return;
  const competition={...current,status:{...current.status,type:{state:'post',completed:true,detail:'Final'}}};
  const teams=game.teams.map(t=>({name:t[0],abbr:t[1],score:t[2],record:t[5],rank:t[6],id:t[8]}));
  const rating=legacy.rateGame('CFB','completed',teams,game.sourceEvent,competition,game.context || '');
  const finalGame={...game,state:'completed',score:rating.score,factors:rating.factors,upsetPoints:rating.upsetPoints,sourceCompetition:competition};
  const finish=legacy.defensiveFinishFactor('CFB',summary)?.points||0;
  const history=legacy.momentumImpact('CFB',summary,1,'completed',{game:finalGame,finishPoints:finish});
  const target=legacy.clampScore(rating.score+history.points+finish);
  // Retain verified past drama as opportunities expire, while a genuinely
  // threatening current drive keeps all of its immediate tension.
  const delta=Math.round(Math.max(0,target-game.score)*weight);
  if (delta) {
    game.score=legacy.clampScore(game.score+delta);
    game.factors.push({label:'Competitive path retained as clock expires',points:delta});
  }
}

function applyLiveSnapshot(game, competition, summary) {
  prepareOpening(legacy,game,competition || game.sourceCompetition,null);
  if (game.state !== 'live') return;
  legacy.applyLiveSnapshot(game, competition, summary);
  const current = {...(competition || game.sourceCompetition),
    ...(game.sport==='NFL' ? {season:{...game.sourceEvent?.season,...game.sourceCompetition?.season,...competition?.season}} : {}),
    status:game.liveRawStatus, situation:game.liveRawSituation};
  const accepted = game.lastSummaryAccepted && summary?.header?.competitions?.[0]?.status ? summary : null;
  const validHistory=!accepted || validLedger(accepted,current,game.sport);
  if(!validHistory){delete game.verifiedLiveEvidence;delete game.manpowerEvidence;}
  const ratingSummary=validHistory ? accepted : {...accepted,scoringPlays:[],plays:[],drives:undefined,winprobability:[]};
  delete game.manpowerRetained;
  const effective=currentManpower(game,current,ratingSummary);
  const history=historyFor(game,current,accepted);
  const latestProbability=effective?.winprobability?.at(-1);
  const unanchoredProbability=history && latestProbability && (latestProbability.playId==null || !(effective.plays||[]).some(p=>String(p.id)===String(latestProbability.playId)));
  const currentSummary=unanchoredProbability ? {...effective,winprobability:[]} : effective;
  prepareOpening(legacy,game,competition || game.sourceCompetition,accepted);
  if (['NFL','CFB'].includes(game.sport)) {
    const upset=legacy.upsetImpact(game.underdog,game.teams,'live',legacy.gameProgress(game.sport,current),game.sport,current);
    game.factors=game.factors.filter(f=>f.label!=='Underdog threatens upset');
    if (upset.points) game.factors.push({label:'Underdog threatens upset',points:upset.points});
    game.upsetPoints=upset.points;game.upsetText=upset.text;
  }
  const result = candidateGameRating(legacy,history?{...game,_historicalEvidence:history}:game,current,currentSummary,null,PRODUCTION_POLICY);
  Object.assign(game,{
    score:result.score,baseScore:result.baseScore,live:result.live,
    momentumPoints:result.momentumPoints,trajectoryScoring:result.trajectoryScoring,
    historyOwnership:result.historyOwnership,
    factors:[...result.factors,...(result.historyOwnership?.eventFactors || []),
      ...(result.trajectoryScoring.adjustment ? [{label:'History relevance and trajectory',points:result.trajectoryScoring.adjustment}] : [])],
    modelVersion:MODEL_VERSION,scoringPolicy:PRODUCTION_POLICY.id,
    scoringPartial:!accepted || !validHistory
  });
  if (game.sport==='CFB' && isHalftimeStatus(game.liveRawStatus)) game.live.note='';
  game.momentumText = (result.historyOwnership?.eventFactors || []).map(f=>f.label).join(', ');
  if (game.sport==='CFB') game.upsetPoints=result.factors.find(f=>f.label==='Underdog threatens upset')?.points || 0;
  retainSettledCfbPath(game,current,accepted);
  if(accepted && validHistory && !history)rememberHistory(game,current,accepted,result);
  game.historicalEvidenceRetained=Boolean(history);
  delete game.staleEnrichment;
  return result;
}

module.exports = {...legacy,isHalftimeStatus,applyLiveSnapshot,preservePregameBaseline,preserveLiveEvidence,MODEL_VERSION,POLICY_ID:PRODUCTION_POLICY.id,PRODUCTION_POLICY};
