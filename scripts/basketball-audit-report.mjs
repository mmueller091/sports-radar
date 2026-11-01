import fs from 'node:fs';import vm from 'node:vm';import crypto from 'node:crypto';
import * as after from '../alerts-worker/src/live-game-model.js';import runtime from '../scoring/live-runtime.cjs';
import {frame,evaluate,beforeApi,read,captured,recorded} from '../test/helpers/basketball-audit.mjs';
import {replayCheckpoints} from './replay-inputs.mjs';
const before=beforeApi(),copy=x=>structuredClone(x),app=fs.readFileSync('app.js','utf8').replaceAll('\r\n','\n');
const explain=vm.runInNewContext(app.slice(app.indexOf('function explainRating('),app.indexOf('\nfunction trendFor('))+';explainRating');
const rows=[];
for(const clock of ['0:47','0:48','0:24']){
 const f=frame(clock),row={clock,score:[70,68],kind:'reconstructed prefix at the reported scoreboard state'};
 for(const [key,api] of [['before',before],['after',after]]){
  const accepted=evaluate(api,f),missing=evaluate(api,f,null,accepted),partial=copy(f.summary);partial.plays=partial.plays.slice(-2);delete partial.winprobability;
  const shortened=evaluate(api,f,partial,accepted);
  row[key]={accepted:accepted.score,missing:missing.score,shortened:shortened.score,opening:accepted.openingScore,
   factors:accepted.factors,history:accepted.momentumPoints,explanation:key==='after'?explain(accepted):null};
 }
 rows.push(row);
}
const correctedFirst=evaluate(after,frame('0:47'));
const correction=evaluate(after,frame('0:48'),null,correctedFirst);
const replay=[];
const fixtures=[{modelSport:'NCAAB',event:read('scoreboard').events[0],summary:captured},
 ...['NCAAB-20260328-401856574','NCAAB-20260328-401856575','NBA-20261020-401909088','NBA-20261020-401909089','NBA-20261020-401909090'].map(n=>({...JSON.parse(fs.readFileSync(`test/fixtures/real-games/${n}.json`)),modelSport:n.split('-')[0]}))];
for(const f of fixtures){
 const stream=replayCheckpoints(f),checkpoints=stream.checkpoints.filter(p=>p.competition.status.period>=(f.modelSport==='NBA'?4:2));
 const selected=checkpoints.filter(p=>{
  const [a,b]=p.competition.competitors.map(t=>Number(t.score)),[m,s]=String(p.competition.status.displayClock||'').split(':').map(Number);
  return Math.abs(a-b)<=6&&m*60+s<=180;
 });
 // Replay each eligible late event in chronological order. No final player stats
 // or future plays are supplied by the causal input reconstruction.
 let previous=null;const states=[];
 for(const p of selected){
  const input={sport:f.modelSport,event:p.event,summary:p.summary},a=evaluate(after,input,p.summary,previous),b=evaluate(before,input);
  const missing=evaluate(after,input,null,a);
  states.push({clock:p.competition.status.displayClock,scores:a.teams.map(t=>t[2]),before:b.score,after:a.score,missing:missing.score,stable:a.score===missing.score});previous=a;
 }
 replay.push({id:f.event.id,sport:f.modelSport,teams:f.event.name,sourceStates:selected.length,exclusions:stream.exclusions?.length,states});
}
const upcoming=frame();upcoming.event.competitions[0].status={period:0,displayClock:'0:00',type:{state:'pre'}};upcoming.event.competitions[0].competitors.forEach(t=>t.score='0');
upcoming.event.competitions[0].odds=copy(read('history').sportsRadarGame.pregameBaseline.odds);
const preBefore=evaluate(before,upcoming,null),preAfter=evaluate(after,upcoming,null);
const manifest=JSON.parse(fs.readFileSync('test/fixtures/basketball-audit/manifest.json'));
for(const n of ['scoreboard','summary','history','feed','scorer-before.cjs']){const file=`test/fixtures/basketball-audit/${n}${n.endsWith('.cjs')?'.gz':'.json.gz'}`;manifest.sources[n]={...manifest.sources[n],sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')};}
fs.writeFileSync('test/fixtures/basketball-audit/manifest.json',JSON.stringify(manifest,null,2)+'\n');
const report={model:runtime.MODEL_VERSION,baselineCommit:'56761353fdd0b49059cf3a1fb89f3c315218ee91',
 evidenceLimits:['Original per-poll provider bodies were not archived. Recorded ratings are observations; prefix replay and omission variants are reconstructions.','Recorded scoreboard maximum Villanova lead was 11. The later play ledger and team stats both say 10; public prose follows those corrected details.','Observed opening baselines are preserved. The new pregame rating is a counterfactual using verified schedule fields, not an edit to the original 37.'],
 pregame:{before:preBefore.score,after:preAfter.score,explanation:explain(preAfter),factors:preAfter.factors},
 observed:recorded.filter(p=>p.period===2&&p.scoreA==='70'&&p.scoreB==='68'&&['0:47','0:48','0:24'].includes(p.clock)),rows,
 clockCorrection:{before:correctedFirst.score,after:correction.score,clock:correction.liveRawStatus.displayClock},replay};
report.controls=[];
for(const [label,sport,period,clock,gap]of [['ordinary early close game','NCAAB',1,'10:00',2],['ordinary final-minute close game','NCAAB',2,'0:48',2],['late blowout','NCAAB',2,'0:24',20],['NBA close game','NBA',4,'0:48',2]]){
 const f=frame(clock,70,70-gap);f.sport=sport;
 const c=f.event.competitions[0];c.notes=[];c.neutralSite=false;c.venue.address={city:'Home city',state:'Indiana'};c.status.period=period;
 c.competitors.forEach(t=>{t.records=[{type:'total',summary:'15-13'}];delete t.record;});delete c.odds;c.situation={};
 f.summary={header:{competitions:[copy(c)]},plays:[],winprobability:[]};
 report.controls.push({label,before:evaluate(before,f).score,after:evaluate(after,f).score});
}
fs.writeFileSync('calibration/output/basketball-audit-20261101.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pregame:report.pregame,rows:rows.map(r=>({clock:r.clock,before:r.before.accepted,beforeMissing:r.before.missing,after:r.after.accepted,afterMissing:r.after.missing})),correction:report.clockCorrection,replay:replay.map(r=>({id:r.id,states:r.states.length,stable:r.states.every(s=>s.stable),range:[Math.min(...r.states.map(s=>s.after)),Math.max(...r.states.map(s=>s.after))]}))},null,2));
