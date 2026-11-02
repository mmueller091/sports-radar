import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import * as legacy from '../alerts-worker/src/game-model.js';
import {recoverPregameBaselines} from '../alerts-worker/src/snapshot-history.js';
import {DatabaseSync} from 'node:sqlite';
import helper from './helpers/football-transition.cjs';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs');
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const browser=vm.runInNewContext(buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'}).outputFiles[0].text+';SportsRadarScore');
const plain=x=>JSON.parse(JSON.stringify(x));
function rate(sport,spread,options={},wp=null,engine=runtime) {
  const event=helper.event(spread,options),game=legacy.normalizeEvent(event,sport),competition=event.competitions[0];
  const summary={header:{competitions:[structuredClone(competition)]},...(wp===null?{}:{winprobability:[{homeWinPercentage:wp}]})};
  engine.applyLiveSnapshot(game,competition,summary);
  return game;
}
for(const sport of ['NFL','CFB']) {
  test(`${sport}: production kickoff matches calibrated pregame for every spread, rank, stakes and WP combination`,()=>{
    for(const spread of [null,0,3,10,21,26.5,35])for(const postseason of [false,true])for(const ranks of [[],[2,8]])for(const wp of [null,.5,.97]) {
      const event=helper.event(spread,{state:'pre',period:0,postseason,ranks});
      const pre=active.normalizeEvent(event,sport);
      const game=rate(sport,spread,{postseason,ranks},wp);
      assert.equal(game.score,pre.score,`${spread} ${postseason} ${ranks} ${wp}`);
      assert.equal(game.openingScore,pre.score);
      assert.equal(game.live.bonus,0);
    }
  });
  test(`${sport}: uneventful opening develops continuously; early market mismatch survives available or missing WP`,()=>{
    for(const wp of [null,.5,.98]) {
      const pk=rate(sport,0,{clock:'13:00'},wp),wide=rate(sport,26.5,{clock:'13:00'},wp);
      assert.ok(pk.score>=wide.score+10);
      for(const spread of [null,0,26.5]) {
        const opening=rate(sport,spread,{},wp).score;
        let prior=opening;
        for(let seconds=900;seconds>=600;seconds-=5) {
          const clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
          const game=rate(sport,spread,{clock},wp);
          assert.ok(Math.abs(game.score-prior)<=1,`${spread} ${clock}: ${prior}->${game.score}`);
          assert.ok(Math.abs(game.score-opening)<=4,`${spread} ${clock}: ${opening}->${game.score}`);
          prior=game.score;
        }
      }
    }
  });
  test(`${sport}: missing WP has a finite evidence estimate; mature ESPN observations retain their meaning`,()=>{
    const missing=rate(sport,26.5,{period:2,clock:'0:00'}),even=rate(sport,26.5,{period:2,clock:'0:00'},.5);
    assert.ok(missing.score<even.score);
    assert.ok(missing.pregameBaseline.spread===26.5);
    assert.equal(missing.live.probabilityTelemetry.probability,null);
    const noMarket=rate(sport,null,{period:2,clock:'0:00'}),knownEven=rate(sport,null,{period:2,clock:'0:00'},.5);
    assert.ok(noMarket.score<knownEven.score);
    assert.ok(rate(sport,0,{period:4,clock:'2:00'}).score>=65,'sustained scoreless contest becomes compelling');
  });
  test(`${sport}: meaningful early plays retain independent event credit`,()=>{
    const event=helper.event(0,{clock:'13:00',scores:[6,0]}),g=active.normalizeEvent(event,sport);
    const competition=event.competitions[0];
    const summary={header:{competitions:[structuredClone(competition)]},plays:[
      {id:'1',period:{number:1},clock:{displayValue:'14:00'},homeScore:0,awayScore:0,text:'Pass complete for 8 yards'},
      {id:'2',period:{number:1},clock:{displayValue:'13:00'},homeScore:0,awayScore:6,scoringPlay:true,text:'Interception returned for a touchdown',type:{text:'Interception Return Touchdown'}}]};
    active.enrichGame(g,summary);
    const quiet=rate(sport,0,{clock:'13:00',scores:[6,0]});
    assert.ok(g.score>=quiet.score+5,`${g.score} vs ${quiet.score}`);
    assert.ok(g.live.components.eventShock>=5);
  });
  test(`${sport}: late comeback, red-zone fourth down, postseason and overtime retain leverage`,()=>{
    const options={period:4,clock:'1:00',scores:[20,24],situation:{possession:'away',down:4,distance:3,possessionText:'PIT 3',downDistanceText:'4th & Goal at PIT 3',isGoalToGo:true}};
    const comeback=rate(sport,28,options);
    assert.ok(comeback.score>=80,`late comeback ${comeback.score}`);
    assert.ok(rate(sport,28,{...options,postseason:true}).score>=comeback.score);
    const ot=rate(sport,0,{period:5,clock:'5:00',scores:[24,24],situation:options.situation});
    assert.ok(ot.score>=75,`OT ${ot.score}`);
  });
  test(`${sport}: JSON round trips and D1 recovery retain the last observed pregame rating through changed odds/context`,async t=>{
    const pre=active.normalizeEvent(helper.event(26.5,{state:'pre',period:0}),sport);
    const previous=plain(pre),event=helper.event(0,{clock:'13:00'}),g=active.normalizeEvent(event,sport);
    active.enrichGame(g,null,previous);
    assert.equal(g.openingScore,pre.score);
    assert.equal(g.pregameBaseline.source,'observed');
    assert.equal(g.pregameBaseline.spread,26.5);
    const db=new DatabaseSync(':memory:');t.after(()=>db.close());
    db.exec(fs.readFileSync('alerts-worker/schema.sql','utf8'));
    const now=Date.now();
    db.prepare(`INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(`${sport}:${pre.id}`,now-1000,sport,'upcoming',pre.score,'0','0','0','',JSON.stringify(previous),runtime.MODEL_VERSION);
    const env={DB:{prepare(sql){let args;return {bind(...a){args=a;return this;},async all(){return {results:db.prepare(sql).all(...args)};}};}}};
    const fresh=active.normalizeEvent(event,sport);
    await recoverPregameBaselines(env,[fresh],now,null);
    runtime.applyLiveSnapshot(fresh,fresh.sourceCompetition,null);
    assert.equal(fresh.openingScore,pre.score);
    assert.equal(fresh.score,g.score);
    assert.deepEqual(fresh.pregameBaseline,previous.pregameBaseline);
    const lateEvent=helper.event(null,{period:4,clock:'1:00',scores:[24,21]});
    const late=active.normalizeEvent(lateEvent,sport);
    active.enrichGame(late,null,previous);
    assert.ok(late.upsetPoints>0,'observed underdog survives disappearance of live odds');
    const legacySnapshot=plain(previous);delete legacySnapshot.pregameBaseline;
    db.prepare('UPDATE sports_snapshots SET normalized_state=?,model_version=?').run(JSON.stringify(legacySnapshot),'2026-10-31.football-pregame.1');
    const migrated=active.normalizeEvent(event,sport);
    await recoverPregameBaselines(env,[migrated],now,null);
    runtime.applyLiveSnapshot(migrated,migrated.sourceCompetition,null);
    assert.equal(migrated.openingScore,pre.score,'previous calibrated release snapshots migrate without recalculation');
    assert.equal(migrated.pregameBaseline.spread,26.5);
  });
}
test('browser bundle and Worker production graph agree across the full football matrix',()=>{
  for(const sport of ['NFL','CFB'])for(const spread of [null,0,26.5])for(const [period,clock] of [[1,'15:00'],[1,'13:00'],[1,'10:00'],[2,'0:00'],[3,'2:00'],[4,'1:00'],[5,'5:00']])for(const scores of [[0,0],[7,0],[21,24],[7,35]])for(const wp of [null,.5,.95]) {
    const a=rate(sport,spread,{period,clock,scores},wp),b=rate(sport,spread,{period,clock,scores},wp,browser);
    for(const key of ['score','baseScore','openingScore','factors','live','trajectoryScoring','momentumPoints','pregameBaseline']) assert.deepEqual(plain(a[key]),plain(b[key]),key);
  }
});
test('vs start uses the observed serialized baseline and hides unobserved estimates',()=>{
  const source=fs.readFileSync('app.js','utf8').replaceAll('\r\n','\n'),start=source.indexOf('function trendFor(');
  const trend=vm.runInNewContext(source.slice(start,source.indexOf('\n}',start)+2)+';trendFor');
  assert.match(trend({sport:'CFB',state:'live',score:45,openingScore:61,pregameBaseline:{score:40,source:'observed'}}),/\+5 vs start/);
  assert.equal(trend({sport:'CFB',state:'live',score:45,openingScore:40,pregameBaseline:{score:40,source:'reconstructed'}}),'');
});
