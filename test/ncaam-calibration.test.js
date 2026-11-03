import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {report} from '../scripts/ncaam-calibration-comparison.mjs';
const require=createRequire(import.meta.url);
const {basketballLiveCloseness}=require('../scoring/shared/basketball.js');
const {timeAwareCloseness}=require('../scoring/basketball-calibration.cjs');
const cases=new Map(report.cases.map(item=>[item.id,item]));
const point=id=>{const item=cases.get(id);assert.ok(item,id);return item;};
const state=(sport,gap,period,displayClock)=>basketballLiveCloseness(sport,gap,0,
 {competition:{status:{period,displayClock,type:{state:'in'}}}});
const collegeState=(gap,period,displayClock)=>{
 const competition={status:{period,displayClock,type:{state:'in'}}};
 const ordinary=state('NCAAB',gap,period,displayClock);
 return {...ordinary,effective:timeAwareCloseness(gap,competition,ordinary,ordinary.close)};
};

test('college multi-possession closeness responds to remaining regulation time only',()=>{
 const early=collegeState(10,1,'3:01');
 const late=collegeState(10,2,'2:00');
 assert.ok(early.effective>early.close);
 assert.ok(early.effective>late.effective);
 assert.ok(early.comebackFeasibility>late.comebackFeasibility);
 for(const [gap,period,clock] of [[22,1,'12:00'],[2,1,'3:01'],[10,3,'2:00'],[10,1,'']]){
  const value=collegeState(gap,period,clock);assert.equal(value.effective,value.close);
 }
});

test('NBA keeps its original margin and comeback curve exactly',()=>{
 for(const gap of [0,2,10,18,22])for(const [period,clock] of [[1,'3:01'],[4,'2:00'],[5,'1:30']]){
  const value=state('NBA',gap,period,clock);
  assert.equal(value.close,value.marginClose*(.25+.75*value.comebackFeasibility));
  assert.equal(value.marginClose,Math.max(0,1-gap/24));
 }
});

test('ranked context remains conditional on current competition and fades without a halftime jump',()=>{
 assert.equal(point('A-live').openingScore,51,'observed Florida–Miami opening is preserved');
 assert.ok(point('A-live').score>point('F-ranked-early22').score);
 assert.ok(point('C-top10-close').score>point('H-unranked-close').score);
 assert.ok(point('D-ranked-early10').score>point('E-ranked-late10').score);
 assert.ok(point('F-ranked-early22').score>point('G-ranked-late22').score);
 assert.equal(point('J5-half-end').score,point('J6-second-start').score);
 assert.equal(point('J1-close-late').score,53);
 assert.equal(point('J2-overtime').score,59);
 assert.equal(point('I-second-half-comeback').score,85);
 assert.equal(point('J4-completed').score,40);
});

test('current-play probability reconciliation remains intact during calibration',()=>{
 assert.equal(point('A-probability-omitted').providerProbability,.877);
 assert.equal(point('A-probability-omitted').score,point('A-live').score);
 assert.equal(point('A-stale-detail').providerProbability,null);
 assert.equal(point('A-stale-detail').evidenceQuality,'partial');
 assert.equal(point('A-live').observed,40);
 assert.equal(point('B-live').observed,41);
});
