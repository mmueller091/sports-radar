import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import calibration from './helpers/nfl-calibration.cjs';
import sourceHelper from './helpers/scoring-source.cjs';
const require = createRequire(import.meta.url);
const core = require('../rating-core.js');
const {nflOvertime,nflModel} = require('../scoring/sports/nfl.js');
const {footballClockRunway} = require('../scoring/shared/football.js');
const {fixture,cases,evaluate} = calibration;
const archived = vm.runInNewContext(`${gunzipSync(fs.readFileSync(new URL('./fixtures/scoring-core-before-extraction.js.gz',import.meta.url)))}\nSportsRadarScore`);
const browser = vm.runInNewContext(`${sourceHelper.scoringSource()}\nSportsRadarScore`);
const results = Object.fromEntries(Object.entries(cases).map(([key,input]) => [key,evaluate(core,input)]));

test('NFL A-P watchability matrix preserves consequence and possession ordering', () => {
  const s = key => results[key].score;
  assert.ok(s('B') > s('A'));
  assert.ok(s('C') > s('B'));
  assert.ok(s('C') > s('E') && s('E') > s('D'));
  assert.ok(s('F') > s('C'));
  assert.ok(s('O') > s('C') && s('P') > s('C'));
  assert.ok(s('M') >= s('O') && s('M') > s('C') && s('M') > s('F') && s('M') >= s('P'));
  assert.ok(s('N') < s('O')-20);
  for (const [key,low,high] of [['C',85,89],['F',90,94],['O',89,94],['P',90,95],['K',88,94],['B',62,66]]) {
    assert.ok(s(key) >= low && s(key) <= high,`${key}: ${s(key)} outside ${low}-${high}`);
  }
  assert.ok(s('G') >= s('H')+10);
  assert.ok(s('I') >= s('J')+5);
  assert.ok(s('K') >= s('L')+15);
  assert.ok(results.K.upset > results.L.upset && results.L.upset > 0);
  assert.ok(s('M') >= 95);
  assert.ok(results.N.situation <= 3);
  assert.ok(results.O.situation >= 10 && results.P.situation >= 10);
  for (const [key,input] of Object.entries(cases)) {
    assert.deepEqual(evaluate(browser,input),results[key],`${key}: browser/Node`);
  }
});

test('timeouts modify possession runway, validate counts, and preserve missing-data fallback', () => {
  const get = input => {
    const {competition} = fixture({...cases.D,...input});
    return core.footballLiveCloseness('NFL',5,core.gameProgress('NFL',competition),competition);
  };
  assert.ok(get({timeouts:3}).expectedPossessions > get({timeouts:0}).expectedPossessions);
  assert.ok(get({timeouts:0,down:3}).expectedPossessions > get({timeouts:0,down:1}).expectedPossessions);
  for (const timeouts of [undefined,null,'',-1,4,NaN,Infinity,true,'timeout']) {
    const {competition} = fixture({...cases.D,timeouts});
    const p = core.gameProgress('NFL',competition);
    assert.deepEqual(structuredClone(core.footballLiveCloseness('NFL',5,p,competition)),structuredClone(archived.footballLiveCloseness('NFL',5,p,competition)));
  }
  const {competition} = fixture({...cases.D,timeouts:0});
  competition.situation.awayTimeouts = 3;
  assert.equal(footballClockRunway(competition).timeouts,3,'directional situation count takes precedence');
  competition.situation.possession = 'unknown';
  assert.equal(footballClockRunway(competition),null);
  for (const clock of ['1:45','1:30']) {
    assert.ok(evaluate(core,{...cases.E,clock}).score > evaluate(core,{...cases.D,clock}).score);
  }
});

test('tied drives use field position and score needed without a separate momentum stack', () => {
  const backed = evaluate(core,{...cases.F,spot:'MIA 5'});
  const midfield = evaluate(core,{...cases.F,clock:'1:05',spot:'BUF 42'});
  const range = evaluate(core,{...cases.F,clock:'0:35',spot:'BUF 25'});
  assert.ok(range.score >= midfield.score && midfield.score > backed.score);
  // The new floor replaces overlapping leverage; it does not stack with it.
  assert.equal(midfield.bonus,Math.round((99-midfield.base)*.80));
  assert.equal(range.bonus,Math.round((99-range.base)*.80));
  const first = evaluate(core,{...cases.C,down:1,distance:10});
  const routine = evaluate(core,{...cases.C,down:2,distance:9,clock:'1:22'});
  assert.ok(Math.abs(first.score-routine.score) <= 2);
  const unknown = evaluate(core,{...cases.C,possession:''});
  assert.ok(unknown.score < first.score);
});

test('OT uses observed possession rights and historical rules, not just period number', () => {
  const {competition,summary} = fixture(cases.M);
  assert.equal(nflOvertime(competition,{}).canWin,false);
  assert.equal(nflOvertime(competition,summary).suddenDeath,true);
  assert.equal(nflOvertime(competition,summary).fieldGoalWins,true);
  summary.drives.previous = summary.drives.previous.slice(0,1);
  assert.equal(nflOvertime(competition,summary).suddenDeath,false);
  assert.equal(nflOvertime(competition,summary).canWin,true,'second offense after a punt can win');
  competition.competitors[0].score = '27';
  assert.equal(nflOvertime(competition,summary).fieldGoalWins,false,'FG only ties a three-point deficit');
  assert.equal(nflOvertime(competition,summary).canWin,true,'TD can win');
  competition.competitors[0].score = '32';
  assert.equal(nflOvertime(competition,summary).canWin,false,'TD plus two only ties an eight-point deficit');
  competition.situation.possession = 'h';
  assert.equal(nflOvertime(competition,summary).canWin,false,'leader/unknown rights never receive a decisive floor');
  for (const [year,type,canWin] of [[2024,2,true],[2025,2,false],[2021,3,true],[2022,3,false],[2026,3,false]]) {
    const f = fixture({...cases.M,ot:false});
    f.summary.header.season = {year,type};
    assert.equal(nflOvertime(f.competition,f.summary).canWin,canWin,`${year}/${type}`);
  }
  const ordinary = evaluate(core,{...cases.M,ot:false});
  assert.ok(results.M.score > ordinary.score);
  assert.ok(evaluate(core,{...cases.M,clock:'4:30',down:3,distance:7}).score >= 95,'routine playoff OT plays retain decisive state');
});

test('completed NFL preserves extraordinary paths despite ordinary final margins', () => {
  const f = fixture({scores:[34,28],period:5,clock:'0:00'});
  const scoringPlays = [[0,7],[0,14],[0,21],[7,21],[14,21],[21,21],[28,21],[28,28],[34,28]].map(([homeScore,awayScore],i) => ({
    homeScore,awayScore,scoringPlay:true,text:'Touchdown',
    period:{number:i === 8 ? 5 : Math.min(4,1+Math.floor(i/2))},clock:{displayValue:i === 7 ? '0:20' : '5:00'}
  }));
  const dramatic = {...f.summary,scoringPlays,winprobability:[.1,.8,.2,.85,.3,.9].map(homeWinPercentage => ({homeWinPercentage}))};
  const history = core.momentumImpact('NFL',dramatic,1,'completed');
  const ordinary = core.momentumImpact('NFL',f.summary,1,'completed');
  assert.ok(history.points >= ordinary.points+15);
  assert.deepEqual(structuredClone(history),structuredClone(archived.momentumImpact('NFL',dramatic,1,'completed')));
  const teams = f.competition.competitors.map(t => ({...t,id:t.team.id}));
  assert.deepEqual(structuredClone(core.rateGame('NFL','completed',teams,f.event,f.competition,'')),
    structuredClone(archived.rateGame('NFL','completed',teams,f.event,f.competition,'')));
});

test('critical tries are explicit, directional and late; touchdown text does not imply a pending try', () => {
  for (const scores of [[24,23],[24,22],[24,15],[24,14]]) {
    const yes = evaluate(core,{...cases.P,scores});
    const no = evaluate(core,{...cases.P,scores,tryState:false});
    assert.equal(yes.situation,12);
    assert.ok(yes.score >= no.score);
  }
  assert.ok(evaluate(core,{...cases.P,period:1,clock:'9:00'}).situation < 5);
  assert.ok(evaluate(core,{...cases.P,scores:[22,24]}).situation < 5);
  assert.ok(evaluate(core,{...cases.P,period:5,clock:'5:00',ot:true}).situation >= 10);
  const f = fixture(cases.P);
  delete f.competition.situation.isTwoPointAttempt;
  f.competition.situation.lastPlay = {text:'Touchdown! Two-point attempt is good'};
  const game = {sport:'NFL',teams:f.competition.competitors.map(c => [c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.team.id])};
  const impact = nflModel.situation({game,...f,status:f.competition.status,situation:f.competition.situation,progress:.99,scoreGap:2});
  assert.doesNotMatch(impact.reasons.join(' '),/Two-point try/);
});

test('live stagnation requires independent evidence, ramps late, and is erased by defensive action', () => {
  const quiet = fixture(cases.J).summary;
  const action = fixture(cases.I).summary;
  const penalty = (summary,p=.95) => core.footballStagnationImpact('NFL',summary,p,'live').points;
  assert.equal(penalty(quiet,.6),0);
  assert.ok(penalty(quiet,.7) < penalty(quiet,.9));
  assert.ok(penalty(quiet) > 0 && penalty(quiet) <= 10);
  assert.equal(penalty(action),0);
  assert.equal(penalty({header:quiet.header}),0,'low score alone is insufficient');
  assert.equal(penalty({header:quiet.header,scoringPlays:quiet.scoringPlays,boxscore:{teams:[{statistics:[{name:'thirdDownEff',displayValue:'1-10'}]}]}}),0,'no-TDs and low score are not independent evidence');
  const stats = structuredClone(quiet);
  stats.boxscore.teams[0].statistics.push({name:'defensiveTouchdowns',value:2});
  assert.equal(penalty(stats),0);
  const overturned = structuredClone(quiet);
  overturned.plays = Array.from({length:10},() => ({text:'Interception return touchdown overturned, no play'}));
  assert.equal(penalty(overturned),penalty(quiet));
  for (const input of [quiet,action]) {
    assert.equal(core.footballStagnationImpact('CFB',input,.95,'live').points,0);
    assert.deepEqual(structuredClone(core.footballStagnationImpact('NFL',input,1,'completed')),structuredClone(archived.footballStagnationImpact('NFL',input,1,'completed')));
  }
});

const decisiveCases = {
  tiedOwn:{...cases.F,spot:'MIA 20'},
  trailingOwn:{...cases.C,spot:'MIA 20'},
  trailingRed:{...cases.C,spot:'BUF 20'},
  shortFourth:{...cases.O,distance:1},
  longFourth:{...cases.O,distance:10},
  ordinaryFourth:{...cases.O,clock:'2:30'},
  noReturnFourth:{...cases.O,clock:'1:30',timeouts:0},
  returnFourth:{...cases.O,clock:'1:30',timeouts:3},
  winningTry:{...cases.P,scores:[24,23]},
  earlyTry:{...cases.P,scores:[24,23],period:1,clock:'9:00'},
  tiedGoal:{...cases.F,spot:'BUF 3',goalToGo:true},
  trailingGoal:{...cases.C,spot:'BUF 3',goalToGo:true},
  desperate:{...cases.C,clock:'0:01',spot:'MIA 20'},
  unknown:{...cases.C,possession:''},
  expiredDrive:{...cases.C,clock:'0:00'},
  expiredTry:{...cases.P,clock:'0:00'},
  missingClock:{...cases.C,clock:''},
  distantTry:{...cases.P,scores:[24,14]},
  missingSpot:{...cases.C,spot:''}
};

test('decisive possessions and snaps follow territory, conversion and return-possession consequence', () => {
  const s = key => evaluate(core,decisiveCases[key]).score;
  assert.ok(results.F.score > s('tiedOwn'));
  assert.ok(s('trailingRed') > s('trailingOwn'));
  assert.ok(s('shortFourth') > s('longFourth') && s('longFourth') > results.C.score);
  assert.ok(results.O.score > s('ordinaryFourth'));
  assert.ok(s('noReturnFourth') > s('returnFourth'),'failure without return runway has greater consequence');
  assert.ok(s('winningTry') > results.P.score && results.P.score > s('earlyTry')+25);
  assert.ok(s('tiedGoal') > results.F.score && s('trailingGoal') > s('trailingRed'));
  assert.ok(results.M.score > s('tiedGoal') && results.M.score > s('winningTry'));
  for (const key of ['desperate','unknown','expiredDrive','missingClock','distantTry']) {
    assert.ok(s(key) < results.C.score,`${key} is not a viable decisive possession`);
  }
  assert.ok(s('expiredTry') > s('expiredDrive'),'explicit untimed try survives an expired regulation clock');
  assert.ok(results.C.score > results.H.score+30,'leader draining the clock stays low');
  for (const [key,input] of Object.entries(decisiveCases)) {
    assert.deepEqual(evaluate(browser,input),evaluate(core,input),`${key}: browser/Node`);
    assert.deepEqual(evaluate(core,input,'CFB'),evaluate(browser,input,'CFB'),`${key}: independently calibrated CFB browser/Node`);
  }
});

test('decisive floor replaces WP/situation overlap and keeps probability estimates intact', () => {
  for (const input of [cases.C,cases.F,cases.O,cases.P,decisiveCases.tiedGoal]) {
    const noWP = evaluate(core,input);
    for (const probability of [.01,.5,.8,.99]) {
      const withWP = {...input,probability};
      assert.equal(evaluate(core,withWP).score,noWP.score,'floor neither stacks with nor is suppressed by WP');
      assert.deepEqual(evaluate(browser,withWP),evaluate(core,withWP));
      const {competition,summary} = fixture(withWP);
      const progress = core.gameProgress('NFL',competition);
      const impact = core.winProbabilityImpact(summary,progress,'live','NFL');
      assert.equal(impact.probability,probability);
      assert.deepEqual(structuredClone(impact),structuredClone(archived.winProbabilityImpact(summary,progress,'live','NFL')));
      assert.deepEqual(evaluate(core,withWP,'CFB'),evaluate(browser,withWP,'CFB'));
    }
  }
});

test('decisive floors rebase idempotently and disappear when the offense loses possession', () => {
  const f = fixture(cases.C);
  const teams = f.competition.competitors.map(c => ({...c,id:c.team.id}));
  const rating = core.rateGame('NFL','live',teams,f.event,f.competition,'');
  const game = {sport:'NFL',state:'live',teams:teams.map(c => [c.team.displayName,c.team.abbreviation,c.score,'','','',null,c.homeAway,c.id]),
    score:rating.score,baseScore:rating.score,openingScore:rating.openingScore,openingFactors:rating.openingFactors,
    liveRawStatus:f.competition.status,liveRawSituation:f.competition.situation};
  for (let i=0;i<3;i++) {
    core.applyLiveSnapshot(game,f.competition,f.summary);
    assert.equal(game.score,results.C.score);
  }
  const lost = fixture({...cases.H,scores:cases.C.scores});
  core.applyLiveSnapshot(game,lost.competition,lost.summary);
  assert.equal(game.score,evaluate(core,{...cases.H,scores:cases.C.scores}).score);
  assert.ok(game.score < results.C.score-30);
});
