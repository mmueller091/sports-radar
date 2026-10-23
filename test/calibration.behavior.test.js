import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../calibration/helpers.mjs';

const core = await loadCore();

function team(name, abbr, score, id) {
  const t = [name, abbr, String(score), '', '', '', null, '', String(id)];
  t.score = String(score);
  t.id = String(id);
  return t;
}

test('win probability: late 50/50 is much more exciting than late 97/3', () => {
  const even = core.winProbabilityImpact({winprobability:[{homeWinPercentage:.50}]}, .95, 'live');
  const nearlyOver = core.winProbabilityImpact({winprobability:[{homeWinPercentage:.97}]}, .95, 'live');
  assert.ok(even.points >= 14, `expected strong even-game bonus, got ${even.points}`);
  assert.ok(nearlyOver.points <= 0, `expected no bonus or a penalty at 97/3, got ${nearlyOver.points}`);
  assert.ok(even.points - nearlyOver.points >= 12, `expected a large separation, got ${even.points} vs ${nearlyOver.points}`);
});

test('pregame context decays hard as the game progresses', () => {
  assert.equal(core.contextCarryWeight(0, 'live'), .38);
  assert.equal(core.contextCarryWeight(.5, 'live'), .20);
  assert.equal(core.contextCarryWeight(.9, 'live'), .08);
  assert.equal(core.contextCarryWeight(1, 'completed'), .05);
});

test('NFL: late 4th-and-goal is much more leveraged than early 4th-and-long at midfield', () => {
  const game = {sport:'NFL', teams:[team('Ravens','BAL',24,'33'),team('Bengals','CIN',28,'4')]};
  const early = core.footballSituationImpact(game, {}, {period:1,displayClock:'10:00'}, {possession:'33',down:4,distance:8,downDistanceText:'4th & 8 at 50',possessionText:'50'}, .08, 4);
  const late = core.footballSituationImpact(game, {}, {period:4,displayClock:'0:38'}, {possession:'33',down:4,distance:2,downDistanceText:'4th & Goal at CIN 2',possessionText:'CIN 2',isRedZone:true,isGoalToGo:true}, .99, 4);
  assert.ok(late.points >= 10, `expected near-max leverage, got ${late.points}`);
  assert.ok(late.points >= early.points + 7, `expected large separation, got ${late.points} vs ${early.points}`);
});

test('football live phase labels overtime instead of a fifth quarter', () => {
  assert.match(core.livePhase('CFB',{period:4,displayClock:'1:15'}),/4th quarter$/);
  assert.equal(core.livePhase('CFB',{period:5,type:{detail:'5th Quarter'}}),'OT');
  assert.equal(core.livePhase('CFB',{period:6,type:{detail:'6th Quarter'}}),'2OT');
  assert.match(core.livePhase('NFL',{period:5,displayClock:'8:32'}),/8:32 .* OT/);
});

test('MLB: tied bottom 9 with runner on third outranks tied bottom 9 bases empty', () => {
  const game = {sport:'MLB', teams:[team('Away','AWY',4,'a'),team('Home','HME',4,'h')]};
  const competition = {competitors:[{homeAway:'away',team:{id:'a'},score:'4'},{homeAway:'home',team:{id:'h'},score:'4'}]};
  const status = {period:9,type:{detail:'Bottom 9th'}};
  const empty = core.baseballSituationImpact(game, competition, status, {outs:1,onFirst:false,onSecond:false,onThird:false}, .97, 0);
  const runnerThird = core.baseballSituationImpact(game, competition, status, {outs:1,onFirst:false,onSecond:false,onThird:true}, .97, 0);
  assert.ok(runnerThird.points >= 10, `expected high leverage, got ${runnerThird.points}`);
  assert.ok(runnerThird.points > empty.points, `runner on third should outrank bases empty: ${runnerThird.points} vs ${empty.points}`);
});

test('NHL: goalie pulled in a one-goal late game adds urgency', () => {
  const game = {sport:'NHL',teams:[team('Capitals','WSH',2,'23'),team('Penguins','PIT',3,'16')]};
  const withGoalie = {onIce:[{teamId:'23',entries:[{athleteid:'g1'},{athleteid:'a'},{athleteid:'b'},{athleteid:'c'},{athleteid:'d'},{athleteid:'e'}]},{teamId:'16',entries:[{athleteid:'g2'},{athleteid:'f'},{athleteid:'g'},{athleteid:'h'},{athleteid:'i'},{athleteid:'j'}]}],boxscore:{players:[{team:{id:'23'},statistics:[{name:'goalies',athletes:[{athlete:{id:'g1'}}]}]},{team:{id:'16'},statistics:[{name:'goalies',athletes:[{athlete:{id:'g2'}}]}]}]}};
  const pulled = structuredClone(withGoalie);
  pulled.onIce[0].entries = [{athleteid:'a'},{athleteid:'b'},{athleteid:'c'},{athleteid:'d'},{athleteid:'e'},{athleteid:'x'}];
  const status = {period:3,displayClock:'1:10',type:{detail:'1:10 - 3rd Period'}};
  const normal = core.hockeySituationImpact(game, {}, withGoalie, status, .97, 1);
  const extraAttacker = core.hockeySituationImpact(game, {}, pulled, status, .97, 1);
  assert.ok(extraAttacker.points >= normal.points, `${extraAttacker.points} should be >= ${normal.points}`);
  assert.match(extraAttacker.reasons.join(' '), /pulled the goalie/i);
});

test('NBA: potential final tying/go-ahead possession outranks same margin with four minutes left', () => {
  const game = {sport:'NBA',teams:[team('Away','AWY',101,'a'),team('Home','HME',103,'h')]};
  const fourMinutes = core.basketballSituationImpact(game,{period:4,displayClock:'4:00'},.82,2,{possession:'a'});
  const twelveSeconds = core.basketballSituationImpact(game,{period:4,displayClock:'0:12'},.995,2,{possession:'a'});
  assert.ok(twelveSeconds.points > fourMinutes.points, `${twelveSeconds.points} should be > ${fourMinutes.points}`);
  assert.match(twelveSeconds.reasons.join(' '), /tying or go-ahead final possession/i);
});

test('Tennis: match point outranks ordinary deuce', () => {
  const game = {sport:'Tennis',teams:[team('Player A','A',2,'a'),team('Player B','B',2,'b')]};
  const status = {period:5,type:{detail:'5th Set'}};
  const deuce = core.tennisSituationImpact(game,{situation:{description:'Deuce'}},{},status,.92);
  const matchPoint = core.tennisSituationImpact(game,{situation:{description:'Match Point',matchPoint:true}},{},status,.92);
  assert.ok(matchPoint.points > deuce.points, `${matchPoint.points} should be > ${deuce.points}`);
  assert.ok(matchPoint.points >= 10);
});

test('momentum categories respect live and completed caps', () => {
  const summary = {header:{competitions:[{competitors:[{homeAway:'away',team:{displayName:'Away'}},{homeAway:'home',team:{displayName:'Home'}}]}]},scoringPlays:[
    {period:{number:1},clock:{displayValue:'5:00'},homeScore:0,awayScore:7},
    {period:{number:2},clock:{displayValue:'5:00'},homeScore:0,awayScore:14},
    {period:{number:3},clock:{displayValue:'5:00'},homeScore:14,awayScore:14},
    {period:{number:4},clock:{displayValue:'5:00'},homeScore:14,awayScore:21},
    {period:{number:4},clock:{displayValue:'0:30'},homeScore:28,awayScore:21}
  ],winprobability:[{homeWinPercentage:.15},{homeWinPercentage:.85},{homeWinPercentage:.2},{homeWinPercentage:.8},{homeWinPercentage:.52}]};
  assert.ok(core.momentumImpact('NFL',summary,.99,'live').points <= 15);
  assert.ok(core.momentumImpact('NFL',summary,1,'completed').points <= 25);
});

test('specific game stakes distinguish deciding and aggregate-pressure games', () => {
  const gameSeven = core.specificStakesFactors('NHL','Stanley Cup Playoffs - Game 7');
  const aggregate = core.specificStakesFactors('Soccer','Second leg, 2-2 on aggregate');
  assert.equal(gameSeven.find(factor => factor.label === 'Deciding game')?.points,12);
  assert.equal(aggregate.find(factor => factor.label === 'Close aggregate tie')?.points,7);
});

test('decisive final scores count while late consolation scores do not', () => {
  const decisive = core.momentumImpact('NBA',{scoringPlays:[
    {period:{number:4},clock:{displayValue:'0:18'},homeScore:99,awayScore:100},
    {period:{number:4},clock:{displayValue:'0:02'},homeScore:101,awayScore:100,text:'Home makes winning shot'}
  ]},1,'completed');
  const consolation = core.momentumImpact('NBA',{scoringPlays:[
    {period:{number:4},clock:{displayValue:'0:18'},homeScore:95,awayScore:110},
    {period:{number:4},clock:{displayValue:'0:02'},homeScore:97,awayScore:110,text:'Home makes late shot'}
  ]},1,'completed');
  assert.ok(decisive.factors.some(factor => factor.label === 'Decisive final score'));
  assert.ok(!consolation.factors.some(factor => factor.label === 'Decisive final score'));
  assert.ok(decisive.points > consolation.points);
});

test('repeated win-probability reversals are recognized without double-counting score lead changes', () => {
  const result = core.momentumImpact('NFL',{winprobability:[
    {homeWinPercentage:.22},{homeWinPercentage:.71},{homeWinPercentage:.29},{homeWinPercentage:.76}
  ]},.9,'live');
  assert.ok(result.factors.some(factor => factor.label === 'Repeated swings in control'));
});

test('recent dangerous chances add pressure only to a close hockey or soccer game', () => {
  const summary = {plays:[
    {text:'Shot on goal saved by the goalkeeper'},
    {text:'Breakaway saved by the goalkeeper'},
    {text:'Shot hit the post'},
    {text:'Close range shot saved by the goalkeeper'}
  ]};
  const close = core.dangerousChanceImpact('NHL',summary,.85,1);
  const blowout = core.dangerousChanceImpact('NHL',summary,.85,4);
  assert.ok(close.points >= 5);
  assert.equal(blowout.points,0);
});

test('sport-specific consequences and rare performances are scored conservatively', () => {
  const soccer = core.soccerSituationImpact(
    {notes:[{headline:'Second leg, 2-2 on aggregate'}]},
    {boxscore:{teams:[{statistics:[{name:'redCards',value:1}]}]}},
    {type:{detail:'90+3 - Second Half'}},
    .98,
    1
  );
  assert.ok(soccer.points >= 10);
  assert.match(soccer.reasons.join(' '),/aggregate/i);

  const basketball = core.basketballScoringMilestone({boxscore:{players:[{statistics:[{
    labels:['MIN','PTS'],
    athletes:[{athlete:{displayName:'Scoring Star'},stats:['38','52']}]
  }]}]}},'NBA');
  assert.equal(basketball.points,12);

  const baseball = core.baseballPerformanceMilestone({boxscore:{players:[{statistics:[{
    name:'batting',
    labels:['AB','HR'],
    athletes:[{athlete:{displayName:'Slugger'},stats:['4','3']}]
  }]}]}});
  assert.equal(baseball.points,12);
});

test('source-backed quality and starter factors flow into pregame scoring', () => {
  const event = {sportsRadarContextFactors:[
    {type:'elite_efficiency_profile',verified:true,confidence:.9,text:'Both teams rank in the top five in adjusted efficiency.'},
    {type:'confirmed_key_starters',verified:true,confidence:.9,text:'Both starting quarterbacks are confirmed.'},
    {type:'strength_of_schedule',verified:false,confidence:.9,text:'Unverified schedule claim.'}
  ]};
  const factors = core.pregameContextFactors(event,{});
  assert.equal(factors.find(factor => factor.contextType === 'elite_efficiency_profile')?.points,4);
  assert.equal(factors.find(factor => factor.contextType === 'confirmed_key_starters')?.points,4);
  assert.ok(!factors.some(factor => factor.contextType === 'strength_of_schedule'));
});
