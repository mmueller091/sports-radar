import evidence from '../../scoring/shared/nfl-pregame.js';
import {articleMetadata,articleMatchesGame,mergeFactors,affectedInjuryTeam} from './storylines.js';
import {summaryUrl} from './providers/espn.js';
import {nflReturnSignificance} from './nfl-return.js';

export const NFL_CONTEXT_TTL=6*60*60*1000;
export const nflTeamNewsUrl=id=>`https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?team=${encodeURIComponent(id)}&limit=20`;

export function nflPregameContext(game,summary,news=[],opposition=[],now=Date.now()) {
  if(game.sport!=='NFL' || game.state!=='upcoming') return [];
  const data=evidence.evidenceFromSummary(game.sourceEvent,summary,opposition);
  if(data) game.sourceCompetition.sportsRadarNflPregame=data;
  const identity={...game,eventId:String(game.id),teams:game.teams.map(t=>({id:String(t[8]),name:t[0],abbr:t[1]})),teamIds:new Set(game.teams.map(t=>String(t[8])))};
  const articles=[...news,...(summary?.news?.articles || [])];
  // The matchup preview is already in the summary: use short, direct evidence
  // clauses rather than treating a full preview as one large bag of keywords.
  const preview=summary?.article;
  if(preview?.story && String(preview.gameId)===String(game.id)) {
    const plain=preview.story.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    const meeting=plain.match(/Last meeting:\s*(.{0,150}?\d{1,2}-\d{1,2} on ([A-Za-z]+)\.?\s+(\d{1,2})(?:,?\s+(20\d{2}))?)/i);
    const date=meeting?Date.parse(`${meeting[2]} ${meeting[3]}, ${meeting[4] || game.sourceEvent.season.year}`):NaN;
    const currentSeason=Number.isFinite(date) && date>=Date.parse(`${game.sourceEvent.season.year}-08-01`) && date<Date.parse(game.startTime);
    if(currentSeason) articles.push({...preview,headline:`Season rematch: ${meeting[1]}`,description:'',story:undefined});
  }
  const metadata=articles.map(articleMetadata).filter(a=>articleMatchesGame(a,identity,now));
  const factors=mergeFactors(metadata.map((article,i)=>({id:String(i),eventId:String(game.id),sport:'NFL',article,game:identity,
    affectedTeamId:affectedInjuryTeam(article,identity)})),[],[],now);
  return factors.map(f=>{
    if(f.type==='star_injury_return') {
      const article=metadata.find(a=>a.url===f.sourceUrl),proof=article && nflReturnSignificance(article,preview,f.injuryEvidence?.importance);
      if(proof)f.injuryEvidence={...f.injuryEvidence,playerSignificance:proof};
    }
    return {...f,verified:true};
  });
}

// Consume existing resource rows in one read. Refreshes use the normal per-URL
// lease/cache after publication; no request is added to the live scoring path.
export async function cachedNflPregame(env,games,now=Date.now()) {
  const upcoming=games.filter(g=>g.sport==='NFL' && g.state==='upcoming' && Date.parse(g.startTime)-now<=42*3600000);
  const urls=[...new Set(upcoming.flatMap(g=>[summaryUrl(g),...g.teams.map(t=>nflTeamNewsUrl(t[8]))]))];
  if(!urls.length) return {contexts:{},deferred:[]};
  const result=await env.DB.prepare(`SELECT key,payload,updated_at FROM sports_resources WHERE key IN (${urls.map(()=>'?').join(',')})`).bind(...urls).all();
  const rows=new Map((result.results || []).map(r=>[r.key,r]));
  const payload=url=>{try{return JSON.parse(rows.get(url)?.payload || 'null');}catch{return null;}};
  const contexts={};
  const opposition=[...new Map(upcoming.flatMap(g=>payload(summaryUrl(g))?.standings?.groups || [])
    .flatMap(g=>g.standings?.entries || []).map(row=>[String(row.id),row])).values()];
  for(const game of upcoming) contexts[game.id]=nflPregameContext(game,payload(summaryUrl(game)),
    game.teams.flatMap(t=>payload(nflTeamNewsUrl(t[8]))?.articles || []),opposition,now);
  return {contexts,deferred:urls.filter(url=>!rows.has(url) || now-rows.get(url).updated_at>=NFL_CONTEXT_TTL)
    .map(url=>({url,version:rows.get(url)?.updated_at || 0,ttl:NFL_CONTEXT_TTL}))};
}
