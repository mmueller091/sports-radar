const fs=require('node:fs'),vm=require('node:vm'),z=require('node:zlib');
const cfb=require('./cfb-calibration.cjs'),nhl=require('./nhl-calibration.cjs');
const frozen=z.gunzipSync(fs.readFileSync(require.resolve('../fixtures/scoring-before-midgame.js.gz'))).toString();
const before=vm.runInNewContext(`${frozen}\nSportsRadarScore`);
const cfbCases=Object.fromEntries([
  [1,'8:00',0],[2,'10:00',0],...[0,3,7,10,14].map(g=>[2,'2:00',g]),
  [3,'12:00',0],[3,'7:30',0],...[0,3,7,10,14,21].map(g=>[3,'2:00',g]),
  [3,'12:00',14],[3,'7:30',14]
].map(([period,clock,gap])=>[`Q${period} ${clock}, gap ${gap}`,{period,clock,scores:[21+gap,21],spot:'MIA 49',down:3,distance:2}]));
function hockey(core,{opening=65,raw=opening,...input}={}) {
  const {competition,event,summary}=nhl.fixture(input),teams=competition.competitors.map(c=>({...c,id:c.team.id}));
  const rating=core.rateGame('NHL','live',teams,event,competition,'');
  const game={sport:'NHL',state:'live',sourceEvent:event,sourceCompetition:competition,
    teams:teams.map(c=>[c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.id]),
    score:rating.score,baseScore:rating.score,openingScore:opening,rawPregameScore:raw,
    openingFactors:[],factors:rating.factors,liveRawStatus:competition.status};
  core.applyLiveSnapshot(game,competition,summary);
  return game.score;
}
const hockeyCases=Object.fromEntries([40,55,65,80,90].flatMap(opening=>[
  [1,'18:00',0],[1,'13:00',0],[1,'13:00',1],[1,'13:00',2],[1,'13:00',3],
  [1,'5:00',0],[1,'5:00',1],[2,'15:00',0],[2,'15:00',1],
  [2,'10:00',0],[2,'10:00',1],[2,'5:00',0],[2,'5:00',2]
].map(([period,clock,gap])=>[`Opening ${opening}, P${period} ${clock}, gap ${gap}`,{opening,period,clock,gap}])));
function touchdown(pre,post,period=3,clock='2:23') {
  return {plays:[{homeScore:pre[0],awayScore:pre[1],period:{number:period},clock:{displayValue:clock},text:'Previous play'},
    {homeScore:post[0],awayScore:post[1],period:{number:period},clock:{displayValue:clock},scoringPlay:true,text:'40-yard touchdown'}]};
}
const shocks={closing:[[28,14],[28,21]],tying:[[28,21],[28,28]],lead:[[21,21],[28,21]],
  widening:[[28,21],[35,21]],wide:[[28,14],[35,14]],garbage:[[49,7],[49,14]]};
const transitionSequence=[[3,'3:00'],[3,'2:00'],[3,'1:00'],[3,'0:10'],[4,'15:00'],[4,'14:00'],[4,'12:00'],[4,'10:00'],[4,'5:00']];
const oldHandoffScores={
  0:[69,70,49,49,49,49,49,50,79],
  3:[66,66,48,49,49,49,49,50,77],
  7:[58,59,46,47,47,48,47,49,76],
  14:[43,43,41,41,41,41,41,43,45]
};
module.exports={before,frozen,cfb,nhl,cfbCases,hockey,hockeyCases,touchdown,shocks,transitionSequence,oldHandoffScores};
