import cfbContext from '../../scoring/cfb-verified-context.cjs';
// Selection is editorial scheduling, not scoring. Reuse the canonical seven-day
// slate rather than making a second, narrower set of scoreboard requests.
export const RESEARCH_LIMITS=Object.freeze({days:7,games:30,articles:60,perGame:4,editorialItems:8,providerRequests:6,aiRequests:3});
export const DIAGNOSTIC_KEY='storyline-research-diagnostics:v1';
const DAY=86400000;
const SPORTS=new Set(['NFL','MLB','NHL','NBA','CFB','NCAAB']);
export function canonicalResearchGame(game,now=Date.now()) {
  const start=Date.parse(game?.startTime||'');
  if(!SPORTS.has(game?.sport)||game.state!=='upcoming'||!Number.isFinite(start)||start<now||start>now+7*DAY||
     !Number.isFinite(game.score)||game.score<1||game.score>99||game.timingUncertain)return null;
  const teams=(game.teams||[]).map(t=>({id:String(t[8]||''),name:t[0],abbr:t[1],record:t[5],rank:t[6]}));
  if(teams.length!==2||teams.some(t=>!t.id)||teams[0].id===teams[1].id)return null;
  const ranked=teams.some(t=>Number(t.rank)>=1&&Number(t.rank)<=25);
  const postseason=(game.factors||[]).some(f=>/World Series|Championship|Postseason|Playoff|Final round/.test(f.label||''));
  const verifiedContext=cfbContext.cfbResearchPriority(game,now);
  const exploratory=game.sport==='CFB'&&!ranked&&!postseason&&!verifiedContext&&game.score<47;
  // A potentially fascinating unranked game cannot earn discovery if its
  // low initial rating excludes it from the research pool altogether.
  if(!(game.sport==='NFL'||postseason||ranked||game.score>=47||verifiedContext||exploratory))return null;
  return {key:`${game.sport}:${game.id}`,eventId:String(game.id),id:String(game.id),sport:game.sport,state:'upcoming',
    start,score:game.score,teams,teamIds:new Set(teams.map(t=>t.id)),publicGame:game,verifiedContext,exploratory};
}
const quality=(a,b)=>b.score-a.score||a.start-b.start||a.key.localeCompare(b.key);
export function selectResearchGames(games,lastResearched={},now=Date.now()) {
  const ranked=[...new Map(games.map(g=>[g.key,g])).values()].sort(quality);
  // Twenty guaranteed quality slots. Remaining slots protect sport coverage,
  // then rotate the oldest unresearched candidates, using quality to break ties.
  const selected=ranked.slice(0,20),seen=new Set(selected.map(g=>g.key));
  const add=g=>{if(g&&!seen.has(g.key)&&selected.length<30){selected.push(g);seen.add(g.key);}};
  for(const sport of SPORTS)if(!selected.some(g=>g.sport===sport))add(ranked.find(g=>g.sport===sport));
  // Two of the existing rotation slots protect exceptional unranked CFB games.
  // Reviewed facts are applied independently of selection; no larger AI budget.
  for(const game of ranked.filter(g=>g.verifiedContext&&!seen.has(g.key)).slice(0,2))add(game);
  const last=g=>Number.isFinite(lastResearched[g.key])&&lastResearched[g.key]<=now?lastResearched[g.key]:0;
  // Two exploration slots cycle through unranked CFB games that have no
  // hand-reviewed facts. Discovery must work before a story raises the score.
  for(const game of ranked.filter(g=>g.exploratory&&!seen.has(g.key)).sort((a,b)=>last(a)-last(b)||quality(a,b)).slice(0,2))add(game);
  for(const game of ranked.filter(g=>!seen.has(g.key)).sort((a,b)=>last(a)-last(b)||quality(a,b)))add(game);
  return selected;
}
// The scheduled research job already has a six-request ceiling. On passes
// that need fewer than six sport-wide news feeds, use the unused slots to
// rotate through CFB team-specific news. This is source discovery, not a
// scoring override: articles still pass the usual relevance/evidence gates.
export function selectCfbTeamNews(games,lastTeamResearch={},slots=0,now=Date.now()) {
  if(!Number.isInteger(slots)||slots<=0)return [];
  const candidates=new Map();
  for(const game of games){
    if(game.sport!=='CFB'||game.state!=='upcoming'||game.start<=now)continue;
    for(const team of game.teams||[]){
      const id=String(team.id||'');
      if(!/^[1-9]\d{0,7}$/.test(id))continue;
      const existing=candidates.get(id);
      if(!existing||game.score>existing.score)candidates.set(id,{id,score:game.score,start:game.start,exploratory:Boolean(game.exploratory)});
    }
  }
  const last=id=>{
    const at=Number(lastTeamResearch?.[id]);
    return Number.isFinite(at)&&at>0&&at<=now?at:0;
  };
  const order=(a,b)=>last(a.id)-last(b.id)||b.score-a.score||a.start-b.start||a.id.localeCompare(b.id);
  const ordered=[...candidates.values()].sort(order);
  // Reserve one of multiple spare lookups for a low-rated discovery candidate.
  // Otherwise highly rated programs can use every source request indefinitely.
  const low=slots>1?ordered.find(team=>team.exploratory):null;
  return [...(low?[low]:[]),...ordered.filter(team=>team!==low)]
    .slice(0,Math.min(slots,RESEARCH_LIMITS.providerRequests)).map(t=>t.id);
}
export async function cachedResearchSlate(env,now=Date.now()) {
  const row=await env.DB.prepare('SELECT payload FROM sports_feed WHERE id=1').first();
  if(!row?.payload)return {games:[],reason:'missing-feed'};
  let feed;try{feed=JSON.parse(row.payload);}catch{return {games:[],reason:'invalid-feed'};}
  const at=Date.parse(feed.updatedAt||'');
  if(!Number.isFinite(at)||at>now+60000||now-at>2*60*60*1000)return {games:[],reason:'stale-feed'};
  if(feed.revision){
    if(!Number.isInteger(feed.parts)||feed.parts<1||feed.parts>32)return {games:[],reason:'invalid-parts'};
    const result=await env.DB.prepare('SELECT payload FROM sports_feed_parts WHERE revision=? ORDER BY part').bind(feed.revision).all();
    if(result.results?.length!==feed.parts)return {games:[],reason:'incomplete-parts'};
    try{feed.games=result.results.flatMap(part=>JSON.parse(part.payload));}catch{return {games:[],reason:'invalid-parts'};}
  }
  if(!Array.isArray(feed.games))return {games:[],reason:'invalid-feed'};
  return {games:feed.games.map(g=>canonicalResearchGame(g,now)).filter(Boolean),updatedAt:feed.updatedAt,reason:'canonical-feed'};
}
export async function researchDiagnostics(env) {
  try {const row=await env.DB.prepare('SELECT payload FROM sports_resources WHERE key=?').bind(DIAGNOSTIC_KEY).first();return row?.payload?JSON.parse(row.payload):null;}catch{return null;}
}
export function publicLinkEligible(story,game,now=Date.now()) {
  if(!story||story.verified===false||game?.suppressedContextTypes?.includes(story.type)||story.type==='notable_recent_performance')return false;
  if(story.registryVersion)return cfbContext.verifiedCfbContextEligible(story,game,now);
  const at=Date.parse(story.publishedAt||'');
  if(!Number.isFinite(at)||at>now+60000||now-at>7*DAY)return false;
  try {const u=new URL(story.sourceUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/\/(?:recap|preview)(?:[/?]|$)/i.test(u.pathname))return false;}catch{return false;}
  return Boolean(story.sourceTitle||story.text);
}
