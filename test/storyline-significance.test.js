import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent,applyContextsToGame} from '../alerts-worker/src/live-game-model.js';
import {nflPregameContext} from '../alerts-worker/src/nfl-pregame.js';
import {currentAlertGame} from '../alerts-worker/src/alert-delivery.js';
const require=createRequire(import.meta.url),core=require('../scoring/live-runtime.cjs');
const data=JSON.parse(fs.readFileSync('test/fixtures/storyline-significance-20261104.json'));
const now=Date.parse(data.capturedAt);class FixedDate extends Date{static now(){return now;}}
const source=fs.readFileSync('app.js','utf8');
const web=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+source.slice(source.indexOf('function safeStoryUrl('),source.indexOf('const DETAIL_TAB_CONFIG ='))+';({explainRating,upcomingLinkedStories,storylineDetails})',{Date:FixedDate,URL,safeText:String});
function target(){const g=normalizeEvent(structuredClone(data.event),'NFL');nflPregameContext(g,data.summary,[],[],now);applyContextsToGame(g,structuredClone(data.contexts),now);g.editorialStorylines=data.game.editorialStorylines;return g;}
test('frozen 44 becomes 40 by removing only generic starter credit, with no injury penalty',()=>{
 const g=target();assert.equal(data.game.score,44);assert.equal(g.score,40);assert.equal(g.rawPregameScore,39.99);
 assert.equal(data.game.rawPregameScore-g.rawPregameScore,4);
 assert.deepEqual(g.factors,data.game.factors.filter(f=>f.contextType!=='confirmed_key_starters'));
 assert.equal(g.qualitativeContexts[0].scoringEligible,false);
});
test('neutral forced start reaches the outlook; duplicate reports retain every source',()=>{
 const g=target(),before=JSON.stringify(g),text=web.explainRating(g),stories=web.upcomingLinkedStories(g),html=web.storylineDetails(g);
 assert.match(text,/turn to Joe Fagnano.*injuries to Lamar Jackson and Tyler Huntley/);
 assert.match(text,/Jaguars.*heavy favorites by 10 points/);
 assert.doesNotMatch(text,/We'll|\[Fagnano\]|\+4|bonus|modifier|more exciting|injured reserve/);
 assert.equal(stories.length,1);assert.equal(stories[0].sources.length,3);
 for(const url of [data.game.qualitativeContexts[0].sourceUrl,data.game.editorialStorylines[0].sourceUrl,data.contexts[0].contextEvidence.sourceUrl])assert.ok(html.includes(url));
 assert.equal((html.match(/<li>/g)||[]).length,1);assert.equal(JSON.stringify(g),before);
});
const competition={competitors:[{homeAway:'away',team:{id:'a'}},{homeAway:'home',team:{id:'b'}}]};
for(const sport of ['NFL','CFB','NHL','MLB','NBA','NCAAB']){
 const factors=items=>core.pregameContextFactors({sportsRadarContextFactors:items},competition,{sport,calibratedPregame:['NFL','CFB'].includes(sport)});
 test(`${sport}: ordinary and forced starters and unverified claims earn nothing`,()=>{
  for(const text of ['Confirmed starting lineup','An undrafted rookie will start at quarterback','The confirmed goalie will start','The announced pitcher will start'])assert.deepEqual(factors([{type:'confirmed_key_starters',verified:true,confidence:1,text}]),[]);
  for(const verified of [undefined,false])assert.deepEqual(factors([{type:'rivalry',verified,text:'Historic rivalry'}]),[]);
  assert.deepEqual(factors([{type:'season_debut',verified:true,text:'First-round rookie makes his season debut as an emergency replacement for an injured MVP'}]),[]);
  assert.deepEqual(factors([{type:'coach_return',verified:true,text:'The coach will return to practice'}]),[]);
  assert.deepEqual(factors([{type:'major_trade_storyline',verified:true,text:'All-Star Alex Jones was traded away'}]),[]);
  assert.deepEqual(factors([{type:'star_hot_streak',verified:true,text:'All-Star Alex Jones has struggled in his last 8 games'}]),[]);
 });
 test(`${sport}: justified star returns and distinct first reunions retain positive treatment`,()=>{
  const injuryEvidence={importance:'star',affectedTeamId:'a',playerSignificance:{verified:true,playerId:'42',sourceUrl:'https://league.test/honors',tier:'established-star',fact:'All-Pro selection'}};
  assert.ok(factors([{type:'star_injury_return',verified:true,text:'All-Pro Alex Jones returns from injury',injuryEvidence}])[0].points>0);
  assert.ok(factors([{type:'coach_return',verified:true,text:'Coach Alex Jones makes his first return against his former team'}])[0].points>0);
 });
 test(`${sport}: an updated market prevents an additional star-absence penalty`,()=>{
  const item={type:'star_absence',verified:true,text:'All-Pro Alex Jones ruled out',injuryEvidence:{importance:'star',affectedTeamId:'a',reportedAt:'2026-11-04T10:00Z'}};
  const c={...competition,odds:[{details:'AWAY +10',spread:10,lastUpdated:'2026-11-04T11:00Z',awayTeamOdds:{underdog:true}}]};
  assert.deepEqual(core.pregameContextFactors({sportsRadarContextFactors:[item]},c,{sport,calibratedPregame:true}),[]);
 });
}
test('different events sharing a category and source page remain separate',()=>{
 const g=target(),a=g.qualitativeContexts[0],b={...a,eventKey:'NFL:'+g.id+':30:alex smith:confirmed_key_starters',text:'Alex Smith will start',publicText:'Jacksonville Jaguars will start Alex Smith.',evidence:{...a.evidence,owner:'30',subject:'alex smith'}};
 g.qualitativeContexts.push(b);assert.equal(web.upcomingLinkedStories(g).length,2);
});
test('production browser and Worker agree on the frozen corrected game',()=>{
 const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore',{Date:FixedDate,URL,Intl});
 const g=target(),b=structuredClone(g);b.sourceEvent=structuredClone(g.sourceEvent);b.sourceCompetition=structuredClone(g.sourceCompetition);
 browser.applyLiveSnapshot(b,b.sourceCompetition,null);
 assert.equal(browser.MODEL_VERSION,core.MODEL_VERSION);assert.equal(b.score,g.score);assert.deepEqual(JSON.parse(JSON.stringify(b.factors)),g.factors);
});
test('pregame score changes cannot enter live notification crossing evaluation',()=>{
 const g=target();for(const score of [40,44,85,99])assert.equal(Boolean(currentAlertGame({modelVersion:core.MODEL_VERSION,updatedAt:data.capturedAt},{...g,score},now)),false);
});
test('an observed historical opening is retained after kickoff',()=>{
 const live={...target(),state:'live'};delete live.pregameBaseline;
 assert.equal(core.preservePregameBaseline(live,data.game),true);
 assert.equal(live.pregameBaseline.score,44);
 assert.deepEqual(live.pregameBaseline,data.game.pregameBaseline);
});
