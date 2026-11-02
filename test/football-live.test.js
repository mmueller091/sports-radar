import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import * as active from '../alerts-worker/src/live-game-model.js';
import {footballScenario as scenario,developmentArticle as article} from './fixtures/football-live-scenarios.mjs';
const require=createRequire(import.meta.url),core=require('../rating-core.js'),runtime=require('../scoring/live-runtime.cjs'),football=require('../scoring/football-live.cjs');
const before=require('./helpers/football-live-before.cjs');
function run(input,previous=null,adapter=active) {
  const game=adapter.normalizeEvent(structuredClone(input.event),input.sport);
  adapter.enrichGame(game,structuredClone(input.summary),previous);
  return game;
}
test('captured November 1 provider evidence confirms the injury and observed replacement',()=>{
  const f=JSON.parse(readFileSync('test/fixtures/football-live-20261101.json')).cases.find(f=>f.eventId==='401873026');
  const game=run({sport:f.modelSport,event:f.event,summary:f.summary});
  const development=game.verifiedDevelopments.find(d=>d.subject==='Lamar Jackson');
  assert.equal(development.status,'out');assert.match(development.text,/thumb injury/);
  assert.equal(development.sourcePlayId,'401873026437');
  // This capture is later than the user's initial Huntley example: the latest
  // explicit passing play belongs to Fagnano, so the copy must evolve with it.
  assert.equal(development.replacementName,'Joe Fagnano');
  assert.match(runtime.footballLiveExplanation(game),/Lamar Jackson is out for the game.*thumb injury/);
  assert.match(runtime.footballLiveExplanation(game),/Joe Fagnano has thrown passes/);
  const missing=run({sport:f.modelSport,event:f.event,summary:null},game);
  assert.deepEqual(missing.verifiedDevelopments,game.verifiedDevelopments);
});
for (const sport of ['NFL','CFB']) {
  test(`${sport}: smooth early surprise, growing late credit, no covering-only award`,()=>{
    const early=run(scenario({sport,spread:28,period:1,clock:'12:00',away:3}));
    const mid=run(scenario({sport,spread:28,away:14}));
    const half=run(scenario({sport,spread:28,period:2,clock:'0:00',away:14}));
    const late=run(scenario({sport,spread:28,period:4,clock:'5:00',away:14}));
    assert.ok(early.upsetPoints<=3);assert.ok(mid.upsetPoints>=5);
    assert.ok(half.upsetPoints>mid.upsetPoints);assert.ok(late.upsetPoints>half.upsetPoints);
    assert.equal(run(scenario({sport,spread:35,period:2,home:14,away:0})).upsetPoints,0);
    assert.equal(run(scenario({sport,spread:35,period:1,home:14,away:0})).upsetPoints,0);
    for (const threshold of [3,7,10,14,20,28,35,40]) {
      const scores=[-.01,0,.01].map(delta=>run(scenario({sport,spread:threshold+delta,period:4,clock:'5:00',away:7})).score);
      assert.ok(Math.max(...scores)-Math.min(...scores)<=1,`${threshold}: ${scores}`);
    }
  });
  test(`${sport}: heavy favorite lead, even match, and kickoff are preserved`,()=>{
    for (const params of [{spread:35,home:28,away:0},{spread:1,home:21,away:21},{spread:14,period:1,clock:'15:00',home:0,away:0}]) {
      const s=scenario({sport,...params});
      assert.equal(run(s).score,run(s,null,before).score);
    }
  });
  test(`${sport}: news requires confirmed event-bound evidence and source`,()=>{
    const s=scenario({sport,home:14,away:13});
    for (const news of [article('Starting quarterback Alex Player might have a thumb injury'),
      {...article(),published:'2026-10-30T18:10:00Z'},
      {...article(),categories:[{type:'event',eventId:'another'}]},
      {...article(),links:{web:{href:'https://espn.com.evil.test/story'}}}]) {
      s.summary.news={articles:[news]};assert.equal(run(s).verifiedDevelopments.length,0);
    }
    s.summary.news={articles:[article()]};
    const g=run(s);assert.equal(g.verifiedDevelopments.length,1);
    assert.match(runtime.footballLiveExplanation(g),/Alex Player.*Sam Backup/);
    assert.ok(g.score>=run({...s,summary:{header:s.summary.header}}).score);
    assert.ok(g.score-run({...s,summary:{header:s.summary.header}}).score<=5);
  });
  test(`${sport}: duplicate, missing, delayed and out-of-order updates retain latest verified status`,()=>{
    const s=scenario({sport,home:14,away:13});s.summary.news={articles:[article(),article()]};
    const first=run(s),again=run(s,first);
    assert.equal(first.score,again.score);assert.equal(again.verifiedDevelopments.length,1);
    const incomplete={...s,summary:null};
    assert.equal(run(incomplete,again).verifiedDevelopments.length,1);
    const returned=structuredClone(s);returned.summary.news.articles=[article('Starting quarterback Alex Player returns to the game against Underdog','2026-11-01T18:30:00Z')];
    const latest=run(returned,first);assert.equal(latest.verifiedDevelopments[0].status,'returned');
    const delayed=run(s,latest);assert.equal(delayed.verifiedDevelopments[0].status,'returned');
    const wrong=structuredClone(s);wrong.summary.header.competitions[0].status.displayClock='14:00';
    wrong.summary.news.articles=[article('Starting quarterback Alex Player ruled out against Underdog','2026-11-01T18:40:00Z')];
    assert.equal(run(wrong,latest).verifiedDevelopments[0].status,'returned');
  });
  test(`${sport}: retained pregame line survives missing/live odds; stale lines are rejected`,()=>{
    const s=scenario({sport}),first=run(s),missing=scenario({sport,odds:false});
    assert.equal(run(missing,first).upsetPoints,first.upsetPoints);
    const stale=scenario({sport});stale.competition.odds[0].lastUpdated='2026-10-01T12:00:00Z';
    stale.summary.header.competitions=[structuredClone(stale.competition)];
    assert.equal(run(stale).upsetPoints,0);
    stale.competition.odds[0].lastUpdated='2026-11-01T18:30:00Z';
    assert.equal(football.pregameMarket(first,stale.competition),null);
    stale.competition.odds[0].isLive=true;assert.equal(football.pregameMarket(first,stale.competition),null);
  });
  test(`${sport}: specific explanation gives score/clock, possession, and singular point`,()=>{
    const s=scenario({sport,spread:1,home:14,away:13});s.competition.situation={possession:'dog',down:3,distance:1,shortDownDistanceText:'3rd & 1'};
    s.summary.header.competitions=[structuredClone(s.competition)];
    const g=run(s),text=runtime.footballLiveExplanation(g);
    assert.match(text,/Favorite leads 14–13/);assert.match(text,/Underdog has possession, 3rd & 1/);
    assert.doesNotMatch(text,/next drive|Current Tension|Generic Leverage|Down 1 points/i);
  });
}
test('CFB rank-only expectations are modest and FBS/FCS uses actual odds',()=>{
  const ranked=run(scenario({sport:'CFB',rank:3,odds:false,period:4,clock:'5:00',away:7}));
  assert.ok(ranked.upsetPoints>0);assert.ok(ranked.upsetPoints<15);
  assert.equal(run(scenario({sport:'CFB',odds:false})).upsetPoints,0);
  const regular=run(scenario({sport:'CFB',spread:35})),fcs=run(scenario({sport:'CFB',spread:35,fcs:true}));
  assert.equal(fcs.upsetPoints,regular.upsetPoints);
});
test('missing player statistics never creates an injury',()=>{
  const s=scenario();s.summary.boxscore={players:[]};assert.equal(run(s).verifiedDevelopments.length,0);
});
test('sustained surprise requires a consistent ledger and does not count polls',()=>{
  const s=scenario({period:2,clock:'3:00',away:7});
  s.summary.scoringPlays=[{id:'td',period:{number:1},clock:{displayValue:'8:00'},homeScore:0,awayScore:7}];
  const a=run(s);assert.ok(a.liveSurprise.sustained>0);assert.equal(run(s,a).score,a.score);
  s.summary.scoringPlays.push(s.summary.scoringPlays[0]);assert.equal(run(s).liveSurprise.sustained,0);
});
test('vig-free moneyline expectations and current WP are optional independent evidence',()=>{
  const s=scenario();delete s.competition.odds[0].spread;delete s.competition.odds[0].details;
  s.competition.odds[0].homeTeamOdds.moneyLine=-600;s.competition.odds[0].awayTeamOdds.moneyLine=450;
  s.summary.header.competitions=[structuredClone(s.competition)];
  const g=run(s);assert.ok(g.livePregameMarket.probability<.2);assert.ok(g.upsetPoints>0);
  s.summary.winprobability=[{homeWinPercentage:.35}];assert.ok(run(s).liveSurprise.probabilityGain>0);
});
for (const sport of ['NFL','CFB']) {
  test(`${sport}: confirmed ejection, suspension, coaching change and player return`,()=>{
    for(const text of ['Star receiver Alex Player ejected against Underdog','Star receiver Alex Player suspended against Underdog','Head coach Alex Player fired during game against Underdog','Starting quarterback Alex Player returns after missing three games with injury against Underdog']) {
      const s=scenario({sport});s.summary.news={articles:[article(text)]};assert.equal(run(s).verifiedDevelopments.length,1,text);
    }
  });
  test(`${sport}: explicit play injury uses roster identity and deduplicates news`,()=>{
    const s=scenario({sport,home:14,away:13});
    s.summary.plays=[{id:'injury',team:{id:'fav'},period:{number:2},clock:{displayValue:'13:00'},text:'Alex Player injured on the play, replaced by Sam Backup.'}];
    s.summary.boxscore={players:[{team:{id:'fav'},statistics:[{athletes:[{athlete:{displayName:'Alex Player',position:{abbreviation:'QB'}}}]}]}]};
    const g=run(s);assert.equal(g.verifiedDevelopments.length,1);assert.equal(g.verifiedDevelopments[0].sourcePlayId,'injury');
    s.summary.news={articles:[article()]};const withNews=run(s,g);assert.equal(withNews.verifiedDevelopments.length,1);
    const later=scenario({sport,home:42,away:0,period:4,clock:'1:00'});const faded=run(later,g);
    assert.equal(faded.factors.some(f=>f.label==='Verified live development'),false);
  });
  test(`${sport}: verified live injury suppresses stale return context without rewriting opening`,()=>{
    const s=scenario({sport,home:14,away:13}),g=active.normalizeEvent(s.event,sport);
    active.applyContextsToGame(g,[{type:'star_injury_return',text:'Starting quarterback Alex Player returns after injury',verified:true,confidence:.9}]);
    const opening=g.openingScore;
    s.summary.news={articles:[article()]};active.enrichGame(g,s.summary);
    assert.ok(g.suppressedContextTypes.includes('star_injury_return'));
    assert.equal(g.openingScore,opening);
    assert.doesNotMatch(runtime.footballLiveExplanation(g),/returns after injury/);
  });
}
