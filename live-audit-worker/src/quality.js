// Observation-only diagnostics. No scorer, provider, AI, alert or database imports.
export const QUALITY_VERSION = '2026-11-03.quality.1';
export const QUALITY_SPORTS = ['NFL','CFB','NBA','NCAAB','NHL','MLB','Tennis','Soccer'];
export const THRESHOLDS = [70,80,85,90,95];
const number=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const time=v=>typeof v==='number'?number(v):Number.isFinite(Date.parse(v))?Date.parse(v):null;
const bool=v=>typeof v==='boolean'?v:null;
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const reg={NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3};
const wide={NFL:17,CFB:21,NBA:20,NCAAB:18,NHL:3,MLB:5,Soccer:3};
const comeback={NFL:14,CFB:14,NBA:15,NCAAB:12,NHL:2,MLB:3,Soccer:2};
export function clockSeconds(value){
  const s=String(value??'');
  const m=/^(\d+):(\d{2})(?:\.(\d+))?$/.exec(s);
  if(m&&+m[2]<60)return +m[1]*60+ +m[2]+(m[3]?Number('0.'+m[3]):0);
  return /^\d{1,2}\.\d+$/.test(s)?Number(s):null;
}
const factorPoints=(g,re)=>(g.factors||[]).filter(f=>re.test(f.label||'')).reduce((sum,f)=>sum+(number(f.points)||0),0);
const historyPoints=g=>(g.factors||[]).filter(f=>/history|comeback|recovery|erased.*deficit|lead change|trajectory|sustained|win.chance swing/i.test(f.label||''))
  .reduce((sum,f)=>sum+Math.max(0,number(f.points)||0),0);
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
export function captureQualityEvidence(game,{publishedAt=null,observedAt=null}={}){
  const g=game||{},r=g.liveRawSituation||{},c=g.sourceCompetition||{},sport=g.sport;
  const ids=(g.teams||[]).map(t=>String(t?.[8]??''));
  const possession=String(r.possession?.id??r.possession??'');
  const market=g.liveUpset?.market||g.liveSurprise?.market||null;
  const sides=(g.teams||[]).map(t=>number(t?.[2]));
  const dogIndex=market?ids.indexOf(String(market.teamId)): -1;
  const context=String(g.context||'');
  const publication=time(publishedAt);
  const batting=String(r.battingTeamId??(['away','home'].includes(r.battingSide)?ids[r.battingSide==='away'?0:1]:'')??'');
  const quality={version:QUALITY_VERSION,source:'canonical-at-publication',publishedAt:publication,observedAt:time(observedAt),
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
    grandSlam:/wimbledon|australian open|french open|roland garros|us open/i.test(context),
    stakes:/playoff|postseason|elite (?:8|eight)|sweet (?:16|sixteen)|final four|world series|super bowl|stanley cup final|nba finals|national championship/i.test(context),
    championship:/world series|super bowl|stanley cup final|nba finals|national championship|grand slam final/i.test(context),
    market:market?pick(market,['teamId','teamName','spread','source','quotedAt']):null,
    underdogMargin:dogIndex>=0&&sides.every(x=>x!==null)?sides[dogIndex]-sides[1-dogIndex]:null,
    underdogProbability:number(g.liveUpset?.currentProbability??g.liveSurprise?.currentProbability),
    winProbability:number(g.live?.winProbability),
    historyPoints:historyPoints(g),
    stakesPoints:factorPoints(g,/postseason|championship|final round/i),
    event:eventAtState(g,r.lastPlay,publication),
    evidenceQuality:g.evidenceQuality??null,scoringPartial:g.scoringPartial===true,
    rejected:Boolean(g.detailStale||g.timingUncertain||g.liveUpdateRejected||g.basketballUpdateRejected||g.summaryLifecycleRejected||g.scoringHistoryRejected),
    // Acquisition/scan/event time is NOT a provider publication timestamp.
    providerPublication:null,providerPublicationLatencyMs:null};
  return quality;
}
function point(observation,game){
  const g=observation.state||{},raw=g.liveRawStatus||{},at=time(observation.observedAt);
  const q={...(observation.qualityEvidence||captureQualityEvidence(g,{publishedAt:observation.feedUpdatedAt,observedAt:at}))};
  if(g.factors)q.historyPoints=historyPoints(g);
  const scores=(observation.scores||g.teams?.map(t=>t[2])||[]).map(number);
  const period=number(observation.period??raw.period),clock=number(observation.clockSeconds)??clockSeconds(raw.displayClock);
  const rating=number(observation.rating),sport=game.sport==='NCAAM'?'NCAAB':game.sport;
  const publication=q.publishedAt??time(observation.feedUpdatedAt);
  const gaps=[];
  gaps.push(...(observation.sourceReference?.missingSituationFields||[]));
  if(observation.sourceReference?.excludedHistory?.length)gaps.push(`${observation.sourceReference.excludedHistory.length} earlier contradictory archive events excluded`);
  if(!observation.qualityEvidence)gaps.push('Legacy observation lacks structured quality evidence');
  if(publication===null)gaps.push('Publication timestamp unavailable');
  if(q.evidenceQuality!=='complete')gaps.push('Complete scoring evidence not established');
  const integrity=(observation.auditCandidates||[]).filter(f=>f.deterministic).map(f=>f.reasonCode);
  if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>99))integrity.push('INVALID_RATING');
  if(scores.length!==2||scores.some(n=>n===null||n<0))integrity.push('INVALID_SCORE');
  if(at!==null&&publication!==null&&(publication>at||at-publication>180000))gaps.push('Publication is future-dated or stale');
  if(q.rejected||q.scoringPartial)gaps.push('Rejected, stale or partial scoring evidence');
  return {gameKey:game.gameKey,matchup:game.matchup||game.gameKey,sport,observedAt:at,publishedAt:publication,
    modelVersion:observation.scoringVersion||'unknown',feedRevision:observation.feedRevision||null,runId:observation.runId??null,
    rating,scores,period,clockSeconds:clock,phase:g.live?.phase||g.status||null,
    margin:scores.length===2&&scores.every(x=>x!==null)?Math.abs(scores[0]-scores[1]):null,
    q,gaps,integrity,live:g.state!=='completed'&&g.state!=='upcoming',
    historical:observation.provenance==='causal-reconstruction',event:observation.sourceEvent||q.event,
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
  }else if(sport==='Soccer'){
    need(q.possession,'Possession unavailable');gaps.push('Aggregate, red-card and shot-pressure coverage not established');
    if(period>=2&&t!==null&&t>=80*60&&m<=1)signals.push('Late close soccer game');
  }
  const elapsedLate=sport==='MLB'?period>=7:sport==='Soccer'?period>=2&&t>=80*60:late;
  const impossible=['NBA','NCAAB'].includes(sport)&&late&&t!==null&&t<=5&&m>=7;
  if(q.market&&q.underdogMargin!==null&&q.underdogMargin>=-3&&q.underdogMargin<=(['NFL','CFB'].includes(sport)?8:6)&&!impossible&&
    (q.underdogProbability===null||q.underdogProbability>=.05)&&
    ((sport==='NCAAB'&&period>=2)||(['NBA','NFL','CFB'].includes(sport)&&period>=3)))signals.push('Credible observed underdog threat');
  if(!q.market)gaps.push('Verified pregame underdog expectation unavailable');
  if(q.championship&&signals.length)signals.push('Championship stakes with current leverage');
  const prior=history.filter(x=>x.modelVersion===p.modelVersion&&x.margin!==null);
  const deficits=[0,1].map(i=>Math.max(0,...prior.map(x=>x.scores[1-i]-x.scores[i])));
  if(comeback[sport]&&m<=({NFL:8,CFB:8,NBA:3,NCAAB:3,NHL:1,MLB:1,Soccer:1}[sport])&&p.scores.length===2&&p.scores.every(Number.isFinite)&&deficits.some((d,i)=>
    d>=comeback[sport]&&d-(p.scores[1-i]-p.scores[i])>=.75*comeback[sport]))signals.push('Substantial comeback observed so far');
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
  const high=p.rating>=85&&(wideLate||impossible||settled);
  const intermissionSoon=reg[sport]&&period<reg[sport]&&t!==null&&t<=30;
  const lateRunwayUnknown=late&&t!==null&&t<=30&&(
    ['NFL','CFB'].includes(sport)&&!q.possession||
    ['NBA','NCAAB'].includes(sport)&&m>3&&(q.winProbability===null||q.winProbability<.1||q.winProbability>.9));
  if(lateRunwayUnknown)gaps.push('Late comeback feasibility not established; withhold underrated classification');
  return {signals,gaps,wideLate,impossible,settled,high,
    low:!intermissionSoon&&!lateRunwayUnknown&&!impossible&&!settled&&p.rating!==null&&p.rating<85&&(
      signals.some(s=>/Decisive|Meaningful|overtime|Late tying|no-hit|match point|Credible|Substantial|Championship/.test(s))||
      sport==='Tennis'&&signals.includes('Verified deciding set')&&(q.tiebreak===true||q.grandSlam)||
      sport==='NHL'&&signals.includes('Late one-goal opportunity')&&(q.goaliePulled===true||q.powerPlayTeamId!==null))};
}
function finding(p,a,direction){
  const missing=a.gaps.length>0,blocked=p.integrity.length>0||p.q.rejected||p.q.scoringPartial||p.q.evidenceQuality!=='complete';
  return {gameKey:p.gameKey,matchup:p.matchup,sport:p.sport,direction,
    classification:p.integrity.length?'confirmed_integrity_failure':blocked?'missing_or_unreliable_evidence':'calibration_hypothesis',
    confidence:blocked?'low':missing?'medium':'high',modelVersion:p.modelVersion,observedAt:p.observedAt,publishedAt:p.publishedAt,
    period:p.period,clockSeconds:p.clockSeconds,scores:p.scores,rating:p.rating,signals:a.signals,
    evidence:{margin:p.margin,...p.q},sourceReference:p.sourceReference,sourceEvent:p.event,missingEvidence:a.gaps,integrityProblems:p.integrity,
    suspectedCause:direction==='overrated'?(p.q.historyPoints>0?'Past excitement may be retained after current leverage fades':'High current rating despite low observed comeback feasibility'):'Current leverage or underdog threat may be recognized too weakly or too late',
    recommendedCorrection:blocked?'Repair evidence before calibrating; replay the accepted observation':direction==='overrated'?'Replay decay and current feasibility separately from earned historical drama':'Review causal event response and sport scale against matched complete-evidence games',
    estimatedImpact:{productionScoreDelta:0,productionAlertsDelta:0,candidateScoreDelta:null,candidateAlerts:null,
      reviewDistanceTo85:85-p.rating,explanation:'Audit only. A calibrated candidate and chronological eligibility replay are required to estimate a scoring or alert change.'}};
}
function percentile(a,q){const s=a.filter(Number.isFinite).sort((a,b)=>a-b);return s.length?s[Math.floor((s.length-1)*q)]:null;}
function calibration(games,sport,model){
  let group=games.filter(g=>g.sport===sport&&(model===undefined||g.modelVersion===model));
  if(model===undefined){
    const unique=new Map();
    for(const g of group){
      const old=unique.get(g.gameKey);
      if(!old)unique.set(g.gameKey,{...g});
      else unique.set(g.gameKey,{...g,peakRating:old.peakRating===null?g.peakRating:g.peakRating===null?old.peakRating:Math.max(old.peakRating,g.peakRating),
        coveredSeconds:old.coveredSeconds+g.coveredSeconds,estimatedSecondsAbove85:old.estimatedSecondsAbove85+g.estimatedSecondsAbove85,
        unknownIntervalSeconds:old.unknownIntervalSeconds+g.unknownIntervalSeconds,decisiveMoments:[...old.decisiveMoments,...g.decisiveMoments],
        eventResponses:[...old.eventResponses,...g.eventResponses],evidenceGaps:[...new Set([...old.evidenceGaps,...g.evidenceGaps])],significant:old.significant||g.significant});
    }
    group=[...unique.values()];
  }
  const peaks=group.map(g=>g.peakRating).filter(Number.isFinite);
  return {sport,modelVersion:model??'all (see model cohorts)',gamesObserved:group.length,gamesWithRating:peaks.length,
    percentageReaching:Object.fromEntries(THRESHOLDS.map(t=>[t,peaks.length?100*peaks.filter(p=>p>=t).length/peaks.length:null])),
    peakDistribution:{min:peaks.length?Math.min(...peaks):null,p25:percentile(peaks,.25),median:percentile(peaks,.5),p75:percentile(peaks,.75),max:peaks.length?Math.max(...peaks):null},
    estimatedSecondsAbove85:group.some(g=>g.coveredSeconds>0)?group.reduce((s,g)=>s+g.estimatedSecondsAbove85,0):null,
    coveredSeconds:group.reduce((s,g)=>s+g.coveredSeconds,0),unknownIntervalSeconds:group.reduce((s,g)=>s+g.unknownIntervalSeconds,0),
    decisiveMoments:group.flatMap(g=>g.decisiveMoments),eventResponses:group.flatMap(g=>g.eventResponses),
    significantNeverReached85:group.filter(g=>g.significant&&g.peakRating!==null&&g.peakRating<85).map(g=>({gameKey:g.gameKey,peakRating:g.peakRating,evidence:g.decisiveMoments[0],coverage:'Retained sampled window only'})),
    evidenceGaps:[...new Set(group.flatMap(g=>g.evidenceGaps))],
    comparability85:peaks.length?'Unvalidated: sampled, selected games and unequal evidence coverage cannot establish an equivalent 85':'No live evidence; equivalence unavailable'};
}
export function buildScoringQuality(inputGames=[]){
  const games=[],over=[],under=[],points=[],integrity=[],missing=[];
  for(const game of inputGames){
    const seen=new Set(),ps=[];
    for(const observation of [...(game.observations||[])].sort((a,b)=>(time(a.observedAt)??0)-(time(b.observedAt)??0))){
      const p=point(observation,game);p.teamIds=(observation.state?.teams||[]).map(t=>String(t?.[8]??''));
      if(!p.live||!QUALITY_SPORTS.includes(p.sport))continue;
      const key=p.feedRevision?`${p.modelVersion}|${p.feedRevision}`:`${p.modelVersion}|${p.observedAt}|${observation.sourceEvent?.id??''}`;
      if(seen.has(key))continue;seen.add(key);ps.push(p);
    }
    for(const modelVersion of new Set(ps.map(p=>p.modelVersion))){
      const history=[],decisiveMoments=[],eventResponses=[],pending=[],evidenceGaps=new Set();
      let coveredSeconds=0,unknownIntervalSeconds=0,estimatedSecondsAbove85=0;
      for(const p of ps.filter(p=>p.modelVersion===modelVersion)){
        const a=inspect(p,history),prior=history.at(-1);p.assessment=a;points.push(p);
        a.gaps.forEach(x=>evidenceGaps.add(x));
        if(p.integrity.length)integrity.push({gameKey:p.gameKey,observedAt:p.observedAt,codes:p.integrity,classification:'confirmed_integrity_failure'});
        if(a.high)over.push(finding(p,a,'overrated'));if(a.low)under.push(finding(p,a,'underrated'));
        if(a.signals.length)decisiveMoments.push({gameKey:p.gameKey,observedAt:p.observedAt,publishedAt:p.publishedAt,
          period:p.period,clockSeconds:p.clockSeconds,scores:p.scores,rating:p.rating,signals:a.signals,evidenceGaps:a.gaps,
          sourceReference:p.sourceReference,sourceEvent:p.event});
        if(prior&&!p.historical&&!prior.historical){
          const dt=p.publishedAt!==null&&prior.publishedAt!==null?(p.publishedAt-prior.publishedAt)/1000:null;
          if(p.publishedAt!==null&&prior.publishedAt!==null&&dt>0&&dt<=360&&p.rating!==null&&prior.rating!==null&&
            !p.q.rejected&&!prior.q.rejected&&!p.integrity.length&&!prior.integrity.length&&
            p.observedAt!==null&&prior.observedAt!==null&&p.observedAt>=p.publishedAt&&prior.observedAt>=prior.publishedAt&&p.observedAt-p.publishedAt<=180000&&prior.observedAt-prior.publishedAt<=180000){
            coveredSeconds+=dt;if(prior.rating>85)estimatedSecondsAbove85+=dt;
          }else if(dt>0&&Number.isFinite(dt))unknownIntervalSeconds+=dt;
        }
        if(p.event&&!pending.some(e=>e.event.id===p.event.id)&&!eventResponses.some(e=>e.event.id===p.event.id)){
          const eventTime=time(p.event.occurredAt),before=[...history].reverse().find(x=>x.publishedAt!==null&&eventTime!==null&&x.publishedAt<eventTime);
          pending.push({event:p.event,eventTime,baseline:before?.rating??null,gameKey:p.gameKey,firstObservedAt:p.observedAt,observationsUntilChange:0});
        }
        for(let i=pending.length-1;i>=0;i--){
          const e=pending[i];e.observationsUntilChange++;
          if(e.baseline!==null&&p.rating!==null&&p.rating-e.baseline>=3&&p.publishedAt!==null&&p.publishedAt>=e.eventTime){
            eventResponses.push({...e,rating:p.rating,responsePublishedAt:p.publishedAt,eventToObservedRiseMs:p.publishedAt-e.eventTime,
              status:'observed association; causality unproven',resolution:'Audit cadence; event time is not provider publication time'});pending.splice(i,1);
          }
        }
        history.push(p);
      }
      eventResponses.push(...pending.map(e=>({...e,eventToObservedRiseMs:null,status:e.baseline===null?'unavailable: no reliable pre-event publication':'right-censored: no observed 3-point rise'})));
      const ratings=history.map(p=>p.rating).filter(x=>x!==null),sport=history[0]?.sport||game.sport;
      games.push({gameKey:game.gameKey,matchup:game.matchup,sport,modelVersion,observations:history.length,
        peakRating:ratings.length?Math.max(...ratings):null,coveredSeconds,estimatedSecondsAbove85,unknownIntervalSeconds,
        decisiveMoments,eventResponses,significant:decisiveMoments.length>0,evidenceGaps:[...evidenceGaps],
        watchability:{earlyDramaThenBlowout:history.some((p,i)=>p.assessment.wideLate&&history.slice(0,i).some(x=>x.rating>=85)),
          lateEmergence:history.some((p,i)=>p.assessment.signals.length>0&&history.slice(0,i).some(x=>!x.assessment.signals.length)),
          competitiveUnderdog:history.some(p=>p.assessment.signals.includes('Credible observed underdog threat')),
          closeButSettled:history.some(p=>p.assessment.settled),retainedHistoryDuringBlowout:history.some(p=>p.assessment.wideLate&&p.q.historyPoints>0)}});
      if(evidenceGaps.size)missing.push({gameKey:game.gameKey,modelVersion,classification:'missing_or_unreliable_evidence',gaps:[...evidenceGaps]});
    }
  }
  const top=(rows,dir)=>{const sorted=rows.sort((a,b)=>(dir==='overrated'?b.rating-a.rating:a.rating-b.rating)||String(a.gameKey).localeCompare(String(b.gameKey)));
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
  return {version:QUALITY_VERSION,mode:'observation-only',methodology:{denominator:'Unique observed live games within each model cohort; never completed ratings',
    timeAbove85:'Left-held sampled estimate strictly >85, fresh publications <=6 minutes apart; gaps and replay duration excluded',
    reaction:'First observed >=3-point rise after a timestamped event with a pre-event baseline; association only, otherwise censored/unavailable',
    provenance:'Observed production and causal reconstructions must be reported separately',providerToPublicationLatency:'Unavailable unless verified provider publication timestamps exist; no acquisition-time substitution',
    costs:'No added provider/AI requests, schedules, storage rows or notifications'},
    topOverrated:top(over,'overrated'),topUnderrated:top(under,'underrated'),
    calibration:QUALITY_SPORTS.map(s=>calibration(games,s)),modelCohorts:[...new Set(games.map(g=>g.modelVersion))].map(model=>({modelVersion:model,
      sports:QUALITY_SPORTS.map(s=>calibration(games,s,model)),topOverrated:top(over.filter(r=>r.modelVersion===model),'overrated'),topUnderrated:top(under.filter(r=>r.modelVersion===model),'underrated')})),
    games,simultaneousPriorityConflicts:simultaneous,integrityProblems:integrity,missingEvidence:missing,
    confirmedScoringDefects:[],limitations:['Candidate lists are review prompts, not objective labels or evidence of delivered alerts.',
      'Final closeness never establishes earlier live excitement. Missing states do not establish uneventful play.',
      'No causal attribution or precise event/publication latency from sparse audit samples. No sport-equivalence claim from selected archives.']};
}
