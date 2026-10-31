import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import * as adapter from '../alerts-worker/src/game-model.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs'),h=require('../test/helpers/opening-transition.cjs');
const deployed=process.argv.includes('--production');
const site='https://mmueller091.github.io/sports-radar/';
const worker='https://sports-radar-alerts.mmueller918.workers.dev';
const get=async url=>{const r=await fetch(url,{cache:'no-store'});assert.equal(r.ok,true,`${url}: ${r.status}`);return r;};
const source=deployed ? await (await get(site+'scoring-runtime.js?verify='+Date.now())).text() : fs.readFileSync('dist/scoring-runtime.js','utf8');
const browser=vm.runInNewContext(source+';SportsRadarScore');
assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
const probes=[];
for(const sport of Object.keys(h.starts)) {
  const e=h.event(sport),a=h.controlledBaseline(adapter.normalizeEvent(e,sport));
  const b=h.controlledBaseline(adapter.normalizeEvent(structuredClone(e),sport));
  runtime.applyLiveSnapshot(a,e.competitions[0],h.summary(e));
  browser.applyLiveSnapshot(b,b.sourceCompetition,h.summary(b.sourceEvent));
  assert.equal(a.score,53,sport);assert.equal(b.score,a.score,sport);
  assert.deepEqual(JSON.parse(JSON.stringify(b.factors)),JSON.parse(JSON.stringify(a.factors)),sport);
  // A fresh browser runtime receives the serialized observed baseline again on reload.
  const reloaded=vm.runInNewContext(source+';SportsRadarScore');
  const c=adapter.normalizeEvent(structuredClone(e),sport);
  assert.equal(reloaded.preservePregameBaseline(c,JSON.parse(JSON.stringify(b))),true);
  reloaded.applyLiveSnapshot(c,c.sourceCompetition,h.summary(c.sourceEvent));assert.equal(c.score,53,sport);
  probes.push({sport,opening:53,firstLive:b.score,afterReload:c.score});
}
const result={model:runtime.MODEL_VERSION,deployed,probes};
if(deployed) {
  const health=await (await get(worker+'/health')).json(),feed=await (await get(worker+'/feed')).json();
  assert.equal(health.modelVersion,runtime.MODEL_VERSION);assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
  assert.ok(feed.games.length>0);
  for(const game of feed.games.filter(g=>g.state!=='completed')) {
    assert.equal(game.modelVersion,runtime.MODEL_VERSION);
    assert.ok(game.pregameBaseline,`${game.sport}:${game.id} missing baseline`);
    assert.ok(Math.abs(game.openingFactors.reduce((sum,f)=>sum+f.points,0)-game.rawPregameScore)<1e-6,`${game.sport}:${game.id} factor sum`);
  }
  const html=await (await get(site+'?verify='+Date.now())).text();
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.ok(html.includes('scoring-runtime.js?rev='+revision),'Pages revision');
  const sw=await (await get(site+'sw.js?verify='+Date.now())).text();assert.ok(sw.includes(revision),'service-worker cache revision');
  const example=feed.games.find(g=>g.sport==='NHL' && String(g.id)==='401892617');
  if(example) {
    assert.ok(!(example.qualitativeContexts || []).some(c=>/Wild take win streak|after overtime win/i.test(c.sourceTitle || c.text)),'invalid NHL context persists');
  }
  Object.assign(result,{revision,healthModel:health.modelVersion,feedModel:feed.modelVersion,updatedAt:feed.updatedAt,games:feed.games.length,
    site,worker,nhlExample:example?{score:example.score,openingScore:example.openingScore,rawPregameScore:example.rawPregameScore,baselineSource:example.pregameBaseline?.source}:null});
}
fs.mkdirSync('work/opening-transition',{recursive:true});
fs.writeFileSync(`work/opening-transition/${deployed?'production':'build'}-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
