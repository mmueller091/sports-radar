// Reconstructed causal prefixes, not original live arrival streams.
// Usage: node scripts/audit-integrity-replay.mjs <source-root> <output-json>
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'.');
const output=path.resolve(process.argv[3]||'audit/integrity-20261101/replay.json');
const sha=data=>createHash('sha256').update(data).digest('hex');
function sourceFingerprint(base){
 const files=[];
 const walk=dir=>{for(const entry of fs.readdirSync(path.join(base,dir),{withFileTypes:true})){const file=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.(?:c?js|mjs)$/.test(file))files.push(file);}};
 walk('scoring');walk('alerts-worker/src');
 files.push('calibration/trajectory-policy.cjs','calibration/trajectory-live-policy.cjs');
 const manifest=Object.fromEntries(files.sort().map(file=>[file,sha(fs.readFileSync(path.join(base,file)))]));
 return {sha256:sha(JSON.stringify(manifest)),files:manifest};
}
const fingerprint=sourceFingerprint(root);
// Offline causal attribution only. These overrides are never imported by the
// browser/Worker. Restore one audited mechanism while keeping all other fixes.
const restore=process.argv[4]||null,baseline=process.argv[5]&&path.resolve(process.argv[5]);
const mechanisms=restore?restore.split(','):[];
for(const mechanism of mechanisms){
 if(!baseline||!['trajectory','mlb','cfb-retention'].includes(mechanism))throw Error('Invalid offline attribution arguments');
 const require=createRequire(import.meta.url);
 if(mechanism==='trajectory'||mechanism==='mlb'){
  const files=mechanism==='trajectory'?['scoring/shared/trajectory.js','calibration/trajectory-policy.cjs']:['scoring/sports/mlb.js'];
  for(const file of files){const target=require.resolve(path.join(root,file));require(target);require.cache[target].exports=require(path.join(baseline,file));}
 }else{
  const Module=require('node:module'),filename=path.join(root,'scoring/live-runtime.cjs');
  const original=fs.readFileSync(path.join(baseline,'scoring/live-runtime.cjs'),'utf8');
  const target=fs.readFileSync(filename,'utf8');
  const slice=s=>s.slice(s.search(/function (?:retainSettledCfbPath|describeCfbQualitySoFar)\(/),s.indexOf('function applyLiveSnapshot('));
  const restored=target.replace(slice(target),slice(original).replace('retainSettledCfbPath','describeCfbQualitySoFar'));
  const module=new Module(filename);module.filename=filename;module.paths=Module._nodeModulePaths(path.dirname(filename));
  require.cache[filename]=module;module._compile(restored,filename);
 }
}
const active=await import(pathToFileURL(path.join(root,'alerts-worker/src/live-game-model.js')));
const {default:runtime}=await import(pathToFileURL(path.join(root,'scoring/live-runtime.cjs')));
const {replayCheckpoints}=await import(pathToFileURL(path.join(root,'scripts/replay-inputs.mjs')));
const files=['NFL-20261011-401872988.json','CFB-20261017-401856723.json','MLB-20261013-401908024.json','NHL-20261017-401892524.json','NBA-20261020-401909088.json','NCAAB-20260328-401856574.json'];
const results=[];
const copy=x=>structuredClone(x);
for(const file of files){
 const f=JSON.parse(fs.readFileSync(path.join(root,'test/fixtures/real-games',file)));
 if(process.env.AUDIT_SPORTS&&!process.env.AUDIT_SPORTS.split(',').includes(f.modelSport))continue;
 const basketball=['NBA','NCAAB'].includes(f.modelSport);
 const replay=basketball?null:replayCheckpoints(f);
 const checkpoints=basketball?f.summary.plays.flatMap((p,index)=>{
  if(p.homeScore==null||p.awayScore==null||!p.period?.number||!p.clock?.displayValue)return [];
  const competitors=f.summary.header.competitions[0].competitors.map(t=>({team:{id:t.team.id,displayName:t.team.displayName,abbreviation:t.team.abbreviation},homeAway:t.homeAway,score:String(t.homeAway==='home'?p.homeScore:p.awayScore)}));
  const status={period:p.period.number,displayClock:p.clock.displayValue,type:{state:'in',completed:false,detail:p.clock.displayValue+' '+p.period.displayValue}};
  const competition={id:f.eventId,status,competitors,situation:{lastPlay:copy(p)}};
  const plays=copy(f.summary.plays.slice(0,index+1)),ids=new Set(plays.map(x=>String(x.id)));
  return [{play:p,competition,summary:{header:{id:f.eventId,competitions:[copy(competition)]},plays,winprobability:copy((f.summary.winprobability||[]).filter(w=>ids.has(String(w.playId))))}}];
 }):replay.checkpoints;
 let previous=null;const rows=[];
 for(const [index,cp] of checkpoints.entries()){
  const c={id:f.eventId,status:cp.competition.status,situation:cp.competition.situation,season:f.event.season,format:cp.competition.format,competitors:cp.competition.competitors.map(t=>({homeAway:t.homeAway,score:t.score,team:{id:t.team.id,displayName:t.team.displayName,abbreviation:t.team.abbreviation}}))};
  const event={id:f.eventId,name:f.event.name,date:f.event.date,season:f.event.season,competitions:[c]};
  const summary={...cp.summary,header:{season:f.event.season,competitions:[c]}};
  const ids=new Set((summary.plays||[]).map(p=>String(p.id)));
  if((summary.winprobability||[]).some(w=>w.playId!=null&&!ids.has(String(w.playId))))throw Error('WP outside accepted prefix');
  const score=prior=>{const game=active.normalizeEvent(copy(event),f.modelSport);active.enrichGame(game,copy(summary),prior);return game;};
  const fresh=score(null),sequential=restore?fresh:score(previous),repeat=restore?fresh:score(sequential);previous=sequential;
  rows.push({index,playId:cp.play.id,period:c.status.period,clock:c.status.displayClock,score:c.competitors.map(t=>[t.homeAway,t.score]),text:cp.play.text,
   rating:fresh.score,sequential:sequential.score,repeat:repeat.score,partial:fresh.scoringPartial,evidenceQuality:fresh.evidenceQuality,
   reasons:fresh.live?.reasons,factors:fresh.factors,trajectory:fresh.trajectoryScoring,history:fresh.historyOwnership,
   rejected:sequential.basketballUpdateRejected||sequential.liveUpdateRejected||false,quality:fresh.gameQualitySoFar});
 }
 results.push({file,id:f.eventId,sport:f.modelSport,capturedAt:f.capturedAt,source:f.source,count:rows.length,exclusions:replay?.exclusions||[],repairs:replay?.repairs||[],rows});
 console.log(f.modelSport,rows.length,'fresh/stateful differences',rows.filter(r=>r.rating!==r.sequential).length,'repeated differences',rows.filter(r=>r.sequential!==r.repeat).length);
}
if(sourceFingerprint(root).sha256!==fingerprint.sha256)throw Error('Source changed during replay; rerun after freeze');
fs.writeFileSync(output,JSON.stringify({model:runtime.MODEL_VERSION,sourceFingerprint:fingerprint,baselineFingerprint:baseline?sourceFingerprint(baseline):null,runnerSha256:sha(fs.readFileSync(new URL(import.meta.url))),offlineRestoredMechanism:restore,generatedAt:new Date().toISOString(),sourceRoot:root,contextPolicy:'Only identity, season, format, accepted play prefix, reconstructed current scores/clock and anchored available WP. No final boxscore, future result, odds, ranking or final records. Historical finalized-provider chronology remains a reconstruction limitation.',results},null,2));
