import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCore} from '../calibration/helpers.mjs';

const core = await loadCore();

function competition(home=100,away=103,clock='4:00',period=4) {
  return {
    status:{period,displayClock:clock,type:{state:'in',detail:`${clock} - Quarter ${period}`}},
    competitors:[
      {homeAway:'home',team:{id:'h',displayName:'Home',abbreviation:'HME'},score:String(home)},
      {homeAway:'away',team:{id:'a',displayName:'Away',abbreviation:'AWY'},score:String(away)}
    ]
  };
}

function gameFromCompetition(comp,sport='NBA',worker=false,event={}) {
  const objects = comp.competitors.map(item => ({
    id:item.team.id,name:item.team.displayName,abbr:item.team.abbreviation,score:item.score
  }));
  const rating = core.rateGame(sport,'live',objects,event,comp,'');
  const game = {
    id:'live-fixture',sport,state:'live',
    teams:objects.map(item => [item.name,item.abbr,item.score,'','','',null,'',item.id]),
    baseScore:rating.score,score:rating.score,
    liveRawStatus:comp.status,liveRawSituation:comp.situation
  };
  if (!worker) Object.assign(game,{
    openingScore:rating.openingScore,factors:rating.factors,
    underdog:rating.underdog,upsetPoints:rating.upsetPoints
  });
  return game;
}

function summary(comp,probability=.5,plays=[]) {
  return {header:{competitions:[comp]},winprobability:[{homeWinPercentage:probability}],plays};
}

test('fresh live summaries update scores by team ID and rebuild the base rating once',() => {
  const old = competition(90,105,'8:00');
  const game = gameFromCompetition(old);
  const current = competition(104,105,'0:12');
  current.competitors.reverse();
  current.situation = {possession:'h'};
  const details = summary(current);
  core.applyLiveSnapshot(game,current,details);
  assert.deepEqual(game.teams.map(team => team[2]),['104','105']);
  const expected = core.stateRating(game.openingScore,'NBA','live',1,core.gameProgress('NBA',current),null,{competition:current,teams:game.teams,situation:current.situation,summary:details});
  assert.equal(game.baseScore,expected.score);
  assert.equal(game.factors.reduce((sum,item) => sum + item.points,0),game.baseScore);
  assert.match(game.why,/1-point game late/);
  assert.match(game.live.phase,/0:12/);
  assert.match(game.live.reasons.join(' '),/final possession/i);
  const once = game.score;
  core.applyLiveSnapshot(game,current,details);
  assert.equal(game.score,once,'reapplying a snapshot must not accumulate bonuses');
});

test('browser and minimal Worker adapters retain the same opening context when rebasing',() => {
  const event = {sportsRadarContextFactors:[{
    type:'rivalry',verified:true,confidence:.9,text:'A confirmed rivalry.'
  }]};
  const old = competition(90,105,'8:00');
  const browser = gameFromCompetition(old,'NBA',false,event);
  const worker = gameFromCompetition(old,'NBA',true,event);
  const current = competition(104,105,'0:12');
  core.applyLiveSnapshot(browser,current,summary(current));
  core.applyLiveSnapshot(worker,current,summary(current));
  assert.equal(worker.openingScore,browser.openingScore);
  assert.equal(worker.baseScore,browser.baseScore);
  assert.equal(worker.score,browser.score);
});

test('an older summary cannot rewind the live score or inject stale predictions',() => {
  const current = competition(104,105,'0:12');
  const game = gameFromCompetition(current);
  const old = competition(90,105,'8:00');
  core.applyLiveSnapshot(game,old,summary(old,.99));
  assert.deepEqual(game.teams.map(team => team[2]),['104','105']);
  assert.match(game.live.phase,/0:12/);
  assert.equal(game.live.winProbability,null);
});

test('a final summary cannot supply terminal win probability to a still-live scoreboard',() => {
  const current = competition(120,123,'0:12');
  const game = gameFromCompetition(current);
  const final = competition(120,123,'0:00');
  final.status.type = {state:'post',completed:true,detail:'Final'};
  core.applyLiveSnapshot(game,final,summary(final,0));
  assert.equal(game.state,'live');
  assert.match(game.live.phase,/0:12/);
  assert.equal(game.live.winProbability,null);
  assert.equal(game.live.components.probability,0);
  assert.doesNotMatch(game.live.reasons.join(' '),/0%|100%|one-sided/);
});

test('probability linked to an earlier score, old clock, or end-game play is ignored',() => {
  const current = competition(104,105,'0:12');
  for (const play of [
    {homeScore:90,awayScore:105,clock:{displayValue:'0:13'}},
    {homeScore:104,awayScore:105,clock:{displayValue:'8:00'}},
    {homeScore:104,awayScore:105,clock:{displayValue:'0:12'},text:'End of Game'}
  ]) {
    const details = summary(current,.99,[{id:'p',period:{number:4},...play}]);
    details.winprobability[0].playId = 'p';
    const game = gameFromCompetition(current);
    core.applyLiveSnapshot(game,current,details);
    assert.equal(game.live.winProbability,null);
    assert.equal(game.live.components.probability,0);
  }
});

test('a current one-sided prediction remains valid in a close game, with a bounded penalty',() => {
  const current = competition(104,105,'0:12');
  const details = summary(current,.99,[{
    id:'p',homeScore:104,awayScore:105,period:{number:4},clock:{displayValue:'0:12'}
  }]);
  details.winprobability[0].playId = 'p';
  const game = gameFromCompetition(current);
  core.applyLiveSnapshot(game,current,details);
  assert.equal(game.live.winProbability,.99);
  assert.ok(game.live.components.probability >= -8);
  assert.ok(game.live.components.probability <= 0);
  const even = gameFromCompetition(current);
  core.applyLiveSnapshot(even,current,summary(current));
  assert.ok(even.score > game.score);
});

test('a verified upset bonus follows the latest score and is removed after the favorite retakes the lead',() => {
  const old = competition(21,24,'3:00');
  old.odds = [{pointSpread:{home:{close:{line:'-10'}},away:{close:{line:'+10'}}}}];
  const game = gameFromCompetition(old,'NFL');
  assert.ok(game.upsetPoints >= 15);
  const current = competition(28,24,'1:00');
  core.applyLiveSnapshot(game,current,summary(current,.8));
  assert.equal(game.upsetPoints,0);
  assert.ok(!game.factors.some(item => item.label === 'Underdog threatens upset'));
  assert.equal(game.baseScore,core.stateRating(
    game.openingScore,'NFL','live',4,core.gameProgress('NFL',current)
  ).score);
});

test('lead-change weight falls as a live game moves beyond the scoring swing',() => {
  const details = {scoringPlays:[
    {homeScore:0,awayScore:7,period:{number:1},clock:{displayValue:'5:00'}},
    {homeScore:10,awayScore:7,period:{number:2},clock:{displayValue:'15:00'}}
  ]};
  const leadPoints = (progress,state='live') => core.momentumImpact('NFL',details,progress,state)
    .factors.find(item => /lead change/.test(item.label))?.points;
  assert.equal(leadPoints(.3),3);
  assert.equal(leadPoints(.45),2);
  assert.equal(leadPoints(.8),1);
  assert.equal(leadPoints(1,'completed'),3);
});

test('routine fourth downs in a blowout receive less weight than a late fourth-and-goal',() => {
  const game = {sport:'NFL',teams:[['Home','HME','28','','','','','','h'],['Away','AWY','7','','','','','','a']]};
  const blowout = core.footballSituationImpact(game,{},
    {period:4,displayClock:'1:00'},
    {possession:'a',down:4,distance:1,downDistanceText:'4th & 1',possessionText:'AWY 25'},.98,21);
  assert.equal(blowout.points,1);
  assert.doesNotMatch(blowout.reasons.join(' '),/pivotal/);
  const close = core.footballSituationImpact(game,{},
    {period:4,displayClock:'1:00'},
    {possession:'a',down:4,distance:1,downDistanceText:'4th & Goal',isGoalToGo:true,isRedZone:true},.98,4);
  assert.ok(close.points >= 10);
});

test('tennis adapters without athlete IDs still receive live point-state bonuses',() => {
  const old = {
    status:{period:3,type:{state:'in',detail:'Third set'}},
    competitors:[
      {athlete:{id:'p1',displayName:'Player One'},score:'1'},
      {athlete:{id:'p2',displayName:'Player Two'},score:'0'}
    ]
  };
  const objects = old.competitors.map(item => ({id:'',name:item.athlete.displayName,score:item.score}));
  const rating = core.rateGame('Tennis','live',objects,{},old,'');
  const game = {
    sport:'Tennis',state:'live',baseScore:rating.score,
    liveRawStatus:old.status,
    teams:objects.map(item => [item.name,'',item.score,'','','','','',''])
  };
  const current = structuredClone(old);
  current.competitors[1].score = '1';
  current.competitors.reverse();
  current.situation = {matchPoint:true};
  core.applyLiveSnapshot(game,current,{header:{competitions:[current]}});
  assert.deepEqual(game.teams.map(team => team[2]),['1','1']);
  assert.equal(game.live.components.situation,12);
  assert.match(game.live.reasons.join(' '),/match point/);
});

test('a summary for different teams cannot replace the scoreboard state',() => {
  const old = competition(104,105,'0:12');
  const game = gameFromCompetition(old);
  const unrelated = competition(130,90,'0:01');
  unrelated.competitors[0].team.id = 'another-team';
  core.applyLiveSnapshot(game,unrelated,summary(unrelated,.99));
  assert.deepEqual(game.teams.map(team => team[2]),['104','105']);
  assert.equal(game.live.winProbability,null);
});
