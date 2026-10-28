import {capPregameOracle} from './helpers/cap-pregame-oracle.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import completed from './helpers/cfb-completed.cjs';
import live from './helpers/cfb-calibration.cjs';
import nfl from './helpers/nfl-calibration.cjs';
import source from './helpers/scoring-source.cjs';
import * as adapter from '../alerts-worker/src/game-model.js';
import {baseballSituation,footballSituation} from '../alerts-worker/src/display-model.js';
const require=createRequire(import.meta.url),core=require('../rating-core.js');
const baseline=require('../calibration/cfb-completed-baseline.json');
const before=vm.runInNewContext(`${completed.frozen()}\nSportsRadarScore`);
const cappedBefore=vm.runInNewContext(`${capPregameOracle(completed.frozen())}\nSportsRadarScore`);
const browser=vm.runInNewContext(`${source.scoringSource()}\nSportsRadarScore`);
const same=(a,b,msg)=>assert.deepEqual(structuredClone(a),structuredClone(b),msg);
const score=input=>completed.evaluate(core,input).score;
const s=key=>score(completed.cases[key]);

test('completed CFB A-V: path, OT, upset, rank, stakes and defensive quality',()=>{
 for(const [higher,lower] of [['B','A'],['D','C'],['G','F'],['F','H'],['I','J'],['N','M'],['M','L'],['L','K'],['N','O'],['P','L'],['P','Q'],['T','U']]) assert.ok(s(higher)>s(lower),`${higher}=${s(higher)} > ${lower}=${s(lower)}`);
 assert.ok(s('E')>=s('D'));assert.ok(s('R')>=95);assert.ok(s('S')<s('R')-50);
 assert.ok(s('A')>=35&&s('A')<=60);assert.ok(s('C')>=75);assert.ok(s('E')>=90);assert.ok(s('I')>=80);
 assert.ok(s('O')<35);assert.ok(s('H')<25);assert.ok(s('V')>=95);
 assert.ok(s('D')-s('C')>s('E')-s('D'),'diminishing OT increments');
 assert.ok(score({...completed.cases.C,stage:'National Championship'})<95,'stakes alone cannot make ordinary 1OT a maximum');
 const unranked={...completed.cases.Q,ranks:[]};
 assert.ok(s('Q')>=score(unranked)&&s('Q')<=score(unranked)+5);
});

test('saved baseline provenance and exact CFB A-Y / NFL A-P preservation',()=>{
 for(const [key,input]of Object.entries(completed.cases))same(completed.evaluate(before,input),baseline.completed[key],`completed ${key} saved before`);
 for(const [key,input]of Object.entries(live.cases)){
  same(live.evaluate(core,input),baseline.cfb[key],`CFB live ${key}`);
  same(live.evaluate(before,input),baseline.cfb[key],`CFB live ${key} provenance`);
 }
 for(const [key,input]of Object.entries(nfl.cases))same(nfl.evaluate(core,input),baseline.nfl[key],`NFL ${key}`);
 // Midgame and early-Q4 carryover have separate boundary coverage. The
 // established 4:00/2:00 Q4 margin grid remains exact.
 for(const input of Object.values(live.margins).filter(input=>input.period===4&&['4:00','2:00'].includes(input.clock)))
  same(live.evaluate(core,input),live.evaluate(before,input),'late-Q4 live margin grid');
 same(Object.keys(core),Object.keys(before));
 for(const key of Object.keys(core))if(typeof core[key]==='function')assert.equal(core[key].length,before[key].length,key);
});

test('all sport states preserve standalone histories; pregame and other sports preserve full ratings',()=>{
 for(const sport of ['CFB','NFL','NBA','NCAAB','MLB','Soccer','Tennis'])for(const state of ['upcoming','live','completed'])for(const input of Object.values(completed.cases)){
  const f=completed.fixture(input),teams=f.competition.competitors.map(t=>({...t,id:t.team.id}));
  same(core.momentumImpact(sport,f.summary,1,state),before.momentumImpact(sport,f.summary,1,state),`${sport} ${state} history`);
  if(sport!=='CFB'||state!=='completed')same(core.rateGame(sport,state,teams,f.event,f.competition,''),cappedBefore.rateGame(sport,state,teams,f.event,f.competition,''),`${sport} ${state} rating`);
 }
});

test('all stored provider fixtures preserve non-CFB complete outputs and CFB history; browser equals Node',()=>{
 const old=completed.providers(completed.adapter(completed.frozen(),{baseballSituation,footballSituation}));
 const cappedOld=completed.providers(completed.adapter(capPregameOracle(completed.frozen()),{baseballSituation,footballSituation}));
 const now=completed.providers(adapter);
 const inBrowser=completed.providers(completed.adapter(source.scoringSource(),{baseballSituation,footballSituation}));
 same(JSON.parse(JSON.stringify(old)),baseline.providers,'serialized provider baseline provenance');
 same(now,inBrowser,'every normalized/enriched provider output browser/Node');
 for(const [file,g]of Object.entries(now)){
  if(g.sport!=='NHL'&&(g.sport!=='CFB'||g.state!=='completed'))same(g,cappedOld[file],file);
  assert.ok(g.score>=1&&g.score<=99,file);
 }
});

test('completed floors consume existing OT, history, stakes and finishing points',()=>{
 for(const input of Object.values(completed.cases)){
  const f=completed.fixture(input),g=adapter.normalizeEvent(f.event,'CFB');adapter.enrichGame(g,f.summary);
  assert.equal(g.score,score(input),input.label);
  same(completed.evaluate(core,input),completed.evaluate(browser,input),`${input.label} browser/Node`);
 }
 const f=completed.fixture(completed.cases.D),game={sport:'CFB',state:'completed',score:95,factors:[{label:'Overtime',points:13}],sourceCompetition:f.competition};
 const history=core.momentumImpact('CFB',f.summary,1,'completed');
 same(core.momentumImpact('CFB',f.summary,1,'completed',{game,finishPoints:14}),history,'no OT award above the aggregate floor');
 const lowOT={...completed.cases.U,ot:2,scores:[10,7]};
 assert.ok(score(lowOT)<score({...lowOT,stagnant:false})-15,'OT floor preserves offensive stagnation');
});

test('late retention rejects missing clocks, stale finals, nonmonotone and incomplete scoring ledgers',()=>{
 const adjust=mutate=>{
  const f=completed.fixture(completed.cases.G);mutate(f);
  const g=adapter.normalizeEvent(f.event,'CFB');adapter.enrichGame(g,f.summary);
  return g.factors.filter(f=>f.label==='Completed competitive path retention');
 };
 assert.equal(adjust(()=>{}).length,1);
 for(const mutate of [f=>delete f.summary.scoringPlays[3].clock,f=>f.summary.scoringPlays[3].clock.displayValue='bad',f=>f.summary.scoringPlays.pop(),f=>f.summary.scoringPlays.reverse(),f=>f.summary.scoringPlays.splice(0,3),f=>f.summary.scoringPlays[2].homeScore=null])assert.equal(adjust(mutate).length,0);
 const early={scores:[42,21],path:[[1,'13:00',0,7],[1,'11:00',0,14],[1,'9:00',0,21],[1,'6:00',7,21],[1,'3:00',14,21],[2,'13:00',21,21],[2,'10:30',28,21],[2,'6:00',35,21],[2,'1:00',42,21]]};
 assert.ok(score(early)<40,'early comeback followed by full-half blowout');
 const garbage={scores:[42,21],path:[[1,'13:00',7,0],[1,'8:00',14,0],[2,'11:00',21,0],[2,'3:00',28,0],[3,'10:00',35,0],[3,'2:00',42,0],[4,'6:00',42,7],[4,'3:00',42,14],[4,'1:00',42,21]]};
 assert.ok(score(garbage)<25,'garbage-time accumulation does not retain a competitive path');
});

test('completed shootout requires explicit repeated attempts and known rule era; missing OT detail uses period',()=>{
 const evaluate=mutate=>{
  const f=completed.fixture(completed.cases.V);mutate(f);
  const game={sport:'CFB',state:'completed',score:30,factors:[],sourceCompetition:f.competition,sourceEvent:f.event};
  return core.momentumImpact('CFB',f.summary,1,'completed',{game});
 };
 assert.ok(evaluate(()=>{}).factors.some(f=>/conversion shootout/.test(f.label)));
 for(const mutate of [f=>f.summary.plays=[],f=>f.summary.plays=f.summary.plays.slice(0,1),f=>f.event.season.year=2018])assert.equal(evaluate(mutate).factors.some(f=>/conversion shootout/.test(f.label)),false);
 assert.ok(evaluate(f=>f.competition.status.type.detail=f.competition.status.type.shortDetail='Final').factors.some(f=>/5OT/.test(f.label)));
});

test('completed comeback outcome and upset rank are bounded without duplicating history',()=>{
 const losing={...completed.cases.I,scores:[28,31],path:completed.cases.I.path.slice(0,-1).concat([[4,'0:12',28,31]])};
 assert.ok(score(losing)>=80,'a comeback that takes the lead and later loses still counts');
 const inOT={...completed.cases.I,ot:2,scores:[36,28],path:completed.cases.I.path.slice(0,-1).concat([[6,'0:00',36,28]])};
 const result=completed.evaluate(core,inOT);
 assert.ok(result.score>=88&&result.score<=96,'OT and comeback floors do not add together');
 assert.equal(result.factors.filter(f=>f.label==='Erased a large deficit').length,1);
 const upset=options=>completed.evaluate(core,{...completed.cases.L,...options}).upset;
 assert.ok(upset({ranks:[2,null]})>upset({ranks:[20,null]}));
 assert.ok(upset({ranks:[20,null]})>=upset({ranks:[]}));
 assert.equal(upset({ranks:[2,1]}),upset({ranks:[]}),'higher-ranked dog has no rank-gap award');
 assert.equal(upset({spread:30}),upset({spread:99}),'spread magnitude saturates');
 assert.equal(upset({scores:[17,14]}),0,'underdog must actually win');
});
