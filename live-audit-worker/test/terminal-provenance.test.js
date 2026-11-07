import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {buildNightlyExport} from '../src/export.js';
import {sqliteD1} from './helpers/sqlite-d1.js';

test('actual USF–ECU export preserves ratings and propagates invalid timing through SQL projections',async t=>{
  const env=sqliteD1();t.after(()=>env.close());
  const {rows}=JSON.parse(gunzipSync(fs.readFileSync(new URL('../../test/fixtures/usf-ecu-20261106.json.gz',import.meta.url))));
  const insert=env.sqlite.prepare('INSERT INTO sports_snapshots VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  for(const r of rows)insert.run(r.game_key,r.observed_at,'CFB',r.state,r.rating,r.score_a,r.score_b,r.phase,r.clock,r.normalized_state,r.model_version);
  const row=rows.find(r=>r.state==='live'&&r.rating===24),state=JSON.parse(row.normalized_state);
  env.sqlite.prepare('INSERT INTO live_audit_observations VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(1,row.game_key,row.observed_at,'2026-11-06','CFB','late:close',24,10,17,4,0,
    JSON.stringify({state,scoringVersion:row.model_version,rawInputReferences:[]}));
  env.feed([],Date.parse('2026-11-07T06:00:00Z'));
  const {data}=await buildNightlyExport(env,'2026-11-06',{feed:{games:[]},now:Date.parse('2026-11-07T06:00:00Z')});
  const endings=data.games[0].retainedScoringObservations.filter(p=>p.state.state==='live'&&p.period===4&&p.clock==='0:00');
  assert.deepEqual(endings.filter(p=>p.state.evidenceQuality==='invalid').map(p=>p.rating),[24,24,24,24,24,24]);
  assert.deepEqual(endings.filter(p=>p.state.evidenceQuality!=='invalid').map(p=>p.rating),[40,43,48]);
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM sports_snapshots').get().n,rows.length);
  assert.ok(env.operations.every(o=>o.kind==='read'),'export is entirely read-only');
});
