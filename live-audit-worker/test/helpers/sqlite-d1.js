import {DatabaseSync} from 'node:sqlite';

// Execute the scanner's real SQL against SQLite. Canonical tables are read-only
// through this adapter: any accidental production write fails the test at once.
const schema=`
CREATE TABLE sports_feed(id INTEGER PRIMARY KEY,payload TEXT);
CREATE TABLE sports_feed_parts(revision TEXT,part INTEGER,payload TEXT);
CREATE TABLE sports_resources(key TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER);
CREATE TABLE sports_snapshots(game_key TEXT,observed_at INTEGER,sport TEXT,state TEXT,rating INTEGER,score_a TEXT,score_b TEXT,phase TEXT,clock TEXT,normalized_state TEXT,model_version TEXT,PRIMARY KEY(game_key,observed_at,state));
CREATE INDEX sports_snapshot_game_time ON sports_snapshots(game_key,observed_at);
CREATE TABLE live_audit_runs(id INTEGER PRIMARY KEY AUTOINCREMENT,started_at INTEGER NOT NULL,finished_at INTEGER,feed_updated_at INTEGER,feed_revision TEXT,model_version TEXT,games_checked INTEGER DEFAULT 0,checks_completed INTEGER DEFAULT 0,clean_games INTEGER DEFAULT 0,flagged_games INTEGER DEFAULT 0,provider_requests INTEGER DEFAULT 0,storage_writes INTEGER DEFAULT 0,notifications INTEGER DEFAULT 0,error TEXT);
CREATE TABLE live_audit_observations(run_id INTEGER,game_key TEXT,observed_at INTEGER,slate_date TEXT,sport TEXT,state_bucket TEXT,rating INTEGER,score_a INTEGER,score_b INTEGER,period INTEGER,clock_seconds INTEGER,evidence TEXT,PRIMARY KEY(run_id,game_key));
CREATE INDEX live_audit_game_history ON live_audit_observations(game_key,observed_at DESC);
CREATE INDEX live_audit_comparables ON live_audit_observations(sport,state_bucket,observed_at DESC);
CREATE TABLE live_audit_findings(game_key TEXT,reason_code TEXT,first_seen INTEGER,last_seen INTEGER,resolved_at INTEGER,status TEXT,consecutive INTEGER,severity TEXT,confidence REAL,failure_layer TEXT,evidence TEXT,PRIMARY KEY(game_key,reason_code));
CREATE TABLE live_audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,at INTEGER,game_key TEXT,reason_code TEXT,event TEXT,evidence TEXT);
`;

export function sqliteD1(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
  const operations=[];
  const prepare=(sql,params=[])=>{
    const operation=()=>{
      const mutation=/^\s*(?:INSERT(?:\s+OR\s+\w+)?\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i.exec(sql);
      if(mutation&&!mutation[1].startsWith('live_audit_'))throw new Error('Production write blocked: '+mutation[1]);
      const kind=mutation?'write':'read';operations.push({kind,table:mutation?.[1]??null,sql,bindBytes:Buffer.byteLength(JSON.stringify(params))});
      return sqlite.prepare(sql);
    };
    return {bind(...values){return prepare(sql,values);},
      async first(){return operation().get(...params)||null;},
      async all(){return {results:operation().all(...params)};},
      async run(){const result=operation().run(...params);return {success:true,meta:{last_row_id:Number(result.lastInsertRowid),changes:Number(result.changes)}};}};
  };
  return {sqlite,operations,DB:{prepare,async batch(statements){const results=[];for(const s of statements)results.push(await s.run());return results;}},
    feed(games,at,{modelVersion='test-model',sourceErrors=[],parts=false,scoreCalculations={}}={}){
      const revision=parts?String(at)+':test':null;
      const payload={updatedAt:new Date(at).toISOString(),modelVersion,sourceErrors,scoreCalculations,
        ...(parts?{revision,parts:1}:{games})};
      sqlite.prepare('INSERT OR REPLACE INTO sports_feed(id,payload) VALUES (1,?)').run(JSON.stringify(payload));
      sqlite.prepare('DELETE FROM sports_feed_parts').run();
      if(parts)sqlite.prepare('INSERT INTO sports_feed_parts VALUES (?,?,?)').run(revision,0,JSON.stringify(games));
    },
    snapshot(game,at){sqlite.prepare('INSERT INTO sports_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      game.sport+':'+game.id,at,game.sport,game.state,game.score,String(game.teams[0][2]),String(game.teams[1][2]),
      String(game.liveRawStatus.period),game.liveRawStatus.displayClock,JSON.stringify(game),game.modelVersion||'test-model');},
    resource(key,payload,at){sqlite.prepare('INSERT OR REPLACE INTO sports_resources VALUES (?,?,?)').run(key,JSON.stringify(payload),at);},
    metrics(){const evidence=sqlite.prepare('SELECT evidence FROM live_audit_observations').all();return {
      readQueries:operations.filter(o=>o.kind==='read').length,writeStatements:operations.filter(o=>o.kind==='write').length,
      observationRows:evidence.length,observationBytes:evidence.reduce((n,r)=>n+Buffer.byteLength(r.evidence),0),
      bindBytes:operations.reduce((n,o)=>n+o.bindBytes,0)};},
    close(){sqlite.close();}};
}
