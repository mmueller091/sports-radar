// Canonical provider event identity and observation boundaries. No rating weights.
const {normalizedTime}=require('./shared/time.js');
const {hockeyElapsed,hockeyPlayClockMode,hockeyOvertime}=require('./sports/nhl.js');
const stable=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
 ? Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
const numeric=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
function revisionTime(play){
 for(const key of ['modified','lastModified','modifiedAt','updatedAt','revisionTimestamp']){
  const value=play?.[key],at=typeof value==='number'?value:Date.parse(value||'');if(Number.isFinite(at))return at;
 }
 return null;
}
function eventTime(sport,play,summary={}){
 const period=Number(play?.period?.number??play?.period?.value??play?.period??0);
 if(!period)return null;
 const status={period,displayClock:play.clock?.displayValue??play.displayClock,clock:play.clock?.value??play.clockValue,
  type:{detail:sport==='MLB'?`${play.period?.type||play.inningHalf||''} ${play.period?.displayValue||''}`:play.period?.displayValue||play.inningHalf||''}};
 if(sport==='NHL')return hockeyElapsed({...status,clockMode:summary.sportsRadarEvidence?.clockMode||hockeyPlayClockMode(summary)},hockeyOvertime(null,summary.header?.competitions?.[0],summary).postseason);
 return normalizedTime(sport,{status}).elapsedSeconds;
}
function eventKey(play,index=null){
 if(play.id!=null&&String(play.id)!=='')return `id:${play.id}`;
 // sequenceNumber is not a globally stable identity (MLB restarts it within
 // plate appearances). Without an ID, use the complete event fingerprint.
 // A full payload fingerprint only merges exact idless retransmissions. Similar
 // events with different participants, scores or timestamps remain distinct.
 return `payload:${stable(play)}`;
}
function mergeCompatible(a,b){
 const merged={...a};
 for(const [key,value]of Object.entries(b)){
  if(value==null)continue;
  if(merged[key]==null){merged[key]=value;continue;}
  if(stable(merged[key])===stable(value))continue;
  if(typeof value==='object'&&!Array.isArray(value)&&typeof merged[key]==='object'&&!Array.isArray(merged[key])){
   const nested=mergeCompatible(merged[key],value);if(!nested)return null;merged[key]=nested;
  }else return null;
 }
 return merged;
}
function normalizeEvents(sport,events,summary={}){
 const groups=new Map();let duplicates=0,conflicts=0,index=0;
 for(const play of events||[]){if(!play||typeof play!=='object')continue;const key=eventKey(play,index++);if(groups.has(key))duplicates++;else groups.set(key,[]);groups.get(key).push(play);}
 const canonical=[],originalOrder=new Map();
 for(const records of groups.values()){
  const allVersioned=records.every(p=>revisionTime(p)!==null);
  const newest=allVersioned?Math.max(...records.map(revisionTime)):null;
  const candidates=allVersioned?records.filter(p=>revisionTime(p)===newest):records;
  let selected=candidates[0],conflict=false;
  for(const candidate of candidates.slice(1)){
   const old=revisionTime(selected),next=revisionTime(candidate);
   if(old!==null&&next!==null&&old!==next){if(next>old)selected=candidate;continue;}
   const merged=mergeCompatible(selected,candidate);
   if(merged)selected=merged;else conflict=true;
  }
  // Conflicting copies without an ordered revision are unknown, not two plays.
  if(conflict){conflicts++;continue;}originalOrder.set(selected,canonical.length);canonical.push(selected);
 }
 canonical.sort((a,b)=>{
  const at=eventTime(sport,a,summary),bt=eventTime(sport,b,summary);
  if(at!==null&&bt!==null&&at!==bt)return at-bt;
  if(['NBA','NCAAB'].includes(sport)){
   // Preserve the existing basketball reconciler's tie ordering. Finalized
   // sequence IDs can be nonmonotonic after a review; do not move a turnover
   // across same-clock records that have explicit earlier/later event times.
   const aw=Date.parse(a.wallclock||''),bw=Date.parse(b.wallclock||'');
   if(Number.isFinite(aw)&&Number.isFinite(bw)&&aw!==bw)return aw-bw;
  }
  // MLB sequenceNumber restarts within plate appearances. Its fixed-width
  // numeric event IDs order pitch/result rows inside the same inning half.
  if(sport==='MLB'&&/^\d+$/.test(String(a.id))&&/^\d+$/.test(String(b.id)))return String(a.id).localeCompare(String(b.id),undefined,{numeric:true});
  if(numeric(a.sequenceNumber)&&numeric(b.sequenceNumber)&&Number(a.sequenceNumber)!==Number(b.sequenceNumber))return Number(a.sequenceNumber)-Number(b.sequenceNumber);
  if(at===null||bt===null)return originalOrder.get(a)-originalOrder.get(b);
  if(numeric(a.homeScore)&&numeric(a.awayScore)&&numeric(b.homeScore)&&numeric(b.awayScore)){
   const delta=Number(a.homeScore)+Number(a.awayScore)-Number(b.homeScore)-Number(b.awayScore);if(delta)return delta;
  }
  return eventKey(a).localeCompare(eventKey(b),undefined,{numeric:true});
 });
 return {events:canonical,duplicates,conflicts};
}
function sequence(play,game){const id=String(play?.id||'');return /^\d+$/.test(id)&&id.startsWith(String(game.id))?id.slice(String(game.id).length).replace(/^0+/,'')||'0':null;}
const compareSequence=(a,b)=>a.length-b.length||a.localeCompare(b);
function normalizeSummary(game,c,summary){
 if(!summary)return summary;
 const info={...summary.sportsRadarEvidence,duplicatesRemoved:summary.sportsRadarEvidence?.duplicatesRemoved||0,
  conflictingEvents:summary.sportsRadarEvidence?.conflictingEvents||0,futureEventsExcluded:summary.sportsRadarEvidence?.futureEventsExcluded||0};
 if(game.sport==='NHL')info.clockMode ||= hockeyPlayClockMode(summary);
 const context={...summary,sportsRadarEvidence:info},result={...summary};
 const identity=`${game.sport}:${game.id}:${(game.teams||[]).map(t=>String(t[8])).sort().join(',')}`;
 const retained=game.state==='live'&&game.providerEventRevisions?.identity===identity?game.providerEventRevisions:null;
 const revisions=new Map((retained?.events||[]).map(p=>[String(p.id),p]));
 const currentRevision=p=>{
  const known=p.id!=null&&revisions.get(String(p.id));if(!known)return p;
  const at=revisionTime(p),before=revisionTime(known);
  if(before!==null&&(at===null||at<before)){info.staleEventRevisionsIgnored=(info.staleEventRevisionsIgnored||0)+1;return {...p,...known};}
  return p;
 };
 // Scoring-play captions and PBP descriptions may legitimately differ for the
 // same event. Compare common factual fields across containers; ordered provider
 // revisions replace every representation, unresolved factual conflicts remove
 // the identity from every consumer.
 const rawContainers=[summary.plays||[],summary.scoringPlays||[],...(summary.drives?.previous||[]).map(d=>d.plays||[]),summary.drives?.current?.plays||[]].map(list=>list.map(currentRevision));
 const byId=new Map();
 for(const list of rawContainers)for(const p of list)if(p.id!=null){const id=String(p.id);if(!byId.has(id))byId.set(id,[]);byId.get(id).push(p);}
 const replacements=new Map(),conflictingIds=new Set();
 const factual=p=>({homeScore:p.homeScore,awayScore:p.awayScore,period:p.period?.number??p.period,clock:p.clock?.displayValue,
  type:p.type?.id,scoringPlay:p.scoringPlay,team:p.team?.id});
 for(const [id,records]of byId){
  if(records.length<2)continue;
  const times=records.map(revisionTime),ordered=times.every(t=>t!==null)&&new Set(times).size>1;
  if(ordered){const newest=Math.max(...times),latest=records.filter(p=>revisionTime(p)===newest);let selected=latest[0];
   for(const p of latest.slice(1)){if(!mergeCompatible(factual(selected),factual(p)))conflictingIds.add(id);else selected={...selected,...p};}
   if(!conflictingIds.has(id))replacements.set(id,selected);continue;
  }
  let facts=factual(records[0]);for(const p of records.slice(1)){const merged=mergeCompatible(facts,factual(p));if(!merged){conflictingIds.add(id);break;}facts=merged;}
 }
 info.conflictingEvents+=conflictingIds.size;
 const header=summary.header?.competitions?.[0];
 const currentTime=game.sport==='NHL'?hockeyElapsed(c?.status,hockeyOvertime(game.sourceEvent,c,summary).postseason):normalizedTime(game.sport,c).elapsedSeconds;
 const headerTime=game.sport==='NHL'?hockeyElapsed(header?.status,hockeyOvertime(game.sourceEvent,header,summary).postseason):normalizedTime(game.sport,header).elapsedSeconds;
 const live=game.state==='live';
 const compatible=header&&(c.competitors||[]).length===2&&(header.competitors||[]).length===2&&c.competitors.every(t=>{
  const match=header.competitors.find(x=>String(x.team?.id||x.athlete?.id||x.id)===String(t.team?.id||t.athlete?.id||t.id));
  return match&&String(match.score)===String(t.score);
 });
 const ahead=live&&(Number(header?.status?.period)>Number(c.status?.period)||headerTime!==null&&currentTime!==null&&headerTime>currentTime);
 const last=c.situation?.lastPlay,lastSequence=sequence(last,game);
 const isFuture=play=>{
  if(!live)return false;
  const at=eventTime(game.sport,play,context),period=Number(play.period?.number??play.period??0);
  if(period>Number(c.status?.period)||at!==null&&currentTime!==null&&at>currentTime)return true;
  const seq=sequence(play,game);
  if(['NFL','CFB','MLB'].includes(game.sport)&&seq!==null&&lastSequence!==null&&
   period===Number(c.status?.period)&&(at===currentTime||game.sport==='MLB')&&compareSequence(seq,lastSequence)>0)return true;
  return Boolean(ahead&&at===null);
 };
 const filter=events=>{
  const coherent=(events||[]).map(currentRevision).filter(p=>!conflictingIds.has(String(p.id))).map(p=>replacements.has(String(p.id))?{...p,...replacements.get(String(p.id))}:p);
  const normalized=normalizeEvents(game.sport,coherent,context);info.duplicatesRemoved+=normalized.duplicates;info.conflictingEvents+=normalized.conflicts;
  return normalized.events.filter(play=>{if(!isFuture(play))return true;info.futureEventsExcluded++;return false;});
 };
 if(Array.isArray(summary.plays))result.plays=filter(summary.plays);
 if(Array.isArray(summary.scoringPlays))result.scoringPlays=filter(summary.scoringPlays);
 if(summary.drives){
  const drive=d=>{if(!d)return d;const plays=filter(d.plays||[]);if(!plays.length)return null;
   // A drive result/end can describe an excluded future play. Keep observed
   // plays but never carry an ahead aggregate endpoint into this checkpoint.
   return ahead||(d.plays||[]).some(isFuture)||isFuture(d.end||{})?{id:d.id,team:d.team,plays}:{...d,plays};};
  const previous=(summary.drives.previous||[]).map(drive).filter(Boolean);
  result.drives={previous:[...new Map(previous.map(d=>[String(d.id??stable(d)),d])).values()],current:drive(summary.drives.current)};
 }
 const sourcePlays=[...(result.plays||[]),...(result.scoringPlays||[]),...(result.drives?.previous||[]).flatMap(d=>d.plays||[]),...(result.drives?.current?.plays||[])];
 if(game.state==='live'){
  for(const p of sourcePlays){if(p.id==null||revisionTime(p)===null)continue;const old=revisions.get(String(p.id));if(!old||revisionTime(p)>=revisionTime(old))revisions.set(String(p.id),p);}
  const keys=['id','sequenceNumber','period','clock','homeScore','awayScore','text','shortText','type','scoringPlay','scoreValue','statYardage','team','start','end','modified','lastModified','modifiedAt','updatedAt','revisionTimestamp'];
  const events=[...revisions.values()].sort((a,b)=>revisionTime(b)-revisionTime(a)).slice(0,1024)
   .map(p=>Object.fromEntries(keys.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));
  let bytes=2;const bounded=[];for(const p of events){const size=stable(p).length+1;if(bytes+size>384000)break;bounded.push(p);bytes+=size;}
  if(bounded.length)game.providerEventRevisions={identity,events:bounded,truncated:bounded.length<revisions.size};
  if(bounded.length<revisions.size)info.revisionCoveragePartial=true;
 }
 const known=new Set(sourcePlays.filter(p=>p.id!=null).map(p=>String(p.id)));
 const rawIds=new Set([...(summary.plays||[]),...(summary.scoringPlays||[]),...(summary.drives?.previous||[]).flatMap(d=>d.plays||[]),...(summary.drives?.current?.plays||[])].filter(p=>p.id!=null).map(p=>String(p.id)));
 if(Array.isArray(summary.winprobability)){
  const probabilities=normalizeEvents(game.sport,summary.winprobability.map((p,i)=>({...p,id:p.playId??`unanchored-probability:${i}`})),context);
  info.duplicatesRemoved+=probabilities.duplicates;info.conflictingEvents+=probabilities.conflicts;
  result.winprobability=probabilities.events.filter(p=>{
   const removed=p.playId!=null&&rawIds.has(String(p.playId))&&!known.has(String(p.playId));
   const anchored=p.playId!=null&&known.has(String(p.playId));
   const future=!anchored&&(isFuture(p)||ahead);
   if(removed||future){info.futureEventsExcluded++;return false;}return true;
  }).map(({id,...p})=>p);
  // Preserve the probability resource's observed order. Finalized PBP can have
  // revised/nonmonotonic IDs; it cannot establish a different WP arrival stream.
 }
 if((ahead||info.futureEventsExcluded>0)&&compatible&&header.status?.type?.state==='in'){
  info.summaryAhead=Boolean(ahead);info.aggregateEvidenceDeferred=true;
  info.providerBoundary ||= {period:header.status?.period,clock:header.status?.displayClock};
  result.header={...summary.header,competitions:[{...c,competitors:c.competitors}]};
  for(const key of ['boxscore','onIce','news','article','leaders','predictor','broadcasts','pickcenter'])delete result[key];
 }
 info.canonicalBoundary={period:c.status?.period,clock:c.status?.displayClock,playId:last?.id??null};
 result.sportsRadarEvidence=info;
 return result;
}
module.exports={normalizeSummary,normalizeEvents,eventTime,revisionTime};
