import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import {footballScenario} from './fixtures/football-live-scenarios.mjs';
const require=createRequire(import.meta.url);
const {winProbabilityObservations}=require('../scoring/shared/probability.js');
const {analyzeTrajectory}=require('../scoring/models.js');
const football=require('../scoring/football-live.cjs'),core=require('../rating-core.js');

test('F3 period-only WP anchors never become observed midpoint history',()=>{
  for(const sport of ['NFL','CFB','NBA','NCAAB','NHL','MLB','Soccer','Tennis']) {
    const summary={header:{competitions:[{status:{period:4,displayClock:'1:00'}}]},
      plays:[{id:'early',period:{number:1}},{id:'late',period:{number:3}}],
      winprobability:[{playId:'early',homeWinPercentage:.5},{playId:'late',homeWinPercentage:.5}]};
    assert.ok(winProbabilityObservations(sport,summary).every(item=>item.position===null),sport);
    assert.equal(analyzeTrajectory(sport,summary,.99,'live').hasObservedHistory,false,sport);
  }
});

test('F3 explicit WP positions including zero and actual clocks retain their evidence',()=>{
  const explicit=winProbabilityObservations('NFL',{winprobability:[{position:0,homeWinPercentage:0},{position:.5,homeWinPercentage:1}]});
  assert.deepEqual(explicit.map(x=>[x.position,x.probability]),[[0,0],[.5,1]]);
  const clocked=winProbabilityObservations('NFL',{plays:[{id:'opening',period:{number:1},clock:{displayValue:'15:00'}},
    {id:'later',period:{number:2},clock:{value:0}}],winprobability:[{playId:'opening',homeWinPercentage:.5},{playId:'later',homeWinPercentage:.6}]});
  assert.deepEqual(clocked.map(x=>x.position),[0,.5]);
});

test('F3 sustained underdog lead requires known scoring-event and canonical clocks',()=>{
  for(const sport of ['NFL','CFB']) for(const missing of ['play','current']) {
    const i=footballScenario({sport,period:2,clock:'3:00',away:7});
    const goal={id:'td',period:{number:1},clock:{displayValue:'8:00'},homeScore:0,awayScore:7};
    i.summary.scoringPlays=[goal];
    const game=active.normalizeEvent(i.event,sport);
    assert.ok(football.liveSurprise(core,game,i.competition,i.summary).sustained>0);
    if(missing==='play')delete goal.clock;else delete i.competition.status.displayClock;
    assert.equal(football.liveSurprise(core,game,i.competition,i.summary).sustained,0,`${sport} ${missing}`);
  }
});

test('F3 Tennis set numbers alone cannot locate observed historical durations',()=>{
  const summary={header:{competitions:[{status:{period:3},competitors:[{homeAway:'home',score:1},{homeAway:'away',score:1}]}]},
    plays:[{id:'start',period:{number:1},homeScore:0,awayScore:0},
      {id:'set1',period:{number:2},homeScore:1,awayScore:0,scoringPlay:true},
      {id:'set2',period:{number:3},homeScore:1,awayScore:1,scoringPlay:true}]};
  assert.equal(analyzeTrajectory('Tennis',summary,null,'live').hasObservedHistory,false);
});
