import gameCenter from '../game-center.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent} from '../alerts-worker/src/game-model.js';
import time from '../scoring/shared/time.js';
const core = createRequire(import.meta.url)('../rating-core.js');

const cases = [
  ['NBA',4,'4th quarter'],['NBA',5,'OT'],['NBA',6,'2OT'],['NBA',7,'3OT'],['NBA',8,'4OT'],
  ['NCAAB',2,'2nd half'],['NCAAB',3,'OT'],['NCAAB',4,'2OT'],
  ['NFL',4,'4th quarter'],['NFL',5,'OT'],['NFL',6,'2OT'],
  ['CFB',5,'OT'],['CFB',6,'2OT'],
  ['NHL',3,'3rd period'],['NHL',4,'OT'],['NHL',5,'2OT']
];
function fixture(sport,period,clock='2:00',format) {
  const competition = {format,status:{period,displayClock:clock,type:{state:'in',detail:`${period}th quarter`}},
    competitors:[{homeAway:'away',team:{id:'a',displayName:'Away',abbreviation:'AWY'},score:'120'},
      {homeAway:'home',team:{id:'h',displayName:'Home',abbreviation:'HME'},score:'122'}]};
  return {game:normalizeEvent({id:'phase',competitions:[competition]},sport),competition};
}
for (const [sport,period,label] of cases) test(`${sport} period ${period}: canonical ${label}`,()=>{
  const clock = sport === 'NBA' && period === 5 ? '4:00' : '2:00';
  const {game} = fixture(sport,period,clock);
  assert.equal(game.live.phase,`${clock} · ${label}`);
  assert.equal(core.livePhase(sport,{period}),label);
});
test('NCAAB respects four-quarter provider format before and during overtime',()=>{
  for (const [period,label] of [[3,'3rd quarter'],[4,'4th quarter'],[5,'OT'],[6,'2OT']]) {
    const {game} = fixture('NCAAB',period,'2:00',{regulation:{periods:4}});
    assert.equal(game.live.phase,`2:00 · ${label}`);
  }
});
test('period breaks preserve context without impossible overtime ordinals',()=>{
  assert.equal(core.livePhase('NBA',{period:6,type:{detail:'End of 6th quarter'}}),'End of 2OT');
  assert.equal(core.livePhase('NCAAB',{period:3,type:{detail:'End of 3rd half'}}),'End of OT');
  assert.equal(core.livePhase('NBA',{period:2,type:{detail:'Halftime'}}),'Halftime');
  assert.equal(core.livePhase('NHL',{period:3,type:{detail:'Intermission'}}),'Intermission');
});

test('NCAAM halftime keeps the viewing-priority badge without repeating the phase',()=>{
 const {competition}=fixture('NCAAB',1,'0:00');
 competition.status.type={state:'in',name:'STATUS_HALFTIME',detail:'Halftime',shortDetail:'Halftime'};
 const game=normalizeEvent({id:'oakland-half',competitions:[competition]},'NCAAB');
 const {card,detail}=renderedGame(game,{header:{competitions:[competition]}});
 assert.equal((card.match(/<span class="status-live"[^>]*>HALFTIME/g)||[]).length,1);
 // The current production mobile cards keep the explanation in the title.
 assert.match(card,/title="Halftime: ranked 6 points lower for viewing priority; excitement rating unchanged\."/);
 assert.match(card,/>HALFTIME<\/span>/);
 assert.doesNotMatch(card,/class="live-phase"|class="card-clock"/);
 assert.match(detail.innerHTML,/NCAAB · Halftime/);
 assert.doesNotMatch(detail.innerHTML,/class="detail-live-clock"/);
});

test('NCAAM live, halftime and second-half cards keep one current phase',()=>{
 const {competition}=fixture('NCAAB',1,'0:12');
 const phases=[
  {period:1,displayClock:'0:12',type:{state:'in',detail:'1st Half'},badge:/0:12/,clock:/class="card-clock"/},
  {period:1,displayClock:'0:00',type:{state:'in',name:'STATUS_HALFTIME',detail:'Halftime',shortDetail:'Halftime'},badge:/>HALFTIME<\/span>/,clock:null},
  {period:2,displayClock:'19:43',type:{state:'in',detail:'2nd Half'},badge:/19:43/,clock:/class="card-clock"/}
 ];
 for (const phase of phases) {
  competition.status=phase;
  const game=normalizeEvent({id:'transition',competitions:[competition]},'NCAAB');
  const {card,detail}=renderedGame(game,{header:{competitions:[competition]}});
  assert.match(card,phase.badge);
  assert.equal((card.match(/class="status-live"/g)||[]).length,1);
  if (phase.clock) assert.match(card,phase.clock);
  else {
   assert.doesNotMatch(card,/class="card-clock"|class="live-phase"/);
   assert.doesNotMatch(detail.innerHTML,/class="detail-live-clock"/);
  }
 }
});

test('NHL shootout status takes precedence over numeric overtime and its stopped clock',()=>{
  for (const type of [{detail:'Shootout'},{detail:'Live',shortDetail:'SO'},
    {name:'STATUS_SHOOTOUT',detail:'Live'}]) {
    const status={period:5,displayClock:'0:00',type:{state:'in',...type}};
    assert.equal(core.livePhase('NHL',status),'Shootout');
    const {competition}=fixture('NHL',5,'0:00');
    competition.status=status;
    const game=normalizeEvent({id:'shootout',season:{type:2},competitions:[competition]},'NHL');
    assert.equal(game.live.phase,'Shootout');
  }
  const status={period:5,displayClock:'0:00',type:{state:'in',detail:'Live'}};
  for (const type of [2,{id:'2'}]) assert.equal(core.livePhase('NHL',status,{}, {type}),'Shootout');
  assert.equal(core.livePhase('NHL',status,{}, {type:3}),'0:00 · 2OT');
  const {competition}=fixture('NHL',5,'0:00');
  competition.status=status;
  assert.equal(normalizeEvent({id:'regular',season:{type:2},competitions:[competition]},'NHL').live.phase,'Shootout');
});

function renderedGame(game,summary) {
  const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const detail = {};
  const history = {};
  const context = vm.createContext({SportsRadarGameCenter:gameCenter,...core,...time,ratingHistory:history,state:{source:'live'},HISTORY_KEY:'history',
    localStorage:{setItem:()=>{}},watchKey:g=>g.id,safeText:String,LEAGUE_LOGOS:{},
    displayLine:()=>({label:'Line',text:''}),isWatched:()=>false,teamMarkup:()=>'',possessionMarkup:()=>'',
    compactPlay:p=>p.text || '',$:()=>detail,labelForSport:s=>s,teamLogoUrl:()=>'',
    detailTabsMarkup:()=>'',storylineDetails:()=>'',detailScoring:()=>'',detailStats:()=>'',detailLeaders:()=>'',
    basketballBoxScoreMarkup:()=>'',detailPlayerStats:()=>'',detailPlays:()=>''});
  for (const name of ['normalizedTeamName','teamLogoWithFallback','halftimePriorityAdjustment','explainRating','publicStorySentence','compactClockPeriod','broadcastWatchMarkup','scoreHueFor','scoreHeatClass','gameCard','basesMarkup','trendFor','isWinningTeam','recordRatingSnapshot',
    'legacyPlayPosition','scoringEvents','estimatedEventRating','timelineFormat','timelineEventPosition',
    'timelinePeriodLabel','timelineFinalScores','recordedTimelinePoints','timelinePoints','timelineComparable','timelinePresentation','timelineRatingSummary','timelineHistoryDetails','excitementTimeline','renderExcitementTimeline','orderedDetailSummary','renderDetailContent']) {
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  }
  const card=context.gameCard(game);
  const explanation=context.explainRating(game);
  context.recordRatingSnapshot(game);
  context.renderDetailContent(game,summary);
  const timeline=context.timelinePoints(game,summary);
  return {card,explanation,history,detail,timeline};
}

test('NBA 2OT flows through card, accessibility, explanation, history, detail and timeline',()=>{
  const {game,competition} = fixture('NBA',6);
  const summary = {header:{competitions:[competition]},scoringPlays:[
    {period:{number:6,displayValue:'6th quarter'},clock:{displayValue:'3:00'},homeScore:122,awayScore:120,text:'Made shot'}
  ]};
  const {card,explanation,history,detail,timeline}=renderedGame(game,summary);
  for (const value of [card,card.match(/aria-label="([^"]+)"/)[1],explanation,
    history[game.id][0].phase,detail.innerHTML,timeline.points.at(-1).label]) {
    assert.match(value,/2OT/);
    assert.doesNotMatch(value,/6th quarter/);
  }
  assert.match(detail.innerHTML, /detail-kicker[^>]*>NBA · 2:00 · 2OT/);
  assert.equal(timeline.points.at(-1).label,'2OT 2:00');
  assert.match(timeline.points[1].label,/^2OT/);
});

test('NHL shootout appears on card and Game Center without a fake countdown',()=>{
  for (const clock of ['0:00','']) {
    const {competition}=fixture('NHL',5,clock);
    competition.status.type={state:'in',detail:'Shootout',shortDetail:'Shootout'};
    const game=normalizeEvent({id:'shootout',season:{type:2},competitions:[competition]},'NHL');
    const {card,explanation,history,detail}=renderedGame(game,{header:{competitions:[competition]}});
    assert.match(card,/<span class="card-clock"><span>Shootout<\/span><\/span>/);
    assert.match(detail.innerHTML,/<span class="detail-live-clock"><span>Shootout<\/span><\/span>/);
    for (const value of [card,explanation,history[game.id][0].phase,detail.innerHTML]) {
      assert.match(value,/Shootout/);
      assert.doesNotMatch(value,/2OT|0:00/);
    }
  }
});
