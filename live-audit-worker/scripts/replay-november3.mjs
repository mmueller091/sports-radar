// Offline replay through the real read-only export path. No network or production writes.
// Usage: node --expose-gc live-audit-worker/scripts/replay-november3.mjs BEFORE_JSON RETAINED_JSON OUTPUT_DIR
import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {performance} from 'node:perf_hooks';
import {buildNightlyExport,renderSummary} from '../src/export.js';
import {reviewHistoricalFindings} from '../src/historical-review.js';
import {jsonTextChunks,zipEntriesStream} from '../src/zip.js';
const [beforePath,retainedPath,outputPath]=process.argv.slice(2);
const existingDatabase=process.argv.find(arg=>arg.startsWith('--existing-db='))?.slice('--existing-db='.length);
const useExisting=Boolean(existingDatabase);
if(!beforePath||!retainedPath||!outputPath)throw Error('Expected before findings JSON, retained D1 JSON, and output directory');
const out=path.resolve(outputPath);fs.mkdirSync(out,{recursive:true});
const before=JSON.parse(fs.readFileSync(beforePath,'utf8').replace(/^\uFEFF/,''));
let retained=useExisting?null:JSON.parse(fs.readFileSync(retainedPath,'utf8').replace(/^\uFEFF/,''));
const localDbPath=existingDatabase?path.resolve(existingDatabase):path.join(out,'offline-replay.sqlite');
if(fs.existsSync(localDbPath)&&!useExisting)throw Error('Output already contains offline-replay.sqlite; choose a new output directory to preserve prior evidence');
const db=new DatabaseSync(localDbPath);
if(!useExisting){
db.exec(`CREATE TABLE sports_snapshots(game_key TEXT,observed_at INTEGER,sport TEXT,state TEXT,rating REAL,score_a TEXT,score_b TEXT,phase TEXT,clock TEXT,normalized_state TEXT,model_version TEXT,PRIMARY KEY(game_key,observed_at));
CREATE TABLE sports_resources(key TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER);
CREATE TABLE live_audit_observations(run_id INTEGER,game_key TEXT,observed_at INTEGER,slate_date TEXT,sport TEXT,state_bucket TEXT,rating REAL,score_a INTEGER,score_b INTEGER,period INTEGER,clock_seconds REAL,evidence TEXT,PRIMARY KEY(game_key,observed_at));
CREATE INDEX observation_slate ON live_audit_observations(slate_date,game_key,observed_at);
CREATE TABLE live_audit_findings(game_key TEXT,reason_code TEXT,first_seen INTEGER,last_seen INTEGER,resolved_at INTEGER,status TEXT,consecutive INTEGER,severity TEXT,confidence REAL,failure_layer TEXT,evidence TEXT);
CREATE TABLE live_audit_events(at INTEGER,game_key TEXT,reason_code TEXT,event TEXT,evidence TEXT);
CREATE TABLE live_audit_runs(started_at INTEGER);`);
function insert(table,rows,columns){
 const stmt=db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
 for(const row of rows)stmt.run(...columns.map(k=>row[k]??null));
}
db.exec('BEGIN');
insert('sports_snapshots',retained.snapshots,['game_key','observed_at','sport','state','rating','score_a','score_b','phase','clock','normalized_state','model_version']);
insert('sports_resources',retained.resources,['key','payload','updated_at']);
for(const game of before.games){
 insert('live_audit_observations',game.observations.map(o=>({run_id:o.runId,game_key:game.gameKey,observed_at:o.observedAt,slate_date:o.slateDate||game.slateDateNewYork,
  sport:game.sport,state_bucket:o.stateBucket,rating:o.rating,score_a:o.scores?.[0],score_b:o.scores?.[1],period:o.period,clock_seconds:o.clockSeconds,
  evidence:JSON.stringify({...o,at:o.observedAt})})),['run_id','game_key','observed_at','slate_date','sport','state_bucket','rating','score_a','score_b','period','clock_seconds','evidence']);
}
for(const f of before.findings){
 insert('live_audit_findings',[{game_key:f.gameKey,reason_code:f.reasonCode,first_seen:f.firstSeen,last_seen:f.lastSeen,resolved_at:f.resolvedAt,status:f.status,
  consecutive:f.observationsDetected,severity:f.severity,confidence:f.confidence,failure_layer:f.failureLayer,evidence:JSON.stringify(f)}],
 ['game_key','reason_code','first_seen','last_seen','resolved_at','status','consecutive','severity','confidence','failure_layer','evidence']);
 insert('live_audit_events',(f.events||[]).map(e=>({at:e.at,game_key:f.gameKey,reason_code:f.reasonCode,event:e.type,evidence:JSON.stringify(e.evidence)})),['at','game_key','reason_code','event','evidence']);
}
db.exec('COMMIT');
}
const capturedAt=retained?.capturedAt||null,inputSnapshotRows=retained?.snapshots.length??db.prepare('SELECT COUNT(*) count FROM sports_snapshots').get().count;retained=null;
if(global.gc)global.gc();
const baselineMemory=process.memoryUsage(),cpuStart=process.cpuUsage(),start=performance.now();
const memorySamples=[],queries=[];
const sample=stage=>memorySamples.push({stage,...process.memoryUsage()});sample('before-export');
function originalAuditScoreTypes(result,sql){
 // Early offline captures used TEXT for these two INTEGER audit columns. Restore
 // the actual D1 scalar type in returned rows without changing the evidence DB.
 if(/FROM\s+live_audit_observations\b/i.test(sql))for(const row of result)for(const key of ['score_a','score_b'])
   if(typeof row[key]==='string'&&row[key].trim()!==''&&Number.isFinite(Number(row[key])))row[key]=Number(row[key]);
 return result;
}
const env={DB:{prepare(sql){
 if(!/^\s*SELECT\b/i.test(sql))throw Error('Replay export attempted a write');
 let args=[];return {bind(...values){args=values;return this},async all(){const result=originalAuditScoreTypes(db.prepare(sql).all(...args),sql);queries.push({table:/FROM\s+(\w+)/i.exec(sql)?.[1],rows:result.length});sample('read');return {results:result}},
 async first(){const result=db.prepare(sql).get(...args)||null;queries.push({table:/FROM\s+(\w+)/i.exec(sql)?.[1],rows:result?1:0});sample('read');return result}};
}}};
const {data}=await buildNightlyExport(env,before.metadata.slateDateNewYork,{now:Date.now()});
sample('after-export');
// The original ZIP retains aggregate run health, not individual run rows. Preserve
// those exact original totals explicitly instead of manufacturing successful runs.
data.sourceHealth={...before.sourceHealth,onDemandInputReads:data.sourceHealth.onDemandInputReads,onDemandSnapshotReads:data.sourceHealth.onDemandSnapshotReads,onDemandTimelineReads:data.sourceHealth.onDemandTimelineReads,
 replayRunHealthProvenance:'Original nightly export aggregates; individual scheduled run rows were not included in this replay input'};
data.metadata.replay={beforeSource:path.basename(beforePath),retainedSource:path.basename(retainedPath),capturedAt,inputSnapshotRows,
 limitation:'Audit rows rehydrated from original export; run health inherited as original aggregates. Retained cached summaries may be later provider revisions.'};
data.scoringQuality.historicalFindingReview=reviewHistoricalFindings(data);
const summary=renderSummary(data);let compactJsonBytes=0;
const jsonFd=fs.openSync(path.join(out,'after-findings.json'),'wx');
try{for(const text of jsonTextChunks(data)){compactJsonBytes+=fs.writeSync(jsonFd,text);sample('json-stream');}}finally{fs.closeSync(jsonFd);}
fs.writeFileSync(path.join(out,'after-summary.md'),summary);
const zipPath=path.join(out,`slatemeter-audit-${before.metadata.slateDateNewYork}.zip`),zipFd=fs.openSync(zipPath,'wx');let zipBytes=0;
try{for await(const bytes of zipEntriesStream([['summary.md',summary],['findings.json',jsonTextChunks(data)]])){fs.writeSync(zipFd,bytes);zipBytes+=bytes.length;sample('zip-stream');}}finally{fs.closeSync(zipFd);}
const countJsonBytes=value=>{let bytes=0;for(const text of jsonTextChunks(value))bytes+=Buffer.byteLength(text);return bytes;};
const snapshotJsonBytes=countJsonBytes(data.games.map(g=>g.retainedScoringObservations)),qualityJsonBytes=countJsonBytes(data.scoringQuality);sample('metrics');
const peakMemory=Object.fromEntries(['rss','heapUsed','external','arrayBuffers'].map(k=>[k,Math.max(...memorySamples.map(s=>s[k]))]));
const metrics={node:process.version,elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpuStart),baselineMemory,peakMemory,
 heapIncreaseBytes:peakMemory.heapUsed-baselineMemory.heapUsed,providerRequests:0,aiRequests:0,productionWrites:0,
 output:{compactJsonBytes,summaryBytes:Buffer.byteLength(summary),zipBytes,
  observationRows:data.games.reduce((n,g)=>n+g.observations.length,0),snapshotRows:data.games.reduce((n,g)=>n+g.retainedScoringObservations.length,0),
  snapshotJsonBytes,qualityJsonBytes},
 queries:{count:queries.length,returnedRows:queries.reduce((n,q)=>n+q.rows,0),byTable:Object.fromEntries([...new Set(queries.map(q=>q.table))].map(t=>[t,queries.filter(q=>q.table===t).length]))},
 coverageGaps:data.coverageGaps,limits:'Local Node/SQLite benchmark, not billed Cloudflare CPU or exact Worker isolate memory. Import memory is excluded from the export baseline; production uses bounded D1 pages.'};
fs.writeFileSync(path.join(out,'replay-metrics.json'),JSON.stringify(metrics,null,2));db.close();console.log(JSON.stringify(metrics,null,2));
