import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import * as active from '../alerts-worker/src/live-game-model.js';import {osu,eku,toronto,evaluate} from '../test/helpers/live-sync-scenarios.mjs';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs'),deployed=process.argv.includes('--production');
const site='https://mmueller091.github.io/sports-radar/',worker='https://sports-radar-alerts.mmueller918.workers.dev';
async function get(url){const r=await fetch(url,{cache:'no-store'});assert.ok(r.ok,`${r.status} ${url}`);return r;}
const read=async p=>deployed?(await get(site+p+'?verify='+Date.now())).text():fs.readFileSync('dist/'+p,'utf8');
const browser=vm.runInNewContext(await read('scoring-runtime.js')+';SportsRadarScore');assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
const rows=[];
for(const input of [osu(),eku(),toronto()]){
 const a=evaluate(active,input),b=active.normalizeEvent(structuredClone(input.event),input.sport);b.pregameBaseline=structuredClone(input.baseline);browser.applyLiveSnapshot(b,b.sourceCompetition,structuredClone(input.summary));
 assert.equal(a.score,b.score);assert.deepEqual(JSON.parse(JSON.stringify(a.factors)),JSON.parse(JSON.stringify(b.factors)));
 const missing=evaluate(active,input,null,a),other=active.normalizeEvent(structuredClone(input.event),input.sport);
 browser.preservePregameBaseline(other,b);browser.preserveLiveEvidence(other,b);browser.applyLiveSnapshot(other,other.sourceCompetition,null);
 assert.equal(missing.score,other.score);assert.equal(other.live.probabilityTelemetry.probability,null);
 rows.push({sport:input.sport,id:input.event.id,accepted:a.score,missing:missing.score,upset:a.upsetPoints,opening:a.openingScore});
}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),result={model:runtime.MODEL_VERSION,deployed,revision,rows};
if(deployed){
 const health=await(await get(worker+'/health')).json(),feed=await(await get(worker+'/feed')).json();assert.equal(health.modelVersion,runtime.MODEL_VERSION);assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
 for(const g of feed.games.filter(g=>g.state==='live'))assert.equal(g.modelVersion,runtime.MODEL_VERSION);
 assert.ok((await read('index.html')).includes('scoring-runtime.js?rev='+revision));assert.ok((await read('sw.js')).includes(revision));
 const app=await read('app.js');assert.ok(app.includes('lower viewing priority'));
 Object.assign(result,{workerModel:health.modelVersion,feedModel:feed.modelVersion,updatedAt:feed.updatedAt});
}
fs.mkdirSync('work/live-sync',{recursive:true});fs.writeFileSync(`work/live-sync/${deployed?'production':'build'}-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
