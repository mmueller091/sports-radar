// Reproducible offline comparison. No providers, AI, D1 writes or publication.
import fs from 'node:fs';import path from 'node:path';import {gunzipSync} from 'node:zlib';import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
import {build} from '../alerts-worker/node_modules/esbuild/lib/main.js';
import * as active from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
import context from '../scoring/shared/context.js';
import {auditQualitativeContext} from '../live-audit-worker/src/qualitative-quality.js';
import {replayCheckpoints} from './replay-inputs.mjs';
const baseline='227981d6a30ebc8477fb2ebcca0cea4429399f80',dir='work/storyline-baseline',out='audit/storyline-significance-20261104';
fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(out,{recursive:true});
execFileSync('git',['archive','--format=tar','--output=work/storyline-baseline.tar',baseline]);
execFileSync('tar',['-xf','work/storyline-baseline.tar','-C',dir]);
await build({stdin:{contents:`export * from "./${dir}/alerts-worker/src/live-game-model.js";`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',outfile:'work/storyline-before.mjs'});
const before=await import(pathToFileURL(path.resolve('work/storyline-before.mjs')));
const fixture=JSON.parse(fs.readFileSync('test/fixtures/storyline-significance-20261104.json'));
const feed=JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/storyline-feed-20261104.json.gz'))),now=Date.parse(feed.updatedAt);
Date.now=()=>now;
function score(api,event,summary,sport,contexts=[]){const g=api.normalizeEvent(structuredClone(event),sport);api.enrichGame(g,structuredClone(summary));if(g.id===fixture.game.id)nflPregameContext(g,summary,[],[],now);if(contexts.length)api.applyContextsToGame(g,structuredClone(contexts),now);return g;}
const a=score(before,fixture.event,fixture.summary,'NFL',fixture.game.qualitativeContexts),b=score(active,fixture.event,fixture.summary,'NFL',fixture.contexts);
if(a.score!==44||b.score!==40||JSON.stringify(a.factors.filter(f=>f.contextType!=='confirmed_key_starters'))!==JSON.stringify(b.factors))throw Error('Frozen target does not isolate the four-point correction');
const archived=[],liveCheckpoints=[];
for(const file of fs.readdirSync('test/fixtures/real-games').filter(f=>f.endsWith('.json'))){
 const f=JSON.parse(fs.readFileSync('test/fixtures/real-games/'+file));if(!f.event||!f.modelSport)continue;
 const old=score(before,f.event,f.summary,f.modelSport),next=score(active,f.event,f.summary,f.modelSport);archived.push({file,sport:f.modelSport,state:old.state,id:old.id,before:old.score,after:next.score,scoreChanged:old.score!==next.score,factorsChanged:JSON.stringify(old.factors)!==JSON.stringify(next.factors)});
 const cps=replayCheckpoints(f).checkpoints,indices=[...new Set(Array.from({length:Math.min(20,cps.length)},(_,i)=>Math.round(i*(cps.length-1)/Math.max(1,Math.min(20,cps.length)-1))))];
 for(const i of indices){const cp=cps[i],a=score(before,cp.event,cp.summary,f.modelSport),b=score(active,cp.event,cp.summary,f.modelSport);liveCheckpoints.push({file,sport:f.modelSport,id:a.id,playId:cp.play.id,state:a.state,before:a.score,after:b.score,scoreChanged:a.score!==b.score,factorsChanged:JSON.stringify(a.factors)!==JSON.stringify(b.factors)});}
}
const frozen=feed.games.map(g=>{
  // Exact context-component counterfactual; unchanged observed gameplay and
  // market components are held fixed. Full-model replay is reported separately.
  const rejected=(g.factors||[]).filter(f=>f.contextType).filter(f=>{const story=(g.qualitativeContexts||[]).find(s=>s.type===f.contextType&&s.text===f.contextText);return story&&!context.qualitativeAssessment(story).eligible;});
  if(g.state!=='upcoming'&&rejected.length)throw Error('Started-game context dependency requires separate full-input replay');
  const delta=-rejected.reduce((n,f)=>n+f.points,0),raw=Number.isFinite(g.rawPregameScore)?g.rawPregameScore:g.score;
  return {sport:g.sport,id:g.id,state:g.state,matchup:g.teams.map(t=>t[0]).join(' at '),before:g.score,after:delta?Math.min(90,Math.max(1,Math.round(raw+delta))):g.score,rawDelta:delta,cause:rejected.map(f=>({type:f.contextType,pointsRemoved:f.points,text:f.contextText}))};
});
const afterGames=feed.games.map(g=>g.id===b.id?{...g,...b,editorialStorylines:g.editorialStorylines}:g);
const findings=afterGames.flatMap(g=>auditQualitativeContext(g).findings.map(f=>({gameKey:g.sport+':'+g.id,...f})));
const report={baseline,capturedAt:feed.updatedAt,fixtureSha256:createHash('sha256').update(fs.readFileSync('test/fixtures/storyline-feed-20261104.json.gz')).digest('hex'),target:{id:b.id,before:a.score,after:b.score,rawBefore:a.rawPregameScore,rawAfter:b.rawPregameScore,beforeFactors:a.factors,afterFactors:b.factors,publicContext:b.pregameContextSummary},frozenComparisonBasis:'Context-component counterfactual on all frozen published games; only the target is also replayed from cached provider inputs.',frozen,archived,liveCheckpoints,liveSampling:'At most 20 evenly spaced chronological checkpoints per retained game, including first and last. Not observed historical ratings.',remainingFindings:findings};
fs.writeFileSync(out+'/replay.json',JSON.stringify(report,null,2)+'\n');
const changed=frozen.filter(r=>r.before!==r.after);
console.log(JSON.stringify({frozenGames:frozen.length,changed,archived:archived.length,liveCheckpoints:liveCheckpoints.length,replayChanges:[...archived,...liveCheckpoints].filter(r=>r.scoreChanged||r.factorsChanged),remainingFindings:findings.length},null,2));
if([...archived,...liveCheckpoints].some(r=>r.scoreChanged||r.factorsChanged)||changed.length!==1||changed[0].id!==b.id)throw Error('Unexpected replay difference; do not publish');
