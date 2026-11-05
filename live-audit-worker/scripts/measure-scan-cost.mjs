// Offline storage/query projection only. Never contacts a provider or D1.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {scan} from '../src/index.js';
import {captureQualityEvidence} from '../src/quality.js';
import {sqliteD1} from '../test/helpers/sqlite-d1.js';

const input=process.argv[2];
if(!input)throw new Error('Usage: node scripts/measure-scan-cost.mjs retained-capture.json [output.json]');
const bytes=v=>Buffer.byteLength(typeof v==='string'?v:JSON.stringify(v));
const hash=v=>createHash('sha256').update(v).digest('hex');
const original=fs.readFileSync(input),retained=JSON.parse(original);
const indexSource=fs.readFileSync(new URL('../src/index.js',import.meta.url),'utf8');
// Use the exact current serialization selector, rather than a drifting copy.
const compactSource=/const compact=(game=>\([\s\S]*?\));\r?\nconst blob=/.exec(indexSource)?.[1];
if(!compactSource)throw new Error('Cannot locate production audit compact selector');
const compact=Function('return ('+compactSource+')')();
const baselineBytes=gunzipSync(fs.readFileSync(new URL('../test/fixtures/audit-quality-1-worker.js.gz',import.meta.url)));
const manifest=JSON.parse(fs.readFileSync(new URL('../test/fixtures/audit-quality-1-worker.js.manifest.json',import.meta.url)));
if(hash(baselineBytes)!==manifest.sha256)throw new Error('Baseline artifact hash mismatch');
const baseline=await import('data:text/javascript;base64,'+baselineBytes.toString('base64'));
globalThis.fetch=()=>{throw new Error('Network forbidden during offline projection');};
const grouped=new Map();
for(const row of retained.snapshots){
  const game=JSON.parse(row.normalized_state);
  if(game.state!=='live')continue;
  if(!grouped.has(row.game_key))grouped.set(row.game_key,[]);
  grouped.get(row.game_key).push({row,game});
}
for(const group of grouped.values())group.sort((a,b)=>a.row.observed_at-b.row.observed_at);
const metrics=values=>{
  const sorted=values.toSorted((a,b)=>a-b);
  return {count:sorted.length,min:sorted[0],median:sorted[Math.floor(sorted.length/2)],
    p95:sorted[Math.max(0,Math.ceil(sorted.length*.95)-1)],max:sorted.at(-1),total:values.reduce((a,b)=>a+b,0)};
};
const paths={NHL:'hockey/nhl',CFB:'football/college-football',NCAAB:'basketball/mens-college-basketball'};
async function measure(entry,{summaryRow=null}={}){
  const {row,game}=entry;
  // Scan time is explicitly simulated solely to measure serialization.
  const at=summaryRow?.updated_at??row.observed_at+15000;
  const g={...game,providerPath:game.providerPath??paths[game.sport]};
  const runs=[];
  for(const [version,fn] of [['baseline',baseline.scan],['upgraded',scan]]){
    const db=sqliteD1();
    try{
      db.feed([g],at-15000,{modelVersion:g.modelVersion,parts:true});
      if(summaryRow)db.resource(summaryRow.key,JSON.parse(summaryRow.payload),summaryRow.updated_at);
      const outcome=await fn({DB:db.DB,AI:{run(){throw new Error('AI forbidden');}}},at);
      const stored=db.sqlite.prepare('SELECT evidence FROM live_audit_observations').get();
      const evidence=stored?JSON.parse(stored.evidence):null;
      if(!stored)throw new Error('Missing observation for '+row.game_key);
      const q=evidence.qualityEvidence;
      runs.push({version,...db.metrics(),stateBytes:bytes(evidence.state),qualityEvidenceBytes:q?bytes(q):0,
        retainedEvents:q?.canonicalEvents?.length??0,availableEvents:q?.eventCoverage?.available??0,
        eventBytes:q?.canonicalEvents?bytes(q.canonicalEvents):0,
        largestRetainedEventBytes:Math.max(0,...(q?.canonicalEvents||[]).map(bytes)),
        providerRequests:outcome.providerRequests,notifications:outcome.notifications});
    }finally{db.close();}
  }
  return {gameKey:row.game_key,snapshotObservedAt:row.observed_at,modelVersion:game.modelVersion??row.model_version,
    rawNormalizedStateBytes:bytes(row.normalized_state),summaryAcquiredAt:summaryRow?.updated_at??null,runs};
}
const representative=[];
for(const [,group] of grouped)representative.push(await measure(group[Math.floor(group.length/2)]));
const cachedSummaries=[];
for(const resource of retained.resources){
  const id=/[?&]event=(\d+)/.exec(resource.key)?.[1],group=grouped.get('NHL:'+id);
  if(group)cachedSummaries.push(await measure(group.at(-1),{summaryRow:resource}));
}
const allLive=[];
for(const [,group] of grouped)for(const {row,game} of group){
  const q=captureQualityEvidence(game,{publishedAt:row.observed_at,observedAt:row.observed_at+15000});
  allLive.push({gameKey:row.game_key,observedAt:row.observed_at,stateBytes:bytes(compact(game)),qualityEvidenceBytes:bytes(q),combinedBytes:bytes(compact(game))+bytes(q)});
}
const distribution=rows=>Object.fromEntries(['stateBytes','qualityEvidenceBytes','observationBytes','eventBytes','readQueries','writeStatements','bindBytes']
  .map(k=>[k,metrics(rows.map(r=>r[k]))]));
const cachedRows=cachedSummaries.map(r=>r.runs[1]);
const largestEventBytes=Math.max(0,...cachedRows.map(r=>r.largestRetainedEventBytes));
const result={kind:'offline-storage-projection-not-observed-live-latency',capturedAt:retained.capturedAt,
  captureSha256:hash(original),baselineSha256:hash(baselineBytes),indexSourceSha256:hash(indexSource),
  method:'One genuine live snapshot per 27 games: chronological middle retained live state. Compare exact deployed baseline and upgraded scan with isolated in-memory SQLite. Feed refresh/scan times are simulated for byte measurement only. No providers, AI, network, new production data, or production writes.',
  quantiles:'Nearest-rank p95; upper middle median for even count. Bytes are UTF-8 JSON; no invoice or deployed latency claim.',
  cachedSummaryMethod:'For each existing NHL cached summary, use the genuine last retained live game state and its existing providerPath; source acquisition is aligned to simulated scan time solely to measure bounded event storage. Cached final revisions are not represented as original live revisions. No event time is invented.',
  representative:{games:representative.length,baseline:distribution(representative.map(r=>r.runs[0])),upgraded:distribution(representative.map(r=>r.runs[1])),rows:representative},
  cachedSummaries:{games:cachedSummaries.length,upgraded:distribution(cachedRows),
    retainedEvents:metrics(cachedRows.map(r=>r.retainedEvents)),largestRetainedEventBytes:largestEventBytes,
    bounded48EventsObservedRecordEnvelopeBytes:48*largestEventBytes+47+2,
    bounded48EventsMethod:'Storage arithmetic only: 48 copies of the largest serialized real event record seen in the 11 cached summaries, plus JSON array commas/brackets. This is an observed-record-size envelope, not an observed 48-event game or a global maximum for all possible provider fields.',
    rows:cachedSummaries},
  allRetainedLiveStateProjection:{count:allLive.length,stateBytes:metrics(allLive.map(r=>r.stateBytes)),qualityEvidenceBytes:metrics(allLive.map(r=>r.qualityEvidenceBytes)),combinedBytes:metrics(allLive.map(r=>r.combinedBytes)),
    worst:allLive.toSorted((a,b)=>b.combinedBytes-a.combinedBytes).slice(0,5)},
  limitations:['Ledger absent in retained snapshot; actual future exact canonical ledger rows can add bytes.','Retained final summaries permit a bounded event payload estimate, not an actual contemporary cache replay.','Finding evidence duplicates observation details when a finding is persisted; byte distributions include per-observation JSON, with bindBytes reporting all bound statements.','Peer SELECT count is unchanged, but upgraded query returns up to 100 full evidence rows per sport/bucket instead of the baseline two-field rows.','NHL, CFB, NCAAB and hidden Soccer only; no observed NFL/NBA/MLB/Tennis storage sample.','In-memory SQLite counts statements; Cloudflare billed rows, network transfer, CPU time and invoices are not inferred.']};
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,representative:{...result.representative,rows:undefined},cachedSummaries:{...result.cachedSummaries,rows:undefined}},null,2));
