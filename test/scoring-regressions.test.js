import test from 'node:test';
import assert from 'node:assert/strict';
import '../rating-core.js';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

const core = globalThis.SportsRadarScore;
const points = (rating,label) => rating.factors.filter(item => item.label === label).reduce((sum,item) => sum + item.points,0);
const team = (id,homeAway,record='12-3',rank=undefined) => ({
  homeAway,team:{id,displayName:id,abbreviation:id},score:'0',
  records:[{type:'total',summary:record}],curatedRank:{current:rank}
});
export function matchup(sport,detail='',postseason=false) {
  const competition = {competitors:[team('Away','away'),team('Home','home')],notes:[{headline:detail}],status:{type:{state:'pre'}}};
  const event = {id:'regression',name:'Away at Home',season:{type:postseason ? 3 : 2},competitions:[competition]};
  return {sport,event,competition,detail};
}
export const pregame = (input,engine=core) => engine.pregameRating(input.sport,input.event,input.competition,input.detail);

const rankedMatchup = (sport,ranks,spread) => {
  const input=matchup(sport);
  input.competition.competitors.forEach((item,i)=>{item.curatedRank.current=ranks[i];});
  if (spread !== null) input.competition.odds=[{details:`Home -${spread}`,spread:-spread}];
  return input;
};
const rankingPoints = rating => rating.factors
  .filter(item=>/^(Two ranked teams|Both top 10|Both top 20|Top 10 team|Ranked team)$/.test(item.label))
  .reduce((sum,item)=>sum+item.points,0);

for (const sport of ['CFB','NCAAB']) {
  test(`${sport} ranking value follows matchup competitiveness`,()=>{
    const scenarios=[
      rankedMatchup(sport,[1,3],2.5),
      rankedMatchup(sport,[4,18],6),
      rankedMatchup(sport,[2,null],3),
      rankedMatchup(sport,[8,22],17),
      rankedMatchup(sport,[1,null],21)
    ];
    const scores=scenarios.map(input=>pregame(input).score);
    for (let i=1;i<scores.length;i++) assert.ok(scores[i-1]>scores[i],`${sport}: ${scores.join(' > ')}`);
    assert.ok(scores[4]<scores[2]-5);
    assert.ok(rankingPoints(pregame(scenarios[4]))<rankingPoints(pregame(scenarios[2]))/2);
    assert.ok(rankingPoints(pregame(scenarios[3]))>rankingPoints(pregame(scenarios[4])));
  });
  test(`${sport} spread attenuation has no 20-point cliff`,()=>{
    const at=(ranks,spread)=>rankingPoints(pregame(rankedMatchup(sport,ranks,spread)));
    for (const ranks of [[1,null],[8,22]]) {
      assert.ok(at(ranks,3)>at(ranks,21));
      assert.ok(at(ranks,19.5)>=at(ranks,20));
      assert.ok(at(ranks,19.5)-at(ranks,20)<=1);
      assert.ok(at(ranks,20)>=at(ranks,20.5));
      assert.ok(at(ranks,20)-at(ranks,20.5)<=1);
    }
    assert.ok(at([1,null],null)<at([1,null],3));
  });
  test(`${sport} ranking attenuation leaves context factors intact`,()=>{
    const input=rankedMatchup(sport,[1,null],21);
    input.detail='rivalry';
    input.event.sportsRadarContext=[{type:'playoff_rematch',text:'Verified rematch'}];
    const rating=pregame(input);
    assert.equal(points(rating,'Rivalry'),7);
    assert.equal(points(rating,'Playoff rematch'),6);
  });
}

for (const sport of ['CFB','NCAAB','NBA']) {
  const marketPoints=spread=>{
    const input=matchup(sport);
    input.competition.odds=[{details:`Home -${spread}`,spread:-spread}];
    const market=pregame(input).factors.filter(item=>/projected spread/.test(item.label));
    assert.ok(market.length<=1);
    return market[0]?.points || 0;
  };
  test(`${sport} market bonus decreases smoothly with the spread`,()=>{
    const spreads=[0,2.5,3,5.5,6,9,12,20];
    const awards=spreads.map(marketPoints);
    for (let i=1;i<awards.length;i++) {
      assert.ok(awards[i-1]>=awards[i],`${sport}: ${awards.join(', ')}`);
    }
    assert.ok(awards[0]>=4 && awards[0]<=5);
    assert.ok(awards[2]>=3 && awards[2]<=4);
    assert.ok(awards[4]>=2 && awards[4]<=3);
    assert.ok(awards[5]>=1 && awards[5]<=2);
    assert.ok(awards[6]<=1);
    assert.equal(awards[7],0);
    assert.ok(awards[3]-awards[4]<=1);
  });
  for (const spread of [0,2.5,3,5.5,6,9,12,20]) {
    test(`${sport} spread ${spread} applies market factor exactly once`,()=>{
      const input=matchup(sport);
      const before=pregame(input);
      input.competition.odds=[{details:`Home -${spread}`,spread:-spread}];
      const after=pregame(input);
      const market=after.factors.filter(item=>/projected spread/.test(item.label));
      const award=marketPoints(spread);
      assert.equal(market.length,award ? 1 : 0);
      assert.equal(after.score-before.score,award);
      assert.ok(Number.isInteger(award) && award>=0 && award<=5);
    });
  }
  test(`${sport} missing odds has no market factor`,()=>{
    assert.equal(pregame(matchup(sport)).factors.some(item=>/projected spread/.test(item.label)),false);
  });
  if (sport !== 'NBA') {
    test(`${sport} market bonus is independent of ranked-matchup points`,()=>{
      const at=spread=>pregame(rankedMatchup(sport,[1,3],spread));
      for (const spread of [3,6,12]) {
        const market=at(spread).factors.filter(item=>/projected spread/.test(item.label));
        assert.equal(market.length,1);
        assert.equal(market[0].points,marketPoints(spread));
      }
      assert.ok(rankingPoints(at(3))>rankingPoints(at(12)));
    });
  }
}
for (const sport of ['MLB','NHL']) {
  for (const [price,expected] of [[125,5],[150,3],[160,0]]) {
    test(`${sport} moneyline ${price} remains unchanged`,()=>{
      const input=matchup(sport);
      const before=pregame(input);
      input.competition.odds=[{homeTeamOdds:{moneyLine:-price},awayTeamOdds:{moneyLine:price}}];
      const after=pregame(input);
      assert.equal(after.score-before.score,expected);
      assert.equal(after.factors.filter(item=>/market/.test(item.label)).length,expected ? 1 : 0);
    });
  }
}
test('2026 LSU at Ole Miss, Ole Miss -2.5, receives a close-market bonus',()=>{
  const input=matchup('CFB');input.event.name='LSU at Ole Miss';
  input.competition.odds=[{details:'MISS -2.5',spread:-2.5}];
  assert.ok(points(pregame(input),'Very close projected spread')>=4);
});

const recordLabel=/winning records|adjusted quality|Adjusted team quality|Unbeaten team|at least .500|below .500|Winless team|between winning teams/;
for (const sport of ['NFL','MLB','NHL','NBA','CFB','NCAAB']) {
  test(`${sport} postseason suppresses record-only factors while preserving rankings and market`,()=>{
    const input=matchup(sport);
    input.competition.competitors.forEach((item,i)=>item.curatedRank.current=i ? 4 : 1);
    input.competition.odds=[{details:"Home -2.5",spread:-2.5,homeTeamOdds:{moneyLine:-110},awayTeamOdds:{moneyLine:110}}];
    const regular=pregame(input);
    input.event.season.type={id:3};
    const post=pregame(input);
    // NCAAB has no record-only factor in the published engine.
    if (sport !== 'NCAAB') assert.ok(regular.factors.some(item=>recordLabel.test(item.label)));
    assert.equal(post.factors.some(item=>recordLabel.test(item.label)),false);
    for (const factor of regular.factors.filter(item=>/ranked|top 20|Top 10|spread|market/i.test(item.label))) {
      assert.equal(points(post,factor.label),factor.points);
    }
  });
}
test('postseason preserves rivalry, rematch and return context',()=>{
  const input=matchup('CFB','CFP semifinal rivalry',true);
  input.event.sportsRadarContext=[{type:'playoff_rematch',text:'Rematch'},{type:'former_star_return',text:'Player returns'},{type:'coach_return',text:'Coach returns'}];
  const regular=structuredClone(input);regular.event.season.type=2;regular.detail='rivalry';regular.competition.notes=[{headline:'rivalry'}];
  const independent=rating=>rating.factors.filter(item=>item.label==='Rivalry'||item.contextType);
  assert.deepEqual(independent(pregame(input)),independent(pregame(regular)));
  assert.equal(points(pregame(input),'Rivalry'),7);
  assert.equal(independent(pregame(input)).length,4);
});
test('explicit championship text suppresses records without season metadata',()=>{
  for (const [sport,detail] of [['MLB','World Series Game 1'],['NBA','NBA Finals Game 1'],['NHL','Stanley Cup Final Game 1'],['NFL','AFC Divisional Playoff'],['CFB','CFP semifinal']]) {
    const input=matchup(sport,detail);delete input.event.season;
    assert.equal(pregame(input).factors.some(item=>recordLabel.test(item.label)),false);
  }
});

for (const [sport,title] of [['MLB','World Series'],['NBA','NBA Finals'],['NHL','Stanley Cup Final']]) {
  test(`${title}: opener, competitive Game 3, elimination and Game 7 are distinct`,()=>{
    const scenarios=[['Game 1',82],['Game 3',85],['Game 5 - elimination game - can clinch',92],['Game 7 - elimination game - can clinch',98]];
    for (const [detail,expected] of scenarios) {
      const input=matchup(sport,`${title} ${detail} postseason championship`,true);
      if (detail==='Game 3') input.competition.series={summary:'Series tied 1-1'};
      const result=pregame(input);
      assert.equal(result.score,expected);
      assert.equal(result.factors.filter(item=>/Championship|World Series|Final round/.test(item.label)).length,detail==='Game 1' ? 1 : 2);
      assert.equal(result.factors.some(item=>['Postseason','Postseason scarcity','Series opener','Clinching opportunity','Elimination stakes','Deciding game'].includes(item.label)),false);
    }
    const close=matchup(sport,`${title} Game 1`,true);
    close.competition.odds=[{details:"Home -2",spread:2,homeTeamOdds:{moneyLine:-110},awayTeamOdds:{moneyLine:110}}];
    assert.equal(pregame(close).score,87);
    close.detail=`${title} Game 7`;close.competition.notes=[{headline:close.detail}];
    assert.equal(pregame(close).score,99);
  });
  test(`${title}: series state identifies clinch and winner-take-all without game number`,()=>{
    const input=matchup(sport,title,true);
    input.competition.series={summary:'Home leads 3-2'};
    assert.equal(pregame(input).score,92);
    input.competition.series.summary='Series tied 3-3';
    assert.equal(pregame(input).score,98);
  });
}

export function completed(input,status='Final',engine=core) {
  input=structuredClone(input);
  input.competition.status={type:{state:'post',completed:true,shortDetail:status},period:status.includes('OT') ? 6 : 4};
  input.competition.competitors[0].score='38';input.competition.competitors[1].score='35';
  return engine.rateGame(input.sport,'completed',input.competition.competitors,input.event,input.competition,input.detail);
}
for (const status of ['OT','2OT','3OT','4OT','Final/OT','Final/2OT','Overtime','Double overtime','Triple overtime']) {
  test(`${status} receives existing completed overtime +13`,()=>{
    const input=matchup('NFL','AFC Divisional Playoff',true);input.event.name='2013 Baltimore Ravens at Denver Broncos';
    const result=completed(input,status);
    assert.equal(points(result,'Overtime'),13);
    assert.equal(result.score-completed(input).score,13);
    assert.match(result.reason,/Overtime finish/);
  });
}
for (const [sport,stage] of [['NFL','AFC Divisional Playoff'],['NFL','NFC Wild Card'],['NFL','AFC Conference Championship'],['CFB','College Football Playoff quarterfinal'],['CFB','CFP first round'],['NCAAB','NCAA Tournament Round of 64'],['NCAAB','Sweet 16'],['NCAAB','Final Four']]) {
  test(`${stage} implies completed advancement/elimination`,()=>{
    const result=core.completedStakesImpact(sport,{}, {},stage.toLowerCase());
    assert.equal(points(result,'Advancement or elimination decided'),8);
    assert.ok(result.points>=18 && result.points<=24);
  });
}
test('title games retain the persistent +24 cap',()=>{
  for (const [sport,stage] of [['NFL','Super Bowl'],['CFB','National Championship'],['NCAAB','National Championship']]) {
    assert.equal(core.completedStakesImpact(sport,{}, {},stage.toLowerCase()).points,24);
  }
});
test('ordinary series playoff games do not imply elimination',()=>{
  for (const sport of ['MLB','NBA','NHL']) {
    const result=core.completedStakesImpact(sport,{season:{type:3}}, {},'divisional playoff game 1');
    assert.equal(result.points,10);
    assert.equal(points(result,'Advancement or elimination decided'),0);
  }
});
test('regular-season playoff races do not imply postseason or advancement',()=>{
  for (const [sport,detail] of [['NFL','Wild Card race'],['CFB','CFP race']]) {
    const input=matchup(sport,detail);
    input.competition.competitors.forEach((item,i)=>item.curatedRank.current=i ? 4 : 1);
    assert.ok(pregame(input).factors.some(item=>recordLabel.test(item.label)));
    assert.equal(points(core.completedStakesImpact(sport,input.event,input.competition,detail),'Advancement or elimination decided'),0);
  }
});

export function defensiveSummary({clock='1:02',period=4,gap=8,text='Pass intercepted in the end zone',yards=6,down=4}={}) {
  const home=team('MISS','home'),away=team('LSU','away');home.score=String(24+gap);away.score='24';
  const competition={competitors:[home,away],status:{type:{state:'post',completed:true,shortDetail:'Final'},period:4}};
  return {header:{competitions:[competition]},plays:[{
    id:'interception',period:{number:period},clock:{displayValue:clock},text,
    homeScore:24+gap,awayScore:24,start:{team:{id:'LSU'},down,yardsToEndzone:yards},end:{team:{id:'MISS'}}
  },{id:'kneel',period:{number:period},clock:{displayValue:'0:30'},text:'Ole Miss kneels',homeScore:24+gap,awayScore:24,start:{team:{id:'MISS'}}}]};
}
const defense = summary => {
  const finish=core.defensiveFinishFactor('CFB',summary);
  return {points:finish?.points || 0,factors:finish ? [finish] : []};
};
test('LSU-Ole Miss end-zone interception on tying drive earns one +14 defensive finish',()=>{
  const summary=defensiveSummary();const result=defense(summary);
  assert.equal(points(result,'Decisive defensive finish'),14);
  assert.equal(result.factors.filter(item=>item.label==='Decisive defensive finish').length,1);
  const event={id:'lsu-ole-miss',name:'2026 LSU at Ole Miss',season:{type:2},competitions:summary.header.competitions};
  const game=normalizeEvent(event,'CFB');enrichGame(game,summary);
  assert.equal(points(game,'Decisive defensive finish'),14);
  assert.equal(points(game,'Decisive last play'),0);
});
for (const [text,yards,expected] of [['Pass intercepted',40,9],['Fumble lost',10,12],['Turnover on downs',6,12],['Pass incomplete',6,12],['Defensive stop seals the game',6,12]]) {
  test(`${text} earns one appropriately weighted defensive finish`,()=>{
    assert.equal(points(defense(defensiveSummary({text,yards})),'Decisive defensive finish'),expected);
  });
}
for (const [label,options] of [['10 minutes left',{clock:'10:00'}],['multiple scores behind',{gap:16}],['third quarter',{period:3}],['nullified turnover',{text:'Pass intercepted, no play'}]]) {
  test(`${label} does not earn defensive finish`,()=>assert.equal(points(defense(defensiveSummary(options)),'Decisive defensive finish'),0));
}
test('another possession for the losing offense disqualifies a finish',()=>{
  const summary=defensiveSummary();summary.plays.push({...summary.plays[0],text:'Pass complete for 5 yards',start:{team:{id:'LSU'},down:1},end:{team:{id:'LSU'}}});
  assert.equal(points(defense(summary),'Decisive defensive finish'),0);
});
test('recovered own fumble and early-down incompletion do not count',()=>{
  for (const text of ['Fumble recovered by LSU','Pass incomplete']) {
    const summary=defensiveSummary({text,down:2});summary.plays[0].end.team.id='LSU';
    assert.equal(points(defense(summary),'Decisive defensive finish'),0);
  }
});
test('overtime and nested drive plays support decisive stops',()=>{
  const summary=defensiveSummary({period:5,clock:'10:00'});
  summary.drives={previous:[{team:{id:'LSU'},plays:summary.plays.slice(0,1)},{team:{id:'MISS'},plays:summary.plays.slice(1)}]};
  delete summary.plays;
  assert.equal(points(defense(summary),'Decisive defensive finish'),14);
});
test('scoring finish and defensive finish are mutually exclusive, with unchanged momentum cap',()=>{
  const summary=defensiveSummary();
  summary.scoringPlays=[{period:{number:4},clock:{displayValue:'0:00'},homeScore:32,awayScore:24,text:'Game-winning touchdown'}];
  assert.equal(points(defense(summary),'Decisive defensive finish'),0);
  assert.ok(defense(summary).points<=25);
  assert.equal(points(core.momentumImpact('CFB',defensiveSummary(),.99,'live'),'Decisive defensive finish'),0);
});
export function cappedDefensiveSummary() {
  const summary=defensiveSummary();
  summary.scoringPlays=[
    {period:{number:1},clock:{displayValue:'4:00'},homeScore:7,awayScore:7,text:'Touchdown'},
    {period:{number:2},clock:{displayValue:'8:00'},homeScore:24,awayScore:7,text:'Touchdown'},
    {period:{number:4},clock:{displayValue:'7:00'},homeScore:24,awayScore:24,text:'Tying touchdown'},
    {period:{number:4},clock:{displayValue:'4:00'},homeScore:32,awayScore:24,text:'Touchdown and two-point conversion'}
  ];
  summary.winprobability=[.1,.9,.1,.9,.1,.9,.5,.5,.5,.5].map(homeWinPercentage=>({homeWinPercentage}));
  return summary;
}
function enriched(summary) {
  const game=normalizeEvent({id:'lsu-ole-miss',name:'LSU at Ole Miss',season:{type:2},competitions:summary.header.competitions},'CFB');
  enrichGame(game,summary);
  return game;
}
test('LSU end-zone interception adds all +14 after completed momentum reaches +25',()=>{
  const summary=cappedDefensiveSummary();
  const noFinish=structuredClone(summary);noFinish.plays=[];
  const momentum=core.momentumImpact('CFB',summary,1,'completed');
  assert.equal(momentum.points,25);
  assert.deepEqual(momentum,core.momentumImpact('CFB',noFinish,1,'completed'));
  assert.equal(points(momentum,'Decisive defensive finish'),0);
  const base=enriched(noFinish),finished=enriched(summary);
  assert.equal(finished.momentumPoints,25);
  assert.equal(finished.score,base.score+14);
  assert.equal(points(finished,'Decisive defensive finish'),14);
  assert.equal(points(finished,'Decisive last play'),0);
});
test('scoring and defensive finishes each add +14 beyond identical capped momentum',()=>{
  const defensive=cappedDefensiveSummary();
  const scoring=structuredClone(defensive);
  scoring.plays=[];
  Object.assign(scoring.scoringPlays.at(-1),{clock:{displayValue:'0:00'},text:'Game-winning touchdown'});
  const noFinish=structuredClone(defensive);noFinish.plays=[];
  const base=enriched(noFinish),defended=enriched(defensive),scored=enriched(scoring);
  assert.equal(base.momentumPoints,25);
  assert.equal(defended.momentumPoints,25);
  assert.equal(scored.momentumPoints,25);
  assert.equal(scored.score,base.score+14);
  assert.equal(defended.score,base.score+14);
  assert.equal(points(scored,'Decisive last play'),14);
  assert.equal(points(scored,'Decisive defensive finish'),0);
  // Even ambiguous data offering both signals must select only the scoring finish.
  scoring.plays=defensive.plays;
  const both=enriched(scoring);
  assert.equal(both.score,scored.score);
  assert.equal(points(both,'Decisive last play'),14);
  assert.equal(points(both,'Decisive defensive finish'),0);
});
test('finish awards remain globally clamped to 99',()=>{
  const summary=cappedDefensiveSummary();
  const competition=summary.header.competitions[0];
  competition.notes=[{headline:'National championship'}];
  competition.status.type.shortDetail='Final/OT';
  const game=enriched(summary);
  assert.equal(game.momentumPoints,25);
  assert.equal(points(game,'Decisive defensive finish'),14);
  assert.equal(game.score,99);
});

test('live MLB margin closeness widens early and returns to the three-run standard late',()=>{
  const closeness=(inning,half='Top')=>core.mlbLiveMarginCloseness(2,(inning-1+(half==='Bottom'?.75:.25))/9);
  assert.ok(closeness(2,'Bottom') >= .65 && closeness(2,'Bottom') <= .70);
  assert.ok(closeness(5) >= .55 && closeness(5) <= .60);
  assert.ok(closeness(9,'Bottom') >= .30 && closeness(9,'Bottom') <= .37);
  assert.equal(points(core.stateRating(87,'MLB','completed',2,1),'Final margin'),8);
});

test('persistent postseason stakes outlast transient pregame context while viability gates their carry',()=>{
  const stakes=[{label:'World Series',points:50},{label:'Championship series leverage',points:1}];
  const context={teams:[['Home','HME','1','','','','','','h'],['Away','AWY','3','','','','','','a']],competition:{status:{period:8,type:{detail:'Bottom 8th'}}}};
  const championship=core.stateRating(82,'MLB','live',2,.85,null,context,stakes);
  const ordinary=core.stateRating(82,'MLB','live',2,.85,null,context,[]);
  assert.ok(championship.score >= 58 && championship.score <= 70,`expected viable championship score near 58-65, got ${championship.score}`);
  assert.ok(championship.score > ordinary.score+15);
  assert.equal(championship.factors.filter(item=>item.label==='Persistent postseason stakes').length,1);
  assert.ok(championship.contextWeight < .1,'ordinary pregame context should keep decaying');
  assert.equal(core.stateRating(82,'MLB','live',2,.85,null,context,[]).persistentStakes,0);
  assert.equal(core.contextCarryWeight(.25,'live','MLB',false),.30);
  assert.equal(core.stateRating(82,'MLB','completed',2,1,null,context,stakes).contextWeight,.05);
});

test('late championship stakes collapse when comeback viability is gone and rise with live leverage',()=>{
  const stakes=[{label:'World Series',points:50}];
  const base={teams:[['Home','HME','1','','','','','','h'],['Away','AWY','8','','','','','','a']],competition:{status:{period:9,type:{detail:'Top 9th'}}}};
  const dead=core.stateRating(82,'MLB','live',7,.98,null,base,stakes);
  const deadOrdinary=core.stateRating(82,'MLB','live',7,.98,null,base,[]);
  assert.equal(dead.retainedStakeWeight,0);
  assert.equal(dead.score,deadOrdinary.score);
  const live=core.stateRating(82,'MLB','live',1,.98,null,{teams:[['Home','HME','3','','','','','','h'],['Away','AWY','4','','','','','','a']],competition:{status:{period:9,type:{detail:'Top 9th'}}}},stakes);
  assert.ok(live.score > dead.score+15);
});

test('live event shock rewards major plays briefly and expires after seven plays',()=>{
  const status={period:4,displayClock:'5:00',type:{detail:'4th Quarter'}};
  const play={period:{number:4,displayValue:'4th Quarter'},clock:{displayValue:'5:00'},text:'Interception returned 45 yards for a touchdown'};
  assert.equal(core.eventShockImpact('NFL',{plays:[play]},status).points,10);
  const stale={plays:[play,...Array.from({length:7},(_,i)=>({period:{number:4,displayValue:'4th Quarter'},clock:{displayValue:`4:${59-i}`},text:'Run for no gain'}))]};
  assert.equal(core.eventShockImpact('NFL',stale,status).points,0);
  const blocked={plays:[{...play,text:'Blocked punt returned for a touchdown'}]};
  assert.equal(core.eventShockImpact('CFB',blocked,status).points,12);
  const momentumSummary={
    plays:[play],
    scoringPlays:[
      {period:{number:1,displayValue:'1st Quarter'},clock:{displayValue:'8:00'},homeScore:0,awayScore:7,text:'Touchdown'},
      {period:{number:2,displayValue:'2nd Quarter'},clock:{displayValue:'6:00'},homeScore:7,awayScore:7,text:'Touchdown'},
      {period:{number:3,displayValue:'3rd Quarter'},clock:{displayValue:'4:00'},homeScore:7,awayScore:14,text:'Touchdown'},
      {period:{number:4,displayValue:'4th Quarter'},clock:{displayValue:'5:00'},homeScore:21,awayScore:14,text:'Touchdown'}
    ]
  };
  const live=core.liveSnapshot({sport:'NFL',teams:[],liveRawStatus:status}, {status,situation:{}},momentumSummary);
  assert.ok(core.momentumImpact('NFL',momentumSummary,.8,'live').points>=10);
  assert.equal(live.components.eventShock,10,'recent defensive TD remains fully credited alongside accumulated momentum');
  for (const [sport,text,expected,phase] of [
    ['NFL','Fumble recovered by defense (turnover)',4,'4th Quarter'],
    ['NFL','40 Yd touchdown pass',5,'4th Quarter'],
    ['NFL','Safety',6,'4th Quarter'],
    ['MLB','Grand slam home run',8,'Top 2nd'],
    ['MLB','Go-ahead home run',6,'Top 2nd'],
    ['NBA','Buzzer-beater three ties the game',10,'4th Quarter'],
    ['NHL','Shorthanded goal',6,'1st Period']
  ]) {
    const period=sport==='MLB'?2:sport==='NHL'?1:sport==='NBA'?4:4;
    const gameStatus={period,displayClock:sport==='NHL'?'15:00':'5:00',type:{detail:phase}};
    const summary={plays:[{period:{number:period,displayValue:phase},clock:{displayValue:sport==='NHL'?'15:00':'5:00'},text}]};
    assert.equal(core.eventShockImpact(sport,summary,gameStatus).points,expected,`${sport}: ${text}`);
  }
});

test('NHL event shock ages by remaining-clock chronology',()=>{
  const play={period:{number:1},clock:{displayValue:'19:00'},text:'Shorthanded goal'};
  const summary={plays:[play]};
  const recent=core.eventShockImpact('NHL',summary,{period:1,displayClock:'19:30'}).points;
  const older=core.eventShockImpact('NHL',summary,{period:1,displayClock:'18:30'}).points;
  assert.ok(recent > older);
});

test('event shock recognizes intercepted pass return touchdowns without promoting ordinary interceptions',()=>{
  const status={period:4,displayClock:'5:00',type:{detail:'4th Quarter'}};
  const shock = text => core.eventShockImpact('NFL',{plays:[{
    period:{number:4,displayValue:'4th Quarter'},
    clock:{displayValue:'5:00'},
    text
  }]},status).points;
  assert.equal(shock('Pass intercepted by Ray Lewis and returned 50 yards for a touchdown'),10);
  assert.equal(shock('Pass intercepted by Ray Lewis for a touchdown'),10);
  assert.equal(shock('Interception return for a touchdown'),10);
  assert.equal(shock('Pick-six by Ray Lewis'),10);
  assert.equal(shock('Fumble returned for a touchdown'),10);
  assert.equal(shock('Pass intercepted by Ray Lewis at the BAL 35'),4);
  assert.equal(shock('Blocked kick returned for a touchdown'),12);
});

test('MLB, NHL and NBA playoff series leverage uses series state and carries live',()=>{
  const input=matchup('NBA','NBA Playoffs Game 5',true);
  input.competition.series={summary:'Series tied 2-2'};
  const swing=pregame(input);
  assert.equal(points(swing,'Playoff series leverage'),5);
  assert.ok(core.stateRating(swing.score,'NBA','live',2,.25).factors.some(f=>f.label==='Pregame context carried into play'));
  input.detail='NBA Playoffs Game 6';input.competition.notes=[{headline:input.detail}];input.competition.series.summary='Home leads 3-2';
  assert.equal(points(pregame(input),'Playoff elimination / clinch'),10);
  input.detail='NBA Playoffs Game 7';input.competition.notes=[{headline:input.detail}];input.competition.series.summary='Series tied 3-3';
  assert.equal(points(pregame(input),'Playoff winner-take-all'),16);
  for (const sport of ['MLB','NHL']) {
    const game=matchup(sport,`${sport} Playoffs Game 3`,true);game.competition.series={summary:'Series tied 1-1'};
    assert.ok(points(pregame(game),'Playoff series leverage')>=2);
  }
});

test('NBA comeback runway separates a live four-minute game from eight seconds with leader possession',()=>{
  const teams=[team('Away','AWY',90,'a'),team('Home','HME',96,'b')];
  const atFour=core.stateRating(70,'NBA','live',6,.92,null,{teams,competition:{status:{period:4,displayClock:'4:00'},situation:{possession:'b'}}});
  const atEight=core.stateRating(70,'NBA','live',6,.99,null,{teams,competition:{status:{period:4,displayClock:'0:08'},situation:{possession:'b'}}});
  assert.ok(atFour.basketballState.comebackFeasibility > atEight.basketballState.comebackFeasibility + .7);
  assert.ok(atFour.closePoints >= atEight.closePoints + 8,`${atFour.closePoints} should exceed ${atEight.closePoints} by at least 8`);
  assert.ok(atEight.widePenalty > 0);
  const comebackTeams=[team('Away','AWY',90,'a'),team('Home','HME',102,'b')];
  const downTwelve=core.stateRating(70,'NBA','live',12,.65,null,{teams:comebackTeams,competition:{status:{period:4,displayClock:'8:00'},situation:{possession:'a',timeoutsRemaining:{a:2}}}});
  assert.ok(downTwelve.basketballState.marginClose>=.49);
  assert.equal(downTwelve.widePenalty,0);
  assert.ok(downTwelve.score>=20,`12 down with 8:00 and possession should remain live, got ${downTwelve.score}`);
  const college=core.stateRating(70,'NCAAB','live',12,.8,null,{teams:comebackTeams,competition:{status:{period:2,displayClock:'8:00'},situation:{possession:'a',timeoutsRemaining:{a:2}}}});
  assert.ok(college.basketballState.marginClose>=.49);
  assert.equal(college.widePenalty,0);
});

test('NHL two-goal margin gets tighter late and rises for a trailing extra attacker or power play',()=>{
  const early=core.nhlLiveMarginCloseness(2,.05);
  const late=core.nhlLiveMarginCloseness(2,.98);
  const pulled=core.nhlLiveMarginCloseness(2,.98,{trailingGoaliePulled:true});
  const powerPlay=core.nhlLiveMarginCloseness(2,.98,{trailingPowerPlay:true});
  assert.ok(early>.5 && early<.6);
  assert.ok(late>=.15 && late<=.20);
  assert.ok(pulled>late && powerPlay>late);
  assert.ok(pulled>=.25 && pulled<=.35);
  assert.ok(powerPlay>=.25 && powerPlay<=.35);
});

test('late MLB two-out full-count plate appearances elevate tying run at plate or on deck',()=>{
  const game={sport:'MLB',teams:[team('Away','AWY',1,'a'),team('Home','HME',0,'h')]};
  const competition={competitors:[{homeAway:'away',team:{id:'a'},score:'1'},{homeAway:'home',team:{id:'h'},score:'0'}]};
  const status={period:9,type:{detail:'Bottom 9th'}};
  const atPlate=core.baseballSituationImpact(game,competition,status,{outs:2,count:'3-2',onFirst:false,onSecond:false,onThird:false},.97,1);
  assert.ok(atPlate.points>=7);
  assert.match(atPlate.reasons.join(' '),/full count.*two outs/i);
  assert.match(atPlate.reasons.join(' '),/tying run is at the plate/i);
  competition.competitors[0].score='2';game.teams[0][2]='2';
  const onDeck=core.baseballSituationImpact(game,competition,status,{outs:2,count:'3-2',onFirst:false,onSecond:false,onThird:false,onDeck:true},.97,2);
  assert.ok(onDeck.reasons.some(reason=>/tying run is on deck/i.test(reason)));
  const leadingGame={sport:'MLB',teams:[team('Away','AWY',1,'a'),team('Home','HME',3,'h')]};
  const leadingComp={competitors:[{homeAway:'away',team:{id:'a'},score:'1'},{homeAway:'home',team:{id:'h'},score:'3'}]};
  const leading=core.baseballSituationImpact(leadingGame,leadingComp,status,{outs:2,count:'3-2',onFirst:false,onSecond:true,onThird:false},.97,2);
  assert.ok(!leading.reasons.some(reason=>/tying or go-ahead run is in scoring position/i.test(reason)));
});

test('playoff series clinch stakes use only the highest applicable series factor',()=>{
  const input=matchup('NBA','NBA Playoffs Game 6: clinching opportunity',true);
  input.competition.series={summary:'Home leads 3-2'};
  const rating=pregame(input);
  assert.equal(points(rating,'Playoff elimination / clinch'),10);
  assert.equal(points(rating,'Clinching opportunity'),0);
  assert.equal(rating.factors.filter(item=>/Deciding game|Elimination stakes|Clinching opportunity|Playoff elimination \/ clinch/.test(item.label)).reduce((sum,item)=>sum+item.points,0),10);
});
