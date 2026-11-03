import test from 'node:test';
import assert from 'node:assert/strict';
import * as active from '../alerts-worker/src/live-game-model.js';
import {frame,evaluate} from './helpers/basketball-audit.mjs';
import detail from '../scoring/detail-state.cjs';

test('same-clock NCAAM detail probability omission uses the anchored scoreboard value',()=>{
 const full=frame(),last=full.event.competitions[0].situation.lastPlay;
 const expected=full.summary.winprobability.find(p=>String(p.playId)===String(last.id));
 assert.ok(expected);
 const incomplete=structuredClone(full);
 incomplete.summary.winprobability=incomplete.summary.winprobability.filter(p=>String(p.playId)!==String(last.id));
 incomplete.event.competitions[0].situation.lastPlay.probability={homeWinPercentage:expected.homeWinPercentage};
 const complete=evaluate(active,full),reconciled=evaluate(active,incomplete);
 assert.equal(reconciled.live.winProbability,expected.homeWinPercentage);
 assert.equal(reconciled.score,complete.score);
 assert.deepEqual(reconciled.teams.map(t=>t[2]),complete.teams.map(t=>t[2]));
 assert.equal(reconciled.liveRawStatus.displayClock,complete.liveRawStatus.displayClock);
 const unanchored=structuredClone(incomplete);
 unanchored.event.competitions[0].situation.lastPlay.id='unmatched-new-play';
 assert.equal(evaluate(active,unanchored).live.winProbability,null);
 const stale=structuredClone(incomplete);
 stale.event.competitions[0].status.displayClock='0:40';
 stale.summary.header.competitions[0].status.displayClock='0:40';
 assert.equal(evaluate(active,stale).live.winProbability,null);
});

function periodCase({state='live',period=1,detailText='3:01 - 1st Half',score=31,linescores=[]}={}){
 const game={sport:'NCAAB',state,teams:[['Miami','MIA',String(score),'','','','','','2390'],['Florida','FLA','41','','','','','','57']],
  liveRawStatus:{period,displayClock:'3:01',type:{detail:detailText}}};
 const summary={header:{competitions:[{status:game.liveRawStatus,competitors:[
  {homeAway:'away',team:{id:'2390'},score:String(score),linescores},
  {homeAway:'home',team:{id:'57'},score:'41',linescores:[{displayValue:'41'}]}
 ]}]}};
 return detail.canonicalDetailSummary(game,summary).header.competitions[0].competitors[0];
}

test('missing first-half cell follows the canonical total during play and halftime',()=>{
 for(const detailText of ['3:01 - 1st Half','Halftime']){
  const team=periodCase({detailText,linescores:[{displayValue:''}]});
  assert.equal(team.linescores[0].displayValue,'31');
  assert.equal(team.periodScoreSource,'canonical total and reported periods');
 }
});

test('second-half, overtime and final missing cells derive only from known periods',()=>{
 const first={displayValue:'31'},second={displayValue:'34'};
 assert.deepEqual(periodCase({period:2,score:52,linescores:[first]}).linescores,[first,{value:21,displayValue:'21'}]);
 assert.deepEqual(periodCase({state:'completed',period:2,score:65,linescores:[first]}).linescores,[first,{value:34,displayValue:'34'}]);
 assert.deepEqual(periodCase({state:'completed',period:3,score:68,linescores:[first,second]}).linescores,[first,second,{value:3,displayValue:'3'}]);
 assert.deepEqual(periodCase({state:'completed',period:3,score:68,linescores:[null,second,{displayValue:'3'}]}).linescores,[{value:31,displayValue:'31'},second,{displayValue:'3'}]);
});

test('ambiguous and contradictory NCAAM splits are withheld; valid provider cells survive',()=>{
 assert.deepEqual(periodCase({period:2,score:52,linescores:[]}).linescores,[]);
 assert.deepEqual(periodCase({period:2,score:52,linescores:[{displayValue:'33'},{displayValue:'30'}]}).linescores,[]);
 const valid=[{displayValue:'31'},{displayValue:'21'}];
 assert.deepEqual(periodCase({period:2,score:52,linescores:valid}).linescores,valid);
});
