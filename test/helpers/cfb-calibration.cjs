// Reproducible archetypes; no historical outcomes enter the runtime model.
const nfl = require('./nfl-calibration.cjs');
function fixture(input={}) {
  const f = nfl.fixture({...input,ot:false,playoff:false});
  const {competition,event,summary} = f;
  const ranks = input.ranks || [];
  competition.competitors.forEach((team,i) => {
    team.team.displayName = i ? 'College Away' : 'College Home';
    if (ranks[i]) team.curatedRank = {current:ranks[i]};
  });
  event.name = input.playoff ? 'College Football Playoff National Championship' : 'College Home vs College Away';
  event.season = {year:input.year ?? 2026,type:input.playoff ? 3 : 2};
  competition.season = event.season;
  summary.header.season = event.season;
  if (input.otResponse) summary.drives = {previous:[{
    id:'response-evidence',team:{id:'h'},start:{period:{number:input.evidencePeriod ?? input.period}},
    result:input.otResult || 'Touchdown',
    plays:[{period:{number:input.evidencePeriod ?? input.period},start:{team:{id:'h'}},text:input.otResult || 'Touchdown'}]
  }]};
  return f;
}
function evaluateFixture(core,f,state='live') {
  const {competition,event,summary} = f;
  const teams = competition.competitors.map(c => ({...c,id:c.team.id}));
  const rating = core.rateGame('CFB',state,teams,event,competition,'');
  const game = {sport:'CFB',state,teams:teams.map(c => [c.team.displayName,c.team.abbreviation,c.score,'','','',core.rankFor(c,'CFB'),c.homeAway,c.id]),
    score:rating.score,baseScore:rating.score,openingScore:rating.openingScore,openingFactors:rating.openingFactors,
    factors:rating.factors,underdog:rating.underdog,liveRawStatus:competition.status,liveRawSituation:competition.situation};
  core.applyLiveSnapshot(game,competition,summary);
  const history = core.momentumImpact('CFB',summary,core.gameProgress('CFB',competition),state);
  return {score:core.clampScore(game.score+history.points),base:game.baseScore,bonus:game.live?.bonus || 0,
    situation:game.live?.components.situation || 0,history:history.points,upset:game.upsetPoints ?? rating.upsetPoints ?? 0};
}
const evaluate = (core,input,state='live') => evaluateFixture(core,fixture(input),state);
const cases = {
  A:{period:2,clock:'7:00'}, B:{clock:'5:00'},
  C:{scores:[24,19],spot:'MIA 25'},
  D:{scores:[24,19],possession:'h',spot:'BUF 25',down:1,timeouts:0},
  E:{scores:[24,19],possession:'h',spot:'BUF 25',down:1,timeouts:3},
  F:{scores:[24,24],clock:'1:00',spot:'BUF 35'},
  G:{scores:[35,21],clock:'8:00',spot:'MIA 25'},
  H:{scores:[42,21],clock:'8:00',spot:'MIA 25'},
  I:{scores:[42,21],clock:'2:00',spot:'MIA 25'},
  J:{scores:[21,24],spread:7,possession:'h',spot:'BUF 25'},
  K:{scores:[21,24],spread:21,possession:'h',spot:'BUF 25'},
  L:{scores:[24,24],spread:28,spot:'BUF 35'},
  M:{spread:21}, N:{scores:[38,21],spread:21},
  O:{scores:[21,24],spread:21,possession:'h',spot:'BUF 25',ranks:[2,null]},
  P:{scores:[24,24],clock:'1:00',spot:'BUF 35',ranks:[1,2]},
  Q:{scores:[24,19],clock:'0:40',spot:'BUF 30',down:4,distance:2},
  R:{scores:[24,22],clock:'0:00',spot:'BUF 2',down:0,distance:2,tryState:true},
  S:{scores:[24,24],period:5,clock:'0:00',spot:'BUF 25',down:1},
  T:{scores:[31,24],period:5,clock:'0:00',spot:'BUF 25',otResponse:true},
  U:{scores:[34,32],period:7,clock:'0:00',spot:'BUF 3',down:0,tryState:true,otResponse:true,otResult:'Two-point conversion'},
  V:{scores:[34,32],period:7,clock:'0:00',spot:'BUF 3',down:0,tryState:true,otResponse:true,otResult:'Two-point conversion',playoff:true},
  W:{scores:[56,21],clock:'3:00',ranks:[1,8],possession:'h',spot:'BUF 25',down:1,timeouts:0},
  X:{scores:[10,7],clock:'5:00',action:true}, Y:{scores:[10,7],clock:'5:00',stagnant:true}
};
const margins = Object.fromEntries(['30:00','15:00','8:00','4:00','2:00'].flatMap(time => [7,10,14,17,21,28].map(gap => [
  `${time}/${gap}`,{scores:[28+gap,28],period:time === '30:00' ? 2 : 4,clock:time === '30:00' ? '0:00' : time,spot:'MIA 25'}
])));
module.exports = {fixture,evaluateFixture,evaluate,cases,margins};
