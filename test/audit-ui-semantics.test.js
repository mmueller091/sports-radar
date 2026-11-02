import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,fixture} from './helpers/overtime-terminology.mjs';
const ui=browser();
function liveGame(){const d=fixture('401873031');const g=structuredClone(d.sportsRadarGame);g.state='live';g.sport='CFB';g.score=34;g.liveRawStatus={period:4,displayClock:'0:19',type:{state:'in'}};g.gameQualitySoFar={score:80,provisional:true,basis:'current-score-and-observed-history'};return {g,d};}
test('C1 live detail separates provisional quality from watch-now recommendation and accessible card',()=>{
 const {g,d}=liveGame();ui.renderDetailContent(g,d);const html=ui.detail.innerHTML;
 assert.match(html,/Watch now/);assert.match(html,/Game quality so far/);assert.match(html,/80.*provisional/i);
 assert.match(ui.gameCard(g),/watch now rating 34/);assert.equal(g.score,34);
});
test('F2 lagging evidence is explained, and recovered NHL comeback is described when present',()=>{
 const {g}=liveGame();g.sport='NHL';g.gameQualitySoFar=undefined;g.teams[0][2]='3';g.teams[1][2]='3';g.factors=[];g.scoringPartial=true;g.evidenceQuality='partial';g.evidenceReasons=['ledger-behind-scoreboard'];
 assert.match(ui.explainRating(g),/history.*catching up/i);
 g.scoringPartial=false;g.evidenceQuality='complete';g.factors=[{label:'Erased a multi-goal deficit',points:8}];
 assert.match(ui.explainRating(g),/erased a multi-goal deficit/i);
});
test('Tennis and unresolved manpower limitations are visible without inventing evidence',()=>{
 const {g,d}=liveGame();g.sport='Tennis';delete g.gameQualitySoFar;
 g.tennisCoverage={reason:'Point-by-point coverage is unavailable.'};ui.renderDetailContent(g,d);
 assert.match(ui.detail.innerHTML,/Point-by-point coverage is unavailable/);
 g.sport='NHL';delete g.tennisCoverage;g.manpowerQuality={state:'conflict'};g.live={reasons:['Home power play'],note:'Home power play'};
 assert.match(ui.explainRating(g),/manpower.*conflict/i);assert.doesNotMatch(ui.explainRating(g),/Home power play/);
});
