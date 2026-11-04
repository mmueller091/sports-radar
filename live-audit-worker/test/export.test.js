import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import worker from '../src/index.js';
import {buildNightlyExport,defaultSlateDate,slateDateNY} from '../src/export.js';
import {zipEntries} from '../src/zip.js';

const date='2026-11-03';
const a=Date.parse('2026-11-03T21:03:00Z'),b=Date.parse('2026-11-04T05:03:00Z');
function observation(key,at,rating,startTime,runId) {
  const [sport,id]=key.split(':');
  return {run_id:runId,game_key:key,observed_at:at,slate_date:date,sport,state_bucket:'late:close',
    rating,score_a:3,score_b:3,period:3,clock_seconds:90,
    evidence:JSON.stringify({auditVersion:'fixture-audit',scoringVersion:'fixture-score',
      state:{id,sport,state:'live',startTime,score:rating,teams:[['Away','AWY','3'],['Home','HOM','3']],password:'must-not-export'},
      rawInputReferences:[{source:'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=2&token=leak'}],
      auditCandidates:key.endsWith('2')?[{reasonCode:'INVALID_PERIOD',severity:'critical',confidence:1,
        failureLayer:'provider data',observed:{period:0},expected:'positive period',detail:'Bad provider period',deterministic:true}]:[]})};
}
const fixtures={
  'NHL:1':[observation('NHL:1',a,50,'2026-11-03T21:00:00Z',1),observation('NHL:1',a+180000,53,'2026-11-03T21:00:00Z',2)],
  'NHL:2':[observation('NHL:2',b,70,'2026-11-04T03:30:00Z',3),observation('NHL:2',b+180000,74,'2026-11-04T03:30:00Z',4)]
};
const finding={game_key:'NHL:2',reason_code:'INVALID_PERIOD',first_seen:b,last_seen:b+180000,resolved_at:b+360000,
  status:'recovered',severity:'critical',confidence:1,failure_layer:'provider data',
  evidence:JSON.stringify({deterministic:true,detail:'Bad provider period',observed:{period:0},expected:'positive period',
    rawInputReferences:[{apiKey:'do-not-export'}]})};
const events=[{game_key:'NHL:2',reason_code:'INVALID_PERIOD',at:b,event:'opened',evidence:finding.evidence},
  {game_key:'NHL:2',reason_code:'INVALID_PERIOD',at:b+360000,event:'recovered',evidence:finding.evidence}];
const runs=[a,a+180000,b,b+180000].map((started_at,i)=>({id:i+1,started_at,finished_at:started_at+1000,
  feed_updated_at:started_at-30000,model_version:'fixture-score',provider_requests:0,error:null}));
function fakeDb() {
  return {prepare(sql){let args=[];return {bind(...values){args=values;return this},async all(){
    if(sql.includes('SELECT DISTINCT slate_date'))return {results:[{slate_date:date}]};
    if(sql.includes('SELECT DISTINCT game_key'))return {results:Object.keys(fixtures).filter(key=>key>args[1]).map(game_key=>({game_key}))};
    if(sql.includes('FROM live_audit_observations') && sql.includes('run_id,game_key'))
      return {results:(fixtures[args[1]] || []).filter(row=>row.observed_at>args[2])};
    if(sql.includes('FROM live_audit_findings'))return {results:args[0]==='NHL:2'?[finding]:[]};
    if(sql.includes('FROM live_audit_events'))return {results:args[0]==='NHL:2'?events:[]};
    if(sql.includes('FROM sports_snapshots'))return {results:[]};
    if(sql.includes('FROM live_audit_runs'))return {results:runs.filter(run=>run.started_at>=args[0]&&run.started_at<=args[1])};
    return {results:[]};
  },async first(){
    if(sql.includes('FROM sports_feed'))return {payload:JSON.stringify({updatedAt:new Date(b).toISOString(),games:[]})};
    return null;
  }}}};
}
function unzipStored(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),decoder=new TextDecoder(),files={};
  let offset=0;
  while(view.getUint32(offset,true)===0x04034b50){
    const size=view.getUint32(offset+18,true),nameLength=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
    const name=decoder.decode(bytes.slice(offset+30,offset+30+nameLength));
    files[name]=decoder.decode(bytes.slice(offset+30+nameLength+extra,offset+30+nameLength+extra+size));
    offset+=30+nameLength+extra+size;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50);
  return files;
}
test('New York slate date survives midnight and default selects completed slate',async()=>{
  assert.equal(slateDateNY('2026-11-04T05:03:00Z'),'2026-11-04');
  assert.equal(slateDateNY('2026-11-04T03:30:00Z'),date);
  const selected=await defaultSlateDate({DB:fakeDb()},{games:[{state:'upcoming',startTime:'2026-11-04T20:00:00Z'}]},b);
  assert.equal(selected.defaultDate,date);
});
test('nightly ZIP contains clean and flagged games, history, and no secrets',async()=>{
  const env={DB:fakeDb(),AUDIT_READ_TOKEN:'fixture-password'};
  const {data,summary}=await buildNightlyExport(env,date,{feed:{games:[]},now:b+7200000});
  assert.deepEqual(data.games.map(game=>game.gameKey),['NHL:1','NHL:2']);
  assert.equal(data.games[0].findings.length,0);
  assert.equal(data.games[1].slateDateNewYork,date);
  assert.equal(data.games[1].observations[1].ratingChange,4);
  assert.equal(data.findings[0].classification,'confirmed_integrity_failure');
  assert.equal(data.findings[0].status,'recovered');
  assert.equal(data.findings[0].events.length,2);
  assert.equal(data.metadata.totalScans,4);
  assert.match(summary,/NHL:1|Away vs Home/);
  const zip=zipEntries([['summary.md',summary],['findings.json',JSON.stringify(data,null,2)]]);
  const files=unzipStored(zip);
  assert.deepEqual(Object.keys(files),['summary.md','findings.json']);
  assert.equal(JSON.parse(files['findings.json']).games.length,2);
  assert.doesNotMatch(files['findings.json'],/must-not-export|do-not-export|fixture-password|token=leak/);
  fs.mkdirSync(new URL('../../work/',import.meta.url),{recursive:true});
  fs.writeFileSync(new URL('../../work/nightly-audit-test.zip',import.meta.url),zip);
  const response=await worker.fetch(new Request(`https://audit.example/export?date=${date}`,{headers:{Authorization:'Bearer fixture-password'}}),env);
  assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/slatemeter-audit-2026-11-03.zip/);
  const downloaded=unzipStored(new Uint8Array(await response.arrayBuffer()));
  assert.match(downloaded['summary.md'],/Games monitored: 2/);
  assert.equal(JSON.parse(downloaded['findings.json']).games.length,2);
  assert.equal((await worker.fetch(new Request(`https://audit.example/export?date=${date}`),env)).status,401);
  const quality=await worker.fetch(new Request(`https://audit.example/quality?date=${date}`,{headers:{Authorization:'Bearer fixture-password'}}),env);
  assert.equal(quality.status,200);
  const result=await quality.json();assert.equal(result.dateNewYork,date);assert.equal(result.scoringQuality.calibration.length,8);
  assert.ok(data.scoringQuality);assert.match(summary,/## Scoring Quality/);
});
