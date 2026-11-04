// Offline preservation audit. No stored rating or original fixture is changed.
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from './replay-inputs.mjs';
import * as active from '../alerts-worker/src/live-game-model.js';
import {evaluate} from '../test/helpers/live-underdog-scenarios.mjs';

const require=createRequire(import.meta.url),frozen={exports:{}};
vm.runInNewContext(gunzipSync(fs.readFileSync('test/fixtures/live-underdog-before.cjs.gz')).toString(),
  {module:frozen,exports:frozen.exports,require,URL,console});
const before=frozen.exports,hash=b=>createHash('sha256').update(b).digest('hex');
const baseline='0f0eb90dc332e951afc3a20e3226f99e951a6cec';
const newerProduction='3d14f0006113f390bb8adfd81728036e4dafa70c';
const fields=['score','baseScore','openingScore','rawPregameScore','factors','momentumPoints','upsetPoints','upsetText',
  'openingFactors','live','trajectoryScoring','historyOwnership'];
const scoringBytes=g=>JSON.stringify(Object.fromEntries(fields.filter(k=>g[k]!==undefined).map(k=>[k,g[k]])));
const stats={},failures=[];
function check(input,label){
  const a=scoringBytes(evaluate(before,input)),b=scoringBytes(evaluate(active,input));
  stats[input.sport]??={games:0,endStates:0,replayStates:0,byteIdentical:0};
  stats[input.sport][label.playId?'replayStates':'endStates']++;
  if(a===b)stats[input.sport].byteIdentical++;
  else failures.push({...label,sport:input.sport,before:JSON.parse(a),after:JSON.parse(b)});
}
for(const f of loadFixtures().filter(f=>!['NFL','CFB','NBA','NCAAB'].includes(f.modelSport))){
  const sport=f.modelSport;
  check({sport,event:f.event,summary:f.summary},{id:f.eventId});stats[sport].games++;
  for(const cp of replayCheckpoints(f).checkpoints){
    check({sport,event:{...cp.event,competitions:[cp.competition]},competition:cp.competition,summary:cp.summary},
      {id:f.eventId,playId:cp.play.id});
  }
}
// Source comparison proves scopes beyond archived coverage are unmodified.
const scoringPaths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'--','rating-core.js','scoring'],{encoding:'utf8'}).trim().split('\n');
const changedScoring=scoringPaths.filter(p=>{
  const original=execFileSync('git',['show',`${baseline}:${p}`]);
  return hash(original)!==hash(fs.readFileSync(p));
});
const allowed=new Set(['scoring/live-runtime.cjs','scoring/football-live.cjs']);
if(changedScoring.some(p=>!allowed.has(p)))failures.push({unexpectedScoringSourceChanges:changedScoring});
const newerFiles=execFileSync('git',['diff','--name-only',baseline,newerProduction],{encoding:'utf8'}).trim().split('\n');
const scoringChangesInNewerProduction=newerFiles.filter(p=>p==='rating-core.js'||p.startsWith('scoring/')||p.startsWith('alerts-worker/src/'));
if(scoringChangesInNewerProduction.length)failures.push({scoringChangesInNewerProduction});
const output={baseline,newerProduction,scoringFieldsCompared:fields,stats,changedExistingScoringFiles:changedScoring,
  newScoringModule:'scoring/basketball-upset.cjs',scoringChangesInNewerProduction,
  newerProductionFiles:newerFiles,failures,
  releaseRestriction:'712f221 predates production mobile UI commit 3d14f00. Release must carry this calibration and alert fix on top of current production; publishing this older branch wholesale is prohibited.'};
fs.mkdirSync('audit/final-release-712f221',{recursive:true});
fs.writeFileSync('audit/final-release-712f221/preservation.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({stats,changedScoring,scoringChangesInNewerProduction,failures:failures.length},null,2));
if(failures.length)process.exitCode=1;
