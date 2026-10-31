import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {prepareSynthetic,pairedHistories,hockeyHistories} from '../calibration/trajectory-live-fixtures.mjs';
import {cfbWatchabilityInputs} from '../calibration/cfb-watchability-fixtures.mjs';
import {historySummary} from '../calibration/trajectory-archetypes.mjs';
import {footballSituation} from '../alerts-worker/src/display-model.js';
import * as active from '../alerts-worker/src/live-game-model.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js'),runtime=require('../scoring/live-runtime.cjs');
const {historyImpact}=require('../scoring/shared/history.js');
const {candidateGameRating:rate}=require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_CONTEXT_POLICY:older,LIVE_CFB_WATCHABILITY_POLICY:before,LIVE_CFB_COMPETITION_POLICY:after}=require('../calibration/trajectory-live-policy.cjs');
const fixture=JSON.parse(fs.readFileSync('test/fixtures/cfb-halftime/401862813.json'));
const evaluate=(input,policy)=>rate(core,prepareSynthetic(input),input.competition,input.summary,null,policy);
const points=(r,label)=>r.factors.find(f=>f.label===label)?.points || r.historyOwnership.eventFactors.find(f=>f.label===label)?.points || 0;

test('real fixture stops at halftime and reproduces both published baselines exactly',()=>{
 const {summary:s}=fixture;
 assert.equal(s.header.competitions[0].status.period,2);assert.equal(s.header.competitions[0].status.displayClock,'0:00');
 assert.equal(s.plays,undefined,'do not invent top-level plays absent from ESPN; changes trajectory evidence');
 assert.equal(s.boxscore,undefined);assert.equal(s.leaders,undefined);
 const plays=[...s.drives.previous.flatMap(d=>d.plays),...s.drives.current.plays];
 assert.ok(plays.every(p=>p.period.number<=2));const ids=new Set(plays.map(p=>p.id));
 assert.ok(s.winprobability.every(w=>ids.has(w.playId)));assert.equal(s.winprobability.at(-1).homeWinPercentage,.5989);
 assert.deepEqual(s.scoringPlays.map(p=>[p.awayScore,p.homeScore]),[[7,0],[7,7],[7,10],[14,10],[14,17],[14,24]]);
 assert.match(s.scoringPlays[3].text,/95 yds/);
 assert.equal(evaluate(fixture,older).score,69);
 const old=evaluate(fixture,before),next=evaluate(fixture,after);
 assert.equal(old.score,76);assert.equal(old.currentTensionPoints,39);assert.equal(old.liveBonus,0);assert.equal(old.trajectoryScoring.adjustment,0);
 assert.ok(next.score>=67&&next.score<=70);assert.equal(next.currentTensionPoints,34);
 for(const label of ['Game-state baseline','Pregame context carried into play','Underdog threatens upset','3 lead changes','Big win-chance swing'])assert.equal(points(next,label),points(old,label),label);
 assert.equal(points(next,'Recent unanswered scoring run'),2);assert.equal(next.momentumPoints,13);assert.equal(next.trajectoryScoring.adjustment,0);
});

test('adjacent CFB margins taper without an 8-to-9 cliff; missing WP is explicit',()=>{
 const rows=[];
 for(const gap of [0,3,6,7,8,9,10,11,14,17,21]) {
  const input=structuredClone(fixture);input.competition.competitors.find(t=>t.homeAway==='home').score=String(14+gap);
  input.event.competitions=[input.competition];input.summary={header:{competitions:[input.competition]},winprobability:[{homeWinPercentage:.5989}]};
  const a=evaluate(input,before),b=evaluate(input,after);rows.push({gap,before:a.currentTensionPoints,after:b.currentTensionPoints,score:b.score});
  assert.equal(a.state.comebackViability,b.state.comebackViability);assert.equal(a.genericLeveragePoints,b.genericLeveragePoints);
  if(gap<=3)assert.equal(a.currentTensionPoints,b.currentTensionPoints);
  input.summary.winprobability=[];assert.equal(evaluate(input,after).currentWinProbability,null);
 }
 for(let i=1;i<rows.length;i++)assert.ok(rows[i].after<=rows[i-1].after);
 for(const gap of [8,9,10,11]){const a=rows.find(x=>x.gap===gap),b=rows.find(x=>x.gap===gap-1);assert.ok(b.after-a.after<=3);}
 console.log('CFB adjacent margins',JSON.stringify(rows));
});

test('run credit rewards recovery, discounts lead extensions, and cannot refill through WP or trajectory',()=>{
 const scenarios={recovery:[[.1,0,21],[.40,7,21],[.49,14,21]],extension:[[.1,10,0],[.3,10,7],[.4,17,7],[.49,24,7]]};
 for(const [name,scores] of Object.entries(scenarios)) {
  const s=historySummary(scores,[[0,.2],[.4,.5],[.49,.8]],.5);
  const r=historyImpact('CFB',s,.5,'live',{threshold:10},{replaceSustained:true,cfbCompetitionHistory:true});
  assert.equal(r.cfbRun.points,name==='recovery'?4:0);
 }
 for(const trajectoryPositive of [0,3,100]) {
  const r=historyImpact('CFB',fixture.summary,.5,'live',{threshold:10},{replaceSustained:true,liveRelevance:1,cfbCompetitionHistory:true,trajectoryPositive});
  assert.equal(r.points,13);assert.equal(r.relevance.cap,13);assert.equal(r.cfbRun.usefulPoints,7);
  assert.equal(r.factors.find(f=>f.label==='Big win-chance swing').points,4);
 }
 const completedOld=historyImpact('CFB',fixture.summary,1,'completed',{threshold:10});
 assert.deepEqual(historyImpact('CFB',fixture.summary,1,'completed',{threshold:10},{cfbCompetitionHistory:true}),completedOld);
});

test('representative defensive, close, decisive and overtime games retain their distinctions',()=>{
 for(const input of cfbWatchabilityInputs()) {
  const a=evaluate(input,before),b=evaluate(input,after);
  if(input.id==='defensive-midgame'||input.id==='routine-early-tie')assert.equal(b.score,a.score,input.id);
  if(input.id==='late-decisive-drive')assert.ok(b.score>=a.score-2,input.id);
  if(input.id==='late-blowout')assert.ok(b.score<=a.score);
  console.log('Representative',input.id,a.score,b.score);
 }
 const input=structuredClone(fixture);input.competition.status={period:5,displayClock:'0:00',type:{state:'in',detail:'OT'}};
 input.event.competitions=[input.competition];input.summary={header:{competitions:[input.competition]}};
 const a=evaluate(input,before),b=evaluate(input,after);assert.equal(a.currentTensionPoints,b.currentTensionPoints);
});

test('non-CFB live and CFB pregame/completed scoring stay identical',()=>{
 const inputs=[...Object.values(pairedHistories()).flat(),...Object.values(hockeyHistories())];
 for(const sport of ['MLB','NBA','NCAAB','Soccer','Tennis']){const input=cfbWatchabilityInputs()[0];input.sport=sport;inputs.push(input);}
 for(const input of inputs){const a=evaluate(input,before),b=evaluate(input,after);assert.deepEqual(b,{...a,trajectoryScoring:{...a.trajectoryScoring,policyId:after.id}},input.sport);}
 for(const state of ['pre','post']){const input=structuredClone(fixture);input.competition.status.type={state,completed:state==='post'};input.event.competitions=[input.competition];input.summary.header.competitions=[input.competition];assert.deepEqual(evaluate(input,before),evaluate(input,after));}
});

test('halftime removes stale possession/down/spot and resumes from current Q3 state',()=>{
 const input=structuredClone(fixture),g=active.normalizeEvent(input.event,'CFB');active.enrichGame(g,input.summary);
 assert.equal(g.score,69);assert.equal(g.modelVersion,runtime.MODEL_VERSION);
 assert.equal(g.footballSituation,null);assert.equal(g.live.note,'');
 const code=fs.readFileSync('app.js','utf8').replace(/\r\n/g,'\n');
 const context=vm.createContext({SportsRadarScore:runtime,safeText:String});
 for(const name of ['footballAccessibleSituation','possessionMarkup','footballSituationMarkup','detailDrives']){const start=code.indexOf(`function ${name}(`);vm.runInContext(code.slice(start,code.indexOf('\n}',start)+2),context);}
 const stale={...g,footballSituation:{possessionTeamId:'2655',downAndDistance:'3rd & 10',fieldPosition:'CLT 24'}};
 assert.equal(context.possessionMarkup(stale,g.teams[0]),'');assert.equal(context.footballSituationMarkup(stale),'');assert.equal(context.footballAccessibleSituation(stale).length,0);
 assert.doesNotMatch(context.detailDrives(input.summary,'CFB',g.liveRawStatus),/Current drive/);
 for(const type of [{state:'in',name:'STATUS_HALFTIME'},{state:'in',detail:'End of 2nd Quarter'},{state:'in',detail:'Halftime'}]) assert.equal(footballSituation({...g,liveRawStatus:{period:2,displayClock:'0:00',type}},input.summary),null);
 const status={period:3,displayClock:'14:59',type:{state:'in',detail:'3rd Quarter'}};
 const resumed={...g,liveRawStatus:status,liveRawSituation:{possession:'2429',down:1,distance:10,downDistanceText:'1st & 10 at CLT 25'}};
 resumed.footballSituation=footballSituation(resumed,input.summary);
 assert.equal(resumed.footballSituation.possessionTeamId,'2429');assert.equal(resumed.footballSituation.fieldPosition,'CLT 25');
 assert.match(context.footballSituationMarkup(resumed),/1st & 10/);
 assert.match(context.detailDrives(input.summary,'CFB',status),/Current drive/);
});
