// Validation inputs only. Scoring functions and policy constants are frozen.
import {historySummary} from './trajectory-archetypes.mjs';
const positions=[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,.98];
const sustained=[[.08,3,0],[.18,3,3],[.32,7,3],[.44,7,7],[.60,10,7],[.72,10,10]];
const poor=[[.08,3,0],[.18,10,0],[.64,10,3],[.72,10,10]];
function input(id,scores,wp,decisive=false) {
  const summary=historySummary(scores,wp,.98),competition=summary.header.competitions[0];
  competition.competitors=['h','a'].map((id,i)=>({homeAway:i?'away':'home',score:'10',
    team:{id,displayName:i?'Away':'Home',abbreviation:i?'AWY':'HME'}}));
  competition.situation=decisive?{possession:'a',down:2,distance:10,yardsToEndzone:45,
    possessionText:'HME 45',downDistanceText:'2nd & 10 at HME 45',homeTimeouts:0,awayTimeouts:0}:{};
  const current=summary.plays.find(p=>p.id===summary.winprobability.at(-1)?.playId);
  if(current) Object.assign(current,{homeScore:10,awayScore:10,text:'Current possession'});
  return {id,sport:'NFL',event:{id,name:'Away at Home',competitions:[competition]},competition,summary};
}
export function focusedHistories() {
  const goodWp=positions.map(p=>[p,p===.98?.8:.65]);
  const poorWp=positions.map(p=>[p,p===.98?.8:.98]);
  return {
    decisive:[input('decisive-A',sustained,goodWp,true),input('decisive-B',poor,poorWp,true)],
    ordinary:[input('ordinary-A',sustained,goodWp),input('ordinary-B',poor,poorWp)],
    capacity:[input('capacity-available',sustained,goodWp),input('capacity-consumed',
      [[.08,3,0],[.2,3,7],[.7,6,7],[.9,10,7],[.94,10,10]],
      positions.map((p,i)=>[p,p===.98?.8:i%2?.3:.7]))]
  };
}
export function historicalWpThinning() {
  const base=focusedHistories().ordinary[0];
  const wp=base.summary.winprobability;
  const variants={full:wp,currentOnly:wp.slice(-1),earlyPlusCurrent:[...wp.slice(0,4),wp.at(-1)],
    latePlusCurrent:wp.slice(-3),sparseEndpoints:[wp[0],wp.at(-1)],
    internalSamplesRemoved:wp.filter((_,i)=>i<2||i>=wp.length-2)};
  return Object.fromEntries(Object.entries(variants).map(([name,observations])=>{
    const copy=structuredClone(base);
    copy.id=`thinning-${name}`;
    copy.summary.winprobability=structuredClone(observations);
    return [name,copy];
  }));
}
