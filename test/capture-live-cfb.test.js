import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {scoreCaptured,captureCycle,createReader,policyNames} from '../scripts/capture-live-cfb.mjs';
const core=await loadCore();
const fixture=loadFixtures().find(f=>String(f.eventId)==='401858264');
const cps=replayCheckpoints(fixture).checkpoints;
const cp=cps.find(c=>c.competition.situation.down===3&&c.competition.status.period===3);

test('fixture capture evaluates identical immutable inputs with three policies',()=>{
  const before=JSON.stringify(cp),result=scoreCaptured(core,cp.event,cp.summary);
  assert.equal(result.evaluated,true);assert.equal(result.summaryAccepted,true);
  assert.deepEqual(Object.keys(result.ratings),policyNames);
  assert.equal(JSON.stringify(cp),before);assert.ok(result.inputSha256);
  assert.equal(result.situation.down,3);assert.ok(result.situation.possession);
});

test('missing scores/clock fail explicitly; missing summary never becomes zero WP',()=>{
  for(const missing of [null,undefined,'']) {
    const event=structuredClone(cp.event);event.competitions[0].competitors[0].score=missing;
    assert.equal(scoreCaptured(core,event,cp.summary).evaluated,false);
  }
  const event=structuredClone(cp.event);delete event.competitions[0].status.displayClock;
  assert.equal(scoreCaptured(core,event,cp.summary).evaluated,false);
  const r=scoreCaptured(core,cp.event,null);
  assert.equal(r.evaluated,true);assert.equal(r.currentWinProbability,null);
  assert.equal(r.situation.down,null);assert.equal(r.situation.possession,null);
  assert.equal(r.sourceAgeMs,null);assert.equal(r.summaryAccepted,false);
});

test('summary advance and stale scoring state cannot enrich an earlier capture',()=>{
  const future=structuredClone(cp.summary);future.header.competitions[0].status.displayClock='0:01';
  const r=scoreCaptured(core,cp.event,future);
  assert.equal(r.summaryAccepted,false);assert.equal(r.currentWinProbability,null);
  assert.ok(r.issues.includes('summary-not-aligned-with-scoreboard'));
  const wrongScore=structuredClone(cp.summary);wrongScore.header.competitions[0].competitors[0].score='99';
  assert.equal(scoreCaptured(core,cp.event,wrongScore).summaryAccepted,false);
});

test('scoring and unsupported timeouts cannot manufacture active scrimmage',()=>{
  const scoring=cps.find(c=>c.situationValidation?.state==='scoring');assert.ok(scoring);
  const event=structuredClone(scoring.event);
  event.competitions[0].situation={...cp.competition.situation};
  const r=scoreCaptured(core,event,scoring.summary);
  assert.equal(r.situation.down,null);assert.equal(r.situation.possession,null);
  const timeout=structuredClone(cp.summary);
  timeout.plays=[{...cp.play,type:{text:'Timeout'},scoringPlay:false}];
  timeout.scoringPlays=[];delete timeout.drives;
  const t=scoreCaptured(core,cp.event,timeout);
  assert.equal(t.situation.possession,null);assert.equal(t.situation.down,null);
});

test('fixture polling deduplicates feeds, evaluates all games, ranks each policy and discloses failures',async()=>{
  const second=structuredClone(cp.event);second.id='second';
  const readJson=async url=>url.includes('scoreboard')?{events:[cp.event,second]}:
    url.includes('second')?Promise.reject(new Error('fixture summary failure')):cp.summary;
  const r=await captureCycle({core,readJson,date:'20261031'});
  assert.equal(r.coverage.discovered,2);assert.equal(r.coverage.evaluated,2);
  assert.equal(r.coverage.incomplete,true);assert.equal(r.games[1].summaryFailure,'fixture summary failure');
  for(const p of policyNames){assert.equal(r.ranked[p].length,2);assert.ok(r.ranked[p][0].rating>=r.ranked[p][1].rating);
    assert.deepEqual(r.ranked[p][0].score,Object.fromEntries(cp.competition.competitors.map(t=>[t.homeAway,Number(t.score)])));}
  const failed=await captureCycle({core,date:'20261031',readJson:async()=>{throw new Error('fixture board failure');}});
  assert.equal(failed.coverage.incomplete,true);assert.equal(failed.coverage.feeds.length,2);
  assert.equal(failed.coverage.evaluated,0);
});

test('fixture transport logs raw responses and bounded retries; abort ends promptly',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cfb-capture-test-')),file=path.join(dir,'raw.jsonl');
  let calls=0;
  const reader=createReader({rawFile:file,fetchImpl:async()=>{calls++;return new Response('unavailable',{status:503});}});
  await assert.rejects(reader('https://fixture.invalid'),/503/);assert.equal(calls,2);
  const lines=fs.readFileSync(file,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.filter(l=>l.body==='unavailable').length,2);
  const stop=new AbortController();stop.abort();
  await assert.rejects(createReader({rawFile:file,signal:stop.signal,fetchImpl:async()=>{throw new Error('must not fetch');}})('https://fixture.invalid'),/abort/i);
});
