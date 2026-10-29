import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {normalizeEvent} from '../alerts-worker/src/game-model.js';
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

test('NBA 2OT flows through card, accessibility, explanation, history, detail and timeline',()=>{
  const {game,competition} = fixture('NBA',6);
  const summary = {header:{competitions:[competition]},scoringPlays:[
    {period:{number:6,displayValue:'6th quarter'},clock:{displayValue:'3:00'},homeScore:122,awayScore:120,text:'Made shot'}
  ]};
  const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const detail = {};
  const history = {};
  const context = vm.createContext({...core,ratingHistory:history,state:{source:'live'},HISTORY_KEY:'history',
    localStorage:{setItem:()=>{}},watchKey:g=>g.id,safeText:String,LEAGUE_LOGOS:{},
    displayLine:()=>({label:'Line',text:''}),isWatched:()=>false,teamMarkup:()=>'',possessionMarkup:()=>'',
    compactPlay:p=>p.text || '',$:()=>detail,labelForSport:s=>s,teamLogoUrl:()=>'',
    detailTabsMarkup:()=>'',storylineDetails:()=>'',detailScoring:()=>'',detailStats:()=>'',detailLeaders:()=>'',
    basketballBoxScoreMarkup:()=>'',detailPlayerStats:()=>'',detailPlays:()=>''});
  for (const name of ['explainRating','gameCard','basesMarkup','trendFor','isWinningTeam','recordRatingSnapshot',
    'legacyPlayPosition','scoringEvents','estimatedEventRating','timelineFormat','timelineEventPosition',
    'timelinePeriodLabel','timelineFinalScores','timelinePoints','excitementTimeline','renderDetailContent']) {
    const start=source.indexOf(`function ${name}(`);
    assert.ok(start>=0,name);
    vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  }
  const card=context.gameCard(game);
  const explanation=context.explainRating(game);
  context.recordRatingSnapshot(game);
  context.renderDetailContent(game,summary);
  const timeline=context.timelinePoints(game,summary);
  for (const value of [card,card.match(/aria-label="([^"]+)"/)[1],explanation,
    history[game.id][0].phase,detail.innerHTML,timeline.points.at(-1).label]) {
    assert.match(value,/2OT/);
    assert.doesNotMatch(value,/6th quarter/);
  }
  assert.match(detail.innerHTML, /detail-kicker[^>]*>NBA · 2:00 · 2OT/);
  assert.equal(timeline.points.at(-1).label,'2OT 2:00');
  assert.match(timeline.points[1].label,/^2OT/);
});
