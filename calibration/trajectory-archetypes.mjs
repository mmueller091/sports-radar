import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {analyzeTrajectory} = require('../scoring/models.js');
const {trajectoryAdjustment} = require('./trajectory-policy.cjs');

// Synthetic histories go through Phase 1, not hand-authored telemetry. NFL clock
// coordinates use 15-minute quarters; all observations stop at the live endpoint.
function at(position) {
  const elapsed = Math.round(position*3600);
  const period = Math.min(4,Math.floor(elapsed/900)+1);
  const left = period*900-elapsed;
  return {period:{number:period},clock:{displayValue:`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`}};
}
export function historySummary(scores,wp,end=.95) {
  const scoringPlays = scores.filter(([p]) => p <= end).map(([p,homeScore,awayScore],i) =>
    ({id:`s${i}`,...at(p),homeScore,awayScore,scoringPlay:true,text:'Score'}));
  const observations = wp.filter(([p]) => p <= end);
  const markers = observations.map(([p],i) => ({id:`w${i}`,...at(p)}));
  const clock = at(end);
  return {
    header:{competitions:[{status:{period:clock.period.number,displayClock:clock.clock.displayValue,
      type:{state:'in',completed:false}},competitors:[]}]},
    scoringPlays,plays:[...scoringPlays,...markers],
    winprobability:observations.map(([,homeWinPercentage],i) => ({playId:`w${i}`,homeWinPercentage}))
  };
}
const close = [[.05,3,0],[.12,3,7],[.23,10,7],[.36,10,14],[.48,17,14],[.62,17,17],[.76,20,17],[.9,20,20]];
const uncertain = [[0,.5],[.15,.48],[.3,.53],[.45,.47],[.6,.55],[.75,.48],[.95,.5]];
const dominated = [[.02,7,0],[.12,14,0],[.25,21,0],[.4,28,0],[.6,35,0]];
const deadWp = [[0,.85],[.15,.93],[.4,.99],[.6,.995],[.75,.99]];
const definitions = [
  ['sustained',close,uncertain,.95,1],
  ['defensive',[[.08,3,0],[.24,3,7],[.4,10,7],[.65,10,14],[.82,17,14]],uncertain,.95,.9],
  ['high-scoring',Array.from({length:16},(_,i) => [.03+i*.055,7*Math.ceil((i+1)/2),7*Math.floor((i+1)/2)]),uncertain,.95,.9],
  ['false-close',close,[[0,.92],[.2,.93],[.4,.92],[.6,.94],[.8,.91],[.95,.92]],.95,.7],
  ['late-comeback',[...dominated,[.81,35,7],[.86,35,14],[.9,35,21],[.94,35,28]],
    [...deadWp,[.86,.96],[.9,.9],[.95,.75]],.95,.6],
  ['late-chaos',[...dominated,[.8,35,14],[.85,35,21],[.9,35,28],[.94,35,35]],
    [...deadWp,[.85,.8],[.9,.6],[.95,.5]],.95,1],
  ['late-blowout',[...close.filter(([p]) => p < .65),[.68,31,17],[.8,45,17],[.93,52,17]],
    [...uncertain.filter(([p]) => p < .65),[.75,.94],[.95,.999]],.95,0],
  ['blowout',dominated,[...deadWp,[.95,.999]],.95,0],
  ['early',close,uncertain,.12,1],
  ['missing-wp',close,[],.95,1],
  ['single-wp',close,[[.9,.99]],.95,1],
  ['limited-wp',close,[[.85,.9],[.95,.92]],.95,1],
  ['ordinary',[[.04,7,0],[.2,14,0],[.35,14,7],[.5,21,7],[.7,21,14],[.9,28,14]],
    [[0,.65],[.2,.75],[.4,.78],[.6,.8],[.8,.75],[.95,.8]],.95,.65]
];

export function trajectoryArchetypes() {
  return definitions.map(([id,scores,wp,end,currentCloseness]) => {
    const summary = historySummary(scores,wp,end);
    return {id,currentCloseness,summary,telemetry:analyzeTrajectory('NFL',summary,end,'live')};
  });
}

export function evaluateArchetypes(policy) {
  return Object.fromEntries(trajectoryArchetypes().map(({id,currentCloseness,telemetry}) =>
    [id,{telemetry,currentCloseness,...trajectoryAdjustment(telemetry,currentCloseness,policy)}]));
}
