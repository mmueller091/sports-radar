import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {gunzipSync} from 'node:zlib';
import runtime from '../scoring/live-runtime.cjs';
import center from '../game-center.js';
import {loadFixtures} from '../calibration/helpers.mjs';
import * as active from '../alerts-worker/src/live-game-model.js';
const source=fs.readFileSync('app.js','utf8');
const explain=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('\nfunction trendFor('))+';explainRating',{SportsRadarScore:runtime,Intl});
const capture=JSON.parse(gunzipSync(fs.readFileSync('test/fixtures/game-center/cardinals-cowboys.json.gz')));
const copy=()=>structuredClone(capture);
const forbidden=/\bundefined\b|\bNaN\b|baseline|rounding|scoring factor|contribution|[+]\d|trajectory|telemetry/i;
function check(g,s){const before=JSON.stringify({g,s}),text=explain(g,s);assert.equal(JSON.stringify({g,s}),before);assert.equal(text,explain(g,s));assert.doesNotMatch(text,forbidden);return text;}
test('real completed-game prose follows the canonical result, comeback ledger and decisive player',()=>{
 const d=copy(),g=d.sportsRadarGame,text=check(g,d);assert.equal(g.score,95);assert.match(text,/14-point deficit/);assert.match(text,/Chad Ryland/);assert.match(text,/33\u201330/);assert.match(text,/in overtime/);
 assert.ok(text.length<350);assert.equal((text.match(/[.!?](?:\s|$)/g)||[]).length,2);
});
test('renaming the teams changes the narrative without a matchup exception',()=>{
 const d=copy(),g=d.sportsRadarGame;g.teams[0][0]='Harbor Owls';g.teams[1][0]='Mountain Foxes';
 const text=check(g,d);assert.match(text,/Harbor Owls.*Mountain Foxes/);assert.doesNotMatch(text,/Cardinals|Cowboys/);
});
test('changing the result changes the winner and rejects the incompatible old comeback ledger',()=>{
 const d=copy(),g=d.sportsRadarGame;g.teams[0][2]='17';g.teams[1][2]='40';g.factors=[{label:'Wide margin',points:-10}];g.liveRawStatus.period=4;
 const text=check(g,d);assert.match(text,/Dallas Cowboys beat Arizona Cardinals 40\u201317/);assert.doesNotMatch(text,/erased|Chad|overtime/);assert.match(text,/lopsided/);
});
test('removing overtime evidence removes overtime and redemption claims',()=>{
 const d=copy(),g=d.sportsRadarGame;g.liveRawStatus.period=4;g.factors=g.factors.filter(f=>f.label!=='Overtime');
 d.scoringPlays=d.scoringPlays.filter(p=>p.period?.number<=4);d.plays=[];
 const text=check(g,d);assert.doesNotMatch(text,/overtime|extra point|Chad Ryland/);
});
test('removing the comeback ledger prevents reuse of saved comeback prose',()=>{
 const d=copy(),g=d.sportsRadarGame;d.scoringPlays=[];d.plays=[];delete g.basketballFacts;
 assert.doesNotMatch(check(g,d),/comeback|deficit|rallied|erased|Chad|Minshew|Brissett/);
});
test('removing the decisive score removes its player and decisive narrative',()=>{
 const d=copy(),g=d.sportsRadarGame;const final=runtime.decisiveScoringPlay(g,d);assert.ok(final);
 d.scoringPlays=d.scoringPlays.filter(p=>p.id!==final.id);d.plays=[];
 assert.doesNotMatch(check(g,d),/Chad Ryland|decisive score|won it with/);
});
test('player names follow the actual play evidence, never saved redemption metadata',()=>{
 const d=copy(),g=d.sportsRadarGame;
 d.scoringPlays=d.scoringPlays.map(p=>({...p,text:p.text?.replaceAll('Chad Ryland','Morgan Reed')}));
 const text=check(g,d);assert.match(text,/Morgan Reed/);assert.doesNotMatch(text,/Chad Ryland/);
});
test('final and live states describe different viewing contexts',()=>{
 const d=copy(),g=d.sportsRadarGame,final=check(g,d);g.state='live';g.liveRawStatus.displayClock='2:58';
 const live=check(g,d);assert.notEqual(final,live);assert.doesNotMatch(live,/beat |won it with|finished/);assert.match(live,/leads|tied|lead|possession|overtime/i);
});
test('partial or rejected summaries cannot supply completed player or comeback claims',()=>{
 for(const flag of ['scoringPartial','summaryLifecycleRejected','scoringHistoryRejected','staleEnrichment']){const d=copy();d.sportsRadarGame[flag]=true;assert.doesNotMatch(check(d.sportsRadarGame,d),/Chad|14-point deficit|decisive score/);}
});
for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','NCAAM','Soccer','Tennis'])for(const state of ['upcoming','live','completed'])test(`${sport} ${state}: reusable explanation uses the supplied teams and available circumstances`,()=>{
 const game={sport,state,score:75,teams:[['Harbor','H','2','','','7-2'],['Mountain','M','1','','','6-3']],factors:[],liveRawStatus:{period:1,displayClock:'10:00'}};
 const text=check(game,null);assert.match(text,/Harbor|Mountain/);assert.doesNotMatch(text,/overtime|comeback|deficit|playoff|championship|injury/);
 if(state==='completed')assert.match(text,/Harbor beat Mountain/);if(state==='live')assert.match(text,/Harbor leads/);
});
test('missing data produces no invented names, margins, events or outcomes',()=>{
 for(const state of ['live','upcoming','completed']){
  const text=check({state,sport:'NBA',score:60},null);assert.doesNotMatch(text,/overtime|comeback|beat|\d+-point|undefined|NaN/);
  const g={state,sport:'NBA',teams:[['Harbor','H',null],['Mountain','M',null]],factors:[]};assert.doesNotMatch(check(g,null),/leads|beat|tied|0\u20130/);
 }
});
test('diverse captured games produce stable evidence-based prose without mutating scorer output',()=>{
 const outputs=new Set(),sports=new Set();for(const f of loadFixtures()){const g=active.normalizeEvent(structuredClone(f.event),f.modelSport);active.enrichGame(g,structuredClone(f.summary));outputs.add(check(g,f.summary));sports.add(g.sport);}
 assert.equal(sports.size,6);assert.ok(outputs.size>90);
});
test('production presentation has no individual-game narrative or public calculation renderer',()=>{
 const begin=source.indexOf('function explainRating('),end=source.indexOf('\nfunction trendFor('),text=source.slice(begin,end);
 assert.doesNotMatch(text,/401873024|Cardinals|Cowboys|Ryland|Minshew|Brissett|14-point|2:58|2:53|0:06/);
 assert.doesNotMatch(source,/function explainGameCenter|SportsRadarGameCenter\.scoringMarkup|\$\{scoringDetails\}/);
});
const p=(observedAt,rating,extra={})=>({observedAt,rating,state:'live',period:4,clock:'2:00',evidenceQuality:'verified',modelVersion:'m',...extra});
const game={id:'curve',sport:'NFL',state:'completed',score:95};
test('continuous path bridges long gaps and excluded observations using only reliable anchors',()=>{
 const snapshots=[p(1,20,{clock:'3:00'}),p(50000,100,{evidenceQuality:'partial'}),p(80000,NaN,{evidenceQuality:'invalid'}),p(900000,80),p(1200000,65,{clock:'1:00'}),p(1300000,95,{state:'completed',clock:'0:00'})];
 const detail={sportsRadarHistory:{snapshots}},before=JSON.stringify(detail),html=center.timeline(game,detail);
 const paths=[...html.matchAll(/class="timeline-line" d="([^"]+)"/g)].map(m=>m[1]);assert.ok(paths.length);for(const path of paths)assert.equal((path.match(/M /g)||[]).length,1);
 assert.match(paths[0],/ C /);assert.doesNotMatch(html,/Recorded rating: (100|95|NaN)|observation history|evidenceQuality/);assert.equal(JSON.stringify(detail),before);
});
test('curve passes through every recorded anchor and never overshoots endpoint values',()=>{
 const points=[{x:0,score:10},{x:1,score:90},{x:2,score:20},{x:50,score:20},{x:51,score:99},{x:52,score:0}];
 const before=JSON.stringify(points),path=center.curve(points,p=>p.x,p=>p.score),segments=[...path.matchAll(/C ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+) ([\d.e+-]+)/g)];
 assert.equal(segments.length,points.length-1);
 for(let i=0;i<segments.length;i++){const [x1,y1,x2,y2,x,y]=segments[i].slice(1).map(Number),a=points[i],b=points[i+1];assert.equal(x,b.x);assert.equal(y,b.score);
  for(let step=0;step<=100;step++){const t=step/100,u=1-t,value=u*u*u*a.score+3*u*u*t*y1+3*u*t*t*y2+t*t*t*y;assert.ok(value>=Math.min(a.score,b.score)-1e-10&&value<=Math.max(a.score,b.score)+1e-10);}
 }
 assert.equal(JSON.stringify(points),before);
});
test('duplicate clocks, clock corrections, timestamps and original order remain unchanged',()=>{
 const snapshots=[p(300,20),p(200,80),p(400,30,{clock:'2:01'}),p(500,40,{clock:'1:59'})],detail={sportsRadarHistory:{snapshots}};
 const data=center.observations(game,detail);assert.deepEqual(data.points.map(p=>p.observedAt),[300,200,400,500]);assert.deepEqual(data.points.map(p=>p.score),[20,80,30,40]);
 const path=center.curve(data.points,p=>p.x,p=>p.score);assert.equal((path.match(/M /g)||[]).length,1);assert.match(path,/ L /);assert.ok(data.points[2].x<data.points[1].x);
});

test('verified sport-specific pressure changes live prose rather than using generic filler',()=>{
 for(const [sport,reason]of [['MLB','The bases are loaded with the tying run at the plate.'],['NHL','Harbor has a power play late in the game.'],['Soccer','Mountain is down to ten players after a red card.'],['Tennis','Harbor has match point.'],['NBA','Harbor has a 12-0 scoring run.'],['NCAAB','Harbor has a 10-0 scoring run.']]){
  const g={sport,state:'live',score:70,teams:[['Harbor','H','2'],['Mountain','M','1']],factors:[],live:{reasons:[reason]}};
  assert.ok(check(g,null).includes(reason));g.live.reasons=[];assert.ok(!check(g,null).includes(reason));
 }
});

test('captured Grand Slam matches use real competitors and results with coverage qualifications',async()=>{
 const {createCollector}=await import('../alerts-worker/src/providers/espn.js');
 for(const tour of ['atp','wta']){
  const fixture=JSON.parse(fs.readFileSync(`alerts-worker/test/fixtures/tennis-grand-slams/${tour}-20250907.json`));
  const games=await createCollector(async url=>url.includes('/tennis/'+tour+'/')?fixture:{events:[]},Date.parse(fixture.events[0].endDate)-1000)();
  assert.ok(games.length);for(const g of games){const text=check(g,null);assert.ok(g.teams.some(t=>text.includes(t[0])));assert.doesNotMatch(text,/overtime|Chad|Cardinals/);}
 }
});

test('captured basketball comeback and postseason baseball explain meaningful evidence beyond the final margin',()=>{
 const fixtures=loadFixtures();
 for(const [sport,pattern]of [['NBA',/22-point deficit.*closing stages/],['MLB',/Postseason stakes.*competitive/],['NCAAB',/10-point deficit.*4 times/]]){
  const f=fixtures.find(f=>f.modelSport===sport),g=active.normalizeEvent(structuredClone(f.event),sport);active.enrichGame(g,structuredClone(f.summary));assert.match(check(g,f.summary),pattern);
 }
});
