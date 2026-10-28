// Synthetic watchability archetypes, never represented as historical games.
function fixture({gap=0,period=3,clock='2:00',postseason=false,final=false,deciding=false,shootout=false,manpower='',goals=0,plays=[],price,winningDog=false,completed=false}={}) {
  const competition={status:{period,displayClock:clock,type:{state:completed?'post':'in',completed,detail:shootout?'Shootout':period>3?`${period-3}OT`:completed?'Final':''}},
    competitors:['h','a'].map((id,i)=>({homeAway:i?'away':'home',score:String(i ? 2 : 2+gap),team:{id,displayName:i?'Away':'Home',abbreviation:i?'AWY':'HME'},records:[{type:'total',summary:'6-4'}]}))};
  if(price) competition.odds=[{moneyline:{[winningDog?'home':'away']:{close:{odds:`+${price}`}}}}];
  const event={id:'synthetic',name:final?`Stanley Cup Final ${deciding?'Game 7':''}`:postseason?`Stanley Cup Playoffs ${deciding?'Game 7':''}`:'Home vs Away',season:{type:postseason||final?3:2},competitions:[competition]};
  const counts=manpower==='trailingPP'?[4,5]:manpower==='fiveOnThree'?[3,5]:manpower==='leadingPP'?[5,4]:manpower==='sixOnFour'?[4,6]:manpower==='pulled'?[5,6]:[5,5];
  const pulled=['sixOnFour','pulled'].includes(manpower);
  const summary={header:{season:event.season,competitions:[competition]},plays,
    onIce:['h','a'].map((id,i)=>({teamId:id,entries:[...Array.from({length:counts[i]},(_,j)=>({athleteid:`${id}${j}`})),...(i===1&&pulled?[]:[{athleteid:`${id}g`}])]})),
    boxscore:{players:['h','a'].map(id=>({team:{id},statistics:[{name:'goalies',athletes:[{athlete:{id:`${id}g`}}]},...(goals&&id==='h'?[{name:'skaters',labels:['G'],athletes:[{athlete:{displayName:'Scorer'},stats:[String(goals)]}]}]:[])]}))}};
  return {competition,event,summary};
}
function evaluate(core,input={}) {
  const {competition,event,summary}=fixture(input);
  const state=input.completed?'completed':'live';
  const teams=competition.competitors.map(c=>({...c,id:c.team.id}));
  const rating=core.rateGame('NHL',state,teams,event,competition,'');
  const game={sport:'NHL',state,sourceEvent:event,sourceCompetition:competition,
    teams:teams.map(c=>[c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.id]),
    score:rating.score,baseScore:rating.score,openingScore:rating.openingScore,openingFactors:rating.openingFactors,
    factors:rating.factors,underdog:rating.underdog,liveRawStatus:competition.status};
  if(state==='live') core.applyLiveSnapshot(game,competition,summary);
  const history=core.momentumImpact('NHL',summary,core.gameProgress('NHL',competition),state,
    state==='completed' ? {game,finishPoints:0} : null);
  return {score:core.clampScore(game.score+history.points),base:game.baseScore,bonus:game.live?.bonus||0,history:history.points,
    historyFactors:history.factors,upset:rating.upsetPoints,opening:rating.openingScore,components:game.live?.components};
}
const cases={
  'Tied 12:00 third':{clock:'12:00'},'Tied 10:00 third':{clock:'10:00'},'Tied 7:30 third':{clock:'7:30'},
  'Tied 5:00 third':{clock:'5:00'},'Tied 2:00 third':{},'Tied 1:00 third':{clock:'1:00'},
  'Down 1, 2:00':{gap:1},'Down 1, goalie pulled, 1:00':{gap:1,clock:'1:00',manpower:'pulled'},
  'Down 1, 6-on-4, 1:00':{gap:1,clock:'1:00',manpower:'sixOnFour'},
  'Down 2, 10:00 third':{gap:2,clock:'10:00'},'Down 2, 5:00 third':{gap:2,clock:'5:00'},
  'Down 2, 2:00 third':{gap:2,clock:'2:00'},'Down 2, 1:00 third':{gap:2,clock:'1:00'},
  'Down 3, 10:00 first':{gap:3,period:1,clock:'10:00'},'Down 3, 10:00 third':{gap:3,clock:'10:00'},
  'Down 3, 5:00 third':{gap:3,clock:'5:00'},'Down 3, 2:00 third':{gap:3,clock:'2:00'},
  'Down 3, 1:00 third':{gap:3,clock:'1:00'},'Tied 0:10 third':{clock:'0:10'},'Tied end regulation':{clock:'0:00'},
  'Start regular-season OT':{period:4,clock:'5:00'},'Regular-season OT':{period:4,clock:'2:30'},
  'Shootout':{period:5,shootout:true},'Playoff OT':{period:4,postseason:true,clock:'15:00'},
  'Playoff 2OT':{period:5,postseason:true,clock:'15:00'},'Playoff 3OT':{period:6,postseason:true,clock:'15:00'},
  'Stanley Cup Final deciding game OT':{period:4,postseason:true,final:true,deciding:true,clock:'15:00'}
};
function goal(homeScore,awayScore,period,clock,text='Goal') {
  return {homeScore,awayScore,period:{number:period},clock:{displayValue:clock},scoringPlay:true,text};
}
module.exports={fixture,evaluate,cases,goal};
