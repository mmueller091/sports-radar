import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';
import nfl from './helpers/nfl-calibration.cjs';

const require=createRequire(import.meta.url);
const runtime=require('../scoring/live-runtime.cjs');
const {footballPendingTryImpact}=require('../scoring/shared/football.js');
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const browser=vm.runInNewContext(buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'}).outputFiles[0].text+';SportsRadarScore');
const captured=JSON.parse(fs.readFileSync(new URL('./fixtures/cfb-pending-try-401856846.json',import.meta.url)));
const fixture=()=>structuredClone(captured);
function impact(event,summary,sport='CFB') {
  const competition=event.competitions[0];
  const game=normalizeEvent(event,sport);
  return footballPendingTryImpact({game,competition,status:competition.status,situation:competition.situation,summary});
}

test('captured Kansas State 20–21 touchdown stays decisive before the conversion',()=>{
  const {event,summary}=fixture();
  const original=JSON.stringify({event,summary});
  const game=normalizeEvent(event,'CFB');
  assert.ok(game.score>=95,`scoreboard-only rating: ${game.score}`);
  assert.match(game.live.note,/Conversion try pending/);
  enrichGame(game,summary);
  assert.ok(game.score>=95 && game.score<=99,`enriched rating: ${game.score}`);
  assert.match(game.live.reasons.join(' '),/extra point can tie or two-point try can take the lead/);
  assert.equal(game.teams.find(t=>t[8]==='2306')[2],'20','the unplayed conversion adds no points to the score');
  assert.equal(JSON.stringify({event,summary}),original,'provider inputs remain unchanged');
});

test('last-second TD does not lose the preceding goal-to-go leverage',()=>{
  const {event}=fixture();
  const before=structuredClone(event);
  const c=before.competitions[0];
  c.competitors.find(t=>t.team.id==='2306').score='14';
  c.status={...c.status,displayClock:'0:06',clock:6};
  c.situation={possession:'2306',down:3,distance:8,possessionText:'COLO 8',downDistanceText:'3rd & Goal at COLO 8',isGoalToGo:true,isRedZone:true};
  const drive=normalizeEvent(before,'CFB');
  const pending=normalizeEvent(event,'CFB');
  assert.ok(drive.score>=90);
  assert.ok(pending.score>=drive.score-1,`goal-to-go ${drive.score} -> pending try ${pending.score}`);
});

test('pending tries stay decisive through regulation expiry and overtime for CFB and NFL',()=>{
  for (const sport of ['CFB','NFL']) for (const [period,clock] of [[4,'0:01'],[4,'0:00'],[5,'5:00'],[5,'0:00'],[6,'0:00']]) {
    const {event}=fixture();
    if (sport==='NFL' && period>5) event.season.type=3;
    event.competitions[0].status.period=period;
    event.competitions[0].status.displayClock=clock;
    const game=normalizeEvent(event,sport);
    assert.ok(game.score>=90,`${sport} period ${period} ${clock}: ${game.score}`);
    assert.match(game.live.note,/Conversion try pending/);
  }
});

test('post-TD inference requires structured live transition evidence, not old TD prose',()=>{
  const mutations=[
    c=>{c.situation.down=1;},
    c=>{delete c.situation.down;},
    c=>{c.situation.yardLine=35;},
    c=>{delete c.situation.lastPlay.scoreValue;},
    c=>{c.situation.lastPlay.team.id='unknown';},
    c=>{c.situation.possession='38';},
    c=>{c.situation.lastPlay.awayScore=14;},
    c=>{c.situation.lastPlay.text='Touchdown overturned; no play';},
    c=>{c.situation.lastPlay.text='Touchdown (Smith KICK)';},
    c=>{c.situation.lastPlay.text='Touchdown; two point conversion failed';},
    c=>{c.situation.lastPlay.pointAfterAttempt={id:4,text:'Kick failed'};},
    c=>{c.status.period=3;},
    c=>{c.status.displayClock='5:00';},
    c=>{c.status.type={state:'post',completed:true};},
    c=>{c.competitors[0].score=null;}
  ];
  for (const [i,mutate] of mutations.entries()) {
    const {event}=fixture();
    mutate(event.competitions[0]);
    assert.equal(impact(event),null,`rejected case ${i}`);
  }
});

test('made or missed conversions and kickoffs end pending leverage, including scoreless failures',()=>{
  for (const text of ['Extra Point Good','Extra Point Missed','Two-Point Conversion Failed','Kickoff']) {
    const {event,summary}=fixture();
    summary.drives.previous[0].plays.push({id:'next',type:{text},text});
    assert.equal(impact(event,summary),null,text);
  }
  const {event,summary}=fixture();
  summary.drives.current.plays.at(-1).pointAfterAttempt={id:4,text:'Kick failed',value:0};
  assert.equal(impact(event,summary),null,'resolved PAT attached to duplicated TD');
  delete summary.drives.current.plays.at(-1).pointAfterAttempt;
  summary.scoringPlays.at(-1).text+=' (Extra point missed)';
  assert.equal(impact(event,summary),null,'resolved PAT attached to scoring play');
});

test('duplicate drive and review/timeout updates preserve the pending conversion',()=>{
  const {event,summary}=fixture();
  assert.ok(impact(event,summary));
  for (const text of ['Timeout','Official review','End of 4th Quarter']) {
    summary.drives.current.plays.push({id:text,type:{text},text});
    assert.ok(impact(event,summary),text);
  }
});

test('an older summary cannot erase current scoreboard pending-try leverage',()=>{
  const {event,summary}=fixture();
  summary.header.competitions=structuredClone(summary.header.competitions);
  summary.header.competitions[0].competitors.find(t=>t.team.id==='2306').score='14';
  summary.header.competitions[0].status.displayClock='0:06';
  const game=normalizeEvent(event,'CFB');
  enrichGame(game,summary);
  assert.equal(game.lastSummaryAccepted,false);
  assert.ok(game.score>=95);
  assert.match(game.live.note,/Conversion try pending/);
});

test('browser and Worker shared scorers agree on the captured pending try',()=>{
  for (const sport of ['CFB','NFL']) {
    const {event,summary}=fixture();
    const a=normalizeEvent(event,sport);
    const other=structuredClone(event),b=normalizeEvent(other,sport);
    runtime.applyLiveSnapshot(a,event.competitions[0],summary);
    browser.applyLiveSnapshot(b,other.competitions[0],structuredClone(summary));
    assert.equal(b.score,a.score,sport);
    assert.deepEqual(JSON.parse(JSON.stringify(b.live)),JSON.parse(JSON.stringify(a.live)),sport);
  }
});

test('NFL home and away TDs retain leverage through pending tries in regulation and overtime',()=>{
  for (const scorer of ['h','a']) for (const deficit of [1,2])
    for (const [period,clock] of [[4,'0:01'],[4,'0:00'],[5,'2:00'],[5,'0:00']]) {
      const scores=scorer==='h' ? [21-deficit,21] : [21,21-deficit];
      const {event,competition,summary}=nfl.fixture({scores,period,clock,down:-1});
      event.id='nfl-pending-try';
      event.competitions=[competition];
      competition.situation={down:-1,yardLine:0,distance:0,lastPlay:{
        id:'td',text:'Touchdown',scoreValue:6,team:{id:scorer},homeScore:scores[0],awayScore:scores[1]
      }};
      const game=normalizeEvent(event,'NFL');
      assert.ok(game.score>=90,`${scorer} ${deficit} ${period} ${clock}: ${game.score}`);
      assert.match(game.live.note,/Conversion try pending/);
      enrichGame(game,summary);
      assert.ok(game.score>=90 && game.score<=99);
      assert.match(game.live.note,/Conversion try pending/);
      assert.deepEqual(game.teams.map(t=>t[2]).sort(),scores.map(String).sort());
    }
});

test('NFL completed tries clear pending leverage on refresh, including scoreless failures',()=>{
  for (const [text,points] of [['Extra Point Good',1],['Extra Point Missed',0],
    ['Two-Point Conversion Good',2],['Two-Point Conversion Failed',0],['Kickoff',0]]) {
    const {event,competition,summary}=nfl.fixture({scores:[21,20],clock:'0:01'});
    event.id='nfl-pending-try';
    event.competitions=[competition];
    competition.situation={down:-1,yardLine:0,distance:0,lastPlay:{id:'td',text:'Touchdown',scoreValue:6,team:{id:'a'}}};
    const pending=normalizeEvent(event,'NFL');
    const previous=JSON.parse(JSON.stringify(pending));
    assert.match(pending.live.note,/Conversion try pending/);
    competition.competitors[1].score=String(20+points);
    competition.situation.lastPlay={id:'try',text,type:{text},scoreValue:points,team:{id:'a'}};
    const resolved=normalizeEvent(event,'NFL');
    enrichGame(resolved,summary,previous);
    assert.doesNotMatch(resolved.live.note,/Conversion try pending/,text);
    assert.doesNotMatch(resolved.live.reasons.join(' '),/Touchdown scored;.*try/,text);
    assert.equal(resolved.teams.find(t=>t[8]==='a')[2],String(20+points));
  }
});
