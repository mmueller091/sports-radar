import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const {before,cfb,nhl,cfbCases,hockey,hockeyCases,touchdown,shocks,transitionSequence,oldHandoffScores}=require('./helpers/midgame.cjs');
const nfl=require('./helpers/nfl-calibration.cjs');
const browser=vm.runInNewContext(`${require('./helpers/scoring-source.cjs').scoringSource()}\nSportsRadarScore`);
test('CFB midgame targets, total-independent margins, Q1 and early Q2 preservation',()=>{
  const targets=[[2,'2:00',0,58,62],[2,'2:00',3,55,59],[2,'2:00',7,50,54],
    [2,'2:00',10,40,46],[3,'12:00',0,60,63],[3,'7:30',0,64,68],
    [3,'2:00',0,69,73],[3,'2:00',3,66,70],[3,'2:00',7,58,63],
    [3,'2:00',10,48,53],[3,'2:00',14,41,48],[3,'2:00',21,0,30]];
  for(const [period,clock,gap,lo,hi] of targets) {
    const input={period,clock,scores:[21+gap,21]},value=cfb.evaluate(core,input).score;
    assert.ok(value>=lo&&value<=hi,`${period}/${clock}/${gap}: ${value}`);
    assert.equal(value,cfb.evaluate(core,{...input,scores:[7+gap,7]}).score);
  }
  for(const period of [1,2]) for(const clock of ['10:00','7:00']) {
    const input={period,clock};assert.deepEqual(cfb.evaluate(core,input),cfb.evaluate(before,input));
  }
});
test('halftime and quarter handoffs are continuous for close and wide games',()=>{
  for(const gap of [0,3,7,10,14,21]) for(const period of [2,3]) {
    const a=cfb.evaluate(core,{period,clock:'0:01',scores:[21+gap,21]}).score;
    const b=cfb.evaluate(core,{period:period+1,clock:'15:00',scores:[21+gap,21]}).score;
    assert.ok(Math.abs(a-b)<=1,`${period}/${gap}: ${a}/${b}`);
  }
  // The pre-existing P3 situation floor activates at the period boundary.
  // Opening retention must add no new boundary change to that calibration.
  for(const opening of [40,55,65,80,90]) for(const gap of [0,1,2,3])
    for(const [period,clock] of [[2,'0:01'],[3,'20:00']])
      assert.equal(hockey(core,{opening,gap,period,clock}),hockey(before,{opening,gap,period,clock}));
});
test('CFB Q3-to-Q4 carryover is monotone for close games and absent when Q4 takes over',()=>{
  const byGap=gap=>transitionSequence.map(([period,clock])=>
    cfb.evaluate(core,{period,clock,scores:[21+gap,21]}).score);
  const tied=byGap(0),three=byGap(3),seven=byGap(7),fourteen=byGap(14);
  for(const [gap,values] of [[0,tied],[3,three],[7,seven]]) {
    for(let i=1;i<values.length-1;i++)
      assert.ok(values[i]>=values[i-1]-1,`${gap}: ${values.join(',')}`);
  }
  for(let i=0;i<transitionSequence.length;i++)
    assert.ok(tied[i]>three[i]&&three[i]>seven[i],`${i}: ${tied[i]}/${three[i]}/${seven[i]}`);
  assert.ok(Math.max(...fourteen.slice(2,8))-Math.min(...fourteen.slice(2,8))<=2,fourteen.join(','));
  assert.deepEqual([tied.at(-1),three.at(-1),seven.at(-1),fourteen.at(-1)],
    [79,77,76,45],'legacy Q4 model has overtaken the floor by 5:00');
  assert.deepEqual(oldHandoffScores[0].slice(0,2),tied.slice(0,2),'accepted Q3 targets stay fixed');
});
test('CFB TD shock is directional, conservative, and transient; NFL remains exact',()=>{
  const expected={closing:5,tying:5,lead:3,widening:0,wide:0,garbage:0};
  for(const [name,[pre,post]] of Object.entries(shocks)) {
    const summary=touchdown(pre,post),status={period:3,displayClock:'2:23'};
    assert.equal(core.eventShockImpact('CFB',summary,status).points,expected[name],name);
    assert.deepEqual(core.eventShockImpact('NFL',summary,status),structuredClone(before.eventShockImpact('NFL',summary,status)));
    assert.equal(core.eventShockImpact('CFB',summary,{period:4,displayClock:'14:00'}).points,0);
  }
  const summary=touchdown([28,21],[35,21]);summary.plays.shift();
  assert.equal(core.eventShockImpact('CFB',summary,{period:3,displayClock:'2:23'}).points,0);
  const f=cfb.fixture({period:3,clock:'2:23',scores:[35,21],spot:'MIA 49',down:3,distance:2});
  Object.assign(f.summary,touchdown([28,21],[35,21]));
  const value=cfb.evaluateFixture(core,f).score;assert.ok(value>=43&&value<=48,String(value));
});
test('NHL retention consumes live score, caps opening, and fades with margin and evidence',()=>{
  for(const input of Object.values(hockeyCases)) {
    const old=hockey(before,input),now=hockey(core,input);
    assert.ok(now>=old);
    if(input.gap>=2 || input.opening===40) assert.equal(now,old);
    assert.equal(now,hockey(core,{...input,raw:150}));
  }
  for(const gap of [0,1]) {
    const value=hockey(core,{opening:65,period:1,clock:'13:00',gap});
    assert.ok(value>=Math.round(65*(gap?.90:.95)));
  }
  assert.equal(hockey(core,{opening:120,period:1,clock:'13:00'}),hockey(core,{opening:90,period:1,clock:'13:00'}));
  assert.equal(hockey(core,{opening:61,period:1,clock:'13:15',gap:1}),60);
  assert.equal(hockey(core,{opening:54,period:1,clock:'11:38',gap:1}),53);
});
test('Q3 runway contracts as opportunities diminish and possession is a modest influence',()=>{
  const {cfbLiveCloseness}=require('../scoring/sports/cfb.js');
  const states=['12:00','7:30','2:00'].map(clock=>{
    const f=cfb.fixture({period:3,clock,scores:[35,21],spot:'MIA 49'});
    return cfbLiveCloseness('CFB',14,core.gameProgress('CFB',f.competition),f.competition);
  });
  assert.ok(states[0].expectedPossessions>states[1].expectedPossessions&&states[1].expectedPossessions>states[2].expectedPossessions);
  assert.ok(states[0].comebackFeasibility>states[2].comebackFeasibility+.1);
  for(const possession of ['a','h']) for(const probability of [.5,.65,.8,.95]) {
    const result=cfb.evaluate(core,{period:3,clock:'2:23',scores:[35,21],spot:'MIA 49',possession,probability});
    assert.ok(result.score>=40&&result.score<=48,String(result.score));
  }
});
test('exact CFB A-Y, NFL A-P and NHL P3/OT regression matrices',()=>{
  for(const helper of [cfb,nfl]) for(const input of Object.values(helper.cases))
    assert.deepEqual(helper.evaluate(core,input),helper.evaluate(before,input));
  const recalibrated=new Set(['Start regular-season OT','Regular-season OT','Shootout','Playoff OT','Playoff 2OT','Playoff 3OT']);
  for(const [name,input] of Object.entries(nhl.cases).filter(([name,input])=>(input.period??3)>=3&&!recalibrated.has(name)))
    assert.deepEqual(nhl.evaluate(core,input),structuredClone(nhl.evaluate(before,input)));
});
test('new CFB/NHL states have browser/Node parity and CFB Worker parity',()=>{
  for(const input of Object.values(cfbCases)) {
    assert.deepEqual(cfb.evaluate(core,input),cfb.evaluate(browser,input));
    const f=cfb.fixture(input);f.event.competitions=[f.competition];
    const game=normalizeEvent(f.event,'CFB');enrichGame(game,f.summary);
    assert.equal(game.score,cfb.evaluate(core,input).score);
  }
  for(const input of Object.values(hockeyCases)) assert.equal(hockey(core,input),hockey(browser,input));
});
