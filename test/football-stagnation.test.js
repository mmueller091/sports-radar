import test from 'node:test';
import assert from 'node:assert/strict';
import '../rating-core.js';

const {footballStagnationImpact,momentumImpact} = globalThis.SportsRadarScore;

function summary({scores=[9,12],total=42,redZone=['0-3','0-3'],thirdDown=['2-14','2-14'],plays=[]}={}) {
  const competition = {
    competitors:scores.map(score => ({score:String(score)})),
    ...(total === null ? {} : {odds:[{overUnder:total}]})
  };

  return {
    header:{competitions:[competition]},
    boxscore:{teams:redZone.map((value,index) => ({
      statistics:[
        {name:'redZoneAttempts',displayValue:value},
        {name:'thirdDownEff',displayValue:thirdDown[index]}
      ]
    }))},
    plays
  };
}

test('low output against a real total, six failed red-zone trips, and poor third downs combine',()=>{
  const game=summary();
  const result=footballStagnationImpact('NFL',game,1,'completed');
  assert.equal(result.points,14);
  assert.match(result.text,/very little scoring/);
  assert.match(result.text,/poor red-zone touchdown conversion/);
  assert.match(result.text,/poor third-down offense/);
  assert.equal(momentumImpact('NFL',game,1,'completed').factors.find(item=>item.label==='Offensive stagnation')?.points,-14);
  assert.ok(footballStagnationImpact('NFL',summary(),.8,'live').points<=18);
  game.pickcenter=[{details:'Home -3'}];
  assert.equal(footballStagnationImpact('NFL',game,1,'completed').points,14);
});

test('low scoring without three independent signs does not penalize efficient offense',()=>{
  const efficient=summary({thirdDown:['8-14','8-14']});
  assert.equal(footballStagnationImpact('NFL',efficient,1,'completed').points,0);
  const scoringOnly=summary({redZone:['3-3','3-3'],thirdDown:['8-14','8-14']});
  assert.equal(footballStagnationImpact('NFL',scoringOnly,1,'completed').points,0);
});

test('defensive action mitigates the same offensive futility',()=>{
  const ordinary=footballStagnationImpact('NFL',summary(),1,'completed');
  const active=footballStagnationImpact('NFL',summary({
    plays:Array.from({length:12},()=>({text:'Pass intercepted'}))
  }),1,'completed');
  assert.ok(active.points<ordinary.points);
});

test('missing or invalid total uses the existing fixed fallback',()=>{
  for (const total of [null,0,'']) {
    assert.equal(footballStagnationImpact('NFL',summary({total}),1,'completed').points,0);
    assert.ok(footballStagnationImpact('NFL',summary({total,scores:[3,3]}),1,'completed').points>0);
  }
  assert.ok(footballStagnationImpact('NFL',summary({total:null,scores:[3,3],redZone:['0-0','0-0']}),1,'completed').points>0);
});
