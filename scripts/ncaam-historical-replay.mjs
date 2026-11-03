// Paired baseline/candidate replay of the retained causal fixture archive.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from './replay-inputs.mjs';
import {prepareCheckpointEvaluation} from './shadow-candidate-report.mjs';
const require=createRequire(import.meta.url);
const {candidateGameRating}=require('../calibration/shadow-candidate.cjs');
const college=require('../scoring/basketball-calibration.cjs');
const runtime=require('../scoring/live-runtime.cjs');
const core=await loadCore(),fixtures=loadFixtures(),sports={};
for(const fixture of fixtures){
 const sport=fixture.modelSport,record=sports[sport]||={count:0,exclusions:0,states:[]};
 const stream=replayCheckpoints(fixture);record.exclusions+=stream.exclusions.length;
 for(const [i,checkpoint] of stream.checkpoints.entries()){
  const prepared=prepareCheckpointEvaluation(core,fixture,checkpoint,i);
  if(!prepared)continue;
  const policy=sport==='NCAAB'?college.tensionPolicy(prepared.game,checkpoint.competition):null;
  const result=candidateGameRating(core,prepared.game,checkpoint.competition,checkpoint.summary,policy,runtime.PRODUCTION_POLICY);
  const row={id:`${fixture.eventId}:${checkpoint.play.id}`,period:checkpoint.competition.status?.period,
   clock:checkpoint.competition.status?.displayClock,scores:checkpoint.competition.competitors.map(t=>String(t.score)),
   score:result.score,opening:prepared.game.openingScore,base:result.baseScore,
   tension:result.currentTensionPoints,context:result.factors.find(f=>f.label==='Pregame context carried into play')?.points||0};
  record.states.push(row);record.count++;
 }
}
const report={modelVersion:runtime.MODEL_VERSION,sports:Object.fromEntries(Object.entries(sports).map(([sport,r])=>{
 const digest=crypto.createHash('sha256').update(JSON.stringify(r.states)).digest('hex');
 return [sport,{count:r.count,exclusions:r.exclusions,digest,
  ...(sport==='NCAAB'?{states:r.states}:{})}];
}))};
const path=process.argv[2];if(path)fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(report.sports).map(([sport,r])=>[sport,{count:r.count,exclusions:r.exclusions,digest:r.digest}]))));
