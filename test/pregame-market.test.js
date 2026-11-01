import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import {loadFixtures} from '../calibration/helpers.mjs';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
const require=createRequire(import.meta.url),runtime=require('../scoring/live-runtime.cjs'),market=require('../scoring/football-market.cjs'),live=require('../scoring/football-live.cjs');
const before=require('./helpers/pregame-market-before.cjs');
const NOW=Date.parse('2026-11-01T18:00:00Z'),DAY=86400000;
export function fixture(sport='NFL',days=7,spread=3,age=3600000) {
  const odds={details:`FAV -${spread}`,spread:-spread,overUnder:52,lastUpdated:new Date(NOW-age).toISOString(),provider:{name:'test'},homeTeamOdds:{favorite:true},awayTeamOdds:{underdog:true}};
  const competition={status:{type:{state:'pre'}},competitors:[
    {homeAway:'away',team:{id:'a',displayName:'Away',abbreviation:'DOG'},records:[{summary:'4-2'}],score:'0'},
    {homeAway:'home',team:{id:'h',displayName:'Home',abbreviation:'FAV'},records:[{summary:'4-2'}],score:'0'}],odds:[odds]};
  const event={id:'odds-test',date:new Date(NOW+days*DAY).toISOString(),season:{year:2026,type:2},competitions:[competition]};
  return {sport,event,competition,odds};
}
export function evaluate(f,previous=null,now=NOW,summary=null) {
  const game=active.normalizeEvent(structuredClone(f.event),f.sport);
  active.preserveFootballPregameMarket(game,previous,now);
  if(summary)active.enrichGame(game,summary,previous);
  return game;
}
for(const sport of ['NFL','CFB']) {
  test(`${sport}: fresh early markets apply the same spread and total at 1, 4, 7 and 14 days`,()=>{
    const close=[],wide=[];
    for(const days of [1,4,7,14]) {
      const f=fixture(sport,days),g=evaluate(f);close.push(g.score);
      assert.equal(g.line.spread,'FAV -3');assert.equal(g.line.total,52);
      assert.ok(g.factors.some(f=>/spread/i.test(f.label)&&f.points>0));
      assert.ok(g.pregameBaseline.odds.length);
      if(sport==='NFL')assert.ok(g.factors.some(f=>f.label==='Expected scoring potential'&&f.points>0));
      assert.ok(live.pregameMarket(g,f.competition));
      const w=evaluate(fixture(sport,days,sport==='NFL'?9.5:35));wide.push(w.score);
      assert.ok(w.factors.some(f=>/mismatch/i.test(f.label)&&f.points<0));
    }
    assert.equal(new Set(close).size,1);assert.equal(new Set(wide).size,1);assert.ok(close[0]>wide[0]);
  });
  test(`${sport}: stale quotes are aged from now, including games 1, 4, 7 and 14 days away`,()=>{
    for(const days of [1,4,7,14])for(const age of [48*3600000+1,7*DAY]) {
      const g=evaluate(fixture(sport,days,3,age));
      assert.equal(g.line,null);assert.equal(g.pregameBaseline.odds.length,0);
      assert.equal(g.factors.some(f=>/spread|scoring potential|scoring upside/i.test(f.label)),false);
    }
    assert.ok(evaluate(fixture(sport,14,3,48*3600000)).line);
  });
  test(`${sport}: live, post-kickoff, future and malformed timestamps cannot supply upcoming lines`,()=>{
    for(const mutate of [o=>o.isLive=true,o=>o.live=true,o=>o.type={name:'in-play'},
      o=>o.lastUpdated=new Date(NOW+15*DAY).toISOString(),o=>o.lastUpdated=new Date(NOW+DAY).toISOString(),o=>o.lastUpdated='invalid']) {
      const f=fixture(sport);mutate(f.odds);const g=evaluate(f);
      assert.equal(g.line,null);assert.equal(g.pregameBaseline.odds.length,0);
    }
  });
  test(`${sport}: untimestamped provider markets are accepted and missing fields remain missing`,()=>{
    const f=fixture(sport,14);delete f.odds.lastUpdated;assert.ok(evaluate(f).line);
    f.competition.odds=[];const g=evaluate(f);assert.equal(g.line,null);assert.equal(g.pregameMarketQuote,null);
  });
  test(`${sport}: incomplete updates retain the exact market; repeated refreshes do not renew stale observations`,()=>{
    const f=fixture(sport,14);delete f.odds.lastUpdated;
    const prior=evaluate(f),missing=structuredClone(f);missing.competition=missing.event.competitions[0];missing.competition.odds=[];
    const g=evaluate(missing,prior,NOW+DAY);
    assert.equal(g.score,prior.score);assert.deepEqual(g.line,prior.line);
    assert.equal(g.pregameMarketQuote.observedAt,prior.pregameMarketQuote.observedAt);
    const expired=evaluate(missing,g,NOW+3*DAY);
    assert.equal(expired.line,null);assert.equal(expired.pregameBaseline.odds.length,0);
    assert.equal('marketAsOf' in JSON.parse(JSON.stringify(g)),false);
  });
  test(`${sport}: older displayed lines restore matching scoring and reject unrelated events`,()=>{
    const f=fixture(sport),prior=evaluate(f);delete prior.pregameMarketQuote;
    f.competition.odds=[];const g=evaluate(f,prior);
    assert.deepEqual(g.line,prior.line);assert.equal(g.score,prior.score);
    assert.equal(g.pregameMarketQuote.source,'retained displayed market');
    assert.equal(evaluate(f,{...prior,id:'wrong'}).line,null);
  });
  test(`${sport}: ongoing untimestamped provider observations renew eligibility only when actually present`,()=>{
    const f=fixture(sport,14);delete f.odds.lastUpdated;
    const first=evaluate(f),weekLater=evaluate(f,first,NOW+7*DAY);
    assert.ok(weekLater.line);assert.equal(weekLater.pregameMarketQuote.source,'provider');
    const missing=structuredClone(f);missing.event.competitions[0].odds=[];
    const g=active.normalizeEvent(missing.event,sport);
    active.preserveFootballPregameMarket(g,JSON.parse(JSON.stringify(weekLater)),NOW+8*DAY,NOW+7*DAY);
    assert.ok(g.line);assert.equal(g.pregameMarketQuote.observedAt,NOW+7*DAY);
    const expired=evaluate(missing,g,NOW+10*DAY);assert.equal(expired.line,null);
  });
  test(`${sport}: empty pickcenter does not hide a valid summary odds market`,()=>{
    const f=fixture(sport),raw=f.odds;f.competition.odds=[];
    const summary={header:{competitions:[structuredClone(f.competition)]},pickcenter:[],odds:[raw]};
    const g=evaluate(f,null,NOW,summary);assert.equal(g.line.spread,'FAV -3');assert.equal(g.pregameBaseline.odds.length,1);
  });
  test(`${sport}: future live-expectation context follows eligible pregame quotes and drops expired odds`,()=>{
    const f=fixture(sport,14,14),g=evaluate(f);
    active.preserveFootballContext(g);assert.equal(g.livePregameMarket.spread,14);
    const revised=fixture(sport,14,7),next=evaluate(revised,g);
    active.preserveFootballContext(next,g);assert.equal(next.livePregameMarket.spread,7);
    const missing=structuredClone(revised);missing.event.competitions[0].odds=[];
    const expired=evaluate(missing,next,NOW+3*DAY);active.preserveFootballContext(expired,next);
    assert.equal(expired.livePregameMarket,undefined);assert.equal(expired.line,null);
  });
}
test('all archived live/completed games and unrelated sports retain exact ratings and factors',()=>{
  for(const f of loadFixtures()) {
    const a=before.normalizeEvent(structuredClone(f.event),f.modelSport),b=active.normalizeEvent(structuredClone(f.event),f.modelSport);
    before.enrichGame(a,structuredClone(f.summary));active.enrichGame(b,structuredClone(f.summary));
    if(['NFL','CFB'].includes(f.modelSport)&&b.state==='upcoming')continue;
    assert.equal(b.score,a.score,String(f.eventId));assert.deepEqual(b.factors,a.factors,String(f.eventId));
    assert.deepEqual(b.live,a.live,String(f.eventId));assert.equal(b.upsetPoints,a.upsetPoints,String(f.eventId));
  }
});
test('browser and Worker share the same eligibility, market inputs and upcoming ratings',()=>{
  const {buildSync}=require('../alerts-worker/node_modules/esbuild');
  const code=buildSync({entryPoints:['scoring/browser-entry.cjs'],bundle:true,write:false,platform:'browser',format:'iife'}).outputFiles[0].text;
  const browser=vm.runInNewContext(code+';SportsRadarScore');
  assert.equal(browser.MODEL_VERSION,runtime.MODEL_VERSION);
  for(const sport of ['NFL','CFB'])for(const days of [1,4,7,14])for(const age of [3600000,49*3600000]) {
    const f=fixture(sport,days,3,age),g=evaluate(f);
    const bg={...structuredClone(g),sourceEvent:structuredClone(f.event),sourceCompetition:structuredClone(f.competition),marketAsOf:NOW};
    browser.applyLiveSnapshot(bg,bg.sourceCompetition,null);
    assert.equal(bg.score,g.score);assert.deepEqual(JSON.parse(JSON.stringify(bg.factors)),g.factors);
    assert.deepEqual(JSON.parse(JSON.stringify(bg.line)),g.line);
  }
});
test('captured NFL omissions recover market modifiers while Bears–Seahawks remains unchanged',()=>{
  const input=JSON.parse(fs.readFileSync('test/fixtures/pregame-market-20261101.json')),now=Date.parse(input.capturedAt);
  const opposition=[...new Map(input.cases.flatMap(f=>f.summary.standings?.groups||[]).flatMap(g=>g.standings?.entries||[]).map(t=>[String(t.id),t])).values()];
  const expected={'401873036':62,'401873037':60,'401873038':53,'401873045':40};
  for(const f of input.cases) {
    const game=active.normalizeEvent(structuredClone(f.event),f.sport);
    active.preserveFootballPregameMarket(game,f.previous,now);
    if(Date.parse(game.startTime)-now<=42*3600000)nflPregameContext(game,f.summary,[],opposition,now);
    active.applyContextsToGame(game,f.previous.qualitativeContexts||[]);
    active.enrichGame(game,structuredClone(f.summary),f.previous);
    assert.deepEqual(game.line,f.previous.line);assert.equal(game.score,expected[game.id]);
    assert.equal(game.score,game.pregameBaseline.score);assert.deepEqual(game.factors,game.pregameBaseline.factors);
    const spread=game.factors.find(f=>/spread/i.test(f.label));assert.ok(spread);
    assert.equal(spread.points<0,game.id==='401873045');
  }
});
