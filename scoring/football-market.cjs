// Current upcoming NFL/CFB markets only. Live and historical weights stay owned
// by their existing paths. Callers supply the observation time explicitly.
const {parseLine}=require('./shared/market.js');
const MAX_QUOTE_AGE_MS=48*3600000;
const supports=game=>['NFL','CFB'].includes(game.sport)&&game.state==='upcoming';
const timestamp=value=>value==null||value===''?null:
  typeof value==='number'&&Number.isFinite(value)?value:Date.parse(value);
function eligibility(raw,game,asOf,observedAt=null) {
  if (!raw) return {eligible:false,reason:'missing'};
  const listed=raw.close || raw.closing || raw;
  const type=[raw.type?.name||raw.type,listed.type?.name||listed.type,raw.marketType,raw.description].filter(Boolean).join(' ');
  if(raw.live===true||raw.isLive===true||listed.live===true||listed.isLive===true||/\blive\b|in[ -]?play/i.test(type))
    return {eligible:false,reason:'live'};
  const value=listed.lastUpdated ?? listed.lastModified ?? raw.lastUpdated ?? raw.lastModified;
  const quotedAt=timestamp(value),start=timestamp(game.startTime || game.sourceEvent?.date);
  if(value!=null&&value!==''&&!Number.isFinite(quotedAt))return {eligible:false,reason:'invalid timestamp'};
  if(Number.isFinite(quotedAt)&&Number.isFinite(start)&&quotedAt>start)return {eligible:false,reason:'after kickoff'};
  const now=timestamp(asOf),at=Number.isFinite(quotedAt)?quotedAt:timestamp(observedAt);
  if(Number.isFinite(at)&&Number.isFinite(now)) {
    if(at>now+5*60000)return {eligible:false,reason:'future timestamp'};
    if(now-at>MAX_QUOTE_AGE_MS)return {eligible:false,reason:'stale'};
  }
  return {eligible:true,reason:quotedAt==null?'untimestamped':'current',quotedAt:Number.isFinite(quotedAt)?quotedAt:null};
}
const sameGame=(a,b)=>b&&a.sport===b.sport&&String(a.id)===String(b.id)&&a.startTime===b.startTime&&
  a.teams.map(t=>String(t[8])).sort().join('|')===b.teams?.map(t=>String(t[8])).sort().join('|');

// Older publications retained only the displayed line. Recover exactly that
// market, including total and favorite direction; do not invent a closing time.
function fromDisplayedLine(line,competition) {
  if(!line || !line.spread && line.total==null)return null;
  const raw={details:line.spread || '',overUnder:line.total,provider:{name:line.provider || ''}};
  const favorite=String(line.spread||'').match(/^(.+?)\s+-\d+(?:\.\d+)?$/)?.[1];
  const side=(competition?.competitors||[]).find(t=>[t.team?.abbreviation,t.team?.displayName].includes(favorite))?.homeAway;
  if(side){raw[`${side}TeamOdds`]={favorite:true,underdog:false};raw[`${side==='home'?'away':'home'}TeamOdds`]={favorite:false,underdog:true};}
  if(line.lastUpdated!=null)raw.lastUpdated=line.lastUpdated;
  return raw;
}

function prepareUpcomingMarket(game,competition,summary=null,previous=null,asOf=game.marketAsOf,previousObservedAt=null) {
  if(!supports(game))return competition;
  // Observation time is an evaluation input, not a content change that should
  // invalidate the feed's reusable summary fingerprints on every refresh.
  if(asOf!=null)Object.defineProperty(game,'marketAsOf',{value:asOf,writable:true,configurable:true,enumerable:false});
  const now=timestamp(game.marketAsOf),prior=sameGame(game,previous)&&previous.state==='upcoming'?previous:null;
  const retained=prior?.pregameMarketQuote || game.pregameMarketQuote;
  const candidates=[...(competition?.odds||[]),...(summary?.pickcenter||[]),
    ...(summary?.header?.competitions?.[0]?.odds||[]),...(summary?.odds||[])];
  let selected=null;
  for(const raw of candidates) {
    if(eligibility(raw,game,now).eligible && parseLine(raw,competition,game.sport)) {
      const unchanged=retained?.source==='provider' && JSON.stringify(raw)===JSON.stringify(retained.raw);
      const observedAt=unchanged && Number.isFinite(retained.observedAt)
        ? Number.isFinite(now)?Math.min(retained.observedAt,now):retained.observedAt : Number.isFinite(now)?now:null;
      selected={raw,observedAt,source:'provider'};break;
    }
  }
  // A provider-sourced quote was observed at the prior publication. Capture
  // that time once on omission; repeated missing updates never renew it.
  const retainedAt=prior && retained?.source==='provider'
    ? timestamp(previousObservedAt) ?? timestamp(prior.marketAsOf) ?? retained.observedAt : retained?.observedAt;
  if(!selected && retained && eligibility(retained.raw,game,now,retainedAt).eligible && parseLine(retained.raw,competition,game.sport))
    selected={...retained,observedAt:retainedAt,source:retained.source==='provider'?'retained provider market':retained.source};
  // Migration is bounded by the first time this untimestamped retained market
  // is observed, never by another later feed refresh or by days until kickoff.
  if(!selected && !retained && prior) {
    const raw=fromDisplayedLine(prior.line,competition);
    if(eligibility(raw,game,now,prior.marketAsOf).eligible && parseLine(raw,competition,game.sport))
      selected={raw,observedAt:timestamp(prior.marketAsOf) ?? (Number.isFinite(now)?now:null),source:'retained displayed market'};
  }
  game.pregameMarketQuote=selected;
  game.line=selected?parseLine(selected.raw,competition,game.sport):null;
  return {...competition,odds:selected?[selected.raw]:[],sportsRadarPregameMarketManaged:true};
}
module.exports={MAX_QUOTE_AGE_MS,eligibility,prepareUpcomingMarket,supports};
