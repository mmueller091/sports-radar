import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {normalizeEvent} from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs'),nfl=require('../test/helpers/nfl-calibration.cjs');
const deployed=process.argv.includes('--production');
const site='https://mmueller091.github.io/sports-radar/',worker='https://sports-radar-alerts.mmueller918.workers.dev';
const get=async url=>{const r=await fetch(url,{cache:'no-store'});assert.ok(r.ok,`${url}: ${r.status}`);return r;};
const read=async path=>deployed ? (await get(site+path+'?verify='+Date.now())).text() : fs.readFileSync('dist/'+path,'utf8');
const browser=vm.runInNewContext(await read('scoring-runtime.js')+';SportsRadarScore');
assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
const app=await read('app.js'),ctx=vm.createContext({});
vm.runInContext(app.slice(app.indexOf('function compactClockPeriod('),app.indexOf('function broadcastWatchMarkup(')),ctx);
assert.equal(ctx.compactClockPeriod({sport:'NHL',status:'Shootout',live:{phase:'0:00 · 2OT'},liveRawStatus:{period:5,displayClock:'0:00'}}),'Shootout');
assert.ok(app.includes("period === 'Shootout' ? ''"),'shootout badge suppresses its countdown');
assert.equal(browser.livePhase('NHL',{period:5,type:{detail:'Shootout'}}),'Shootout');
const probes=[];
function probe(name,event,summary,sport,check) {
  const a=normalizeEvent(structuredClone(event),sport),b=normalizeEvent(structuredClone(event),sport);
  runtime.applyLiveSnapshot(a,a.sourceCompetition,structuredClone(summary));
  browser.applyLiveSnapshot(b,b.sourceCompetition,structuredClone(summary));
  assert.equal(b.score,a.score,name);
  assert.deepEqual(JSON.parse(JSON.stringify(b.live)),JSON.parse(JSON.stringify(a.live)),name);
  check(b);probes.push({name,score:b.score,note:b.live.note});
}
for (const [name,file] of [['CFB pending conversion','cfb-pending-try-401856846.json'],['CFB overtime handoff','cfb-overtime-response-401856846.json']]) {
  const f=JSON.parse(fs.readFileSync('test/fixtures/'+file));
  probe(name,f.event,f.summary,'CFB',game=>assert.ok(game.score>=95));
}
function nflOpening(type=2,clock='3:00') {
  const f=nfl.fixture({scores:[28,21],period:5,clock,possession:''});
  f.event={...f.event,id:'release-nfl-ot',season:{year:2026,type},competitions:[f.competition]};
  f.competition.season=f.event.season;f.summary.header.season=f.event.season;
  const last={id:'score',scoreValue:7,scoringPlay:true,text:'Touchdown (Kicker KICK)',period:{number:5},team:{id:'h'},
    homeScore:28,awayScore:21,start:{team:{id:'h'}}};
  const drive={id:'first',result:'TD',team:{id:'h'},start:{period:{number:5}},plays:[
    {id:'first-play',homeScore:21,awayScore:21,start:{team:{id:'h'}}},last]};
  f.competition.situation={down:-1,lastPlay:last};f.summary.drives={previous:[drive],current:drive};
  return f;
}
for (const [name,type,clock,pending] of [['NFL opening TD response',2,'3:00',true],['NFL regular-season expiry',2,'0:00',false],['NFL playoff continuation',3,'0:00',true]]) {
  const f=nflOpening(type,clock);
  probe(name,f.event,f.summary,'NFL',game=>pending ? (assert.ok(game.score>=90),assert.match(game.live.note,/response pending/)) : assert.doesNotMatch(game.live.note,/response pending/));
}
const result={deployed,model:runtime.MODEL_VERSION,probes};
if (deployed) {
  const health=await (await get(worker+'/health')).json(),feed=await (await get(worker+'/feed')).json();
  assert.equal(health.modelVersion,runtime.MODEL_VERSION);assert.equal(feed.modelVersion,runtime.MODEL_VERSION);
  for (const game of feed.games.filter(g=>g.state!=='completed')) assert.equal(game.modelVersion,runtime.MODEL_VERSION);
  const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const html=await read('index.html'),sw=await read('sw.js');
  assert.ok(html.includes('scoring-runtime.js?rev='+revision),'deployed asset revision');assert.ok(sw.includes(revision),'service-worker cache revision');
  Object.assign(result,{revision,workerModel:health.modelVersion,feedModel:feed.modelVersion,games:feed.games.length,updatedAt:feed.updatedAt,site,worker});
}
fs.mkdirSync('work/football-ot',{recursive:true});
fs.writeFileSync(`work/football-ot/${deployed?'production':'build'}-verification.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
