import {createRequire} from 'node:module';
import {neutralOvertimeInput} from './endgame-allocation-fixtures.mjs';
const require=createRequire(import.meta.url);
const {fixture,goal}=require('../test/helpers/nhl-calibration.cjs');

// Selected and baseline-scored BEFORE implementing the NHL candidate: 60% and
// 85% indices in the first three eligible games outside the reviewed examples.
export const nhlAdditional=[
  ['401892519','401892519000008130',18],['401892519','401892519000009650',7],
  ['401892520','401892520000006830',61],['401892520','401892520000008950',87],
  ['401892522','401892522000007140',18],['401892522','401892522000009730',2]
];
export const nhlNamed=[
  ...['401892521000009890','401892521000009900','401892521000005010','401892521000009910','401892521000009950']
    .map(play=>['401892521',play]),
  ...['401892524000009020','401892524000008960'].map(play=>['401892524',play])
];

// Hypothetical context comparisons: raw action, score, history, period and
// elapsed OT duration held fixed. Remaining time respects 5/20-minute formats.
export function nhlContextVariants(input=neutralOvertimeInput()) {
  return ['ordinary','strong-teams','unknown-records','rivalry','storyline','unverified-storyline','postseason','deciding-final'].map(label=>{
    const v=structuredClone(input),postseason=['postseason','deciding-final'].includes(label);
    const season={type:postseason?3:2};
    v.event.season=season;v.competition.season=season;v.summary.header.season=season;
    v.event.name=label==='deciding-final'?'Stanley Cup Final Game 7':postseason?'Playoffs Game 1':'Away at Home';
    delete v.competition.series;v.competition.notes=[];
    for(const team of v.competition.competitors) {
      team.records=label==='unknown-records'?[]:[{type:'total',summary:label==='strong-teams'?'8-2':'5-5'}];
    }
    delete v.event.sportsRadarContextFactors;
    if(['rivalry','storyline','unverified-storyline'].includes(label))v.event.sportsRadarContextFactors=[{
      type:label==='rivalry'?'rivalry':'former_captain_return',verified:label!=='unverified-storyline',confidence:1
    }];
    // Use elapsed convention so the same clock describes the same action age
    // in each format. Preserve raw clock-bearing provider labels when present.
    if(Number(v.competition.status.period)===4 && v.competition.status.clockMode!=='elapsed') {
      const parts=v.competition.status.displayClock.split(':').map(Number),elapsed=300-(parts[0]*60+parts[1]);
      v.competition.status.displayClock=`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`;
      v.competition.status.clockMode='elapsed';
    }
    v.event.competitions=[v.competition];v.summary.header.competitions=[v.competition];
    return {...v,id:`hypothetical-${input.id}-${label}`,label};
  });
}

export function nhlSemanticInputs() {
  const history=[goal(1,0,1,'5:00'),goal(1,1,1,'10:00'),goal(2,1,2,'5:00'),goal(2,2,2,'10:00')];
  return [
    ['quiet-tie',{clock:'2:00',plays:history}],
    ['pressure-tie',{clock:'2:00',plays:[...history,...Array.from({length:5},()=>({period:{number:3},clock:{displayValue:'18:00'},text:'Breakaway shot on goal saved by goalie',team:{id:'a'}}))]}],
    ['one-goal-manpower',{gap:1,clock:'2:00',manpower:'sixOnFour',plays:history}],
    ['extraordinary-current',{clock:'2:00',plays:[...history.slice(0,-1),goal(2,2,3,'18:00','Shorthanded goal')]}],
    ['defensive-scoreless',{clock:'2:00',plays:[]}],
    ['settled',{gap:4,clock:'0:30',plays:history}]
  ].map(([id,options])=>{
    const v=fixture(options);
    if(id==='defensive-scoreless')for(const team of v.competition.competitors)team.score='0';
    return {id:`hypothetical-${id}`,label:id,sport:'NHL',...v};
  });
}
