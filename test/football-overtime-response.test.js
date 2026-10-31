import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';
import nfl from './helpers/nfl-calibration.cjs';
const require=createRequire(import.meta.url);
const runtime=require('../scoring/live-runtime.cjs');
const {footballOvertimeResponse}=require('../scoring/shared/football.js');
const {cfbOvertime,cfbModel}=require('../scoring/sports/cfb.js');
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const browser=vm.runInNewContext(buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'}).outputFiles[0].text+';SportsRadarScore');
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/cfb-overtime-response-401856846.json',import.meta.url)));
const fixture=()=>structuredClone(captured);

test('24–21 first-OT field goal keeps the response opportunity through missing or stale possession',()=>{
  for (const possession of [undefined,'2306','38']) {
    const {event,summary}=fixture();
    const c=event.competitions[0];c.situation.possession=possession;
    const original=JSON.stringify({event,summary});
    const game=normalizeEvent(event,'CFB');
    assert.ok(game.score>=85,`partial scoreboard: ${game.score}`);
    enrichGame(game,summary);
    assert.ok(game.score>=95,`response pending: ${game.score}`);
    assert.match(game.live.note,/COLO overtime response pending/);
    assert.match(game.live.reasons.join(' '),/opponent still has a response possession/);
    assert.equal(game.teams.find(t=>t[8]==='38')[2],'21');
    assert.equal(JSON.stringify({event,summary}),original);
  }
});

test('an active Colorado response retains leverage on ordinary plays at untimed 0:00',()=>{
  const {event,summary,responseSituation}=fixture();
  event.competitions[0].situation=responseSituation;
  const game=normalizeEvent(event,'CFB');
  enrichGame(game,summary);
  assert.ok(game.score>=95);
  assert.match(game.live.note,/COLO ball/);
  assert.doesNotMatch(game.live.note,/pending/);
  assert.match(game.live.reasons.join(' '),/Overtime response/);
});

test('a delayed score-conflicting summary cannot turn college 0:00 into expired runway',()=>{
  const {event,summary}=fixture();
  summary.header.competitions=structuredClone(summary.header.competitions);
  summary.header.competitions[0].competitors.find(t=>t.team.id==='2306').score='21';
  const game=normalizeEvent(event,'CFB');
  enrichGame(game,summary);
  assert.equal(game.lastSummaryAccepted,false);
  assert.ok(game.score>=85);
  assert.match(game.live.note,/Possession update pending/);
  assert.doesNotMatch(game.live.reasons.join(' '),/opponent still has a response possession/);
});

test('a verified failed response removes the overtime opportunity floor before final status arrives',()=>{
  const {event,summary}=fixture(),c=event.competitions[0];
  const last={id:'failed-response',period:{number:5},text:'Fourth-down pass incomplete',homeScore:21,awayScore:24,start:{team:{id:'38'}}};
  const response={id:'response',team:{id:'38'},start:{period:{number:5}},result:'DOWNS',plays:[last]};
  summary.drives.previous.push(response);summary.drives.current=response;
  c.situation={down:-1,lastPlay:{...last,scoreValue:0,team:{id:'38'}}};
  assert.equal(cfbOvertime(c,summary).responseFinished,true);
  const game=normalizeEvent(event,'CFB');enrichGame(game,summary);
  assert.doesNotMatch(game.live.note,/response pending|Possession update pending/);
  const impact=cfbModel.situation({game,competition:c,status:c.status,situation:c.situation,summary,scoreGap:3});
  assert.equal(impact.competitiveFloor,0);
});

test('response inference rejects later plays, stale scores, wrong periods and both completed series',()=>{
  const mutations=[
    (c,s)=>{c.situation.lastPlay.id='next';},
    (c,s)=>{c.competitors[0].score='27';},
    (c,s)=>{for (const d of [s.drives.previous[0],s.drives.current]) d.start.period.number=4;},
    (c,s)=>{for (const d of [s.drives.previous[0],s.drives.current]) d.plays[0].homeScore=14;},
    (c,s)=>{s.drives.previous.push({id:'second',result:'DOWNS',team:{id:'38'},start:{period:{number:5}},plays:[{start:{team:{id:'38'}}}]});},
    (c,s)=>{c.status.type={completed:true,state:'post'};}
  ];
  for (const [i,mutate] of mutations.entries()) {
    const {event,summary}=fixture(),c=event.competitions[0];mutate(c,summary);
    assert.equal(footballOvertimeResponse('CFB',c,summary),null,`case ${i}`);
  }
});

function nflOpeningScore(points=3,year=2026) {
  const f=nfl.fixture({scores:[21,21+points],period:5,clock:'3:00'});
  f.event.id='nfl-ot-response';f.event.competitions=[f.competition];
  f.event.season={year,type:2};f.competition.season=f.event.season;f.summary.header.season=f.event.season;
  const last={id:'score',scoreValue:points,team:{id:'a'},period:{number:5},scoringPlay:true,
    text:points===3?'Field goal GOOD':'Touchdown (Kicker KICK)',homeScore:21,awayScore:21+points,start:{team:{id:'a'}}};
  f.competition.situation={down:-1,lastPlay:last};
  const drive={id:'opening-drive',team:{id:'a'},start:{period:{number:5}},result:points===3?'FG':'TD',
    plays:[{id:'first',homeScore:21,awayScore:21,start:{team:{id:'a'}}},last]};
  f.summary.drives={previous:[drive],current:drive};
  return f;
}

test('NFL retains its guaranteed response after the opening score before possession updates',()=>{
  for (const points of [3,7]) {
    const {event,summary}=nflOpeningScore(points);
    const game=normalizeEvent(event,'NFL');enrichGame(game,summary);
    assert.ok(game.score>=90,`NFL +${points}: ${game.score}`);
    assert.match(game.live.note,/MIA|BUF/);
    assert.match(game.live.note,/overtime response pending/);
    assert.match(game.live.reasons.join(' '),/opponent still has a response possession/);
  }
  const old=nflOpeningScore(7,2024);
  assert.equal(footballOvertimeResponse('NFL',old.competition,old.summary),null,'historical opening TD has no invented response');
  const fg=nflOpeningScore(3,2024);
  assert.ok(footballOvertimeResponse('NFL',fg.competition,fg.summary),'historical opening FG preserves response rights');
});

test('built browser and Worker agree across overtime response handoffs',()=>{
  for (const sport of ['CFB','NFL']) {
    const {event,summary}=sport==='CFB'?fixture():nflOpeningScore();
    const a=normalizeEvent(event,sport),other=structuredClone(event),b=normalizeEvent(other,sport);
    runtime.applyLiveSnapshot(a,event.competitions[0],summary);
    browser.applyLiveSnapshot(b,other.competitions[0],structuredClone(summary));
    assert.equal(a.score,b.score);
    assert.deepEqual(JSON.parse(JSON.stringify(a.live)),JSON.parse(JSON.stringify(b.live)));
  }
});
