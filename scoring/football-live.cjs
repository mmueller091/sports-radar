// Production football context. Pure, shared by the browser bundle and Worker.
// The legacy scorer stays frozen for historical captures and comparisons.
const {footballPregameSpread,numberFromLine}=require('./shared/market.js');
const {rankFor}=require('./shared/records.js');
const {eventPosition}=require('./shared/time.js');
const {eligibility}=require('./football-market.cjs');
const unit=x=>Math.max(0,Math.min(1,Number(x)||0));
const smooth=x=>{x=unit(x);return x*x*(3-2*x);};
const id=t=>String(t?.team?.id || t?.id || '');
const numeric=x=>x==null || x==='' || typeof x==='boolean' ? null : numberFromLine(x);
const priceProbability=x=>x>0 ? 100/(100+x) : x<0 ? -x/(100-x) : null;

function pregameMarket(game,competition,raw=competition?.odds?.[0]) {
  const teams=competition?.competitors || [];
  if (teams.length!==2 || !raw) return null;
  const odds=raw.close || raw.closing || raw;
  // Live odds and old seasonal lines cannot establish pregame expectations.
  if (raw.live===true || raw.isLive===true || /live|in.?play/i.test(String(raw.type || odds.type || ''))) return null;
  const start=Date.parse(game.startTime || game.sourceEvent?.date || '');
  const at=Date.parse(odds.lastUpdated || odds.lastModified || raw.lastUpdated || '');
  if (game.state==='upcoming') {
    if(!eligibility(raw,game,game.marketAsOf).eligible)return null;
  } else if (Number.isFinite(start) && Number.isFinite(at) && (at>start || start-at>48*3600000)) return null;
  const spread=footballPregameSpread({odds:[raw]});
  const sides=teams.map(t=>{
    const side=t.homeAway, data=odds[`${side}TeamOdds`] || {};
    const line=numeric(odds.pointSpread?.[side]?.close?.line ?? odds.pointSpread?.[side]?.open?.line);
    const money=numeric(odds.moneyline?.[side]?.close?.odds ?? odds.moneyline?.[side]?.open?.odds ?? data.moneyLine ?? data.moneyline);
    return {team:t,line,money,dog:data.underdog===true || data.favorite===false};
  });
  let dog=sides.find(s=>s.line>0) || sides.find(s=>s.dog);
  if (!dog) {
    const named=String(odds.details || '').match(/^(.+?)\s+([+-])\d/);
    const favorite=named?.[2]==='-' && sides.find(s=>[s.team.team?.abbreviation,s.team.team?.displayName,s.team.team?.shortDisplayName].includes(named[1]));
    if (favorite) dog=sides.find(s=>s!==favorite);
  }
  if (!dog) dog=sides.find(s=>s.money>100 && sides.some(o=>o!==s && o.money<0));
  if (!dog || !id(dog.team)) return null;
  const probabilities=sides.map(s=>priceProbability(s.money));
  const probability=probabilities.every(p=>p!==null) ? probabilities[sides.indexOf(dog)]/probabilities.reduce((a,b)=>a+b,0) : null;
  const value=dog.line>0 ? dog.line : spread;
  if (!(value>0) && !(probability!==null && probability<.5)) return null;
  return {teamId:id(dog.team),teamName:dog.team.team?.displayName || 'The underdog',side:dog.team.homeAway,
    spread:value,probability,source:'pregame market',reportedAt:Number.isFinite(at)?at:null};
}

function rankedExpectation(game,competition) {
  if (game.sport!=='CFB') return null;
  const teams=competition?.competitors || [];
  if (teams.length!==2) return null;
  const ranks=teams.map(t=>rankFor(t,'CFB'));
  const favorite=ranks[0] && (!ranks[1] || ranks[0]<ranks[1]) ? 0 : ranks[1] && (!ranks[0] || ranks[1]<ranks[0]) ? 1 : -1;
  if (favorite<0) return null;
  const dog=teams[1-favorite];
  return {teamId:id(dog),teamName:dog.team?.displayName || 'The unranked opponent',side:dog.homeAway,
    spread:null,probability:null,rankStrength:(26-ranks[favorite])/25*unit(((ranks[1-favorite]||35)-ranks[favorite])/25),source:'rankings'};
}

function liveSurprise(core,game,competition,summary,historySummary=summary) {
  const market=game.livePregameMarket || pregameMarket(game,competition) || rankedExpectation(game,competition);
  const zero={points:0,text:'',market,rawPoints:0,overlap:0};
  if (!market || game.state!=='live') return zero;
  const dog=game.teams.find(t=>String(t[8])===market.teamId),other=game.teams.find(t=>t!==dog);
  if (!dog || !other || [dog[2],other[2]].some(x=>x==null || x==='' || !Number.isFinite(Number(x)))) return zero;
  const margin=Number(dog[2])-Number(other[2]);
  const p=unit(core.gameProgress(game.sport,competition));
  const spreadStrength=market.spread==null ? 0 : 1-Math.exp(-Math.pow(market.spread/(game.sport==='CFB'?18:9),1.7));
  const probabilityStrength=market.probability==null ? 0 : smooth((.5-market.probability)/.45);
  const strength=Math.max(spreadStrength,probabilityStrength,.55*(market.rankStrength||0));
  // Expected score differential grows with elapsed regulation. Merely covering
  // earns no signal: actual lead/tie threat and sport runway are required.
  const reversal=1-Math.exp(-(Math.max(0,margin)+(market.spread||0)*p)/14);
  const threat=margin>0 ? .35+.65*(1-Math.exp(-margin/7)) :
    smooth((p-.5)/.4)*Math.exp(-Math.pow(Math.abs(margin)/7,1.6))*.65;
  const viability=margin<0 ? core.footballLiveCloseness(game.sport,-margin,p,competition).comebackFeasibility : 1;
  // Deterministic sustained evidence comes from a validated ledger, never the
  // number of polls. Reject future, duplicate, regressing or mismatched scores.
  let sustained=0;
  const moments=(summary?.scoringPlays || []).map(play=>({play,pos:eventPosition(game.sport,{status:{period:play.period?.number,displayClock:play.clock?.displayValue}})}));
  let valid=moments.length>0,prior={home:0,away:0,pos:0},leadSince=null;
  for (const {play,pos} of moments) {
    const home=numeric(play.homeScore),away=numeric(play.awayScore);
    if (home===null || away===null || pos===null || pos>p+1e-8 || pos<prior.pos || home<prior.home || away<prior.away || (home>prior.home && away>prior.away) || (home===prior.home && away===prior.away)) {valid=false;break;}
    const leading=market.side==='home' ? home>away : away>home;
    leadSince=leading ? leadSince??pos : null;
    prior={home,away,pos};
  }
  const scores=Object.fromEntries((competition?.competitors||[]).map(t=>[t.homeAway,Number(t.score)]));
  if (valid && prior.home===scores.home && prior.away===scores.away && leadSince!==null) sustained=unit((p-leadSince)/.25);
  const wp=core.winProbabilityImpact(summary,p,'live',game.sport);
  const current=wp.probability==null ? null : market.side==='home'?wp.probability:1-wp.probability;
  const probabilityGain=current===null || market.probability==null ? 0 : unit((current-market.probability)/.65);
  const cap=game.sport==='CFB'?30:22;
  const rawPoints=cap*strength*threat*viability*(.2+.8*smooth(p/.8))*(.7+.3*reversal)*
    (1+.08*sustained+.05*probabilityGain);
  const history=core.momentumImpact(game.sport,historySummary,p,'live');
  const correlated=(history.factors||[]).filter(f=>/comeback|erased.*deficit|lead change|unanswered|win.chance|win.probability/i.test(f.label))
    .reduce((sum,f)=>sum+Math.max(0,f.points),0);
  const overlap=Math.min(.35*rawPoints,.22*correlated);
  const points=Math.round(Math.min(cap,Math.max(0,rawPoints-overlap)));
  const description=market.spread ? `${market.spread}-point underdog` : market.probability!=null ? 'pregame moneyline underdog' : 'lower-ranked opponent';
  return {points,rawPoints,overlap,market,margin,progress:p,sustained,probabilityGain,
    text:points ? `${market.teamName}, a ${description}, ${margin>0?'leads':margin===0?'is tied':'remains within one score'} ${dog[2]}–${other[2]}` : ''};
}

const uncertain=/\b(?:may|might|could|questionable|doubtful|possible|possibly|reportedly|appears?|suspected|not ruled out|not injured|expected to|will return|set to return)\b/i;
function confirmedDevelopment(text) {
  if (!text || uncertain.test(text)) return null;
  const quarterback=/\bquarterback\b|\bQB\b/i.test(text);
  const major=quarterback || /\bstar\b|all.pro|all.american|leading (?:rusher|receiver)|head coach|Heisman|MVP/i.test(text);
  if (!major) return null;
  const returned=/\b(?:returns? to (?:the )?(?:game|field|lineup)|returns? after|back in (?:the )?game|has returned)\b/i.test(text);
  const out=/\b(?:ruled out|will not return|won't return|ejected|suspended)\b/i.test(text);
  const injured=/\b(?:injured|injury|fractured|torn|concussion)\b/i.test(text) && /\b(?:leaves?|left|exits?|exited|suffers?|suffered|sustains?|sustained|injured|replaced)\b/i.test(text);
  const replacement=/\b(?:replaced by|replaces|takes over for)\b/i.test(text);
  const coaching=/head coach/i.test(text) && /\b(?:fired|dismissed|takes over|replaced by)\b/i.test(text);
  if (!returned && !out && !injured && !replacement && !coaching) return null;
  return {kind:returned?'return':/ejected/i.test(text)?'ejection':/suspended/i.test(text)?'suspension':coaching?'coaching':'injury',
    status:returned?'returned':out?'out':replacement?'replaced':'left',quarterback,text};
}

function mergeDevelopments(game,summary,previous=null) {
  if (!['NFL','CFB'].includes(game.sport) || game.state==='upcoming') return [];
  const same=previous && previous.sport===game.sport && String(previous.id)===String(game.id);
  const retained=[...(game.verifiedDevelopments||[]),...(same?previous.verifiedDevelopments||[]:[])];
  const map=new Map();
  const keep=item=>{
    if (item?.verified!==true || item.eventId!==String(game.id) || !confirmedDevelopment(item.evidenceText || item.text) || !Number.isFinite(item.position)) return;
    const old=map.get(item.subjectKey);
    if (!old || item.position>old.position || item.position===old.position && item.reportedAt>old.reportedAt) map.set(item.subjectKey,item);
  };
  retained.forEach(keep);
  const start=Date.parse(game.startTime || game.sourceEvent?.date || '');
  const p=eventPosition(game.sport,{status:game.liveRawStatus || game.sourceCompetition?.status});
  const articles=summary?.news?.articles || [];
  for (const article of articles) {
    const text=String(article.headline || '').trim();
    const evidenceText=[text,String(article.description||'').trim()].filter(Boolean).join('. ');
    const evidence=confirmedDevelopment(evidenceText);
    const reportedAt=Date.parse(article.published || '');
    if (!evidence || !Number.isFinite(start) || !Number.isFinite(reportedAt) || reportedAt<start || reportedAt>start+8*3600000 || p===null) continue;
    const categories=article.categories || [];
    const eventMatch=categories.some(c=>c.type==='event' && String(c.eventId || c.event?.id)===String(game.id));
    const matchedTeams=game.teams.filter(t=>categories.some(c=>c.type==='team' && String(c.teamId || c.team?.id)===String(t[8])));
    // Team-tagged league news must explicitly describe action in this game.
    const opponentNamed=game.teams.some(t=>!matchedTeams.includes(t) && [t[0],t[7]].filter(Boolean).some(n=>evidenceText.toLowerCase().includes(n.toLowerCase())));
    if (!eventMatch && !(matchedTeams.length===1 && opponentNamed)) continue;
    const url=article.links?.web?.href || '';
    try {if (!/(^|\.)espn\.com$/i.test(new URL(url).hostname)) continue;} catch {continue;}
    const team=matchedTeams.length===1?matchedTeams[0]:game.teams.find(t=>text.includes(t[0]));
    // Explicit named subject is required; this also deduplicates later headlines
    // about the same player while allowing independent player developments.
    const name=text.match(/\b([A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+)(?=\s+(?:is |has |was |out\b|returns|leaves|left|exits|exited|suffers|suffered|sustains|injured|ruled|ejected|suspended|fired|dismissed|takes over|replaced|back))/)?.[1];
    if (!name) continue;
    const subjectKey=name.toLowerCase();
    // Publication time, rather than arrival order, orders delayed news. The
    // game position is only a decay clock and cannot revive old evidence.
    const old=map.get(subjectKey);
    if (old && reportedAt<=old.reportedAt) continue;
    const position=old?.kind===evidence.kind && old.status===evidence.status ? old.position : p;
    keep({...evidence,text,evidenceText,verified:true,eventId:String(game.id),subjectKey,subject:name,teamId:String(team?.[8]||''),position,reportedAt,sourceUrl:url,sourceTitle:text});
  }
  // Explicit play-by-play injury/replacement records are already tied to this
  // event. A roster identifies a QB; it never supplies an inferred injury.
  const rosterMap=new Map();
  for (const t of summary?.boxscore?.players||[]) for (const s of t.statistics||[]) for (const a of s.athletes||[]) {
    const key=a.athlete?.id || a.athlete?.displayName;
    rosterMap.set(key,{athlete:a.athlete,teamId:id(t),passing:s.name==='passing' || rosterMap.get(key)?.passing===true});
  }
  const roster=[...rosterMap.values()];
  const alias=r=>[r.athlete?.displayName,r.athlete?.shortName,
    r.athlete?.firstName && r.athlete?.lastName ? `${r.athlete.firstName[0]}.${r.athlete.lastName}` : ''].filter(Boolean);
  const named=(r,text)=>alias(r).some(name=>text.includes(name));
  const plays=[...new Map([...(summary?.plays||[]),...(summary?.drives?.previous||[]).flatMap(d=>d.plays||[]),...(summary?.drives?.current?.plays||[])].map(play=>[String(play.id||JSON.stringify(play)),play])).values()];
  const positionOf=play=>eventPosition(game.sport,{status:{period:play.period?.number,displayClock:play.clock?.displayValue}});
  for (const play of plays) {
    const text=String(play.text||'').trim();
    const player=roster.find(r=>named(r,text) && (/^(?:QB|quarterback)$/i.test(r.athlete.position?.abbreviation || r.athlete.position?.name || '') || map.get(r.athlete?.displayName?.toLowerCase())?.quarterback));
    const evidenceText=player ? `Quarterback ${text}` : text;
    const evidence=confirmedDevelopment(evidenceText);
    const position=positionOf(play);
    if (!evidence || position===null || p===null || position>p+1e-8) continue;
    const name=player?.athlete.displayName || text.match(/\b([A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+)(?=\s+(?:is |has |was |returns|leaves|left|exits|injured|ruled|ejected|replaced|back))/)?.[1];
    if (!name) continue;
    const teamId=player?.teamId || String(play.team?.id||'');
    const subjectKey=name.toLowerCase();
    const old=map.get(subjectKey);
    if (old?.status==='out' && evidence.kind==='injury' && position<old.position && /injured/i.test(text)) {
      // A late article can be anchored to the provider's explicit injury play.
      map.set(subjectKey,{...old,position,sourcePlayId:String(play.id||'')});
      continue;
    }
    if (old && old.position>=position) continue;
    const firstPosition=old?.kind===evidence.kind && old.status===evidence.status ? old.position : position;
    keep({...evidence,text,evidenceText,verified:true,eventId:String(game.id),subjectKey,subject:name,teamId,position:firstPosition,
      reportedAt:0,sourcePlayId:String(play.id||''),sourceUrl:`https://www.espn.com/${game.sport==='NFL'?'nfl':'college-football'}/playbyplay/_/gameId/${encodeURIComponent(game.id)}`,sourceTitle:'ESPN play-by-play'});
  }
  for (const [key,development] of map) if (development.quarterback && development.status==='out' && development.sourcePlayId) {
    const passers=roster.filter(r=>r.passing && r.teamId===development.teamId && r.athlete?.displayName!==development.subject);
    const observed=plays.map(play=>({play,position:positionOf(play)})).filter(x=>x.position!==null && x.position>development.position && x.position<=p && /\bpass(?:es|ed)?\b/i.test(x.play.text||''));
    const passing=(r,text)=>alias(r).some(name=>new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s+pass(?:\\s|es\\b|ed\\b)').test(text));
    const latest=observed.sort((a,b)=>b.position-a.position).map(x=>({x,player:passers.find(r=>passing(r,x.play.text||''))})).find(x=>x.player);
    if (latest) map.set(key,{...development,replacementName:latest.player.athlete.displayName,replacementPlayId:String(latest.x.play.id||'')});
  }
  return [...map.values()].sort((a,b)=>b.position-a.position || b.reportedAt-a.reportedAt || a.subjectKey.localeCompare(b.subjectKey)).slice(0,8);
}

function developmentImpact(game,progress,gap) {
  const active=(game.verifiedDevelopments||[]).filter(d=>d.verified && d.eventId===String(game.id) && d.position<=progress+1e-8);
  const weight=active.reduce((sum,d)=>sum+(d.quarterback?4:2)*Math.exp(-Math.max(0,progress-d.position)/.35),0);
  // Context is neutral about injury direction. Its modest relevance depends on
  // actual competitiveness; it cannot rescue an uncompetitive game.
  return {points:Math.round(Math.min(5,weight)*Math.exp(-Math.pow(gap/17,2))),active};
}

function footballLiveExplanation(game) {
  if (!['NFL','CFB'].includes(game.sport) || game.state!=='live' || game.teams?.length!==2) return '';
  const [a,b]=game.teams,scores=game.teams.map(t=>Number(t[2]));
  if (!scores.every(Number.isFinite)) return '';
  const gap=Math.abs(scores[0]-scores[1]),leader=scores[0]>scores[1]?a:b;
  const plural=name=>/s$|men$|Sox$/i.test(String(name));
  const clock=String(game.liveRawStatus?.displayClock||'');
  const period=Number(game.liveRawStatus?.period);
  const phase=clock && period>=1 && period<=4 ? ` with ${clock} left in the ${['','first','second','third','fourth'][period]} quarter` :
    game.live?.phase && game.live.phase!=='Live' ? ` (${game.live.phase})` : '';
  const sentences=[gap===0 ? `${a[0]} and ${b[0]} are tied ${scores[0]}–${scores[1]}${phase}.` : `${leader[0]} ${plural(leader[0])?'lead':'leads'} ${Math.max(...scores)}–${Math.min(...scores)}${phase}.`];
  const developments=(game.verifiedDevelopments||[]).filter(d=>d.verified && d.eventId===String(game.id));
  if (developments.length) {
    const development=developments[0];
    sentences.push(development.text.replace(`${development.subject} out for game`,`${development.subject} is out for the game`).replace(/[.!?]+$/,'')+'.');
    if (developments[0].replacementName) sentences.push(`${developments[0].replacementName} has thrown passes since ${developments[0].subject}'s departure.`);
  }
  if (game.liveSurprise?.points>=2) {
    const s=game.liveSurprise,m=s.market;
    const expectation=m.spread ? `entering as a ${m.spread}-point underdog` : m.source==='rankings'?'facing a higher-ranked opponent':'entering as the moneyline underdog';
    const verb=plural(m.teamName)?'are':'is';
    sentences.push(`${m.teamName} ${verb} ${s.margin>0?'threatening an upset':s.margin===0?'level':'still within reach'} despite ${expectation}.`);
  } else {
    const factors=game.historyOwnership?.eventFactors || game.factors || [];
    const comeback=factors.find(f=>/comeback|erased.*deficit/i.test(f.label) && f.points>0);
    const leadChanges=factors.find(f=>/lead change/i.test(f.label) && f.points>0);
    const situation=game.footballSituation;
    const holder=game.teams.find(t=>String(t[8])===situation?.possessionTeamId);
    if (gap>8 && period>=4) {
      sentences.push(`${game.teams.find(t=>t!==leader)[0]} needs more than one scoring possession to draw level${holder?`; ${holder[0]} has the ball${situation.downAndDistance?', '+situation.downAndDistance:''}`:''}.`);
    } else if (comeback) {
      const detail=String(game.momentumText||'').split(', ').find(t=>/erased a deficit/i.test(t));
      sentences.push(detail ? detail.replace(/^./,c=>c.toUpperCase()).replace(/[.!?]+$/,'')+'.' : 'A large deficit has been erased to bring the game back within reach.');
    } else if (leadChanges) {
      const count=leadChanges.label.match(/^(\d+) lead change/);
      sentences.push(count ? `The lead has changed ${count[1]} ${count[1]==='1'?'time':'times'}.` : 'A recent lead change has shifted control.');
    }
    else if (holder && situation.downAndDistance) sentences.push(`${holder[0]} has possession, ${situation.downAndDistance}${situation.fieldPosition?` at ${situation.fieldPosition}`:''}.`);
    else if (gap<=8) {
      const stakes=(game.openingFactors||[]).find(f=>/^(?:AFC|NFC) .* matchup$|rivalry|conference championship|postseason/i.test(f.label));
      if (stakes) sentences.push(`${stakes.label.replace(/ matchup$/,'')} stakes add to this ${gap===0?'tied':`${gap}-point`} game.`);
    }
  }
  return sentences.slice(0,3).join(' ');
}

module.exports={pregameMarket,liveSurprise,confirmedDevelopment,mergeDevelopments,developmentImpact,footballLiveExplanation};
