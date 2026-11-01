// Freeze identical inputs and the production engine before calibration.
import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {refinementData} from './nfl-refinement-report.mjs';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs');
const {build}=require('../alerts-worker/node_modules/esbuild');
const dir='test/fixtures/nfl-pregame',work='work/nfl-competitiveness';
const feed=JSON.parse(fs.readFileSync(`${work}/feed.json`)),sources=refinementData();
const opposition=Object.values(sources.summaries).flatMap(s=>s.standings?.groups || []).flatMap(g=>g.standings?.entries || []);
const events=['week9','week10'].flatMap(name=>JSON.parse(fs.readFileSync(`${work}/${name}.json`)).events);
const games=events.map(event=>{
  const baseline=feed.games.find(g=>g.sport==='NFL' && g.id===event.id);
  assert.ok(baseline);const g=normalizeEvent(structuredClone(event),'NFL');
  if(sources.summaries[g.id])nflPregameContext(g,sources.summaries[g.id],[],opposition,Date.parse(sources.capturedAt));
  applyContextsToGame(g,baseline.qualitativeContexts || []);
  assert.equal(g.score,baseline.score,`${g.id}: capture must reproduce production`);
  return {event:g.sourceEvent,competition:g.sourceCompetition,context:g.context,baseline};
});
const bundle=await build({entryPoints:['scoring/live-runtime.cjs'],bundle:true,platform:'node',format:'cjs',write:false});
assert.ok(!fs.existsSync(`${dir}/competitiveness-before.cjs.gz`),'Never overwrite the frozen production oracle');
fs.writeFileSync(`${dir}/competitiveness-before.cjs.gz`,gzipSync(bundle.outputFiles[0].contents));
fs.writeFileSync(`${dir}/competitiveness-20261101.json.gz`,gzipSync(JSON.stringify({capturedAt:new Date().toISOString(),baselineModel:runtime.MODEL_VERSION,games})));
console.log(`Captured ${games.length} production games, identical evidence, and independent before engine.`);
