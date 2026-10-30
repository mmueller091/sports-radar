import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const {analyzeTrajectory} = require('../scoring/models.js');

test('NHL elapsed play clocks cannot fabricate mature or reversed trajectory history', () => {
  const goal = {id:'goal',period:{number:1},clock:{displayValue:'1:05'},
    homeScore:1,awayScore:0,scoringPlay:true};
  const later = {id:'later',period:{number:1},clock:{displayValue:'2:00'}};
  const summary = {header:{competitions:[{status:{period:1,displayClock:'2:00',clockMode:'elapsed',
    type:{state:'in'}}}]},scoringPlays:[goal],plays:[goal,later],
    winprobability:[{playId:'goal',homeWinPercentage:.55},{playId:'later',homeWinPercentage:.6}]};
  const moments = require('../scoring/shared/trajectory.js').scoringMoments('NHL',summary);
  assert.equal(moments[0].position,65/3600);
  const telemetry = analyzeTrajectory('NHL',summary,120/3600,'live');
  assert.equal(telemetry.trajectoryEndPosition,120/3600);
  assert.equal(telemetry.wpCoverageStart,65/3600);
  assert.equal(telemetry.wpCoverageEnd,120/3600);
  assert.ok(telemetry.wpCoverageShare > 0 && telemetry.wpCoverageShare < .5);
  assert.equal(telemetry.genuineContinuitySource,'positioned-win-probability');
});

function clockAt(position) {
  const bounded = Math.max(0,Math.min(.999999,position));
  const period = Math.floor(bounded*4)+1;
  const remaining = Math.round(720*(1-(bounded*4-Math.floor(bounded*4))));
  return {period:{number:period},clock:{displayValue:`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}};
}

function marker(id,position,extra={}) {
  return {id,...clockAt(position),...extra};
}

function game({scores=[],wp=[]}) {
  const scoringPlays = scores.map(([position,homeScore,awayScore],index) =>
    marker(`score-${index}`,position,{homeScore,awayScore,scoringPlay:true,text:'Score'}));
  const probabilityPlays = wp.map(([position],index) => marker(`wp-${index}`,position));
  return {
    header:{competitions:[{status:{period:4,displayClock:'0:00',type:{state:'post',completed:true}},
      competitors:[{homeAway:'home',score:String(scores.at(-1)?.[1] ?? 0),team:{id:'h'}},
        {homeAway:'away',score:String(scores.at(-1)?.[2] ?? 0),team:{id:'a'}}]}]},
    scoringPlays,
    plays:[...scoringPlays,...probabilityPlays],
    winprobability:wp.map(([,homeWinPercentage],index) => ({homeWinPercentage,playId:`wp-${index}`}))
  };
}

const sustained = game({
  scores:[[.08,2,0],[.18,2,3],[.32,5,3],[.48,5,6],[.64,8,6],[.78,8,9],[.94,11,9],[.99,11,12]],
  wp:[[.03,.50],[.18,.43],[.32,.56],[.48,.46],[.64,.57],[.78,.45],[.94,.62],[.99,.48]]
});
const lateChaos = game({
  scores:[[.08,7,0],[.25,14,0],[.48,21,3],[.72,28,6],[.84,28,14],[.91,28,21],[.97,28,27],[.995,30,31]],
  wp:[[.03,.72],[.25,.91],[.48,.96],[.72,.97],[.84,.90],[.91,.75],[.97,.58],[.995,.47]]
});

test('sustained classic is distinct from late concentrated chaos', () => {
  const classic = analyzeTrajectory('NBA',sustained);
  const chaos = analyzeTrajectory('NBA',lateChaos);
  assert.ok(classic.competitiveShare > chaos.competitiveShare,{classic,chaos});
  assert.ok(classic.uncertaintyShare > chaos.uncertaintyShare,{classic,chaos});
  assert.ok(classic.marginContinuity > chaos.marginContinuity,{classic,chaos});
  assert.ok(classic.genuineContinuity > chaos.genuineContinuity,{classic,chaos});
  assert.ok(chaos.lateMovementShare > classic.lateMovementShare,{classic,chaos});
  assert.ok(classic.lastCompetitivePosition > .98);
  assert.ok(chaos.lastCompetitivePosition > .98);
});

test('win probability distinguishes false-close from genuinely uncertain score margins', () => {
  const scores = [[.1,2,0],[.35,4,2],[.6,6,4],[.85,8,6],[.99,10,8]];
  const falseClose = analyzeTrajectory('NBA',game({scores,wp:[[.05,.88],[.3,.91],[.55,.93],[.8,.90],[.99,.89]]}));
  const uncertain = analyzeTrajectory('NBA',game({scores,wp:[[.05,.52],[.3,.48],[.55,.55],[.8,.46],[.99,.51]]}));
  assert.ok(falseClose.dominantShare > uncertain.dominantShare,{falseClose,uncertain});
  assert.ok(falseClose.uncertaintyShare < uncertain.uncertaintyShare,{falseClose,uncertain});
  assert.ok(falseClose.competitiveShare > .75,'the score itself remains close');
  assert.ok(falseClose.marginContinuity > .75,'margin continuity remains descriptive');
  assert.ok(falseClose.genuineContinuity < uncertain.genuineContinuity,{falseClose,uncertain});
  assert.ok(falseClose.genuineContinuity < falseClose.marginContinuity*.65,falseClose);
});

test('a low-scoring defensive game remains competitive throughout', () => {
  const defensive = analyzeTrajectory('NFL',game({
    scores:[[.68,3,0],[.96,3,3],[.995,6,3]],
    wp:[[.05,.5],[.3,.52],[.6,.48],[.8,.56],[.96,.5],[.995,.62]]
  }));
  assert.ok(defensive.competitiveShare > .8,defensive);
  assert.ok(defensive.uncertaintyShare > .75,defensive);
  assert.ok(defensive.dominantShare < .1,defensive);
  assert.ok(defensive.genuineContinuity > .8,defensive);
  assert.ok(defensive.lastCompetitivePosition >= .99,defensive);
  assert.ok(defensive.lateMovementShare > .7,defensive);
  const chaos = analyzeTrajectory('NBA',lateChaos);
  assert.ok(defensive.lateMovementShare > chaos.lateMovementShare,{defensive,chaos});
  assert.ok(defensive.genuineContinuity > chaos.genuineContinuity,{defensive,chaos});
  assert.ok(chaos.dominantShare > .5,{defensive,chaos});
});

test('a blowout has low competitiveness and uncertainty with high control', () => {
  const blowout = analyzeTrajectory('NBA',game({
    scores:[[.06,8,0],[.2,22,5],[.4,45,18],[.65,76,38],[.85,102,55],[.99,120,70]],
    wp:[[.03,.7],[.2,.9],[.4,.97],[.65,.99],[.85,.995],[.99,.999]]
  }));
  assert.ok(blowout.competitiveShare < .3,blowout);
  assert.ok(blowout.uncertaintyShare < .25,blowout);
  assert.ok(blowout.dominantShare > .55,blowout);
  assert.ok(blowout.lastCompetitivePosition < .15,blowout);
});

test('WP telemetry is time-weighted rather than provider-sample-weighted', () => {
  const scores = [[.99,2,0]];
  const sparse = analyzeTrajectory('NBA',game({scores,wp:[[.1,.5],[.9,.9]]}));
  const clustered = analyzeTrajectory('NBA',game({scores,wp:[
    [.1,.5],[.11,.505],[.12,.51],[.13,.515],[.14,.52],[.9,.9]
  ]}));
  assert.ok(Math.abs(sparse.uncertaintyShare-clustered.uncertaintyShare) < .025,{sparse,clustered});
  assert.ok(sparse.uncertaintyShare < .8 && sparse.uncertaintyShare > .3,sparse);
});

test('sparse positioned WP reports its supported interval without endpoint fabrication', () => {
  const scores = [[.99,2,0]];
  const sparse = analyzeTrajectory('NBA',game({scores,wp:[[.8,.48],[.9,.52]]}));
  assert.ok(Math.abs(sparse.wpCoverageStart-.8) < .002,sparse);
  assert.ok(Math.abs(sparse.wpCoverageEnd-.9) < .002,sparse);
  assert.ok(Math.abs(sparse.wpCoverageShare-.1) < .002,sparse);
  assert.equal(sparse.wpObservationCount,2);
  assert.equal(sparse.genuineContinuitySource,'positioned-win-probability');
  assert.ok(sparse.uncertaintyShare > .9,sparse);

  const single = analyzeTrajectory('NBA',game({scores,wp:[[.9,.5]]}));
  assert.equal(single.wpCoverageShare,0);
  assert.equal(single.wpObservationCount,1);
  assert.equal(single.uncertaintyShare,null);
  assert.equal(single.genuineContinuity,single.marginContinuity);
  assert.equal(single.genuineContinuitySource,'margin-fallback');

  const absent = analyzeTrajectory('NBA',game({scores}));
  assert.equal(absent.wpCoverageStart,null);
  assert.equal(absent.wpCoverageEnd,null);
  assert.equal(absent.wpCoverageShare,0);
  assert.equal(absent.genuineContinuitySource,'margin-fallback');
});

function chronologySummary(status,scoringPlays,wpPlays=[]) {
  return {
    header:{competitions:[{status:{...status,type:{...status.type,state:'post',completed:true}},competitors:[]}]},
    scoringPlays,
    plays:[...scoringPlays,...wpPlays],
    winprobability:wpPlays.map((play,index) => ({homeWinPercentage:.48+index*.02,playId:play.id}))
  };
}

test('trajectory chronology preserves regulation, overtime and extra innings beyond 1', () => {
  const regulationPlays = [
    {id:'r1',period:{number:4},clock:{displayValue:'1:00'},homeScore:100,awayScore:100,scoringPlay:true},
    {id:'r2',period:{number:4},clock:{displayValue:'0:00'},homeScore:102,awayScore:100,scoringPlay:true}
  ];
  const regulation = chronologySummary({period:4,displayClock:'0:00'},regulationPlays);
  const regulationOutput = analyzeTrajectory('NBA',regulation);
  assert.equal(regulationOutput.trajectoryEndPosition,1);

  const otPlays = [
    ...regulationPlays,
    {id:'o1',period:{number:5},clock:{displayValue:'4:00'},homeScore:102,awayScore:103,scoringPlay:true},
    {id:'o2',period:{number:5},clock:{displayValue:'1:00'},homeScore:105,awayScore:103,scoringPlay:true}
  ];
  const otWp = [
    {id:'ow1',period:{number:5},clock:{displayValue:'4:30'}},
    {id:'ow2',period:{number:5},clock:{displayValue:'0:30'}}
  ];
  const overtime = chronologySummary({period:5,displayClock:'0:00'},otPlays,otWp);
  const overtimeOutput = analyzeTrajectory('NBA',overtime);
  const overtimePositions = require('../scoring/shared/trajectory.js').scoringMoments('NBA',overtime).map(item => item.position);
  assert.ok(overtimeOutput.trajectoryEndPosition > 1,overtimeOutput);
  assert.ok(overtimePositions.at(-1) > overtimePositions.at(-2),overtimePositions);
  assert.ok(overtimeOutput.wpCoverageStart > 1,overtimeOutput);
  assert.ok(overtimeOutput.wpCoverageEnd > overtimeOutput.wpCoverageStart,overtimeOutput);

  const extrasPlays = [
    {id:'e1',period:{number:10,displayValue:'Top 10th'},homeScore:4,awayScore:5,scoringPlay:true},
    {id:'e2',period:{number:10,displayValue:'Bottom 10th'},homeScore:5,awayScore:5,scoringPlay:true},
    {id:'e3',period:{number:11,displayValue:'Top 11th'},homeScore:5,awayScore:6,scoringPlay:true},
    {id:'e4',period:{number:11,displayValue:'Bottom 11th'},homeScore:7,awayScore:6,scoringPlay:true}
  ];
  const extrasWp = [
    {id:'ew1',period:{number:10,displayValue:'Top 10th'}},
    {id:'ew2',period:{number:11,displayValue:'Bottom 11th'}}
  ];
  const extras = chronologySummary({period:11,type:{detail:'Bottom 11th'},displayClock:''},extrasPlays,extrasWp);
  const extrasOutput = analyzeTrajectory('MLB',extras);
  const extraPositions = require('../scoring/shared/trajectory.js').scoringMoments('MLB',extras).map(item => item.position);
  assert.ok(extrasOutput.trajectoryEndPosition > 1.1,extrasOutput);
  assert.equal(new Set(extraPositions).size,4,extraPositions);
  assert.ok(extraPositions.every(position => position > 1),extraPositions);
  assert.ok(extrasOutput.wpCoverageEnd > extrasOutput.wpCoverageStart,extrasOutput);
});
