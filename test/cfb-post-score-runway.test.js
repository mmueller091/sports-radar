import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import sourceHelper from './helpers/scoring-source.cjs';

const require=createRequire(import.meta.url);
const core=require('../rating-core.js');
const candidate=require('../calibration/shadow-candidate.cjs');
const {cfbContextRetention,LIVE_CFB_COMPETITION_POLICY:policy}=require('../calibration/trajectory-live-policy.cjs');
const {transitionFootballBase}=require('../scoring/football-transition.cjs');
const {cfbClockRunway,cfbLiveCloseness,cfbModel}=require('../scoring/sports/cfb.js');
const capture=JSON.parse(fs.readFileSync(new URL('./fixtures/cfb-post-score-runway-401862817.json',import.meta.url)));
const controls=JSON.parse(fs.readFileSync(new URL('./fixtures/cfb-post-score-runway-controls-20261105.json',import.meta.url)));
const browser=vm.runInNewContext(`${sourceHelper.scoringSource()}\nSportsRadarScore`);

function competitionFor(game) {
  return {status:structuredClone(game.liveRawStatus),situation:structuredClone(game.liveRawSituation),
    competitors:game.teams.map((t,i)=>({homeAway:i?'home':'away',score:t[2],team:{id:t[8],abbreviation:t[1],displayName:t[0]}}))};
}
const postScore=()=>competitionFor(capture.observations[1].game);
const knownPossession=(competition,side)=>{
  const c=structuredClone(competition),team=c.competitors.find(t=>t.homeAway===side);
  c.situation={...c.situation,possession:team.team.id,down:1,distance:10,yardLine:25,
    possessionText:`${team.team.abbreviation} 25`,downDistanceText:`1st & 10 at ${team.team.abbreviation} 25`};
  return c;
};

// Current-state/component replay of the retained arithmetic, not a fabricated
// full provider summary. Raw historical factor awards and other live components
// remain fixed; only their existing margin/runway relevance is recalculated.
function replayComponents(game) {
  const competition=competitionFor(game),progress=core.gameProgress('CFB',competition);
  const gap=Math.abs(Number(game.teams[0][2])-Number(game.teams[1][2]));
  const context={competition,situation:competition.situation};
  const probability=game.live.winProbability ?? null;
  const state=candidate.candidateStateRating(core,game.openingScore,'CFB','live',gap,progress,
    probability,context,game.openingFactors,{...candidate.DEFAULT_CURRENT_TENSION_POLICY,
      currentTensionCeiling:48,cfbImmediateTension:true,footballEvidence:{game}});
  const carry=cfbContextRetention(core,game,state,policy.cfbCurrentState.contextScale);
  const factors=state.factors.map(f=>f.label==='Pregame context carried into play'?{...f,points:carry.points}:f);
  factors.push({label:'Underdog threatens upset',points:game.liveSurprise.points,liveSurprise:true});
  const base=transitionFootballBase(core,game,{context,progress,probability:{probability}},
    {state,factors,baseScore:core.clampScore(factors.reduce((sum,f)=>sum+f.points,0))});
  assert.equal(game.trajectoryScoring.adjustment,0);
  assert.equal(game.trajectoryScoring.floorBonus,0);
  const ramp=x=>Math.max(0,Math.min(1,(x-.15)/.30));
  const retention=state.widePenalty>0?Math.max(ramp(state.marginCloseness),ramp(state.comebackViability)):1;
  let headroom=15-(game.historyOwnership.cfbRun?.overlapDiscount || 0)*retention;
  const history=game.historyOwnership.allocation.factors.filter(f=>f.label!=='Trajectory sustained history').reduce((sum,f)=>{
    assert.ok(f.rawPoints>=0);
    const retained=Math.min(headroom,f.rawPoints*retention);headroom-=retained;return sum+retained;
  },0);
  if(game.trajectoryScoring.effectivePositiveGate>0) {
    assert.equal(headroom,0,'recorded event history still consumes the full trajectory headroom');
    assert.ok(game.historyOwnership.allocation.factors.filter(f=>f.label==='Trajectory sustained history').every(f=>f.retainedPoints===0));
  }
  return {rating:core.clampScore(base.baseScore+game.live.bonus+history),base:base.baseScore,
    state,history,retention,runway:cfbClockRunway(competition)};
}

test('retained UTSA TD/PAT boundary has no missing-possession dip and subsequent rebound',()=>{
  const original=JSON.stringify(capture),results=capture.observations.map(o=>replayComponents(o.game));
  assert.deepEqual(capture.observations.map(o=>o.game.score),[52,21,30]);
  assert.deepEqual(results.map(r=>r.rating),[52,32,30]);
  assert.deepEqual(results.map(r=>r.base),[40,23,26]);
  assert.deepEqual(results.map(r=>r.state.widePenalty),[2,9,7]);
  assert.equal(results[0].runway.expectedPossessions,3.3085000000000004);
  assert.equal(results[2].runway.expectedPossessions,3.743888888888889);
  assert.equal(results[1].history,4);
  assert.equal(results[1].runway.source,'conditional-post-score');
  assert.equal(results[1].runway.possessionKnown,false);
  assert.deepEqual(results[1].runway.evidence,{playId:'-89633761',scoringTeamId:'2226',period:4,clockSeconds:695});
  assert.ok(results[0].rating-results[1].rating>=15,'the decisive touchdown still produces a substantial decline');
  assert.equal(JSON.stringify(capture),original,'captured input and published history remain immutable');
});

test('same margin and clock preserve known leader/trailer differences and explicit uncertainty bounds',()=>{
  const unknown=postScore(),leader=knownPossession(unknown,'home'),trailer=knownPossession(unknown,'away');
  const a=cfbClockRunway(leader),b=cfbClockRunway(unknown),c=cfbClockRunway(trailer);
  assert.ok(a.expectedPossessions<b.expectedPossessions && b.expectedPossessions<c.expectedPossessions);
  assert.deepEqual(b.opportunityBounds,{leaderNext:a.expectedPossessions,trailerNext:c.expectedPossessions});
  assert.equal(b.expectedPossessions,(a.expectedPossessions+c.expectedPossessions)/2);
  assert.equal(unknown.situation.possession,undefined,'a hypothetical bound never becomes a provider possession');
  assert.equal(unknown.situation.down,-1);
  const progress=core.gameProgress('CFB',unknown),game=structuredClone(capture.observations[1].game);
  const impact=cfbModel.situation({game,competition:unknown,status:unknown.status,situation:unknown.situation,progress,scoreGap:28,summary:null});
  assert.equal(impact.points,0);
  assert.equal(impact.competitiveFloor || 0,0,'conditional runway cannot manufacture an active drive floor');
  const unrelated=structuredClone(unknown);delete unrelated.situation.lastPlay;
  assert.equal(cfbClockRunway(unrelated),null);
  assert.equal(cfbLiveCloseness('CFB',28,progress,unrelated).expectedPossessions,3.2027777777777775,
    'ordinary unknown possession keeps the existing fallback');
});

test('retained secondary post-score controls stay bounded with no manufactured 85 crossing',()=>{
  const before=JSON.stringify(controls),results=controls.observations.map(o=>replayComponents(o.game));
  assert.deepEqual(controls.observations.map(o=>o.game.score),[76,73,35,1]);
  assert.deepEqual(results.map(r=>r.rating),[76,73,37,8]);
  assert.deepEqual(results.map(r=>r.state.widePenalty),[0,0,0,14]);
  assert.ok(results.every(r=>r.rating<85));
  assert.equal(JSON.stringify(controls),before);
});

test('structured TD, PAT, two-point and kickoff transitions retain provenance without invented possession',()=>{
  for (const [type,points] of [['Passing Touchdown',6],['Extra Point Good',1],['Extra Point Missed',0],
    ['Two-Point Pass',2],['Two-Point Rush Failed',0],['Kickoff',0]]) {
    const c=postScore();c.situation.lastPlay={id:`transition-${type}`,type:{text:type},text:type,scoreValue:points,team:{id:'2226'}};
    const before=JSON.stringify(c),runway=cfbClockRunway(c);
    assert.equal(runway?.source,'conditional-post-score',type);
    assert.equal(runway.evidence.playId,`transition-${type}`);
    if(type==='Kickoff') {
      assert.equal(runway.evidence.kickingTeamId,'2226');
      assert.equal(runway.evidence.scoringTeamId,undefined);
    }
    assert.equal(JSON.stringify(c),before);
    const known=knownPossession(c,'away');
    assert.equal(cfbClockRunway(known).source,undefined,'observed control supersedes the conditional branch');
  }
});

test('trailing scorers, onside kicks and actual recovery outcomes do not receive fictional possessions',()=>{
  for (const teamId of ['2636','unknown']) {
    const c=postScore();c.situation.lastPlay.team.id=teamId;
    assert.equal(cfbClockRunway(c),null);
  }
  for (const text of ['Onside kick','On-side kick recovered by FAU','UTSA recovered the kickoff',
    'FAU fumbles the kickoff','Kickoff muffed','Touchdown overturned; no play']) {
    const c=postScore();c.situation.lastPlay.type.text='Kickoff';c.situation.lastPlay.scoreValue=0;c.situation.lastPlay.text=text;
    assert.equal(cfbClockRunway(c),null,text);
    for (const side of ['home','away']) {
      const known=knownPossession(c,side),normal=knownPossession(postScore(),side);
      assert.deepEqual(cfbClockRunway(known),cfbClockRunway(normal),`${text}: confirmed ${side} control remains authoritative`);
    }
  }
});

test('early, expired, overtime, rejected, contradictory and malformed transitions stay outside the change',()=>{
  const mutations=[
    c=>{c.status.period=3;},c=>{c.status.period=5;},
    c=>{c.status.displayClock='0:00';c.status.clock=0;},c=>{c.status.displayClock='';delete c.status.clock;},
    c=>{c.status.type.state='post';c.status.type.completed=true;},c=>{c.status.timingUncertain=true;},
    c=>{c.situation.down=1;},c=>{delete c.situation.down;},c=>{c.situation.possession='invalid';},
    c=>{c.situation.possession=0;},c=>{c.situation.possession=false;},c=>{c.situation.possession={};},
    c=>{c.situation.lastPlay.type={text:'Pass Reception'};},c=>{c.situation.lastPlay.scoreValue=null;},
    c=>{c.situation.lastPlay.scoreValue=7;},c=>{c.situation.lastPlay.id='';},
    c=>{c.situation.lastPlay.scoreValue=0;},
    c=>{c.situation.lastPlay.type.text='Extra Point Missed';},
    c=>{c.situation.lastPlay.type.text='Defensive Two-Point Conversion';c.situation.lastPlay.scoreValue=2;},
    c=>{c.competitors[0].score='0';c.competitors[1].score='3';c.situation.lastPlay.type.text='Passing Touchdown';c.situation.lastPlay.scoreValue=6;},
    c=>{c.competitors[0].score='0';c.competitors[1].score='6';},
    c=>{c.situation.lastPlay.period={number:3};},c=>{c.situation.lastPlay.clock={displayValue:'11:36'};},
    c=>{c.situation.lastPlay.text='(11:36) Extra Point Good';},c=>{c.situation.lastPlay.homeScore=50;},
    c=>{c.situation.awayTimeouts=null;},c=>{c.situation.awayTimeouts=4;},
    c=>{c.competitors[0].score=null;},c=>{c.competitors[0].score=true;},
    c=>{c.competitors[0].score='-1';},c=>{c.competitors[0].score='29.5';},
    c=>{c.competitors[0].score='57';},c=>{c.competitors[1].team.id='2636';}
  ];
  for (const [i,mutate] of mutations.entries()) {
    const c=postScore();mutate(c);assert.equal(cfbClockRunway(c),null,`outside transition scope ${i}`);
  }
});

test('late conditional opportunities expire and cannot create an onside or one-score drive floor',()=>{
  for (const gap of [1,7,14,28]) for (const seconds of [120,30,1]) {
    const c=postScore();c.competitors[1].score=String(29+gap);
    c.status.displayClock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;c.status.clock=seconds;
    const before=JSON.stringify(c),runway=cfbClockRunway(c),progress=core.gameProgress('CFB',c);
    assert.ok(runway.expectedPossessions<=runway.opportunityBounds.trailerNext);
    if(seconds===1)assert.ok(runway.expectedPossessions<.1,'no whole drive materializes at one second');
    const game={...structuredClone(capture.observations[1].game),teams:c.competitors.map((t,i)=>
      [t.team.displayName,t.team.abbreviation,t.score,'','',null,null,t.homeAway,t.team.id])};
    const impact=cfbModel.situation({game,competition:c,status:c.status,situation:c.situation,progress,scoreGap:gap,summary:null});
    assert.equal(impact.competitiveFloor || 0,0);
    assert.equal(impact.points,0);
    assert.equal(JSON.stringify(c),before);
  }
});

test('classic browser and Node state models agree on the new conditional branch',()=>{
  for (const c of [postScore(),knownPossession(postScore(),'home'),knownPossession(postScore(),'away')]) {
    const progress=core.gameProgress('CFB',c);
    assert.deepEqual(JSON.parse(JSON.stringify(browser.footballLiveCloseness('CFB',28,progress,c))),
      JSON.parse(JSON.stringify(core.footballLiveCloseness('CFB',28,progress,c))));
  }
});
