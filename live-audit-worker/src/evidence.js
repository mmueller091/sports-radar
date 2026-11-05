// Audit-only extraction from already retained canonical data. No I/O or scoring.
const number=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const time=v=>typeof v==='number'?number(v):typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
const clock=v=>{const m=/^(\d+):(\d{2})(?:\.\d+)?$/.exec(String(v??''));return m&&+m[2]<60?+m[1]*60+ +m[2]:null;};
export function timelineClockEvidence(plays=[],sport){
  const counts=new Map();
  for(let i=1;i<plays.length;i++){
    const a=plays[i-1],b=plays[i],period=number(b.period?.number),ca=clock(a.clock?.displayValue),cb=clock(b.clock?.displayValue);
    if(period===null||period!==number(a.period?.number)||ca===null||cb===null||ca===cb||time(a.wallclock)===null||time(b.wallclock)===null||time(b.wallclock)<time(a.wallclock))continue;
    if(!counts.has(period))counts.set(period,{increasing:0,decreasing:0});counts.get(period)[cb>ca?'increasing':'decreasing']++;
  }
  return Object.fromEntries([...counts].map(([period,c])=>{const total=c.increasing+c.decreasing;
    const inferred=total>=5&&Math.max(c.increasing,c.decreasing)/total>=.8;
    return [period,{mode:inferred?(c.increasing>c.decreasing?'elapsed':'remaining'):'unknown',basis:'source clock direction corroborated by ordered provider wallclock',samples:total,...c}];}));
}
export function eventKinds(play,sport){
  const text=String(play.text||play.type?.text||play.type||'');const kinds=[];
  if(play.scoringPlay===true)kinds.push(sport==='NHL'?'goal':['NFL','CFB'].includes(sport)&&/touchdown/i.test(text)?'touchdown':'scoring');
  const patterns=[['lead_change',/takes? (?:the )?lead|go.ahead|lead change/i],['game_tying',/ti(?:es|ed|e)[ -](?:the )?game|game.tying/i],
    ['turnover',/intercept|fumble.*(?:lost|recover)|turnover/i],['fourth_down_conversion',/fourth.down.*conver|4th.*(?:first down|conversion)/i],
    ['power_play',/power play/i],['penalty',/penalty/i],['goalie_pulled',/empty net|pull(?:ed|s)? (?:the )?goalie/i],['overtime',/overtime|start.*\bOT\b/i],
    ['shootout',/shootout/i],['walk_off',/walk.off/i],['break_point',/break point/i],['set_point',/set point/i],['match_point',/match point/i],
    ['break_of_serve',/break of serve|breaks? serve/i],['tiebreak',/tie.?break/i],['comeback',/comeback|rally/i]];
  const hockey=new Set(['power_play','goalie_pulled','shootout']),tennis=new Set(['break_point','set_point','match_point','break_of_serve','tiebreak']);
  for(const [kind,re] of patterns){
    if(hockey.has(kind)&&sport!=='NHL'||tennis.has(kind)&&sport!=='Tennis'||kind==='walk_off'&&sport!=='MLB'||kind==='fourth_down_conversion'&&!['NFL','CFB'].includes(sport))continue;
    if(re.test(text))kinds.push(kind);
  }
  return [...new Set(kinds)];
}
export function extractRetainedProviderEvents(summary={},sport,{source=null,cachedAt=null,reviewedAt=null}={}){
  const plays=Array.isArray(summary?.plays)?summary.plays:[],clocks=timelineClockEvidence(plays,sport),byId=new Map();
  const shootoutPeriods=new Set(sport==='NHL'?plays.filter(p=>/shootout|\bSO\b/i.test(JSON.stringify([p.period,p.type,p.text]))).map(p=>number(p.period?.number)):[]);
  for(const play of plays){
    if(!play?.id)continue;
    const kinds=eventKinds(play,sport);if(!kinds.length)continue;
    const occurredAt=time(play.wallclock),period=number(play.period?.number),away=number(play.awayScore),home=number(play.homeScore);
    const text=String(play.text||play.type?.text||'').slice(0,240);
    byId.set(String(play.id),{id:String(play.id),kinds,text,scoringPlay:play.scoringPlay===true,
      occurredAt,timestampKind:occurredAt===null?'unavailable':'provider-event-wallclock',providerPublishedAt:null,
      source:'retrospective-cached-provider-summary',sourceReference:source,sourceAcquiredAt:time(cachedAt),reviewedAt:time(reviewedAt),
      retrospective:true,availabilityAtRating:'unknown',firstRetainedAt:null,
      period,clock:play.clock?.displayValue??null,clockMode:clocks[period]?.mode??'unknown',
      scores:away!==null&&home!==null?[away,home]:null,
      scoreNamespace:shootoutPeriods.has(period)?'shootout-attempts':'regulation-or-overtime',
      correction:/correct|overturn|rescinded|disallow/i.test(text),stateAlignment:'later-revision; historical availability unknown'});
  }
  const available=[...byId.values()],events=available.slice(-200);
  return {events,coverage:{available:available.length,retained:events.length,truncated:available.length>events.length,
    providerTimestamps:events.filter(e=>e.occurredAt!==null).length,completeness:'not-established',
    sourceAcquiredAt:time(cachedAt),reviewedAt:time(reviewedAt),availabilityAtRating:'unknown',
    limitation:'Later retained provider revision; event wallclock is not publication time or evidence of historical scorer availability'}};
}
export function captureEvidenceDetails(game={},options={}){
  const {summary=null,summaryUpdatedAt=null,calculation=null}=options;
  const raw=game.liveRawStatus||{},situation=game.liveRawSituation||{},sport=game.sport;
  const at=time(options.observedAt),reference=time(options.publishedAt);
  const scores=(game.teams||[]).slice(0,2).map(t=>number(t?.[2]));
  const period=number(raw.period),seconds=clock(raw.displayClock),manpower=game.live?.sportImpact?.manpower;
  const summaryId=String(summary?.header?.id??summary?.header?.competitions?.[0]?.id??'');
  const summaryMatches=!summaryId||summaryId===String(game.id);
  const recentCache=time(summaryUpdatedAt)!==null&&at!==null&&at-time(summaryUpdatedAt)>=0&&at-time(summaryUpdatedAt)<=180000;
  const summaryPlays=Array.isArray(summary?.plays)&&summaryMatches&&recentCache?summary.plays:[];
  const clockEvidence=timelineClockEvidence(summaryPlays,sport);
  const plays=[...summaryPlays,...(situation.lastPlay?[situation.lastPlay]:[])];
  const byId=new Map();let rejectedEvents=0;
  for(const play of plays){
    if(!play?.id)continue;
    const kinds=eventKinds(play,sport);if(!kinds.length)continue;
    const pp=number(play.period?.number),pc=clock(play.clock?.displayValue),away=number(play.awayScore),home=number(play.homeScore),occurred=time(play.wallclock);
    // Never attach a cached summary's future play to an earlier rated state.
    const canonicalMode=['elapsed','remaining'].includes(game.inputEvidence?.clockMode)?game.inputEvidence.clockMode:null;
    const mode=canonicalMode||clockEvidence[pp]?.mode||'unknown',length=number(game.live?.sportImpact?.overtime?.periodLength)??(sport==='NHL'&&pp<=3?1200:null);
    const eventRemaining=mode==='remaining'?pc:mode==='elapsed'&&length!==null&&pc!==null?length-pc:null;
    const ahead=pp!==null&&period!==null&&(pp>period||pp===period&&eventRemaining!==null&&seconds!==null&&eventRemaining<seconds);
    const scoreAhead=scores.length===2&&scores.every(x=>x!==null)&&away!==null&&home!==null&&(away>scores[0]||home>scores[1]);
    if(ahead||scoreAhead||occurred!==null&&at!==null&&occurred>at){rejectedEvents++;continue;}
    byId.set(String(play.id),{id:String(play.id),kinds,text:String(play.text||play.type?.text||'').slice(0,240),
      scoringPlay:play.scoringPlay===true,occurredAt:occurred,timestampKind:occurred===null?'unavailable':'provider-event-wallclock',
      providerPublishedAt:null,sourceAcquiredAt:time(summaryUpdatedAt),firstRetainedAt:at,
      period:pp,clock:play.clock?.displayValue??null,clockMode:mode,clockModeEvidence:clockEvidence[pp]??null,scores:away!==null&&home!==null?[away,home]:null,
      source:play===situation.lastPlay?'canonical-last-play':'cached-provider-summary',
      stateAlignment:pp!==null&&away!==null&&home!==null&&eventRemaining!==null?'not-ahead-of-rated-state':'partial',
      correction:/correct|overturn|review/i.test(String(play.text||''))});
  }
  const allEvents=[...byId.values()];
  const model=game.modelVersion??options.modelVersion??null;
  // Same keyed canonical feed, exact identity/model/rating. Do not reconstruct a missing ledger.
  const expectedIdentity=JSON.stringify([game.sport,String(game.id),game.state,game.modelVersion,game.score,game.baseScore,game.factors?.map(f=>[f.label,f.points]),game.live?.bonus,game.momentumPoints,game.trajectoryScoring?.adjustment,game.teams?.map(t=>t[2]),raw.period,raw.displayClock]);
  const ledger=calculation&&calculation.identity===expectedIdentity&&calculation.modelVersion===model&&calculation.total===game.score&&calculation.state===game.state?
    {total:calculation.total,modelVersion:calculation.modelVersion,rows:calculation.rows?.slice(0,80),source:'canonical-feed-calculation'}:null;
  const structured=Boolean(game.evidenceQuality||game.liveRawSituation||game.inputEvidence||game.live?.aggregation);
  const invalid=Boolean(game.evidenceQuality==='invalid'||game.detailStale||game.timingUncertain||game.liveUpdateRejected||game.basketballUpdateRejected||game.summaryLifecycleRejected||game.scoringHistoryRejected);
  return {timestampKind:'canonical-refresh-start',canonicalRefreshStartedAt:reference,canonicalPublishedAt:null,
    providerPublication:null,providerPublicationLatencyMs:null,
    scoreProgressionQuality:game.evidenceQuality??null,
    retainedEvidenceStatus:invalid?'invalid':structured?'partial':'unavailable',
    completenessScope:'Producer complete describes score progression; it does not certify event, possession, market or pressure coverage',
    evidenceReasons:game.evidenceReasons?.slice?.(0,12)??null,evidenceCoverage:game.evidenceCoverage??null,
    ...(typeof manpower?.pulled==='boolean'&&scores.length===2&&scores[0]!==scores[1]?{goaliePulled:manpower.pulled,goalieEvidenceSource:'canonical-scoring-manpower',goalieEvidenceScope:'trailing-team only; other goalie status unknown'}:{}),
    manpower:manpower?pick(manpower,['pulled','powerPlay','advantage']):null,
    components:{baseScore:number(game.baseScore),openingScore:number(game.openingScore),liveBonus:number(game.live?.bonus),
      momentumPoints:number(game.momentumPoints),trajectoryAdjustment:number(game.trajectoryScoring?.adjustment),
      aggregation:game.live?.aggregation??null,sportImpact:game.live?.sportImpact??null,
      factors:(game.factors||[]).slice(0,35),historyOwnership:game.historyOwnership??null,calculation:ledger},
    pregameTeamQuality:game.pregameOutlook?.teamQuality??game.teamQuality??null,
    verifiedSignificance:game.verifiedSignificance?.verified===true?game.verifiedSignificance:null,
    canonicalEvents:allEvents.slice(-48),eventCoverage:{available:allEvents.length,retained:Math.min(48,allEvents.length),
      truncated:allEvents.length>48,rejectedAhead:rejectedEvents,summaryIdentityMatches:summaryMatches,cacheFresh:recentCache,
      completeness:'not-established',providerTimestamps:allEvents.filter(e=>e.occurredAt!==null).length},
    collectionGaps:[...(!summaryMatches?['Cached summary game identity mismatch']:[]),...(allEvents.length>48?['Event retention truncated to latest 48 supported plays']:[]),
      ...(!ledger?['Exact additive scoring ledger unavailable; component telemetry is not an additive reconstruction']:[])]};
}
