// Live-only basketball upset context. Ordinary closeness, urgency, win chance,
// historical drama and completed results remain owned by their existing models.
const {clockSeconds,normalizedTime}=require('./shared/time.js');
const {footballPregameSpread}=require('./shared/market.js');
const {eligibility}=require('./football-market.cjs');
const unit=x=>Math.max(0,Math.min(1,Number(x)||0));
const smooth=x=>{x=unit(x);return x*x*(3-2*x);};
const supports=game=>['NCAAB','NBA'].includes(game.sport);
const identity=game=>`${game.sport}:${game.id}:${game.startTime||game.sourceEvent?.date||''}:${game.teams.map(t=>String(t[8])).sort().join(',')}`;
const numeric=value=>value==null||typeof value==='boolean'||typeof value==='object'||!String(value).trim()||
  !/^[+-]?\d+(?:\.\d+)?$/.test(String(value).trim()) ? null : Number(value);
const calibration=Object.freeze({
  // NBA scoring runs are less surprising: smaller ceiling, slower early ramp,
  // and a wider deficit curve. These are independently checked in the matrix.
  NCAAB:Object.freeze({cap:18,maturityPower:1.25,tieWeight:.72,marginScale:6,leadScale:5,spreadScale:12,possessionSeconds:30}),
  NBA:Object.freeze({cap:14,maturityPower:1.9,tieWeight:.66,marginScale:7,leadScale:6,spreadScale:8,possessionSeconds:24})
});

function pregameMarket(game,competition,raw,observed=false) {
  if(!supports(game)||!raw||(competition?.competitors||[]).length!==2)return null;
  const start=Date.parse(game.startTime||game.sourceEvent?.date||'');
  // Staleness is measured at tipoff, not at replay time. A known pregame line
  // stays pregame evidence throughout the game, including multiple overtimes.
  const checked=eligibility(raw,game,Number.isFinite(start)?start:null);
  if(!checked.eligible || checked.quotedAt!==null&&!Number.isFinite(start))return null;
  const listed=raw.close||raw.closing||raw;
  const closed=Boolean(raw.close||raw.closing||listed.pointSpread?.home?.close?.line!=null&&listed.pointSpread?.away?.close?.line!=null);
  const tagged=/\bpregame\b|pre[ -]game|\bclosing\b/i.test([raw.type?.name||raw.type,listed.type?.name||listed.type,raw.marketType].join(' '));
  // An unexplained live-listed spread is not proof of a pregame expectation.
  if(!observed&&!closed&&!tagged&&checked.quotedAt===null)return null;
  const teams=competition.competitors;
  const sides=['home','away'].map(side=>({side,team:teams.find(t=>t.homeAway===side),
    line:numeric(listed.pointSpread?.[side]?.close?.line??listed.pointSpread?.[side]?.open?.line),
    data:listed[`${side}TeamOdds`]||{}}));
  if(sides.some(s=>!s.team?.team?.id))return null;
  if(sides.some(s=>s.data.teamId!=null&&String(s.data.teamId)!==String(s.team.team.id)))return null;
  const signed=sides.filter(s=>s.line!==null);
  if(signed.length===2&&Math.abs(signed[0].line+signed[1].line)>1e-6)return null;
  const indicated=sides.filter(s=>s.data.underdog===true||s.data.favorite===false);
  if(indicated.length>1)return null;
  const match=String(listed.details||'').match(/^(.+?)\s+([+-])\d+(?:\.\d+)?$/);
  const named=match&&sides.find(s=>[s.team.team.abbreviation,s.team.team.displayName,s.team.team.shortDisplayName].includes(match[1]));
  const described=named&&(match[2]==='+'?named:sides.find(s=>s!==named));
  let dog=sides.find(s=>s.line>0);
  if(!dog){
    if(indicated.length===1)dog=indicated[0];
    dog ||= described;
  }
  if(!dog)return null;
  if(indicated.length===1&&indicated[0]!==dog||described&&described!==dog||dog.data.favorite===true||dog.data.underdog===false)return null;
  if(sides.some(s=>s!==dog&&(s.data.underdog===true||s.data.favorite===false)))return null;
  const spread=dog.line>0?dog.line:footballPregameSpread({odds:[raw]});
  if(!(spread>0)||spread>=100)return null;
  // Retain only fields needed to revalidate the same quote on later updates.
  const compact={...Object.fromEntries(['spread','details','lastUpdated','lastModified','type','marketType','description','live','isLive']
    .filter(key=>listed[key]!==undefined).map(key=>[key,listed[key]])),
    ...(listed.pointSpread?{pointSpread:Object.fromEntries(['home','away'].map(side=>[side,Object.fromEntries(['close','open']
      .filter(key=>listed.pointSpread[side]?.[key]?.line!=null).map(key=>[key,{line:listed.pointSpread[side][key].line}]))]))}:{}),
    homeTeamOdds:Object.fromEntries(['favorite','underdog','teamId'].filter(k=>listed.homeTeamOdds?.[k]!==undefined).map(k=>[k,listed.homeTeamOdds[k]])),
    awayTeamOdds:Object.fromEntries(['favorite','underdog','teamId'].filter(k=>listed.awayTeamOdds?.[k]!==undefined).map(k=>[k,listed.awayTeamOdds[k]]))};
  if(checked.quotedAt!==null)compact.lastUpdated=new Date(checked.quotedAt).toISOString();
  if(closed&&!compact.pointSpread)compact.type='closing';
  return {identity:identity(game),teamId:String(dog.team.team.id),teamName:dog.team.team.displayName||'The underdog',
    side:dog.side,spread,reportedAt:checked.quotedAt,source:closed?'verified closing spread':observed?'observed pregame spread':checked.quotedAt===null?'provider-marked pregame spread':'timestamped pregame spread',
    observed,raw:compact};
}

function marketFor(game,competition,summary) {
  const retained=game.liveUpsetMarket;
  if(retained?.identity===identity(game)){
    const market=pregameMarket(game,competition,retained.raw,retained.observed);
    if(market)return market;
  }
  const baseline=game.pregameBaseline;
  const choices=[...(baseline?.source==='observed'?(baseline.odds||[]).map(raw=>({raw,observed:true})):[]),
    ...(competition?.odds||[]).map(raw=>({raw})),...(summary?.pickcenter||[]).map(raw=>({raw})),
    ...(summary?.header?.competitions?.[0]?.odds||[]).map(raw=>({raw})),
    ...(baseline?.source!=='observed'?(baseline?.odds||[]).map(raw=>({raw})):[])];
  for(const {raw,observed} of choices){const market=pregameMarket(game,competition,raw,observed);if(market)return market;}
  return null;
}

function preserveMarket(game,previous) {
  if(!supports(game)||game.state!=='live'||!previous||identity(game)!==identity(previous))return;
  const market=marketFor(previous,previous.sourceCompetition||game.sourceCompetition,null);
  if(market)game.liveUpsetMarket=JSON.parse(JSON.stringify(market));
}

function liveSurprise(core,game,competition,summary,historySummary=summary) {
  const market=marketFor(game,competition,summary),zero={points:0,rawPoints:0,text:'',market,overlap:0};
  if(!supports(game)||game.state!=='live'||!market)return zero;
  const config=calibration[game.sport];
  const dog=game.teams.find(t=>String(t[8])===market.teamId),other=game.teams.find(t=>t!==dog);
  if(!dog||!other||[dog[2],other[2]].some(x=>x==null||x===''||!Number.isFinite(Number(x))))return zero;
  const status=competition?.status||{},period=Number(status.period),seconds=clockSeconds(status);
  const timing=normalizedTime(game.sport,competition),regulation=game.sport==='NCAAB'?2:4;
  if(status.timingUncertain||seconds===null||timing.elapsedSeconds===null||period<1)return zero;
  const remainingSeconds=seconds+Math.max(0,regulation-period)*(game.sport==='NCAAB'?1200:720);
  const progress=unit(timing.progress),margin=Number(dog[2])-Number(other[2]);
  const qualification=smooth((market.spread-4)/6);
  const strength=qualification*(.65+.35*(1-Math.exp(-Math.pow(Math.max(0,market.spread-10)/config.spreadScale,1.2))));
  const maturity=Math.pow(smooth(progress),config.maturityPower);
  const threat=margin>=0 ? config.tieWeight+(1-config.tieWeight)*(1-Math.exp(-margin/config.leadScale))
    : config.tieWeight*Math.exp(-Math.pow(-margin/config.marginScale,1.35));
  const situation=competition.situation||{},rawHolder=situation.possession?.id||situation.possession;
  const possessionId=game.teams.some(t=>String(t[8])===String(rawHolder))?String(rawHolder):null;
  // This is an estimated opportunity budget, never a fabricated possession
  // count. Only confirmed possession changes the immediate chance to shoot.
  const immediateChance=(possessionId===market.teamId? .75:possessionId?0:.2)*smooth(remainingSeconds);
  const expectedPossessions=remainingSeconds/config.possessionSeconds+immediateChance;
  const deficit=Math.max(0,-margin),requiredPossessions=deficit/3+.4*smooth(deficit/3);
  const feasibility=requiredPossessions===0?1:1-Math.exp(-Math.pow(expectedPossessions/requiredPossessions,3));
  const wp=core.winProbabilityImpact(summary,core.gameProgress(game.sport,competition),'live',game.sport);
  const currentProbability=wp.probability==null?null:market.side==='home'?wp.probability:1-wp.probability;
  // WP is a veto on implausible threats, not a second uncertainty award.
  const probabilityGate=currentProbability===null?1:smooth(currentProbability/.12);
  const rawPoints=config.cap*strength*maturity*threat*feasibility*probabilityGate;
  const history=core.momentumImpact(game.sport,historySummary,progress,'live');
  const correlated=(history.factors||[]).filter(f=>/comeback|erased.*deficit|lead change|unanswered|win.chance|win.probability/i.test(f.label))
    .reduce((sum,f)=>sum+Math.max(0,f.points),0);
  const overlap=Math.min(.25*rawPoints,.2*correlated);
  const points=Math.round(Math.min(config.cap,Math.max(0,rawPoints-overlap)));
  return {points,rawPoints,text:points?`${market.teamName}, a ${market.spread}-point underdog, ${margin>0?'leads':margin===0?'is tied':'remains an upset threat while trailing'} ${dog[2]}\u2013${other[2]}`:'',
    market,margin,progress,strength,maturity,threat,remainingSeconds,expectedPossessions,requiredPossessions,feasibility,
    possessionId,currentProbability,probabilityGate,overlap};
}

module.exports={calibration,supports,pregameMarket,marketFor,preserveMarket,liveSurprise};
