// Comparisons require observed context, distinct games and one model version.
import {auditNumber,normalizeAuditRating} from './rating-evidence.js';
const n=auditNumber;
const parse=v=>{try{return typeof v==='string'?JSON.parse(v):v||{};}catch{return {};}};
const seconds=v=>{const m=/^(\d+):(\d{2})(?:\.\d+)?$/.exec(String(v??''));return m&&+m[2]<60?+m[1]*60+ +m[2]:null;};
function context(game,quality={}){
  const ids=(game.teams||[]).map(t=>String(t?.[8]??'')),r=game.liveRawSituation||{};
  const possession=String(quality.possession??r.possession?.id??r.possession??'');
  const own=ids.indexOf(possession),scores=(game.teams||[]).map(t=>n(t[2]));
  const market=quality.market??game.liveUpset?.market??game.liveSurprise?.market;
  const dog=market?ids.indexOf(String(market.teamId)):-1;
  return {pregame:n(game.openingScore),marketSpread:n(market?.spread),
    underdogMargin:dog>=0&&scores.every(v=>v!==null)?scores[dog]-scores[1-dog]:n(quality.underdogMargin),
    possessionRole:own>=0&&scores.every(v=>v!==null)?Math.sign(scores[own]-scores[1-own]):null,
    manpower:n(quality.manpower?.advantage??game.live?.sportImpact?.manpower?.advantage),
    goaliePulled:quality.goaliePulled??game.live?.sportImpact?.manpower?.pulled??null,
    stakes:quality.verifiedSignificance?.verified===true?JSON.stringify(quality.verifiedSignificance):null,
    recentScoringEvents:n(game.trajectoryScoring?.recovery?.scoringEvents),
    pressure:n(game.live?.components?.pressure)};
}
export function compareGameStates(game,peers=[],modelVersion=game.modelVersion){
  const raw=game.liveRawStatus||{},period=n(raw.period),clock=seconds(raw.displayClock),scores=(game.teams||[]).map(t=>n(t[2]));
  const margin=scores.length===2&&scores.every(v=>v!==null)?Math.abs(scores[0]-scores[1]):null;
  const target=context(game),matched=new Map(),rejected={},missing=new Set();
  const reject=reason=>{rejected[reason]=(rejected[reason]||0)+1;};
  // Narrower windows for decisive endings. Early third-period hockey is never
  // compared to the final minute just because both occupy a broad storage bucket.
  const tolerance=clock!==null&&clock<=120?30:clock!==null&&clock<=300?60:120;
  for(const row of peers){
    const e=parse(row.evidence),g=e.state||row.state||{},key=row.game_key||row.gameKey||`${g.sport}:${g.id}`;
    const model=e.scoringVersion||row.model_version||row.modelVersion||g.modelVersion;
    if(!key||key==='undefined:undefined'||key===`${game.sport}:${game.id}`){reject('identity');continue;}
    if(!modelVersion||!model||model!==modelVersion){reject('model');continue;}
    const rr=g.liveRawStatus||{},pp=n(row.period??rr.period),pc=n(row.clock_seconds)??seconds(rr.displayClock);
    const ss=row.score_a!==undefined?[n(row.score_a),n(row.score_b)]:(g.teams||[]).map(t=>n(t[2]));
    const pm=ss.length===2&&ss.every(v=>v!==null)?Math.abs(ss[0]-ss[1]):null;
    if((g.sport||row.sport)!==game.sport||g.state!=='live'||g.liveRawStatus?.type?.completed||g.detailStale||e.qualityEvidence?.rejected){reject('lifecycle-or-source');continue;}
    if(period===null||pp!==period||clock===null||pc===null||Math.abs(pc-clock)>tolerance||pm!==margin){reject('period-clock-margin');continue;}
    const other=context(g,e.qualityEvidence),dimensions=[];let mismatch=false;
    for(const field of Object.keys(target)){
      const a=target[field],b=other[field];if(a===null||b===null){missing.add(field);continue;}
      const distance=typeof a==='number'&&typeof b==='number'?Math.abs(a-b):a===b?0:Infinity;
      const bound=field==='pregame'?10:field==='marketSpread'?3:field==='pressure'?1:0;
      if(distance>bound){mismatch=true;break;}dimensions.push(field);
    }
    if(mismatch){reject('context-mismatch');continue;}
    if(dimensions.length<2){reject('context-unavailable');continue;}
    const normalizedRating=normalizeAuditRating(row.rating??g.score,g),rating=normalizedRating.rating;
    if(rating===null||normalizedRating.malformed){reject('rating');continue;}
    const candidate={gameKey:key,rating,observedAt:row.observed_at??row.observedAt??null,modelVersion:model,period:pp,clockSeconds:pc,
      clockDistanceSeconds:Math.abs(pc-clock),margin:pm,matchedDimensions:['sport','model','lifecycle','period','clock','margin',...dimensions],
      matchQuality:dimensions.length>=5?'close':'partial',missingDimensions:[...missing]};
    const previous=matched.get(key);if(!previous||candidate.clockDistanceSeconds<previous.clockDistanceSeconds)matched.set(key,candidate);
  }
  const samples=[...matched.values()].sort((a,b)=>a.clockDistanceSeconds-b.clockDistanceSeconds),ratings=samples.map(p=>p.rating).sort((a,b)=>a-b);
  const enough=samples.length>=5;
  return {available:enough,classification:enough?'calibration_hypothesis':'insufficient_evidence',minimumIndependentGames:5,
    gamesMatched:samples.length,candidatesExamined:peers.length,clockToleranceSeconds:tolerance,modelVersion:modelVersion??null,
    median:enough?ratings[Math.floor(ratings.length/2)]:null,samples,rejected,missingDimensions:[...missing],
    explanation:enough?'Observed matched states; residual stakes, pressure and sample selection can still explain differences':'Insufficient independent same-model games with period, actual clock, margin and at least two observed context dimensions'};
}
export function classifySourceErrors(errors=[],games=[]){
  const active=[],inactive=[],unknown=[];
  for(const error of errors){
    const raw=typeof error==='string'?error:JSON.stringify(error),match=/[?&]event=(\d+)/.exec(raw);
    const matched=match?games.filter(g=>String(g.id)===match[1]):games.filter(g=>g.providerPath&&raw.includes('/'+g.providerPath+'/scoreboard'));
    const entry={error,gameKeys:matched.map(g=>`${g.sport}:${g.id}`)};
    if(matched.some(g=>g.state==='live'))active.push(entry);
    else if(matched.length||match)inactive.push({...entry,reason:matched.length?'non-live game':'request event is not an active canonical game'});
    else unknown.push(entry);
  }
  return {active,inactive,unknown,total:errors.length,activeGames:[...new Set(active.flatMap(e=>e.gameKeys))],
    classification:active.length?'data_quality_limitation':unknown.length?'insufficient_evidence':'expected_behavior',
    limitation:'URL matching establishes request scope, not whether a failed refresh was recovered by cached data; consult game freshness'};
}
