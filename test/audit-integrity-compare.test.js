import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {compareReplays,differencesCsv} from '../scripts/audit-integrity-compare.mjs';
const fingerprint=marker=>{
  const files={'scoring/example.cjs':createHash('sha256').update(marker).digest('hex')};
  return {files,sha256:createHash('sha256').update(JSON.stringify(files)).digest('hex')};
};
const replay=(rating,{sport='NFL',model='candidate',restore=null,sequential=rating,repeat=sequential}={})=>({
  model,sourceFingerprint:fingerprint(model),baselineFingerprint:restore?fingerprint('original'):null,
  runnerSha256:'a'.repeat(64),offlineRestoredMechanism:restore,results:[{sport,id:'game',rows:[{index:0,playId:'play',period:4,clock:'1:00',
    score:[['home','7'],['away','3']],rating,sequential,repeat}]}]});
const inputs=(sport='NFL')=>({baseline:replay(50,{sport,model:'original'}),candidate:replay(40,{sport}),
  trajectory:replay(50,{sport,restore:'trajectory'})});

test('audit comparison attributes an independently restored F3 delta and preserves version fields',()=>{
  const result=compareReplays(inputs());
  assert.equal(result.summary.changedCheckpoints,1);
  assert.equal(result.differences[0].cause,'F3');
  assert.equal(result.differences[0].intentional,true);
  assert.equal(result.differences[0].weightsChanged,false);
  assert.equal(result.differences[0].modelChanged,true);
});

test('audit comparison requires combined sport restoration and reports interactions',()=>{
  for(const [sport,name,mechanism,cause] of [['MLB','mlb','mlb','C2'],['CFB','cfbRetention','cfb-retention','C1']]) {
    const data=inputs(sport);
    data.trajectory=replay(43,{sport,restore:'trajectory'});
    data[name]=replay(46,{sport,restore:mechanism});
    data.all=replay(50,{sport,restore:'trajectory,mlb,cfb-retention'});
    assert.equal(compareReplays(data).differences[0].cause,`F3+${cause}`);
    assert.equal(compareReplays(data).differences[0].interaction,true);
    data.trajectory.results[0].rows[0].rating=40;
    data[name].results[0].rows[0].rating=40;
    const result=compareReplays(data).differences[0];
    assert.equal(result.cause,`F3+${cause}`);
    assert.equal(result.interaction,true);
  }
});

test('audit comparison leaves unconfirmed or incomplete attribution unknown',()=>{
  const unverified=inputs();delete unverified.trajectory.sourceFingerprint;
  assert.equal(compareReplays(unverified).differences[0].cause,'unknown');
  assert.equal(compareReplays(unverified).differences[0].intentional,null);
  const absent=inputs();delete absent.trajectory;
  assert.equal(compareReplays(absent).differences[0].cause,'unknown');
  const residual=inputs();residual.trajectory.results[0].rows[0].rating=49;
  const row=compareReplays(residual).differences[0];
  assert.equal(row.cause,'unknown');
  assert.equal(row.unexplainedRestorationDelta,-1);
});

test('audit comparison quantifies baseline and candidate sequential/repeat differences separately',()=>{
  const data=inputs();
  data.baseline.results[0].rows[0].sequential=51;
  data.baseline.results[0].rows[0].repeat=51;
  data.candidate.results[0].rows[0].repeat=41;
  const result=compareReplays(data);
  assert.equal(result.summary.baselineDeterminism.freshSequentialDifferences,1);
  assert.equal(result.summary.candidateDeterminism.freshSequentialDifferences,0);
  assert.equal(result.summary.baselineDeterminism.sequentialRepeatDifferences,0);
  assert.equal(result.summary.candidateDeterminism.sequentialRepeatDifferences,1);
  assert.equal(result.summary.zeroRepeatDifferences,false);
  assert.equal(result.sequentialDifferences[0].original,51);
  assert.equal(result.sequentialDifferences[0].corrected,40);
});

test('audit comparison rejects mismatched checkpoint inputs, restoration labels and duplicate IDs',()=>{
  const changed=inputs();changed.candidate.results[0].rows[0].clock='0:59';
  assert.throws(()=>compareReplays(changed),/Changed input boundary/);
  const duplicate=inputs();duplicate.baseline.results[0].rows.push(duplicate.baseline.results[0].rows[0]);
  assert.throws(()=>compareReplays(duplicate),/duplicate checkpoint/);
  const mislabeled=inputs();mislabeled.trajectory.offlineRestoredMechanism='mlb';
  assert.throws(()=>compareReplays(mislabeled),/wrong restoration metadata/);
});

test('audit comparison rejects stale or tampered source and runner fingerprints',()=>{
  const stale=inputs();stale.trajectory.sourceFingerprint=fingerprint('older candidate');
  assert.throws(()=>compareReplays(stale),/differs from final candidate/);
  const oldBaseline=inputs();oldBaseline.trajectory.baselineFingerprint=fingerprint('other original');
  assert.throws(()=>compareReplays(oldBaseline),/differs from original replay/);
  const badRunner=inputs();badRunner.trajectory.runnerSha256='b'.repeat(64);
  assert.throws(()=>compareReplays(badRunner),/runner fingerprint differs/);
  const tampered=inputs();tampered.trajectory.sourceFingerprint.files['scoring/example.cjs']='c'.repeat(64);
  assert.throws(()=>compareReplays(tampered),/invalid source fingerprint manifest/);
});

test('audit CSV preserves unknown intent and quotes checkpoint identifiers',()=>{
  const data=inputs();delete data.trajectory.sourceFingerprint;
  const row=compareReplays(data).differences[0];row.playId='a,"b"';
  const csv=differencesCsv([row]);
  assert.match(csv,/"a,""b"""/);
  assert.match(csv,/unknown,,false,true/);
});
