import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const {SPORT_MODELS}=require('../scoring/models.js');
const {fixture,goal}=require('./helpers/nhl-calibration.cjs');

test('every sport caps raw 91/99/120 at 90, retains 45/75/90 and uses that canonical live opening',()=>{
  for(const [sport,model] of Object.entries(SPORT_MODELS)) for(const raw of [45,75,90,91,99,120]) {
    const original=model.pregame;
    try {
      // Isolate factor production to test the orchestrator boundary for every model.
      model.pregame=(_s,_c,_teams,_post,factors,reason)=>{factors.push({label:'Audit input',points:raw-factors.reduce((s,f)=>s+f.points,0)});return reason;};
      const args=[[],{}, {status:{period:1,displayClock:'15:00'},competitors:[]},''];
      const pre=core.rateGame(sport,'upcoming',...args),live=core.rateGame(sport,'live',...args);
      assert.equal(pre.score,Math.min(90,raw),`${sport} raw ${raw}`);
      assert.equal(pre.rawPregameScore,raw);assert.equal(pre.factors.reduce((s,f)=>s+f.points,0),raw);
      assert.equal(pre.openingScore,pre.score);assert.equal(live.openingScore,pre.score);
      assert.equal(live.rawPregameScore,raw);
      assert.equal(live.score,core.stateRating(Math.min(90,raw),sport,'live',null,core.gameProgress(sport,args[2]),null,{competition:args[2],teams:[]},pre.factors).score);
    } finally {model.pregame=original;}
  }
});

for(const [sport,title,period] of [['MLB','World Series Game 7',10],['NHL','Stanley Cup Final Game 7',4],['NFL','Super Bowl',5],['CFB','National Championship',5],['NCAAB','National Championship',3],['NBA','NBA Finals Game 7',5]]) {
  test(`${title}: pregame 90, actual late play can exceed 90, completed can reach 99`,()=>{
    const f=fixture({postseason:true,final:true,deciding:true,period,clock:'0:10'});
    f.event.name=`${title} rivalry`;
    f.event.sportsRadarContextFactors=[{type:'historic_streak',verified:true,label:'Verified historic stakes'},{type:'milestone_chase',verified:true,label:'Verified record context'}];
    f.competition.competitors.forEach(c=>{c.records=[{type:'total',summary:'20-0'}];c.curatedRank={current:1};});
    f.competition.notes=[{headline:f.event.name}];
    f.competition.status.type={state:'pre',completed:false};
    const pre=normalizeEvent(f.event,sport);
    assert.equal(pre.score,90);assert.equal(pre.openingScore,90);assert.ok(pre.rawPregameScore>90);
    f.competition.status.type={state:'in',completed:false,detail:sport==='MLB'?'Bottom 10th':'Overtime'};
    f.competition.situation={possession:'a',down:4,distance:1,isGoalToGo:true,possessionText:'HME 1',onFirst:true,onSecond:true,onThird:true,outs:2,balls:3,strikes:2};
    f.summary.winprobability=[{homeWinPercentage:.5}];
    const live=normalizeEvent(f.event,sport);enrichGame(live,f.summary);
    assert.equal(live.openingScore,90);assert.ok(live.score>90,`${sport} live ${live.score}`);
    f.competition.status.type={state:'post',completed:true,detail:'Final/3OT'};
    f.competition.status.period=period+2;f.competition.competitors[0].score='3';
    f.summary.scoringPlays=[goal(0,1,1,'10:00'),goal(1,1,2,'10:00'),goal(1,2,3,'5:00'),goal(2,2,3,'0:30'),goal(3,2,period+2,'0:00','Game-winning goal')];
    const final=normalizeEvent(f.event,sport);enrichGame(final,f.summary);
    assert.equal(final.score,99,`${sport} completed`);
  });
}

test('restored 99/120 opening scores cannot leak into live baseline or retained stakes',()=>{
  const f=fixture({gap:1});
  const game=normalizeEvent(f.event,'NHL');game.openingScore=120;
  core.applyLiveSnapshot(game,f.competition,f.summary);assert.equal(game.openingScore,90);
  const factors=[{label:'Championship',points:120}];
  const capped=core.stateRating(90,'MLB','live',0,.9,null,null,factors);
  assert.deepEqual(core.stateRating(120,'MLB','live',0,.9,null,null,factors),capped);
  assert.equal(capped.persistentStakes,90);
});
