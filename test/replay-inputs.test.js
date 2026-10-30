import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFixtures,loadCore} from '../calibration/helpers.mjs';
import {highFidelityCheckpoints,replayCheckpoints,validateFootballSituation} from '../scripts/replay-inputs.mjs';
import {prepareCheckpointEvaluation} from '../scripts/shadow-candidate-report.mjs';
import {evaluateInput} from '../scripts/trajectory-review-pack.mjs';
const fixtures=loadFixtures(),fixture=id=>fixtures.find(f=>String(f.eventId)===id);
const cache=new Map();
const cps=id=>{if(!cache.has(id))cache.set(id,highFidelityCheckpoints(fixture(id)));return cache.get(id);};
const at=(event,id)=>cps(event).find(c=>String(c.play.id)===id);
const ids=items=>items.map(p=>String(p.id));
const play=(id,clock,extra={})=>({id,period:{number:4},clock:{displayValue:clock},homeScore:20,awayScore:20,...extra});
function synthetic(plays,extra={},sport='NBA') {
  const f=structuredClone(fixtures.find(f=>f.modelSport===sport));
  f.summary={plays,...extra};return f;
}

test('R10 exact sequence conflicts cannot admit 14:30 or 3:16 into earlier checkpoints',()=>{
  for(const [early,later] of [['401856574120399079','401856574120399016'],['401856574120399361','401856574120399256']]) {
    const a=at('401856574',early),b=at('401856574',later);
    assert.ok(a&&b);
    assert.ok(Number(a.play.sequenceNumber)>Number(b.play.sequenceNumber));
    assert.ok(!ids(a.summary.plays).includes(later));
    assert.ok(!ids(a.summary.scoringPlays).includes(later));
    assert.ok(a.summary.winprobability.every(w=>String(w.playId)!==later));
    assert.ok(ids(b.summary.plays).indexOf(early)<ids(b.summary.plays).indexOf(later));
    for(const side of ['home','away'])assert.equal(Number(a.competition.competitors.find(t=>t.homeAway===side).score),a.play[`${side}Score`]);
  }
  const anchor=at('401856574','401856574120399220');assert.ok(anchor);
  const accepted=ids(anchor.summary.plays),source=fixture('401856574').summary.plays.filter(p=>accepted.includes(String(p.id)));
  assert.deepEqual(accepted,ids(source));
  assert.ok(anchor.excludedHistory.length,'retrospective score conflicts remain disclosed, not silently fixed');
});

test('equal-clock source order is preserved, including R05 sequence ties',()=>{
  const cp=at('401856719','401856719774');
  assert.equal(cp.summary.plays.at(-2).id,'401856719765');
  assert.equal(cp.summary.plays.at(-1).id,'401856719774');
  const f=synthetic([play('a','0:50',{sequenceNumber:3,type:{text:'Personal Foul'}}),play('b','0:50',{sequenceNumber:1,type:{text:'Personal Foul'}})]);
  assert.deepEqual(highFidelityCheckpoints(f).map(c=>c.play.id),['a','b']);
});

test('play/time-linked WP and rebuilt drives cannot leak future records; append preserves prefix',()=>{
  const plays=[play('a','1:00'),play('b','0:50',{type:{text:'Timeout'}}),play('c','0:50',{type:{text:'Timeout'}}),play('d','0:40')];
  const wp=[{playId:'d',homeWinPercentage:.9},{playId:'b',homeWinPercentage:.55},
    {period:{number:4},clock:{displayValue:'0:50'},homeWinPercentage:.6},
    {playId:'missing',period:{number:4},clock:{displayValue:'1:00'},homeWinPercentage:.99}];
  const f=synthetic(plays,{winprobability:wp});
  const before=highFidelityCheckpoints(f);
  assert.deepEqual(before.find(c=>c.play.id==='b').summary.winprobability,[wp[1]]);
  assert.deepEqual(before.find(c=>c.play.id==='c').summary.winprobability,[wp[1]]);
  assert.deepEqual(before.at(-1).summary.winprobability,[wp[1],wp[2],wp[0]]);
  const extended=structuredClone(f);extended.summary.plays.push(play('later','0:20',{sequenceNumber:-100}));
  extended.summary.winprobability.push({playId:'later',homeWinPercentage:.99});
  assert.deepEqual(highFidelityCheckpoints(extended).slice(0,before.length),before);
  const f2=synthetic([],{drives:{previous:[{id:'drive',result:'future touchdown',end:{clock:'0:00'},plays}],current:null}},'NFL');
  const cp=highFidelityCheckpoints(f2)[1];
  assert.deepEqual(ids(cp.summary.drives.current.plays),['a','b']);
  assert.equal(cp.summary.drives.current.result,undefined);assert.equal(cp.summary.drives.current.end,undefined);
  assert.equal(cp.nextPlayScoring,undefined);
});

test('unresolved clock and score contradictions are quarantined, explicit corrections remain literal',()=>{
  const f=synthetic([play('a','1:00'),play('b','1:10'),play('c','0:40')]);
  const r=replayCheckpoints(f);assert.deepEqual(r.checkpoints.map(c=>c.play.id),['c']);
  assert.ok(r.exclusions.every(e=>e.reason==='unresolved-clock-source-conflict'));
  const score=synthetic([play('a','1:00'),play('bad','0:50',{homeScore:18}),play('resync','0:40',{homeScore:22,scoringPlay:true}),
    play('correction','0:30',{homeScore:21,scoreCorrection:true})]);
  const result=replayCheckpoints(score);
  assert.ok(result.exclusions.some(e=>e.playId==='bad'&&e.reason==='unresolved-score-rollback'));
  assert.equal(result.checkpoints.at(-1).competition.competitors.find(t=>t.homeAway==='home').score,'21');
  assert.ok(result.repairs.some(r=>r.reason==='explicit-score-correction'));
});

test('sport/provider ordering and partial-drive membership use only accepted causal events',()=>{
  const hockey=synthetic([play('early','0:10',{period:{number:1},sequenceNumber:20}),
    play('later','0:20',{period:{number:1},sequenceNumber:10})],{},'NHL');
  assert.deepEqual(highFidelityCheckpoints(hockey).map(c=>c.play.id),['early','later']);
  const baseball=synthetic([play('pitch1','',{period:{number:1,type:'Top'},sequenceNumber:30,type:{text:'Strike'}}),
    play('pitch2','',{period:{number:1,type:'Top'},sequenceNumber:1,type:{text:'Foul'}})],{},'MLB');
  assert.deepEqual(ids(highFidelityCheckpoints(baseball).at(-1).summary.plays),['pitch1','pitch2']);
  const f=synthetic([],{drives:{previous:[
    {id:'one',result:'future score',end:{clock:'0:40'},plays:[play('a','1:00',{sequenceNumber:1}),play('c','0:40',{sequenceNumber:3})]},
    {id:'two',result:'future score',plays:[play('b','0:50',{sequenceNumber:2}),play('d','0:30',{sequenceNumber:4})]}
  ]},winprobability:[{playId:'c',homeWinPercentage:.9},{playId:'a',period:{number:4},clock:{displayValue:'0:20'},homeWinPercentage:.99}]},'NFL');
  const cp=highFidelityCheckpoints(f).find(c=>c.play.id==='b');
  assert.deepEqual(ids(cp.summary.plays),['a','b']);
  assert.deepEqual(cp.summary.drives.previous,[]);
  assert.deepEqual(ids(cp.summary.drives.incomplete[0].plays),['a']);
  assert.deepEqual(ids(cp.summary.drives.current.plays),['b']);
  assert.equal(cp.summary.drives.incomplete[0].result,undefined);
  assert.deepEqual(cp.summary.winprobability,[]);
});

test('completed drive results retain supported punt history without archived outcomes',()=>{
  const drives=Array.from({length:4},(_,i)=>({id:`drive${i}`,result:'unobserved eventual touchdown',
    plays:[play(`punt${i}`,`4:0${9-i}`,{type:{text:'Punt'}})]}));
  drives.push({id:'current',result:'future touchdown',plays:[play('current','3:00',{type:{text:'Rush'}}),play('future','2:00',{type:{text:'Rushing Touchdown'},homeScore:26,scoringPlay:true})]});
  const cp=highFidelityCheckpoints(synthetic([],{drives:{previous:drives}},'NFL')).find(c=>c.play.id==='current');
  assert.deepEqual(cp.summary.drives.previous.map(d=>d.result),['Punt','Punt','Punt','Punt']);
  assert.equal(cp.summary.drives.current.result,undefined);
  assert.ok(!ids(cp.summary.plays).includes('future'));
});

test('period boundaries are ordered before equal normalized clock positions',()=>{
  const end=play('end','0:00',{period:{number:1},sequenceNumber:1});
  const start=play('start','15:00',{period:{number:2},sequenceNumber:2});
  const f=synthetic([start,end],{winprobability:[{playId:'end',period:{number:2},clock:{displayValue:'15:00'},homeWinPercentage:.99}]},'NFL');
  const cp=highFidelityCheckpoints(f);
  assert.deepEqual(cp.map(c=>c.play.id),['end','start']);
  assert.deepEqual(ids(cp[0].summary.plays),['end']);
  assert.deepEqual(cp[0].summary.winprobability,[]);
});

test('R21/R05 clear unsupported drive/floor/protection without losing score, clock or supported history',async()=>{
  const core=await loadCore();
  for(const [event,id] of [['401872982','4018729824233'],['401856719','401856719774']]) {
    const cp=at(event,id),f=fixture(event);assert.deepEqual(cp.competition.situation,{});
    assert.match(cp.situationValidation.state,/unresolved-timeout/);
    assert.ok(cp.summary.plays.length>100);assert.ok(cp.summary.scoringPlays.length>0);
    assert.equal(cp.competition.status.displayClock,cp.play.clock.displayValue);
    const prepared=prepareCheckpointEvaluation(core,f,cp,0),results=evaluateInput(core,{sport:f.modelSport,competition:cp.competition,summary:cp.summary},prepared.game);
    for(const result of Object.values(results)) {
      assert.equal(result.live.sportImpact.competitiveFloor||0,0);
      assert.ok(!result.live.sportImpact.decisiveDrive);
      if(result.trajectoryScoring.decisiveStrength!=null)assert.equal(result.trajectoryScoring.decisiveStrength,0);
      assert.ok(result.currentTensionPoints>0);
    }
  }
});

test('football validation distinguishes continuity, transitions, nulls and explicit tries',()=>{
  const end={down:2,distance:3,yardsToEndzone:12,team:{id:'home'}};
  const run={type:{text:'Rush'},start:{team:{id:'home'}},end};
  const valid=validateFootballSituation(run,null,['home','away'],'d');assert.equal(valid.state,'scrimmage');
  const timeout={type:{text:'Timeout'},start:end,end};
  assert.deepEqual(validateFootballSituation(timeout,valid,['home','away'],'d').situation,valid.situation);
  assert.equal(validateFootballSituation({type:{text:'Timeout'}},valid,['home','away'],'d').state,'scrimmage');
  for(const type of ['Rushing Touchdown','Kickoff','Pass Interception Return','End Period','Extra Point Good']) {
    const transition=validateFootballSituation({...run,type:{text:type}},valid,['home','away'],'d');
    assert.deepEqual(transition.situation,{});
    assert.deepEqual(validateFootballSituation(timeout,transition,['home','away'],'d').situation,{});
  }
  assert.deepEqual(validateFootballSituation(timeout,valid,['home','away'],'new-drive').situation,{});
  for(const change of [{down:0},{down:-1},{distance:null},{yardsToEndzone:null},{yardsToEndzone:0},{team:{id:'away'}}])
    assert.deepEqual(validateFootballSituation({...run,end:{...end,...change}},valid,['home','away']).situation,{});
  assert.deepEqual(validateFootballSituation({...run,start:undefined},null,['home','away']).situation,{});
  const attempt=validateFootballSituation({type:{text:'Timeout'},end:{down:-1,isTwoPointAttempt:true,team:{id:'home'}}},null,['home','away']);
  assert.equal(attempt.state,'try');assert.deepEqual(attempt.situation,{possession:'home',isTwoPointAttempt:true});
  assert.deepEqual(validateFootballSituation({...run,type:{text:'Rushing Touchdown'},text:'PAT failed; two point attempt'},null,['home','away']).situation,{});
});
