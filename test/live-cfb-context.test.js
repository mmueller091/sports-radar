import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadCore,loadFixtures} from '../calibration/helpers.mjs';
import {replayCheckpoints} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation,assertPreparedCheckpointUnchanged} from '../scripts/shadow-candidate-report.mjs';
import {cfbAdditional,cfbContextVariants} from '../calibration/cfb-context-fixtures.mjs';
import {prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
import shadow from '../calibration/shadow-candidate.cjs';
import policies from '../calibration/trajectory-live-policy.cjs';
const core=await loadCore(),fixtures=loadFixtures(),cache=new Map();
const {LIVE_NHL_ALLOCATION_POLICY:baseline,LIVE_CFB_CONTEXT_POLICY:policy}=policies;
const key=JSON.parse(readFileSync(new URL('../calibration/trajectory-diagnostic-key.replay-v2.json',import.meta.url)));
function archived(event,play) {
  const f=fixtures.find(f=>String(f.eventId)===event);
  if(!cache.has(event))cache.set(event,replayCheckpoints(f).checkpoints);
  const cp=cache.get(event).find(c=>String(c.play.id)===play);
  assert.ok(cp);return prepareCheckpointEvaluation(core,f,cp,0);
}
const reviewed=id=>{const p=key.cases.find(c=>c.id===id).provenance;return archived(p.eventId,p.playId);};
const pair=p=>shadow.candidateTrajectoryRatings(core,p.game,p.checkpoint.competition,p.checkpoint.summary,[baseline,policy]);

test('CFB extension inherits NFL/NHL flags; only the existing context factor changes',()=>{
  assert.equal(policy.nhlAllocation,true);assert.equal(policy.endgameAllocation,true);
  for(const [id,score] of [['R07',45],['R18',60],['R08',1]]) {
    const p=reviewed(id),[a,b]=pair(p);assert.equal(a.score,score);
    assert.equal(a.currentTensionPoints,b.currentTensionPoints);assert.equal(a.genericLeveragePoints,b.genericLeveragePoints);
    assert.deepEqual(a.trajectory,b.trajectory);assert.deepEqual(a.historyOwnership,b.historyOwnership);
    assert.deepEqual(a.trajectoryScoring,{...b.trajectoryScoring,policyId:baseline.id});
    assert.equal(a.state.retainedStakeWeight,b.state.retainedStakeWeight);
    assert.equal(b.state.cfbContextRetention.matchupWeight,core.contextCarryWeight(0,'live','CFB')*b.state.cfbContextRetention.viability);
    if(id!=='R18')assert.equal(b.score,a.score);
    assertPreparedCheckpointUnchanged(p);
  }
});

test('counterfactual context leaves action, WP and history constant; unknown is not poor',()=>{
  const p=reviewed('R18'),cp=p.checkpoint,variants=cfbContextVariants({sport:'CFB',event:cp.event,competition:cp.competition,summary:cp.summary});
  const results=variants.map(v=>{
    assert.deepEqual(v.summary.winprobability,cp.summary.winprobability);
    assert.deepEqual(v.summary.plays,cp.summary.plays);assert.deepEqual(v.summary.drives,cp.summary.drives);
    assert.deepEqual(v.competition.situation,cp.competition.situation);
    const g=prepareSynthetic(v),r=shadow.candidateGameRating(core,g,v.competition,v.summary,null,policy);
    assert.equal(r.currentTensionPoints,pair(p)[0].currentTensionPoints);
    assert.deepEqual(r.historyOwnership,pair(p)[0].historyOwnership);
    return r;
  });
  assert.equal(results[0].score,results[1].score);
  assert.ok(results[2].score>results[1].score);assert.ok(results[3].score>results[1].score);
  assert.ok(results[4].score>results[1].score);assertPreparedCheckpointUnchanged(p);
});

test('preselected CFB states and equal-elapsed quarter boundaries',()=>{
  for(const [,event,play,score] of cfbAdditional) {
    const p=archived(event,play),[a,b]=pair(p);assert.equal(a.score,score);
    assert.ok(b.historyOwnership.combinedPoints<=15);assertPreparedCheckpointUnchanged(p);
  }
  const p=reviewed('R18');
  for(const q of [1,2,3]) {
    const scores=[];
    for(const [period,clock] of [[q,'0:01'],[q,'0:00'],[q+1,'15:00'],[q+1,'14:59']]) {
      const v=structuredClone({sport:'CFB',event:p.checkpoint.event,competition:p.checkpoint.competition,summary:p.checkpoint.summary});
      v.competition.status={period,displayClock:clock,type:{state:'in',detail:'In Progress'}};
      v.competition.situation={};v.event.competitions=[v.competition];
      v.summary={header:{competitions:[v.competition]},plays:[],scoringPlays:[],winprobability:[]};
      const g=prepareSynthetic(v),[a,b]=shadow.candidateTrajectoryRatings(core,g,v.competition,v.summary,[baseline,policy]);
      scores.push([a.score,b.score,b.state.cfbContextRetention.matchupWeight]);
    }
    assert.deepEqual(scores[1],scores[2]);
    assert.ok(Math.abs(scores[0][1]-scores[3][1])<=1,JSON.stringify(scores));
  }
});

test('retention respects net opening reductions, caps and exhausted runway',()=>{
  const state={persistentStakes:0,contextWeight:.12,retainedContextWeight:.12};
  const g={openingScore:50,openingFactors:[{label:'Sport baseline',points:32},{label:'Schedule scarcity',points:8},{label:'Quality',points:18},{label:'Multiple stars out',points:-8}]};
  assert.equal(policies.cfbContextRetention(core,g,state).matchup,10);
  assert.equal(policies.cfbContextRetention(core,{...g,openingScore:35},state).matchup,0);
  assert.equal(policies.cfbContextRetention(core,g,{...state,retainedContextWeight:0}).points,0);
  assert.equal(policies.cfbContextRetention(core,{...g,openingFactors:[]},state).matchup,0);
  const p=reviewed('R08'),cp=structuredClone(p.checkpoint);
  cp.competition.status.displayClock='0:00';cp.event.competitions=[cp.competition];cp.summary.header.competitions=[cp.competition];
  const game=prepareSynthetic({sport:'CFB',...cp});
  game.openingScore=50;game.openingFactors=g.openingFactors;
  const r=shadow.candidateGameRating(core,game,cp.competition,cp.summary,null,policy);
  assert.equal(r.factors.find(f=>f.label==='Pregame context carried into play')?.points??0,r.state.cfbContextRetention.points);
});

test('explicit extension leaves every archived completed game unchanged',()=>{
  let count=0;
  for(const f of fixtures) {
    const game=prepareSynthetic({sport:f.modelSport,event:f.event,summary:f.summary});
    if(game.state!=='completed')continue;
    const input=JSON.stringify(game),c=f.event.competitions[0];
    const [a,b]=shadow.candidateTrajectoryRatings(core,game,c,f.summary,[baseline,policy]);
    assert.deepEqual(a,b);assert.equal(b.score,game.score);assert.equal(JSON.stringify(game),input);count++;
  }
  assert.ok(count>100);
});

test('non-CFB synthetic live parity includes Soccer and Tennis without archived replay coverage',()=>{
  for(const sport of ['NFL','NHL','MLB','NBA','NCAAB','Soccer','Tennis'])for(const late of [false,true]) {
    const period=late?({NFL:4,NHL:3,MLB:9,NBA:4,NCAAB:2,Soccer:2,Tennis:3})[sport]:1;
    const c={status:{period,displayClock:late?'0:30':'10:00',type:{state:'in',detail:'In Progress'}},situation:{},
      competitors:['home','away'].map((side,i)=>({homeAway:side,score:'1',team:{id:String(i+1),displayName:side,abbreviation:side.toUpperCase()}}))};
    const event={id:`synthetic-${sport}-${late}`,name:'Hypothetical Away at Home',season:{type:2},competitions:[c]};
    const summary={header:{competitions:[c]},plays:[],scoringPlays:[],winprobability:[]};
    const game=prepareSynthetic({sport,event,summary});
    const [a,b]=shadow.candidateTrajectoryRatings(core,game,c,summary,[baseline,policy]);
    assert.deepEqual(b,{...a,trajectoryScoring:{...a.trajectoryScoring,policyId:policy.id}},sport);
  }
});
