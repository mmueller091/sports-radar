import test from 'node:test';
import assert from 'node:assert/strict';
import '../rating-core.js';
import {normalizeEvent,preservePregameRecords,applyContextsToGame} from '../alerts-worker/src/game-model.js';

const core = globalThis.SportsRadarScore;
const points = (rating,label) => rating.factors.filter(factor => factor.label === label)
  .reduce((sum,factor) => sum + factor.points,0);

function event(state='post',record='6-1',sfScore=20,atlScore=29,spread=3) {
  const competition = {
    competitors:[
      {homeAway:'away',team:{id:'25',displayName:'San Francisco 49ers',abbreviation:'SF'},score:String(sfScore),records:[{type:'total',summary:record}]},
      {homeAway:'home',team:{id:'1',displayName:'Atlanta Falcons',abbreviation:'ATL'},score:String(atlScore),records:[{type:'total',summary:'4-3'}]}
    ],
    odds:[{details:`SF -${spread}`,spread,homeTeamOdds:{underdog:true}}],
    status:{type:{state,completed:state === 'post',shortDetail:state === 'post' ? 'Final' : 'In progress'},period:4}
  };
  return {id:'sf-atl',name:'San Francisco 49ers at Atlanta Falcons',season:{type:2},competitions:[competition]};
}

function rated(pregameRecord,options={}) {
  const input = event('post',options.finalRecord || '6-1',options.sfScore ?? 20,options.atlScore ?? 29,options.spread ?? 3);
  const teams = input.competitions[0].competitors.map(team => ({
    id:team.team.id,score:team.score,pregameRecord:team.team.id === '25' ? pregameRecord : '3-3'
  }));
  return core.rateGame('NFL','completed',teams,input,input.competitions[0],'');
}

test('completed NFL results scale the first-loss bonus from a preserved entering record',()=>{
  for (const [record,expected] of [['4-0',4],['5-0',5],['6-0',6],['7-0',6],['8-0',7],['9-0',8],['10-0',9],['11-0',9],['12-0',10]]) {
    assert.equal(points(rated(record),'Ended unbeaten start'),expected,record);
  }
  for (const record of ['6-1','3-0','2-0','1-0','']) {
    assert.equal(points(rated(record),'Ended unbeaten start'),0,record);
  }
  assert.equal(points(rated('6-0',{sfScore:29,atlScore:20,finalRecord:'7-0'}),'Ended unbeaten start'),0);
  assert.equal(points(rated(undefined),'Ended unbeaten start'),0);
});

test('49ers-Falcons snapshot survives ESPN changing 6-0 to 6-1',()=>{
  const live = normalizeEvent(event('in','6-0',20,20),'NFL');
  const final = normalizeEvent(event(),'NFL');
  const before = final.score;
  assert.deepEqual(live.pregameRecords,['6-0','4-3']);
  assert.equal(points(final,'Ended unbeaten start'),0);
  preservePregameRecords(final,live);
  assert.deepEqual(final.pregameRecords,['6-0','4-3']);
  assert.equal(points(final,'Ended unbeaten start'),6);
  assert.equal(final.score,before+6);
  assert.equal(points(final,'Underdog won outright'),0);
  assert.equal(final.factors.filter(factor=>factor.label === 'Ended unbeaten start').length,1);
  preservePregameRecords(final,live);
  assert.equal(final.factors.filter(factor=>factor.label === 'Ended unbeaten start').length,1);
  const next = normalizeEvent(event(),'NFL');
  preservePregameRecords(next,final);
  assert.equal(points(next,'Ended unbeaten start'),6);
  assert.deepEqual(next.pregameRecords,final.pregameRecords);
});

test('context rerating keeps the first-loss result factor separate',()=>{
  const live = normalizeEvent(event('in','6-0',20,20),'NFL');
  const final = normalizeEvent(event(),'NFL');
  preservePregameRecords(final,live);
  const before = points(final,'Ended unbeaten start');
  assert.equal(applyContextsToGame(final,[{type:'playoff_rematch',text:'Verified rematch',confidence:.9,verified:true}]),true);
  assert.equal(points(final,'Ended unbeaten start'),before);
  assert.equal(final.factors.filter(factor=>factor.label === 'Ended unbeaten start').length,1);
  assert.equal(points(final,'Underdog won outright'),0);
});

test('a seven-point underdog can earn both distinct completed result factors',()=>{
  const rating = rated('10-0',{spread:7,finalRecord:'10-1'});
  assert.equal(points(rating,'Ended unbeaten start'),9);
  assert.ok(points(rating,'Underdog won outright') > 0);
  assert.equal(rating.factors.filter(factor=>factor.label === 'Ended unbeaten start').length,1);
  assert.equal(rating.factors.filter(factor=>factor.label === 'Underdog won outright').length,1);
});

test('other sports and completed context carry remain unchanged',()=>{
  const input = event();
  const teams = input.competitions[0].competitors.map(team=>({id:team.team.id,score:team.score,pregameRecord:team.team.id === '25' ? '6-0' : '3-3'}));
  const withBonus = core.rateGame('NFL','completed',teams,input,input.competitions[0],'');
  delete teams[0].pregameRecord;
  const baseline = core.rateGame('NFL','completed',teams,input,input.competitions[0],'');
  assert.deepEqual(withBonus.factors.filter(factor=>factor.label !== 'Ended unbeaten start'),baseline.factors);
  assert.equal(withBonus.score,baseline.score+6);
  teams[0].pregameRecord = '6-0';
  assert.equal(points(core.rateGame('CFB','completed',teams,input,input.competitions[0],''),'Ended unbeaten start'),0);
});
