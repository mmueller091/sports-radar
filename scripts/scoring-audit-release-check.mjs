// Offline release comparison against an explicit immutable production checkout.
// Reconstructed play prefixes are not claims about original provider availability.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire,Module} from 'node:module';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from './replay-inputs.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const option=name=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:null;};
const baseline=option('--baseline-dir');
if(!baseline)throw new Error('Provide --baseline-dir pointing to the verified production checkout.');
const baselineRoot=path.resolve(baseline),perGame=Number(option('--per-game')||20);
if(!Number.isInteger(perGame)||perGame<2||perGame>100)throw new Error('--per-game must be 2 to 100.');
const require=createRequire(import.meta.url),{buildSync}=require('../alerts-worker/node_modules/esbuild');
const hash=value=>createHash('sha256').update(value).digest('hex');
function apiAt(directory){
  const built=buildSync({entryPoints:[path.join(directory,'alerts-worker/src/live-game-model.js')],bundle:true,
    write:false,format:'cjs',platform:'node',target:'node22',logLevel:'silent',
    nodePaths:[path.join(root,'alerts-worker/node_modules')]}).outputFiles[0].text;
  const filename=path.join(directory,'release-replay.cjs'),compiled=new Module(filename);
  compiled.filename=filename;
  compiled.paths=Module._nodeModulePaths(directory);
  compiled._compile(built,filename);
  return {api:compiled.exports,bundleSha256:hash(built)};
}
const before=apiAt(baselineRoot),after=apiAt(root);
const evaluate=(api,sport,event,summary)=>{
  const g=api.normalizeEvent(structuredClone(event),sport);
  api.enrichGame(g,summary&&structuredClone(summary));return g;
};
const detail=g=>({rating:g.score,base:g.baseScore,opening:g.openingScore,factors:g.factors,
  liveBonus:g.live?.bonus,momentum:g.momentumPoints,trajectory:g.trajectoryScoring?.adjustment,
  quality:g.evidenceQuality,partial:g.scoringPartial,timingUncertain:g.timingUncertain});
const rows=[],inputs=[];
function compare(f,event,summary,kind,playId=null){
  const a=evaluate(before.api,f.modelSport,event,summary),b=evaluate(after.api,f.modelSport,event,summary);
  const x=detail(a),y=detail(b),delta=Number.isFinite(a.score)&&Number.isFinite(b.score)?b.score-a.score:null;
  rows.push({sport:f.modelSport,id:String(f.eventId||event.id),kind,playId,state:b.state,
    period:event.competitions?.[0]?.status?.period,clock:event.competitions?.[0]?.status?.displayClock,
    before:a.score,after:b.score,delta,openingBefore:a.openingScore,openingAfter:b.openingScore,
    numericalChanged:JSON.stringify(x)!==JSON.stringify(y),
    crossings:[85,90].filter(t=>Number.isFinite(a.score)&&Number.isFinite(b.score)&&((a.score<t&&b.score>=t)||(a.score>=t&&b.score<t))),
    ...(delta||JSON.stringify(x)!==JSON.stringify(y)?{beforeDetail:x,afterDetail:y}:{})});
}
const fixtures=loadFixtures();
for(const f of fixtures){
  inputs.push({sport:f.modelSport,id:String(f.eventId||f.event.id),sha256:hash(JSON.stringify({event:f.event,summary:f.summary}))});
  compare(f,f.event,f.summary,'captured end state');
  const all=replayCheckpoints(f).checkpoints;
  const positions=[...new Set(Array.from({length:Math.min(perGame,all.length)},(_,i)=>Math.round(i*(all.length-1)/(Math.min(perGame,all.length)-1||1))))];
  for(const i of positions){const cp=all[i];compare(f,cp.event,cp.summary,'sampled causal archived-play reconstruction',String(cp.play.id));}
}
const bySport=Object.fromEntries([...new Set(rows.map(r=>r.sport))].map(sport=>{
  const selected=rows.filter(r=>r.sport===sport),live=selected.filter(r=>r.kind!=='captured end state');
  return [sport,{games:fixtures.filter(f=>f.modelSport===sport).length,checkpoints:live.length,
    changed:live.filter(r=>r.delta).length,minDelta:Math.min(0,...live.map(r=>r.delta||0)),maxDelta:Math.max(0,...live.map(r=>r.delta||0)),
    crossing85:live.filter(r=>r.crossings.includes(85)).length,crossing90:live.filter(r=>r.crossings.includes(90)).length}];
}));
const nonliveChanges=rows.filter(r=>r.state!=='live'&&r.numericalChanged);
const openingChanges=rows.filter(r=>r.openingBefore!==r.openingAfter);
const outsideScopeChanges=rows.filter(r=>!['NHL','CFB','NBA','NCAAB'].includes(r.sport)&&r.numericalChanged);
const output={baselineCommit:execFileSync('git',['-C',baselineRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  beforeBundleSha256:before.bundleSha256,afterBundleSha256:after.bundleSha256,
  limitation:'Fixed evenly spaced archived-play prefix sample per game. Missing original live inputs remain missing. Not a full every-play replay or reconstruction of delivered alerts.',
  fixtureCount:fixtures.length,perGame,bySport,nonliveChanges,openingChanges,outsideScopeChanges,
  crossings:rows.filter(r=>r.crossings.length),changed:rows.filter(r=>r.numericalChanged),inputs};
if(option('--out'))fs.writeFileSync(path.resolve(option('--out')),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({...output,inputs:undefined,changed:undefined,crossings:output.crossings.length},null,2));
if(nonliveChanges.length||openingChanges.length||outsideScopeChanges.length)process.exitCode=1;
