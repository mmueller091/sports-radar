import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCore} from '../calibration/helpers.mjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

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

test('a verified upset bonus follows the latest score after the favorite retakes the lead',() => {
  const old = competition(21,24,'3:00');
  old.odds = [{pointSpread:{home:{close:{line:'-10'}},away:{close:{line:'+10'}}}}];
  const game = gameFromCompetition(old,'NFL');
  assert.ok(game.upsetPoints >= 15);
  const current = competition(28,24,'1:00');
  core.applyLiveSnapshot(game,current,summary(current,.8));
  assert.ok(game.upsetPoints > 0 && game.upsetPoints < 15);
  assert.equal(game.factors.find(item => item.label === 'Underdog threatens upset')?.points,game.upsetPoints);
  assert.equal(game.baseScore,core.stateRating(
    game.openingScore,'NFL','live',4,core.gameProgress('NFL',current)
  ).score + game.upsetPoints);
  const withoutBall = game.upsetPoints;
  const withBall = {...current,situation:{possession:'a',possessionText:'AWY 35'}};
  core.applyLiveSnapshot(game,withBall,summary(withBall,.8));
  assert.ok(game.upsetPoints > withoutBall,'possession change should affect the current snapshot');
});

test('a large CFB underdog retains live upset threat according to margin, possession, and runway',() => {
  const points = (away,home,possession,clock='2:00',spot='AWY 35') => {
    const comp = competition(home,away,clock);
    comp.competitors[1].team.displayName = 'Underdog';
    comp.odds = [{pointSpread:{home:{close:{line:'-17'}},away:{close:{line:'+17'}}}}];
    comp.situation = {possession,possessionText:spot};
    const teams = comp.competitors.map(item => ({id:item.team.id,score:item.score}));
    return core.rateGame('CFB','live',teams,{name:'Underdog at Home'},comp,'').upsetPoints;
  };
  const sequence = [
    points(27,24,'h'),
    points(27,27,'a'),
    points(27,29,'a'),
    points(27,29,'h'),
    points(27,36,'a'),
    points(27,44,'h','0:45')
  ];
  assert.ok(sequence[0] > sequence[1]);
  assert.ok(sequence[1] >= 10);
  assert.ok(sequence[2] >= sequence[1] - 3);
  assert.ok(sequence[2] > sequence[3]);
  assert.ok(sequence[3] > sequence[4]);
  assert.ok(sequence[4] > 0);
  assert.equal(sequence[5],0);
  assert.ok(Math.abs(points(27,30,'a') - points(27,31,'a')) <= 2);
  assert.ok(Math.abs(points(27,35,'a') - points(27,36,'a')) <= 2);
  assert.ok(points(27,29,'a','2:00','HME 15') > points(27,29,'a','2:00','AWY 15'));
  const nfl = competition(29,27,'2:00');
  nfl.situation = {possession:'a',possessionText:'AWY 35'};
  nfl.odds = [{pointSpread:{home:{close:{line:'-10'}},away:{close:{line:'+10'}}}}];
  assert.ok(core.rateGame('NFL','live',nfl.competitors.map(item => ({id:item.team.id,score:item.score})),{},nfl,'').upsetPoints > 0);
  const completed = competition(24,27,'0:00');
  completed.odds = [{pointSpread:{home:{close:{line:'-17'}},away:{close:{line:'+17'}}}}];
  const teams = completed.competitors.map(item => ({id:item.team.id,score:item.score}));
  assert.equal(core.rateGame('CFB','completed',teams,{},completed,'').upsetPoints,22);
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

test('a lagging summary retains compatible verified enrichment without rewinding the scoreboard',() => {
  const eventFor = (clock='5:18') => ({id:'summary-lag',competitions:[{
    ...competition(16,14,clock,2),
    situation:{possession:'h',down:2,distance:1,isGoalToGo:true,isRedZone:true,possessionText:'AWY 1'}
  }]});
  const first = normalizeEvent(eventFor(),'CFB');
  const fresh = summary(eventFor().competitions[0],.82,[{id:'p',homeScore:16,awayScore:14,period:{number:2},clock:{displayValue:'5:18'}}]);
  fresh.winprobability[0].playId = 'p';
  enrichGame(first,fresh);
  const enriched = first.score;

  const advancedEvent = eventFor('5:05');
  const middle = normalizeEvent(advancedEvent,'CFB');
  enrichGame(middle,fresh,first);
  assert.deepEqual(middle.teams.map(team => team[2]),['14','16']);
  assert.match(middle.status,/5:05/);
  assert.ok(middle.score >= enriched - 8,`stale refresh collapsed ${enriched} to ${middle.score}`);
  assert.equal(middle.staleEnrichment,true);

  const caughtUp = normalizeEvent(advancedEvent,'CFB');
  const current = summary(advancedEvent.competitions[0],.82,[{id:'p2',homeScore:16,awayScore:14,period:{number:2},clock:{displayValue:'5:05'}}]);
  current.winprobability[0].playId = 'p2';
  enrichGame(caughtUp,current,middle);
  assert.ok(Math.abs(caughtUp.score - middle.score) <= 10);
  assert.equal(caughtUp.staleEnrichment,undefined);
});

test('a genuine score change is not protected by stale-enrichment carryover',() => {
  const eventFor = (home,away,clock) => ({id:'real-score-change',competitions:[competition(home,away,clock,4)]});
  const first = normalizeEvent(eventFor(24,24,'2:00'),'NFL');
  enrichGame(first,summary(eventFor(24,24,'2:00').competitions[0],.8));
  const changed = normalizeEvent(eventFor(24,42,'1:45'),'NFL');
  enrichGame(changed,summary(eventFor(24,24,'2:00').competitions[0],.8),first);
  assert.deepEqual(changed.teams.map(team => team[2]),['42','24']);
  assert.equal(changed.staleEnrichment,undefined);
  assert.ok(changed.score < first.score - 8);
});

test('football goal-line leverage is directional and CFB underdogs transition continuously through +10',() => {
  const game = {sport:'CFB',teams:[['FAU','FAU','16','','','','','','h'],['Rice','RICE','14','','','','','','a']]};
  const leadingFavorite = core.footballSituationImpact(game,{}, {period:2,displayClock:'5:18'}, {possession:'h',down:2,distance:1,isGoalToGo:true,isRedZone:true,possessionText:'RICE 1'},.37,2);
  const trailing = core.footballSituationImpact({...game,teams:[['FAU','FAU','14','','','','','','h'],['Rice','RICE','16','','','','','','a']]},{}, {period:2,displayClock:'5:18'}, {possession:'h',down:2,distance:1,isGoalToGo:true,isRedZone:true,possessionText:'RICE 1'},.37,2);
  assert.equal(leadingFavorite.points,0);
  assert.ok(trailing.points >= 5);
  const comp = {competitors:[{homeAway:'home',team:{id:'h'}},{homeAway:'away',team:{id:'a'}}]};
  const odds = line => ({pointSpread:{home:{close:{line:`-${line}`}},away:{close:{line:`+${line}`}}}});
  const at95 = core.underdogCandidate('CFB',comp,odds(9.5));
  const at10 = core.underdogCandidate('CFB',comp,odds(10));
  assert.ok(at95.activation > 0 && at95.activation < at10.activation);
  const teams = [{id:'h',score:'14'},{id:'a',score:'21'}];
  assert.ok(core.upsetImpact(at10,teams,'live',.6).points - core.upsetImpact(at95,teams,'live',.6).points <= 3);
});
