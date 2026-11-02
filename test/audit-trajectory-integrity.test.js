import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import * as legacyAdapter from '../alerts-worker/src/game-model.js';
const require=createRequire(import.meta.url);
const core=require('../scoring/live-runtime.cjs');
const {trajectoryAnalysis}=require('../scoring/shared/trajectory.js');
const {analyzeTrajectory}=require('../scoring/models.js');
const {trajectoryAdjustment}=require('../calibration/trajectory-policy.cjs');
const {LIVE_CFB_COMPETITION_POLICY:policy}=require('../calibration/trajectory-live-policy.cjs');
const {baseballSituationImpact}=require('../scoring/sports/mlb.js');

const play=(id,period,clock,homeScore=0,awayScore=0,extra={})=>({id,period:{number:period},clock:{displayValue:clock},homeScore,awayScore,...extra});
function input(sport,{home=0,away=0,period=4,clock='1:00',situation={},detail='',plays=[],wp=[]}={}) {
  const competition={status:{period,displayClock:clock,type:{state:'in',completed:false,detail}},situation,
    competitors:[{homeAway:'home',score:String(home),team:{id:'h',displayName:'Home',abbreviation:'HME'}},
      {homeAway:'away',score:String(away),team:{id:'a',displayName:'Away',abbreviation:'AWY'}}]};
  return {sport,event:{id:'audit-synthetic',competitions:[competition]},summary:{header:{competitions:[structuredClone(competition)]},plays,winprobability:wp}};
}
const rate=(i,previous=null,api=active)=>{const game=api.normalizeEvent(structuredClone(i.event),i.sport);api.enrichGame(game,structuredClone(i.summary),previous);return game;};

for (const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','Soccer','Tennis']) test(`F3 ${sport}: absent history and a lone current marker cannot support duration`,()=>{
  const period={MLB:9,NHL:3,NCAAB:2,Soccer:2,Tennis:3}[sport]||4;
  const clock=sport==='Soccer'?'90+5':sport==='MLB'||sport==='Tennis'?'':'1:00';
  const i=input(sport,{period,clock,detail:sport==='MLB'?'Bottom 9th':''});
  const current=play('current',period,sport==='NHL'?'19:00':clock);
  if (sport==='MLB') current.period.displayValue='Bottom 9th';
  for (const summary of [null,i.summary,{...i.summary,plays:[current]}]) {
    const telemetry=analyzeTrajectory(sport,summary,.98,'live');
    const result=trajectoryAdjustment(telemetry,1,policy);
    assert.equal(result.hasHistory,false);
    assert.equal(result.evidenceWeight,0);
    assert.equal(result.sustainedQuality,0);
    assert.equal(result.adjustment,0);
  }
});

test('F3 observed scoreless play remains eligible while a truncated late prefix does not claim the whole game',()=>{
  const full=input('NFL',{plays:[play('opening',1,'15:00'),play('middle',2,'0:00'),play('current',4,'1:00')]});
  const telemetry=analyzeTrajectory('NFL',full.summary,null,'live');
  const result=trajectoryAdjustment(telemetry,1,policy);
  assert.equal(result.hasHistory,true);assert.ok(result.adjustment>0);
  assert.equal(telemetry.observedCoverageStart,0);assert.equal(telemetry.competitiveShare,1);
  const late={...full.summary,plays:[play('first-seen',4,'2:00'),play('current',4,'1:00')]};
  const short=trajectoryAdjustment(analyzeTrajectory('NFL',late,null,'live'),1,policy);
  assert.equal(short.evidenceWeight,0);assert.equal(short.adjustment,0);
});

test('F6 absent/null trajectory hook uses margin evidence and explicit zero remains zero',()=>{
  const summary=input('Soccer',{home:1,away:1,period:2,clock:'90+5',plays:[play('start',1,'0'),play('goal1',1,'20',1,0,{scoringPlay:true}),play('goal2',1,'21',1,1,{scoringPlay:true}),play('now',2,'90+5',1,1)]}).summary;
  for (const hook of [undefined,()=>null,()=>undefined,()=>NaN]) {
    const t=trajectoryAnalysis('Soccer',summary,1,'live',{history:{threshold:2},...(hook?{trajectoryCloseness:hook}:{})});
    assert.ok(t.competitiveShare>.95);assert.ok(t.dominantShare<.05);
  }
  for (const boundary of [0,1]) {
    const t=trajectoryAnalysis('Soccer',summary,1,'live',{trajectoryCloseness:()=>boundary});
    assert.equal(t.competitiveShare,boundary);assert.equal(t.dominantShare,1-boundary);
  }
});

test('F3 changed scores on non-scoring markers do not invent the intervening game path',()=>{
  for(const scoringPlay of [false,true]) {
    const i=input('NFL',{home:24,away:24,plays:[play('opening',1,'15:00'),play('unknown-path',4,'1:00',24,24,{scoringPlay})]});
    const t=analyzeTrajectory('NFL',i.summary,null,'live');
    assert.equal(t.observedCoverageSpan,0);
    assert.equal(trajectoryAdjustment(t,1,policy).hasHistory,false);
  }
});

const chance=(id,clock,extra={})=>play(id,clock.startsWith('3')?1:2,clock,1,0,{text:'Away shot hit the post',team:{id:'a'},...extra});
const pressure=(plays,clock='90+5')=>{const i=input('Soccer',{home:1,away:0,period:2,clock,plays});return core.dangerousChanceImpact('Soccer',i.summary,1,1,i.event.competitions[0]);};
test('F7 old or unpositioned soccer chances are never recent pressure',()=>{
  assert.equal(pressure([chance('old','3')]).points,0);
  assert.equal(pressure(Array(7).fill(chance('old','3'))).points,0);
  assert.equal(pressure([{id:'unknown',text:'Away shot hit the post',team:{id:'a'}}]).points,0);
});
test('F7 recent soccer pressure is deduplicated, order independent, and expires by actual stoppage time',()=>{
  const one=chance('now','90+3');
  assert.ok(pressure([one]).points>0);
  assert.deepEqual(pressure([one,one,one]),pressure([one]));
  const distinct=[one,chance('other','90+4')];
  assert.deepEqual(pressure(distinct),pressure([...distinct].reverse()));
  assert.ok(pressure(distinct).points>=pressure([one]).points);
  assert.equal(pressure([one],'90+10').points,0);
});
test('F7 provider clock seconds and explicit occurrence timestamps can position recent chances',()=>{
  const numeric={id:'numeric',period:{number:2},clock:{value:94*60},text:'Away shot hit the post',team:{id:'a'}};
  assert.ok(pressure([numeric]).points>0);
  const i=input('Soccer',{home:1,away:0,period:2,clock:'',plays:[{id:'timestamp',wallclock:'2026-11-01T20:02:00Z',text:'Away shot hit the post',team:{id:'a'}}]});
  i.event.competitions[0].status.wallclock='2026-11-01T20:04:00Z';
  assert.ok(core.dangerousChanceImpact('Soccer',i.summary,1,1,i.event.competitions[0]).points>0);
});

const kneels=JSON.parse(fs.readFileSync(new URL('./fixtures/audit-20261101/cfb-legal-kneels.json',import.meta.url))).inputs;
test('C1 exact legal kneels separate retrospective quality from live urgency and preserve inputs',()=>{
  const pristine=JSON.stringify(kneels);let previous=null;const rows=[];
  for (const i of kneels) {const game=rate(i,previous);rows.push(game);previous=game;}
  for (const game of rows) {
    assert.equal(game.historyOwnership.relevance.comebackViability,0);
    assert.equal(game.factors.some(f=>f.label==='Competitive path retained as clock expires'),false);
    assert.ok(game.gameQualitySoFar?.score>game.score);
    assert.equal(game.gameQualitySoFar.provisional,true);
  }
  assert.ok(rows.at(-1).score<=rows[0].score,'no completed-quality ramp as the clock expires');
  assert.equal(JSON.stringify(kneels),pristine);
});
test('C1 credible last possession stays more urgent; final assessment remains the completed engine result',()=>{
  const threat=structuredClone(kneels[0]);const c=threat.event.competitions[0];
  c.situation={possession:'a',down:1,distance:10,possessionText:'HME 15',homeTimeouts:0,awayTimeouts:2};
  threat.summary.plays=threat.summary.plays.filter(p=>!['kneel1','kneel2','turnover'].includes(p.id));
  threat.summary.header.competitions=[structuredClone(c)];
  assert.ok(rate(threat).score>rate(kneels[0]).score+20);
  const final=structuredClone(kneels.at(-1));
  for (const comp of [final.event.competitions[0],final.summary.header.competitions[0]]) comp.status.type={state:'post',completed:true,detail:'Final'};
  const actual=rate(final),legacy=rate(final,null,legacyAdapter);
  assert.equal(actual.score,legacy.score);assert.deepEqual(actual.factors,legacy.factors);
});

test('C1 NFL equivalent has no completed-quality retention and a meaningful drive remains distinct',()=>{
  const rows=kneels.map(i=>rate({...i,sport:'NFL'}));
  assert.ok(rows.every(g=>!g.factors.some(f=>f.label==='Competitive path retained as clock expires')));
  assert.ok(rows.at(-1).score<=rows[0].score);
  const threat=structuredClone(kneels[0]);threat.sport='NFL';
  threat.event.competitions[0].situation={possession:'a',down:1,distance:10,possessionText:'HME 15',homeTimeouts:0,awayTimeouts:2};
  threat.summary.header.competitions=[structuredClone(threat.event.competitions[0])];
  assert.ok(rate(threat).score>rows[0].score);
});

function baseball(gap,loaded,outs=0,half='Bottom',inning=9) {
  return input('MLB',{home:3,away:3+gap,period:inning,clock:'',detail:`${half} ${inning}th`,situation:{onFirst:loaded,onSecond:loaded,onThird:loaded,outs}});
}
test('C2 down four with loaded bases identifies the tying batter instead of a remote blowout',()=>{
  for (const outs of [0,1,2]) {
    const loaded=rate(baseball(4,true,outs)),empty=rate(baseball(4,false,outs));
    assert.ok(loaded.score>empty.score+15,{outs,loaded:loaded.score,empty:empty.score});
    assert.ok(loaded.live.reasons.some(r=>/tying run is at the plate/i.test(r)));
  }
  assert.ok(rate(baseball(3,true)).live.reasons.some(r=>/winning run is at the plate/i.test(r)));
  assert.ok(rate(baseball(5,true)).score<rate(baseball(4,true)).score);
});
test('C2 three outs, wrong batting side, missing occupancy, and early innings do not get comeback plate leverage',()=>{
  const i=baseball(4,true,3),g=rate(i),c=i.event.competitions[0];
  const situation=baseballSituationImpact(g,c,c.status,c.situation,1,4);
  assert.equal(situation.competitiveFloor,0);assert.equal(situation.points,0);
  assert.ok(rate(baseball(4,true)).score>g.score);
  assert.ok(rate(baseball(4,true)).score>rate(baseball(4,true,0,'Top')).score);
  const missing=baseball(4,true);delete missing.event.competitions[0].situation.onSecond;
  missing.summary.header.competitions=[structuredClone(missing.event.competitions[0])];
  assert.equal(rate(missing).live.reasons.some(r=>/tying run is at the plate/i.test(r)),false);
  assert.equal(rate(baseball(4,true,0,'Bottom',2)).live.reasons.some(r=>/tying run is at the plate/i.test(r)),false);
});
