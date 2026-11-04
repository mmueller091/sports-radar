// Local, read-only source verification; writes only this audit's evidence file.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const production='3d14f0006113f390bb8adfd81728036e4dafa70c';
const calibration='712f221';
const integrated='254be171b980415345813ee2710125098fe8d25f';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const blobId=bytes=>createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const entries=ref=>git('ls-tree','-r',ref).toString().trim().split('\n').map(line=>{
  const [metadata,path]=line.split('\t');return {path,blob:metadata.split(' ')[2]};
});
git('merge-base','--is-ancestor',production,'HEAD');
const changes=entries(integrated).filter(({path,blob})=>blobId(fs.readFileSync(path))!==blob).map(({path})=>path);
assert.deepEqual(changes.sort(),['alerts-worker/src/alert-delivery.js','alerts-worker/src/index.js','test/live-phase.test.js']);
const calibrationPaths=git('diff-tree','--no-commit-id','--name-only','-r',calibration).toString().trim().split('\n');
const calibrationIdentity=calibrationPaths.map(path=>({path,byteIdentical:fs.readFileSync(path).equals(git('show',`${calibration}:${path}`))}));
assert.ok(calibrationIdentity.every(row=>row.byteIdentical),'original calibration and its evidence must be unchanged');
const productionFiles=entries(production).filter(({path})=>!path.includes('/')||path.startsWith('fonts/'));
const productionIdentity=productionFiles.map(({path})=>{
  const bytes=fs.readFileSync(path);return {path,sha256:sha256(bytes),byteIdentical:bytes.equals(git('show',`${production}:${path}`))};
});
assert.ok(productionIdentity.every(row=>row.byteIdentical),'latest production UI and root assets must survive');
const output={pass:true,productionCommit:production,calibrationCommit:calibration,integrationCommit:integrated,
  checkedTrackedFiles:entries(integrated).length,changedExistingFiles:changes,calibrationIdentity,productionIdentity,
  modelVersion:'2026-11-03.live-underdog.1',alertVersion:'2026-11-03.cross-model-dedupe.1',
  releaseStatus:'LOCAL ONLY. No deployment or push. User approval is required before release.'};
fs.writeFileSync('audit/final-release-712f221/candidate-identity.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({pass:true,checkedTrackedFiles:output.checkedTrackedFiles,calibrationFiles:calibrationIdentity.length,
  productionFiles:productionIdentity.length,changedExistingFiles:changes},null,2));
