import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import * as active from '../alerts-worker/src/live-game-model.js';
import * as legacy from '../alerts-worker/src/game-model.js';
import {recoverPregameBaselines} from '../alerts-worker/src/snapshot-history.js';
import {achievementMatchesGame,deterministicFactor,mergeFactors,contextsForGames} from '../alerts-worker/src/storylines.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs'),transition=require('../scoring/opening-transition.cjs');
const h=require('./helpers/opening-transition.cjs'),nhl=require('./helpers/nhl-calibration.cjs');
const {buildSync}=require('../alerts-worker/node_modules/esbuild');
const browser=vm.runInNewContext(buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,format:'iife',platform:'browser',logLevel:'silent'}).outputFiles[0].text+';SportsRadarScore');
const plain=x=>JSON.parse(JSON.stringify(x));
function rate(sport,options={},engine=runtime) {
  const event=h.event(sport,options),game=legacy.normalizeEvent(event,sport);
  if(options.controlled!==false) h.controlledBaseline(game);
  engine.applyLiveSnapshot(game,event.competitions[0],h.summary(event,options));
  return game;
}
for (const sport of transition.SPORTS) {
  test(`${sport}: production first live score equals pregame; no-action early clocks transfer ownership continuously`,()=>{
    for (const wp of [null,.5,.98]) for (const market of [{},{spread:20},{prices:[-450,350]}]) {
      const pre=active.normalizeEvent(h.event(sport,{state:'pre',...market}),sport);
      const game=active.normalizeEvent(h.event(sport,market),sport);
      active.enrichGame(game,h.summary(game.sourceEvent,{wp}),plain(pre));
      assert.equal(game.score,pre.score,JSON.stringify({sport,wp,market}));
      assert.equal(game.pregameBaseline.source,'observed');
      assert.equal(game.live.bonus,0);
    }
    assert.equal(rate(sport).score,53);
    assert.ok(Math.abs(rate(sport,{clock:h.early[sport]}).score-53)<=1);
    if (['NHL','NBA','NCAAB','Soccer'].includes(sport)) {
      const length={NHL:1200,NBA:720,NCAAB:1200,Soccer:0}[sport];let prior=53;
      for(let elapsed=0;elapsed<=180;elapsed+=5) {
        const sec=length-elapsed,clock=sport==='Soccer'?`${elapsed/60*60/60}`:`${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;
        if(sport==='Soccer' && elapsed%60)continue;
        const g=rate(sport,{clock});assert.ok(Math.abs(g.score-prior)<=1,`${clock}: ${prior}->${g.score}`);prior=g.score;
      }
    }
  });
  test(`${sport}: valid WP, missing/stale WP, market retention and JSON/Worker/browser parity`,()=>{
    for(const phase of [{},{clock:h.early[sport]},h.late[sport]])for(const wp of [null,.5,.99]) {
      const a=rate(sport,{...phase,wp}),b=rate(sport,{...phase,wp},browser);
      for(const key of ['score','baseScore','openingScore','factors','live','trajectoryScoring','pregameBaseline'])assert.deepEqual(plain(a[key]),plain(b[key]),key);
    }
    const pre=active.normalizeEvent(h.event(sport,{state:'pre',prices:[-450,350],spread:20}),sport);
    const g=active.normalizeEvent(h.event(sport),sport);active.enrichGame(g,null,plain(pre));
    assert.deepEqual(g.pregameBaseline.odds,pre.pregameBaseline.odds);
    assert.equal(g.openingScore,pre.score);
    const old=plain(pre);old.pregameBaseline.calibration='incompatible';
    const fresh=active.normalizeEvent(h.event(sport),sport);active.enrichGame(fresh,null,old);
    assert.equal(fresh.pregameBaseline.source,'reconstructed');
    const inconsistent=plain(pre);inconsistent.pregameBaseline.rawPregameScore+=5;
    assert.equal(runtime.preservePregameBaseline(fresh,inconsistent),false);
    const e=h.event(sport,h.late[sport]),s=h.summary(e,{wp:.99});s.header.competitions[0].status.type={state:'post',completed:true};
    const stale=legacy.normalizeEvent(e,sport);runtime.applyLiveSnapshot(stale,e.competitions[0],s);
    assert.equal(stale.live.probabilityTelemetry.probability,null);
    const liveStale=h.summary(e);liveStale.plays=[{id:'old-wp',period:{number:e.competitions[0].status.period},
      clock:{displayValue:e.competitions[0].status.displayClock},homeScore:0,awayScore:0}];
    liveStale.winprobability=[{playId:'old-wp',homeWinPercentage:.99}];
    const staleScore=legacy.normalizeEvent(e,sport);runtime.applyLiveSnapshot(staleScore,e.competitions[0],liveStale);
    assert.equal(staleScore.live.probabilityTelemetry.probability,null,'WP for an earlier score is rejected');
    const evidence=transition.competitionEvidence(g,g.sourceCompetition,.05,null);
    assert.ok(evidence.uncertainty<.6);
  });
  test(`${sport}: verified context before/after start reconciles factors and preserves the observed baseline`,()=>{
    const context=[{type:'rivalry',text:'Verified rivalry',verified:true,confidence:.9}];
    const pre=active.normalizeEvent(h.event(sport,{state:'pre'}),sport);active.applyContextsToGame(pre,context);
    assert.equal(pre.openingFactors.reduce((s,f)=>s+f.points,0),pre.rawPregameScore);
    assert.equal(pre.score,Math.min(90,runtime.clampScore(pre.rawPregameScore)));
    const live=active.normalizeEvent(h.event(sport),sport);active.enrichGame(live,null,plain(pre));
    assert.equal(live.score,pre.score);
    const unenhanced=active.normalizeEvent(h.event(sport,{state:'pre'}),sport);
    const after=active.normalizeEvent(h.event(sport),sport);active.enrichGame(after,null,plain(unenhanced));
    active.applyContextsToGame(after,context);
    assert.equal(after.openingScore,unenhanced.score);assert.ok(after.score>unenhanced.score);
    assert.equal(after.openingFactors.reduce((s,f)=>s+f.points,0),after.rawPregameScore);
    assert.equal(after.pregameBaseline.source,'observed');
  });
  test(`${sport}: D1 recovers comparable observations and rejects older-model baselines`,async t=>{
    const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync('alerts-worker/schema.sql','utf8'));
    const pre=active.normalizeEvent(h.event(sport,{state:'pre',prices:[-400,300]}),sport),now=Date.now();
    db.prepare(`INSERT INTO sports_snapshots (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .run(`${sport}:${pre.id}`,now-1000,sport,'upcoming',pre.score,'0','0','0','',JSON.stringify(pre),runtime.MODEL_VERSION);
    const env={DB:{prepare(sql){let args;return {bind(...a){args=a;return this;},async all(){return {results:db.prepare(sql).all(...args)};}};}}};
    const g=active.normalizeEvent(h.event(sport),sport);await recoverPregameBaselines(env,[g],now,null);runtime.applyLiveSnapshot(g,g.sourceCompetition,null);
    assert.equal(g.score,pre.score);assert.deepEqual(g.pregameBaseline,pre.pregameBaseline);
    const old=plain(pre);delete old.pregameBaseline;
    db.prepare('UPDATE sports_snapshots SET normalized_state=?,model_version=?').run(JSON.stringify(old),'2026-10-31.football-transition.1');
    const fresh=active.normalizeEvent(h.event(sport),sport);await recoverPregameBaselines(env,[fresh],now,null);
    assert.equal(fresh.pregameBaseline.source,'reconstructed');
  });
}

test('actual early plays/pressure retain immediate credit in every affected sport',()=>{
  const scenarios={
    NHL:{clock:'18:00',scores:[1,0],plays:[nhl.goal(0,1,1,'18:00','Goal')]},
    NBA:{clock:'10:00',scores:[3,0],plays:[{id:'1',period:{number:1},clock:{displayValue:'10:00'},homeScore:0,awayScore:3,scoringPlay:true,text:'Three point jumper'}]},
    NCAAB:{clock:'18:00',scores:[3,0],plays:[{id:'1',period:{number:1},clock:{displayValue:'18:00'},homeScore:0,awayScore:3,scoringPlay:true,text:'Three point jumper'}]},
    MLB:{scores:[4,0],plays:[{id:'1',period:{number:1,displayValue:'Top 1st'},scoringPlay:true,homeScore:0,awayScore:4,text:'Grand slam'}]},
    Soccer:{clock:'2',scores:[1,0],plays:[{id:'1',period:{number:1},clock:{displayValue:'2'},scoringPlay:true,homeScore:0,awayScore:1,text:'Goal!'}]},
    Tennis:{situation:{breakPoint:true,description:'Break point after long rally'}}
  };
  for(const [sport,options] of Object.entries(scenarios)) {
    const g=rate(sport,options),quiet=rate(sport,{clock:options.clock});
    assert.ok(g.live.bonus>0,sport);assert.ok(g.score!==quiet.score,`${sport}: ${g.score}/${quiet.score}`);
  }
});

test('period/quarter/half/inning/set boundaries have no status-only progress jump',()=>{
  for(const [sport,from,to] of [
    ['NHL',{period:1,clock:'0:00'},{period:2,clock:'20:00'}],
    ['NBA',{period:1,clock:'0:00'},{period:2,clock:'12:00'}],
    ['NCAAB',{period:1,clock:'0:00'},{period:2,clock:'20:00'}],
    ['Soccer',{period:1,clock:'45'},{period:2,clock:'45'}],
    ['MLB',{period:1,detail:'Middle 1st',situation:{outs:0}},{period:1,detail:'Bottom 1st',situation:{outs:0}}],
    ['MLB',{period:1,detail:'End 1st'},{period:2,detail:'Top 2nd'}],
    ['Tennis',{period:1,scores:[1,0],games:[[6],[4]]},{period:2,scores:[1,0],games:[[6,0],[4,0]]}]
  ])assert.ok(Math.abs(rate(sport,from).score-rate(sport,to).score)<=1,`${sport}: ${rate(sport,from).score}->${rate(sport,to).score}`);
});

test('production opening equality includes capped pregame stakes and verified context',()=>{
  for(const sport of transition.SPORTS) {
    const e=h.event(sport,{state:'pre',postseason:true});e.name='Championship Final Game 7';
    e.sportsRadarContextFactors=['rivalry','championship_rematch','milestone_chase','team_win_streak'].map(type=>({type,text:type,confidence:.9,verified:true}));
    const pre=active.normalizeEvent(e,sport);
    const liveEvent=structuredClone(e);liveEvent.competitions[0].status.type.state='in';
    const live=active.normalizeEvent(liveEvent,sport);active.enrichGame(live,null,plain(pre));
    assert.equal(live.score,pre.score,sport);
    assert.equal(live.openingFactors.reduce((sum,f)=>sum+f.points,0),live.rawPregameScore);
  }
});

test('confirmed Edmonton–Islanders valid factor basis starts at 48 after removing the unrelated +5',()=>{
  const e=h.event('NHL'),g=legacy.normalizeEvent(e,'NHL');h.controlledBaseline(g,48);
  g.pregameBaseline.factors=[{label:'Sport baseline',points:32},{label:'Schedule scarcity',points:5},
    {label:'Adjusted team quality',points:4},{label:'Both winning records',points:7}];
  runtime.applyLiveSnapshot(g,e.competitions[0],h.summary(e));
  assert.equal(g.score,48);assert.equal(g.openingScore,48);
  assert.equal(g.openingFactors.reduce((sum,f)=>sum+f.points,0),g.rawPregameScore);
});

test('NHL late allocation, goalie pull, overtime, shootout and playoff potential survive',()=>{
  for(const [name,options] of Object.entries(nhl.cases)) {
    const input=nhl.fixture(options),g=active.normalizeEvent(input.event,'NHL');active.enrichGame(g,input.summary);
    assert.ok(g.score>=1 && g.score<=99,name);
    if(/Playoff.*OT|Stanley Cup.*OT/.test(name))assert.ok(g.score>=95,`${name}: ${g.score}`);
    if(name==='Shootout')assert.ok(g.score>=90);
  }
  const tied=rate('NHL',{period:1,clock:'18:00'});assert.ok(tied.score<=54);
  const quiet=nhl.fixture({gap:1,clock:'1:00'}),pulled=nhl.fixture({gap:1,clock:'1:00',manpower:'pulled'});
  const score=i=>{const g=active.normalizeEvent(i.event,'NHL');active.enrichGame(g,i.summary);return g.score;};
  assert.ok(score(pulled)>score(quiet));
  for(const sport of transition.SPORTS) {const g=rate(sport,h.late[sport]);assert.ok(g.score>53 || sport==='Soccer',`${sport} late`);}
});

test('achievement ownership rejects the Wild streak, routine overtime recaps, AI rewording and legacy cached rows',async()=>{
  const game={id:'401892617',sport:'NHL',teams:[['Edmonton Oilers','EDM',0,'','','',null,'','22'],['New York Islanders','NYI',0,'','','',null,'','12']]};
  const article={headline:'Wild take win streak into home matchup against the Islanders',description:'Minnesota won its fifth straight.',teamIds:new Set(['30','12']),published:Date.now(),url:''};
  assert.equal(achievementMatchesGame(article,game,'team_win_streak'),false);
  assert.equal(deterministicFactor({headline:'Islanders host the Oilers after overtime win',description:'A previous game-winning goal.'}),null);
  assert.equal(achievementMatchesGame({...article,headline:'Islanders extend winning streak before Edmonton visit'},game,'team_win_streak'),true);
  assert.equal(achievementMatchesGame({...article,headline:'Islanders snap the Wild winning streak'},game,'team_win_streak'),false);
  assert.equal(achievementMatchesGame({headline:"Rantanen's overtime hat trick gives the Stars a win",teamIds:new Set(['25','1'])},
    {teams:[['Dallas Stars','DAL'],['Edmonton Oilers','EDM']]},'notable_recent_performance'),true);
  assert.equal(mergeFactors([{id:'i0',game,eventId:game.id,sport:'NHL',article}],[{id:'i0',type:'team_win_streak',text:'Islanders are on a winning streak',confidence:.99}]).length,0);
  const env={DB:{prepare(){return {bind(){return this;},async all(){return {results:[{sport:'NHL',event_id:game.id,factor_type:'team_win_streak',context_text:'Wild streak',source_title:article.headline,confidence:.9}]};}};}}};
  assert.deepEqual(await contextsForGames(env,[`NHL:${game.id}`],[game]),{});
});

test('browser from opening requires an observed compatible baseline for all sports',()=>{
  const source=fs.readFileSync('app.js','utf8').replaceAll('\r\n','\n'),start=source.indexOf('function trendFor(');
  const trend=vm.runInNewContext(source.slice(start,source.indexOf('\n}',start)+2)+';trendFor');
  for(const sport of transition.SPORTS) {
    assert.equal(trend({sport,state:'live',score:66,openingScore:53}),'');
    assert.match(trend({sport,state:'live',score:56,pregameBaseline:{source:'observed',score:53}}),/\+3 from opening/);
  }
});
