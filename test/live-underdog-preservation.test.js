import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import * as legacy from '../alerts-worker/src/game-model.js';
import {loadFixtures} from '../calibration/helpers.mjs';
import {scenario,evaluate,SPORTS,MARGINS,phases} from './helpers/live-underdog-scenarios.mjs';

const require=createRequire(import.meta.url);
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const frozenBytes=fs.readFileSync('test/fixtures/live-underdog-before.cjs.gz');
const provenance=JSON.parse(fs.readFileSync('test/fixtures/live-underdog-before.provenance.json'));
const frozenModule={exports:{}};
vm.runInNewContext(gunzipSync(frozenBytes).toString(),{module:frozenModule,exports:frozenModule.exports,require,URL,console});
const before=frozenModule.exports;
const browserSource=buildSync({entryPoints:['./scoring/browser-entry.cjs'],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',logLevel:'silent'}).outputFiles[0].text;
const browser=vm.runInNewContext(browserSource+';SportsRadarScore',{URL,console});
const plain=value=>JSON.parse(JSON.stringify(value));
const numerical=game=>plain(Object.fromEntries(['score','baseScore','openingScore','rawPregameScore','factors','momentumPoints','upsetPoints','upsetText','openingFactors','live','trajectoryScoring','historyOwnership'].filter(k=>game[k]!==undefined).map(k=>[k,game[k]])));

test('comparison oracle is frozen at the independently verified production revision',()=>{
 assert.equal(createHash('sha256').update(frozenBytes).digest('hex'),provenance.compressedSha256);
 assert.equal(createHash('sha256').update(gunzipSync(frozenBytes)).digest('hex'),provenance.uncompressedSha256);
 assert.equal(before.runtime.MODEL_VERSION,provenance.sourceModel);
 assert.notEqual(browser.MODEL_VERSION,before.runtime.MODEL_VERSION,'new live scoring must not mix with old-model saved ratings');
});

test('actual browser bundle and Worker agree across all four sports, clock phases and margins',()=>{
 for(const sport of SPORTS)for(const phase of phases(sport))for(const margin of MARGINS)for(const wp of [null,.35]){
  const input=scenario({sport,...phase,margin,wp,spread:sport==='NBA'?14:25.5,possession:wp===null?'unknown':'dog'});
  const worker=evaluate(active,input);
  const inBrowser=evaluate(legacy,input);
  browser.applyLiveSnapshot(inBrowser,structuredClone(input.competition),structuredClone(input.summary));
  assert.deepEqual(numerical(inBrowser),numerical(worker),`${sport} ${phase.phase} margin=${margin} wp=${wp}`);
  assert.equal(inBrowser.modelVersion,worker.modelVersion);
 }
});

test('all archived pregame and completed ratings and non-target live sports retain numerical behavior',()=>{
 let checked=0;
 for(const fixture of loadFixtures()){
  const input={sport:fixture.modelSport,event:fixture.event,summary:fixture.summary};
  const old=evaluate(before,input),next=evaluate(active,input);
  if(old.state==='live'&&SPORTS.includes(input.sport))continue;
  assert.deepEqual(numerical(next),numerical(old),`${input.sport} ${fixture.eventId} ${old.state}`);
  checked++;
 }
 assert.ok(checked>=20,`only ${checked} protected archived inputs`);
 for(const sport of SPORTS)for(const state of ['upcoming','completed'])for(const margin of MARGINS){
  const input=scenario({sport,state,margin});
  assert.deepEqual(numerical(evaluate(active,input)),numerical(evaluate(before,input)),`${sport} ${state} ${margin}`);
 }
});

test('observed opening baselines survive the model change and retain exact factors',()=>{
 for(const sport of SPORTS){
  const opening=scenario({sport,state:'upcoming',home:0,margin:0,period:1,clock:sport==='NCAAB'?'20:00':sport==='NBA'?'12:00':'15:00'});
  const prior=evaluate(before,opening);
  const observed=plain(prior.pregameBaseline);
  const live=scenario({sport,margin:-1});
  const next=evaluate(active,live,prior);
  assert.deepEqual(plain(next.pregameBaseline),observed,sport);
  assert.equal(next.openingScore,prior.score,sport);
  assert.deepEqual(plain(prior.pregameBaseline),observed,'input history must stay immutable');
 }
});

test('new basketball upside remains bounded for impossible comebacks and ordinary close games',()=>{
 for(const sport of ['NBA','NCAAB']){
  const early=evaluate(active,scenario({sport,period:1,clock:sport==='NBA'?'10:00':'18:00',margin:1}));
  assert.ok(early.upsetPoints<=3,`${sport}: early ${early.upsetPoints}`);
  for(const margin of [-14,-7]){
   const dead=evaluate(active,scenario({sport,margin,clock:'0:02',possession:'fav',wp:.001,timeouts:0}));
   assert.equal(dead.upsetPoints,0,`${sport}: impossible margin=${margin}`);
   assert.ok(dead.score<85,`${sport}: dead comeback must not generate an 85+ state (${dead.score})`);
  }
  const even=evaluate(active,scenario({sport,spread:0,margin:-1}));
  assert.equal(even.upsetPoints,0);
 }
});
