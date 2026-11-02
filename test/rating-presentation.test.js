import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {browser,fixture} from './helpers/overtime-terminology.mjs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replaceAll('\r\n','\n');
const context=vm.createContext({});
for(const name of ['scoreHueFor','scoreHeatClass','trendFor']) {
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}

test('absolute ratings retain a continuous cool-to-red heatmap',()=>{
  const expected=new Map([[35,190],[60,110],[78,47],[90,22],[95,11],[99,2]]);
  for(const [score,hue] of expected) assert.equal(context.scoreHueFor(score),hue);
  for(let score=2;score<=99;score++) {
    assert.ok(context.scoreHueFor(score)<=context.scoreHueFor(score-1),`hue at ${score}`);
  }
  assert.equal(context.scoreHeatClass(90),'very-hot');
  assert.equal(context.scoreHeatClass(95),'extreme');
});

test('movement uses only the observed opening and agrees with its arrow',()=>{
  const base={state:'live',score:78,pregameBaseline:{source:'observed',score:60}};
  assert.match(context.trendFor(base),/↗&#xfe0e; \+18 from opening/);
  assert.match(context.trendFor({...base,score:48}),/↘&#xfe0e; -12 from opening/);
  assert.match(context.trendFor({...base,score:61}),/→&#xfe0e; \+1 from opening/);
  assert.match(context.trendFor({...base,score:62}),/→&#xfe0e; \+2 from opening/);
  assert.match(context.trendFor({...base,score:58}),/→&#xfe0e; -2 from opening/);
  assert.match(context.trendFor({...base,score:60}),/→&#xfe0e; 0 from opening/);
  assert.match(context.trendFor({...base,state:'completed'}),/\+18 from opening/);
  assert.equal(context.trendFor({...base,state:'upcoming'}),'');
  assert.equal(context.trendFor({...base,pregameBaseline:{source:'reconstructed',score:60}}),'');
  assert.equal(context.trendFor({...base,pregameBaseline:{source:'observed'}}),'');
  assert.equal(context.trendFor({...base,pregameBaseline:undefined,openingScore:60}),'');
  assert.equal(context.trendFor({...base,score:undefined}),'');
});

test('cards and Game Center use the same absolute hue and verified movement',()=>{
  const ui=browser();
  const detail=fixture('401873031');
  const game=structuredClone(detail.sportsRadarGame);
  Object.assign(game,{state:'live',score:95,openingScore:35,pregameBaseline:{source:'observed',score:99}});
  const card=ui.gameCard(game);
  ui.renderDetailContent(game,detail);
  assert.match(card,/class="excitement" style="--score-hue:11;"/);
  assert.match(card,/class="score-circle extreme"/);
  assert.match(card,/↘&#xfe0e; -4 from opening/);
  assert.doesNotMatch(card,/rating-tier|>Low<|>Building<|>High<|>Peak</);
  assert.match(ui.detail.innerHTML,/class="detail-excitement-score extreme" style="--score-hue:11;"/);
  assert.match(ui.detail.innerHTML,/class="detail-radar" style="--score-hue:11;"/);
  assert.match(ui.detail.innerHTML,/↘&#xfe0e; -4 from opening/);
  assert.match(ui.detail.innerHTML,/Opening 99 · Current 95/);
});

test('pregame cards and Game Center show VS while started games keep actual scores',()=>{
  const ui=browser();
  const game={...fixture('401873031').sportsRadarGame,state:'upcoming',teams:[['Home','H','0'],['Away','A','0']]};
  const card=ui.gameCard(game);
  ui.renderDetailContent(game,null);
  assert.match(card,/class="pregame-versus">VS<\/span>/);
  assert.doesNotMatch(card,/class="team-score">0<\/b>/);
  assert.match(ui.detail.innerHTML,/class="pregame-versus">VS<\/span>/);
  assert.doesNotMatch(ui.detail.innerHTML,/<b>0<\/b>/);
  const started={...game,state:'live'};
  assert.match(ui.gameCard(started),/class="team-score">0<\/b>/);
  ui.renderDetailContent(started,null);
  assert.match(ui.detail.innerHTML,/<b>0<\/b>/);
});

test('a sole Overview section renders without tab controls',()=>{
  const start=source.indexOf('function detailTabsMarkup(');
  const end=source.indexOf('\n}',start)+2;
  const tabs=vm.createContext({detailTabSections:()=>[{id:'overview',label:'Overview',content:'<section>Summary</section>'}],safeText:String,labelForSport:String});
  vm.runInContext("let activeDetailTab = 'overview';\n"+source.slice(start,end),tabs);
  assert.equal(tabs.detailTabsMarkup({sport:'Tennis',id:'one'},null),'<section>Summary</section>');
  tabs.detailTabSections=()=>[{id:'overview',label:'Overview',content:'<section>Summary</section>'},{id:'plays',label:'Plays',content:'<section>Plays</section>'}];
  assert.match(tabs.detailTabsMarkup({sport:'NFL',id:'two'},null),/role="tablist"/);
});
