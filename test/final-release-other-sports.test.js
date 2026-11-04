import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Module} from 'node:module';
import {createHash} from 'node:crypto';
import * as active from '../alerts-worker/src/live-game-model.js';
import {tennisEvents,attachTennisMatch} from '../alerts-worker/src/providers/tennis.js';

const fixtureRoot=new URL('../alerts-worker/test/fixtures/tennis-grand-slams/',import.meta.url);
const oraclePath=new URL('./fixtures/live-underdog-before.cjs.gz',import.meta.url);
const oracleBytes=fs.readFileSync(oraclePath),oracle=new Module(oraclePath.pathname);
oracle._compile(gunzipSync(oracleBytes).toString(),oraclePath.pathname);
const before=oracle.exports;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const provenance=JSON.parse(fs.readFileSync(new URL('./fixtures/live-underdog-before.provenance.json',import.meta.url)));
assert.equal(hash(oracleBytes),provenance.compressedSha256,'independent frozen production oracle');
const fields=['score','baseScore','openingScore','rawPregameScore','factors','momentumPoints','upsetPoints','upsetText',
 'openingFactors','live','trajectoryScoring','historyOwnership','why','scoringPartial','evidenceQuality','evidenceReasons',
 'evidenceCoverage','inputEvidence','tennisCoverage'];
const scoringBytes=g=>JSON.stringify(Object.fromEntries(fields.filter(k=>g[k]!==undefined).map(k=>[k,g[k]])));
function compare(event,sport,summary=null,tennis=false){
 const run=api=>{
  const g=api.normalizeEvent(structuredClone(event),sport);
  assert.ok(g,`${sport} event normalized`);
  if(summary)api.enrichGame(g,structuredClone(summary));
  if(tennis)attachTennisMatch(g);
  return g;
 };
 const old=run(before),next=run(active);
 assert.equal(scoringBytes(next),scoringBytes(old),`${sport} ${event.id}: serialized scoring must be byte-identical`);
 return next;
}

test('final release: all 16 genuine major Tennis captures retain byte-identical scoring through provider match normalization',()=>{
 let observations=0;const identities=new Set(),states=new Set();
 const files=fs.readdirSync(fixtureRoot).filter(f=>f.endsWith('.json'));
 assert.equal(files.length,16);
 for(const file of files){
  const url=new URL(file,fixtureRoot),bytes=fs.readFileSync(url),payload=JSON.parse(bytes);
  assert.match(payload.source,/^https:\/\/site\.api\.espn\.com\/.*\/tennis\//);
  assert.ok(payload.capturedAt,'archive provenance is retained');
  for(const event of tennisEvents(payload)){
   const game=compare(event,'Tennis',null,true);
   observations++;identities.add(event.id);states.add(game.state);
  }
  assert.equal(hash(fs.readFileSync(url)),hash(bytes),'source fixture unchanged');
 }
 assert.equal(observations,80);assert.equal(identities.size,40);
 console.log('OTHER_SPORT_ARCHIVE_PARITY '+JSON.stringify({sport:'Tennis',captures:files.length,observations,uniqueMatches:identities.size,states:[...states],differences:0}));
});

function simulation({sport,state='live',period=2,clock='85:00',away=1,home=1,situation={},bestOf=3,context=''}){
 const competition={id:'simulation-other-sport',date:'2026-11-03T17:00:00Z',
  status:{period,displayClock:clock,type:{state:state==='live'?'in':state==='completed'?'post':'pre',completed:state==='completed',detail:context||'Controlled simulation'}},
  format:{regulation:{periods:bestOf}},situation,
  notes:context?[{headline:context}]:[],competitors:[
   {id:'sim-home',homeAway:'home',score:String(home),team:{id:'sim-home',displayName:'Simulated Home',abbreviation:'SH'}},
   {id:'sim-away',homeAway:'away',score:String(away),team:{id:'sim-away',displayName:'Simulated Away',abbreviation:'SA'}}]};
 const event={id:'simulation-other-sport',name:'Controlled simulation, not a historical provider observation',date:competition.date,
  season:{year:2026,type:2},competitions:[competition]};
 const summary={header:{id:event.id,competitions:[structuredClone(competition)]},plays:[],scoringPlays:[],winprobability:[]};
 return {event,summary,sport};
}

test('final release: labeled Soccer simulations retain byte-identical scoring across phases, scores, red cards and knockout situations',()=>{
 let observations=0,finite=0;
 const phases=[[1,'15:00'],[1,'45:00'],[2,'85:00'],[2,"90'+4"],[4,'118:00'],[5,'120:00']];
 for(const state of ['upcoming','live','completed'])for(const [period,clock] of phases)for(const [away,home] of [[0,0],[0,1],[1,1],[0,4]]){
  const context=period===5?'Penalty shootout':period===4?'Champions League semifinal, aggregate 2-2':period===2?'Red card; aggregate 2-2':'';
  const {event,summary}=simulation({sport:'Soccer',state,period,clock,away,home,context});
  summary.boxscore={teams:[{team:{id:'sim-home'},statistics:[{name:'redCards',value:period===2?1:0}]}]};
  const game=compare(event,'Soccer',summary);
  observations++;if(Number.isFinite(game.score))finite++;
 }
 assert.equal(observations,72);assert.ok(finite>=60,'exercise numerical scoring, not only withheld states');
 console.log('OTHER_SPORT_SIMULATION_PARITY '+JSON.stringify({sport:'Soccer',observations,finite,differences:0,historical:false}));
});

test('final release: labeled Tennis simulations retain byte-identical scoring for ordinary and deciding-set point states',()=>{
 let observations=0,finite=0;
 for(const state of ['upcoming','live','completed'])for(const bestOf of [3,5])for(const period of [1,bestOf])
 for(const [away,home] of [[0,0],[0,1],[Math.floor(bestOf/2),Math.floor(bestOf/2)]])
 for(const situation of [{},{breakPoint:true},{setPoint:true},{matchPoint:true},{tiebreak:true},{matchPoint:true,tiebreak:true},{description:'Deuce'}]){
  const {event,summary}=simulation({sport:'Tennis',state,period,clock:'',away,home,bestOf,situation});
  const game=compare(event,'Tennis',summary);
  observations++;if(Number.isFinite(game.score))finite++;
 }
 assert.equal(observations,252);assert.equal(finite,252);
 console.log('OTHER_SPORT_SIMULATION_PARITY '+JSON.stringify({sport:'Tennis',observations,finite,differences:0,historical:false}));
});
