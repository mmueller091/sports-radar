import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {loadCore,loadFixtures,scoreFixture} from '../calibration/helpers.mjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

const core = await loadCore();
const teams = (home,away) => [
  {homeAway:'home',team:{id:'h',displayName:'Home'},score:String(home)},
  {homeAway:'away',team:{id:'a',displayName:'Away'},score:String(away)}
];
function event(sport,clock,home=100,away=103,period=4,situation={possession:'h'}) {
  return {id:'phase-one',name:'Away at Home',competitions:[{
    status:{period,displayClock:clock,type:{state:'in',detail:'In progress'}},
    competitors:teams(home,away),situation
  }]};
}
function rated(source,sport='NBA',summary=null) {
  const game=normalizeEvent(source,sport);
  if (summary) enrichGame(game,summary);
  return game;
}

test('NBA decimal, colon and numeric clocks produce the same components',()=>{
  const variants=['0:12','12.0',null].map(clock=>{
    const source=event('NBA',clock,100,103);
    if (clock===null) source.competitions[0].status.clock=12;
    return rated(source);
  });
  for(const game of variants.slice(1)) {
    assert.equal(game.score,variants[0].score);
    assert.deepEqual(game.factors,variants[0].factors);
    assert.deepEqual(game.live.components,variants[0].live.components);
  }
});

test('soccer elapsed and stoppage clocks preserve chronology',()=>{
  const at=(displayClock,clock)=>core.normalizedTime('Soccer',{
    status:{period:2,displayClock,...(clock===undefined?{}:{clock})}
  });
  assert.ok(at("90'+4'").elapsedSeconds > at("89'").elapsedSeconds);
  assert.equal(at("90'+4'").elapsedSeconds,at("90'+4'",5640).elapsedSeconds);
  assert.ok(core.gameProgress('Soccer',{status:{period:2,displayClock:"89'"}})>.98);
  assert.ok(core.eventPosition('Soccer',{status:{period:2,displayClock:"90'+4'"}})>1);
  const displayed=event('Soccer',"90'+4'",0,0,2,{});
  const numeric=structuredClone(displayed);
  numeric.competitions[0].status.displayClock='';
  numeric.competitions[0].status.clock=5640;
  const first=rated(displayed,'Soccer');
  const second=rated(numeric,'Soccer');
  assert.equal(first.score,second.score);
  assert.deepEqual(first.live.components,second.live.components);
  assert.equal(first.live.components.situation,3);
});

test('NHL display clocks count down to elapsed period time',()=>{
  const at=displayClock=>core.eventPosition('NHL',{status:{period:1,displayClock}});
  assert.ok(at('19:00') < at('10:00'));
  assert.ok(at('10:00') < at('1:00'));
  assert.equal(core.normalizedTime('NHL',{status:{period:1,displayClock:'19:00'}}).elapsedSeconds,60);
  assert.equal(core.normalizedTime('NHL',{status:{period:1,displayClock:'1:00'}}).elapsedSeconds,1140);
});

test('older and wrong-team summaries contribute no live momentum or odds',()=>{
  const source=event('NBA','0:12',104,105);
  const original=rated(source);
  const older=event('NBA','8:00',80,95).competitions[0];
  older.odds=[{details:'Home +500'}];
  const stale={header:{competitions:[older]},scoringPlays:[
    {period:{number:4},clock:{displayValue:'8:30'},homeScore:70,awayScore:80},
    {period:{number:4},clock:{displayValue:'8:00'},homeScore:80,awayScore:95}
  ],winprobability:[{homeWinPercentage:.5}]};
  enrichGame(original,stale);
  assert.equal(original.score,rated(source).score);
  assert.equal(original.momentumPoints,undefined);
  const wrong=structuredClone(stale);
  wrong.header.competitions[0].competitors[0].team.id='unrelated';
  enrichGame(original,wrong);
  assert.equal(original.score,rated(source).score);
  assert.equal(original.underdog,null);
  const nfl=event('NFL','1:00',24,21);
  const nflGame=rated(nfl,'NFL');
  const before=nflGame.score;
  const unrelated=structuredClone(nfl.competitions[0]);
  unrelated.competitors[0].team.id='different-team';
  unrelated.odds=[{details:'Home +500'}];
  enrichGame(nflGame,{header:{competitions:[unrelated]},pickcenter:[{details:'Home +500'}]});
  assert.equal(nflGame.score,before);
  assert.equal(nflGame.underdog,null);
});

test('team permutation preserves rating and timeout interpretation',()=>{
  const source=event('NBA','0:12',103,97,4,{possession:'a',timeoutsRemaining:{home:0,away:2}});
  const first=rated(source);
  source.competitions[0].competitors.reverse();
  const second=rated(source);
  assert.equal(first.score,second.score);
  assert.deepEqual(first.factors,second.factors);
  assert.deepEqual(first.live.components,second.live.components);
});

test('browser chooses the Worker score without watched or slate selection',()=>{
  const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  assert.match(source,/games = canonicalFeedGames\(feed\.games\)/);
  assert.doesNotMatch(source,/slice\(0,60\)\.map\(watchKey\)/);
  const start=source.indexOf('function canonicalFeedGames(items) {');
  const end=source.indexOf('\nasync function loadLiveGames()',start);
  assert.ok(start>=0 && end>start);
  const items=Array.from({length:61},(_,index)=>({id:String(index),sport:'NBA',teams:[],score:61,scoreboard:{score:51}}));
  for(const watched of [false,true]) {
    const map=vm.runInNewContext(`${source.slice(start,end)}\ncanonicalFeedGames`,{favoriteFor:()=>watched});
    const result=map(items);
    assert.ok(result.every(game=>game.score===61));
  }
});

test('all 107 calibration fixtures match the production evaluator',()=>{
  const fixtures=loadFixtures();
  assert.equal(fixtures.length,107);
  for(const fixture of fixtures) {
    const actual=scoreFixture(fixture,core);
    const game=normalizeEvent(fixture.event,fixture.modelSport);
    enrichGame(game,fixture.summary);
    assert.equal(actual.finalScore,game.score,fixture.eventId);
    assert.equal(actual.openingScore,game.openingScore,fixture.eventId);
    assert.deepEqual(actual.factors,game.factors,fixture.eventId);
    assert.deepEqual(actual.components,game.live?.components || null,fixture.eventId);
  }
});
