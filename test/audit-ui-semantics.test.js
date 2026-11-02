import test from 'node:test';
import assert from 'node:assert/strict';
import {browser,fixture} from './helpers/overtime-terminology.mjs';
const ui=browser();
function liveGame(){const d=fixture('401873031');const g=structuredClone(d.sportsRadarGame);g.state='live';g.sport='CFB';g.score=34;g.liveRawStatus={period:4,displayClock:'0:19',type:{state:'in'}};g.gameQualitySoFar={score:80,provisional:true,basis:'current-score-and-observed-history'};return {g,d};}
test('C1 live detail keeps watch-now recommendation without diagnostic quality telemetry',()=>{
 const {g,d}=liveGame();ui.renderDetailContent(g,d);const html=ui.detail.innerHTML;
 assert.match(html,/Watch now/);assert.doesNotMatch(html,/Game quality so far|provisional|observation/i);
 assert.match(ui.gameCard(g),/watch now rating 34/);assert.equal(g.score,34);
});
test('F2 diagnostics stay out of public copy, and verified NHL comeback remains',()=>{
 const {g}=liveGame();g.sport='NHL';g.gameQualitySoFar=undefined;g.teams[0][2]='3';g.teams[1][2]='3';g.factors=[];g.scoringPartial=true;g.evidenceQuality='partial';g.evidenceReasons=['ledger-behind-scoreboard'];
 assert.doesNotMatch(ui.explainRating(g),/history.*catching up|manpower reports conflict/i);
 g.scoringPartial=false;g.evidenceQuality='complete';g.factors=[{label:'Erased a multi-goal deficit',points:8}];
 assert.match(ui.explainRating(g),/erased a multi-goal deficit/i);
});
test('Tennis and unresolved manpower limitations do not expose diagnostics or invent evidence',()=>{
 const {g,d}=liveGame();g.sport='Tennis';delete g.gameQualitySoFar;
 g.tennisCoverage={reason:'Point-by-point coverage is unavailable.'};ui.renderDetailContent(g,d);
 assert.doesNotMatch(ui.detail.innerHTML,/Point-by-point coverage is unavailable/);
 g.sport='NHL';delete g.tennisCoverage;g.manpowerQuality={state:'conflict'};g.live={reasons:['Home power play'],note:'Home power play'};
 assert.doesNotMatch(ui.explainRating(g),/manpower.*conflict|Home power play/i);
});
test('unfinished non-live enrichment remains internal on cards and Game Center',()=>{
 for(const state of ['upcoming','completed'])for(const pending of ['enrichmentPending','summaryValidationPending']){
  const {g,d}=liveGame();g.state=state;g[pending]=true;g.scoringPartial=true;delete g.gameQualitySoFar;
  assert.doesNotMatch(ui.explainRating(g),/details are still loading.*provisional/i);
  assert.doesNotMatch(ui.gameCard(g),/details are still loading.*provisional/i);
  ui.renderDetailContent(g,d);assert.doesNotMatch(ui.detail.innerHTML,/details are still loading.*provisional/i);
  assert.doesNotMatch(ui.explainRating(g),/migration|summary-enrichment/i);
 }
});
