const {scoringLedger}=require('./game-facts.cjs');
// Derive football periods only from a complete, internally consistent ledger.
function footballPeriods(game,summary){
 if(!['NFL','CFB'].includes(game.sport))return null;
 const ledger=scoringLedger(game,summary);if(!ledger?.complete)return null;
 const count=Math.max(4,Number(game.liveRawStatus?.period)||0,...ledger.plays.map(p=>Number(p.period?.number)||0));
 const sums={home:Array(count).fill(0),away:Array(count).fill(0)};let h=0,a=0;
 for(const p of ledger.plays){const dh=Number(p.homeScore)-h,da=Number(p.awayScore)-a,delta=dh||da,period=Number(p.period?.number);
  const type=String(p.type?.text||p.scoringType?.name||p.text||'');
  const allowed=/touchdown/i.test(type)?[6,7,8]:/field goal/i.test(type)?[3]:/two.point|safety/i.test(type)?[2]:/extra point/i.test(type)?[1]:[1,2,3,6,7,8];
  if(dh&&da||!allowed.includes(delta)||period<1||period>count)return null;
  sums.home[period-1]+=dh;sums.away[period-1]+=da;h=Number(p.homeScore);a=Number(p.awayScore);
 }
 return sums;
}
// Reconcile visible totals without inventing player statistics or period splits.
function canonicalDetailSummary(game,summary) {
 if(!summary||game.teams?.length!==2||!['NBA','NCAAB','NFL','CFB','NHL'].includes(game.sport))return summary;
 const byId=new Map(game.teams.map(t=>[String(t[8]),String(t[2])]));
 let mismatch=false;
 const competition=summary.header?.competitions?.[0];
 const periods=footballPeriods(game,summary);
 const competitors=(competition?.competitors||[]).map(t=>{
  const score=byId.get(String(t.team?.id));if(score===undefined)return t;
  const lines=t.linescores||[],sum=lines.reduce((n,l)=>n+Number(l.displayValue??l.value),0);
  const consistent=lines.length&&sum===Number(score);
  const reconciled=!consistent&&periods?.[t.homeAway];
  if(String(t.score)!==score||lines.length&&!consistent&&!reconciled)mismatch=true;
  return {...t,score,...(lines.length||reconciled?{linescores:consistent?lines:reconciled?reconciled.map(value=>({value,displayValue:String(value)})):[]}:{}),
    ...(reconciled?{periodScoreSource:'verified scoring progression'}:{})};
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
