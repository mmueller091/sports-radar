import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('installable manifest ships genuine standard-size icons in the built and cached shell',()=>{
  const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.equal(manifest.display,'standalone');
  const sw=fs.readFileSync('sw.js','utf8');
  for(const size of [192,512]) {
    const icon=manifest.icons.find(icon=>icon.sizes===`${size}x${size}`);assert.ok(icon);
    assert.equal(icon.type,'image/png');
    const bytes=fs.readFileSync(icon.src);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16),size);assert.equal(bytes.readUInt32BE(20),size);
    assert.deepEqual(fs.readFileSync('dist/'+icon.src),bytes,'public build includes the exact icon');assert.ok(sw.includes(icon.src),'offline shell caches the install icon');
  }
});
