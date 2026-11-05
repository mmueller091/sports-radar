import {retainedDocuments} from './source-research.js';
// Historical search utilities and a dormant, capped GDELT adapter.
// Cross-domain headline matches are discovery candidates, not verification.
// There is no production GDELT caller or scoring promotion.
export const OPEN_NEWS_KEY='open-news-evidence:v1';
export const OPEN_NEWS_LIMITS=Object.freeze({gamesPerRequest:5,articlesPerRequest:75,maxEvidence:180,ttlDays:7});
const DAY=86400000;
const SPORTS=['NFL','NBA','NHL','MLB','CFB','NCAAB'];
const SCOREABLE=new Set(['rivalry','coach_return','former_star_return','former_captain_return','playoff_rematch','championship_rematch']);
const SOURCES=new Set(['espn.com','apnews.com','reuters.com','cbssports.com','foxsports.com','nbcsports.com',
  'usatoday.com','sports.yahoo.com','si.com','theathletic.com','nfl.com','nba.com','nhl.com','mlb.com',
  'ncaa.com','nhlpa.com','on3.com','sportsnet.ca','tsn.ca']);
const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const quote=value=>'"'+value.replace(/["\\]/g,'').trim()+'"';

function aliasList(team,sport) {
  const full=clean(team.name),words=full.split(' ');
  const school=words.slice(0,-1).join(' ');
  const college=sport==='CFB'||sport==='NCAAB';
  return [...new Set([full,school,
    ...(college?[words.slice(0,2).join(' '),words[0]]:[words.at(-1),words.slice(-2).join(' ')]),
    clean(team.abbr).length>=3?clean(team.abbr):''])].filter(name=>name.length>=3);
}
const mentions=(title,team,sport)=>aliasList(team,sport).some(name=>
  new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(name)}(?:$|[^A-Za-z0-9])`,'i').test(title));
// A shared city or school prefix (for example, North Carolina and North
// Carolina State) cannot serve as evidence for both teams at once.
function distinctTeamAliases(game) {
  const aliases=game.teams.map(team=>aliasList(team,game.sport));
  return aliases.map((list,i)=>list.filter(name=>!aliases[1-i].some(other=>other.toLowerCase()===name.toLowerCase())));
}
function mentionsPair(text,game) {
  return distinctTeamAliases(game).every(list=>list.some(name=>
    new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(name)}(?:$|[^A-Za-z0-9])`,'i').test(text)));
}
export function identifiesMatchup(text,game) {
  const lists=distinctTeamAliases(game);
  if(lists.some(list=>!list.length))return false;
  const [a,b]=lists.map(list=>`(?:${list.map(escapeRegExp).join('|')})`);
  const connector=String.raw`(?:\s+(?:and|vs\.?|versus|at|faces?|facing|hosts?|hosting|meets?|meeting|plays?|playing|against)\s+|\s*[-–—]\s*)`;
  return new RegExp(`(?:^|[^A-Za-z0-9])(?:${a}${connector}${b}|${b}${connector}${a})(?:$|[^A-Za-z0-9])`,'i').test(text);
}
function rootDomain(url) {
  let host;try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return null;host=parsed.hostname.toLowerCase();}catch{return null;}
  if(host.endsWith('.edu'))return host;
  return [...SOURCES].find(domain=>host===domain||host.endsWith('.'+domain))||null;
}
function sourceDate(value) {
  if(typeof value!=='string')return NaN;
  // GDELT seendate is normally YYYYMMDDTHHMMSSZ, rather than ISO 8601.
  const stamp=/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(value);
  return Date.parse(stamp?`${stamp[1]}-${stamp[2]}-${stamp[3]}T${stamp[4]}:${stamp[5]}:${stamp[6]}Z`:value);
}
const stableTitle=title=>title.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function nearDuplicateTitle(first,second) {
  const stop=new Set(['a','an','and','as','at','by','for','in','of','on','the','to','with']);
  const tokens=title=>new Set(stableTitle(title).split(' ').filter(word=>word&&!stop.has(word)));
  const a=tokens(first),b=tokens(second);
  if(!a.size||!b.size)return true;
  return [...a].filter(word=>b.has(word)).length/Math.min(a.size,b.size)>=0.8;
}

export function eligibleOpenGame(game) {
  if(!game||game.state!=='upcoming'||!SPORTS.includes(game.sport)||game.teams?.length!==2)return false;
  // College news can otherwise dwarf the entire research rotation. Require
  // at least one top-25 team for this *additional* search. Existing ESPN
  // discovery of unranked games is unchanged.
  return !['CFB','NCAAB'].includes(game.sport)||game.teams.some(t=>Number(t.rank)>=1&&Number(t.rank)<=25);
}
export function selectOpenNewsGames(games,lastResearched={},now=Date.now(),limit=OPEN_NEWS_LIMITS.gamesPerRequest) {
  const bySport=new Map();
  const last=game=>{const at=Number(lastResearched[game.key]);return Number.isFinite(at)&&at>0&&at<=now?at:0;};
  const eligible=[...new Map(games.filter(g=>eligibleOpenGame(g)&&g.start>now).map(g=>[g.key,g])).values()];
  const order=(a,b)=>last(a)-last(b)||b.score-a.score||a.start-b.start||a.key.localeCompare(b.key);
  for(const sport of SPORTS)bySport.set(sport,eligible.filter(g=>g.sport===sport).sort(order));
  const result=[];
  // One per league first, then oldest untouched games. No sport can crowd out
  // another just because its slate contains a hundred college games.
  const start=Math.floor(now/(2*3600000))%SPORTS.length;
  const rotated=[...SPORTS.slice(start),...SPORTS.slice(0,start)];
  for(const sport of rotated.sort((a,b)=>last(bySport.get(a)?.[0]||{})-last(bySport.get(b)?.[0]||{})))
    if(bySport.get(sport)?.[0]&&result.length<limit)result.push(bySport.get(sport)[0]);
  for(const game of eligible.filter(g=>!result.includes(g)).sort(order))if(result.length<limit)result.push(game);
  return result;
}

export function openNewsUrl(games,history=[]) {
  const aliases=[...new Set(games.flatMap(game=>game.teams.map(team=>{
    const values=aliasList(team,game.sport);
    // Prefer the school (CFB/NCAAB) and the nickname (pro) in the API query;
    // article acceptance still requires independently matching both teams.
    const names=clean(team.name).split(' ');
    const collegeName=/^(?:Ohio|Ole|Notre|North|South|East|West|New|Penn)$/i.test(names[0])?
      names.slice(0,2).join(' '):names[0];
    const candidate=['CFB','NCAAB'].includes(game.sport)?collegeName:
      values.find(a=>a===team.name?.split(' ').at(-1))||values[0];
    // GDELT rejects quoted phrases shorter than four characters, so a single
    // abbreviation such as BYU or LSU otherwise invalidates the whole query.
    return candidate?.length>=4?candidate:clean(team.name);
  })).filter(name=>name.length>=4))];
  if(!aliases.length)return null;
  const pairs=new Set(games.map(game=>`${game.sport}:${game.teams.map(team=>String(team.id)).sort().join(':')}`));
  // Previously discovered historical names become search hints, not scoring
  // evidence. They help a free news index find "Holy War" style headlines.
  for(const item of historicalHints(history).filter(item=>pairs.has(item.pairKey)).slice(0,4)){
    const name=clean(item.title.split('(')[0]);
    if(name.length>=5&&name.length<=36&&!/rivalry$/i.test(name))aliases.push(name);
  }
  const query=`(${aliases.map(quote).join(' OR ')}) (rivalry OR rematch OR return OR coach OR injury OR suspension OR milestone OR playoff OR championship OR trade) sourcelang:english`;
  if(query.length>950)return null;
  const url=new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  for(const [key,value] of Object.entries({query,mode:'artlist',format:'json',timespan:'1week',sort:'datedesc',maxrecords:String(OPEN_NEWS_LIMITS.articlesPerRequest)}))url.searchParams.set(key,value);
  return url.toString();
}

export function historicalSearchUrl(game) {
  if(!eligibleOpenGame(game))return null;
  const names=game.teams.map(team=>{
    const words=clean(team.name).split(' ');
    return ['CFB','NCAAB'].includes(game.sport)?words.slice(0,Math.min(2,words.length-1)).join(' '):words.at(-1);
  });
  const query=`${names.join(' ')} rivalry`;
  const url=new URL('https://en.wikipedia.org/w/rest.php/v1/search/page');
  url.searchParams.set('q',query);url.searchParams.set('limit','5');
  return url.toString();
}

export function historicalRivalry(payload,game,now=Date.now()) {
  if(!Array.isArray(payload?.pages)||!eligibleOpenGame(game))return null;
  for(const page of payload.pages.slice(0,5)){
    const title=clean(page?.title),description=clean(`${page?.description||''} ${String(page?.excerpt||'').replace(/<[^>]*>/g,' ')}`);
    if(title.length<5||title.length>160||!/rivalry|rivals?\b|derby/i.test(`${title} ${description}`)||
      /disambiguation|list of|season/i.test(title)||!mentionsPair(title,game))continue;
    const pairKey=`${game.sport}:${game.teams.map(team=>String(team.id)).sort().join(':')}`;
    return {pairKey,type:'rivalry',title,description:description.slice(0,220),
      url:`https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g,'_'))}`,observedAt:now};
  }
  return null;
}

export function historicalHints(history=[],now=Date.now()) {
  return history.filter(item=>item?.type==='rivalry'&&item.title&&item.pairKey&&Number.isFinite(item.observedAt)&&
    item.observedAt>now-365*DAY&&item.observedAt<=now);
}

export function parseOpenArticles(payload,now=Date.now()) {
  if(!Array.isArray(payload?.articles))return [];
  return payload.articles.slice(0,OPEN_NEWS_LIMITS.articlesPerRequest).flatMap(row=>{
    const title=clean(row?.title),url=clean(row?.url),host=rootDomain(url),published=sourceDate(row?.seendate||row?.published);
    if(!host||!title||title.length>260||!/^(?:https):\/\//i.test(url)||
      /\/(?:recap|preview)(?:[/?]|$)/i.test(new URL(url).pathname)||
      !Number.isFinite(published)||published>now+300000||now-published>7*DAY)return [];
    if(/recap|highlights|odds|fantasy|prop bets?|mock draft|uniform/i.test(title))return [];
    return [{title,url,host,published}];
  });
}

export function openNewsCandidates(games,articles,classify,now=Date.now()) {
  const result=[];
  for(const game of games){
    for(const article of articles){
      const host=rootDomain(article.url);
      if(!host||!Number.isFinite(article.published)||now-article.published>7*DAY||article.published>now+300000)continue;
      if(/\/(?:recap|preview)(?:[/?]|$)/i.test(new URL(article.url).pathname))continue;
      if(!mentionsPair(article.title,game)||!identifiesMatchup(article.title,game))continue;
      const factor=classify({headline:article.title,description:''});
      if(!factor?.type||!SCOREABLE.has(factor.type))continue;
      if(/\b(?:after|following|prior to)\b.{0,80}\b(?:rivalry|rematch|playoff|championship)\b/i.test(article.title))continue;
      if(factor.type==='coach_return'&&!/former (?:team|school|program|club)|old (?:team|school|club)|returns? to (?:his|her|their) old|back to (?:former|old)/i.test(article.title))continue;
      // The same untrusted title cannot establish both a novel assertion and
      // its proof. Reject generic future schedule, hypothetical and questions.
      if(/\b(?:might|could|may|rumor|possible|reportedly|scheduled for 20\d\d|future series|not a rivalry)\b|\?/i.test(article.title))continue;
      const currentYear=new Date(game.start).getUTCFullYear();
      if([...article.title.matchAll(/\b20\d{2}\b/g)].some(match=>Number(match[0])>currentYear))continue;
      result.push({gameKey:game.key,eventId:game.eventId,sport:game.sport,type:factor.type,
        title:article.title,url:article.url,host,published:article.published});
    }
  }
  return result;
}

export function corroboratedOpenNews(games,evidence,now=Date.now()) {
  // Dormant adapter heuristic only. Different titles/domains do not establish
  // independent reporting; production does not use this to authorize scoring.
  const ready=[];
  for(const game of games){
    const related=evidence.filter(item=>item.gameKey===game.key&&item.published<=now+300000&&now-item.published<=7*DAY);
    for(const type of SCOREABLE){
      const articles=related.filter(item=>item.type===type).sort((a,b)=>b.published-a.published);
      const lead=articles[0];if(!lead)continue;
      // Similar syndicated headlines are not independent corroboration merely
      // because they appear on different domains or have minor edits.
      const other=articles.find(item=>item.host!==lead.host&&!nearDuplicateTitle(item.title,lead.title));
      if(other)ready.push({game,lead,corroboration:other});
    }
  }
  return ready;
}

export function mergeOpenEvidence(oldEvidence,newEvidence,now=Date.now()) {
  const seen=new Set(),result=[];
  for(const item of [...newEvidence,...oldEvidence]){
    const host=rootDomain(item?.url);
    if(!item?.gameKey||!SCOREABLE.has(item.type)||!host||!clean(item.title)||!Number.isFinite(item.published)||
      item.published>now+300000||now-item.published>7*DAY)continue;
    const key=`${item.gameKey}:${item.type}:${item.url}`;
    if(seen.has(key))continue;seen.add(key);result.push({...item,host,title:clean(item.title).slice(0,260)});
    if(result.length===OPEN_NEWS_LIMITS.maxEvidence)break;
  }
  return result;
}

export async function readOpenNewsState(env,now=Date.now()) {
  try{
    const row=await env.DB.prepare('SELECT payload FROM sports_resources WHERE key=?').bind(OPEN_NEWS_KEY).first();
    const state=row?.payload?JSON.parse(row.payload):{};
    return {documents:retainedDocuments(state.documents,now),lastVerified:state.lastVerified||{},sourceFailureUntil:state.sourceFailureUntil||{},sourceIndex:state.sourceIndex||{},evidence:Array.isArray(state.evidence)?state.evidence:[],
      lastResearched:state.lastResearched&&typeof state.lastResearched==='object'?state.lastResearched:{},
      failureUntil:Number.isFinite(state.failureUntil)?state.failureUntil:0,
      history:historicalHints(state.history,now),
      lastHistoryResearched:state.lastHistoryResearched&&typeof state.lastHistoryResearched==='object'?state.lastHistoryResearched:{},
      historyFailureUntil:Number.isFinite(state.historyFailureUntil)?state.historyFailureUntil:0};
  }catch{return {documents:[],lastVerified:{},sourceFailureUntil:{},sourceIndex:{},evidence:[],lastResearched:{},failureUntil:0,history:[],lastHistoryResearched:{},historyFailureUntil:0};}
}
export async function writeOpenNewsState(env,state,now=Date.now()) {
  const recent=Object.fromEntries(Object.entries(state.lastResearched||{}).filter(([,at])=>Number.isFinite(at)&&at>now-8*DAY&&at<=now).slice(-350));
  const lastHistoryResearched=Object.fromEntries(Object.entries(state.lastHistoryResearched||{}).filter(([,at])=>Number.isFinite(at)&&at>now-365*DAY&&at<=now).slice(-350));
  const lastVerified=Object.fromEntries(Object.entries(state.lastVerified||{}).filter(([,at])=>Number.isFinite(at)&&at>now-8*DAY&&at<=now).slice(-350));
  const sourceFailureUntil=Object.fromEntries(Object.entries(state.sourceFailureUntil||{}).filter(([,at])=>Number.isFinite(at)&&at>now&&at<=now+6*3600000).slice(-350));
  const sourceIndex=Object.fromEntries(Object.entries(state.sourceIndex||{}).filter(([key,index])=>Object.hasOwn(lastVerified,key)&&Number.isInteger(index)&&index>=0).slice(-350));
  await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .bind(OPEN_NEWS_KEY,JSON.stringify({documents:retainedDocuments(state.documents,now),lastVerified,sourceFailureUntil,sourceIndex,evidence:mergeOpenEvidence([],state.evidence||[],now),lastResearched:recent,failureUntil:state.failureUntil||0,
      history:historicalHints(state.history,now).slice(-100),lastHistoryResearched,historyFailureUntil:state.historyFailureUntil||0}),now).run();
}
