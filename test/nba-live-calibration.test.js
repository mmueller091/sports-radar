import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import {scenario,evaluate} from './helpers/live-underdog-scenarios.mjs';
import {manifest,readCapture,replayCheckpoints,inputFor} from './helpers/release-basketball.mjs';

const require = createRequire(import.meta.url);
const {SPORT_MODELS} = require('../scoring/models.js');
const {basketballSituationImpact} = require('../scoring/shared/basketball.js');
const {tensionPolicy} = require('../scoring/basketball-calibration.cjs');
const run = options => evaluate(active,scenario({sport:'NBA',market:'missing',...options}));

test('NBA optional win-probability dropout cannot cause a large same-state rating change',()=>{
  const states = [
    {period:2,clock:'4:00',margin:-2},
    {period:4,clock:'5:45',margin:-5},
    {period:4,clock:'4:04',margin:-1},
    {period:4,clock:'2:10',margin:-2},
    {period:4,clock:'0:50',margin:0},
    {period:5,clock:'1:50',margin:-1}
  ];
  for (const state of states) {
    const absent = run(state);
    for (const wp of [.01,.05,.1,.18,.25,.5,.75,.9,.99]) {
      const present = run({...state,wp});
      assert.ok(Math.abs(present.score-absent.score)<=4,
        `${JSON.stringify(state)}, WP ${wp}: ${absent.score} versus ${present.score}`);
      assert.ok(present.live.probabilityTelemetry.probability!==null,
        'Valid current win probability must remain available to its safeguards');
    }
  }
  assert.equal(tensionPolicy({sport:'NBA'},{status:{period:4}}).uncertaintyWeight,.08);
});

test('late NBA pressure rises gradually for close games, without early or wide-margin inflation',()=>{
  const late = run({period:4,clock:'2:10',margin:-2});
  assert.ok(late.score>=70,`A two-point game with 2:10 left rated ${late.score}`);
  assert.ok(run({period:4,clock:'4:04',margin:-1}).score>=65);
  const floor = (clock,margin=0) => run({period:4,clock,margin}).live.sportImpact.competitiveFloor;
  const values = ['7:00','6:59','5:45','4:04','2:10','0:30','0:02'].map(clock=>floor(clock));
  assert.equal(values[0],0);
  assert.ok(values.every((value,i)=>i===0||value>=values[i-1]),String(values));
  assert.ok(values.every(value=>value>=0&&value<=20),String(values));
  assert.equal(run({period:3,clock:'0:20',margin:0}).live.sportImpact.competitiveFloor,0);
  assert.equal(run({period:4,clock:'7:01',margin:0}).live.sportImpact.competitiveFloor,0);
  assert.equal(run({period:4,clock:'0:02',margin:-9}).live.sportImpact.competitiveFloor,0);
  assert.ok(run({period:4,clock:'0:02',margin:-9}).score<20);
});

test('NBA final-possession feasibility and overtime pressure persist across the period boundary',()=>{
  const finalShot = run({period:4,clock:'0:02',margin:-1,possession:'dog'});
  const leaderBall = run({period:4,clock:'0:02',margin:-1,possession:'fav'});
  assert.ok(finalShot.score-leaderBall.score>=25,
    `Trailing possession ${finalShot.score}, leading possession ${leaderBall.score}`);
  const regulation = run({period:4,clock:'0:01',margin:0});
  const overtime = run({period:5,clock:'5:00',margin:0});
  assert.ok(regulation.live.sportImpact.competitiveFloor-overtime.live.sportImpact.competitiveFloor<=3);
  assert.ok(overtime.live.sportImpact.competitiveFloor>=17);
  assert.ok(run({period:5,clock:'1:50',margin:-1}).score>=70);
  assert.equal(run({period:5,clock:'0:02',margin:-9}).live.sportImpact.competitiveFloor,0);
});

test('retained NBA play-by-play reconstructions reflect a tense finish without optional-WP jumps',()=>{
  // Retrospective play-prefix reconstructions, not recordings of the live feed.
  for (const [eventId,clock,gap,minimum] of [
    ['401585049','1:33',3,80], // Pistons at Celtics, Q4
    ['401909877','1:24',2,85]  // Nets at Celtics, Q4
  ]) {
    const archive = readCapture(manifest.captures.find(c=>c.eventId===eventId));
    const checkpoint = replayCheckpoints(archive).checkpoints.find(cp=>
      Number(cp.play.period?.number)===4 && cp.play.clock?.displayValue===clock &&
      Math.abs(cp.play.awayScore-cp.play.homeScore)===gap);
    assert.ok(checkpoint,`${eventId} has a verified source checkpoint`);
    const input = inputFor(archive,checkpoint);
    const withProbability = evaluate(active,input);
    assert.ok(withProbability.score>=minimum,
      `${eventId} Q4 ${clock}: expected at least ${minimum}, received ${withProbability.score}`);
    const withoutProbability = structuredClone(input);
    delete withoutProbability.summary.winprobability;
    const omitted = evaluate(active,withoutProbability);
    assert.ok(Math.abs(withProbability.score-omitted.score)<=4,
      `${eventId} WP availability changed ${withProbability.score} to ${omitted.score}`);
  }
});

test('college basketball situation and policy are unchanged by NBA calibration',()=>{
  const input = scenario({sport:'NCAAB',period:2,clock:'2:10',margin:-2,market:'missing'});
  const game = evaluate(active,input);
  const status = input.competition.status;
  const context = {game,status,progress:.95,scoreGap:2,situation:input.competition.situation};
  assert.deepEqual(SPORT_MODELS.NCAAB.situation(context),
    basketballSituationImpact(game,status,.95,2,input.competition.situation));
  assert.equal(tensionPolicy({sport:'NFL'},input.competition),null);
  assert.equal(tensionPolicy(game,input.competition).uncertaintyWeight,.35);
});
