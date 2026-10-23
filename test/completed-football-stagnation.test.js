import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCore } from '../calibration/helpers.mjs';

const core = await loadCore();

function teamStats(yardsPerPlay, thirdDownEff, redZoneAttempts, defensiveTouchdowns = 0) {
  return {statistics:[
    {name:'yardsPerPlay',value:yardsPerPlay},
    {name:'thirdDownEff',displayValue:thirdDownEff},
    {name:'redZoneAttempts',displayValue:redZoneAttempts},
    {name:'defensiveTouchdowns',value:defensiveTouchdowns}
  ]};
}

function fieldGoal(period,clock,homeScore,awayScore) {
  return {period:{number:period},clock:{displayValue:clock},homeScore,awayScore,text:'Field goal is good',type:{text:'Field Goal'}};
}

function coltsBroncosSummary() {
  return {
    header:{competitions:[{competitors:[
      {homeAway:'away',score:'12',team:{displayName:'Indianapolis Colts'}},
      {homeAway:'home',score:'9',team:{displayName:'Denver Broncos'}}
    ]}]},
    pickcenter:[{overUnder:42}],
    boxscore:{
      teams:[teamStats(4.2,'3-15','0-3'),teamStats(4.3,'3-16','0-3')],
      players:[{statistics:[{name:'punting',athletes:[{stats:['6']}]}]},
        {statistics:[{name:'punting',athletes:[{stats:['6']}]}]}]
    },
    scoringPlays:[
      fieldGoal(1,'3:00',3,0),fieldGoal(2,'6:00',3,3),
      fieldGoal(2,'0:30',6,3),fieldGoal(3,'7:00',6,6),
      fieldGoal(4,'2:00',9,6),fieldGoal(4,'0:05',9,9),
      fieldGoal(5,'0:00',9,12)
    ],
    plays:[1,2,3,4].map(() => ({period:{number:2},text:'Pass intercepted, no return'})),
    winprobability:[{homeWinPercentage:.52},{homeWinPercentage:.48},{homeWinPercentage:.55},
      {homeWinPercentage:.46},{homeWinPercentage:.53},{homeWinPercentage:.44},
      {homeWinPercentage:.51},{homeWinPercentage:.49}]
  };
}

function finalScore(summary,state='completed') {
  const competition = {status:{type:{detail:'Final/OT'}},competitors:summary.header.competitions[0].competitors};
  const teams = competition.competitors.map(item => ({score:item.score}));
  const base = core.rateGame('NFL',state,teams,{name:'Colts at Broncos'},competition,'').score;
  const momentum = core.momentumImpact('NFL',summary,1,state);
  // The app awards its separate final-play bonus for an OT field goal at 0:00.
  return {score:core.clampScore(base + momentum.points + (state === 'completed' ? 14 : 0)),momentum};
}

test('Colts-Broncos 2022 OT: whole-game offensive failure survives late drama', () => {
  const result = finalScore(coltsBroncosSummary());
  assert.ok(result.score >= 60 && result.score <= 70, `expected 60-70, got ${result.score}`);
  assert.ok(result.momentum.factors.some(f => f.label === 'Offensive stagnation' && f.points <= -20));
});

test('defensive playmaking offsets stagnation in a low-scoring slugfest', () => {
  const quiet = coltsBroncosSummary();
  const exciting = structuredClone(quiet);
  exciting.plays = [
    {period:{number:1},text:'Quarterback sacked for a loss'},
    {period:{number:2},text:'Pass intercepted, returned for 34 yards'},
    {period:{number:3},text:'Blocked field goal'},
    {period:{number:4},homeScore:9,awayScore:9,text:'Pass intercepted, returned for 27 yards'},
    {period:{number:4},homeScore:9,awayScore:9,text:'Stopped on fourth down'},
    {period:{number:5},homeScore:9,awayScore:9,text:'Fumble recovered, returned for 25 yards'}
  ];
  const dull = finalScore(quiet);
  const defended = finalScore(exciting);
  assert.ok(defended.score >= 80, `defensive slugfest should remain high, got ${defended.score}`);
  assert.ok(defended.score >= dull.score + 15);
  assert.ok((defended.momentum.factors.find(f => f.label === 'Offensive stagnation')?.points || 0) >= -10);
});

test('low scoring alone does not trigger a completed-game stagnation penalty', () => {
  const summary = coltsBroncosSummary();
  summary.boxscore.teams = [teamStats(5.8,'8-15','2-3'),teamStats(5.5,'7-16','2-3')];
  summary.boxscore.players = [];
  assert.equal(finalScore(summary).momentum.factors.some(f => f.label === 'Offensive stagnation'),false);
});

test('CFB finals use the same guard while live momentum stays unchanged', () => {
  const summary = coltsBroncosSummary();
  assert.ok(core.momentumImpact('CFB',summary,1,'completed').factors.some(f =>
    f.label === 'Offensive stagnation' && f.points < 0));
  assert.equal(core.momentumImpact('NFL',summary,.95,'live').factors.some(f =>
    f.label === 'Offensive stagnation'),false);
});
