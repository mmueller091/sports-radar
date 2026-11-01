import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {competitivenessData,competitivenessReport,beforeEngine,runtime} from '../scripts/nfl-competitiveness-report.mjs';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {cachedNflPregame} from '../alerts-worker/src/nfl-pregame.js';
const require=createRequire(import.meta.url);
const {footballSpreadAdjustment,FOOTBALL_SPREAD_ANCHORS}=require('../scoring/shared/market.js');
const {nflRecordAssessment}=require('../scoring/shared/nfl-pregame.js');
const {recordStats}=require('../scoring/shared/records.js');
const plain=x=>JSON.parse(JSON.stringify(x));
function fixture(records=['6-1','2-5'],spread=2.5,total=48.5,division=false,date='2026-11-01T18:00Z'){
  const competition={season:{year:2026,type:2},status:{type:{state:'pre'}},competitors:records.map((record,i)=>({homeAway:i?'home':'away',team:{id:String(i+1),abbreviation:division?['BAL','PIT'][i]:['BAL','SF'][i],displayName:i?'Home':'Away'},score:'0',records:record?[{type:'total',summary:record}]:[]})),odds:spread==null?[]:[{spread,overUnder:total}]};
  const event={id:'synthetic',date,season:competition.season,competitions:[competition]};return{event,competition};
}
const rate=({event,competition})=>runtime.rateGame('NFL','upcoming',[],event,competition,'');
const record=p=>({wins:p*10000,losses:(1-p)*10000,games:10000,pct:p,ties:0});

test('identical teams and total decline smoothly through 2.5, 6, 8, 10 and 14 points for every record tier',()=>{
  for(const records of [['5-2','4-3'],['6-1','2-5'],['4-4','4-4'],['2-5','1-6'],['6-1','6-1']]){
    const rows=[2.5,6,8,10,14].map(s=>rate(fixture(records,s)));
    for(let i=1;i<rows.length;i++)assert.ok(rows[i].rawPregameScore<rows[i-1].rawPregameScore,records.join('/'));
    let previous=Infinity;
    for(let s=0;s<=30;s+=.05){const r=rate(fixture(records,s));assert.ok(r.rawPregameScore<=previous+.011,`${records}: ${s}`);previous=r.rawPregameScore;assert.equal(r.score,runtime.clampScore(r.factors.reduce((n,f)=>n+f.points,0)));}
    assert.ok(rows[3].factors.some(f=>f.label==='Projected spread mismatch'&&f.points<=-4));
    assert.ok(rows[4].factors.some(f=>f.label==='Projected spread mismatch'&&f.points<=-6));
  }
});

test('NFL curve is monotone, bounded, continuously differentiable at anchors and negative beyond seven',()=>{
  const curve=s=>footballSpreadAdjustment('NFL',s),h=.00001;
  for(const [s] of FOOTBALL_SPREAD_ANCHORS.NFL.slice(1)){
    assert.ok(Math.abs((curve(s)-curve(s-h))/h-(curve(s+h)-curve(s))/h)<.001,`slope at ${s}`);
  }
  for(let s=0;s<=50;s+=.01){assert.ok(curve(s)>=-10&&curve(s)<=7);assert.ok(curve(s+.001)<=curve(s)+1e-9);if(s>7)assert.ok(curve(s)<0);}
  assert.equal(curve(7),0);assert.ok(curve(9.5)<-3);assert.equal(curve(10),-4);
  for(const s of [6.99999,7,7.00001,9.49999,9.5,9.50001,9.99999,10,10.00001])assert.ok(Math.abs(rate(fixture(undefined,s-h)).rawPregameScore-rate(fixture(undefined,s+h)).rawPregameScore)<.03);
});

test('one strong record cannot unlock the mutual-quality ceiling, including when odds or evidence are absent',()=>{
  for(let low=0;low<=.5;low+=.005)for(let high=.5;high<=1;high+=.005){const q=nflRecordAssessment({},[record(low),record(high)]);assert.ok(q.positive>=0&&q.positive<=2);assert.ok(q.penalty<=0&&q.penalty>=-7);}
  for(const other of [.2,.4,.5,.55,.6,.8,1])for(const boundary of [.5,.57,.7]){
    const a=nflRecordAssessment({},[record(boundary-.00001),record(other)]),b=nflRecordAssessment({},[record(boundary+.00001),record(other)]);
    assert.ok(Math.abs(a.positive+a.penalty-b.positive-b.penalty)<.03);
  }
  const quality=(records,spread)=>rate(fixture(records,spread)).factors.filter(f=>/winning records|Winning team quality/.test(f.label)).reduce((n,f)=>n+f.points,0);
  for(const s of [null,2.5,6,8,10,14]){assert.ok(quality(['6-1','2-5'],s)<=2);assert.ok(quality(['6-1','6-1'],s)<=14);assert.ok(quality(['6-1','6-1'],s)>quality(['6-1','2-5'],s));}
  const tied=fixture(['4-2-1','2-5']);assert.equal(recordStats(tied.competition.competitors[0]).pct,4.5/7);
});

test('competitive tiers keep their order; division interest and undefeated prestige remain explicit',()=>{
  const ranks=[['2-5','1-6'],['4-4','4-4'],['6-1','2-5'],['5-2','4-3'],['6-1','6-1']].map(r=>rate(fixture(r)).rawPregameScore);
  for(let i=1;i<ranks.length;i++)assert.ok(ranks[i]>ranks[i-1],JSON.stringify(ranks));
  const ordinary=rate(fixture()),division=rate(fixture(undefined,2.5,48.5,true));assert.equal(division.rawPregameScore-ordinary.rawPregameScore,4);
  assert.ok(rate(fixture(['7-0','6-1'])).factors.some(f=>f.label==='Unbeaten team'&&f.points===7));
  assert.ok(rate(fixture(['6-1','6-1'],2.5)).score>rate(fixture(['6-1','2-5'],10)).score+15);
});

test('missing odds/standings/context stay neutral and a date seven days later cannot invent interest',async()=>{
  for(const records of [[null,null],['6-1',null],['6-1','2-5'],['4-4','4-4']])for(const s of [null,0,2.5,10]){
    const today=rate(fixture(records,s)),future=rate(fixture(records,s,48.5,false,'2026-11-08T18:00Z'));
    assert.deepEqual(plain(future),plain(today));
    assert.ok(!today.factors.some(f=>/Division (lead|race)|Recent|Season point/.test(f.label)));
    if(s==null)assert.ok(!today.factors.some(f=>/projected|Close-game scoring/i.test(f.label)));
    if(records.includes(null))assert.ok(!today.factors.some(f=>/winning records|Winning team quality|losing-record/.test(f.label)));
  }
  const g=normalizeEvent(fixture(undefined,10,48.5,false,'2026-11-08T18:00Z').event,'NFL');
  const env={DB:{prepare(){throw Error('Distant games do not fetch or assume near-kickoff context');}}};
  assert.deepEqual(await cachedNflPregame(env,[g],Date.parse('2026-11-01T12:00Z')),{contexts:{},deferred:[]});
});

test('all 25 captured production games reconcile; benchmark close games remain stable and both large changes are explained',()=>{
  const rows=competitivenessReport().rows;assert.equal(rows.length,25);
  for(const id of ['401873030','401873033','401873026','401873027','401873025','401873029'])assert.equal(rows.find(r=>r.id===id).change,0);
  assert.ok(Math.abs(rows.find(r=>r.id==='401873031').change)<=3);
  for(const r of rows){assert.equal(r.after,runtime.clampScore(r.factors.reduce((n,f)=>n+f.points,0)));if(r.flagged)assert.match(r.reason,/Bounded single-team quality; Stronger spread downside/);}
  const sf=rows.find(r=>r.id==='401873047');
  for(const id of ['401873041','401873044','401873049'])assert.ok(sf.after<rows.find(r=>r.id===id).after);
  assert.deepEqual(rows.filter(r=>r.flagged).map(r=>r.id).sort(),['401873045','401873047']);
});

test('browser and Worker share all 25 factors; observed pregame baselines survive kickoff',()=>{
  const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore');
  for(const {event,competition,context,baseline} of competitivenessData().games){
    const expected=runtime.rateGame('NFL','upcoming',[],event,competition,context),actual=browser.rateGame('NFL','upcoming',[],event,competition,context);
    assert.deepEqual(plain(actual),plain(expected));
    const source=structuredClone(event);source.competitions=[structuredClone(competition)];
    const upcoming=normalizeEvent(source,'NFL');applyContextsToGame(upcoming,baseline.qualitativeContexts || []);assert.equal(upcoming.score,expected.score);
    const start=structuredClone(source);start.competitions[0].status={period:1,displayClock:'15:00',type:{state:'in',name:'STATUS_IN_PROGRESS'}};
    const live=normalizeEvent(start,'NFL');runtime.preservePregameBaseline(live,upcoming);runtime.applyLiveSnapshot(live,live.sourceCompetition,null);
    assert.equal(live.openingScore,upcoming.score);assert.ok(Math.abs(live.score-upcoming.score)<=1);
  }
});

test('frozen engine confirms other sports and archived NFL live/final factor outputs remain unchanged',()=>{
  const before=beforeEngine();let compared=0;
  const {gunzipSync}=require('node:zlib');
  for(const f of Object.values(JSON.parse(gunzipSync(fs.readFileSync('alerts-worker/test/fixtures/migration-inputs.json.gz'))))){
    const c=f.event.competitions[0],state=c.status.type.state==='pre'?'upcoming':c.status.type.state==='post'?'completed':'live';
    if(f.modelSport==='NFL'&&state==='upcoming')continue;
    assert.deepEqual(plain(runtime.rateGame(f.modelSport,state,c.competitors,f.event,c,f.event.name)),plain(before.rateGame(f.modelSport,state,c.competitors,f.event,c,f.event.name)));compared++;
  }assert.ok(compared>=100);
});
