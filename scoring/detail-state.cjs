// Reconcile visible totals without inventing player statistics or period splits.
function canonicalDetailSummary(game,summary) {
 if(!summary||!['NBA','NCAAB'].includes(game.sport))return summary;
 const byId=new Map(game.teams.map(t=>[String(t[8]),String(t[2])]));
 let mismatch=false;
 const competition=summary.header?.competitions?.[0];
 const competitors=(competition?.competitors||[]).map(t=>{
  const score=byId.get(String(t.team?.id));if(score===undefined)return t;
  const lines=t.linescores||[],sum=lines.reduce((n,l)=>n+Number(l.displayValue??l.value),0);
  if(String(t.score)!==score||lines.length&&sum!==Number(score))mismatch=true;
  return {...t,score,linescores:lines.length&&sum===Number(score)?lines:[]};
 });
 const teams=summary.basketballBoxScore?.teams?.map(t=>{
  const score=byId.get(String(t.teamId));if(score===undefined)return t;
  if(t.totals?.points!=null&&String(t.totals.points)!==score)mismatch=true;
  const periods=t.periods||[],sum=periods.reduce((n,p)=>n+Number(p.value),0);
  return {...t,totals:{...t.totals,points:score},periods:sum===Number(score)?periods:[]};
 });
 return {...summary,header:{...summary.header,competitions:[{...competition,competitors,status:game.liveRawStatus||competition?.status}]},
  ...(teams?{basketballBoxScore:{...summary.basketballBoxScore,teams}}:{}),
  sportsRadarFreshness:{...summary.sportsRadarFreshness,statsPending:mismatch}};
}
module.exports={canonicalDetailSummary};
