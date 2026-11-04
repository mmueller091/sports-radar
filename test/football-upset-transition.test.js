import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import Module from 'node:module';
import {fileURLToPath} from 'node:url';
import * as active from '../alerts-worker/src/live-game-model.js';
import {footballScenario} from './fixtures/football-live-scenarios.mjs';

// Frozen production adapter at 0f0eb90, including the actual live runtime.
const filename=fileURLToPath(new URL('./fixtures/live-underdog-before.cjs.gz',import.meta.url));
const frozen=new Module(filename);
frozen.filename=filename;
frozen._compile(gunzipSync(readFileSync(filename)).toString(),filename);
const before=frozen.exports;
const spreads=[4,7.5,7.9,8,8.1,10,14,25.5,35];
const phases=[[1,'12:00'],[2,'0:00'],[3,'3:00'],[4,'10:00'],[4,'4:00'],[4,'0:10'],[5,'5:00']];

// Every generated state in this file is a controlled simulation, never an
// observation or a claimed historical football score/possession/market.
function run(sport,spread,margin,period=4,clock='4:00',options={},adapter=active) {
  const fixture=footballScenario({sport,spread,home:21,away:21+margin,period,clock});
  if(options.situation)fixture.competition.situation=structuredClone(options.situation);
  if(options.odds==='missing')delete fixture.competition.odds;
  if(options.odds==='stale')fixture.competition.odds[0].lastUpdated='2026-10-01T12:00:00Z';
  if(options.odds==='live')fixture.competition.odds[0].isLive=true;
  fixture.summary.header.competitions=[structuredClone(fixture.competition)];
  if(options.wp!=null)fixture.summary.winprobability=[{homeWinPercentage:options.wp}];
  const game=adapter.normalizeEvent(structuredClone(fixture.event),sport);
  adapter.enrichGame(game,structuredClone(fixture.summary));
  return game;
}

for(const sport of ['NFL','CFB']) {
  test(`${sport}: late tied-to-leading upset credit is continuous and nondecreasing`,()=>{
    for(const spread of spreads)for(const [period,clock] of phases.slice(2))for(const wp of [null,0,.5,1]) {
      const states=[0,1,3,7,14].map(margin=>run(sport,spread,margin,period,clock,{wp}));
      for(let i=1;i<states.length;i++) {
        const prior=states[i-1].liveSurprise,current=states[i].liveSurprise;
        assert.ok(current.rawPoints>=prior.rawPoints,`${spread}, ${period}/${clock}, WP ${wp}: ${prior.margin}->${current.margin}`);
        assert.ok(current.points>=prior.points);
      }
    }
  });

  test(`${sport}: target repair preserves deficits, ties, early and larger leads exactly`,()=>{
    for(const spread of spreads)for(const [period,clock] of phases)for(const margin of [-14,-7,-3,-1,0,7,14]) {
      const actual=run(sport,spread,margin,period,clock),old=run(sport,spread,margin,period,clock,{},before);
      assert.equal(actual.score,old.score,`${spread}, ${period}/${clock}, ${margin}: total`);
      assert.equal(actual.upsetPoints,old.upsetPoints,`${spread}, ${period}/${clock}, ${margin}: upset`);
      assert.ok(Math.abs(actual.liveSurprise.rawPoints-old.liveSurprise.rawPoints)<1e-12);
      assert.equal(actual.liveSurprise.overlap,old.liveSurprise.overlap);
    }
    for(const [period,clock] of phases.slice(0,3))for(const margin of [1,3]) {
      const actual=run(sport,25.5,margin,period,clock),old=run(sport,25.5,margin,period,clock,{},before);
      assert.equal(actual.score,old.score);
      assert.equal(actual.upsetPoints,old.upsetPoints);
    }
  });

  test(`${sport}: no legacy time/spread activation cliff is reintroduced`,()=>{
    for(const margin of [-1,0,1,3])for(const [period,clock] of [[2,540],[3,180],[4,300]]) {
      const states=[clock+1,clock,clock-1].map(seconds=>run(sport,25.5,margin,period,`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`));
      assert.ok(Math.max(...states.map(g=>g.score))-Math.min(...states.map(g=>g.score))<=1);
      assert.ok(Math.max(...states.map(g=>g.upsetPoints))-Math.min(...states.map(g=>g.upsetPoints))<=1);
    }
    for(const margin of [-1,0,1,3])for(const spread of spreads) {
      const points=[spread-.001,spread,spread+.001].map(value=>run(sport,value,margin).upsetPoints);
      assert.ok(Math.max(...points)-Math.min(...points)<=1);
    }
  });

  test(`${sport}: market rejection, confirmed/unknown possession and exhausted runway are preserved`,()=>{
    for(const odds of ['missing','stale','live']) {
      const game=run(sport,35,1,4,'0:10',{odds});
      assert.equal(game.upsetPoints,0,odds);
      assert.equal(game.score,run(sport,35,1,4,'0:10',{odds},before).score);
    }
    for(const wp of [null,0,.5,1])for(const margin of [-1,-3,-7,-14])for(const situation of [{},
      {possession:'dog',down:1,distance:10,possessionText:'FAV 20'},
      {possession:'fav',down:1,distance:10,awayTimeouts:0,homeTimeouts:0}]) {
      const game=run(sport,35,margin,4,'0:10',{situation,wp});
      const old=run(sport,35,margin,4,'0:10',{situation,wp},before);
      assert.equal(game.score,old.score);
      assert.equal(game.upsetPoints,old.upsetPoints);
      if(situation.possession==='fav')assert.ok(game.score<85,`exhausted-runway simulation ${margin}, WP ${wp}: ${game.score}`);
    }
  });
}

test('CFB: repairing the upset component does not force total excitement to rise after a lead change',()=>{
  const tie=run('CFB',25.5,0),lead=run('CFB',25.5,1);
  const oldLead=run('CFB',25.5,1,4,'4:00',{},before);
  assert.ok(lead.upsetPoints>=tie.upsetPoints);
  assert.ok(lead.upsetPoints>oldLead.upsetPoints);
  assert.ok(lead.score<tie.score,'other current-tension components remain free to decrease');
});
