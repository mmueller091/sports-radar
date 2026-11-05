import contextPolicy from '../../scoring/shared/context.js';
// Publisher identities are configuration, never matchup facts or rating overrides.
const TEAM_SITES={
  'baltimoreravens.com':{sport:'NFL',team:'33',index:'/news/transcripts'},
  'lsusports.net':{sports:['CFB','NCAAB'],team:'99',index:'/sports/fb'},
  'rolltide.com':{sports:['CFB','NCAAB'],team:'333',index:'/sports/football'},
  'byucougars.com':{sports:['CFB','NCAAB'],team:'252',index:'/sports/football'},
  'georgiadogs.com':{sports:['CFB','NCAAB'],team:'61',index:'/sports/football'},
  'utsports.com':{sports:['CFB','NCAAB'],team:'2633',index:'/sports/football'},
  'goducks.com':{sports:['CFB','NCAAB'],team:'2483',index:'/sports/football'},
  'goarmywestpoint.com':{sports:['CFB','NCAAB'],team:'349',index:'/sports/football'},
  'miamihurricanes.com':{sports:['CFB','NCAAB'],team:'2390',index:'/sports/football'},
  'texaslonghorns.com':{sports:['CFB','NCAAB'],team:'251',index:'/sports/football'}
};
const LEAGUES={NFL:'nfl.com',NHL:'nhl.com',NBA:'nba.com',MLB:'mlb.com',CFB:'ncaa.com',NCAAB:'ncaa.com'};
const PUBLISHERS={'espn.com':'disney','abcnews.go.com':'disney','apnews.com':'ap','reuters.com':'reuters','cbssports.com':'paramount','nbcsports.com':'nbcuniversal'};
export const EVIDENCE_VERSION=1;
export const SOURCE_LIMITS=Object.freeze({requests:2,bytes:1048576,cacheBytes:786432,body:32000,documents:24,clauses:100,historyDays:365});
const DAY=86400000;
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const reEscape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const normalize=v=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const gameTeams=g=>(g?.teams||[]).map(t=>({id:String(t.id||t[8]||''),name:clean(t.name||t[0]),abbr:clean(t.abbr||t[1])}));
const localDate=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
const gameStart=g=>Number(g.start)||Date.parse(g.startTime||'');
const gameId=g=>String(g.eventId||g.id||'');
const hostOf=value=>{try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.hostname.replace(/^www\./,''):null;}catch{return null;}};
function aliases(t){const w=t.name.split(' ');return [...new Set([t.name,t.abbr,w.slice(0,-1).join(' '),w.at(-1),w.slice(-2).join(' ')])].filter(n=>n.length>=3);}
function named(text,t,other){return aliases(t).filter(a=>!other||!aliases(other).some(b=>normalize(a)===normalize(b))).some(a=>new RegExp(`(?:^|[^a-z0-9])${reEscape(a)}(?:$|[^a-z0-9])`,'i').test(text));}
export const reportingSourceAllowed=url=>Boolean(PUBLISHERS[hostOf(url)]);
export function sourceAuthority(url,game){
  const host=hostOf(url);if(!host)return null;
  const sport=game.sport,teams=gameTeams(game),site=TEAM_SITES[host];
  if(site&&(site.sport===sport||site.sports?.includes(sport))&&teams.some(t=>t.id===site.team))return {kind:'team',team:site.team,host};
  if(host!==LEAGUES[sport])return null;
  const path=new URL(url).pathname.toLowerCase();
  // NCAA hosts multiple sports; the URL itself must identify the correct one.
  if(host==='ncaa.com'&&!path.includes(sport==='CFB'?'/football/':'/basketball-men/'))return null;
  const owner=teams.find(t=>{const w=t.name.toLowerCase().split(' ');return [w.at(-1),w.slice(-2).join('')].some(n=>path.startsWith('/'+n+'/'));});
  return owner?{kind:'team',team:owner.id,host}:{kind:'league',host};
}
export function officialIndexes(game){
  const ids=new Set(gameTeams(game).map(t=>t.id)),sport=game.sport;
  const sites=Object.entries(TEAM_SITES).filter(([,s])=>(s.sport===sport||s.sports?.includes(sport))&&ids.has(s.team))
    .map(([host,s])=>`https://${host==='baltimoreravens.com'?'www.':''}${host}${sport==='NCAAB'?'/sports/mens-basketball':s.index}`);
  const league=LEAGUES[sport];
  if(league)sites.push(`https://www.${league}/news${league==='ncaa.com'?sport==='CFB'?'/football/fbs':'/basketball-men/d1':''}`);
  return sites;
}
export function decodeHtml(text){return String(text).replace(/&(?:#(x[0-9a-f]+|\d+)|amp|lt|gt|quot|apos|nbsp);/gi,(all,n)=>n?String.fromCodePoint(Math.min(0x10ffff,parseInt(n[0].toLowerCase()==='x'?n.slice(1):n,n[0].toLowerCase()==='x'?16:10))):({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[all.toLowerCase()]||all);}
function htmlText(text){return decodeHtml(String(text).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<\/?(?:p|div|br|h\d|li)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' '));}
export function documentFromHtml(html,url,at=Date.now()){
  if(typeof html!=='string'||html.length>SOURCE_LIMITS.bytes||!hostOf(url))return null;
  const nodes=[];
  const collect=v=>{if(Array.isArray(v)){for(const x of v.slice(0,40))collect(x);}else if(v&&typeof v==='object'){nodes.push(v);if(v['@graph'])collect(v['@graph']);}};
  for(const tag of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
    if(!/type\s*=\s*["']application\/ld\+json["']/i.test(decodeHtml(tag[1])))continue;
    try{collect(JSON.parse(tag[2]));}catch{}
  }
  const article=nodes.find(n=>['NewsArticle','Article','ReportageNewsArticle'].includes(n['@type'])&&typeof n.articleBody==='string');
  if(!article)return null;
  const title=clean(htmlText(article.headline)),body=htmlText(article.articleBody).replace(/[^\S\n]+/g,' ').trim(),published=Date.parse(article.datePublished||'');
  if(!title||title.length>260||!body||body.length>SOURCE_LIMITS.body||!Number.isFinite(published)||published>at+60000)return null;
  // A self-declared canonical URL cannot switch publisher or article identity.
  try{if(article.url&&new URL(article.url,url).href.replace(/\/$/,'')!==new URL(url).href.replace(/\/$/,''))return null;}catch{return null;}
  const authors=[article.author].flat().filter(Boolean).map(a=>clean(typeof a==='string'?a:a.name)).filter(a=>a&&a.length<=120).slice(0,8);
  const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)].flatMap(m=>{try{const u=new URL(decodeHtml(m[1]),url);return u.href.length<=2048&&hostOf(u.href)&&hostOf(u.href)!==hostOf(url)?[u.href]:[];}catch{return [];}}).slice(0,80);
  return {version:EVIDENCE_VERSION,url,title,body,published,retrievedAt:at,authors,section:clean(article.articleSection).slice(0,120),links};
}
export function officialLinks(html,index,game,headline=''){
  const found=[];
  for(const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    let url;try{url=new URL(decodeHtml(match[1]),index);url.hash='';}catch{continue;}
    if(hostOf(url.href)!==hostOf(index)||!sourceAuthority(url.href,game)||url.search||!/(?:\/news\/|\/article\/)/.test(url.pathname))continue;
    const title=clean(htmlText(match[2]));
    if(!title||url.href===index||/video|photos|podcast|tickets/i.test(url.pathname))continue;
    const transcript=/transcript.*press[- ]conference/i.test(url.pathname+' '+title);
    const teamMatch=gameTeams(game).some(t=>named(title,t));
    if(!transcript&&!teamMatch)continue;
    const words=normalize(headline).split(' ').filter(w=>w.length>3),overlap=words.filter(w=>normalize(title).includes(w)).length;
    found.push({url:url.href,title,priority:Number(transcript&&/starter|start|quarterback|coach/i.test(headline))*20+overlap});
  }
  return [...new Map(found.map(x=>[x.url,x])).values()].sort((a,b)=>b.priority-a.priority).slice(0,40);
}
const SPECULATION=/\b(?:could|might|may|would|should|hopes?|plans? to|thinks?|rumou?rs?|reportedly|possible|expected|expects?|questionable|doubtful|not confirmed|unconfirmed|denied|denies|false|incorrect|retracted|cancelled|no longer|never|if|not yet|will not|won't|isn't|is not)\b|\?/i;
function clauses(doc){return doc.body.replace(/\b(No|Jr|Sr|St|Dr)\./g,'$1\uE000').split(/\n+|(?<=[.!?])\s+/).map(s=>clean(s.replaceAll('\uE000','.'))).filter(s=>s.length>=12&&s.length<=1000).slice(0,SOURCE_LIMITS.clauses);}
function dayBound(text,doc,game,slate){
  const start=gameStart(game),date=localDate(start),pubDate=localDate(doc.published);
  const dates=[...text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g)].map(m=>m[1]);
  if(dates.length&&!(dates.length===1&&dates[0]===date))return false;
  const day=String(text.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i)?.[1]||'').toLowerCase();
  const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  let wanted;
  if(dates.length)wanted=dates[0];
  else if(day){const pub=new Date(pubDate+'T12:00Z');let delta=(days.indexOf(day)-pub.getUTCDay()+7)%7;if(/next\s+/i.test(text)&&delta===0)delta=7;wanted=new Date(pub.getTime()+delta*DAY).toISOString().slice(0,10);}
  else if(/\b(?:tonight|today)\b/i.test(text))wanted=pubDate;
  else if(/\btomorrow\b/i.test(text))wanted=new Date(Date.parse(pubDate+'T12:00Z')+DAY).toISOString().slice(0,10);
  else return false;
  if(wanted!==date)return false;
  // Date-only claims cannot choose one of two games played by a team that day.
  const ids=new Set(gameTeams(game).map(t=>t.id));
  return !(slate||[]).some(g=>g.sport===game.sport&&gameId(g)!==gameId(game)&&Number.isFinite(gameStart(g))&&localDate(gameStart(g))===date&&gameTeams(g).some(t=>ids.has(t.id)));
}
function subjectFor(text,type){
  if(['ace_pitching_matchup','rivalry','playoff_rematch','championship_rematch','meaningful_rematch'].includes(type))return 'matchup';
  const words=String(text).replace(/[\[\]*]/g,'');
  const start=words.match(/(?:announced|confirmed|named|starting|start(?:er)?(?: is| will be)?|quarterback|QB|goalie|pitcher)\s+([A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+){1,2})\b/);
  const name=start?.[1]||words.match(/\b([A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+)\s+(?:will|is|returns?|needs?|has|makes?|was|told|confirmed)\b/)?.[1];
  return name?normalize(name):'';
}
function primaryConfirmation(doc,authority,text){
  if(!authority)return false;
  if(authority.kind==='team'&&/transcript|press conference/i.test(doc.title+' '+doc.section)){
    // A coach's declarative answer, not a reporter's question or player opinion.
    const at=doc.body.indexOf(text),prefix=doc.body.slice(0,at);
    const headers=[...prefix.matchAll(/(?:^|\n)\s*\*?\s*(HEAD COACH [A-Z][A-Z .'-]+|(?:QB|WR|RB|DL|K|PLAYER) [A-Z][A-Z .'-]+)\s*\*?\s*(?:\n|$)/g)];
    return /^HEAD COACH /.test(clean(headers.at(-1)?.[1]));
  }
  // Official hosts also carry commentary: require an explicit release/report
  // or a direct announcement, never just a league/club logo on a news page.
  return /official (?:release|injury report|lineup)|press release|transaction announcement/i.test(doc.section+' '+doc.title+' '+doc.authors.join(' '))||
    /\b(?:announced|confirmed|named)\b/i.test(text)&&!/(?:according to|reported by|sources? (?:said|say)|expects?)/i.test(text);
}
function independentOrigin(doc){
  const host=hostOf(doc.url),publisher=PUBLISHERS[host];
  if(!publisher||!doc.authors?.length||/associated press|reuters|wire service/i.test(doc.authors.join(' '))&&publisher!=='ap'&&publisher!=='reuters')return null;
  if(/according to|reported by|press conference|transcript|press release|citing|via (?:espn|ap|reuters)|syndicat/i.test(doc.body))return null;
  const outlet={disney:'ESPN',ap:'(?:AP|The Associated Press)',reuters:'Reuters',paramount:'CBS Sports',nbcuniversal:'NBC Sports'}[publisher];
  const match=doc.body.match(new RegExp(`([A-Z][a-z]+ [A-Z][a-z]+) (?:independently confirmed to|told) ${outlet}\\b`));
  if(!match)return null;
  return {publisher,origin:normalize(match[1]),attribution:normalize(match[0]),authors:doc.authors.map(normalize)};
}
function duplicateReporting(a,b){
  if(a.url===b.url||a.authors.some(x=>b.authors.map(normalize).includes(normalize(x))))return true;
  const tokens=s=>new Set(normalize(s).split(' ').filter(t=>t.length>3));
  const one=tokens(a.body),two=tokens(b.body),overlap=[...one].filter(w=>two.has(w)).length/Math.max(1,Math.min(one.size,two.size));
  const sharedLinks=(a.links||[]).filter(l=>(b.links||[]).includes(l)&&hostOf(l)&&/\/news\/|\/article\/|\/story\//.test(new URL(l).pathname));
  return overlap>=.8||sharedLinks.length>0;
}
function validDocument(doc,now){
  return !(doc?.version!==EVIDENCE_VERSION||!hostOf(doc.url)||typeof doc.title!=='string'||!doc.title||doc.title.length>260||typeof doc.body!=='string'||!doc.body||doc.body.length>SOURCE_LIMITS.body||
    !Array.isArray(doc.authors)||doc.authors.length>8||doc.authors.some(a=>typeof a!=='string'||a.length>120)||!Array.isArray(doc.links)||doc.links.length>80||doc.links.some(l=>typeof l!=='string'||l.length>2048)||typeof doc.section!=='string'||doc.section.length>120||!Number.isFinite(doc.published)||!Number.isFinite(doc.retrievedAt)||doc.published>doc.retrievedAt+60000||doc.retrievedAt>now+60000||now-doc.retrievedAt>SOURCE_LIMITS.historyDays*DAY);
}
export function evidenceClaims(doc,game,classify,now=Date.now(),slate=[game]){
  if(!validDocument(doc,now))return [];
  const start=gameStart(game),teams=gameTeams(game),id=gameId(game);
  if(!['upcoming','live'].includes(game.state)||game.timingUncertain||!LEAGUES[game.sport]||teams.length!==2||teams.some(t=>!t.id)||teams[0].id===teams[1].id||!id||!Number.isFinite(start)||start>now+7*DAY||now>=start+12*3600000||doc.published>=start)return [];
  const authority=sourceAuthority(doc.url,game),origin=independentOrigin(doc);
  if(!authority&&!origin)return [];
  const results=[];
  for(const text of clauses(doc)){
    if(text.length>260||SPECULATION.test(text)||/recap|game highlights/i.test(doc.title))continue;
    const starter=/\b(?:we'll be starting|will start|will be (?:the )?starting|named.{0,50}starter|starting lineups? confirmed)\b/i.test(text)&&/quarterback|\bQB\b|goalie|pitcher|starting lineup/i.test(text);
    const classified=classify({headline:text,description:''});
    const pair=teams.every((t,i)=>named(text,t,teams[1-i]));
    const season=Number(localDate(start).slice(0,4));
    const previousYear=Number(text.match(/\b(20\d{2})\b/)?.[1]);
    const historicRematch=authority&&pair&&previousYear===season-1&&/\b(?:beat|defeated|eliminated)\b/i.test(text)&&
      /\b(?:playoff|CFP|Super Bowl|World Series|NBA Finals|Stanley Cup Final|national championship)\b/i.test(text);
    const assessment=classified&&contextPolicy.qualitativeAssessment({...classified,text,verified:true});
    const qualified=classified?.type!=='confirmed_key_starters'&&assessment?.eligible&&assessment.polarity==='positive';
    let type=historicRematch?(/Super Bowl|World Series|NBA Finals|Stanley Cup Final|national championship/i.test(text)?'championship_rematch':'playoff_rematch'):starter&&!qualified?'confirmed_key_starters':classified?.type;
    if(!type)continue;
    if(type==='confirmed_key_starters'&&!(
      ['NFL','CFB'].includes(game.sport)&&/quarterback|\bQB\b/i.test(text)||
      game.sport==='NHL'&&/goalie|goaltender/i.test(text)||game.sport==='MLB'&&/pitcher|pitching/i.test(text)||
      ['NBA','NCAAB'].includes(game.sport)&&/starting lineup|starting (?:guard|center|forward)/i.test(text)))continue;
    const historical=Boolean(historicRematch)||type==='rivalry'&&pair&&/historic|long[- ]?(?:standing|time)|annual rivalry|rivalry.{0,40}since \d{4}|\d{2,3}(?:st|nd|rd|th) meeting/i.test(text);
    if(type==='rivalry'&&!historical)continue;
    const subjects=teams.filter(t=>named(text.split(/\b(?:against|vs\.?|versus)\b/i)[0],t));
    const owner=authority?.team||(historical?teams[0].id:subjects.length===1?subjects[0].id:null);
    if(authority?.team&&subjects.length===1&&subjects[0].id!==authority.team)continue;
    if(historical){if(!authority||!owner)continue;}
    else{
      if(now-doc.published>7*DAY||!dayBound(text,doc,game,slate)||!owner)continue;
      if(['rivalry_development','coach_return','former_star_return','former_captain_return','playoff_rematch','championship_rematch','meaningful_rematch'].includes(type)&&!pair)continue;
      if(/return/.test(type)&&!['star_injury_return','player_injury_return'].includes(type)&&!/first (?:time|return|meeting)|first game (?:back|against)/i.test(text))continue;
      if(/rematch/.test(type)){
        const year=Number(text.match(/\b(20\d{2})\b/)?.[1]),season=Number(localDate(start).slice(0,4));
        if(!year||season-year<1||season-year>(type==='meaningful_rematch'?2:1))continue;
      }
      if(type==='major_trade_storyline'&&(!/major trade|blockbuster|all[- ]star|superstar|\bMVP\b/i.test(text)||!/(?:will make|makes).{0,45}(?:team|club|[A-Z][a-z]+) debut|first game (?:with|for)/i.test(text)))continue;
      if(type==='notable_recent_performance'&&!/record[- ]breaking|milestone|historic streak|in (?:his|her|their )?(?:last|past) \d+ games/i.test(text))continue;
      if(['star_hot_streak','season_debut'].includes(type)&&!/\b(?:star|superstar|all[- ]star|all[- ]pro|all[- ]american|MVP|starting quarterback|leading scorer)\b/i.test(text))continue;
      if(type==='star_hot_streak'&&!/\d+/.test(text))continue;
      if(['elite_efficiency_profile','strength_of_schedule'].includes(type)&&!/top[- ]?\d+|No\.? \d+|rank(?:ed|s)? (?:first|second|third|\d+)|leads? (?:the )?(?:league|nation)|\d+(?:st|nd|rd|th)/i.test(text))continue;
      if(type==='rivalry_development'&&!/suspend|suspension|eject|league discipline/i.test(text))continue;
    }
    const subject=['team_win_streak','elite_efficiency_profile','strength_of_schedule','playoff_race','rivalry_development'].includes(type)?'team:'+owner:subjectFor(text,type);if(!subject)continue;
    if(type==='team_win_streak'&&!/\b(?:[3-9]|[1-9]\d+)[- ]game winning streak\b|won (?:[3-9]|[1-9]\d+) straight|(?:[3-9]|[1-9]\d+) straight wins/i.test(text))continue;
    if(type==='milestone_chase'&&!/needs? \d+|within \d+ of|one shy|\d+ away from/i.test(text))continue;
    if(type==='ace_pitching_matchup'&&(game.sport!=='MLB'||!pair))continue;
    const primary=historical||primaryConfirmation(doc,authority,text);
    if(!primary&&(!origin||!normalize(text).includes(origin.attribution)))continue;
    const expiresAt=Math.min(start+12*3600000,historical?doc.retrievedAt+SOURCE_LIMITS.historyDays*DAY:doc.published+7*DAY);
    results.push({type,subject,owner,gameKey:`${game.sport}:${id}`,pair:teams.map(t=>t.id).sort().join(':'),eventDate:localDate(start),
      start,text,source:doc,origin,kind:historical?'authoritative-history':primary?'authoritative-primary':'secondary-report',expiresAt,
      rationale:historical?'Authoritative historical record explicitly establishes this matchup fact; exact opponents and eligible season revalidated.':
        'Explicit confirmation of the named subject, matched to this team and game date; source statement and expiration revalidated.'});
  }
  return results;
}
function contradicted(claim,documents,game,now,slate){
  if(!['confirmed_key_starters','star_injury_return','star_absence'].includes(claim.type))return false;
  return documents.some(doc=>{
    if(!validDocument(doc,now)||doc.published<claim.source.published||doc.published>=claim.start||now-doc.published>7*DAY)return false;
    const authority=sourceAuthority(doc.url,game);
    if(!authority||authority.team&&authority.team!==claim.owner)return false;
    const owner=gameTeams(game).find(t=>t.id===claim.owner);
    return clauses(doc).some(text=>{
      if(text.length>260||!(` ${normalize(text)} `).includes(` ${claim.subject} `)||!dayBound(text,doc,game,slate)||
        !primaryConfirmation(doc,authority,text)||!authority.team&&!named(text,owner)||/could|might|may|reportedly|questionable|\?/i.test(text))return false;
      return claim.type==='star_absence'?/will start|will return|cleared to play/i.test(text):
        /will not start|won't start|not (?:the )?start(?:er|ing)|no longer.{0,25}start|ruled out|will miss|will not return|won't return/i.test(text);
    });
  });
}
export function verifiedEvidenceFactors(game,documents,classify,now=Date.now(),slate=[game]){
  const claims=documents.slice(0,SOURCE_LIMITS.documents).flatMap(d=>evidenceClaims(d,game,classify,now,slate)),accepted=new Map();
  for(const claim of claims){
    if(contradicted(claim,documents,game,now,slate))continue;
    let supporting=[claim.source],kind=claim.kind;
    if(kind==='secondary-report'){
      const other=claims.find(c=>c!==claim&&c.kind==='secondary-report'&&c.type===claim.type&&c.subject===claim.subject&&c.owner===claim.owner&&c.start===claim.start&&
        c.origin.publisher!==claim.origin.publisher&&c.origin.origin!==claim.origin.origin&&!duplicateReporting(c.source,claim.source));
      if(!other)continue;supporting.push(other.source);kind='independently-corroborated';
    }
    const factor={eventId:gameId(game),sport:game.sport,type:claim.type,text:claim.text,confidence:1,verified:true,scoringEligible:true,
      verification:kind,sourceTitle:claim.source.title,sourceUrl:claim.source.url,sourceDescription:claim.text,
      sourcePublished:Math.floor(claim.source.published/1000),publishedAt:new Date(claim.source.published).toISOString(),
      expiresAt:new Date(claim.expiresAt).toISOString(),evidence:{version:EVIDENCE_VERSION,kind,rationale:kind==='independently-corroborated'?'Two distinct publishers identify different named reporting sources for the same subject, team and game date; syndication and repeated originals excluded.':claim.rationale,subject:claim.subject,owner:claim.owner,
        eventId:gameId(game),startTime:new Date(gameStart(game)).toISOString(),teamIds:gameTeams(game).map(t=>t.id),documents:supporting}};
    const assessment=contextPolicy.qualitativeAssessment(factor);
    factor.scoringEligible=assessment.eligible;
    factor.scoringAssessment=assessment;
    factor.eventKey=[factor.sport,factor.eventId,claim.owner,claim.subject,claim.type].join(':');
    factor.sources=supporting.map(d=>({url:d.url,title:d.title,verification:kind}));
    if(!/\b(?:I|we|our|my)\b|["\u201c\u201d]/i.test(claim.text))factor.publicText=claim.text;
    if(claim.type==='confirmed_key_starters') {
      const sentence=claim.text.replace(/[\[\]]/g,'');
      const player=sentence.match(new RegExp('\\b'+reEscape(claim.subject).replace(/ /g,'\\s+')+'\\b','i'))?.[0];
      const team=gameTeams(game).find(t=>t.id===claim.owner);
      const role=sentence.match(/quarterback|goalie|goaltender|pitcher|starting (?:guard|center|forward)/i)?.[0];
      if(player && team && role) factor.publicText=`${team.name} will start ${player} at ${role.toLowerCase()}.`;
      // Optional injury context is informational only. It must be a direct
      // club report naming this starter and this game's date, never a question,
      // forecast, reporter's transcript prompt, or a roster-quality inference.
      for(const doc of documents) {
        if(!validDocument(doc,now) || sourceAuthority(doc.url,game)?.team!==claim.owner || /transcript|press conference/i.test(doc.title+' '+doc.section) || doc.published>=claim.start || now-doc.published>7*DAY) continue;
        const detail=clauses(doc).find(s=>normalize(s).includes(claim.subject) && dayBound(s,doc,game,slate) && !/\?|could|might|may |reportedly|according to/i.test(s) && /^([A-Z][a-zA-Z'-]+ [A-Z][a-zA-Z'-]+) and ([A-Z][a-zA-Z'-]+ [A-Z][a-zA-Z'-]+) are injured\b/.test(s));
        const injured=detail?.match(/^(.+?) and (.+?) are injured\b/);
        if(!injured || !player || !team || !role) continue;
        factor.publicText=`${team.name} turn to ${player} at ${role.toLowerCase()} following injuries to ${injured[1]} and ${injured[2]}.`;
        factor.contextEvidence={sourceUrl:doc.url,passage:detail,verification:'authoritative-primary'};
        factor.sources.push({url:doc.url,title:doc.title,verification:'authoritative-primary'});
        break;
      }
    }
    const prior=accepted.get(factor.eventKey);
    if(!prior) accepted.set(factor.eventKey,factor);
    else {
      const newer=factor.sourcePublished>prior.sourcePublished?factor:prior;
      newer.sources=[...new Map([...prior.sources,...factor.sources].map(s=>[s.url,s])).values()];
      newer.evidence={...newer.evidence,documents:[...new Map([...prior.evidence.documents,...factor.evidence.documents].map(d=>[d.url,d])).values()].sort((a,b)=>a.url.localeCompare(b.url))};
      accepted.set(factor.eventKey,newer);
    }
  }
  return [...accepted.values()].slice(0,4);
}
export function revalidateEvidence(factor,game,classify,now=Date.now(),slate=[game],currentDocuments=[]){
  const e=factor?.evidence;
  if(!Number.isFinite(gameStart(game))||e?.version!==EVIDENCE_VERSION||e.eventId!==gameId(game)||e.startTime!==new Date(gameStart(game)).toISOString()||
    JSON.stringify(e.teamIds)!==JSON.stringify(gameTeams(game).map(t=>t.id))||!Array.isArray(e.documents))return null;
  const documents=new Map(e.documents.map(d=>[d.url,d]));
  for(const doc of currentDocuments){
    const prior=documents.get(doc.url);
    if(!prior||doc.retrievedAt>prior.retrievedAt&&(doc.body!==prior.body||doc.published!==prior.published||doc.title!==prior.title))documents.set(doc.url,doc);
  }
  const checked=verifiedEvidenceFactors(game,[...documents.values()].slice(0,SOURCE_LIMITS.documents),classify,now,slate);
  return checked.find(f=>(f.type===factor.type||factor.type==='star_injury_return'&&f.type==='player_injury_return')&&f.text===factor.text&&f.sourceUrl===factor.sourceUrl&&f.verification===factor.verification&&f.expiresAt===factor.expiresAt&&
    JSON.stringify(f.evidence)===JSON.stringify(e))||null;
}

// One personnel development cannot earn both its specific bonus and a generic
// starter/return bonus. Newer contradictory availability replaces older proof;
// equal-time contradictions fail closed. Scoring weights and caps remain in the
// existing scorer, after this evidence-level de-duplication.
export function distinctEvidenceFactors(factors){
  const personnel=new Set(['star_absence','star_injury_return','player_injury_return','confirmed_key_starters','major_trade_storyline','former_star_return','former_captain_return','coach_return','season_debut']);
  const accepted=[],groups=new Map();
  for(const f of factors){
    if(!f.evidence?.subject||!personnel.has(f.type)){accepted.push(f);continue;}
    const key=[f.sport,f.eventId,f.evidence.owner,f.evidence.subject].join(':');
    const group=groups.get(key)||[];group.push(f);groups.set(key,group);
  }
  for(const group of groups.values()){
    group.sort((a,b)=>b.sourcePublished-a.sourcePublished||Number(a.type==='confirmed_key_starters')-Number(b.type==='confirmed_key_starters')||a.type.localeCompare(b.type));
    const latest=group.filter(f=>f.sourcePublished===group[0].sourcePublished);
    if(latest.some(f=>f.type==='star_absence')&&latest.some(f=>['star_injury_return','confirmed_key_starters'].includes(f.type)))continue;
    const selected=group[0],sources=[...new Map(group.flatMap(f=>f.sources||[]).map(s=>[s.url,s])).values()];
    accepted.push(sources.length?{...selected,sources}:selected);
  }
  return accepted;
}
