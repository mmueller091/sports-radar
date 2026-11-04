import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import {scenario,evaluate,SPREADS,MARGINS,phases} from './helpers/live-underdog-scenarios.mjs';
const require=createRequire(import.meta.url),core=require('../rating-core.js'),upset=require('../scoring/basketball-upset.cjs');
const run=options=>evaluate(active,scenario(options));

for(const sport of ['NCAAB','NBA']){
 test(`${sport}: production upset credit is continuous at old clock and spread gates`,()=>{
  const clocks=sport==='NCAAB'?[[1,'6:01','6:00','5:59'],[2,'12:01','12:00','11:59']]
   :[[2,'7:13','7:12','7:11'],[3,'2:25','2:24','2:23']];
  for(const [period,...values] of clocks)for(const margin of [-1,0,1]){
   const games=values.map(clock=>run({sport,period,clock,margin}));
   assert.ok(Math.max(...games.map(g=>g.score))-Math.min(...games.map(g=>g.score))<=1);
   assert.ok(Math.max(...games.map(g=>g.liveUpset.rawPoints))-Math.min(...games.map(g=>g.liveUpset.rawPoints))<.04);
  }
  for(const spread of SPREADS)for(const margin of [-1,0,1]){
   const values=[-.001,0,.001].map(d=>run({sport,spread:spread+d,margin}).liveUpset.rawPoints);
   assert.ok(Math.max(...values)-Math.min(...values)<.01,`${spread}: ${values}`);
  }
 });
 test(`${sport}: late threat respects actual margin and bounded surprise, never spread covering`,()=>{
  const points=MARGINS.map(margin=>run({sport,margin}).upsetPoints);
  assert.ok(points.every((v,i)=>i===0||v>=points[i-1]),String(points));
  assert.ok(run({sport,margin:-1}).upsetPoints>=7);
  assert.ok(run({sport,margin:1}).upsetPoints>run({sport,margin:-1}).upsetPoints);
  assert.equal(run({sport,spread:35,margin:-25}).upsetPoints,0);
  assert.equal(run({sport,spread:4,margin:1}).upsetPoints,0);
  for(const phase of phases(sport))for(const spread of SPREADS)for(const margin of MARGINS){
   const game=run({sport,...phase,spread,margin});
   assert.ok(game.upsetPoints>=0&&game.upsetPoints<=upset.calibration[sport].cap);
   if(phase.phase==='early')assert.ok(game.upsetPoints<=1);
   assert.equal(game.factors.filter(f=>f.label==='Underdog threatens upset').length,Number(game.upsetPoints>0));
  }
 });
 test(`${sport}: confirmed possession and available runway distinguish credible final shots from impossible deficits`,()=>{
  const attempt=run({sport,clock:'0:02',margin:-1,possession:'dog'});
  const opponent=run({sport,clock:'0:02',margin:-1,possession:'fav'});
  const unknown=run({sport,clock:'0:02',margin:-1,possession:'unknown'});
  assert.ok(attempt.upsetPoints>unknown.upsetPoints&&unknown.upsetPoints>opponent.upsetPoints);
  for(const possession of ['dog','fav','unknown'])for(const margin of [-7,-14])assert.equal(run({sport,clock:'0:02',margin,possession}).upsetPoints,0);
  const input=scenario({sport,clock:'0:00',margin:-1,possession:'dog'});
  input.competition.status.type.detail='End of game';
  const game={...attempt,sourceEvent:input.event,sourceCompetition:input.competition};
  const terminal=upset.liveSurprise(core,game,input.competition,null);
  assert.equal(terminal.feasibility,0);assert.equal(terminal.points,0);
 });
 test(`${sport}: only a verified pregame market supplies live upset context`,()=>{
  for(const market of ['missing','stale','live','after-start','invalid-time','unverified'])assert.equal(run({sport,market}).upsetPoints,0,market);
  for(const edit of [
   raw=>{raw.close={...raw,isLive:true};},
   raw=>{raw.pointSpread.home.close.line=10;},
   raw=>{raw.details='DOG -25.5';},
   raw=>{raw.awayTeamOdds={favorite:true,underdog:false};},
   raw=>{raw.awayTeamOdds.teamId='different-team';}
  ]){
   const input=scenario({sport});edit(input.competition.odds[0]);
   input.summary.header.competitions=[structuredClone(input.competition)];
   assert.equal(evaluate(active,input).upsetPoints,0);
  }
 });
 test(`${sport}: observed pregame expectation survives omissions without crossing event identity`,()=>{
  const observed=run({sport,state:'upcoming',market:'unverified',period:0,clock:'0:00',home:0,margin:0});
  const live=evaluate(active,scenario({sport,market:'missing'}),observed);
  assert.ok(live.upsetPoints>0);assert.deepEqual(live.pregameBaseline,observed.pregameBaseline);
  for(const market of ['missing','live']){
   const retained=evaluate(active,scenario({sport,market}),live);
   assert.equal(retained.upsetPoints,live.upsetPoints);
  }
  const unrelated=scenario({sport,market:'missing'});unrelated.event.id='different-event';unrelated.summary.header.id=unrelated.event.id;
  assert.equal(evaluate(active,unrelated,live).upsetPoints,0);
 });
 test(`${sport}: current WP gates impossible threats without adding a second WP award`,()=>{
  const missing=run({sport,margin:-1}),possible=run({sport,margin:-1,wp:.5}),dead=run({sport,margin:-1,wp:.001});
  assert.equal(possible.upsetPoints,missing.upsetPoints);
  assert.equal(dead.upsetPoints,0);
  const stale=scenario({sport,margin:-1,wp:.001});stale.summary.plays[0].homeScore-=4;
  assert.equal(evaluate(active,stale).liveUpset.currentProbability,null);
 });
 test(`${sport}: overlap is a bounded discount and repeated polling creates no extra credit`,()=>{
  const input=scenario({sport}),game=evaluate(active,input),same=evaluate(active,input,game);
  assert.equal(same.upsetPoints,game.upsetPoints);assert.equal(same.score,game.score);
  const withHistory={...core,momentumImpact:()=>({factors:[{label:'3 lead changes',points:12},{label:'Erased a deficit',points:10}]})};
  const result=upset.liveSurprise(withHistory,game,input.competition,null,{});
  assert.ok(result.overlap>0);assert.ok(result.points<game.upsetPoints);
  assert.ok(result.points>=Math.floor(.75*result.rawPoints));
 });
}

test('NBA early credit is independently more conservative than NCAAM',()=>{
 const college=run({sport:'NCAAB',period:1,clock:'6:00'}),nba=run({sport:'NBA',period:2,clock:'7:12'});
 assert.ok(college.liveUpset.rawPoints>nba.liveUpset.rawPoints);
 assert.notDeepEqual(upset.calibration.NCAAB,upset.calibration.NBA);
});

test('Wofford 16–15, +25.5 clock regression uses simulations of adjacent first-half clocks',()=>{
 // Only the spread and score are user-observed. These adjacent clock variants
 // deliberately test the formula and are not asserted to be archived events.
 const games=['6:01','6:00','5:59'].map(clock=>run({sport:'NCAAB',period:1,clock,home:15,margin:1,
  names:['Wofford Terriers','Tennessee Volunteers']}));
 assert.deepEqual(games.map(g=>g.score),[50,50,50]);
 assert.deepEqual(games.map(g=>g.upsetPoints),[3,3,3]);
});
