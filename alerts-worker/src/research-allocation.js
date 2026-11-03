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
  if(!(game.sport==='NFL'||postseason||ranked||game.score>=47))return null;
  return {key:`${game.sport}:${game.id}`,eventId:String(game.id),id:String(game.id),sport:game.sport,state:'upcoming',
    start,score:game.score,teams,teamIds:new Set(teams.map(t=>t.id)),publicGame:game};
}
const quality=(a,b)=>b.score-a.score||a.start-b.start||a.key.localeCompare(b.key);
export function selectResearchGames(games,lastResearched={},now=Date.now()) {
  const ranked=[...new Map(games.map(g=>[g.key,g])).values()].sort(quality);
  // Twenty guaranteed quality slots. Remaining slots protect sport coverage,
  // then rotate the oldest unresearched candidates, using quality to break ties.
  const selected=ranked.slice(0,20),seen=new Set(selected.map(g=>g.key));
  const add=g=>{if(g&&!seen.has(g.key)&&selected.length<30){selected.push(g);seen.add(g.key);}};
  for(const sport of SPORTS)if(!selected.some(g=>g.sport===sport))add(ranked.find(g=>g.sport===sport));
  const last=g=>Number.isFinite(lastResearched[g.key])&&lastResearched[g.key]<=now?lastResearched[g.key]:0;
  for(const game of ranked.filter(g=>!seen.has(g.key)).sort((a,b)=>last(a)-last(b)||quality(a,b)))add(game);
  return selected;
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
  const at=Date.parse(story.publishedAt||'');
  if(!Number.isFinite(at)||at>now+60000||now-at>7*DAY)return false;
  try {const u=new URL(story.sourceUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||/\/(?:recap|preview)(?:[/?]|$)/i.test(u.pathname))return false;}catch{return false;}
  return Boolean(story.sourceTitle||story.text);
}
