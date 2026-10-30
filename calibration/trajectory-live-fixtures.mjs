import {createRequire} from 'node:module';
import {historySummary} from './trajectory-archetypes.mjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
const require = createRequire(import.meta.url);
const {fixture:hockeyFixture,goal} = require('../test/helpers/nhl-calibration.cjs');
const classic = [[.04,7,0],[.12,7,7],[.22,14,7],[.32,14,14],[.42,21,14],[.52,21,21],[.65,28,21],[.78,28,28]];
const poor = [[.04,7,0],[.12,14,0],[.22,21,0],[.32,28,0],[.70,28,7],[.73,28,14],[.76,28,21],[.78,28,28]];
const positions = [0,.1,.2,.3,.4,.5,.6,.7,.8,.9,.98];
function make(id,scores,wp,{decisive=false,end=.98}={}) {
  const summary = historySummary(scores,wp,end);
  const competition = summary.header.competitions[0];
  const last = scores.filter(([p]) => p <= end).at(-1);
  competition.competitors = ['h','a'].map((id,i) => ({homeAway:i?'away':'home',score:String(last[i+1]),
    team:{id,displayName:i?'Away':'Home',abbreviation:i?'AWY':'HME'}}));
  competition.situation = decisive ? {possession:'a',down:4,distance:2,yardLine:80,
    possessionText:'HME 20',downDistanceText:'4th & 2 at HME 20',homeTimeouts:0,awayTimeouts:0} : {};
  const event = {id,name:'Away at Home',competitions:[competition]};
  // Fixed current non-scoring marker, identical within each pair.
  summary.plays.push({id:'present',period:{number:competition.status.period},clock:{displayValue:competition.status.displayClock},
    homeScore:last[1],awayScore:last[2],text:'Current possession'});
  return {id,sport:'NFL',event,competition,summary};
}
export function pairedHistories() {
  const wp = positions.map(p => [p,p === .98 ? .75 : .5]);
  const badWp = positions.map(p => [p,p === .98 ? .75 : p >= .8 ? .9 : .98]);
  const pairs = {};
  for (const decisive of [true,false]) {
    const kind = decisive?'decisive':'neutral';
    pairs[kind] = [make(`${kind}-classic`,classic,wp,{decisive}),make(`${kind}-poor`,poor,badWp,{decisive})];
  }
  pairs.falseClose = [make('genuine',classic,wp),make('false-close',classic,positions.map(p => [p,p===.98?.75:.98]))];
  const dead = [...classic.filter(([p])=>p<=.52),[.65,28,21],[.72,35,21],[.8,42,21],[.9,49,21]];
  const deadWp = positions.map(p=>[p,p>.6?.999:.5]);
  pairs.nowBlowout = [make('competitive-now-blowout',dead,deadWp),make('poor-now-blowout',
    [[.04,7,0],[.12,14,0],[.22,21,0],[.32,28,0],[.42,35,0],[.52,42,0],[.65,49,0],[.72,49,7],[.8,49,14],[.9,49,21]],
    positions.map(p=>[p,.999]))];
  return pairs;
}
export function evidenceHistories() {
  const full = positions.map(p=>[p,p===.98?.75:.5]);
  const variants = {full,missing:[],singleton:full.slice(-1),earlyOnly:full.filter(([p])=>p<=.3),
    lateOnly:full.filter(([p])=>p>=.8),sparse:[full[0],full.at(-1)],internalGap:full.filter(([p])=>p<.2||p>.8)};
  return Object.fromEntries(Object.entries(variants).map(([id,wp])=>[id,make(`evidence-${id}`,classic,wp)]));
}
export function tinyMovementHistory() {
  const input = make('tiny-late-movement',[[0,0,0]],[[0,.7],[.8,.7],[.9,.70001],[.98,.7]]);
  input.summary.scoringPlays=[];
  input.summary.plays=input.summary.plays.filter(p=>!p.scoringPlay);
  return input;
}
export function hockeyHistories() {
  const quiet = [goal(1,0,1,'5:00'),goal(1,1,1,'10:00'),goal(2,1,2,'5:00'),goal(2,2,2,'10:00')];
  const recent = [goal(1,0,1,'5:00'),goal(2,0,2,'5:00'),goal(2,1,3,'17:00'),goal(2,2,3,'19:50')];
  return Object.fromEntries([
    ['regulation-quiet',{clock:'0:10',plays:quiet}],['regulation-recent',{clock:'0:05',plays:recent}],
    ['ot-start',{period:4,clock:'5:00',plays:quiet}],['ot-middle',{period:4,clock:'2:30',plays:quiet}],
    ['ot-end',{period:4,clock:'0:01',plays:quiet}],['shootout',{period:5,shootout:true,plays:quiet}],
    ['playoff-ot',{period:4,clock:'15:00',postseason:true,plays:quiet}]
  ].map(([id,options])=>[id,{id,sport:'NHL',...hockeyFixture(options)}]));
}
export function prepareSynthetic(input) {
  const game = normalizeEvent(input.event,input.sport);
  enrichGame(game,input.summary);
  return game;
}
