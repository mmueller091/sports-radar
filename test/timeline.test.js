import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../rating-core.js');
const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const progresses = [];
const context = vm.createContext({...core,ratingHistory:{},watchKey:game=>game.id,
  safeText:value=>String(value),compactPlay:play=>play.text || '',
  stateRating:(...args)=>{progresses.push(args[4]);return core.stateRating(...args);}
});
for (const name of ['legacyPlayPosition','scoringEvents','estimatedEventRating','timelineFormat','timelineEventPosition','timelinePeriodLabel','timelineFinalScores','recordedTimelinePoints','timelinePoints','excitementTimeline']) {
  const start=source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}
const play=(period,clock,homeScore,awayScore,text='Made shot')=>({period:{number:period,displayValue:`${period}th quarter`},clock:{displayValue:clock},homeScore,awayScore,text});

test('old recorded models stay labeled and chart lines break at the new model boundary',()=>{
  const {game,summary}=fixture('NFL',4,'1:00');game.state='live';
  summary.sportsRadarHistory={snapshots:[
    {observedAt:1000,state:'live',rating:60,period:4,clock:'3:00',modelVersion:'old-model'},
    {observedAt:2000,state:'live',rating:85,period:4,clock:'2:00',modelVersion:'2026-10-30.cfb-context.1'}
  ]};
  const html=context.excitementTimeline(game,summary);
  assert.match(html,/old-model/);assert.match(html,/2026-10-30.cfb-context.1/);
  const line=html.match(/class="timeline-line" d="([^"]+)"/)[1];
  assert.equal((line.match(/M /g)||[]).length,2);
  assert.doesNotMatch(html,/\+25<\/b>/,'model switch is not a sporting swing');
});
function fixture(sport='NBA',period=5,clock='0.0',format) {
  return {game:{id:'ot',sport,state:'completed',score:95,openingScore:40,teams:[['Away','AWY','125'],['Home','HME','127']],liveRawStatus:{period,displayClock:clock}},
    summary:{header:{competitions:[{format,competitors:[{homeAway:'home',score:'127'},{homeAway:'away',score:'125'}]}]},scoringPlays:[]}};
}
function verify(game,summary) {
  progresses.length=0;
  const result=context.timelinePoints(game,summary);
  const html=context.excitementTimeline(game,summary);
  assert.ok(result.points.every((point,i)=>point.x>=0 && point.x<=result.domainEnd && (!i || point.x>=result.points[i-1].x)));
  assert.ok(progresses.length && progresses.every(value=>value>=0 && value<=1));
  for (const [,value] of html.matchAll(/cx="([\d.]+)"/g)) assert.ok(+value>=30 && +value<=588);
  const path=html.match(/class="timeline-line" d="([^"]+)"/)[1];
  const xs=[...path.matchAll(/[ML] ([\d.]+)/g)].map(match=>+match[1]);
  assert.ok(xs.every((x,i)=>x>=30 && x<=588 && (!i || x>=xs[i-1])));
  return {...result,html};
}
test('NBA regulation keeps regulation spacing, endpoint and no divider',()=>{
  const {game,summary}=fixture('NBA',4,'0:00');
  summary.scoringPlays=[play(1,'6:00',10,8),play(4,'0:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,2880);
  assert.equal(result.points[1].x/result.domainEnd,.125);
  assert.equal(result.points.at(-1).x/result.domainEnd,1);
  assert.equal(result.dividers.length,0);
  assert.doesNotMatch(result.html,/timeline-overtime/);
});
test('NBA 1OT: 127–125 three pointer at 0.0 receives 95 without duplicate or backward Final',()=>{
  const {game,summary}=fixture();
  summary.scoringPlays=[play(4,'0:00',115,115),play(5,'4:00',117,115),play(5,'0.0',127,125,'Anthony Edwards makes 28-foot three pointer')];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,3180);
  assert.equal(result.points.length,4);
  assert.equal(result.points.at(-1).score,95);
  assert.equal(result.points.at(-1).x,3180);
  assert.equal(result.points.at(-1).scoringProgress,1);
  assert.equal(result.dividers[0].x,2880);
  assert.match(result.html,/End regulation/);
  assert.match(result.points.at(-1).label,/^OT/);
  assert.doesNotMatch(result.points.at(-1).label,/quarter/);
});
test('NBA 2OT extends to 58 minutes, with ordered OT and 2OT segments',()=>{
  const {game,summary}=fixture('NBA',6);
  summary.scoringPlays=[play(5,'0:00',120,120),play(6,'4:00',122,120),play(6,'0:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,3480);
  assert.deepEqual(Array.from(result.dividers,d=>d.label),['OT','2OT']);
  assert.equal(result.points.at(-1).x,3480);
  assert.equal(result.points.at(-1).score,95);
});
for (const periods of [2,4]) test(`NCAAB provider ${periods}-period regulation and five-minute OT`,()=>{
  const {game,summary}=fixture('NCAAB',periods+1,'0:00',{regulation:{periods}});
  summary.scoringPlays=[play(periods,'0:00',100,100),play(periods+1,'0:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,2700);
  assert.equal(result.points[1].x,2400);
  assert.match(result.points.at(-1).label,/^OT/);
});
for (const [sport,period,seconds] of [['NHL',4,1200],['NFL',5,900]]) test(`${sport} honors provider OT duration`,()=>{
  const {game,summary}=fixture(sport,period,'0:00',{overtime:{durationSeconds:seconds}});
  summary.scoringPlays=[play(period,'5:00',126,125),play(period,'0:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,3600+seconds);
  assert.equal(result.points[1].x,3600+seconds-300);
  assert.equal(result.points.at(-1).scoringProgress,1);
});
test('NHL postseason metadata uses 20-minute OT and multiple OT labels',()=>{
  const {game,summary}=fixture('NHL',5,'0:00');
  summary.header.season={type:3};
  summary.scoringPlays=[play(4,'10:00',125,125),play(5,'0:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,6000);
  assert.match(result.points.at(-1).label,/^2OT/);
});
test('CFB multi-OT uses ordered segments ignoring clocks, including within each OT',()=>{
  const {game,summary}=fixture('CFB',6,'0:00');
  summary.scoringPlays=[play(5,'0:00',120,119),play(5,'15:00',120,120),play(6,'0:00',127,125)];
  const result=verify(game,summary);
  assert.ok(result.points[1].x<result.points[2].x && result.points[2].x<result.points[3].x);
  assert.deepEqual(Array.from(result.points.slice(1),p=>p.label),['OT','OT','2OT']);
  assert.equal(context.timelineFormat(game,summary).untimed,true);
});
test('structured score mismatch cannot be overridden by winning-play wording; Final stays at OT endpoint',()=>{
  const {game,summary}=fixture();
  summary.scoringPlays=[play(5,'0.0',126,125,'Game-winning basket')];
  const result=verify(game,summary);
  assert.equal(result.points.at(-1).label,'Final');
  assert.equal(result.points.at(-1).x,3180);
  assert.equal(result.points.at(-2).x,3180);
});
test('live OT never receives completion score and progress remains bounded',()=>{
  const {game,summary}=fixture('NBA',5,'2:00'); game.state='live';
  summary.scoringPlays=[play(5,'4:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.domainEnd,3060);
  assert.equal(result.points.at(-1).x,3060);
  assert.notEqual(result.points[1].score,95);
});
test('missing scoreboard uses only explicit winning wording and null play scores are excluded',()=>{
  const {game,summary}=fixture(); delete game.teams; delete summary.header.competitions[0].competitors;
  summary.scoringPlays=[play(5,'0:00',127,125,'Game-winning jumper'),play(5,'0:00',null,null)];
  const result=verify(game,summary);
  assert.equal(result.points.length,2);
  assert.equal(result.points.at(-1).score,95);
});

test('regulation positions match existing geometry across supported sports',()=>{
  for (const [sport,period,clock] of [['NBA',3,'6:00'],['NCAAB',2,'10:00'],['NHL',2,'10:00'],['NFL',4,'7:30'],['CFB',3,'7:30'],['Soccer',2,"65'"],['MLB',8,''],['Tennis',2,'']]) {
    const game={sport}; const event=play(period,clock,10,8);
    const format=context.timelineFormat(game,{});
    const actual=context.timelineEventPosition(game,event,format)/format.regulation;
    const expected=core.eventPosition(sport,{status:{period,displayClock:clock,type:{detail:event.period.displayValue}}});
    assert.equal(actual,expected,sport);
  }
});
test('equal-clock plays retain provider order and numeric clock values work',()=>{
  const {game,summary}=fixture();
  const last=play(5,'',127,125); last.clock.value=0;
  summary.scoringPlays=[play(5,'1:00',125,124),play(5,'1:00',126,124),last];
  const result=verify(game,summary);
  assert.deepEqual(Array.from(result.points.slice(1),p=>p.home),[125,126,127]);
  assert.equal(result.points.at(-1).x,3180);
});
test('metadata clock duration, source competition, and NFL postseason fallback',()=>{
  const game={sport:'NFL',sourceCompetition:{format:{overtime:{duration:'12:00'}}}};
  assert.equal(context.timelineFormat(game,{}).overtime,720);
  delete game.sourceCompetition;
  assert.equal(context.timelineFormat(game,{header:{season:{type:3}}}).overtime,900);
  assert.equal(context.timelineFormat(game,{}).overtime,600);
});
test('live current OT marker uses display-specific OT label',()=>{
  const {game,summary}=fixture('NBA',6,'2:00'); game.state='live'; game.live={phase:'6th quarter'};
  summary.scoringPlays=[play(6,'4:00',127,125)];
  const result=verify(game,summary);
  assert.equal(result.points.at(-1).label,'2OT 2:00');
});

test('timeline hover help reserves stable layout space while retaining pointer, touch, and keyboard controls',()=>{
  const {game,summary}=fixture('NBA',4,'0:00');
  summary.scoringPlays=[play(1,'6:00',10,8),play(4,'0:00',127,125)];
  const {html}=verify(game,summary);
  const styles=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

  assert.match(html,/class="timeline-point-help"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(html,/timeline-point-help[^>]*\shidden/);
  assert.match(html,/class="timeline-point[^"]*"[^>]*role="button"[^>]*tabindex="0"[^>]*aria-expanded="false"[^>]*aria-controls=/);
  assert.match(styles,/\.timeline-point-help \{[^}]*box-sizing: border-box;[^}]*block-size: 7\.8em;[^}]*visibility: hidden;/);
  assert.match(styles,/\.timeline-point-help\.is-visible \{ visibility: visible; \}/);
  assert.doesNotMatch(styles,/\.timeline-point-help\[hidden\]/);
  assert.match(source,/event\.pointerType !== 'touch'/);
  assert.match(source,/\['Enter',' '\]\.includes\(event\.key\)/);
  assert.match(source,/movingToTimelinePoint/);
  assert.doesNotMatch(source,/help\.hidden\s*=/);
});
