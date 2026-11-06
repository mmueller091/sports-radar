import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as model from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const {MODEL_VERSION}=require('../scoring/live-runtime.cjs');
const {candidateLiveSnapshot}=require('../calibration/shadow-candidate.cjs');
const {endgameFloorBudget}=require('../calibration/trajectory-live-policy.cjs');
const {fixture,cases}=require('./helpers/cfb-calibration.cjs');
function allocation(input,{base=50,history=15,championship=false}={}){
 const f=fixture(input),game={id:'synthetic',sport:'CFB',state:'live',score:base,baseScore:base,openingScore:30,
  championshipStakes:championship,factors:[],teams:f.competition.competitors.map(t=>[t.team.displayName,t.team.abbreviation,t.score,'','','',t.curatedRank?.current,t.homeAway,t.team.id]),
  liveRawStatus:f.competition.status,liveRawSituation:f.competition.situation};
 const before=candidateLiveSnapshot(core,game,f.competition,f.summary),owned={historyOwnership:{combinedFactors:[{label:'Verified competitive history',points:history}]}};
 const budget=endgameFloorBudget(game,{baseScore:base},before,owned);
 const after=budget?candidateLiveSnapshot(core,game,f.competition,f.summary,budget):before;
 return {before,after,budget,total:core.clampScore(base+history+after.bonus)};
}
test('a reduced floor rounded to zero does not reactivate an ordinary fourth-down bonus',()=>{
 const r=allocation({scores:[24,21],clock:'9:53',down:4,distance:1,spot:'BUF 25'});
 assert.equal(r.before.sportImpact.competitiveFloor,1);
 assert.equal(r.after.sportImpact.competitiveFloor,0);
 assert.equal(r.before.bonus,1);
 assert.equal(r.after.bonus,0);
 assert.equal(r.after.components.situation,3,'the evidence remains intact while allocation owns its credit');
});
test('CFB allocation never increases a live bonus or changes signed history at the activation boundary',()=>{
 for(const history of [1,5,10,15])for(const down of [1,2,3,4])for(let seconds=600;seconds>=560;seconds--){
  const clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  const r=allocation({scores:[24,21],clock,down,distance:1,spot:'BUF 25'},{history});
  assert.ok(r.after.bonus<=r.before.bonus,`${clock}, down ${down}, history ${history}`);
  assert.deepEqual(r.after.components,r.before.components);
 }
});
test('ordinary drives, goal-to-go, final fourth downs and championship response plays remain distinct',()=>{
 const ordinary=allocation({scores:[24,17],clock:'2:00',spot:'MIA 29',down:2,distance:6},{base:48,history:14});
 const goal=allocation({scores:[24,17],clock:'0:29',spot:'BUF 9',down:1,goalToGo:true},{base:51,history:14});
 const fourth=allocation(cases.Q,{base:50,history:14});
 const response=allocation(cases.T,{base:50,history:14});
 const championship=allocation(cases.V,{base:50,history:14,championship:true});
 assert.equal(ordinary.total,89);
 assert.equal(goal.total,96);
 assert.ok(fourth.total>=94&&fourth.total>ordinary.total);
 assert.ok(response.total>=95);
 assert.equal(championship.total,99);
});
test('the retained overtime-response fixture remains exceptional through the active production facade',()=>{
 const f=JSON.parse(fs.readFileSync(new URL('./fixtures/cfb-overtime-response-401856846.json',import.meta.url)));
 const g=model.normalizeEvent(f.event,'CFB');model.enrichGame(g,f.summary);
 assert.equal(g.score,96);
 assert.match(g.live.note,/response pending/);
 assert.equal(g.modelVersion,MODEL_VERSION);
});
