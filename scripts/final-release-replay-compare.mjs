// Compare a fresh exhaustive replay to the committed 712f221 ledger, then
// preserve the original reviewed artifacts byte-for-byte. Never changes inputs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
const audit='audit/final-release-712f221/';
const path='calibration/output/live-underdog-20261103.json';
const committed=path=>execFileSync('git',['show',`712f221:${path}`],{maxBuffer:64*1024*1024});
const originalBytes=committed(path),regeneratedBytes=fs.readFileSync(path);
const original=JSON.parse(originalBytes);
const regenerated=JSON.parse(regeneratedBytes);
const orderKey=r=>JSON.stringify([r.kind,r.sport,r.id,r.playId,r.period,r.clock,r.phase,r.spread,r.margin,r.file]);
const sorted=value=>Array.isArray(value)?[...value].sort((a,b)=>orderKey(a).localeCompare(orderKey(b))):value;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const oldView=Object.fromEntries(Object.entries(original).map(([key,value])=>[key,sorted(value)]));
const newView=Object.fromEntries(Object.entries(regenerated).map(([key,value])=>[key,sorted(value)]));
const differences=[];
function compareLeaves(a,b,segments=[]){
  if(Object.is(a,b))return;
  if(a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b)){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))compareLeaves(a[key],b[key],[...segments,key]);
  }else differences.push({segments,original:a,regenerated:b});
}
compareLeaves(oldView,newView);

// The committed scorer already compacts its retained pointSpread quote to
// home/away open/close line fields. The reviewed report retained six additional
// diagnostic leaves from the raw provider quote. Permit only their omission,
// never a changed value or omitted scoring/evidence field. All source archives
// and the scorer itself must still match their reviewed hashes.
const omissionPath=/^(historicalFlags|new85)\.\d+\.afterDetail\.context\.market\.raw\.pointSpread\.(displayName|shortDisplayName|(home|away)\.(open|close)\.odds)$/;
const permittedOmission=d=>omissionPath.test(d.segments.join('.'))&&d.original!==undefined&&d.regenerated===undefined&&
  typeof d.original==='string';
const negativeControls=[
  ['historicalFlags.0.afterDetail.context.market.raw.pointSpread.home.close.line','+6.5',undefined],
  ['historicalFlags.0.afterDetail.context.market.reportedAt','2026-03-28T12:00:00Z',undefined],
  ['historicalFlags.0.afterDetail.context.market.raw.pointSpread.home.close.odds','-110','-115'],
  ['historicalFlags.0.afterDetail.context.currentProbability',.5,undefined],
  ['historicalFlags.0.afterDetail.score',85,undefined],
];
for(const [key,a,b] of negativeControls)assert.equal(permittedOmission({segments:key.split('.'),original:a,regenerated:b}),false,key);
const recordedDifferences=differences.map(d=>{
  const row=oldView[d.segments[0]]?.[d.segments[1]];
  return {path:d.segments.join('.'),gameId:row?.id,playId:row?.playId,sourceFile:row?.sourceFile,
    original:d.original===undefined?{missing:true}:d.original,
    regenerated:d.regenerated===undefined?{missing:true}:d.regenerated,permittedOmission:permittedOmission(d)};
});
fs.mkdirSync(audit,{recursive:true});
fs.writeFileSync(audit+'replay-reproduction-differences.json',JSON.stringify(recordedDifferences,null,2)+'\n');
assert.ok(differences.every(permittedOmission),'Unexpected replay difference; see replay-reproduction-differences.json');
const sourceVerification=original.provenance.map(({file,sha256})=>{
  assert.equal(hash(fs.readFileSync(file)),sha256,`${file}: original source bytes`);
  return {file,sha256};
});
const scorerPath='scoring/basketball-upset.cjs',scorerHash=hash(committed(scorerPath));
assert.equal(hash(fs.readFileSync(scorerPath)),scorerHash,'The quote-compacting scorer must remain byte-identical to 712f221');
const verifiedQuotes=new Set();
for(const d of differences){
  const row=oldView[d.segments[0]][d.segments[1]];
  assert.ok(['NCAAB','NBA'].includes(row.sport),'Only basketball retained-market serialization is compacted');
  const quoteKey=JSON.stringify([row.sourceFile,row.afterDetail.context.market.raw.pointSpread]);
  if(!verifiedQuotes.has(quoteKey)){
    const bytes=fs.readFileSync(row.sourceFile),fixture=JSON.parse(row.sourceFile.endsWith('.gz')?gunzipSync(bytes):bytes);
    const quotes=[...(fixture.summary?.pickcenter||[]),...(fixture.summary?.header?.competitions?.[0]?.odds||[]),...(fixture.event?.competitions?.[0]?.odds||[])];
    assert.ok(quotes.some(raw=>JSON.stringify((raw.close||raw.closing||raw).pointSpread)===JSON.stringify(row.afterDetail.context.market.raw.pointSpread)),
      `${row.sourceFile}: removed diagnostic metadata must exactly match an unchanged archived quote`);
    verifiedQuotes.add(quoteKey);
  }
}
// Canonicalize only the individually recorded, source-verified missing leaves
// in memory. The complete committed artifacts are restored unchanged below.
for(const d of differences){
  let owner=oldView;
  for(const key of d.segments.slice(0,-1))owner=owner[key];
  delete owner[d.segments.at(-1)];
}
const checks={};
for(const key of Object.keys(original)){
  assert.deepEqual(newView[key],oldView[key],`Recomputed ${key} differs from the committed audit`);
  checks[key]=true;
}
assert.deepEqual(Object.keys(regenerated).sort(),Object.keys(original).sort());
const originals=[path,'calibration/output/live-underdog-material-changes-20261103.csv','calibration/live-underdog-evidence-20261103.md'];
const restored=originals.map(destination=>{
  const bytes=committed(destination);
  fs.writeFileSync(destination,bytes);
  assert.equal(hash(fs.readFileSync(destination)),hash(bytes));
  return {path:destination,sha256:hash(bytes)};
});
const result={pass:true,checks,
  comparison:'Exact after individually recorded omissions of six non-scoring retained-quote diagnostic fields; scoring/evidence fields are never omitted',
  committedLedgerSha256:hash(originalBytes),regeneratedLedgerSha256:hash(regeneratedBytes),
  serializationOmissions:{leafCount:differences.length,rows:new Set(recordedDifferences.map(d=>d.path.split('.').slice(0,2).join('.'))).size,
    byPath:Object.fromEntries([...new Set(recordedDifferences.map(d=>d.path.replace(/\.\d+\./,'.ROW.')))].map(key=>
      [key,recordedDifferences.filter(d=>d.path.replace(/\.\d+\./,'.ROW.')===key).length])),
    details:'replay-reproduction-differences.json',verifiedArchivedQuotes:verifiedQuotes.size,
    scorer:{path:scorerPath,sha256:scorerHash,byteIdentical:true},negativeControls:negativeControls.length},
  sourceVerification,gameCount:regenerated.histories.length,checkpoints:regenerated.replayRows.length,
  numerical:regenerated.replayRows.filter(r=>Number.isFinite(r.before)&&Number.isFinite(r.after)).length,
  scenarioCount:regenerated.scenarioCount,boundaryPairs:regenerated.boundaries.length,
  maximumBoundaryJump:Math.max(...regenerated.boundaries.map(r=>Math.abs(r.jumpAfter))),
  materialRows:regenerated.historicalFlags.length,restored};
fs.writeFileSync(audit+'replay-reproduction.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
