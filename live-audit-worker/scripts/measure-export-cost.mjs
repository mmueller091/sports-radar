// Compare actual authenticated Worker /export paths against captured offline SQL.
// Usage: node --expose-gc scripts/measure-export-cost.mjs baseline|upgraded DB_PATH OUTPUT_JSON
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
const [version,databasePath,outputPath]=process.argv.slice(2);
if(!['baseline','upgraded'].includes(version)||!databasePath||!outputPath)throw Error('Expected baseline|upgraded DB_PATH OUTPUT_JSON');
const sha256=value=>createHash('sha256').update(value).digest('hex');
const databaseSha256=sha256(fs.readFileSync(databasePath));
const db=new DatabaseSync(databasePath,{readOnly:true});
let worker,sourceSha256;
if(version==='baseline'){
 const source=gunzipSync(fs.readFileSync(new URL('../test/fixtures/audit-quality-1-worker.js.gz',import.meta.url)));
 const manifest=JSON.parse(fs.readFileSync(new URL('../test/fixtures/audit-quality-1-worker.js.manifest.json',import.meta.url)));
 sourceSha256=sha256(source);if(sourceSha256!==manifest.sha256)throw Error('Baseline identity mismatch');
 worker=(await import('data:text/javascript;base64,'+source.toString('base64'))).default;
}else{
 sourceSha256=Object.fromEntries(fs.readdirSync(new URL('../src/',import.meta.url)).filter(f=>f.endsWith('.js')).sort()
  .map(f=>[f,sha256(fs.readFileSync(new URL('../src/'+f,import.meta.url)))]));
 worker=(await import('../src/index.js')).default;
}
let externalRequests=0,aiRequests=0;
globalThis.fetch=()=>{externalRequests++;throw Error('Network prohibited');};
const queries=[],memory=[];
const sample=()=>memory.push(process.memoryUsage());
const env={AUDIT_READ_TOKEN:'offline-cost-test',AI:{run(){aiRequests++;throw Error('AI prohibited');}},DB:{prepare(sql){
 if(!/^\s*SELECT\b/i.test(sql))throw Error('Export attempted a write: '+sql);
 let args=[];
 const run=first=>{
  const at=performance.now(),table=/FROM\s+(\w+)/i.exec(sql)?.[1];
  const stub=table==='sports_feed';
  const result=stub?{payload:JSON.stringify({games:[],updatedAt:'2026-11-04T12:00:00Z'})}:
   first?(db.prepare(sql).get(...args)||null):db.prepare(sql).all(...args);
  const sqlElapsedMs=performance.now()-at;
  const count=first?(result?1:0):result.length;
  // D1's transport envelope is excluded; count the exact returned JSON row(s).
  queries.push({table,sql:sql.replace(/\s+/g,' ').trim(),rows:count,
   returnedJsonBytes:Buffer.byteLength(JSON.stringify(result)),sqlElapsedMs,stub});
  sample();return result;
 };
 return {bind(...values){args=values;return this;},async first(){return run(true);},async all(){return {results:run(false)};}};
}}};
if(global.gc)global.gc();sample();
const initialMemory=process.memoryUsage(),cpuStart=process.cpuUsage(),started=performance.now();
let response,zipBytes=0,chunks=0;const zipDigest=createHash('sha256');
try{
 response=await worker.fetch(new Request('https://offline.test/export?date=2026-11-03',{
  headers:{Authorization:'Bearer offline-cost-test'}}),env);
 sample();
 for await(const chunk of response.body){zipBytes+=chunk.byteLength;chunks++;zipDigest.update(chunk);sample();}
}finally{db.close();}
const elapsedMs=performance.now()-started,cpu=process.cpuUsage(cpuStart);
const sum=(rows,key)=>rows.reduce((n,row)=>n+row[key],0);
const metrics={version,route:'/export?date=2026-11-03',status:response.status,node:process.version,
 database:path.basename(databasePath),databaseSha256,sourceSha256,
 queryCount:queries.length,sqliteQueryCount:queries.filter(q=>!q.stub).length,stubFeedQueries:queries.filter(q=>q.stub).length,
 returnedRows:sum(queries,'rows'),returnedJsonBytes:sum(queries,'returnedJsonBytes'),
 sqliteReturnedRows:sum(queries.filter(q=>!q.stub),'rows'),sqliteReturnedJsonBytes:sum(queries.filter(q=>!q.stub),'returnedJsonBytes'),
 sqliteElapsedMs:sum(queries.filter(q=>!q.stub),'sqlElapsedMs'),elapsedMs,cpu,
 output:{zipBytes,chunks,sha256:zipDigest.digest('hex')},initialMemory,
 sampledPeakMemory:Object.fromEntries(['rss','heapUsed','external','arrayBuffers'].map(k=>[k,Math.max(...memory.map(m=>m[k]))])),
 externalRequests,aiRequests,writes:0,
 byTable:Object.fromEntries([...new Set(queries.map(q=>q.table))].map(table=>{const rows=queries.filter(q=>q.table===table);return [table,{queries:rows.length,rows:sum(rows,'rows'),returnedJsonBytes:sum(rows,'returnedJsonBytes')}];})),
 limitations:['Offline Node/SQLite measurement, not Cloudflare billed rows, CPU, deployed latency, or invoice prediction.',
  'The captured database has no sports_feed table; both versions receive the same documented empty-feed stub, counted separately.',
  'Retained game/audit rows and cached final summaries are identical across versions. Individual scheduled run rows were absent from capture, so that table is empty.',
  'Query response bytes count JSON-serialized returned rows and exclude D1 transport metadata.',
  'ZIP output is consumed and counted without retaining another complete output buffer. Original baseline may buffer internally.',
  'Sampled process memory is not an absolute V8 isolate peak; module/database setup is excluded from timed export.'],queries};
fs.writeFileSync(outputPath,JSON.stringify(metrics,null,2)+'\n');
console.log(JSON.stringify({...metrics,queries:undefined},null,2));
if(response.status!==200)throw Error('Export HTTP '+response.status);
