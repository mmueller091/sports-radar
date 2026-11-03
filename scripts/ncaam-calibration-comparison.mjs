// Fixed production captures plus clearly marked counterfactual game states.
// The same script runs on the baseline and proposed model for paired results.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {replayCheckpoints} from './replay-inputs.mjs';
import {frame,evaluate} from '../test/helpers/basketball-audit.mjs';
import * as active from '../alerts-worker/src/live-game-model.js';

const require=createRequire(import.meta.url);
const core=require('../rating-core.js');
const runtime=require('../scoring/live-runtime.cjs');
const {candidateGameRating}=require('../calibration/shadow-candidate.cjs');
const path='audit/ncaam-20261102/';
const read=name=>JSON.parse(fs.readFileSync(path+name,'utf8').replace(/^\uFEFF/,''));
const board=read('espn-scoreboard-after.json');
const miamiRows=read('miami-production-snapshots.json')[0].results;
const miamiStored=JSON.parse(miamiRows.find(row=>row.observed_at===1793663490000).normalized_state);
const armyStored=read('army-worker-before.json').sportsRadarGame;
const checkpoint=(name,id,predicate)=>{
 const event=board.events.find(item=>String(item.id)===id);
 return replayCheckpoints({modelSport:'NCAAB',event,summary:read(name+'-summary-after.json')}).checkpoints.find(predicate);
};
const miami=checkpoint('miami','401906769',p=>p.competition.status.displayClock==='3:01'&&
 p.competition.competitors.find(t=>t.homeAway==='away').score==='31');
const army=checkpoint('army','401909562',p=>p.competition.status.displayClock==='11:30'&&
 p.competition.competitors.find(t=>t.homeAway==='away').score==='6');
if(!miami||!army)throw Error('Captured checkpoints unavailable');
const report={baselineCommit:'5641969b4dba3e4b1aa0f955fc9014dae5dbbc6f',modelVersion:runtime.MODEL_VERSION,cases:[]};
const snapshot=result=>({score:result.score,
 base:result.baseScore,liveBonus:result.liveBonus,progress:result.progress,gap:result.gap,
 providerProbability:result.currentWinProbability,currentTension:result.currentTensionPoints,
 marginCloseness:result.state?.marginCloseness,comebackFeasibility:result.state?.comebackViability,
 genericLeverage:result.genericLeveragePoints,
 context:result.factors.find(f=>f.label==='Pregame context carried into play')?.points||0,
 openingMaturity:result.state?.openingEvidence?.maturity,
 eventHistory:result.momentumPoints,trajectory:result.trajectoryScoring?.adjustment||0,
 factors:result.factors.map(({label,points})=>({label,points}))});
const record=(id,kind,description,game,competition,summary,observed)=>{
 const result=candidateGameRating(core,game,competition,summary,null,runtime.PRODUCTION_POLICY);
 report.cases.push({id,kind,description,observed,openingScore:game.openingScore,...snapshot(result)});
};
const sourceGame=(stored,p)=>({...structuredClone(stored),sourceEvent:p.event,sourceCompetition:p.competition,
 teams:stored.teams.map(t=>[...t])});
const miamiGame=sourceGame(miamiStored,miami);
record('A-live','captured','Florida 41, Miami 31; first half 3:01, observed opening 51',
 miamiGame,miami.competition,miami.summary,40);
for(const [id,edit] of [
 ['A-probability-omitted',summary=>{summary.winprobability=[];}],
 ['A-stale-detail',summary=>{summary.header.competitions[0].status.displayClock='4:00';}]
]){
 const detail=structuredClone(miami.summary);edit(detail);
 const event=structuredClone(miami.event);
 event.competitions[0].situation.lastPlay=structuredClone(miamiStored.liveRawSituation.lastPlay);
 detail.header.competitions[0].situation=structuredClone(event.competitions[0].situation);
 const game=active.normalizeEvent(event,'NCAAB');
 game.pregameBaseline=structuredClone(miamiStored.pregameBaseline);
 active.enrichGame(game,detail);
 report.cases.push({id,kind:'captured-provider-variant',description:id==='A-stale-detail'?'Detail header clock trails the current scoreboard':'Detail probability array omits the current play',
  score:game.score,openingScore:game.openingScore,providerProbability:game.live?.winProbability,
  context:game.factors.find(f=>f.label==='Pregame context carried into play')?.points||0,
  currentTension:game.factors.find(f=>f.label==='Current Tension')?.points||0,
  evidenceQuality:game.evidenceQuality,factors:game.factors.map(({label,points})=>({label,points}))});
}
const armyGame=sourceGame(armyStored,army);
for(const t of armyGame.teams)t[2]=String(army.competition.competitors.find(c=>String(c.team.id)===String(t[8])).score);
record('B-live','captured-reconstruction','Duke 18, Army 6; first half 11:30',
 armyGame,army.competition,army.summary,41);

function adjustedOpening(competition,event,extraFactors=[]){
 const prior={...structuredClone(competition),status:{period:0,displayClock:'0:00',type:{state:'pre'}}};
 prior.competitors.forEach(t=>t.score='0');
 const opening=core.pregameRating('NCAAB',event,prior,'','upcoming');
 const factors=[...opening.factors,...extraFactors];
 return {score:core.clampScore(factors.reduce((sum,f)=>sum+f.points,0)),factors};
}
function hypothetical(id,description,{home,away,period,clock,rankHome=1,rankAway=14,spread=6.5,opening='miami',state='live'}={}){
 const game=sourceGame(miamiStored,miami),competition=structuredClone(miami.competition);
 competition.status={period,displayClock:clock,type:{state:state==='completed'?'post':'in',completed:state==='completed',
  detail:state==='completed'?'Final':period>2?'Overtime':period===1?'1st Half':'2nd Half'}};
 competition.situation={};
 const scores={home,away},ranks={home:rankHome,away:rankAway};
 for(const t of competition.competitors){t.score=String(scores[t.homeAway]);t.curatedRank={current:ranks[t.homeAway]||0};}
 for(const t of game.teams){const c=competition.competitors.find(item=>String(item.team.id)===String(t[8]));
  t[2]=c.score;t[6]=Number(c.curatedRank.current)||'';}
 game.state=state;game.liveRawStatus=competition.status;game.liveRawSituation={};
 game.factors=[];game.momentumPoints=0;game.trajectoryScoring=null;
 if(opening==='recomputed'){
  const odds=spread===null?[]:structuredClone(miamiStored.pregameBaseline.odds);
  if(odds.length){odds[0].spread=-spread;odds[0].details=`FLA -${spread}`;}
  competition.odds=odds;
  const extra=miamiStored.openingFactors.filter(f=>f.label==='Season opener');
  const fresh=adjustedOpening(competition,game.sourceEvent,extra);
  game.openingScore=fresh.score;game.openingFactors=fresh.factors;
  game.pregameBaseline={...game.pregameBaseline,score:fresh.score,factors:fresh.factors,spread,odds};
 }else competition.odds=structuredClone(miamiStored.pregameBaseline.odds);
 game.underdog=home<away?null:miamiStored.underdog;
 if(game.underdog){const upset=core.upsetImpact(game.underdog,game.teams,'live',core.gameProgress('NCAAB',competition),'NCAAB',competition);
  if(upset.points)game.factors.push({label:'Underdog threatens upset',points:upset.points});}
 record(id,'controlled-counterfactual',description,game,competition,null,null);
}
hypothetical('C-top10-close','Both top 10, 35–33, first half 3:01, projected spread 3',
 {home:35,away:33,period:1,clock:'3:01',rankAway:5,spread:3,opening:'recomputed'});
hypothetical('D-ranked-early10','Same ranked matchup, 41–31, first half 3:01, no current WP',
 {home:41,away:31,period:1,clock:'3:01'});
hypothetical('E-ranked-late10','Same ranked matchup, ten-point gap with 2:00 left in regulation',
 {home:74,away:64,period:2,clock:'2:00'});
hypothetical('F-ranked-early22','Ranked favorite ahead 35–13, first half 12:00',
 {home:35,away:13,period:1,clock:'12:00'});
hypothetical('G-ranked-late22','Ranked favorite ahead 84–62, second half 2:00',
 {home:84,away:62,period:2,clock:'2:00'});
hypothetical('H-unranked-close','Unranked 37–35 game, first half 3:01, projected spread 2',
 {home:37,away:35,period:1,clock:'3:01',rankHome:0,rankAway:0,spread:2,opening:'recomputed'});
hypothetical('J1-close-late','Two-point game with 0:48 remaining in regulation',
 {home:70,away:68,period:2,clock:'0:48'});
hypothetical('J2-overtime','Two-point game with 1:30 remaining in overtime',
 {home:82,away:80,period:3,clock:'1:30'});
hypothetical('J3-missing-odds','Ranked 41–31 game, first half 3:01, no odds or current WP',
 {home:41,away:31,period:1,clock:'3:01',spread:null,opening:'recomputed'});
hypothetical('J5-half-end','Ranked 41–31 game at the end of the first half',
 {home:41,away:31,period:1,clock:'0:00'});
hypothetical('J6-second-start','Same ranked 41–31 game at the start of the second half',
 {home:41,away:31,period:2,clock:'20:00'});
const lateComeback=evaluate(active,frame('0:48'));
report.cases.push({id:'I-second-half-comeback',kind:'captured-reconstruction',description:'Notre Dame–Villanova verified late second-half comeback',
 score:lateComeback.score,openingScore:lateComeback.openingScore,context:lateComeback.factors.find(f=>f.label==='Pregame context carried into play')?.points||0,
 currentTension:lateComeback.factors.find(f=>f.label==='Current Tension')?.points||0,
 factors:lateComeback.factors.map(({label,points})=>({label,points}))});
const finalEvent=structuredClone(miami.event);finalEvent.competitions[0].status={period:2,displayClock:'0:00',type:{state:'post',completed:true,detail:'Final'}};
finalEvent.competitions[0].competitors.forEach(t=>t.score=t.homeAway==='home'?'72':'70');
const finalGame=active.normalizeEvent(finalEvent,'NCAAB');
active.enrichGame(finalGame,null);
report.cases.push({id:'J4-completed',kind:'controlled-counterfactual',description:'Two-point regulation final, no detailed history',
 score:finalGame.score,openingScore:finalGame.openingScore,factors:finalGame.factors.map(({label,points})=>({label,points}))});
export {report};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=process.argv[2];if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.cases.map(({id,score,openingScore,context,currentTension,marginCloseness,comebackFeasibility})=>
  ({id,score,openingScore,context,currentTension,marginCloseness,comebackFeasibility})),null,2));
}
