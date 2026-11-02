import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import '../tennis-coverage.js';
const worker='https://sports-radar-alerts.mmueller918.workers.dev';
const site='https://mmueller091.github.io/sports-radar/';
const assets=process.argv.includes('--assets');
const label=process.argv.find(arg=>arg.startsWith('--label='))?.slice(8)||'production';
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const results={checkedAt:new Date().toISOString(),revision,requests:[],assets:[]};
async function get(path){
  const response=await fetch(worker+path,{cache:'no-store',headers:{Origin:'https://mmueller091.github.io'}});
  results.requests.push({path,status:response.status});
  assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://mmueller091.github.io');
  return {response,body:await response.json()};
}
const health=await get('/health'),first=await get('/feed');
assert.equal(health.response.status,200);assert.equal(first.response.status,200);
assert.equal(first.body.modelVersion,'2026-11-01.audit-integrity.3');
assert.equal(health.body.modelVersion,first.body.modelVersion);
assert.equal(first.body.freshness.stale,false);assert.deepEqual(first.body.sourceErrors,[]);
assert.ok(first.body.games.every(g=>globalThis.SportsRadarTennisCoverage.currentGameAllowed(g)));
// November 2 is outside all major windows: the expected current Tennis slate is empty.
assert.equal(first.body.games.filter(g=>g.sport==='Tennis').length,0);
assert.equal(new Set(first.body.games.map(g=>`${g.sport}:${g.id}`)).size,first.body.games.length);
results.feed={updatedAt:first.body.updatedAt,revision:first.body.revision,modelVersion:first.body.modelVersion,
  sourceErrors:first.body.sourceErrors,freshness:first.body.freshness,
  counts:first.body.games.reduce((m,g)=>(m[g.sport]=(m[g.sport]||0)+1,m),{})};
const baseline=JSON.parse(fs.readFileSync('work/baseline-feed.json'));
const removed=baseline.games.filter(g=>g.sport==='Tennis');
results.excluded={count:removed.length,tournaments:[...new Set(removed.map(g=>g.tennisTournament?.name))]};
for(const state of ['live','upcoming']){
  const game=removed.find(g=>g.state===state);
  if(game){const {response}=await get(`/game/Tennis/${game.id}`);assert.equal(response.status,404);}
}
// Every other currently represented sport retains a canonical detail endpoint.
for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','Soccer']){
  const game=first.body.games.find(g=>g.sport===sport);
  if(!game)continue;
  const {response,body}=await get(`/game/${sport}/${game.id}`);assert.equal(response.status,200);
  assert.equal(body.sportsRadarGame.id,game.id);assert.equal(body.sportsRadarGame.sport,sport);
}
const repeated=await get('/feed');assert.equal(repeated.response.status,200);
assert.equal(repeated.body.games.filter(g=>g.sport==='Tennis').length,0);
if(assets){
  const names=fs.readdirSync('dist').filter(name=>fs.statSync('dist/'+name).isFile());
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const name of names){
    const response=await fetch(site+name+'?verify='+revision,{cache:'no-store'});assert.equal(response.status,200,name);
    const bytes=Buffer.from(await response.arrayBuffer());
    assert.equal(hash(bytes),hash(fs.readFileSync('dist/'+name)),name);
    results.assets.push({name,status:response.status,sha256:hash(bytes)});
  }
  const html=fs.readFileSync('dist/index.html','utf8'),sw=fs.readFileSync('dist/sw.js','utf8');
  assert.ok(html.includes('tennis-coverage.js?rev='+revision));assert.ok(sw.includes(revision));
}
fs.writeFileSync(`work/${label}-verification.json`,JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results,null,2));
