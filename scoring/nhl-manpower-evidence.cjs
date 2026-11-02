// Advisory consistency check, not a reconstructed replacement lineup.
// NHL 2026-27 rules 16.2, 18.2, 19 and 20.1. Complex overlaps remain unknown.
const {hockeyElapsed,hockeyPlayClockMode}=require('./sports/nhl.js');
function inspectManpower(summary,competition,state){
 const result={state:'provider-only',source:'espn-onIce-and-play-ledger',reasons:[],penalties:[]};
 if(!state?.powerPlayTeamId)return {...result,state:state?'consistent':'unknown'};
 const now=hockeyElapsed(competition?.status,false),mode=hockeyPlayClockMode(summary||{});
 if(now===null)return {...result,state:'unknown',reasons:['missing-canonical-clock']};
 const at=p=>hockeyElapsed({period:p.period?.number,displayClock:p.clock?.displayValue,clockMode:mode},false);
 const events=[...new Map((summary?.plays||[]).map(p=>[String(p.id??JSON.stringify(p)),p])).values()]
  .map(p=>({p,time:at(p)})).filter(x=>x.time!==null&&x.time<=now).sort((a,b)=>a.time-b.time);
 const penalties=events.filter(({p})=>Number(p.type?.penaltyMinutes)>0);
 if(!penalties.length)return result;
 // Only examine a recent penalty which could explain this specific advantage.
 const relevant=penalties.filter(x=>String(x.p.team?.id)!==String(state.powerPlayTeamId)&&now-x.time<=360);
 if(!relevant.length)return result;
 const latest=relevant.at(-1),minutes=Number(latest.p.type.penaltyMinutes),kind=String(latest.p.type.penaltyType||'').toLowerCase();
 const major=minutes===5&&kind==='major',double=minutes===4&&/double.?minor/.test(kind),minor=minutes===2&&/^(?:bench )?minor$/.test(kind);
 if(!major&&!double&&!minor)return {...result,state:'unknown',reasons:['unsupported-penalty-class']};
 // Coincident, stacked, delayed or overlapping penalties need full penalty-clock
 // and on-ice history. A partial play ledger cannot establish their ordering.
 const overlaps=penalties.some(x=>x!==latest&&x.time<latest.time+minutes*60&&x.time+Number(x.p.type.penaltyMinutes)*60>latest.time);
 if(overlaps)return {...result,state:'unknown',reasons:['overlapping-penalties']};
 let end=latest.time+minutes*60,segments=double?2:1,endedBy=null;
 for(const {p,time} of events){
  if(time<=latest.time||time>=end||major)continue;
  if(!p.scoringPlay||String(p.team?.id)!==String(state.powerPlayTeamId))continue;
  // Explicit PP attribution is necessary: an ordinary or penalty-shot goal
  // cannot prove that a minor was serving a numerical disadvantage.
  if(!/power[ -]?play/i.test(p.strength?.text||p.strength?.abbreviation||'')||/penalty shot/i.test(p.type?.text||p.text||''))continue;
  if(double&&segments===2&&time<latest.time+120){segments=1;end=time+120;}
  else {segments=0;end=time;endedBy=String(p.id);}
 }
 if(now>=end)segments=0;
 result.penalties=[{id:String(latest.p.id),teamId:String(latest.p.team?.id),kind,minutes,start:latest.time,end,remainingSegments:segments,endedBy}];
 if(now>=end){
  result.state='conflict';result.reasons=[endedBy?'power-play-after-minor-ended':'power-play-after-known-penalty-expired'];
 }else result.state='consistent';
 return result;
}
module.exports={inspectManpower};
