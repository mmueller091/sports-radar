import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import * as active from '../alerts-worker/src/live-game-model.js';
import {baseballSituation,footballSituation} from '../alerts-worker/src/display-model.js';
import helper from '../test/helpers/finish-audit.cjs';
import completed from '../test/helpers/cfb-completed.cjs';
import {replayCheckpoints} from './replay-inputs.mjs';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs');
const deployed=process.argv.includes('--production'),site='https://mmueller091.github.io/sports-radar/',worker='https://sports-radar-alerts.mmueller918.workers.dev';
async function get(url){const r=await fetch(url,{cache:'no-store'});assert.ok(r.ok,`${r.status} ${url}`);return r;}
const read=async p=>deployed?(await get(site+p+'?verify='+Date.now())).text():fs.readFileSync('dist/'+p,'utf8');
const bundle=await read('scoring-runtime.js'),browser=vm.runInNewContext(bundle+';SportsRadarScore');
assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
const adapter=completed.adapter(bundle,{baseballSituation,footballSituation});
function browserScore(event,summary,sport){
 const game=helper.score(adapter,event,summary,sport);
 // The production facade makes the runtime authoritative after legacy
 // normalization/enrichment; mirror that final browser refresh here.
 browser.applyLiveSnapshot(game,game.sourceCompetition,summary);return game;
}
const report=JSON.parse(fs.readFileSync('calibration/output/finish-audit-20261031.json'));
const probes=[];
for(const row of report.rows){
 const f=helper.read(`${row.sport}-${row.id}`),a=helper.score(active,f.event,f.summary,row.sport),b=browserScore(f.event,f.summary,row.sport);
 assert.equal(b.score,a.score);assert.deepEqual(JSON.parse(JSON.stringify(b.factors)),JSON.parse(JSON.stringify(a.factors)));
 assert.equal(a.score,row.after);probes.push({id:row.id,sport:row.sport,score:a.score});
}
const f=helper.read('CFB-401858505'),p=replayCheckpoints(f).checkpoints.find(p=>p.competition.status.period===4&&p.competition.status.displayClock==='2:04');
const e=structuredClone(p.event),s=structuredClone(p.summary);e.competitions[0].status.displayClock='2:00';s.header.competitions[0]=structuredClone(e.competitions[0]);
const a=helper.score(active,e,s,'CFB'),b=browserScore(e,s,'CFB');assert.equal(a.score,b.score);assert.ok(a.score<=75);
probes.push({id:f.event.id,situation:'2:00 third-and-19 own 20',observedBefore:90,reconstructedBefore:helper.score(helper.baseline(),e,s,'CFB').score,after:a.score});
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),result={deployed,revision,model:runtime.MODEL_VERSION,probes};
if(deployed){
 const health=await(await get(worker+'/health')).json(),feed=await(await get(worker+'/feed')).json();
 assert.equal(health.modelVersion,runtime.MODEL_VERSION);assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
 const html=await read('index.html'),sw=await read('sw.js');assert.ok(html.includes('scoring-runtime.js?rev='+revision));assert.ok(sw.includes(revision));
 const finals=[];
 for(const row of report.rows){const g=feed.games.find(g=>g.id===row.id&&g.sport===row.sport);assert.ok(g,`missing ${row.id}`);assert.equal(g.modelVersion,runtime.MODEL_VERSION,`stale model ${row.id}`);assert.equal(g.score,row.after,`live feed ${row.id}`);finals.push({id:g.id,score:g.score});}
 Object.assign(result,{workerModel:health.modelVersion,feedModel:feed.modelVersion,updatedAt:feed.updatedAt,finals});
}
fs.mkdirSync('work/finish-audit',{recursive:true});fs.writeFileSync(`work/finish-audit/${deployed?'production':'build'}-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
