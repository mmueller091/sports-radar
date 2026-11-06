import {AUDIT_SCOPE_VERSION,AUDIT_SPORTS,auditAnalysisGameAllowed,grandSlam} from './scope.js';
// Observation-only diagnostics. No scorer, provider, AI, alert or database imports.
import {captureEvidenceDetails} from './evidence.js';
import {auditQualitativeContext} from './qualitative-quality.js';
import {buildEventResponses} from './event-response.js';
import {auditNumber,normalizeAuditRating} from './rating-evidence.js';
import {lifecycleOf,observationReference,remainingTime,measurableInterval,thresholdAnalysis,volatilityAnalysis,comebackAnalysis,observationSummary,eligibleRating} from './trajectory-quality.js';
export const QUALITY_VERSION = '2026-11-06.audit-quality.1';
export const QUALITY_SPORTS = AUDIT_SPORTS;
export const THRESHOLDS = [70,80,85,90,95];
const number=auditNumber;
const time=v=>typeof v==='number'?number(v):typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const bool=v=>typeof v==='boolean'?v:null;
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const reg={NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3};
const wide={NFL:17,CFB:21,NBA:20,NCAAB:18,NHL:3,MLB:5};
const comeback={NFL:14,CFB:14,NBA:15,NCAAB:12,NHL:2,MLB:3};
export function clockSeconds(value){
  const s=String(value??'');
  const m=/^(\d+):(\d{2})(?:\.(\d+))?$/.exec(s);
  if(m&&+m[2]<60)return +m[1]*60+ +m[2]+(m[3]?Number('0.'+m[3]):0);
  return /^\d{1,2}\.\d+$/.test(s)?Number(s):null;
}
const factorPoints=(g,re)=>(g.factors||[]).filter(f=>re.test(f.label||'')).reduce((sum,f)=>sum+(number(f.points)||0),0);
const historyPoints=g=>(g.factors||[]).filter(f=>/history|comeback|recovery|erased.*deficit|lead change|trajectory|sustained|win.chance swing/i.test(f.label||''))
  .reduce((sum,f)=>sum+Math.max(0,number(f.points)||0),0);
const probability=value=>{const n=typeof value==='boolean'?null:number(value);return n!==null&&n>=0&&n<=1?n:null;};
function marketEvidence(market){
  if(!market)return null;
  const quotedAt=time(market.quotedAt),reportedAt=time(market.reportedAt);
  return {...pick(market,['teamId','teamName','side','spread','probability','source','observed']),
    quotedAt:quotedAt??reportedAt,reportedAt,
    timestampSource:quotedAt!==null?(market.timestampSource||'quotedAt'):reportedAt!==null?'reportedAt':null};
}
function underdogProbability(game,market){
  const ids=(game.teams||[]).map(t=>String(t?.[8]??'')),side=ids.indexOf(String(market?.teamId??''));
  if(!market||side<0||side>1)return {value:null,source:null};
  const supplied=probability(game.liveUpset?.currentProbability??game.liveSurprise?.currentProbability);
  if(supplied!==null)return {value:supplied,source:'producer-underdog-probability'};
  const home=probability(game.live?.winProbability);
  return home===null?{value:null,source:null}:{value:side===1?home:1-home,source:'canonical-home-win-probability; team-mapped'};
}
function eventAtState(game,p,publishedAt){
  if(!p?.id)return null;
  const status=game.liveRawStatus||{},scores=(game.teams||[]).map(t=>number(t[2]));
  // An independently cached summary can be ahead of the rated feed. Only an
  // event attached to this exact canonical state is admissible here.
  if(number(p.period?.number)!==number(status.period)||scores.length!==2||scores.some(x=>x===null)||
    number(p.awayScore)!==scores[0]||number(p.homeScore)!==scores[1])return null;
  const eventClock=clockSeconds(p.clock?.displayValue),currentClock=clockSeconds(status.displayClock);
  if(currentClock!==null&&eventClock!==currentClock)return null;
  const occurredAt=time(p.wallclock);
  if(occurredAt!==null&&(publishedAt===null||occurredAt>publishedAt))return null;
  const text=String(p.text||p.type?.text||'').slice(0,300);
  if(!p.scoringPlay&&!/turnover|intercept|fumble|fourth.down|match point|break point|home run|goal|penalty|strikeout/i.test(text))return null;
  return {id:String(p.id),text,scoringPlay:p.scoringPlay===true,occurredAt,
    timestampKind:occurredAt===null?'unavailable':'provider-event-wallclock',period:number(p.period?.number),clock:p.clock?.displayValue||null};
}
export function captureQualityEvidence(game,options={}){
  const {publishedAt=null,observedAt=null}=options;
  const g=game||{},r=g.liveRawSituation||{},c=g.sourceCompetition||{},sport=g.sport;
  const ids=(g.teams||[]).map(t=>String(t?.[8]??''));
  const possession=String(r.possession?.id??r.possession??'');
  const market=g.liveUpset?.market||g.liveSurprise?.market||null;
  const sides=(g.teams||[]).map(t=>number(t?.[2]));
  const dogIndex=market?ids.indexOf(String(market.teamId)): -1;
  const dogProbability=underdogProbability(g,market);
  const context=String(g.context||'');
  const publication=time(publishedAt);
  const batting=String(r.battingTeamId??(['away','home'].includes(r.battingSide)?ids[r.battingSide==='away'?0:1]:'')??'');
  const quality={version:QUALITY_VERSION,source:'retained-canonical-state',publishedAt:publication,observedAt:time(observedAt),
    possession:ids.includes(possession)&&possession?possession:null,
    down:number(r.down),distance:number(r.distance),yardsToEndzone:number(r.yardsToEndzone),
    timeouts:[number(r.awayTimeouts),number(r.homeTimeouts)],
    fouls:r.fouls??null,bonus:r.bonus??null,shotClock:number(r.shotClock),
    outs:number(r.outs),bases:[bool(r.onFirst),bool(r.onSecond),bool(r.onThird)],
    battingTeamId:batting&&ids.includes(batting)?batting:null,
    powerPlayTeamId:r.powerPlayTeamId&&ids.includes(String(r.powerPlayTeamId))?String(r.powerPlayTeamId):null,
    goaliePulled:bool(r.goaliePulled),pressure:r.pressure?.verified===true?pick(r.pressure,['source','observedAt','shots','attempts','expectedGoals']):null,
    noHitBid:bool(r.noHitBid),bestOf:number(c.format?.regulation?.periods??c.format?.bestOf),
    matchPoint:bool(r.matchPoint??r.isMatchPoint),breakPoint:bool(r.breakPoint??r.isBreakPoint),
    breakOfServe:bool(r.breakOfServe),tiebreak:bool(r.tiebreak??r.isTiebreak),
    grandSlam:grandSlam(g),
    stakes:/playoff|postseason|elite (?:8|eight)|sweet (?:16|sixteen)|final four|world series|super bowl|stanley cup final|nba finals|national championship/i.test(context),
    championship:/world series|super bowl|stanley cup final|nba finals|national championship|grand slam final/i.test(context),
    market:marketEvidence(market),
    underdogMargin:dogIndex>=0&&sides.every(x=>x!==null)?sides[dogIndex]-sides[1-dogIndex]:null,
    underdogProbability:dogProbability.value,underdogProbabilitySource:dogProbability.source,
    winProbability:probability(g.live?.winProbability),
    historyPoints:historyPoints(g),
    stakesPoints:factorPoints(g,/postseason|championship|final round/i),
    event:eventAtState(g,r.lastPlay,publication),
    evidenceQuality:g.evidenceQuality??null,scoringPartial:g.scoringPartial===true,
    rejected:Boolean(g.detailStale||g.timingUncertain||g.liveUpdateRejected||g.basketballUpdateRejected||g.summaryLifecycleRejected||g.scoringHistoryRejected),
    // Acquisition/scan/event time is NOT a provider publication timestamp.
    providerPublication:null,providerPublicationLatencyMs:null,
    ...captureEvidenceDetails(game,options)};
  return quality;
}
function point(observation,game){
  const g=observation.state||{},raw=g.liveRawStatus||{},at=time(observation.observedAt);
  const fallback=captureQualityEvidence(g,{publishedAt:observation.feedUpdatedAt,observedAt:at});
  const q={...fallback,...(observation.qualityEvidence||{})};
  // Legacy capture fields may omit information present in the same retained
  // canonical state. Recover only that state, never a later provider revision.
  q.market=marketEvidence(q.market?{...(fallback.market||{}),...q.market}:fallback.market);
  q.underdogProbability=probability(q.underdogProbability)??fallback.underdogProbability;
  if(probability(observation.qualityEvidence?.underdogProbability)===null)q.underdogProbabilitySource=fallback.underdogProbabilitySource;
  q.winProbability=probability(q.winProbability);
  if(g.sport==='NHL'&&(fallback.manpowerEvidenceStatus==='unverified'||q.rejected||q.scoringPartial||q.evidenceQuality==='invalid')){
    q.reportedManpower=q.reportedManpower??q.manpower??fallback.reportedManpower;
    q.manpower=null;q.goaliePulled=null;q.powerPlayTeamId=null;q.manpowerEvidenceStatus='unverified';
    q.goalieEvidenceSource=fallback.goalieEvidenceSource;q.goalieEvidenceScope=fallback.goalieEvidenceScope;
  }
  q.timeouts=Array.isArray(q.timeouts)&&q.timeouts.length===2?q.timeouts.map(number):[null,null];
  q.bases=Array.isArray(q.bases)&&q.bases.length===3?q.bases.map(bool):[null,null,null];
  if(g.factors)q.historyPoints=historyPoints(g);
  const sourceScores=observation.scores||g.teams?.map(t=>t[2])||[];
  const scores=Array.isArray(sourceScores)?sourceScores.map(number):[];
  const period=number(observation.period??raw.period),clock=number(observation.clockSeconds)??clockSeconds(raw.displayClock);
  const ratingInterpretation=normalizeAuditRating(Object.hasOwn(observation,'rawRating')?observation.rawRating:observation.rating,g);
  const rating=ratingInterpretation.rating,sport=game.sport==='NCAAM'?'NCAAB':game.sport;
  const publication=q.publishedAt??time(observation.feedUpdatedAt),modelVersion=observation.scoringVersion||'unknown';
  const lifecycle=lifecycleOf(g,sport,period,scores),gaps=[];
  gaps.push(...(observation.sourceReference?.missingSituationFields||[]));
  if(observation.sourceReference?.trajectoryGapBefore)gaps.push('Retained trajectory gap before this observation; continuity and response claims do not cross the gap');
  if(observation.sourceReference?.excludedHistory?.length)gaps.push(`${observation.sourceReference.excludedHistory.length} earlier contradictory archive events excluded`);
  if(!observation.qualityEvidence)gaps.push('Legacy observation lacks structured quality evidence; only retained fields are recovered');
  if(publication===null)gaps.push('Canonical refresh reference unavailable; snapshot acquisition is not publication');
  if(modelVersion==='unknown')gaps.push('Scoring model attribution unavailable');
  if(q.evidenceQuality!=='complete')gaps.push('Complete scoring progression evidence not established');
  if(ratingInterpretation.unavailable)gaps.push('Canonical rating unavailable; numeric change and threshold claims withheld');
  if(ratingInterpretation.legacyNullCoercion)gaps.push(ratingInterpretation.reason);
  const integrity=(observation.auditCandidates||[]).filter(f=>f.deterministic&&
    !(ratingInterpretation.legacyNullCoercion&&f.reasonCode==='RATING_OUT_OF_RANGE')).map(f=>f.reasonCode);
  if(observation.sourceReference?.normalizedStateValid===false)integrity.push('NORMALIZED_STATE_INVALID');
  if(ratingInterpretation.malformed)integrity.push('INVALID_RATING');
  if(scores.length!==2||scores.some(n=>n===null||n<0||!Number.isInteger(n)))integrity.push('INVALID_SCORE');
  if(period!==null&&(!Number.isInteger(period)||period<1||period>20))integrity.push('INVALID_PERIOD');
  if(clock!==null&&clock<0)integrity.push('INVALID_CLOCK');
  if(g.modelVersion&&observation.scoringVersion&&g.modelVersion!==observation.scoringVersion){
    integrity.push('MODEL_ATTRIBUTION_CONFLICT');gaps.push('Stored row model disagrees with retained canonical state model');
  }
  const stale=at!==null&&publication!==null&&(publication>at||at-publication>180000);
  if(stale)gaps.push('Canonical refresh reference is future-dated or stale');
  if(q.rejected||q.scoringPartial)gaps.push('Rejected, stale or partial scoring evidence');
  if(lifecycle==='unknown')gaps.push('Live lifecycle not established');
  const required={
    canonicalIdentity:Boolean(g.id&&g.sport),rating:rating!==null,scores:scores.length===2&&scores.every(x=>x!==null),
    period:period!==null,model:modelVersion!=='unknown',lifecycle:lifecycle!=='unknown',
    pregameQuality:q.pregameTeamQuality!==null&&q.pregameTeamQuality!==undefined,
    verifiedMarket:Boolean(q.market?.source&&q.market?.quotedAt),
    ...(['NFL','CFB'].includes(sport)?{clock:clock!==null,possession:Boolean(q.possession),down:q.down!==null,distance:q.distance!==null,fieldPosition:q.yardsToEndzone!==null,timeouts:q.timeouts.every(x=>x!==null)}:{}),
    ...(['NBA','NCAAB'].includes(sport)?{clock:clock!==null,possession:Boolean(q.possession),fouls:q.fouls!==null,bonus:q.bonus!==null,shotClock:q.shotClock!==null}:{}),
    ...(sport==='NHL'?{clock:clock!==null,manpower:Boolean(q.manpower),goalie:q.goaliePulled!==null}:{}),
    ...(sport==='MLB'?{outs:q.outs!==null,bases:q.bases.every(x=>x!==null),battingSide:Boolean(q.battingTeamId)}:{}),
    ...(sport==='Tennis'?{format:q.bestOf!==null,matchPoint:q.matchPoint!==null,breakPoint:q.breakPoint!==null,tiebreak:q.tiebreak!==null}:{})};
  const fieldCoverage={present:Object.keys(required).filter(k=>required[k]),missing:Object.keys(required).filter(k=>!required[k]),scope:'Verified situation and expectation fields; timestamp latency completeness assessed separately'};
  const retained=Boolean(observation.state&&Object.keys(observation.state).length);
  const evidenceStatus=integrity.length||q.rejected||stale||q.evidenceQuality==='invalid'||q.retainedEvidenceStatus==='invalid'?'invalid':!retained&&!observation.qualityEvidence?'unavailable':
    fieldCoverage.missing.length===0&&!q.scoringPartial?'complete':'partial';
  return {gameKey:game.gameKey,matchup:game.matchup||game.gameKey,sport,observedAt:at,publishedAt:publication,
    timestampKind:'canonical-refresh-start reference; not provider publication',
    modelVersion,feedRevision:observation.feedRevision||null,runId:observation.runId??null,
    rating,rawRating:ratingInterpretation.rawRating,ratingInterpretation,scores,period,clockSeconds:clock,phase:g.live?.phase||g.status||null,
    margin:scores.length===2&&scores.every(x=>x!==null)?Math.abs(scores[0]-scores[1]):null,
    q,gaps,integrity,live:lifecycle==='live',lifecycle,evidenceStatus,fieldCoverage,structuredEvidence:Boolean(observation.qualityEvidence),
    components:g.factors||[],baseScore:number(g.baseScore),openingScore:number(g.openingScore),
    scalarComponents:{baseScore:number(g.baseScore),liveBonus:number(g.live?.bonus),momentumPoints:number(g.momentumPoints),trajectoryAdjustment:number(g.trajectoryScoring?.adjustment)},
    pregameQuality:q.pregameTeamQuality??null,
    historical:observation.provenance==='causal-reconstruction',provenance:observation.provenance||'audit-observation',
    event:observation.sourceEvent||q.event,
    sourceReference:observation.sourceReference||{rawInputReferences:observation.rawInputReferences||[]}};
}
function inspect(p,history){
  const {sport,period,clockSeconds:t,margin:m,q}=p,signals=[],gaps=[...p.gaps];
  const late=reg[sport]&&period>=reg[sport],ot=reg[sport]&&period>reg[sport];
  const need=(test,label)=>{if(!test)gaps.push(label);};
  if(['NFL','CFB'].includes(sport)){
    need(q.possession,'Possession unavailable');need(q.down!==null&&q.distance!==null,'Down/distance unavailable');
    need(q.yardsToEndzone!==null,'Field position unavailable');need(q.timeouts.every(n=>n!==null),'Timeouts unavailable');need(t!==null,'Remaining clock unavailable');
    if((ot||late&&t!==null&&t<=120)&&m!==null&&m<=8&&q.possession&&q.down!==null&&q.distance!==null&&q.yardsToEndzone!==null)
      signals.push('Decisive football possession');
    if(late&&m<=8&&q.down===4&&q.yardsToEndzone!==null&&q.yardsToEndzone<=40)signals.push('Meaningful fourth down');
  }else if(['NBA','NCAAB'].includes(sport)){
    need(q.possession,'Possession unavailable');need(q.fouls!==null,'Foul evidence unavailable');need(q.bonus!==null,'Bonus evidence unavailable');need(q.shotClock!==null,'Shot clock unavailable');
    if(late&&t!==null&&t>0&&t<=120&&m!==null&&m<=3)signals.push(q.possession?'Decisive basketball possession':'Late one-possession game; possession unknown');
  }else if(sport==='NHL'){
    need(q.powerPlayTeamId!==null,'Manpower advantage not verified');need(q.goaliePulled!==null,'Goalie status unavailable');need(q.pressure!==null,'Advanced pressure unavailable; experiment disabled');
    if(ot&&m===0)signals.push('Tied hockey overtime');
    if(late&&t!==null&&t<=300&&m===1)signals.push('Late one-goal opportunity');
    if(m!==null&&m<=2&&q.powerPlayTeamId)signals.push('Verified manpower advantage');
    if(late&&m<=2&&q.goaliePulled===true)signals.push('Verified pulled goalie');
  }else if(sport==='MLB'){
    need(q.outs!==null,'Outs unavailable');need(q.bases.every(b=>b!==null),'Baserunners unavailable');need(q.battingTeamId,'Batting side unavailable');need(q.noHitBid!==null,'No-hit evidence unavailable');
    // Batting side is required; a leading team's runners are not a tying threat.
    const battingIndex=q.battingTeamId?p.teamIds?.indexOf(q.battingTeamId):-1;
    const deficit=battingIndex>=0?p.scores[1-battingIndex]-p.scores[battingIndex]:null;
    if(period>=7&&q.outs!==null&&q.outs<3&&q.bases.every(b=>b!==null)&&deficit!==null&&deficit>=0&&deficit<=q.bases.filter(Boolean).length+1)
      signals.push('Late tying/winning run at plate or on base');
    if(period>=6&&q.noHitBid===true)signals.push('Verified no-hit bid');
  }else if(sport==='Tennis'){
    need(q.bestOf!==null,'Match format unavailable');need(q.matchPoint!==null,'Match-point evidence unavailable');need(q.breakOfServe!==null,'Break-of-serve evidence unavailable');need(q.tiebreak!==null,'Tiebreak evidence unavailable');
    if(q.bestOf!==null&&period===q.bestOf&&m<=1)signals.push('Verified deciding set');
    if(q.matchPoint===true)signals.push('Verified match point');
    if(q.tiebreak===true)signals.push('Verified tiebreak');
    if(q.breakOfServe===true)signals.push('Verified break of serve');
    if(q.grandSlam&&signals.length)signals.push('Grand Slam stakes');
  }
  const elapsedLate=sport==='MLB'?period>=7:late;
  const impossible=['NBA','NCAAB'].includes(sport)&&late&&t!==null&&t<=5&&m>=7;
  const pregameProbability=probability(q.market?.probability),currentDogProbability=probability(q.underdogProbability);
  if(q.market?.source&&q.underdogMargin!==null&&q.underdogMargin>=-3&&q.underdogMargin<=(['NFL','CFB'].includes(sport)?8:6)&&!impossible&&
    currentDogProbability!==null&&currentDogProbability>=.05&&currentDogProbability<.995&&
    (pregameProbability===null||currentDogProbability>pregameProbability)&&
    ((sport==='NCAAB'&&period>=2)||(['NBA','NFL','CFB'].includes(sport)&&period>=3)))signals.push('Credible observed underdog threat');
  if(!q.market)gaps.push('Verified pregame underdog expectation unavailable');
  else if(currentDogProbability===null)gaps.push('Current team-mapped underdog probability unavailable; threat inference withheld');
  if(q.championship&&signals.length)signals.push('Championship stakes with current leverage');
  const prior=history.filter(x=>x.modelVersion===p.modelVersion&&x.margin!==null);
  const deficits=[0,1].map(i=>Math.max(0,...prior.map(x=>x.scores[1-i]-x.scores[i])));
  if(comeback[sport]&&m<=({NFL:8,CFB:8,NBA:3,NCAAB:3,NHL:1,MLB:1}[sport])&&p.scores.length===2&&p.scores.every(Number.isFinite)&&deficits.some((d,i)=>
    d>=comeback[sport]&&d-Math.max(0,p.scores[1-i]-p.scores[i])>=.75*comeback[sport]))signals.push('Substantial comeback observed so far');
  const leader=x=>x.scores?.length===2?Math.sign(x.scores[0]-x.scores[1]):0;
  const previousLeader=[...prior].reverse().find(x=>leader(x)!==0);
  if(previousLeader&&leader(p)!==0&&leader(p)!==leader(previousLeader))signals.push('Observed lead change');
  if(['NBA','NCAAB'].includes(sport)&&t!==null&&prior.some(x=>x.period===period&&x.clockSeconds!==null&&
    x.clockSeconds>=t&&x.clockSeconds-t<=180&&[0,1].some(i=>p.scores[i]-x.scores[i]>=8&&p.scores[1-i]===x.scores[1-i])))
    signals.push('Observed unanswered run within three game minutes');
  const wideLate=elapsedLate&&m!==null&&wide[sport]!==undefined&&m>=wide[sport];
  const leadingIndex=p.scores[0]>p.scores[1]?0:p.scores[1]>p.scores[0]?1:-1;
  const clockExhaustible=['NFL','CFB'].includes(sport)&&late&&!ot&&t!==null&&t<=30&&m>0&&leadingIndex>=0&&
    q.possession===p.teamIds?.[leadingIndex]&&q.timeouts[1-leadingIndex]===0&&q.down!==null&&q.down<=3;
  const probabilityBoundary=['NBA','NCAAB'].includes(sport)&&t!==null&&t<=10&&m>=4?.98:.995;
  const leaderProbability=q.winProbability===null||leadingIndex<0?null:leadingIndex===1?q.winProbability:1-q.winProbability;
  const securedBasketball=['NBA','NCAAB'].includes(sport)&&late&&t!==null&&t<=10&&m>=3&&leaderProbability>=.95&&q.possession===p.teamIds?.[leadingIndex];
  const settled=clockExhaustible||securedBasketball||q.winProbability!==null&&(q.winProbability>=probabilityBoundary||q.winProbability<=1-probabilityBoundary)&&late&&t!==null&&t<=30;
  const extraordinary=ot||signals.some(s=>/Substantial comeback|Credible observed underdog|Championship|Verified no-hit/.test(s));
  const high=p.rating>=85&&(impossible||settled||wideLate&&!extraordinary);
  const intermissionSoon=reg[sport]&&period<reg[sport]&&t!==null&&t<=30;
  const lateRunwayUnknown=late&&t!==null&&t<=30&&(
    ['NFL','CFB'].includes(sport)&&!q.possession||
    ['NBA','NCAAB'].includes(sport)&&m>3&&(q.winProbability===null||q.winProbability<.1||q.winProbability>.9));
  if(lateRunwayUnknown)gaps.push('Late comeback feasibility not established; withhold underrated classification');
  const underdogWindow=ot||late&&t!==null&&t<=(['NFL','CFB'].includes(sport)?300:120);
  const actionableLeverage=signals.some(s=>/Decisive|Meaningful|overtime|Late tying|no-hit|match point/.test(s))||
    underdogWindow&&signals.includes('Credible observed underdog threat')||
    sport==='Tennis'&&signals.includes('Verified deciding set')&&(q.tiebreak===true||q.grandSlam)||
    sport==='NHL'&&signals.includes('Late one-goal opportunity')&&(q.goaliePulled===true||q.powerPlayTeamId!==null);
  const previous=prior.at(-1),reliable=x=>x&&eligibleRating(x)&&!x.q.rejected&&!x.q.scoringPartial&&x.q.evidenceQuality==='complete';
  const improvingCompetition=previous&&previous.scores.every(Number.isFinite)&&p.scores.every(Number.isFinite)&&
    p.scores.every((score,i)=>score>=previous.scores[i])&&
    (m<previous.margin||ot&&previous.period<=reg[sport])&&
    (period>previous.period||period===previous.period&&t!==null&&previous.clockSeconds!==null&&t<=previous.clockSeconds);
  const responseEvidence=actionableLeverage&&reliable(previous)&&reliable(p)&&improvingCompetition&&
    p.observedAt>previous.observedAt&&p.observedAt-previous.observedAt<=360000&&p.rating-previous.rating < -2?
    {kind:'opposite-direction observed response',before:observationReference(previous),after:observationReference(p),
      beforeRating:previous.rating,afterRating:p.rating,delta:p.rating-previous.rating,
      basis:'Verified competition became closer in a sport-specific high-leverage phase while its rating declined; matched replay is still required'}:null;
  return {signals,gaps,wideLate,impossible,settled,high,extraordinary,actionableLeverage,responseEvidence,
    low:!intermissionSoon&&!lateRunwayUnknown&&!impossible&&!settled&&p.rating!==null&&
      (actionableLeverage||signals.includes('Substantial comeback observed so far'))};
}
function comparableSituations(p,points){
  const window=p.clockSeconds<=120?20:p.clockSeconds<=300?45:120;
  const possessionRole=x=>{const side=x.q.possession?x.teamIds.indexOf(x.q.possession):-1;return side>=0&&x.scores.every(Number.isFinite)?Math.sign(x.scores[side]-x.scores[1-side]):null;};
  const verified=(x,field)=>x.q.verifiedSignificance?.verified===true?x.q.verifiedSignificance[field]??null:null;
  const candidates=points.filter(x=>x.gameKey!==p.gameKey&&x.sport===p.sport&&x.modelVersion===p.modelVersion&&
    x.modelVersion!=='unknown'&&x.period===p.period&&x.margin===p.margin&&x.live&&x.evidenceStatus!=='invalid'&&
    Number.isFinite(x.rating)&&Number.isFinite(x.clockSeconds)&&Number.isFinite(p.clockSeconds)&&Math.abs(x.clockSeconds-p.clockSeconds)<=window);
  const matches=[];
  for(const x of candidates){
    const dimensions=['sport','model version','period/overtime','score differential','actual clock'],missing=[];
    let mismatch=false;
    for(const [label,a,b] of [
      ['pregame team quality',number(p.pregameQuality),number(x.pregameQuality)],['pregame spread',p.q.market?.spread,x.q.market?.spread],
      ['possession role',possessionRole(p),possessionRole(x)],
      ['manpower advantage',number(p.q.manpower?.advantage),number(x.q.manpower?.advantage)],
      ['goalie pulled',p.q.goaliePulled,x.q.goaliePulled],['verified championship',verified(p,'championship'),verified(x,'championship')],
      ['verified stakes',verified(p,'stakes'),verified(x,'stakes')]]){
      if(a===null||a===undefined||b===null||b===undefined){missing.push(label);continue;}
      const tolerance=label==='pregame team quality'?10:label==='pregame spread'?3:0;
      if(typeof a==='number'&&typeof b==='number'?Math.abs(a-b)>tolerance:a!==b){mismatch=true;break;}
      dimensions.push(label);
    }
    if(!p.event||!x.event)missing.push('recent event alignment');
    else if(Boolean(p.event.scoringPlay)!==Boolean(x.event.scoringPlay))mismatch=true;
    if(!p.q.pressure||!x.q.pressure)missing.push('verified game-specific pressure');
    if(!mismatch&&dimensions.length>=7)matches.push({gameKey:x.gameKey,reference:observationReference(x),rating:x.rating,clockSeconds:x.clockSeconds,
      clockDistanceSeconds:Math.abs(p.clockSeconds-x.clockSeconds),matchedDimensions:dimensions,missingDimensions:missing,score:dimensions.length/(dimensions.length+missing.length)});
  }
  matches.sort((a,b)=>b.score-a.score||a.clockDistanceSeconds-b.clockDistanceSeconds);
  const unique=new Map();for(const x of matches)if(!unique.has(x.gameKey))unique.set(x.gameKey,x);
  const peers=[...unique.values()].slice(0,30),minimumGames=5;
  return {status:peers.length>=minimumGames?'matched_sample':'insufficient_matched_games',minimumGames,sampleGames:peers.length,
    median:peers.length>=minimumGames?percentile(peers.map(x=>x.rating),.5):null,
    meanMatchCoverage:peers.length?peers.reduce((sum,x)=>sum+x.score,0)/peers.length:null,
    matches:peers,missingDimensions:[...new Set(peers.flatMap(x=>x.missingDimensions))],
    methodology:`Same sport/model/period/margin; clock distance <=${window}s; at least two verified context dimensions; known mismatches excluded; one closest observation per game`,
    limitation:'Matched score differences are observational associations, not a target rating or causal proof'};
}
function finding(p,a,direction,points){
  const comparisons=comparableSituations(p,points),blocked=p.integrity.length>0||p.evidenceStatus==='invalid'||p.q.scoringPartial;
  const missing=a.gaps.length>0||p.evidenceStatus!=='complete';
  const peerUnder=direction==='underrated'&&comparisons.sampleGames>=comparisons.minimumGames&&
    comparisons.median!==null&&comparisons.median-p.rating>=27;
  // An observed comeback, upset or late opportunity does not impose an 85-point
  // target. A low-rating concern needs matched evidence or a failed direction
  // response. Unreliable high-leverage evidence remains a separate review.
  if(direction==='underrated'&&!peerUnder&&!a.responseEvidence&&!(blocked&&a.actionableLeverage))return null;
  const strong=!blocked&&!missing&&comparisons.sampleGames>=5&&comparisons.meanMatchCoverage>=.8&&Math.abs(p.rating-comparisons.median)>=27;
  const classification=p.integrity.length?'confirmed_defect':blocked?'data_quality_limitation':strong?'strong_calibration_concern':'calibration_hypothesis';
  const cause=direction==='overrated'?(p.q.historyPoints>0?'Past excitement may be retained after current leverage fades':'High current rating despite verified low current comeback feasibility'):
    peerUnder?'Rating is materially below at least five matched same-model games':a.responseEvidence?'Rating moved opposite to a verified late competitive opportunity':'Unreliable evidence prevents a scoring-quality judgment';
  const correction=blocked?'Repair evidence before calibrating; replay the accepted observations':direction==='overrated'?'Replay current feasibility and historical drama separately; require high-leverage controls':'Replay causal event response and sport scale against matched games before selecting any scoring adjustment';
  return {id:`quality|${p.gameKey}|${p.modelVersion}|${p.observedAt}|${direction}`,gameKey:p.gameKey,matchup:p.matchup,sport:p.sport,
    direction:blocked&&direction==='underrated'?'evidence':direction,
    classification,legacyClassification:p.integrity.length?'confirmed_integrity_failure':blocked?'missing_or_unreliable_evidence':'calibration_hypothesis',
    confidence:p.integrity.length?'high':blocked?'low':strong?'high':missing?'low':'medium',priority:p.integrity.length||strong?'high':blocked?'evidence':'medium',
    modelVersion:p.modelVersion,observedAt:p.observedAt,publishedAt:p.publishedAt,
    period:p.period,clockSeconds:p.clockSeconds,scores:p.scores,rating:p.rating,signals:a.signals,
    verifiedSituation:{scores:p.scores,period:p.period,clockSeconds:p.clockSeconds,lifecycle:p.lifecycle,signals:a.signals},
    whyInvestigate:direction==='overrated'?'Verified current leverage is low while the observed rating remains high; exceptional context must still be checked':cause+'; no fixed target rating is implied',
    evidence:{margin:p.margin,...p.q},sourceReference:p.sourceReference,sourceEvent:p.event,missingEvidence:[...new Set([...a.gaps,...(comparisons.sampleGames<5?['Fewer than five matched comparison games']:[])])],integrityProblems:p.integrity,
    scoringComponents:p.components,suspectedCause:cause,suspectedCausalMechanism:cause,
    supportingObservations:a.responseEvidence?[a.responseEvidence.before,a.responseEvidence.after]:[observationReference(p)],comparableSituations:comparisons,
    underratingBasis:direction==='underrated'?{matchedPeerDeficit:peerUnder?comparisons.median-p.rating:null,response:a.responseEvidence,requiredRating:null}:null,
    potentialUserImpact:direction==='overrated'?'A decided or low-leverage game could displace a better live viewing opportunity':'A worthwhile live opportunity may become visible too late',
    recommendedCorrection:correction,proposedInvestigation:correction,
    expectedEffectsOnOtherScenarios:'Test ordinary close games, legitimate overtime peaks, blowouts, late decided states and completed-game ratings in the same model cohort; direction and magnitude remain unknown',
    replayTestingRequired:true,boundedExperiment:{change:'One audited factor or interaction at a time; no production change',
      evaluation:['same-model historical trajectory','false positives in decided games','first observed threshold runway','legitimate 95-99 overtime and comeback controls'],candidateScoreDelta:null},
    estimatedImpact:{productionScoreDelta:0,productionAlertsDelta:0,candidateScoreDelta:null,candidateAlerts:null,
      explanation:'Audit only. A calibrated candidate and chronological eligibility replay are required to estimate a scoring or alert change.'}};
}
function percentile(a,q){const s=a.filter(Number.isFinite).sort((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)*q)]:null;}
function calibration(games,sport,model){
  const group=games.filter(g=>g.observations>0&&g.sport===sport&&(model===undefined||g.modelVersion===model)&&(sport!=='Tennis'||g.grandSlamVerified));
  const models=[...new Set(group.map(g=>g.modelVersion))],mixed=model===undefined&&models.length>1;
  const unique=new Set(group.map(g=>g.gameKey));
  const peaks=mixed?[]:group.map(g=>g.peakRating).filter(Number.isFinite);
  const publicRecommendation=true;
  return {sport,displaySport:sport==='NCAAB'?'NCAAM':sport==='Tennis'?'Grand Slam tennis':sport,publicRecommendation,
    modelVersion:model??(mixed?'separate model cohorts required':models[0]||'no evidence'),modelVersions:models,
    mixedModelsSuppressed:mixed,gamesObserved:unique.size,gamesWithRating:mixed?null:peaks.length,
    percentageReaching:Object.fromEntries(THRESHOLDS.map(t=>[t,peaks.length?100*peaks.filter(p=>p>=t).length/peaks.length:null])),
    highRatedGamesPerSlate:mixed?null:Object.fromEntries(THRESHOLDS.map(t=>[t,peaks.filter(p=>p>=t).length])),
    peakDistribution:{min:peaks.length?Math.min(...peaks):null,p25:percentile(peaks,.25),median:percentile(peaks,.5),p75:percentile(peaks,.75),max:peaks.length?Math.max(...peaks):null},
    estimatedSecondsAbove85:!mixed&&group.some(g=>g.coveredSeconds>0)?group.reduce((s,g)=>s+g.estimatedSecondsAbove85,0):null,
    durationAboveThresholds:mixed?null:Object.fromEntries(THRESHOLDS.map(t=>[t,group.some(g=>g.thresholds.find(x=>x.threshold===t)?.estimatedSecondsAbove!==null)?group.reduce((sum,g)=>sum+(g.thresholds.find(x=>x.threshold===t)?.estimatedSecondsAbove||0),0):null])),
    coveredSeconds:mixed?null:group.reduce((s,g)=>s+g.coveredSeconds,0),unknownIntervalSeconds:mixed?null:group.reduce((s,g)=>s+g.unknownIntervalSeconds,0),
    volatility:mixed?null:{medianMeanAbsoluteChange:percentile(group.map(g=>g.volatility.meanAbsoluteChange),.5),maximumChange:group.length?Math.max(...group.map(g=>g.volatility.maxAbsoluteChange||0)):null},
    peakTiming:mixed?[]:group.map(g=>({gameKey:g.gameKey,...g.ratingContexts.peakLive})),
    decisiveMomentCount:group.reduce((sum,g)=>sum+g.decisiveMoments.length,0),eventResponseCount:group.reduce((sum,g)=>sum+g.eventResponses.length,0),
    decisiveMoments:[],eventResponses:[],detailReference:'Full decisive moments and event responses are retained once in games, keyed by gameKey/modelVersion',
    significantNeverReached85:mixed?[]:group.filter(g=>g.significant&&g.peakRating!==null&&g.peakRating<85).map(g=>({gameKey:g.gameKey,peakRating:g.peakRating,evidence:g.decisiveMoments[0],coverage:'Retained sampled window only'})),
    ordinaryHighRatings:mixed?[]:group.filter(g=>g.peakRating>=95&&!g.significant).map(g=>({gameKey:g.gameKey,peakRating:g.peakRating,classification:'insufficient_evidence',reason:'No significant event was retained; absence of evidence does not establish an ordinary game'})),
    evidenceGaps:[...new Set(group.flatMap(g=>g.evidenceGaps))],
    frequencyAssessment:'Insufficient multi-slate history for a calibration verdict; one night does not establish too many or too few high ratings',
    comparability85:mixed?'Cross-version distribution withheld. Inspect separate model cohorts':peaks.length?'Unvalidated: sampled, selected games and unequal evidence coverage cannot establish an equivalent 85':'No eligible live evidence; equivalence unavailable'};
}
function discontinuityRecommendation(game,change){
  return {id:`volatility|${game.gameKey}|${game.modelVersion}|${change.to.observedAt}`,gameKey:game.gameKey,matchup:game.matchup,sport:game.sport,
    modelVersion:game.modelVersion,observedAt:change.to.observedAt,rating:change.afterRating,classification:change.classification,
    confidence:change.arithmeticReconciliation?.status==='reconciled'?'medium':'low',priority:change.classification==='data_quality_limitation'?'evidence':Math.abs(change.delta)>=50?'high':'medium',direction:'discontinuity',
    verifiedSituation:change.after,whyInvestigate:`Observed ${change.delta>0?'+':''}${change.delta}-point change; examine event and component interactions before calling it incorrect`,
    scoringComponents:change.componentChanges,arithmeticReconciliation:change.arithmeticReconciliation,eventTriage:change.eventTriage,
    suspectedCausalMechanism:change.arithmeticReconciliation?.status==='reconciled'?'The retained ledger explains the arithmetic; inspect the desirability of its margin/runway interactions':'Retained components cannot fully attribute the change',
    suspectedCause:change.modelPolicyAttribution,supportingObservations:[change.from,change.to],
    comparableSituations:{status:'insufficient_evidence',sampleGames:0,minimumGames:5,matches:[],reason:'A comparable trajectory replay is required; single states do not explain a discontinuity'},
    missingEvidence:[...(change.arithmeticReconciliation?.status==='reconciled'?[]:['Complete arithmetic ledger and interaction order']),'Counterfactual replay under the same model','Comparable event trajectories'],
    potentialUserImpact:'A large step can delay useful discovery or create a short-lived high rating',
    proposedInvestigation:'Replay the observed boundary with component tracing; vary only the suspected competitiveness gate in an offline bounded experiment',
    recommendedCorrection:'Inspect the boundary and verify intended policy; do not smooth a justified decisive-event response automatically',
    expectedEffectsOnOtherScenarios:'Measure ordinary one-goal games, tied games, extraordinary comebacks, legitimate overtime, blowouts and completed transitions',
    replayTestingRequired:true,boundedExperiment:{change:'One factor gate or cap at a time, offline only',candidateScoreDelta:null},
    estimatedImpact:{productionScoreDelta:0,productionAlertsDelta:0,candidateScoreDelta:null}};
}
export function buildScoringQuality(inputGames=[]){
  inputGames=inputGames.filter(auditAnalysisGameAllowed);
  const qualitativeFindings=[];
  for(const game of inputGames)for(const observation of [...(game.observations||[]),...(game.retainedScoringObservations||[])]){
    for(const finding of auditQualitativeContext(observation.state||{}).findings)qualitativeFindings.push({...finding,gameKey:game.gameKey,observedAt:observation.observedAt,modelVersion:observation.scoringVersion||observation.state?.modelVersion});
  }
  const games=[],candidatePoints=[],points=[],integrity=[],missing=[],allPoints=[],expected=[];
  for(const game of inputGames){
    const source=[...(game.observations||[]),...(game.retainedScoringObservations||[])];
    source.sort((a,b)=>(time(a.observedAt)??0)-(time(b.observedAt)??0)||Number(Boolean(b.qualityEvidence))-Number(Boolean(a.qualityEvidence)));
    const seen=new Set(),ps=[];let previousModel=null,segment=0;
    for(const observation of source){
      const p=point(observation,game);p.teamIds=(observation.state?.teams||[]).map(t=>String(t?.[8]??''));
      if(!QUALITY_SPORTS.includes(p.sport))continue;
      const key=p.feedRevision&&p.provenance!=='retained-scoring-snapshot'?`${p.modelVersion}|${p.feedRevision}|${p.lifecycle}`:`${p.modelVersion}|${p.observedAt}|${p.rating}|${p.scores.join(':')}|${p.lifecycle}`;
      if(seen.has(key))continue;seen.add(key);
      if(previousModel!==null&&(previousModel!==p.modelVersion||p.sourceReference.trajectoryGapBefore))segment++;
      p.segment=segment;previousModel=p.modelVersion;ps.push(p);allPoints.push(p);
    }
    for(const modelVersion of new Set(ps.map(p=>p.modelVersion))){
      const modelPoints=ps.filter(p=>p.modelVersion===modelVersion),history=[],decisiveMoments=[],evidenceGaps=new Set();let recoveryBoundary=0;
      let coveredSeconds=0,unknownIntervalSeconds=0,estimatedSecondsAbove85=0;
      for(const p of modelPoints)if(p.integrity.length)integrity.push({gameKey:p.gameKey,observedAt:p.observedAt,modelVersion,codes:p.integrity,classification:'confirmed_integrity_failure',findingClassification:'confirmed_defect',reference:observationReference(p)});
      for(const p of modelPoints.filter(p=>p.live)){
        const priorPoint=history.at(-1);
        if(priorPoint&&(p.segment!==priorPoint.segment||p.period<priorPoint.period||p.scores.some((score,i)=>score<priorPoint.scores[i])))recoveryBoundary=history.length;
        const causalHistory=history.slice(recoveryBoundary).filter(h=>h.segment===p.segment),a=inspect(p,causalHistory),prior=causalHistory.at(-1);p.assessment=a;points.push(p);
        a.gaps.forEach(x=>evidenceGaps.add(x));
        if(a.high)candidatePoints.push({p,a,direction:'overrated'});if(a.low)candidatePoints.push({p,a,direction:'underrated'});
        if(a.signals.length)decisiveMoments.push({gameKey:p.gameKey,observedAt:p.observedAt,publishedAt:p.publishedAt,reference:observationReference(p),
          period:p.period,clockSeconds:p.clockSeconds,scores:p.scores,rating:p.rating,signals:a.signals,evidenceGaps:a.gaps,
          sourceReference:p.sourceReference,sourceEvent:p.event});
        if(prior){const dt=measurableInterval(prior,p);if(dt!==null){coveredSeconds+=dt;if(prior.rating>85)estimatedSecondsAbove85+=dt;}
          else if(p.publishedAt!==null&&prior.publishedAt!==null&&p.publishedAt>prior.publishedAt)unknownIntervalSeconds+=(p.publishedAt-prior.publishedAt)/1000;}
        history.push(p);
      }
      const sport=modelPoints[0]?.sport||game.sport,ratings=history.filter(eligibleRating).map(p=>p.rating),peak=ratings.length?Math.max(...ratings):null;
      const auditHistory=history.filter(p=>p.provenance!=='retained-scoring-snapshot');
      // Preserve the original scan-cadence view beside the denser retained view.
      coveredSeconds=0;estimatedSecondsAbove85=0;unknownIntervalSeconds=0;
      for(let i=1;i<auditHistory.length;i++){
        const a=auditHistory[i-1],b=auditHistory[i],dt=measurableInterval(a,b);
        if(dt!==null){coveredSeconds+=dt;if(a.rating>85)estimatedSecondsAbove85+=dt;}
        else if(b.publishedAt!==null&&a.publishedAt!==null&&b.publishedAt>a.publishedAt)unknownIntervalSeconds+=(b.publishedAt-a.publishedAt)/1000;
      }
      const peakPoint=history.find(p=>eligibleRating(p)&&p.rating===peak),thresholds=thresholdAnalysis(history),volatility=volatilityAnalysis(history);
      const auditVolatility=volatilityAnalysis(auditHistory);volatility.auditCadenceMaxAbsoluteChange=auditVolatility.maxAbsoluteChange;
      volatility.auditCadenceMajorChanges=auditVolatility.majorChanges;
      const contexts={pregame:modelPoints.filter(p=>p.lifecycle==='pregame').map(observationSummary),completed:modelPoints.filter(p=>p.lifecycle==='completed').map(observationSummary),
        decided:modelPoints.filter(p=>p.lifecycle==='decided').map(observationSummary),peakLive:peakPoint?observationSummary(peakPoint):null,
        overallWatchability:'Unavailable as a separate objective label; peak, decisive moments, duration and completed rating are reported independently'};
      const eventResponses=buildEventResponses(modelPoints,sport,game.retainedProviderEvents||[]);
      for(const change of volatility.majorChanges.filter(c=>c.classification==='expected_behavior'&&c.eventTriage))expected.push({
        gameKey:game.gameKey,modelVersion,observedAt:change.to.observedAt,rating:change.afterRating,classification:'expected_behavior',
        reason:change.eventTriage.basis,arithmeticReconciliation:change.arithmeticReconciliation,
        evidenceQualification:change.evidenceQualification,supportingObservations:[change.from,change.to]});
      for(const p of modelPoints.filter(p=>p.lifecycle==='decided'))expected.push({gameKey:p.gameKey,modelVersion,observedAt:p.observedAt,rating:p.rating,
        classification:'expected_behavior',reason:'Decided sudden-death state is excluded from live underrating and calibration; lower post-decision rating is not evidence of live failure',reference:observationReference(p)});
      games.push({gameKey:game.gameKey,matchup:game.matchup,sport,modelVersion,observations:history.length,retainedObservations:modelPoints.length,
        grandSlamVerified:modelPoints.some(p=>p.q.grandSlam===true),peakRating:peak,coveredSeconds,estimatedSecondsAbove85,unknownIntervalSeconds,
        calibrationEligibleObservations:ratings.length,invalidOrUnavailableRatingsExcluded:history.length-ratings.length,
        thresholds,volatility,comebackAnalysis:comebackAnalysis(history),ratingContexts:contexts,ratingTrajectory:modelPoints.map(observationSummary),
        decisiveMoments,eventResponses,significant:decisiveMoments.length>0,evidenceGaps:[...evidenceGaps],
        watchability:{earlyDramaThenBlowout:history.some((p,i)=>p.assessment.wideLate&&history.slice(0,i).some(x=>x.rating>=85)),
          lateEmergence:history.some((p,i)=>p.assessment.signals.length>0&&history.slice(0,i).some(x=>!x.assessment.signals.length)),
          competitiveUnderdog:history.some(p=>p.assessment.signals.includes('Credible observed underdog threat')),
          closeButSettled:history.some(p=>p.assessment.settled),retainedHistoryDuringBlowout:history.some(p=>p.assessment.wideLate&&p.q.historyPoints>0)}});
      if(evidenceGaps.size)missing.push({gameKey:game.gameKey,modelVersion,classification:'data_quality_limitation',gaps:[...evidenceGaps]});
    }
  }
  const over=[],under=[];
  for(const {p,a,direction} of candidatePoints){
    const f=finding(p,a,direction,points);
    if(direction==='underrated')a.low=Boolean(f&&['calibration_hypothesis','strong_calibration_concern'].includes(f.classification));
    if(f)(direction==='overrated'?over:under).push(f);
  }
  const top=(rows,dir)=>{const sorted=[...rows].sort((a,b)=>(dir==='overrated'?b.rating-a.rating:a.rating-b.rating)||String(a.gameKey).localeCompare(String(b.gameKey)));
    const unique=new Map();for(const r of sorted)if(!unique.has(r.gameKey))unique.set(r.gameKey,r);return [...unique.values()].slice(0,10);};
  const concurrent=new Map();
  for(const p of points.filter(p=>!p.historical&&(p.feedRevision||p.runId!==null))){
    const key=p.modelVersion+'|'+(p.feedRevision||p.runId);if(!concurrent.has(key))concurrent.set(key,[]);concurrent.get(key).push(p);
  }
  const simultaneous=[];
  for(const ps of concurrent.values()){
    const eligible=ps.filter(p=>p.rating!==null&&!p.integrity.length&&!p.q.rejected&&p.publishedAt!==null&&p.observedAt-p.publishedAt>=0&&p.observedAt-p.publishedAt<=180000);
    if(eligible.length<2)continue;
    const highest=Math.max(...eligible.map(p=>p.rating)),leaders=eligible.filter(p=>p.rating===highest),challengers=eligible.filter(p=>p.assessment.low&&p.rating<highest);
    if(leaders.some(p=>p.assessment.high)&&challengers.length)simultaneous.push({observedAt:leaders[0].observedAt,feedRevision:leaders[0].feedRevision,
      leaders:leaders.map(p=>({gameKey:p.gameKey,rating:p.rating,scores:p.scores})),challengers:challengers.map(p=>({gameKey:p.gameKey,rating:p.rating,signals:p.assessment.signals})),classification:'calibration_hypothesis'});
  }
  // Quantify rarity only against distinct observed games from the same sport/model.
  for(const game of games){
    const peers=games.filter(g=>g.sport===game.sport&&g.modelVersion===game.modelVersion&&g.gameKey!==game.gameKey);
    const deficits=peers.map(g=>Math.max(0,...g.comebackAnalysis.filter(c=>c.tiedOrLed).map(c=>c.maximumObservedDeficit)));
    for(const c of game.comebackAnalysis)if(c.tiedOrLed&&deficits.length>=20&&game.modelVersion!=='unknown')c.historicalRarity={status:'retained_cohort_only',sampleGames:deficits.length,
      percentile:100*deficits.filter(d=>d<=c.maximumObservedDeficit).length/deficits.length,
      reason:'Empirical rank in selected retained games only; not all-time rarity and not a scoring target'};
  }
  const supported=r=>['calibration_hypothesis','strong_calibration_concern'].includes(r.classification);
  const evidenceReview=[...top(over.filter(r=>!supported(r)),'overrated'),...top(under.filter(r=>!supported(r)),'underrated')];
  const recommendations=[...top(over.filter(supported),'overrated'),...top(under.filter(supported),'underrated'),...evidenceReview,...games.flatMap(g=>{
    const major=g.volatility.majorChanges.filter(c=>c.classification!=='expected_behavior').sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));return major.length?[discontinuityRecommendation(g,major[0])]:[];
  })].sort((a,b)=>({high:0,medium:1,evidence:2}[a.priority]??3)-({high:0,medium:1,evidence:2}[b.priority]??3));
  const evidenceCoverage={totalObservations:allPoints.length,structuredEvidence:allPoints.filter(p=>p.structuredEvidence).length,
    usableScoringObservations:allPoints.filter(eligibleRating).length,
    completeScoreProgressionObservations:allPoints.filter(p=>p.q.scoreProgressionQuality==='complete'||p.q.evidenceQuality==='complete').length,
    completeContextualObservations:allPoints.filter(p=>p.evidenceStatus==='complete').length,
    invalidOrUnavailableScoringObservations:allPoints.filter(p=>!eligibleRating(p)).length,
    byStatus:Object.fromEntries(['complete','partial','invalid','unavailable'].map(s=>[s,allPoints.filter(p=>p.evidenceStatus===s).length])),
    legacyRecoveredFromRetainedState:allPoints.filter(p=>!p.structuredEvidence&&p.evidenceStatus==='partial').length,
    missingEventTimestamps:allPoints.filter(p=>!Number.isFinite(time(p.event?.occurredAt))&&!(p.q.canonicalEvents||[]).some(e=>Number.isFinite(time(e.occurredAt)))).length,
    modelAttributionMissing:allPoints.filter(p=>p.modelVersion==='unknown').length,
    missingFieldCounts:Object.fromEntries([...new Set(allPoints.flatMap(p=>p.fieldCoverage.missing))].map(field=>[field,allPoints.filter(p=>p.fieldCoverage.missing.includes(field)).length])),
    completenessMeaning:'Complete contextual coverage requires all audit situation/expectation fields. Usable scoring observations retain a valid rating with no known integrity rejection; production complete concerns score progression only. These are separate measures; no missing values fabricated'};
  const ratingInterpretations=allPoints.filter(p=>p.ratingInterpretation.legacyNullCoercion).map(p=>({
    gameKey:p.gameKey,observedAt:p.observedAt,modelVersion:p.modelVersion,...p.ratingInterpretation,
    reference:observationReference(p),rawEvidencePreserved:true}));
  return {version:QUALITY_VERSION,scopeVersion:AUDIT_SCOPE_VERSION,mode:'observation-only',methodology:{denominator:'Unique observed live games within each model cohort; never completed or decided ratings; multi-model overview distributions withheld',
    timeAbove85:'Legacy >85 field is a left-held canonical refresh-reference estimate, not publication duration; threshold metrics are inclusive >=70/80/85/90/95',
    reaction:'Both directions and unchanged ratings around verified events or observed intervals; event, provider publication, refresh reference, acquisition and polling remain separate. Later-revision cached provider events support retrospective associations only; their availability to the live scorer is unknown and they do not backfill historical observations',
    provenance:'Observed production and causal reconstructions are labeled; retained snapshot acquisition never becomes a provider publication timestamp',providerToPublicationLatency:'Unavailable unless verified provider publication timestamps exist; no acquisition-time substitution',
    costs:'No added provider/AI requests, schedules, storage rows or notifications'},
    topOverrated:top(over.filter(r=>supported(r)),'overrated'),topUnderrated:top(under.filter(r=>supported(r)),'underrated'),evidenceReview,
    calibration:QUALITY_SPORTS.map(s=>calibration(games,s)),modelCohorts:[...new Set(games.map(g=>g.modelVersion))].map(model=>({modelVersion:model,
      sports:QUALITY_SPORTS.map(s=>calibration(games,s,model)),topOverrated:top(over.filter(r=>supported(r)&&r.modelVersion===model),'overrated'),topUnderrated:top(under.filter(r=>supported(r)&&r.modelVersion===model),'underrated'),evidenceReview:evidenceReview.filter(r=>r.modelVersion===model)})),
    games,simultaneousPriorityConflicts:simultaneous,integrityProblems:integrity,ratingInterpretations,missingEvidence:missing,evidenceCoverage,recommendations,expectedBehavior:expected,
    executiveSummary:{gameModelCohorts:games.length,confirmedDefects:integrity.length,strongCalibrationConcerns:recommendations.filter(r=>r.classification==='strong_calibration_concern').length,
      evidenceReviewGroups:evidenceReview.length,blockedScoringCandidateObservations:[...over,...under].filter(r=>!supported(r)).length,
      hypotheses:recommendations.filter(r=>r.classification==='calibration_hypothesis').length,expectedBehavior:expected.length,
      highPriorityInvestigations:recommendations.filter(r=>r.priority==='high').length,
      eventResponses:games.reduce((s,g)=>s+g.eventResponses.length,0),veryShort85Runway:games.filter(g=>g.thresholds.find(t=>t.threshold===85)?.firstCrossingUsefulness==='very_short_observed_runway').length,
      conclusion:'Supports evidence-linked investigations and bounded replay experiments; causal scoring corrections still require complete component traces and comparable historical replay'},
    qualitativeFindings,confirmedScoringDefects:qualitativeFindings.filter(f=>f.classification==='definite_scoring_defect'),limitations:['Candidate lists are review prompts, not objective labels or evidence of delivered alerts.',
      'Final closeness never establishes earlier live excitement. Missing states do not establish uneventful play.',
      'Exact real-world threshold crossings, provider latency and continuous time above thresholds are not established by sparse samples.',
      'A single slate cannot establish sport calibration or an equivalent 85. Grand Slam tennis requires verified event context; soccer is excluded from the entire audit.']};
}
