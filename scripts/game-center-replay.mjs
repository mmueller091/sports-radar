import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const [root,output]=process.argv.slice(2);
if(!root||!output)throw Error('Usage: node scripts/game-center-replay.mjs checkout output.json');
Date.now=()=>1793630000000;
const load=relative=>import(pathToFileURL(path.join(root,relative)));
const active=await load('alerts-worker/src/live-game-model.js');
const {loadFixtures}=await load('calibration/helpers.mjs');
const {replayCheckpoints}=await load('scripts/replay-inputs.mjs');
const results=[];
const evaluate=(key,sport,event,summary)=>{
  const game=active.normalizeEvent(structuredClone(event),sport);
  if(!game)return;
  active.enrichGame(game,structuredClone(summary));
  results.push({key,sport,state:game.state,score:game.score,hash:createHash('sha256').update(JSON.stringify(game)).digest('hex')});
};
for(const fixture of loadFixtures()){
  evaluate(fixture.eventId+':captured',fixture.modelSport,fixture.event,fixture.summary);
  for(const [i,cp]of replayCheckpoints(fixture).checkpoints.entries())evaluate(fixture.eventId+':'+i,fixture.modelSport,{...cp.event,competitions:[cp.competition]},cp.summary);
}
fs.writeFileSync(output,JSON.stringify({count:results.length,results},null,2));
console.log(`${results.length} complete scoring outputs captured in ${output}`);
