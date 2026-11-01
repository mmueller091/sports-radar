const {clockSeconds}=require('./shared/time.js');
const {numberFromLine}=require('./shared/market.js');
function underdog(game,c,raw) {
 if(game.sport!=='NCAAB'||!raw||raw.isLive||/live|in[ -]?play/i.test([raw.type?.name||raw.type,raw.description,raw.marketType].join(' ')))return null;
 const market=raw.close||raw.closing||raw;
 const lines=['home','away'].map(side=>({side,value:numberFromLine(market.pointSpread?.[side]?.close?.line)}));
 if(lines.some(s=>s.value===null)||Math.abs(lines[0].value+lines[1].value)>1e-6)return null;
 const dog=lines.find(s=>s.value>4);if(!dog)return null;
 const team=c?.competitors?.find(t=>t.homeAway===dog.side);if(!team)return null;
 const x=Math.max(0,Math.min(1,(dog.value-4)/6));
 return {side:dog.side,teamId:String(team.team?.id),teamName:team.team?.displayName,type:'spread',value:dog.value,
  strength:Math.min(1,Math.max(0,(dog.value-8)/8)),activation:x*x*(3-2*x),description:`${dog.value}-point underdog`};
}
function lateCollegeState(game,c) {
 if(game.sport!=='NCAAB'||Number(c?.status?.period)<2)return null;
 const seconds=clockSeconds(c.status);if(seconds===null||seconds<0)return null;
 const gap=Math.abs(Number(game.teams[0][2])-Number(game.teams[1][2]));
 const x=Math.max(0,Math.min(1,(300-seconds)/180)),urgency=x*x*(3-2*x);
 // Smoothly fade the additional attention beyond a single possession. The
 // existing sport feasibility curve still governs a game with no real runway.
 const closeness=Math.max(0,Math.min(1,(7-gap)/4));
 return {urgency:urgency*closeness};
}
function tensionPolicy(game,c) {
 const state=lateCollegeState(game,c);
 return state?{kind:'margin-modifier',uncertaintyWeight:.35,currentTensionCeiling:34+10*state.urgency}:null;
}
function situation(game,c,impact) {
 const state=lateCollegeState(game,c);if(!state)return impact;
 // Generic leverage already owns clock urgency. Add only the bounded extra
 // pressure of a one-possession college finish, inside the existing 12 cap.
 return {...impact,candidatePoints:Math.min(12,(impact.candidatePoints||0)+Math.round(5*state.urgency))};
}
module.exports={tensionPolicy,situation,underdog};
