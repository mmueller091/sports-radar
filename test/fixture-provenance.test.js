import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {canonicalLfBytes,verifyFixtureBytes,verifyFixture} from '../calibration/fixture-provenance.mjs';
import {buildCorrectedReview} from '../scripts/trajectory-review-correction.mjs';

const root=new URL('../',import.meta.url),read=p=>readFileSync(new URL(p,root));
const mapping=JSON.parse(read('calibration/fixture-provenance.v1.json'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const first=mapping.fixtures.find(f=>f.path.includes('/NBA-')),lf=canonicalLfBytes(read(first.path));
const crlf=b=>Buffer.from(b.toString('utf8').replaceAll('\n','\r\n'));

test('all 107 approved fixtures verify LF and CRLF with identical historical artifact identities',()=>{
  assert.equal(mapping.fixtures.length,107);
  const frozen=JSON.parse(read('calibration/output/replay-input-comparison.v2.json'));
  for(const f of mapping.fixtures) {
    const bytes=canonicalLfBytes(read(f.path));
    const a=verifyFixtureBytes(f.path,bytes),b=verifyFixtureBytes(f.path,crlf(bytes));
    assert.equal(a.diskByteSha256,f.canonicalLfSha256);
    assert.equal(b.diskByteSha256,f.historicalCaptureSha256);
    assert.equal(a.canonicalLfSha256,b.canonicalLfSha256);
    assert.equal(a.historicalCaptureSha256,b.historicalCaptureSha256);
    const artifact=r=>JSON.stringify({path:r.path,sha256:r.historicalCaptureSha256});
    assert.equal(artifact(a),artifact(b));
    assert.equal(a.historicalCaptureSha256,frozen.fixtureHashes.find(x=>x.path===f.path).sha256);
  }
});

test('score, clock, team, play order and other content mutations fail verification',()=>{
  for(const [pattern,replacement] of [
    [/"homeScore": \d+/, '"homeScore": 987'],
    [/"displayValue": "[^"]*"/, '"displayValue": "01:23"'],
    [/"displayName": "[^"]*"/, '"displayName": "changed-team"'],
    [/"capturedAt": "[^"]*"/, '"capturedAt": "changed capture"']
  ]) {
    const changed=Buffer.from(lf.toString().replace(pattern,replacement));
    assert.notDeepEqual(changed,lf);
    assert.throws(()=>verifyFixtureBytes(first.path,changed),/content changed/);
  }
  // Swap raw object spans so play-order rejection cannot be attributed to
  // JSON reformatting. Keep every other byte, including all whitespace.
  const text=lf.toString(),start=text.indexOf('[',text.indexOf('"plays"'))+1;
  const objectSpan=offset=>{
    const begin=text.indexOf('{',offset);let depth=0,quoted=false,escaped=false;
    for(let i=begin;i<text.length;i++) {
      const c=text[i];
      if(quoted) {
        if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;
      } else if(c==='"')quoted=true;
      else if(c==='{')depth++;
      else if(c==='}'&&--depth===0)return [begin,i+1];
    }
    assert.fail('Unterminated raw play object');
  };
  const [a,b]=objectSpan(start),[c,d]=objectSpan(b);
  const reordered=text.slice(0,a)+text.slice(c,d)+text.slice(b,c)+text.slice(a,b)+text.slice(d);
  assert.deepEqual(JSON.parse(reordered).summary.plays.slice(0,2),JSON.parse(lf).summary.plays.slice(0,2).reverse());
  assert.throws(()=>verifyFixtureBytes(first.path,Buffer.from(reordered)),/content changed/);
  const fixture=JSON.parse(lf);
  const mutations=[
    f=>{f.summary.plays[0].homeScore=987;},
    f=>{f.summary.plays[0].clock={displayValue:'01:23'};},
    f=>{f.summary.plays[0].team={id:'changed-team'};},
    f=>{f.source='changed source';}
  ];
  for(const mutate of mutations) {
    const changed=structuredClone(fixture);mutate(changed);
    assert.notDeepEqual(changed,fixture);
    assert.throws(()=>verifyFixtureBytes(first.path,Buffer.from(JSON.stringify(changed,null,2)+'\n')),/content changed/);
  }
});

test('non-line-ending whitespace, BOM and escaped JSON CRLF edits are rejected',()=>{
  assert.throws(()=>verifyFixtureBytes(first.path,Buffer.concat([lf,Buffer.from(' ')])),/content changed/);
  assert.throws(()=>verifyFixtureBytes(first.path,Buffer.concat([Buffer.from([239,187,191]),lf])),/content changed/);
  const escaped=Buffer.from('{"text":"literal \\r\\n stays escaped"}\r\n');
  assert.equal(canonicalLfBytes(escaped).toString(),'{"text":"literal \\r\\n stays escaped"}\n');
  const changed=Buffer.from(lf.toString().replace('"source"','"escaped\\r\\n"'));
  assert.notDeepEqual(changed,lf);
  assert.throws(()=>verifyFixtureBytes(first.path,changed),/content changed/);
});

test('missing files and unapproved paths fail; binary and unrelated sources retain raw integrity checks',()=>{
  const temp=mkdtempSync(join(tmpdir(),'fixture-provenance-missing-'));
  try {assert.throws(()=>verifyFixture(first.path,pathToFileURL(temp+'/')),/ENOENT/);}
  finally {rmSync(temp,{recursive:true,force:true});}
  for(const path of ['test/fixtures/missing.json','scripts/replay-inputs.mjs','test/fixtures/phase31-shadow-before.cjs.gz',`./${first.path}`])
    assert.throws(()=>verifyFixtureBytes(path,lf),/Unapproved/);
  const m=JSON.parse(read('calibration/trajectory-current-checkpoint-manifest.json'));
  for(const path of ['test/fixtures/phase31-shadow-before.cjs.gz','scripts/replay-inputs.mjs']) {
    const expected=m.entries.find(e=>e.path===path).sha256;
    assert.equal(hash(read(path)),expected);
    assert.notEqual(hash(Buffer.concat([read(path),Buffer.from('\r\n')])),expected);
  }
});

test('complete frozen corrected diagnostic reproduces exactly, including every non-provenance field',()=>{
  assert.deepEqual(Buffer.from(JSON.stringify(buildCorrectedReview(),null,2)+'\n'),read('calibration/trajectory-diagnostic-key.corrected.json'));
});
