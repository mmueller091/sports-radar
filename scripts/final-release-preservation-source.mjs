// Resolve the original Windows worktree's newline-only source gate after its
// completed exhaustive numerical replay. Never rerate or rewrite an archive.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

assert.ok(process.argv[2],'Pass the original replay worktree path explicitly');
const replayRoot=path.resolve(process.argv[2]);
const reportPath='audit/final-release-712f221/preservation.json';
const replayBytes=fs.readFileSync(path.join(replayRoot,reportPath));
const replay=JSON.parse(replayBytes);
assert.ok(replay.failures.every(f=>Object.keys(f).length===1&&Array.isArray(f.unexpectedScoringSourceChanges)),
  'A numerical failure cannot be resolved by this source-only check');
for(const stats of Object.values(replay.stats))assert.equal(stats.byteIdentical,stats.endStates+stats.replayStates);
const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const hash=b=>createHash('sha256').update(b).digest('hex');
const normalize=b=>b.toString('utf8').replaceAll('\r\n','\n');
const all=git('ls-tree','-r','--name-only','712f221').toString().trim().split('\n');
const scoringInputs=all.filter(p=>p==='rating-core.js'||p.startsWith('scoring/')||p.startsWith('alerts-worker/src/')||
  p.startsWith('calibration/')&&p.endsWith('.cjs'));
const sourceEquivalence=scoringInputs.map(file=>{
  const prior=fs.readFileSync(path.join(replayRoot,file)),candidate=fs.readFileSync(file);
  assert.equal(normalize(candidate),normalize(prior),`Scoring graph content changed: ${file}`);
  return {file,replaySha256:hash(prior),candidateSha256:hash(candidate),byteIdentical:prior.equals(candidate),contentIdentical:true};
});
const baselinePaths=git('ls-tree','-r','--name-only',replay.baseline,'--','rating-core.js','scoring').toString().trim().split('\n');
const changedExistingScoringFiles=baselinePaths.filter(file=>!fs.readFileSync(file).equals(git('show',`${replay.baseline}:${file}`)));
assert.deepEqual(changedExistingScoringFiles.sort(),['scoring/football-live.cjs','scoring/live-runtime.cjs']);
assert.deepEqual(replay.scoringChangesInNewerProduction,[]);
const result={...replay,pass:true,changedExistingScoringFiles,failures:[],sourceEquivalence,
  numericalReplay:{sha256:hash(replayBytes),artifact:'preservation-replay.json',stats:replay.stats},
  environmentResolution:'Original replay compared every numerical result successfully, but its raw source-byte gate saw Windows CRLF conversions. This check proves the complete scoring graph has identical text in both worktrees and verifies exact baseline source bytes in the production-based candidate. Only the two expected existing scoring files differ from production; the new basketball module is retained.',
  originalSourceGateFailures:replay.failures};
fs.writeFileSync('audit/final-release-712f221/preservation-replay.json',replayBytes);
fs.writeFileSync(reportPath,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({pass:true,stats:result.stats,comparedSourceFiles:sourceEquivalence.length,
  newlineOnlyFiles:sourceEquivalence.filter(r=>!r.byteIdentical).length,changedExistingScoringFiles,failures:0},null,2));
