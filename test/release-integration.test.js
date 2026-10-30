import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as legacyAdapter from '../alerts-worker/src/game-model.js';
import * as active from '../alerts-worker/src/live-game-model.js';
import {loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation} from '../scripts/shadow-candidate-report.mjs';
const require=createRequire(import.meta.url);
const legacy=require('../rating-core.js'),runtime=require('../scoring/live-runtime.cjs');
const {candidateGameRating}=require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_CONTEXT_POLICY:policy}=require('../calibration/trajectory-live-policy.cjs');
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const build=entry=>buildSync({entryPoints:[entry],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',logLevel:'silent'}).outputFiles[0].text;
const browser=vm.runInNewContext(build('./scoring/browser-entry.cjs')+';SportsRadarScore');
const fixtures=loadFixtures();

test('normal browser build selects the complete policy with no flags or report infrastructure',()=>{
  assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
  assert.equal(browser.POLICY_ID,policy.id);
  const html=fs.readFileSync('index.html','utf8');
  assert.match(html,/scoring-runtime.js\?rev=/);
  assert.doesNotMatch(html,/src="rating-core/);
  assert.equal(policy.nhlAllocation,true);assert.equal(policy.endgameAllocation,true);assert.equal(policy.cfbContextRetention,true);
});

test('reviewed NFL NHL CFB checkpoints: candidate, browser and active Worker adapter agree',()=>{
  const reviewed=JSON.parse(fs.readFileSync('calibration/trajectory-diagnostic-key.replay-v2.json')).cases;
  const cache=new Map();let count=0;
  for(const review of reviewed) {
    const p=review.provenance;
    const fixture=fixtures.find(f=>String(f.eventId)===String(p?.eventId));
    if(!fixture || !['NFL','NHL','CFB'].includes(fixture.modelSport))continue;
    if(!cache.has(fixture.eventId)) cache.set(fixture.eventId,replayCheckpoints(fixture).checkpoints);
    const cp=cache.get(fixture.eventId).find(c=>String(c.play.id)===String(p.playId));
    if(!cp)continue;
    const prepared=prepareCheckpointEvaluation(legacy,fixture,cp,0);
    const expected=candidateGameRating(legacy,prepared.game,cp.competition,cp.summary,null,policy);
    const event={...cp.event,competitions:[cp.competition]};
    const worker=active.normalizeEvent(structuredClone(event),fixture.modelSport);
    active.enrichGame(worker,structuredClone(cp.summary));
    const bg=legacyAdapter.normalizeEvent(structuredClone(event),fixture.modelSport);
    legacyAdapter.enrichGame(bg,structuredClone(cp.summary));
    const br=browser.applyLiveSnapshot(bg,cp.competition,cp.summary);
    assert.equal(worker.score,expected.score,review.id+' Worker');
    assert.equal(bg.score,expected.score,review.id+' browser');
    assert.deepEqual(JSON.parse(JSON.stringify(br.live)),JSON.parse(JSON.stringify(worker.live)),review.id+' factors');
    assert.equal(worker.modelVersion,runtime.MODEL_VERSION);
    assert.equal(worker.scoringPolicy,policy.id);
    assert.ok(worker.sourceEvent,'source event survives NHL allocation');
    count++;
  }
  assert.ok(count>=10,`reviewed ${count}`);
});

test('every normalized live game gets the policy before enrichment; nonlive behavior unchanged',()=>{
  for(const f of fixtures) {
    const a=legacyAdapter.normalizeEvent(structuredClone(f.event),f.modelSport);
    const b=active.normalizeEvent(structuredClone(f.event),f.modelSport);
    if(!a)continue;
    if(b.state==='live')assert.equal(b.scoringPolicy,policy.id);
    else {
      legacyAdapter.enrichGame(a,f.summary);active.enrichGame(b,f.summary);
      assert.equal(b.score,a.score);assert.deepEqual(b.factors,a.factors);
    }
  }
});

test('missing or rejected summary never carries an old-model history bonus',()=>{
  const f=fixtures.find(f=>f.modelSport==='NFL'),cp=replayCheckpoints(f).checkpoints.at(-2);
  const event={...cp.event,competitions:[cp.competition]};
  const game=active.normalizeEvent(event,'NFL');
  const old={...game,score:99,modelVersion:'old-model',live:{components:{situation:0}}};
  active.enrichGame(game,null,old);
  const fresh=active.normalizeEvent(event,'NFL');
  assert.equal(game.score,fresh.score);assert.equal(game.scoringPartial,true);
  assert.equal(game.momentumPoints,0);
});
