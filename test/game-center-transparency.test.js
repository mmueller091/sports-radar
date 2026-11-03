import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import center from '../game-center.js';
import calculation from '../scoring/shared/calculation.js';
import core from '../rating-core.js';
import * as active from '../alerts-worker/src/live-game-model.js';
import {browser} from './helpers/overtime-terminology.mjs';
const detail=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/game-center/cardinals-cowboys.json.gz',import.meta.url))));
const inputs=JSON.parse(gunzipSync(fs.readFileSync(new URL('../alerts-worker/test/fixtures/migration-inputs.json.gz',import.meta.url))));
function rendered(game){
  const html=center.scoringMarkup(game),values=[...html.matchAll(/<dd>([^<]+)<\/dd>/g)].map(m=>m[1]);
  assert.ok(values.length,`${game.sport} ${game.state} ${game.id}: calculation missing`);
  // Check visible strings, independently using fixed decimal integer arithmetic.
  const scale=Math.max(...values.map(s=>(s.split('.')[1]||'').length));
  const sum=values.reduce((n,s)=>{const sign=s.startsWith('-')?-1n:1n,[a,b='']=s.replace(/^[+-]/,'').split('.');return n+sign*BigInt(a+b.padEnd(scale,'0'));},0n);
  assert.equal(sum,BigInt(game.score)*10n**BigInt(scale),`${game.sport} ${game.state}: ${values.join(' + ')}`);
  assert.match(html,new RegExp(`<strong>${game.score}</strong>`));
  return html;
}
test('Cardinals–Cowboys: actual rendered factors reconcile to 95 and concise explanation preserves verified comeback/redemption',()=>{
  const before=JSON.stringify(detail),g=detail.sportsRadarGame,html=rendered(g),ui=browser();
  assert.equal(g.score,95);assert.equal((html.match(/<dd>/g)||[]).length,10);
  ui.renderDetailContent(g,detail);
  assert.match(ui.detail.innerHTML,/Why 95/);assert.doesNotMatch(ui.detail.innerHTML,/score-calculation|Pregame rounding|Game-state baseline|<dd>/);assert.doesNotMatch(ui.detail.innerHTML,/Scoring details|Exact scoring factors|detail-why-toggle/);
  assert.match(ui.explainRating(g,detail),/underdog.*14-point deficit.*beat.*in overtime/);
  assert.match(ui.explainRating(g,detail),/missed the go-ahead extra point.*overtime field goal/);
  assert.equal(JSON.stringify(detail),before);
});
test('authoritative normalization renders signed/fractional factors and each actual rounding, cap and floor',()=>{
  for(const values of [[18,2,19,13,18,3,8,5,5,4],[32,10,-1.69,-.2,-.94,4.25,2],[12,-40],[80,35],[.4999],[98.5],[99.8],[-.5]]){
    const factors=values.map((points,i)=>({label:`Contribution ${i}`,points}));
    const score=core.clampScore(values.reduce((a,b)=>a+b,0));
    const ledger=calculation.fromFactors(factors,score);
    assert.ok(ledger);rendered({score,sport:'edge',state:'live',modelVersion:'test',scoreCalculation:{...ledger,state:'live',modelVersion:'test'}});
  }
});
test('all captured current-engine calculations render exactly, across sports and states',()=>{
  const coverage=new Set(),missing=[];
  for(const [name,input]of Object.entries(inputs)){
    const game=active.normalizeEvent(structuredClone(input.event),input.modelSport);
    if(!game)continue;
    active.enrichGame(game,structuredClone(input.summary));
    const c=calculation.publicCalculation(game);
    if(!c){missing.push(`${name}: ${game.sport} ${game.state} score=${game.score}`);continue;}
    coverage.add(game.sport);rendered({...game,scoreCalculation:c});
  }
  assert.deepEqual(missing,[],'Current scoring operations must expose complete provenance');
  assert.deepEqual([...coverage].sort(),['CFB','MLB','NBA','NCAAB','NFL','NHL']);
});
test('missing, mismatched and non-additive historical evidence cannot masquerade as exact',()=>{
  const base={sport:'NFL',state:'completed',score:99,factors:[{label:'Contribution',points:120}]};
  assert.equal(center.calculation(base),null);
  for(const extra of [{scoringPartial:true},{summaryLifecycleRejected:true},{scoringHistoryRejected:true},{live:{bonus:2}},{staleEnrichment:true}])assert.equal(center.calculation({...base,score:120,...extra}),null);
  assert.equal(center.calculation({...base,scoreCalculation:{rows:[{label:'Fake',points:99}],total:99,state:'live'}}),null);
  assert.doesNotMatch(center.scoringMarkup(base),/<dd>|<strong>/);
});
test('actual overtime history preserves every rating, timestamp, model, evidence flag and decisive play',()=>{
  const before=JSON.stringify(detail),g=detail.sportsRadarGame,d=center.observations(g,detail),last=d.points.filter(p=>p.ratingKind==='live'&&!p.invalid&&!p.incomplete).at(-1);
  assert.equal(last.score,95);assert.equal(last.label,'OT 2:58');
  assert.equal(d.points.length,detail.sportsRadarHistory.snapshots.length);
  for(const [i,p]of d.points.entries()){
    const old=detail.sportsRadarHistory.snapshots[i];
    assert.equal(p.score,old.rating);assert.equal(p.observedAt,old.observedAt);assert.equal(p.modelVersion,old.modelVersion);assert.equal(p.evidenceQuality,old.evidenceQuality);
  }
  const html=center.timeline(g,detail);
  assert.match(html,/OT 2:53: Chad Ryland 42 Yd Field Goal/);
  assert.match(html,/data-timeline-range="late"/);assert.match(html,/data-timeline-range="ot"/);
  assert.match(html,/timeline-event-strip/);assert.match(html,/Gaps mark intervals with unreliable timing or evidence/);assert.doesNotMatch(html,/Original observation history|evidenceQuality/);
  assert.doesNotMatch(html,/Final assessment|Opening estimate/);
  assert.equal(JSON.stringify(detail),before);
});
const game={id:'test',sport:'NFL',state:'completed',score:95,teams:[['A','A','33'],['B','B','30']]};
const p=(at,rating,clock='2:00',extra={})=>({observedAt:at,rating,state:'live',period:4,clock,modelVersion:'same',evidenceQuality:'verified',...extra});
const summary=snapshots=>({sportsRadarHistory:{snapshots}});
test('chart keeps sharp changes but separates gaps, corrections, duplicate clocks and models',()=>{
  const ps=[p(1000,20),p(16000,90),p(31000,10,'1:59',{evidenceQuality:'partial'}),p(46000,80,'1:59'),p(61000,70,'2:01'),p(61000,71,'2:01'),p(200000,75,'1:50'),p(215000,85,'1:49',{modelVersion:'new'}),p(230000,95,'0:00',{state:'completed'})];
  const data=center.observations(game,summary(ps)),live=data.points.filter(p=>p.ratingKind==='live'&&!p.incomplete);
  assert.equal(center.comparable(live[1],live[0]),false,'same-clock ratings stay recorded without a vertical line');
  assert.equal(live[1].score,90,'sharp same-clock rise remains available');
  for(let i=2;i<live.length;i++)assert.equal(center.comparable(live[i],live[i-1]),false);
  assert.equal(center.comparable(data.points.at(-1),live.at(-1)),false);
  assert.equal(live[0].x,live[1].x,'same-clock observations are never shifted');
  assert.ok(live[3].x<live[2].x,'clock corrections are never moved forward');
  assert.equal(live[3].compatibilityIssue,true);
});
test('missing clocks use real observation timestamps; unpositioned scoring events never get an ordinal',()=>{
  for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','Soccer','Tennis']){
    const g={...game,sport},s=summary([p(1000,30,''),p(61000,70,'')]);
    s.scoringPlays=[{period:{number:4},text:'Untimed score'}];
    const data=center.observations(g,s);assert.equal(data.axis,'observed');assert.deepEqual(data.points.map(p=>p.x),[1000,61000]);
    assert.doesNotMatch(center.timeline(g,s),/class="timeline-point timeline-event-marker"[^>]*Untimed score/);
  }
});
test('multiple overtimes map verified clocks without ordinal spacing; untimed CFB uses observations',()=>{
  for(const sport of ['NFL','NBA','NCAAB','NHL']){
    const g={...game,sport,sourceEvent:{season:{type:3}}},f=center.format(g,{});
    const ps=[p(1000,80,'1:00',{period:f.periods+1}),p(16000,90,'1:00',{period:f.periods+2})];
    const data=center.observations(g,summary(ps));assert.equal(data.axis,'game');
    assert.equal(data.points[1].x-data.points[0].x,f.overtime);assert.match(data.points[1].label,/2OT/);
  }
  assert.equal(center.observations({...game,sport:'CFB'},summary([p(1000,80,'0:00',{period:5})])).axis,'observed');
});
test('games without chart history show natural empty states without exposing observations',()=>{
  const s={scoringPlays:[{period:{number:4},clock:{displayValue:'0:00'},homeScore:33,awayScore:30,text:'Game-winning field goal'}]};
  const completed=center.timeline(game,s);
  assert.doesNotMatch(completed,/<svg|Recorded|observation/);
  assert.match(completed,/history was not recorded for this game/);
  const isolated=center.timeline(game,summary([p(1000,80)]));
  assert.doesNotMatch(isolated,/<svg|Recorded rating: 80|observation/);
  assert.match(center.timeline({...game,state:'live'},s),/history will appear as the game unfolds/);
  assert.match(center.timeline({...game,state:'upcoming'},s),/history begins when the game starts/);
});

for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB','Soccer','Tennis'])for(const state of ['upcoming','live','completed'])test(`${sport} ${state}: rendered engine calculations across margins, phases and evidence`,()=>{
  for(const [a,b]of [[0,0],[1,0],[3,1],[30,2]])for(const late of [false,true]){
    const period=({NCAAB:2,NHL:3,Soccer:2,Tennis:3,MLB:9})[sport]||4;
    const c={status:{period:late?period:1,displayClock:late?'0:30':'10:00',type:{state:state==='upcoming'?'pre':state==='completed'?'post':'in',completed:state==='completed',detail:state==='completed'?'Final':'In progress'}},
      competitors:[{homeAway:'home',team:{id:'h',displayName:'Home',abbreviation:'H'},score:String(a),records:[{type:'total',summary:'10-2'}]},{homeAway:'away',team:{id:'a',displayName:'Away',abbreviation:'A'},score:String(b),records:[{type:'total',summary:'8-4'}]}]};
    const event={id:`grid-${sport}-${state}-${a}-${late}`,date:'2026-11-01T18:00:00Z',season:{type:2},competitions:[c]};
    const game=active.normalizeEvent(event,sport);active.enrichGame(game,{header:{competitions:[structuredClone(c)]}});
    const calc=calculation.publicCalculation(game);assert.ok(calc,`${sport} ${state} ${a}-${b} late=${late} score=${game.score}`);
    rendered({...game,scoreCalculation:calc});
  }
});

test('calculation metadata is tied to the canonical game, survives cache reuse, and never changes persisted game JSON',()=>{
 const g={id:'metadata',sport:'NFL',state:'live',modelVersion:'same',score:core.clampScore(44.25),factors:[{label:'A',points:44.25}]};
 const original=JSON.stringify(g);calculation.set(g,calculation.fromFactors(g.factors,g.score));
 const c=calculation.publicCalculation(g);assert.ok(c);assert.equal(JSON.stringify(g),original);
 const cached=JSON.parse(original);assert.deepEqual(calculation.publicCalculation(cached,c),c);
 rendered({...cached,scoreCalculation:c});
 const changed={...cached,factors:[{label:'Different evidence',points:44.25}]};
 assert.equal(center.calculation({...changed,scoreCalculation:c}),null);
 assert.equal(calculation.publicCalculation(changed,c),null);
});
test('unclassified browser observations cannot become a reliable curve or replace the last verified record',()=>{
 const g={...game,state:'live'},s=summary([p(1000,80)]),local=[{at:16000,score:99,state:'live',period:4,clock:'1:55',modelVersion:'same'}];
 const html=center.timeline(g,s,local);
 assert.equal(center.observations(g,s,local).points.length,2);
 assert.doesNotMatch(html,/Original observation history|<td>99<\/td>|Recorded rating: 99|reliable|<svg/);
 assert.match(html,/history will appear as the game unfolds/);
});
