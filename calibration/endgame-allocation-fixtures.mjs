import {createRequire} from 'node:module';
import {hockeyHistories} from './trajectory-live-fixtures.mjs';
const require=createRequire(import.meta.url);
const {fixture}=require('../test/helpers/nfl-calibration.cjs');

// Selected and baseline-scored before implementation: 90% and 97% replay
// indices in these five outside-review games. These are regressions, not labels.
export const endgameRegressions=[
  ['401856720','401856720734',1],['401856720','401856720774',1],
  ['401908024','4019080241403030021',47],['401908024','4019080241601010001',48],
  ['401909088','401909088670',46],['401909088','401909088713',8],
  ['401872981','4018729814586',61],['401872981','4018729814895',99],
  ['401892519','401892519000010070',5],['401892519','401892519000010570',3]
];

export function neutralOvertimeInput() {
  const input=hockeyHistories()['ot-start'];input.id='synthetic-500-teams-ot';
  for(const team of input.competition.competitors)team.records=[{type:'total',summary:'5-5'}];
  return input;
}

// Explicit counterfactual context; never historical claims. Re-enrich through
// the same verified-context parser as production. NHL OT variants use a clean
// OT label: the archived clock-bearing label can be misread as OT depth.
export function endgameContextVariants(input) {
  return ['regular-season','postseason','verified-rivalry','verified-storyline','unverified-rivalry'].map(label=>{
    const v=structuredClone(input),postseason=label==='postseason';
    const season={...(v.event.season||{}),type:postseason ? 3 : 2};
    v.event.season=season;v.competition.season=season;v.summary.header.season=season;
    v.event.name=postseason ? (v.sport==='NHL' ? 'Playoffs Game 1' : 'AFC Championship') : 'Away at Home';
    v.competition.notes=[];delete v.competition.series;
    if(v.sport==='NHL' && v.competition.status.period>3) {
      v.competition.status.period=4;
      v.competition.status.type={...v.competition.status.type,detail:'Overtime',shortDetail:'OT'};
    }
    if(label.includes('rivalry') || label==='verified-storyline') v.event.sportsRadarContextFactors=[{
      type:label.includes('rivalry') ? 'rivalry' : 'former_captain_return',
      verified:label!=='unverified-rivalry',confidence:1
    }];
    v.event.competitions=[v.competition];v.summary.header.competitions=[v.competition];
    return {...v,id:`${input.id}-${label}`,label};
  });
}

// Hypothetical team quality and supported postseason stakes, not claims about
// the archived games or an inferred division race. Action/history stay fixed.
export function hypotheticalQualityContexts() {
  const input=neutralOvertimeInput();
  return ['ordinary','strong-teams','strong-teams-postseason'].map(label=>{
    const postseason=label==='strong-teams-postseason';
    const v=endgameContextVariants(input).find(v=>v.label===(postseason?'postseason':'regular-season'));
    for(const team of v.competition.competitors)
      team.records=[{type:'total',summary:label==='ordinary'?'5-5':'8-2'}];
    return {...v,id:`hypothetical-quality-${label}`,label};
  });
}

export function decisiveEndgameInputs() {
  return [
    ['goal-line',{scores:[9,6],clock:'0:15',spot:'BUF 2',down:3,goalToGo:true}],
    ['winning-try',{scores:[9,8],clock:'0:15',spot:'BUF 2',down:0,tryState:true}],
    ['major-defensive',{scores:[9,6],clock:'0:35',spot:'BUF 25',down:4,distance:1,playoff:true,action:true}],
    ['stagnant-control',{scores:[9,6],clock:'0:35',spot:'BUF 25',down:4,distance:1,playoff:true,stagnant:true}],
    ['postseason-ot',{scores:[9,9],period:5,clock:'5:00',spot:'BUF 35',playoff:true,ot:true}]
  ].map(([id,options])=>{
    const v=fixture(options);v.event.id=id;v.event.competitions=[v.competition];
    return {id,sport:'NFL',...v};
  });
}
