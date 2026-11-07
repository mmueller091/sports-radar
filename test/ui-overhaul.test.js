import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {browser} from './helpers/overtime-terminology.mjs';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
function context(names,extra={}) {
  const ctx = vm.createContext({safeText:value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;'),...extra});
  for (const name of names) {
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0,name);
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
  }
  return ctx;
}

test('trend SVG preserves verified opening deltas and all existing uncertainty guards',()=>{
  const ctx = context(['trendFor']);
  for (const [score,label,value,path] of [[83,'Rising','+18','M3 13'],[53,'Falling','-12','M3 3'],[65,'Steady','0','M2 8']]) {
    const game = {state:'live',score,pregameBaseline:{source:'observed',score:65}};
    const before = structuredClone(game),html=ctx.trendFor(game);
    assert.match(html,new RegExp(`aria-label="${label}`));
    assert.ok(html.includes(`${value} from opening`));
    assert.ok(html.includes(`<path d="${path}`));
    assert.doesNotMatch(html,/[↗↘→]/);
    assert.deepEqual(game,before);
    for (const extra of [{state:'upcoming'},{timingUncertain:true},{scoringPartial:true},{pregameBaseline:{source:'estimated',score:65}},{score:null}]) assert.equal(ctx.trendFor({...game,...extra}),'');
  }
});

test('PP is team-specific, expires with verified note, and suppresses stale/conflicting evidence',()=>{
  const ctx=context(['nhlPowerPlayMarkup']);
  const home=['Vancouver Canucks','VAN'],away=['Seattle Kraken','SEA'];
  const game={sport:'NHL',state:'live',live:{phase:'2nd',note:'Vancouver Canucks power play'},manpowerQuality:{state:'consistent'}};
  assert.match(ctx.nhlPowerPlayMarkup(game,home),/team-power-play.*>PP<\/span>/);
  assert.equal(ctx.nhlPowerPlayMarkup(game,away),'');
  assert.doesNotMatch(ctx.nhlPowerPlayMarkup(game,home),/\d:\d\d|\d-on-\d/,'no timer/strength is fabricated');
  const trailing=['Vancouver Canucks','VAN',1,'','', '',null,'Canucks','23'];
  const leading=['Seattle Kraken','SEA',2,'','', '',null,'Kraken','24'];
  const structured={...game,teams:[trailing,leading],live:{phase:'3rd',note:'Trailing-team power play',sportImpact:{manpower:{powerPlay:true}}}};
  assert.match(ctx.nhlPowerPlayMarkup(structured,trailing),/team-power-play.*>PP<\/span>/);
  assert.equal(ctx.nhlPowerPlayMarkup(structured,leading),'');
  assert.equal(ctx.nhlPowerPlayMarkup({...structured,live:{...structured.live,sportImpact:{manpower:{powerPlay:false}}}},trailing),'');
  assert.equal(ctx.nhlPowerPlayMarkup({...structured,manpowerQuality:{state:'unknown'}},trailing),'');
  assert.equal(ctx.nhlPowerPlayMarkup({...structured,manpowerQuality:{state:'conflict'}},trailing),'');
  for (const extra of [{state:'completed'},{state:'upcoming'},{timingUncertain:true},{staleEnrichment:true},{summaryValidationPending:true},{manpowerQuality:{state:'conflict'}},{manpowerQuality:{state:'unknown'}},{live:{phase:'Intermission',note:game.live.note}},{live:{note:'Even strength'}},{live:{note:'Vancouver Canucks extra attacker'}}]) assert.equal(ctx.nhlPowerPlayMarkup({...game,...extra},home),'');
});

test('search retains both authentic logo sources, canonical score colors, and provisional labeling',()=>{
  const ctx=context(['teamLogoWithFallback','scoreHueFor','scoreHeatClass','globalSearchGameMarkup'],{teamLogoUrl:()=>'',globalSearchGameMeta:()=> 'NHL live'});
  const game={id:'game',sport:'NHL',state:'live',score:83,scoringPartial:true,teams:[['Dark Team','D',2,'','dark.svg'],['Light Team','L',1,'','light.png']]};
  const before=structuredClone(game),html=ctx.globalSearchGameMarkup(game);
  assert.match(html,/src="dark.svg"/);assert.match(html,/src="light.png"/);
  assert.ok(html.includes(`--score-hue:${ctx.scoreHueFor(83)}`));
  assert.ok(html.includes(`class="${ctx.scoreHeatClass(83)}"`));
  assert.match(html,/Provisional/);assert.match(html,/data-search-game-id="game"/);
  assert.deepEqual(game,before);
});

test('Last & Next does not repeat the live game in Last when schedule classifications overlap',()=>{
  const team={id:'1',sport:'CFB'};
  const live={id:'live',state:'live',startTime:'2026-11-03T20:00:00Z'};
  const final={id:'final',state:'completed',startTime:'2026-10-27T20:00:00Z'};
  const future={id:'future',state:'upcoming',startTime:'2026-11-10T20:00:00Z'};
  const ctx=context(['teamSpotlightRows'],{
    globalSearchTeamGames:()=>[live,future],compareGames:()=>0,
    compareTeamGameTimes:(a,b)=>Date.parse(a.startTime)-Date.parse(b.startTime),
    teamScheduleFromCanonical:game=>game,teamScheduleView:row=>row,canonicalTeamGame:row=>row
  });
  const data={schedule:[live,final,future],spotlights:{last:{gameId:'live'},next:{gameId:'live'}}};
  const before=structuredClone(data),result=ctx.teamSpotlightRows(team,data);
  assert.equal(result.last.row.id,'final');assert.equal(result.next.row.id,'live');
  assert.deepEqual(data,before);
});

test('Game Center puts the untouched timeline in Overview, allowing immediate access to other tabs',()=>{
  const ctx=context(['detailTabSections'],{
    DETAIL_TAB_CONFIG:{NHL:[['overview','Overview'],['team-stats','Team stats']]},
    renderExcitementTimeline:()=>'<section data-timeline>Verified history</section>',
    storylineDetails:()=>'',detailScoring:()=>'',detailLeaders:()=>'',detailPlayerBrowser:()=>'',
    detailDrives:()=>'',detailMlbPlayerStats:()=>'',detailStats:()=>'<table>Team stats</table>',detailNhlAdvanced:()=>'',
    detailPlayerStats:()=>'',detailNhlGoalies:()=>'',basketballBoxScoreMarkup:()=>'',detailPlays:()=>''
  });
  const tabs=ctx.detailTabSections({sport:'NHL',state:'live'},{});
  assert.equal(tabs.length,2);assert.match(tabs[0].content,/data-timeline/);assert.doesNotMatch(tabs[1].content,/data-timeline/);
  const render=source.slice(source.indexOf('function renderDetailContent('),source.indexOf('async function fetchGameSummary('));
  assert.doesNotMatch(render,/renderExcitementTimeline\(game,summary\)/,'no duplicate timeline ahead of the tabs');
});

test('Game Center preserves verified football and baseball situations without placeholders',()=>{
  const ui=browser();
  const base={id:'situation',state:'live',sport:'NFL',score:83,teams:[['Away','A','24'],['Home','H','21']],live:{phase:'4th'},liveRawStatus:{period:4,displayClock:'2:14'}};
  ui.renderDetailContent({...base,footballSituation:{downAndDistance:'3rd & 4',fieldPosition:'HOME 28'}},null);
  assert.match(ui.detail.innerHTML,/detail-situation.*3rd &amp; 4.*HOME 28/);
  ui.renderDetailContent({...base,sport:'MLB',baseballSituation:{bases:{first:true,third:true},outs:2,count:'3-2'}},null);
  assert.match(ui.detail.innerHTML,/detail-situation.*Runners on first and third.*2 outs.*Count 3-2/);
  ui.renderDetailContent(base,null);
  assert.doesNotMatch(ui.detail.innerHTML,/detail-situation/);
  ui.renderDetailContent({...base,timingUncertain:true,footballSituation:{downAndDistance:'3rd & 4'}},null);
  assert.doesNotMatch(ui.detail.innerHTML,/detail-situation/);
});

test('break states retain their phase without a misleading zero game clock and NCAAM is the public label',()=>{
  const ui=browser();
  for(const [sport,status] of [['NCAAB','Halftime'],['NHL','2nd Intermission']]) {
    const game={id:'break',sport,state:'live',status,score:65,teams:[['Away','A','0'],['Home','H','0']],live:{phase:status},liveRawStatus:{period:2,displayClock:'0:00',type:{state:'in'}}};
    const card=ui.gameCard(game);ui.renderDetailContent(game,null);
    assert.doesNotMatch(card,/class="card-clock"/);
    assert.doesNotMatch(ui.detail.innerHTML,/class="detail-live-clock"/);
    assert.ok(ui.detail.innerHTML.includes(status));
    if(sport==='NCAAB')assert.match(card,/mobile-card-league">NCAAM/);
  }
});
