import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const basketball=require('../scoring/basketball-state.cjs');
const provider=require('../scoring/provider-evidence.cjs');
const core=require('../rating-core.js');
const candidate=require('../calibration/shadow-candidate.cjs');
const opening=require('../scoring/opening-transition.cjs');
const wake=JSON.parse(fs.readFileSync(new URL('./fixtures/basketball-observation-wake-20261105.json',import.meta.url)));
const copy=x=>structuredClone(x);
const competitionFor=g=>({status:copy(g.liveRawStatus),situation:copy(g.liveRawSituation),
 competitors:g.teams.map((t,i)=>({homeAway:i?'home':'away',score:t[2],team:{id:t[8],displayName:t[0]}}))});

function wakeInput(){
 const game=copy(wake.game),competition=competitionFor(game);
 // The normalized capture proves this scoreboard state and embedded WP.
 // PBP fields below reconstruct the required independent event anchor; they
 // are not represented as the unretained historical provider response.
 const play={...copy(competition.situation.lastPlay),period:{number:1},clock:{displayValue:'4:42'},homeScore:28,awayScore:25};
 const summary={header:{id:game.id,competitions:[copy(competition)]},plays:[play],winprobability:[]};
 return {game,competition,summary};
}
function replayComponents(wp){
 const game=copy(wake.game),competition=competitionFor(game),progress=(1200-282)/2400;
 const context={competition,teams:game.teams,situation:competition.situation,summary:null};
 const state=candidate.candidateStateRating(core,game.openingScore,game.sport,'live',3,progress,wp,context,
  game.openingFactors,{...candidate.DEFAULT_CURRENT_TENSION_POLICY,openingEvidence:{game}});
 const factors=[...state.factors,...game.factors.filter(f=>f.label==='Underdog threatens upset')];
 const base={state,factors,baseScore:core.clampScore(factors.reduce((sum,f)=>sum+f.points,0))};
 const result=opening.transitionBase(core,game,{context,progress,probability:{probability:wp}},base);
 return {base:result.baseScore,tension:result.factors.find(f=>f.label==='Current Tension').points,
  rating:core.clampScore(result.baseScore+game.live.bonus+game.momentumPoints+game.trajectoryScoring.adjustment)};
}
const currentProbability=result=>result.summary?.winprobability?.at(-1)?.homeWinPercentage??null;

test('retained Wake component replay isolates the observed 49-to-42 WP availability change',()=>{
 assert.deepEqual(replayComponents(null),{base:50,tension:24.9481,rating:49});
 assert.deepEqual(replayComponents(.899),{base:43,tension:18.0659,rating:42});
 assert.deepEqual(wake.capture.observations.map(p=>p.rating),[49,42]);
});

test('reconstructed Wake anchor keeps the same canonical WP across optional resource omissions',()=>{
 const {game,competition,summary}=wakeInput();
 const initial=basketball.reconcileBasketball(game,competition,summary);
 assert.equal(currentProbability(initial),.899);
 for(const detail of [null,{header:copy(summary.header)}, {...copy(summary),plays:[],winprobability:[]},copy(summary)]){
  const result=basketball.reconcileBasketball(game,copy(competition),detail);
  assert.equal(currentProbability(result),.899);
  assert.equal(replayComponents(currentProbability(result)).rating,42);
 }
});

test('same-clock detail rows with nonmonotonic IDs cannot hide or replace the canonical probability',()=>{
 const {game,competition,summary}=wakeInput(),canonical=summary.plays[0];
 canonical.wallclock='2026-11-05T23:41:00Z';
 const later={...copy(canonical),id:'401909726120720421',wallclock:'2026-11-05T23:41:01Z'};
 summary.plays.push(later);
 summary.winprobability=[{playId:later.id,homeWinPercentage:.4}];
 const result=basketball.reconcileBasketball(game,competition,summary);
 assert.equal(currentProbability(result),.899);
 assert.equal(result.summary.winprobability.at(-1).playId,canonical.id);
 assert.equal(result.history.winprobability.at(-1).playId,later.id,'historical order is not rewritten');
 assert.equal(replayComponents(currentProbability(result)).rating,42);
});

test('fresh synchronized scoreboard WP can update an unchanged anchor when the optional WP array omits it',()=>{
 const {game,competition,summary}=wakeInput();
 basketball.reconcileBasketball(game,competition,summary);
 competition.situation.lastPlay.probability.homeWinPercentage=.88;
 summary.header.competitions=[copy(competition)];
 assert.equal(currentProbability(basketball.reconcileBasketball(game,competition,summary)),.88);
 summary.winprobability=[{playId:competition.situation.lastPlay.id,homeWinPercentage:.87}];
 assert.equal(currentProbability(basketball.reconcileBasketball(game,competition,summary)),.87,'explicit current detail estimate wins over the scoreboard fallback');
});

test('new foul or possession cannot borrow the previous observation probability',()=>{
 for(const change of [
  c=>{c.situation.lastPlay={id:'401909726120720434',type:{text:'Foul'},text:'New foul'};},
  c=>{c.situation.possession='154';delete c.situation.lastPlay.probability;}
 ]){
  for(const currentHeader of [false,true]){
   const {game,competition,summary}=wakeInput();basketball.reconcileBasketball(game,competition,summary);
   change(competition);summary.header.competitions=[copy(competition)];
   assert.equal(currentProbability(basketball.reconcileBasketball(game,competition,currentHeader?summary:null)),null);
  }
 }
});

test('unanchored, stale, ahead, final and wrong-event headers cannot authorize a scoreboard WP fallback',()=>{
 for(const edit of [
  x=>{x.summary.plays=[];},
  x=>{x.summary.plays[0].clock.displayValue='5:01';},
  x=>{x.summary.header.competitions[0].status.displayClock='5:01';},
  x=>{x.summary.header.competitions[0].status.type={state:'post',completed:true};},
  x=>{x.summary.header.id='other-event';},
  x=>{x.summary.header.competitions[0].competitors.forEach(t=>{t.homeAway=t.homeAway==='home'?'away':'home';});},
  x=>{x.summary.sportsRadarEvidence={summaryAhead:true,aggregateEvidenceDeferred:true};},
  x=>{x.summary.header.competitions[0].status.displayClock='4:40';x.summary=provider.normalizeSummary(x.game,x.competition,x.summary);}
 ]){
  const input=wakeInput();edit(input);
  assert.equal(currentProbability(basketball.reconcileBasketball(input.game,input.competition,input.summary)),null);
 }
});

test('score and event-anchor corrections invalidate retained WP until independently reissued',()=>{
 for(const edit of [
  x=>{x.competition.competitors[1].score='27';x.summary.plays[0].homeScore=27;},
  x=>{x.summary.plays[0].clock.displayValue='4:43';},
  x=>{x.summary.plays[0].type={id:'6',text:'Foul'};}
 ]){
  const input=wakeInput();basketball.reconcileBasketball(input.game,input.competition,input.summary);
  input.summary=copy(input.summary);
  edit(input);input.summary.header.competitions=[copy(input.competition)];
  assert.equal(currentProbability(basketball.reconcileBasketball(input.game,input.competition,input.summary)),null);
  input.summary.winprobability=[{playId:input.summary.plays[0].id,homeWinPercentage:.85}];
  assert.equal(currentProbability(basketball.reconcileBasketball(input.game,input.competition,input.summary)),.85);
 }
});

function nbaInput(clock='8:42',id='401909937376',away=36,home=33){
 const competition={status:{period:2,displayClock:clock,type:{state:'in',completed:false}},
  situation:{lastPlay:{id,text:'Turnover'}},competitors:[
   {team:{id:'14'},homeAway:'away',score:String(away)},
   {team:{id:'9'},homeAway:'home',score:String(home)}]};
 const game={id:'401909937',sport:'NBA',state:'live',teams:[['Miami','MIA',String(away),'','','','','','14'],['Golden State','GS',String(home),'','','','','','9']]};
 return {game,competition,summary:{header:{id:game.id,competitions:[copy(competition)]},plays:[]}};
}
function advance(edit=x=>x){
 const before=nbaInput();basketball.reconcileBasketball(before.game,before.competition,before.summary);
 const next=nbaInput('8:29','401909937239');edit(next);
 const result=basketball.reconcileBasketball(before.game,next.competition,next.summary);
 return {game:before.game,result};
}

test('reconstructed lower-ID NBA event accepts forward time only with independent synchronized live evidence',()=>{
 // IDs and clocks match the retained timeline-conflict example. The omitted
 // non-scoring 239 row and two synchronized resources are reconstructed.
 const {game,result}=advance();
 assert.notEqual(game.basketballUpdateRejected,true);
 assert.equal(result.competition.status.displayClock,'8:29');
 assert.equal(result.competition.situation.lastPlay.id,'401909937239');
 assert.equal(result.rawCurrent,true);
});

test('lower-ID bypass rejects missing, stale, mismatched, final and synthesized corroboration',()=>{
 for(const edit of [
  x=>{x.summary=null;},
  x=>{x.summary.header.competitions[0].status.displayClock='8:42';},
  x=>{x.summary.header.competitions[0].competitors[0].score='35';},
  x=>{x.summary.header.competitions[0].competitors[0].team.id='other-team';},
  x=>{x.summary.header.competitions[0].competitors.forEach(t=>{t.homeAway=t.homeAway==='home'?'away':'home';});},
  x=>{x.summary.header.id='other-game';},
  x=>{x.summary.header.competitions[0].status.type={state:'post',completed:true};},
  x=>{x.summary.sportsRadarEvidence={summaryAhead:true};},
  x=>{x.summary.sportsRadarEvidence={aggregateEvidenceDeferred:true};}
 ]){
  const {game,result}=advance(edit);
  assert.equal(game.basketballUpdateRejected,true);
  assert.equal(result.competition.status.displayClock,'8:42');
  assert.equal(result.competition.situation.lastPlay.id,'401909937376');
 }
});

test('lower-ID events cannot use corroboration to roll back time, lower a score or replace a same-clock event',()=>{
 for(const edit of [
  x=>{x.competition.status.displayClock='8:55';},
  x=>{x.competition.competitors[0].score='35';},
  x=>{x.competition.status.displayClock='8:42';}
 ]){
  const {game,result}=advance(x=>{edit(x);x.summary.header.competitions=[copy(x.competition)];});
  assert.equal(game.basketballUpdateRejected,true);
  assert.equal(result.competition.status.displayClock,'8:42');
  assert.deepEqual(result.competition.competitors.map(t=>t.score),['36','33']);
 }
});
