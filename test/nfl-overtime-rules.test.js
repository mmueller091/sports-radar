import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';
import nfl from './helpers/nfl-calibration.cjs';
const require=createRequire(import.meta.url);
const {nflOvertime,nflModel}=require('../scoring/sports/nfl.js');
const {footballOvertimeResponse}=require('../scoring/shared/football.js');
const runtime=require('../scoring/live-runtime.cjs');
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const browser=vm.runInNewContext(buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'}).outputFiles[0].text+';SportsRadarScore');

function fixture({scores=[21,21],possession='a',clock='3:00',period=5,year=2026,type=2,tries=false}={}) {
  const f=nfl.fixture({scores,possession,clock,period,tryState:tries,spot:'BUF 25'});
  f.event.id='nfl-rules';f.event.season={year,type};f.event.competitions=[f.competition];
  f.competition.season=f.event.season;f.summary.header.season=f.event.season;
  return f;
}
function drive(team='h',result='Punt',scores=[21,21],id='first') {
  return {id,team:{id:team},start:{period:{number:5}},result,plays:[
    {id:id+'-snap',period:{number:5},homeScore:21,awayScore:21,start:{team:{id:team}}},
    {id:id+'-end',period:{number:5},homeScore:scores[0],awayScore:scores[1],start:{team:{id:team}},text:result}
  ]};
}
function opening(points=3,options={}) {
  const f=fixture({scores:[21+points,21],possession:'',...options});
  const d=drive('h',points===3?'FG':'TD',[21+points,21]);
  Object.assign(d.plays.at(-1),{scoreValue:points,scoringPlay:true,team:{id:'h'},text:points===3?'Field goal GOOD':'Touchdown (Kicker KICK)'});
  f.competition.situation={down:-1,lastPlay:d.plays.at(-1)};
  f.summary.drives={previous:[d],current:d};
  return f;
}
function rate(f) {
  const game=normalizeEvent(f.event,'NFL');enrichGame(game,f.summary);return game;
}
function situation(f) {
  const game=normalizeEvent(f.event,'NFL');
  return nflModel.situation({game,competition:f.competition,status:f.competition.status,situation:f.competition.situation,
    summary:f.summary,progress:1,scoreGap:Math.abs(Number(f.competition.competitors[0].score)-Number(f.competition.competitors[1].score))});
}

test('current regular-season and playoff opening FG/TD preserve the response entitlement',()=>{
  for (const type of [2,3,{id:'3'}]) for (const points of [3,7,8]) {
    const f=opening(points,{type});
    assert.equal(footballOvertimeResponse('NFL',f.competition,f.summary).teamId,'a');
    const game=rate(f);
    assert.ok(game.score>=90,`${JSON.stringify(type)} +${points}: ${game.score}`);
    assert.match(game.live.note,/response pending/);
  }
});

test('regular-season 0:00 ends the period even if the opponent has not received its possession',()=>{
  for (const points of [3,7,8]) {
    const f=opening(points,{clock:'0:00'});
    assert.equal(footballOvertimeResponse('NFL',f.competition,f.summary),null);
    const rules=nflOvertime(f.competition,f.summary);
    assert.equal(rules.clockExpired,true);assert.equal(rules.canWin,false);
    assert.equal(situation(f).competitiveFloor,0);
    assert.doesNotMatch(rate(f).live.note,/response pending/);
  }
});

test('postseason 0:00 and later periods preserve an unfinished response',()=>{
  for (const period of [5,6,7]) {
    const f=fixture({scores:[28,21],type:{id:'3'},clock:'0:00',period});
    f.summary.drives={previous:[drive('h','TD',[28,21])]};
    const rules=nflOvertime(f.competition,f.summary);
    assert.equal(rules.clockExpired,false);assert.equal(rules.canWin,true);
    const game=rate(f);assert.ok(game.score>=90,`${period}: ${game.score}`);
    assert.match(game.live.reasons.join(' '),/overtime possession can win/);
  }
});

test('playoff format from event-only metadata survives a scoreboard-only observation',()=>{
  const f=opening(7,{clock:'0:00',type:3});
  delete f.competition.season;
  const game=normalizeEvent(f.event,'NFL');
  assert.doesNotMatch(game.live.note,/clock expired/);
  enrichGame(game,f.summary);assert.match(game.live.note,/response pending/);
});

test('opening scoreless possession makes the next score a winner; an opening FG does not win outright',()=>{
  const f=fixture();
  assert.equal(nflOvertime(f.competition,f.summary).canWin,false,'unproven opening rights');
  f.summary.drives={previous:[drive('h')]};
  let rules=nflOvertime(f.competition,f.summary);
  assert.equal(rules.suddenDeath,true);assert.equal(rules.fieldGoalWins,true);
  f.competition.competitors[0].score='24';
  f.summary.drives.previous=[drive('h','FG',[24,21])];
  rules=nflOvertime(f.competition,f.summary);
  assert.equal(rules.suddenDeath,false);assert.equal(rules.fieldGoalWins,false);
  assert.equal(rules.canWin,true);assert.equal(rules.canTie,true);
});

test('matching field goals lead to sudden death; an eight-point response can tie but cannot immediately win',()=>{
  const f=fixture();
  f.summary.drives={previous:[drive('h','FG',[24,21]),drive('a','FG',[24,24],'second')]};
  f.competition.competitors.forEach(c=>{c.score='24';});
  let rules=nflOvertime(f.competition,f.summary);
  assert.equal(rules.suddenDeath,true);assert.equal(rules.fieldGoalWins,true);
  f.competition.competitors[0].score='29';f.competition.competitors[1].score='21';
  f.summary.drives.previous=f.summary.drives.previous.slice(0,1);
  rules=nflOvertime(f.competition,f.summary);
  assert.equal(rules.canWin,false);assert.equal(rules.canTie,true);
});

test('a regular-season tied game has no additional period or winning drive after the clock expires',()=>{
  for (const period of [5,6]) {
    const f=fixture({clock:period===5?'0:00':'10:00',period});
    f.summary.drives={previous:[drive('h'),drive('a','Punt',[21,21],'second')]};
    const rules=nflOvertime(f.competition,f.summary);
    assert.equal(rules.clockExpired,true);assert.equal(rules.canWin,false);assert.equal(rules.fieldGoalWins,false);
    assert.equal(situation(f).competitiveFloor,0);
  }
});

test('an untimed two-point try can tie or win after regular-season overtime reaches 0:00',()=>{
  for (const deficit of [0,1,2]) {
    const f=fixture({scores:[28,28-deficit],clock:'0:00',tries:true});
    const rules=nflOvertime(f.competition,f.summary);
    assert.equal(rules.canWin,deficit<=1);assert.equal(rules.canTie,deficit===2);
    assert.ok(rate(f).score>=90);
    assert.ok(situation(f).competitiveFloor>0);
  }
});

test('a tying response TD at 0:00 retains its unplayed winning PAT even without possession or a try flag',()=>{
  for (const type of [2,3]) {
    const f=fixture({scores:[27,27],clock:'0:00',type});
    f.competition.situation={down:-1,yardLine:0,lastPlay:{id:'tying-td',scoreValue:6,text:'Touchdown',team:{id:'a'}}};
    const game=rate(f);
    assert.ok(game.score>=90);
    assert.match(game.live.note,/Conversion try pending/);
    assert.match(game.live.reasons.join(' '),/conversion try can win/);
    assert.deepEqual(game.teams.map(t=>t[2]),['27','27']);
  }
});

test('completed failed response does not invent another opportunity while the final status is delayed',()=>{
  for (const result of ['Interception','Fumble','Downs','Missed FG']) {
    const f=fixture({scores:[24,21]});
    const response=drive('a',result,[24,21],'second');
    f.summary.drives={previous:[drive('h','FG',[24,21]),response],current:response};
    f.competition.situation.lastPlay=response.plays.at(-1);
    assert.equal(nflOvertime(f.competition,f.summary).resolved,true,result);
    assert.equal(situation(f).competitiveFloor,0,result);
  }
});

test('a defensive touchdown or opening safety does not grant a new response entitlement',()=>{
  for (const [result,points] of [['Interception Return Touchdown',6],['Safety',2]]) {
    const f=fixture({scores:[21,21+points],possession:'h'});
    const d=drive('h',result,[21,21+points]);
    Object.assign(d.plays.at(-1),{scoringPlay:true,isTurnover:points===6,scoreValue:points,team:{id:'a'},end:{team:{id:'a'}}});
    f.summary.drives={previous:[d]};f.competition.situation.lastPlay=d.plays.at(-1);
    assert.equal(nflOvertime(f.competition,f.summary).resolved,true,result);
    assert.equal(situation(f).competitiveFloor,0,result);
    assert.equal(footballOvertimeResponse('NFL',f.competition,f.summary),null,result);
  }
});

test('a legally recovered kickoff counts as an opportunity, but a nullified recovery does not',()=>{
  const f=fixture({possession:'h'});
  const kick={id:'kick',period:{number:5},type:{text:'Kickoff'},text:'Onside kick recovered by the kicking team',start:{team:{id:'h'}},end:{team:{id:'h'}}};
  f.summary.plays=[kick];
  assert.equal(nflOvertime(f.competition,f.summary).fieldGoalWins,true);
  kick.text+='; no play';assert.equal(nflOvertime(f.competition,f.summary).fieldGoalWins,false);
  kick.text='Onside kick recovered';delete kick.period;
  assert.equal(nflOvertime(f.competition,f.summary).fieldGoalWins,false,'unknown period is not overtime proof');
});

test('historical TD rules, duplicate drives and missing evidence stay separate',()=>{
  for (const [year,type,response] of [[2024,2,false],[2025,2,true],[2021,3,false],[2022,3,true],[2026,{id:'3'},true]]) {
    const f=opening(7,{year,type});
    assert.equal(Boolean(footballOvertimeResponse('NFL',f.competition,f.summary)),response,`${year}/${JSON.stringify(type)}`);
  }
  const f=fixture();f.summary.drives={previous:[{...drive('h'),isCurrent:true}]};
  assert.equal(nflOvertime(f.competition,f.summary).canWin,false,'unfinished drive is not an ended opportunity');
});

test('built browser and Worker follow identical NFL overtime rules across clock and phase boundaries',()=>{
  for (const f of [opening(7),opening(3,{clock:'0:00'}),opening(7,{clock:'0:00',type:3}),
    fixture({scores:[28,26],clock:'0:00',tries:true})]) {
    const a=normalizeEvent(f.event,'NFL'),other=structuredClone(f.event),b=normalizeEvent(other,'NFL');
    runtime.applyLiveSnapshot(a,f.competition,f.summary);
    browser.applyLiveSnapshot(b,other.competitions[0],structuredClone(f.summary));
    assert.equal(a.score,b.score);
    assert.deepEqual(JSON.parse(JSON.stringify(a.live)),JSON.parse(JSON.stringify(b.live)));
  }
});
