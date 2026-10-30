import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from '../scripts/shadow-candidate-report.mjs';
import {cfbContextVariants} from '../calibration/cfb-context-fixtures.mjs';
import {cfbWatchabilityAdditional,cfbWatchabilityInputs} from '../calibration/cfb-watchability-fixtures.mjs';
import {prepareSynthetic,pairedHistories,hockeyHistories} from '../calibration/trajectory-live-fixtures.mjs';
const require=createRequire(import.meta.url),core=await loadCore(),fixtures=loadFixtures(),cache=new Map();
const shadow=require('../calibration/shadow-candidate.cjs');
const {LIVE_CFB_CONTEXT_POLICY:before,LIVE_CFB_WATCHABILITY_POLICY:after}=require('../calibration/trajectory-live-policy.cjs');
const key=JSON.parse(fs.readFileSync('calibration/trajectory-diagnostic-key.replay-v2.json'));
function archived(event,play) {
  const f=fixtures.find(f=>String(f.eventId)===event);
  if(!cache.has(event))cache.set(event,replayCheckpoints(f).checkpoints);
  const cp=cache.get(event).find(c=>String(c.play.id)===play);
  assert.ok(cp);return prepareCheckpointEvaluation(core,f,cp,0);
}
function reviewed(id){const p=key.cases.find(c=>c.id===id).provenance;return archived(p.eventId,p.playId);}
const pair=p=>shadow.candidateTrajectoryRatings(core,p.game,p.checkpoint.competition,p.checkpoint.summary,[before,after]);
const score=input=>shadow.candidateGameRating(core,prepareSynthetic(input),input.competition,input.summary,null,after);

test('published baseline is explicit; CFB current competition increases without changing leverage or reviewed history',()=>{
  for(const [id,baseline] of [['R07',45],['R18',61],['R08',1]]) {
    const p=reviewed(id),[a,b]=pair(p);assert.equal(a.score,baseline);
    assert.equal(a.genericLeveragePoints,b.genericLeveragePoints);
    assert.equal(a.state.currentCloseness,b.state.currentCloseness);
    assert.deepEqual(a.historyOwnership,b.historyOwnership);
    assert.equal(a.trajectoryScoring.adjustment,b.trajectoryScoring.adjustment);
    assert.equal(b.score,core.clampScore(b.baseScore+b.liveBonus+b.momentumPoints+b.trajectoryScoring.adjustment));
    assert.equal(b.factors.filter(f=>f.label==='Current Tension').length,1);
    assert.equal(b.live.components.probability,0,'WP has no separate bonus');
    if(id==='R08'){assert.equal(b.score,1);assert.equal(b.momentumPoints,0);}
    else {assert.ok(b.score>a.score);assert.ok(b.currentTensionPoints>a.currentTensionPoints);}
    assertPreparedCheckpointUnchanged(p);
  }
});

test('matched hypothetical context is supplementary; unknown is not a poor-team penalty',()=>{
  const cp=reviewed('R18').checkpoint;
  const inputs=cfbContextVariants({sport:'CFB',...cp});
  const results=inputs.map(input=>{
    assert.deepEqual(input.summary.plays,cp.summary.plays);assert.deepEqual(input.summary.winprobability,cp.summary.winprobability);
    assert.deepEqual(input.competition.situation,cp.competition.situation);
    const g=prepareSynthetic(input);
    return shadow.candidateTrajectoryRatings(core,g,input.competition,input.summary,[before,after]);
  });
  assert.equal(results[0][1].score,results[1][1].score);
  const [weak,strong,upset]=[results[1],results[2],results[3]];
  assert.ok(strong[1].score>weak[1].score);
  assert.ok(strong[1].score-strong[0].score < weak[1].score-weak[0].score);
  assert.ok(upset[1].score>weak[1].score);
  assert.ok(upset[1].factors.find(f=>f.label==='Underdog threatens upset').points < upset[0].factors.find(f=>f.label==='Underdog threatens upset').points);
  for(const [a,b] of results) {
    assert.equal(b.currentTensionPoints,results[0][1].currentTensionPoints);
    assert.equal(a.state.retainedStakeWeight,b.state.retainedStakeWeight);
    assert.equal(a.momentumPoints,b.momentumPoints);assert.equal(a.trajectoryScoring.adjustment,b.trajectoryScoring.adjustment);
  }
});

test('preselected archives and early/defensive/decisive/garbage states keep their intended distinctions',()=>{
  for(const [,event,play,baseline] of cfbWatchabilityAdditional)assert.equal(pair(archived(event,play))[0].score,baseline);
  const results=Object.fromEntries(cfbWatchabilityInputs().map(input=>{
    const [a,b]=shadow.candidateTrajectoryRatings(core,prepareSynthetic(input),input.competition,input.summary,[before,after]);
    assert.equal(a.score,input.baselineScore);return [input.id,{a,b}];
  }));
  assert.equal(results['routine-early-tie'].b.score,results['routine-early-tie'].a.score);
  assert.ok(results['defensive-midgame'].b.score>results['routine-early-tie'].b.score);
  assert.ok(results['strong-midgame'].b.score>results['defensive-midgame'].b.score);
  assert.ok(results['championship-midgame'].b.score>results['strong-midgame'].b.score);
  assert.ok(results['late-false-close'].b.score<results['defensive-midgame'].b.score);
  assert.equal(results['late-blowout'].b.score,results['late-blowout'].a.score);
  const {a,b}=results['late-decisive-drive'];
  assert.ok(b.baseScore>a.baseScore);
  assert.ok(b.liveBonus<a.liveBonus,'authoritative floor headroom is recomputed');
  assert.ok(b.score>=a.score);
});

test('controlled WP/history omissions and low WP preserve competition without invented evidence',()=>{
  const cp=reviewed('R18').checkpoint;
  const outcomes=[.5,.99,null].map(wp=>{
    const v=structuredClone({sport:'CFB',...cp});
    if(wp===null)v.summary.winprobability=[];
    else v.summary.winprobability.at(-1).homeWinPercentage=wp;
    return score(v);
  });
  assert.ok(outcomes[0].currentTensionPoints>outcomes[1].currentTensionPoints);
  assert.equal(outcomes[2].currentWinProbability,null);
  const v=structuredClone({sport:'CFB',...cp});v.summary={header:v.summary.header};
  assert.equal(score(v).momentumPoints,0);
  assert.equal(score(v).currentWinProbability,null);
});

test('CFB scale is continuous at quarter boundaries, with no late-only activation',()=>{
  for(const q of [1,2,3]) {
    const results=[];
    for(const [period,clock] of [[q,'0:01'],[q,'0:00'],[q+1,'15:00'],[q+1,'14:59']]) {
      const v=cfbWatchabilityInputs()[0];v.competition.status={period,displayClock:clock,type:{state:'in'}};
      v.summary.winprobability=[];results.push(score(v));
    }
    assert.equal(results[1].score,results[2].score);
    assert.equal(results[1].state.currentTensionCeiling,results[2].state.currentTensionCeiling);
    assert.ok(Math.abs(results[0].score-results[3].score)<=1);
  }
});

test('all non-CFB live results and every archived nonlive result remain unchanged',()=>{
  const inputs=[...Object.values(pairedHistories()).flat(),...Object.values(hockeyHistories())];
  for(const sport of ['MLB','NBA','NCAAB','Soccer','Tennis']) {
    const input=cfbWatchabilityInputs()[0];input.sport=sport;inputs.push(input);
  }
  for(const input of inputs) {
    const [a,b]=shadow.candidateTrajectoryRatings(core,prepareSynthetic(input),input.competition,input.summary,[before,after]);
    assert.deepEqual(b,{...a,trajectoryScoring:{...a.trajectoryScoring,policyId:after.id}});
  }
  let count=0;
  for(const f of fixtures) {
    for(const state of ['upcoming','completed']) {
      const event=structuredClone(f.event);const c=event.competitions[0];c.status={...c.status,type:{state:state==='upcoming'?'pre':'post',completed:state==='completed'}};
      const game=prepareSynthetic({sport:f.modelSport,event,summary:state==='completed'?f.summary:null});
      const [a,b]=shadow.candidateTrajectoryRatings(core,game,c,f.summary,[before,after]);
      assert.deepEqual(a,b);assert.equal(b.score,game.score);count++;
    }
  }
  assert.ok(count>200);
});
