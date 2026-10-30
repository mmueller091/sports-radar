import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const mapping=JSON.parse(readFileSync(new URL('fixture-provenance.v1.json',import.meta.url)));
assert.equal(mapping.version,1);
const approved=new Map(mapping.fixtures.map(f=>[f.path,f]));
assert.equal(approved.size,mapping.fixtures.length,'Duplicate fixture provenance mapping');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

// Byte operation only: no decoding, trimming, JSON serialization or BOM handling.
export function canonicalLfBytes(bytes) {
  const out=Buffer.allocUnsafe(bytes.length);
  let length=0;
  for(let i=0;i<bytes.length;i++) {
    if(bytes[i]===13&&bytes[i+1]===10)continue;
    out[length++]=bytes[i];
  }
  return out.subarray(0,length);
}

export function verifyFixtureBytes(path,bytes) {
  const expected=approved.get(path);
  assert.ok(expected,`Unapproved fixture provenance mapping: ${path}`);
  const canonical=canonicalLfBytes(bytes),canonicalLfSha256=hash(canonical);
  assert.equal(canonicalLfSha256,expected.canonicalLfSha256,`${path}: canonical LF content changed`);
  const capture=Buffer.allocUnsafe(canonical.length*2);
  let length=0;
  for(const byte of canonical) {
    if(byte===10)capture[length++]=13;
    capture[length++]=byte;
  }
  const historicalCaptureSha256=hash(capture.subarray(0,length));
  assert.equal(historicalCaptureSha256,expected.historicalCaptureSha256,`${path}: historical CRLF reconstruction changed`);
  return {path,diskByteSha256:hash(bytes),canonicalLfSha256,historicalCaptureSha256};
}

export function verifyFixture(path,base=root) {
  assert.ok(approved.has(path),`Unapproved fixture provenance mapping: ${path}`);
  return verifyFixtureBytes(path,readFileSync(new URL(path,base)));
}

// Frozen artifact fields mean verified historical CRLF capture identity, NOT
// the current disk-byte hash. Verification always precedes emitting that identity.
export function historicalFixtureSha256(path) {
  return verifyFixture(path).historicalCaptureSha256;
}
