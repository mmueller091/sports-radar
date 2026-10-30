import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {
  highFidelityCheckpoints,scoringStateCheckpoints,evaluateCheckpoint,summarizeRows
} from '../scripts/shadow-candidate-report.mjs';

const fixtures = loadFixtures();
const fixture = (sport,eventId) => fixtures.find(item =>
  item.modelSport === sport && (!eventId || String(item.eventId) === String(eventId))
);

test('high-fidelity football replay keeps full causal stream, situation, scores, and WP', () => {
  const source = fixture('NFL','401872981');
  const full = highFidelityCheckpoints(source);
  const generic = scoringStateCheckpoints(source);
  assert.ok(full.length > generic.length*10,{full:full.length,generic:generic.length});

  const fourthDown = full.find(checkpoint => Number(checkpoint.competition.situation?.down) === 4);
  assert.ok(fourthDown,'expected a reconstructed fourth-down state');
  assert.ok(fourthDown.availableSituationFields.includes('possession'));
  assert.ok(fourthDown.availableSituationFields.includes('yardsToEndzone'));
  assert.equal(fourthDown.summary.plays.at(-1).id,fourthDown.play.id);
  assert.ok(fourthDown.summary.plays.length > fourthDown.summary.scoringPlays.length);

  const playIds = new Set(fourthDown.summary.plays.map(play => String(play.id)));
  assert.ok(fourthDown.summary.winprobability.every(item => playIds.has(String(item.playId))));
  const scores = Object.fromEntries(fourthDown.competition.competitors
    .map(team => [team.homeAway,Number(team.score)]));
  assert.equal(scores.home,Number(fourthDown.play.homeScore));
  assert.equal(scores.away,Number(fourthDown.play.awayScore));
  assert.deepEqual(generic.every(checkpoint => Object.keys(checkpoint.competition.situation).length === 0),true);
});

test('real football archive contains a pre-score decisive drive and reconstructed fourth down', async () => {
  const source = fixture('NFL','401872981');
  const core = await loadCore();
  const rows = highFidelityCheckpoints(source)
    .map((checkpoint,index) => evaluateCheckpoint(core,source,checkpoint,index))
    .filter(Boolean);
  // Future adjacency is a test oracle, never a field in the replay checkpoint.
  const archive=source.summary.drives.previous.flatMap(d=>d.plays||[]);
  const decisive = rows.find(row => !row.scoringPlay && row.decisiveDrive &&
    archive[archive.findIndex(p=>String(p.id)===row.playId)+1]?.scoringPlay);
  assert.ok(decisive,'expected a live decisive-drive checkpoint immediately before a score');
  assert.equal(decisive.sportSpecificSituationUsable,true);
  assert.equal(decisive.inputsIdentical,true);
  assert.equal(Number(decisive.situation.down),4);
});

test('MLB replay exposes provider outs, count, bases, and batting half', () => {
  const source = fixture('MLB');
  const checkpoints = highFidelityCheckpoints(source);
  const occupied = checkpoints.find(checkpoint => {
    const situation = checkpoint.competition.situation || {};
    return Number.isInteger(situation.outs) &&
      (situation.onFirst || situation.onSecond || situation.onThird);
  });
  assert.ok(occupied,'expected a runner/outs checkpoint');
  assert.match(occupied.competition.situation.count,/^\d-\d$/);
  assert.ok(['home','away'].includes(occupied.competition.situation.battingSide));
  assert.equal(occupied.sportSpecificSituationUsable,true);
});

test('NHL replay records play strength but does not leak the final onIce snapshot backward', () => {
  const source = fixture('NHL');
  assert.equal(source.summary.onIce.length,2,'fixture should demonstrate the final snapshot limitation');
  const checkpoint = highFidelityCheckpoints(source).find(item => item.play.strength);
  assert.ok(checkpoint);
  assert.ok(checkpoint.availableSituationFields.includes('strength'));
  assert.equal(checkpoint.summary.onIce,undefined);
  assert.equal(checkpoint.sportSpecificSituationUsable,false);
});

test('summary includes rating, fidelity, leverage groups, thresholds, and coverage warnings', () => {
  const base = {
    sport:'NFL',eventId:'one',stateId:'one:1',progress:.9,score:{home:20,away:17},margin:3,
    legacyRating:86,candidateRating:82,delta:-4,currentWp:.5,legacyGenericTimePoints:30,
    legacyGenericTime:[],candidateCurrentTension:24,candidateGenericLeverage:7,
    sportSituation:0,sportPressure:0,decisiveFloor:0,driveFloor:0,fidelity:'full',
    availableSituationFields:['down'],currentWpPositioned:true,
    sportSpecificSituationUsable:true,situation:{down:2},decisive:false
  };
  const rows = [
    base,
    {...base,stateId:'one:2',legacyRating:84,candidateRating:86,delta:2,sportSituation:4},
    {...base,stateId:'one:3',legacyRating:92,candidateRating:88,delta:-4,decisive:true,decisiveFloor:18}
  ];
  const summary = summarizeRows(rows,[{modelSport:'NFL',eventId:'one'}]);
  assert.equal(summary.totalStates,3);
  assert.equal(summary.fidelityBuckets.full.count,3);
  assert.equal(summary.groups.neutralStates.count,1);
  assert.equal(summary.groups.specificLeverageStates.count,1);
  assert.equal(summary.groups.decisiveStates.count,1);
  assert.equal(summary.thresholdMovement[85].legacyAtOrAboveCandidateBelow,1);
  assert.equal(summary.thresholdMovement[85].legacyBelowCandidateAtOrAbove,1);
  assert.equal(summary.coverage.MLB.insufficient,true);
  assert.match(summary.largestDecreases[0].diagnosis,/^A-consistent:/);
});

function replayFixture(sport,plays,extra={}) {
  const source = structuredClone(fixture(sport));
  source.summary = {plays,...extra};
  return source;
}

function play(id,clock='1:00',extra={}) {
  return {id,period:{number:4},clock:{displayValue:clock},homeScore:20,awayScore:20,
    scoringPlay:false,...extra};
}

test('chronological replay carries scores, retains skipped records, and positions all causal WP', () => {
  const a = play('a','1:00');
  const b = play('b','0:50',{homeScore:null,awayScore:undefined});
  const c = play('c','0:50',{homeScore:undefined,awayScore:undefined,type:{text:'Personal Foul'}});
  const d = play('d','0:40',{homeScore:23,scoringPlay:true});
  const e = play('e','0:30',{homeScore:23});
  const source = replayFixture('NBA',[a,b,c,d,e],{winprobability:[
    {playId:'e',homeWinPercentage:.8}, // out-of-order provider observations
    {playId:'d',homeWinPercentage:.7},
    {playId:'b',homeWinPercentage:.55},
    {period:{number:4},clock:{displayValue:'0:50'},homeWinPercentage:.6},
    {homeWinPercentage:.99},
    {playId:'missing',homeWinPercentage:.99}
  ]});
  const checkpoints = highFidelityCheckpoints(source);
  const atB = checkpoints.find(cp => cp.play.id === 'b');
  const atC = checkpoints.find(cp => cp.play.id === 'c');
  const atD = checkpoints.find(cp => cp.play.id === 'd');
  assert.equal(atB.summary.winprobability.at(-1).homeWinPercentage,.55);
  assert.equal(atC.summary.winprobability.at(-1).homeWinPercentage,.55,'time-only WP waits until strictly after the equal-clock group');
  assert.deepEqual(atB.competition.competitors.map(t => Number(t.score)),[20,20]);
  assert.equal(atD.summary.plays.length,4);
  assert.deepEqual(atD.summary.scoringPlays.map(p => p.id),['d']);
  assert.equal(atD.summary.winprobability.at(-1).homeWinPercentage,.7);
  assert.ok(atD.summary.winprobability.every(wp=>wp.homeWinPercentage!==.99));
  assert.ok(atD.summary.winprobability.some(wp=>wp.homeWinPercentage===.6));
  assert.ok(atD.summary.winprobability.every(wp => wp.playId !== 'e'));
});

test('duplicate checkpoints are collapsed without dropping their play history or meaningful events', () => {
  const source = replayFixture('NBA',[
    play('a'),play('b'),play('c','0:59'),
    play('d','0:59',{type:{text:'Personal Foul'}}),play('e','0:58')
  ]);
  const checkpoints = highFidelityCheckpoints(source);
  assert.deepEqual(checkpoints.map(cp => cp.play.id),['a','c','d','e']);
  assert.equal(checkpoints.at(-1).summary.plays.length,5);
});

test('unknown initial scores and start-only football situations are never invented', () => {
  const source = replayFixture('NFL',[
    play('unknown','1:00',{homeScore:null,awayScore:null}),
    play('known','0:50',{start:{down:4,distance:2,yardsToEndzone:10,team:{id:'30'}}})
  ]);
  const checkpoints = highFidelityCheckpoints(source);
  assert.equal(checkpoints.length,1);
  assert.equal(checkpoints[0].summary.plays.length,2);
  assert.deepEqual(checkpoints[0].competition.situation,{});
  assert.equal(checkpoints[0].sportSpecificSituationUsable,false);
});

test('clock-corroborated sequence ordering and scoring stream union retain every scoring event', () => {
  const source = replayFixture('NFL',[
    play('c','0:40',{sequenceNumber:3,homeScore:23}),play('a','1:00',{sequenceNumber:1})
  ],{scoringPlays:[play('b','0:50',{sequenceNumber:2,scoringPlay:true,homeScore:23})]});
  const checkpoints = highFidelityCheckpoints(source);
  assert.deepEqual(checkpoints.map(cp => cp.play.id),['a','b','c']);
  assert.deepEqual(checkpoints.at(-1).summary.scoringPlays.map(p => p.id),['b']);
});

test('primary replay strips future team statistics and current-drive outcomes without mutating fixtures', () => {
  const source = structuredClone(fixture('NFL','401872981'));
  const before = JSON.stringify(source);
  const cp = highFidelityCheckpoints(source)[0];
  for (const team of cp.competition.competitors) {
    for (const key of ['winner','linescores','statistics','timeouts','leaders']) assert.equal(team[key],undefined,key);
  }
  for (const key of ['result','description','end','yards','isScore','offensivePlays','timeElapsed']) {
    assert.equal(cp.summary.drives.current[key],undefined,key);
  }
  assert.equal(cp.summary.drives.current.plays.length,1);
  assert.equal(cp.summary.boxscore,undefined);
  assert.equal(JSON.stringify(source),before);
});

test('basketball control is reconstructed only on explicit possession events', async () => {
  // Synthetic schema regression, not an asserted archive calibration example.
  const source = replayFixture('NBA',[
    play('rebound','0:20',{type:{text:'Defensive Rebound'},team:{id:'8'},homeScore:20,awayScore:21}),
    play('shot','0:19',{type:{text:'JumpShot'},team:{id:'8'},homeScore:20,awayScore:21})
  ]);
  const home = source.event.competitions[0].competitors.find(t => t.homeAway === 'home');
  for (const p of source.summary.plays) p.team.id = home.team.id;
  const checkpoints = highFidelityCheckpoints(source);
  assert.equal(checkpoints[0].competition.situation.possession,String(home.team.id));
  assert.equal(checkpoints[1].competition.situation.possession,undefined);
  const core = await loadCore();
  const row = evaluateCheckpoint(core,source,checkpoints[0],0);
  assert.equal(row.finalPossession,true);
  assert.equal(row.fidelity,'full');
  const shot = evaluateCheckpoint(core,source,checkpoints[1],1);
  assert.equal(shot.fidelity,'partial');
  assert.ok(shot.fidelityLimitations.includes('possession'));
});

test('sparse MLB scoring-only data does not manufacture outs, count, or empty bases', async () => {
  const source = replayFixture('MLB',[],{scoringPlays:[
    play('score','',{period:{number:9,type:'Bottom'},homeScore:2,awayScore:3,scoringPlay:true})
  ]});
  const cp = highFidelityCheckpoints(source)[0];
  assert.equal(cp.competition.situation.onFirst,undefined);
  assert.equal(cp.competition.situation.outs,undefined);
  assert.equal(cp.competition.situation.count,undefined);
  assert.equal(cp.sportSpecificSituationUsable,false);
  assert.equal(evaluateCheckpoint(await loadCore(),source,cp,0).fidelity,'generic');
});

test('both policies see identical competition/summary and evaluation rejects input mutation', async () => {
  const source = replayFixture('NBA',[play('one')]);
  const cp = highFidelityCheckpoints(source)[0];
  const core = await loadCore();
  let called = false;
  const observedCore = {...core,liveSnapshot(game,competition,summary) {
    called = true;
    assert.equal(competition,cp.competition);
    assert.equal(summary,cp.summary);
    assert.equal(summary.header.competitions[0],competition);
    assert.deepEqual(game.teams.map(t => Number(t[2])),[20,20]);
    assert.equal(game.liveRawStatus,competition.status);
    assert.deepEqual(game.liveRawSituation,competition.situation);
    return core.liveSnapshot(game,competition,summary);
  }};
  assert.equal(evaluateCheckpoint(observedCore,source,cp,0).inputsIdentical,true);
  assert.ok(called);
  const mutatingCore = {...core,liveSnapshot(game,competition,summary) {
    const result = core.liveSnapshot(game,competition,summary);
    competition.situation.fabricated = true;
    return result;
  }};
  assert.throws(() => evaluateCheckpoint(mutatingCore,source,cp,0),/Candidate evaluation mutated replay inputs/);
});

test('progress buckets use unrounded progress and coverage counts only replayed games', () => {
  const rows = [{sport:'NFL',eventId:'one',progress:.2499,legacyRating:80,candidateRating:70,delta:-10,
    fidelity:'partial',sportSituation:0,decisive:false,situation:{}}];
  const summary = summarizeRows(rows,Array.from({length:10},(_,i) => ({modelSport:'NFL',eventId:String(i)})));
  assert.equal(summary.progressBuckets['0-25%'].count,1);
  assert.equal(summary.coverage.NFL.games,1);
  assert.equal(summary.coverage.NFL.fixtureGames,10);
  assert.equal(summary.coverage.NFL.insufficient,true);
  assert.equal(summary.groups.neutralStates.thresholdMovement[80].legacyAtOrAboveCandidateBelow,1);
  assert.equal(summary.largestIncreases.length,0);
});
