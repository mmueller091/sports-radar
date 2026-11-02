// Historical model oracle, pinned to audited commit 8ad7a009. Never imported by
// production. Its full dependency graph is frozen, unlike the old wrapper that
// silently combined historical orchestration with mutable current sport models.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const crypto=require('node:crypto'),Module=require('node:module');
const assert=require('node:assert/strict');
const directory=path.resolve(__dirname,'../fixtures/audit-20261101');
const provenance=JSON.parse(fs.readFileSync(path.join(directory,'historical-scoring-provenance.json')));
const source=zlib.gunzipSync(fs.readFileSync(path.join(directory,'historical-scoring.cjs.gz'))).toString();
if (crypto.createHash('sha256').update(source).digest('hex')!==provenance.uncompressedSha256)
  throw new Error('Frozen audited scorer hash mismatch');
const globals=['SportsRadarScore','SportsRadarDetail','SportsRadarScoring','SportsRadarWatch'];
const capture=()=>Object.fromEntries(globals.map(key=>[key,globalThis[key]]));
const restore=state=>{for(const key of globals) state[key]===undefined ? delete globalThis[key] : globalThis[key]=state[key];};
const before=capture();
const bundle=new Module(path.join(directory,'historical-scoring.cjs'),module);
bundle.filename=path.join(directory,'historical-scoring.cjs');
bundle._compile(source,bundle.filename);
const captured=capture(),frozen=bundle.exports;
restore(before);
const withFrozenGlobals=fn=>(...args)=>{const previous=capture();restore(captured);try{return fn(...args);}finally{restore(previous);}};
const adapter=Object.fromEntries(Object.entries(frozen.adapter).map(([key,fn])=>[key,withFrozenGlobals(fn)]));
function prepare(input) {
  const before=JSON.stringify([input.event,input.summary]);
  const competition=input.competition || input.event?.competitions?.[0];
  const game=adapter.normalizeEvent(input.event,input.sport);
  adapter.enrichGame(game,input.summary);
  assert.equal(game.sourceCompetition,competition,'Historical competition must remain the reconstructed input');
  assert.equal(JSON.stringify([input.event,input.summary]),before,'Historical evaluation mutated replay inputs');
  return game;
}
// Preserve the independent Phase 3.1 off-path parity oracle as well as the
// frozen artifact comparison; its three imports resolve to the same old model.
const phase31=new Module(path.resolve(__dirname,'../../calibration/phase31-before.cjs'),module);
phase31.require=name=>({
  '../scoring/models.js':frozen.models,
  '../scoring/shared/pressure.js':frozen.pressure,
  './trajectory-policy.cjs':frozen.trajectoryPolicy
})[name] ?? (()=>{throw new Error(`Unexpected historical oracle import: ${name}`);})();
phase31._compile(zlib.gunzipSync(fs.readFileSync(path.resolve(__dirname,'../fixtures/phase31-shadow-before.cjs.gz'))).toString(),phase31.id);
module.exports={...frozen,adapter,prepare,phase31:phase31.exports,provenance};
