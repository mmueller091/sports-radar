import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {prepareSynthetic} from '../calibration/trajectory-live-fixtures.mjs';
const require=createRequire(import.meta.url);
const core=require('../rating-core.js');
const {candidateStateRating,candidateGameRating}=require('../calibration/shadow-candidate.cjs');
const {nhlLiveMarginCloseness,hockeySituationImpact,hockeyPressure}=require('../scoring/sports/nhl.js');
const {LIVE_CFB_COMPETITION_POLICY}=require('../calibration/trajectory-live-policy.cjs');
const {PRODUCTION_POLICY}=require('../scoring/live-runtime.cjs');
const {fixture}=require('./helpers/nhl-calibration.cjs');
const baseline={...PRODUCTION_POLICY,nhlMidgameRunway:false};
const candidate={...PRODUCTION_POLICY,nhlMidgameRunway:true};
const manpower=[{}, {trailingGoaliePulled:true}, {trailingPowerPlay:true},
  {trailingGoaliePulled:true,trailingPowerPlay:true}];

test('NHL midgame runway is a production opt-in, not a frozen policy rewrite',()=>{
  assert.equal(PRODUCTION_POLICY.nhlMidgameRunway,true);
  assert.equal(LIVE_CFB_COMPETITION_POLICY.nhlMidgameRunway,undefined);
  for(const situation of manpower)for(const progress of [0,.17,.33,.5,.67,.75,.77,.9,1]) {
    assert.equal(nhlLiveMarginCloseness(2,progress,situation),
      nhlLiveMarginCloseness(2,progress,{...situation,midgameRunway:false}));
  }
  const input={sport:'NHL',...fixture({gap:2,period:2,clock:'5:36'})};
  const game=prepareSynthetic(input);
  const original=candidateGameRating(core,game,input.competition,input.summary,null,LIVE_CFB_COMPETITION_POLICY);
  const explicitOff=candidateGameRating(core,game,input.competition,input.summary,null,
    {...LIVE_CFB_COMPETITION_POLICY,nhlMidgameRunway:false});
  assert.deepEqual(explicitOff,original);
});

test('NHL midgame curve is bounded and continuous in margin, and two-goal runway decays with time',()=>{
  for(const situation of manpower) {
    for(const progress of [0,.17,.33,.5,.5733333333333334,.6625,.67,.7,.75,.77,.83,.97,1]) {
      let previous=1;
      for(let i=0;i<=600;i++) {
        const closeness=nhlLiveMarginCloseness(i/100,progress,{...situation,midgameRunway:true});
        assert.ok(closeness>=0&&closeness<=previous+1e-10,`${progress}/${i/100}`);
        previous=closeness;
      }
      for(const gap of [1,2,3]) {
        const left=nhlLiveMarginCloseness(gap-.0001,progress,{...situation,midgameRunway:true});
        const right=nhlLiveMarginCloseness(gap+.0001,progress,{...situation,midgameRunway:true});
        assert.ok(Math.abs(left-right)<.001,`continuous at ${gap}`);
      }
    }
    let previous=1;
    for(let seconds=0;seconds<=3600;seconds++) {
      const closeness=nhlLiveMarginCloseness(2,seconds/3600,{...situation,midgameRunway:true});
      assert.ok(closeness<=previous+1e-10,`two-goal time monotonicity at ${seconds}`);
      previous=closeness;
    }
  }
});

test('NHL tied, one-goal, three-plus-goal and late-runway inputs remain exactly unchanged',()=>{
  for(const situation of manpower)for(let i=0;i<=100;i++) {
    const progress=i/100;
    for(const gap of [0,1,3,4,5,6])assert.equal(
      nhlLiveMarginCloseness(gap,progress,{...situation,midgameRunway:true}),
      nhlLiveMarginCloseness(gap,progress,situation));
    if(progress>=.77)assert.equal(
      nhlLiveMarginCloseness(2,progress,{...situation,midgameRunway:true}),
      nhlLiveMarginCloseness(2,progress,situation));
  }
});

// Public score/clock and retained calculation telemetry from the November 5
// audit. This is an exact retained-component counterfactual, not a claim that
// the original provider request bodies were retained. No live bonus, event
// history, trajectory strength, evidence weight or clock is invented here.
const boundaries=[
  {gameKey:'NHL:401892654',observedAt:1793928675000,opening:44,seconds:336,scores:[3,2],
    bonus:4,events:3,boundedTrajectory:5.056244818029422,evidenceWeight:.7136900740740741,old:65,next:65},
  {gameKey:'NHL:401892654',observedAt:1793928690000,opening:44,seconds:336,scores:[4,2],
    bonus:1,events:3,boundedTrajectory:5.056244818029422,evidenceWeight:.7136900740740741,old:37,next:48},
  {gameKey:'NHL:401892657',observedAt:1793933265000,opening:48,seconds:39,scores:[3,2],
    bonus:3,events:6,boundedTrajectory:6.453167381122651,evidenceWeight:.9069518240740742,old:69,next:69},
  {gameKey:'NHL:401892657',observedAt:1793933340000,opening:48,seconds:15,scores:[4,2],
    bonus:1,events:6,boundedTrajectory:6.416058482783684,evidenceWeight:.91884375,old:37,next:50}
];
function retainedAllocation(frame,enabled,swapped=false) {
  const scores=swapped?[...frame.scores].reverse():frame.scores;
  const teams=scores.map((score,i)=>[i?'Away':'Home','',score,'','','',null,i?'away':'home',i?'a':'h']);
  const competition={status:{period:2,displayClock:`${Math.floor(frame.seconds/60)}:${String(frame.seconds%60).padStart(2,'0')}`},
    competitors:scores.map((score,i)=>({score,homeAway:i?'away':'home',team:{id:i?'a':'h'}}))};
  const state=candidateStateRating(core,frame.opening,'NHL','live',Math.abs(scores[0]-scores[1]),
    (2400-frame.seconds)/3600,null,{teams,competition,nhlAllocation:true,nhlMidgameRunway:enabled});
  const x=Math.max(0,Math.min(1,(state.currentCloseness-PRODUCTION_POLICY.gateStart)/
    (PRODUCTION_POLICY.gateEnd-PRODUCTION_POLICY.gateStart)));
  const trajectory=Math.min(12-frame.events,frame.boundedTrajectory*frame.evidenceWeight*x*x*(3-2*x));
  return {score:core.clampScore(state.score+frame.bonus+frame.events+trajectory),base:state.score,trajectory};
}
test('captured Boston and Anaheim boundaries reduce compound cliffs in both leading-side orientations',()=>{
  for(const frame of boundaries)for(const swapped of [false,true]) {
    const old=retainedAllocation(frame,false,swapped),next=retainedAllocation(frame,true,swapped);
    assert.equal(old.score,frame.old,`${frame.gameKey}/${frame.observedAt}: retained baseline`);
    assert.equal(next.score,frame.next,`${frame.gameKey}/${frame.observedAt}: candidate`);
    assert.ok(next.score<85,'these midgame leads must not become alert-worthy');
  }
  assert.equal(boundaries[0].next-boundaries[1].next,17);
  assert.equal(boundaries[2].next-boundaries[3].next,19);
});

test('NHL current-competition calibration does not also amplify retained postseason stakes',()=>{
  const openingFactors=[{label:'Sport baseline',points:32},{label:'Stanley Cup Final',points:48}];
  for(const seconds of [1100,600,336,15])for(const gap of [1,2,3]) {
    const context={nhlAllocation:true,competition:{status:{period:2,
      displayClock:`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`}}};
    const old=candidateStateRating(core,80,'NHL','live',gap,(2400-seconds)/3600,null,context,openingFactors);
    const next=candidateStateRating(core,80,'NHL','live',gap,(2400-seconds)/3600,null,
      {...context,nhlMidgameRunway:true},openingFactors);
    assert.equal(next.comebackViability,old.comebackViability);
    assert.equal(next.retainedStakePoints,old.retainedStakePoints);
    assert.equal(next.factors.find(f=>f.label==='Persistent postseason stakes')?.points,
      old.factors.find(f=>f.label==='Persistent postseason stakes')?.points);
  }
});

test('late two-goal, real goalie-pull, one-goal revival, OT and completed ratings keep exact allocations',()=>{
  const cases=[];
  for(const gap of [0,1,2,3])for(const clock of ['13:48','10:00','5:00','2:00','0:43','0:16','0:00'])
    for(const strength of ['', 'pulled', 'trailingPP', 'sixOnFour'])cases.push({gap,clock,manpower:strength});
  cases.push({gap:0,period:4,clock:'5:00'},{gap:0,period:4,clock:'0:01'},
    {gap:0,period:4,clock:'15:00',postseason:true},{gap:0,period:5,clock:'0:00',shootout:true},
    {gap:1,period:3,clock:'0:00',completed:true},{gap:2,period:3,clock:'0:00',completed:true});
  for(const options of cases){
    const input={sport:'NHL',...fixture(options)},game=prepareSynthetic(input);
    const before=JSON.stringify([input,game]);
    const old=candidateGameRating(core,game,input.competition,input.summary,null,baseline);
    const next=candidateGameRating(core,game,input.competition,input.summary,null,candidate);
    assert.equal(next.score,old.score,JSON.stringify(options));
    assert.equal(next.baseScore,old.baseScore,JSON.stringify(options));
    assert.deepEqual(next.live,old.live);
    assert.deepEqual(next.historyOwnership,old.historyOwnership);
    assert.equal(JSON.stringify([input,game]),before,'comparison does not mutate evidence');
  }
});

test('the retained Flyers 99 allocation loses delayed-penalty pull credit, not genuine power-play support',()=>{
  // Retained snapshot NHL:401892653 at 1793931525000: 2-1, P3 6:08,
  // base 54, two recent trailing-team chances, three history points, and
  // 5.95794725925926 trajectory points. The exact provider bodies are not
  // retained; these synthetic shot clocks reproduce only that known support.
  const shot=(sequenceNumber,clock)=>({sequenceNumber,period:{number:3},clock:{displayValue:clock},
    team:{id:'a'},text:'Shot on goal'});
  const penalty={id:'401892653000009640',sequenceNumber:243,period:{number:3},
    clock:{displayValue:'13:13'},team:{id:'h'},type:{text:'Slashing',penaltyMinutes:2}};
  const f=fixture({gap:1,clock:'6:08',manpower:'sixOnFour',
    plays:[shot(242,'13:00'),penalty,shot(244,'13:50')]});
  const teams=f.competition.competitors.map(t=>[t.team.displayName,'',t.score,'','','','','',t.team.id]);
  const progress=3232/3600;
  const pressure=hockeyPressure(f.summary,progress,1,f.competition,{context:0});
  assert.equal(pressure.points,2);
  const impact=hockeySituationImpact({sport:'NHL',teams,baseScore:54,sourceEvent:f.event},
    f.competition,f.summary,f.competition.status,progress,1,{context:0});
  assert.equal(impact.manpower.pulled,false);
  assert.equal(impact.manpower.powerPlay,true);
  assert.equal(impact.manpower.goaliePullSuppressed,'probable-delayed-penalty');
  assert.ok(Math.abs(impact.competitiveTarget-82.82034375576045)<1e-9);
  assert.equal(core.clampScore(54+impact.competitiveFloor+3+5.95794725925926),92);
  assert.doesNotMatch(impact.note,/pulled the goalie/i);
});
