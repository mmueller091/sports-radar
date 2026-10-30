import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {loadCore} from '../calibration/helpers.mjs';

const require = createRequire(import.meta.url);
const shadow = require('../calibration/shadow-candidate.cjs');
const core = await loadCore();

function competition({home=24,away=24,period=4,clock='8:00',possession='a',spot='HME 40',down=2,distance=6}={}) {
  return {
    status:{period,displayClock:clock,type:{state:'in',completed:false,detail:`${clock} - ${period}th Quarter`}},
    competitors:[
      {homeAway:'home',score:String(home),team:{id:'h',displayName:'Home',abbreviation:'HME'},records:[{type:'total',summary:'7-2'}]},
      {homeAway:'away',score:String(away),team:{id:'a',displayName:'Away',abbreviation:'AWY'},records:[{type:'total',summary:'7-2'}]}
    ],
    situation:{possession,down,distance,possessionText:spot,downDistanceText:`${down} & ${distance} at ${spot}`}
  };
}

function liveGame(comp,event={name:'Ordinary matchup',season:{type:2}},probability=.5,summaryExtra={}) {
  const teams = comp.competitors.map(item => ({
    id:item.team.id,name:item.team.displayName,abbr:item.team.abbreviation,score:item.score,
    homeAway:item.homeAway,records:item.records,team:item.team
  }));
  const rating = core.rateGame('NFL','live',teams,event,comp,event.name);
  const game = {
    sport:'NFL',state:'live',openingScore:rating.openingScore,openingFactors:rating.openingFactors,
    baseScore:rating.score,score:rating.score,factors:rating.factors,underdog:rating.underdog,
    liveRawStatus:comp.status,liveRawSituation:comp.situation,
    teams:teams.map(team => [team.name,team.abbr,team.score,'','','',null,team.homeAway,team.id])
  };
  const summary = {
    header:{competitions:[comp]},
    winprobability:[{homeWinPercentage:probability}],
    ...summaryExtra
  };
  core.applyLiveSnapshot(game,comp,summary);
  return {game,summary,candidate:shadow.candidateGameRating(core,game,comp,summary)};
}

test('perfectly close 50/50 counterfactual keeps tension stable and generic time capped', () => {
  const progressValues = [.20,.40,.55,.65,.75,.85,.95];
  const rows = progressValues.map(progress => {
    const result = shadow.candidateStateRating(core,38,'NFL','live',0,progress,.5);
    return {progress,tension:result.currentTensionPoints,leverage:result.genericLeveragePoints};
  });
  assert.deepEqual(rows.map(row => row.tension),[34,34,34,34,34,34,34]);
  assert.deepEqual(rows.map(row => row.leverage),[0,0,0,1,4,7,8]);
  assert.equal(rows.at(-1).leverage-rows[0].leverage,shadow.GENERIC_LEVERAGE_CAP);
});

test('excellent early game can rate strongly without generic time help', () => {
  const strongComp = competition({home:21,away:21,period:1,clock:'4:00',down:4,distance:1,spot:'HME 2'});
  strongComp.situation.isGoalToGo = true;
  strongComp.situation.isRedZone = true;
  const action = [{id:'p1',period:{number:1},clock:{displayValue:'4:01'},text:'Interception returned to the two yard line'}];
  const strong = liveGame(
    strongComp,
    {name:'Conference Championship rivalry',season:{type:3}},
    .5,
    {plays:action}
  ).candidate;
  const ordinary = liveGame(competition({home:21,away:21,period:1,clock:'4:00'}),{},.5).candidate;
  assert.equal(strong.genericLeveragePoints,0);
  assert.equal(strong.currentTensionPoints,34);
  assert.ok(strong.live.components.situation > 0 || strong.live.components.eventShock > 0);
  assert.ok(strong.score >= ordinary.score+15,{strong:strong.score,ordinary:ordinary.score});
});

test('false-close WP materially separates genuine uncertainty at early and late phases', () => {
  for (const progress of [.25,.95]) {
    const even = shadow.candidateStateRating(core,20,'NFL','live',3,progress,.5);
    const falseClose = shadow.candidateStateRating(core,20,'NFL','live',3,progress,.9);
    assert.ok(even.currentTensionPoints >= falseClose.currentTensionPoints+8,{progress,even,falseClose});
  }
});

test('ordinary late close game is not elite from lateness alone and awards no WP bonus', () => {
  const result = liveGame(competition({home:24,away:21,period:4,clock:'1:30',possession:'h'}),{},.5).candidate;
  assert.ok(result.score < 80,result);
  assert.equal(result.live.components.probability,0);
  assert.equal(result.live.probabilityTelemetry.awardedPoints,0);
  assert.ok(result.live.probabilityTelemetry.points > 0,'legacy WP value remains explanatory telemetry');
});

test('actual late winning drive remains highly urgent through football situation logic', () => {
  const comp = competition({home:24,away:19,period:4,clock:'1:50',possession:'a',spot:'HME 15'});
  comp.situation.isRedZone = true;
  const result = liveGame(comp,{},.8).candidate;
  assert.ok(result.live.sportImpact.decisiveDrive,'expected decisive drive metadata');
  assert.ok(result.live.aggregation.driveFloor >= 18,result.live.aggregation);
  assert.ok(result.liveBonus >= result.live.aggregation.driveFloor,result);
  assert.ok(result.score >= 70,result);
  assert.equal(result.live.components.probability,0);
});

test('late blowout remains low despite maximum progress', () => {
  const close = shadow.candidateStateRating(core,20,'NFL','live',3,.95,.5);
  const blowout = shadow.candidateStateRating(core,20,'NFL','live',28,.95,.99);
  assert.ok(blowout.score <= close.score-25,{close:close.score,blowout:blowout.score});
  assert.ok(blowout.currentTensionPoints <= 2,blowout);
  assert.ok(blowout.genericLeveragePoints <= 1,blowout);
});
