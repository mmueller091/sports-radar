import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import sourceHelper from './helpers/scoring-source.cjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
import {baseballSituation,footballSituation} from '../alerts-worker/src/display-model.js';

const require = createRequire(import.meta.url);
const current = require('../rating-core.js');
const archivedSource = gunzipSync(fs.readFileSync(new URL('./fixtures/scoring-core-before-extraction.js.gz', import.meta.url))).toString();
const before = vm.runInNewContext(`${archivedSource}\nSportsRadarScore`);
const browser = vm.runInNewContext(`${sourceHelper.scoringSource()}\nSportsRadarScore`);
const sports = ['NFL','MLB','NHL','NBA','NCAAB','CFB','Tennis','Soccer'];
const same = (actual, expected, message) => assert.deepEqual(structuredClone(actual), structuredClone(expected), message);

test('public scoring API preserves keys, constants, signatures and browser exports', () => {
  same(Object.keys(current), Object.keys(before));
  same(Object.keys(browser), Object.keys(before));
  for (const key of Object.keys(before)) {
    if (typeof before[key] === 'function') {
      assert.equal(current[key].length, before[key].length, key);
      assert.equal(browser[key].length, before[key].length, key);
    } else {
      same(current[key], before[key], key);
      same(browser[key], before[key], key);
    }
  }
});

for (const sport of sports) {
  test(`${sport}: pregame, live, final, history and snapshot parity with archived core`, () => {
    const regulation = {NFL:4,CFB:4,MLB:9,NHL:3,NBA:4,NCAAB:2,Tennis:3,Soccer:2}[sport];
    for (const state of ['upcoming','live','completed']) {
      for (const gap of [0,1,2,3,7,8,9,12,14,20,24,32]) {
        for (const late of [false,true]) {
          const base = {NFL:24,CFB:24,MLB:4,NHL:2,NBA:100,NCAAB:70,Tennis:1,Soccer:1}[sport];
          const competition = {
            status:{period:late ? regulation : 1,displayClock: sport === 'Soccer' ? (late ? "90+3'" : "12'") : late ? '0:12' : '10:00',type:{state:state === 'completed' ? 'post' : state === 'live' ? 'in' : 'pre',completed:state === 'completed',detail:sport === 'MLB' ? (late ? 'Bottom 9th' : 'Top 1st') : state === 'completed' ? 'Final OT' : 'Match point in deciding set'}},
            competitors:[
              {homeAway:'home',score:String(base),team:{id:'h',displayName:'Buffalo Bills',abbreviation:'BUF'},records:[{type:'total',summary:'6-0'}],curatedRank:{current:8}},
              {homeAway:'away',score:String(base+gap),team:{id:'a',displayName:'Miami Dolphins',abbreviation:'MIA'},records:[{type:'total',summary:'5-1'}],curatedRank:{current:16}}
            ],
            situation:{possession:'h',down:4,distance:2,isRedZone:true,isGoalToGo:true,downDistanceText:'4th & Goal at MIA 2',possessionText:'MIA 2',outs:2,balls:3,strikes:2,onFirst:true,onSecond:true,onThird:true,halfInning:'bottom',matchPoint:true,tiebreak:true},
            odds:[{spread:late ? 9.5 : 3.5,homeTeamOdds:{underdog:true},awayTeamOdds:{favorite:true},pointSpread:{home:{close:{line:'+9.5'}},away:{close:{line:'-9.5'}}},moneyline:{home:{close:{odds:'+250'}},away:{close:{odds:'-270'}}}}]
          };
          const event = {name:late ? 'Championship - Game 7 - winner advances' : 'Rivalry matchup',season:{type:late ? 3 : 2}};
          const teams = competition.competitors.map(item => ({...item,id:item.team.id,pregameRecord:item.homeAway === 'home' ? '6-0' : '5-1'}));
          const plays = Array.from({length:12}, (_, i) => ({homeScore:i % 2 ? i*2 : i*2+3,awayScore:i*2+1,period:{number:Math.max(1,Math.round((i+1)/12*regulation))},clock:{displayValue:i > 8 ? '0:10' : '5:00'},scoringPlay:true,text:i === 11 ? 'Game-winning touchdown at the buzzer' : 'Score'}));
          const summary = {header:{competitions:[competition]},plays,scoringPlays:plays,winprobability:[.1,.7,.2,.8,.3,.6,.4,.5].map(homeWinPercentage => ({homeWinPercentage}))};
          const evaluate = core => {
            const comp = structuredClone(competition);
            const rating = core.rateGame(sport,state,structuredClone(teams),event,comp,'');
            const game = {sport,state,teams:teams.map(item => [item.team.displayName,item.team.abbreviation,item.score,'','','',null,item.homeAway,item.id]),baseScore:rating.score,score:rating.score,openingScore:rating.openingScore,factors:rating.factors,underdog:rating.underdog,liveRawStatus:comp.status,liveRawSituation:comp.situation};
            const progress = core.gameProgress(sport,comp);
            const history = core.momentumImpact(sport,summary,progress,state);
            const snapshot = core.liveSnapshot(game,comp,summary);
            core.applyLiveSnapshot(game,comp,summary);
            const applied = structuredClone(game);
            core.applyLiveSnapshot(game,comp,summary);
            return {rating,history,snapshot,applied,reapplied:game};
          };
          const expected = evaluate(before);
          same(evaluate(current), expected, `${sport} ${state} gap=${gap} late=${late} Node`);
          same(evaluate(browser), expected, `${sport} ${state} gap=${gap} late=${late} browser`);
        }
      }
    }
  });
}

test('state-model boundary parity includes missing margins, clocks, probabilities and unknown sports', () => {
  for (const sport of [...sports, 'Unknown']) {
    for (const state of ['upcoming','live','completed']) {
      for (const gap of [null,undefined,NaN,-1,0,1,2,3,4,8,12,14,20,24,Infinity]) {
        for (const progress of [0,.3,.65,.9,.99,1,1.2]) {
          for (const probability of [null,.01,.5,.99]) {
            for (const context of [null,{}, {competition:{status:{period:4,displayClock:'0:00'}},situation:{possession:'h'}}]) {
              const args = [71,sport,state,gap,progress,probability,context,[{label:'Postseason',points:22},{label:'Both winning records',points:14}]];
              same(current.stateRating(...args),before.stateRating(...args),`${sport} ${state} gap=${gap} progress=${progress}`);
            }
          }
        }
      }
    }
  }
});

test('all 107 archived provider fixtures preserve complete normalized and enriched games', () => {
  const adapter = fs.readFileSync(new URL('../alerts-worker/src/game-model.js',import.meta.url),'utf8')
    .replace(/^import .*;\s*$/gm,'').replace(/^export .*;\s*$/gm,'');
  const original = vm.runInNewContext(`${archivedSource}\n${adapter}\n({normalizeEvent,enrichGame})`,{baseballSituation,footballSituation});
  const inputs = JSON.parse(gunzipSync(fs.readFileSync(new URL('../alerts-worker/test/fixtures/migration-inputs.json.gz',import.meta.url))));
  assert.equal(Object.keys(inputs).length,107);
  for (const [file,fixture] of Object.entries(inputs)) {
    const evaluate = model => {
      const game = model.normalizeEvent(structuredClone(fixture.event),fixture.modelSport);
      if ((game.state !== 'upcoming' || !game.line) && !(game.division === 'FCS' && game.state === 'upcoming')) {
        model.enrichGame(game,structuredClone(fixture.summary));
      }
      return game;
    };
    same(evaluate({normalizeEvent,enrichGame}),evaluate(original),file);
  }
});
