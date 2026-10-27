import {capPregameOracle} from './helpers/cap-pregame-oracle.cjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import c from './helpers/cfb-completed.cjs';
import u from './helpers/cfb-upset.cjs';
import live from './helpers/cfb-calibration.cjs';
import nfl from './helpers/nfl-calibration.cjs';
import source from './helpers/scoring-source.cjs';
import * as adapter from '../alerts-worker/src/game-model.js';
import {baseballSituation,footballSituation} from '../alerts-worker/src/display-model.js';
const core=createRequire(import.meta.url)('../rating-core.js');
const cappedBefore=vm.runInNewContext(`${capPregameOracle(u.source)}\nSportsRadarScore`);
const same=(a,b,label)=>assert.deepEqual(structuredClone(a),structuredClone(b),label);
const score=input=>c.evaluate(core,input).score;
test('completed upset A-S: nonlinear magnitude, quality, rank and bounded stakes',()=>{
 const s=Object.fromEntries(Object.entries(u.cases).map(([k,v])=>[k,score(v)]));
 for(const [a,b] of [['E','D'],['D','C'],['C','B'],['B','A'],['C','G'],['I','J'],['N','M'],['M','L'],['L','K'],['O','D']])assert.ok(s[a]>s[b],`${a}=${s[a]} > ${b}=${s[b]}`);
 assert.ok(s.D-s.B>=20);assert.ok(s.D-s.H>=60);assert.ok(s.O-s.P>=60);
 for(const k of ['F','G','H','P'])assert.ok(s[k]<=12,`${k} stays low`);
 for(const k of ['R','S'])assert.ok(s[k]>s.Q&&s[k]<99,`${k} stakes do not force maximum`);
 const spread=x=>c.evaluate(core,{...u.cases.A,spread:x}).upset;
 assert.ok(spread(21)-spread(14)>spread(14)-spread(7));
 assert.equal(spread(30),spread(99));
 for(const x of [7,14,21,28,30])same(c.evaluate(core,{...u.wide,spread:x}),c.evaluate(u.before,{...u.wide,spread:x}),'wire-to-wire unchanged');
});
test('exact pre-upset-pass protection: completed OT/path/defense, live CFB, NFL, pregame and histories',()=>{
 for(const k of ['C','D','E','R','V','F','G','H','I','J','T','U'])same(c.evaluate(core,c.cases[k]),c.evaluate(u.before,c.cases[k]),`completed ${k}`);
 for(const [k,v] of Object.entries(live.cases))same(live.evaluate(core,v),live.evaluate(u.before,v),`CFB ${k}`);
 for(const [k,v] of Object.entries(nfl.cases))same(nfl.evaluate(core,v),nfl.evaluate(u.before,v),`NFL ${k}`);
 for(const v of Object.values(u.cases)){
  const f=c.fixture(v),teams=f.competition.competitors.map(t=>({...t,id:t.team.id}));
  same(core.rateGame('CFB','upcoming',teams,f.event,f.competition,''),cappedBefore.rateGame('CFB','upcoming',teams,f.event,f.competition,''),'pregame');
  same(core.momentumImpact('CFB',f.summary,1,'completed'),u.before.momentumImpact('CFB',f.summary,1,'completed'),'standalone history');
 }
});
test('upset matrix browser/Node equivalence and full provider replay against immediate baseline',()=>{
 const browser=vm.runInNewContext(`${source.scoringSource()}\nSportsRadarScore`);
 for(const v of Object.values(u.cases))same(c.evaluate(core,v),c.evaluate(browser,v),'synthetic browser');
 const now=c.providers(adapter),old=c.providers(c.adapter(capPregameOracle(u.source),{baseballSituation,footballSituation}));
 same(now,c.providers(c.adapter(source.scoringSource(),{baseballSituation,footballSituation})),'all provider browser outputs');
 for(const [file,g] of Object.entries(now))if(g.sport!=='NHL'&&(g.sport!=='CFB'||g.state!=='completed'))same(g,old[file],file);
});
