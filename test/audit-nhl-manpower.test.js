import test from 'node:test';
import assert from 'node:assert/strict';
import evidence from '../scoring/live-evidence.cjs';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';

function run({minutes=2,kind='Minor',clock='0:37',period=2,goal=true,strength='Power Play',extra=[],penalties=true}={}) {
 const game={id:'nhl-manpower-audit',sport:'NHL',state:'live',teams:[['Away','A','2','','','','','','a'],['Home','H','3','','','','','','h']]};
 const competition={status:{period,displayClock:clock,type:{state:'in'}},competitors:[{team:{id:'a'},homeAway:'away',score:2},{team:{id:'h'},homeAway:'home',score:3}]};
 const p={id:'p',period:{number:2},clock:{displayValue:'2:39'},team:{id:'a'},type:{text:'Cross checking',penaltyMinutes:minutes,penaltyType:kind}};
 const g={id:'g',period:{number:2},clock:{displayValue:'0:43'},team:{id:'h'},type:{text:'Goal'},scoringPlay:true,strength:{text:strength}};
 const summary={header:{competitions:[competition]},plays:[...(penalties?[p]:[]),...(goal?[g]:[]),...extra],onIce:[{teamId:'a',entries:['ag','a1','a2','a3','a4'].map(athleteid=>({athleteid}))},{teamId:'h',entries:['hg','h1','h2','h3','h4','h5'].map(athleteid=>({athleteid}))}],boxscore:{players:['a','h'].map(id=>({team:{id},statistics:[{name:'goalies',athletes:[{athlete:{id:id+'g'}}]}]}))}};
 const before=JSON.stringify(summary);const result=evidence.currentManpower(game,competition,summary,1000);
 assert.equal(JSON.stringify(summary),before,'raw provider evidence remains unchanged');
 assert.deepEqual(result.onIce,summary.onIce,'no invented substitute on-ice lineup');
 return game.manpowerQuality;
}
test('NHL refreshed onIce contradiction after minor PP goal is explicit, with provenance',()=>{
 const q=run({clock:'0:41'});assert.equal(q?.state,'conflict');assert.ok(q.reasons.includes('power-play-after-minor-ended'));
 assert.equal(q.penalties[0].endedBy,'g');assert.equal(q.source,'espn-onIce-and-play-ledger');
});
test('NHL known minor expires by game clock even when supplied freshly',()=>assert.equal(run({goal:false})?.state,'conflict'));
test('NHL a goal ends one double-minor segment, not both',()=>{
 const q=run({minutes:4,kind:'Double Minor',clock:'0:41'});assert.equal(q?.state,'consistent');assert.equal(q.penalties[0].remainingSegments,1);
});
test('NHL major survives power-play goal and expires at five minutes',()=>{
 assert.equal(run({minutes:5,kind:'Major',clock:'0:41'})?.state,'consistent');
 assert.equal(run({minutes:5,kind:'Major',clock:'0:01'})?.state,'consistent');
 assert.equal(run({minutes:5,kind:'Major',period:3,clock:'17:38'})?.state,'conflict');
});
test('NHL penalty-shot goal does not end the minor',()=>assert.equal(run({clock:'0:41',strength:'Penalty Shot'})?.state,'consistent'));
test('NHL missing and overlapping penalty evidence stays unresolved without an override',()=>{
 assert.equal(run({penalties:false})?.state,'provider-only');
 const extra=[{id:'p2',period:{number:2},clock:{displayValue:'2:39'},team:{id:'h'},type:{text:'Roughing',penaltyMinutes:2,penaltyType:'Minor'}}];
 assert.equal(run({extra,clock:'0:41'})?.state,'unknown');
});
test('NHL captured Ottawa penalty and later on-ice state disclose an unresolved source conflict',()=>{
 const f=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/audit-20261101/nhl-manpower-expired.json.gz',import.meta.url))));
 const original=JSON.stringify(f.summary);evidence.currentManpower(f.game,f.competition,f.summary);
 assert.equal(f.game.manpowerQuality.state,'conflict');
 assert.equal(f.game.manpowerQuality.penalties[0].id,'401892628000008220');
 assert.equal(f.competition.status.displayClock,'0:37');assert.equal(JSON.stringify(f.summary),original);
});
