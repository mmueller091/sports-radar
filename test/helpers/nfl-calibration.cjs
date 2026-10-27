// Synthetic state archetypes, not claims about particular historical games.
function fixture({scores=[24,21],period=4,clock='1:30',possession='a',spot='BUF 30',down=2,distance=6,timeouts,playoff=false,spread,action=false,stagnant=false,tryState=false,goalToGo=false,probability,ot=false}={}) {
  const competition = {
    status:{period,displayClock:clock,type:{state:'in',completed:false}},
    competitors:[['h','BUF','Buffalo Bills','home'],['a','MIA','Miami Dolphins','away']].map(([id,abbr,name,homeAway],i) => ({
      homeAway,score:String(scores[i]),team:{id,abbreviation:abbr,displayName:name},records:[{type:'total',summary:'6-3'}],
      ...(timeouts === undefined ? {} : {timeouts})
    })),
    situation:{possession,down,distance,possessionText:spot,downDistanceText:`${down} & ${distance} at ${spot}`,...(tryState ? {isTwoPointAttempt:true} : {}),...(goalToGo ? {isGoalToGo:true} : {})},
    odds:[{overUnder:44,...(spread ? {spread,awayTeamOdds:{underdog:true},homeTeamOdds:{favorite:true}} : {})}]
  };
  const event = {season:{year:2026,type:playoff ? 3 : 2},name:playoff ? 'AFC Championship' : 'Bills vs Dolphins'};
  const summary = {header:{season:event.season,competitions:[competition]}};
  if (probability !== undefined) summary.winprobability = [{homeWinPercentage:probability}];
  if (ot) summary.drives = {previous:[
    {id:'ot1',team:{id:'h'},start:{period:{number:5}},result:'Punt',plays:[{period:{number:5},start:{team:{id:'h'}},text:'Punt'}]},
    {id:'ot2',team:{id:'a'},start:{period:{number:5}},result:'Punt',plays:[{period:{number:5},start:{team:{id:'a'}},text:'Punt'}]}
  ]};
  if (stagnant || action) {
    summary.boxscore = {teams:[0,1].map(() => ({statistics:[
      {name:'yardsPerPlay',value:3.5},{name:'thirdDownEff',displayValue:'2-12'},{name:'redZoneAttempts',displayValue:'0-2'}
    ]}))};
    summary.drives = {previous:Array.from({length:12},(_,i) => ({id:String(i),result:i < 10 ? 'Punt' : 'Field Goal'}))};
    summary.scoringPlays = Array.from({length:5},() => ({text:'Field goal is good'}));
    summary.plays = action ? ['Pass intercepted, returned for 30 yards','Quarterback sacked','Stopped on fourth down','Blocked field goal','Defensive touchdown','Safety'].map(text => ({text})) : [];
  }
  return {competition,event,summary};
}
const cases = {
  A:{period:2,clock:'7:00'}, B:{clock:'4:00'}, C:{scores:[24,19],spot:'MIA 25'},
  D:{scores:[24,19],possession:'h',spot:'BUF 25',down:1,timeouts:0},
  E:{scores:[24,19],possession:'h',spot:'BUF 25',down:1,timeouts:3},
  F:{scores:[24,24],clock:'1:00',spot:'BUF 35'},
  G:{clock:'2:30',possession:'h',spot:'BUF 25',down:1,timeouts:3},
  H:{clock:'1:20',possession:'h',spot:'BUF 25',down:1,timeouts:0},
  I:{scores:[9,6],clock:'4:00',action:true}, J:{scores:[9,6],clock:'4:00',stagnant:true},
  K:{spread:14}, L:{scores:[24,14],spread:14},
  M:{scores:[24,24],period:5,clock:'5:00',spot:'BUF 35',playoff:true,ot:true},
  N:{period:1,clock:'8:00',spot:'50',down:4,distance:1},
  O:{scores:[24,19],clock:'0:40',spot:'BUF 30',down:4,distance:2},
  P:{scores:[24,22],clock:'0:25',spot:'BUF 2',down:0,distance:2,tryState:true}
};
function evaluate(core,input,sport='NFL') {
  const {competition,event,summary} = fixture(input);
  const teams = competition.competitors.map(c => ({...c,id:c.team.id}));
  const rating = core.rateGame(sport,'live',teams,event,competition,'');
  const game = {sport,state:'live',teams:teams.map(c => [c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.id]),
    score:rating.score,baseScore:rating.score,openingScore:rating.openingScore,openingFactors:rating.openingFactors,
    factors:rating.factors,underdog:rating.underdog,liveRawStatus:competition.status,liveRawSituation:competition.situation};
  core.applyLiveSnapshot(game,competition,summary);
  const history = core.momentumImpact(sport,summary,core.gameProgress(sport,competition),'live');
  // Same aggregation used by the application after summary enrichment.
  return {score:core.clampScore(game.score+history.points),base:game.baseScore,bonus:game.live.bonus,situation:game.live.components.situation,history:history.points,upset:game.upsetPoints || 0};
}
module.exports = {fixture,cases,evaluate};
