// Exercise the production claim SQL with distinct model keys, real concurrent
// SQLite connections and an explicit barrier. No provider data or push transport.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {CONSUMED_GAME_ALERT_SQL} from '../../alerts-worker/src/alert-delivery.js';

if(!isMainThread){
  const db=new DatabaseSync(workerData.filename);
  db.exec('PRAGMA busy_timeout=10000');
  const barrier=new Int32Array(workerData.barrier);
  parentPort.postMessage({ready:true});
  Atomics.wait(barrier,0,0);
  const changes=db.prepare(workerData.sql).run(...workerData.values).changes;
  db.close();parentPort.postMessage({changes});
}else{
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const dir=path.join(root,'work','alert-sql-race');fs.mkdirSync(dir,{recursive:true});
  const source=fs.readFileSync(path.join(root,'alerts-worker/src/alert-delivery.js'),'utf8');
  const matched=source.match(/const claim=await env\.DB\.prepare\(`(UPDATE alerts SET status=\?[\s\S]*?)`\)/);
  assert.ok(matched,'must exercise the exact production claim query');
  const sql=matched[1].replace('${CONSUMED_GAME_ALERT_SQL}',CONSUMED_GAME_ALERT_SQL);
  const results=[];
  for(let round=0;round<20;round++){
    const filename=path.join(dir,`race-${process.pid}-${round}.sqlite`),db=new DatabaseSync(filename);
    db.exec(fs.readFileSync(path.join(root,'alerts-worker/schema.sql'),'utf8'));
    const keys=['prior-model:NCAAB:race_game','current-model:NCAAB:race_game'];
    for(const key of keys)db.prepare('INSERT INTO alerts (token_hash,game_key,score,title,body,created_at) VALUES (?,?,?,?,?,?)')
      .run('device',key,90,'Race','Race',1);
    const barrier=new SharedArrayBuffer(4),state=new Int32Array(barrier);
    let ready=0;
    const claims=await Promise.all(keys.map((key,index)=>new Promise((resolve,reject)=>{
      const worker=new Worker(new URL(import.meta.url),{workerData:{filename,barrier,sql,
        values:[`sending:owner-${index}`,'device',key,1,'device','NCAAB:race_game',':NCAAB:race_game',':NCAAB:race_game']}});
      worker.on('message',message=>{
        if(message.ready){if(++ready===2){Atomics.store(state,0,1);Atomics.notify(state,0,2);}}
        else resolve(message.changes);
      });worker.on('error',reject);worker.on('exit',code=>{if(code)reject(Error(`Worker exit ${code}`));});
    })));
    assert.equal(claims.reduce((sum,n)=>sum+n,0),1,'exactly one model may claim the game');
    const statuses=db.prepare('SELECT game_key,status FROM alerts ORDER BY game_key').all();
    assert.equal(statuses.filter(row=>row.status.startsWith('sending:')).length,1);
    assert.equal(statuses.filter(row=>row.status==='pending').length,1);
    db.close();fs.unlinkSync(filename);results.push({round,claims,statuses});
  }
  const report={result:'PASS',rounds:results.length,method:'two worker threads, separate real SQLite connections, simultaneous start barrier, exact production conditional claim SQL',results};
  fs.writeFileSync(new URL('alert-cross-model-sql-race.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(`PASS: ${results.length}/20 cross-model races; exactly one successful claim per game`);
}
