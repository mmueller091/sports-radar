import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import runtime from '../scoring/live-runtime.cjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';
import worker from '../alerts-worker/src/index.js';
import {fixture,browser} from './helpers/overtime-terminology.mjs';
const context=browser();
const play=(period,displayValue='Period '+period,clock='2:53')=>({period:{number:period,displayValue},clock:{displayValue:clock},text:'A play mentioning Period 5 and the 6th quarter stays intact.'});

for(const [sport,regulation] of [['NFL',4],['CFB',4],['NBA',4],['NCAAB',2],['NHL',3]]){
 for(const [extra,label] of [[1,'OT'],[2,'2OT'],[3,'3OT']])test(`${sport}: ${label} across structured plays, cached moments, tables and accessible timeline markers`,()=>{
  const game={sport,season:{type:3}},p=play(regulation+extra),original=JSON.stringify(p);
  assert.equal(runtime.playPeriodLabel(game,p),label);
  assert.equal(runtime.playPeriodLabel(game,{...p,period:regulation+extra}),label);
  assert.equal(runtime.playPeriodLabel(game,{...p,period:{value:regulation+extra}}),label);
  const moment=`Period ${regulation+extra} · 2:53 · ${p.text}`;
  assert.equal(runtime.displayMoment({...game,moment}),`${label} · 2:53 · ${p.text}`);
  const summary={header:{season:{type:3},competitions:[{competitors:[{team:{abbreviation:'A'},score:1,linescores:Array(regulation+extra).fill({value:0})},{team:{abbreviation:'B'},score:0,linescores:Array(regulation+extra).fill({value:0})}]}]},scoringPlays:[p]};
  assert.match(context.detailPlays(summary,game),new RegExp(`<span>${label} · 2:53</span>`));
  assert.match(context.detailScoring(summary,sport),new RegExp(`<th scope="col">${label}</th>`));
  assert.equal(context.timelinePeriodLabel(p,context.timelineFormat(game,summary)),label);
  assert.equal(JSON.stringify(p),original);
 });
 test(`${sport}: regulation ending preserves the exact provider label, clock and narrative`,()=>{
  const p=play(regulation,`Period ${regulation}`,'0:00'),game={sport,moment:`Period ${regulation} · 0:00 · ${p.text}`};
  assert.equal(runtime.playPeriodLabel(game,p),`Period ${regulation}`);
  assert.equal(runtime.displayMoment(game),game.moment);
  assert.match(context.detailPlays({scoringPlays:[p]},game),/<span>0:00<\/span>/);
 });
}

test('NHL shootout is distinct from playoff 2OT, including period-table headings',()=>{
 const p=play(5),game={sport:'NHL',season:{type:2}};
 assert.equal(runtime.playPeriodLabel(game,p),'Shootout');
 assert.equal(runtime.playPeriodLabel({...game,season:{type:3}},p),'2OT');
 assert.equal(runtime.playPeriodLabel({sport:'NHL'},play(5,'SO')),'Shootout');
 assert.equal(context.timelinePeriodLabel(p,context.timelineFormat(game,{})),'Shootout');
 const teams=[{team:{abbreviation:'A'},score:2,linescores:Array(5).fill({value:0})},{team:{abbreviation:'B'},score:1,linescores:Array(5).fill({value:0})}];
 for(const type of [2,3]){
  const html=context.detailScoring({header:{season:{type},competitions:[{competitors:teams}]}},'NHL');
  assert.match(html,new RegExp(`<th scope="col">${type===2?'SO':'2OT'}</th>`));
  assert.match(html,/<th scope="col">OT<\/th>/);
 }
});

test('NCAAM format metadata controls the overtime boundary without relabeling regulation',()=>{
 const game={sport:'NCAAB'},summary={header:{competitions:[{format:{regulation:{periods:4}}}]}};
 assert.equal(runtime.playPeriodLabel(game,play(3,'3rd quarter'),summary),'3rd quarter');
 assert.equal(runtime.playPeriodLabel(game,play(5),summary),'OT');
 assert.equal(runtime.playPeriodLabel(game,play(6),summary),'2OT');
});

test('cached-label normalization is anchored, idempotent, and never rewrites play prose',()=>{
 const game={sport:'NFL'};
 for(const moment of ['A catch in Period 5 · 2:53 · touchdown','Period 5 was unusual','Period 5 · No clock',
  'OT · 2:53 · A play in Period 5','Period 4 · 0:00 · The 5th quarter was discussed'])assert.equal(runtime.displayMoment({...game,moment}),moment);
 const moment='5th quarter 2:53 · Period 5 · 2:53 · remains in the actual description';
 const result=runtime.displayMoment({...game,moment});
 assert.equal(result,'OT · 2:53 · Period 5 · 2:53 · remains in the actual description');
 assert.equal(runtime.displayMoment({...game,moment:result}),result);
 assert.equal(runtime.playPeriodLabel(game,play(5,'Period 5','0.7')),'OT');
 assert.equal(runtime.displayMoment({...game,moment:'Period 5 · 0.7 · End'}),'OT · 0.7 · End');
});

for(const [id,clock,rating] of [['401873024','2:53',95],['401873031','7:00',79]])test(`${id}: confirmed NFL decisive play is OT on cards, Game Center, play list and accessible timeline`,()=>{
 const detail=fixture(id),game=detail.sportsRadarGame,original=JSON.stringify(detail);
 assert.match(game.moment,new RegExp(`^Period 5 · ${clock}`));assert.equal(game.score,rating);
 const expected=game.moment.replace(/^Period 5/,'OT');
 assert.equal(runtime.displayMoment(game),expected);
 const card=context.gameCard(game);context.renderDetailContent(game,detail);
 for(const html of [card,context.detail.innerHTML]){assert.ok(html.includes(expected));assert.doesNotMatch(html,/Period 5/);assert.match(html,/Final\/OT/);}
 assert.match(context.detailPlays(detail,game),new RegExp(`OT · ${clock}`));
 const why=context.summarySpecificWhy(game,detail);assert.equal(why.label,'Decisive play');assert.match(why.text,new RegExp(`^OT · ${clock}`));
 const chart=context.excitementTimeline(game,detail);assert.match(chart,/aria-label="OT /);assert.doesNotMatch(chart,/aria-label="Period 5/);
 const event={id,season:detail.header.season,competitions:detail.header.competitions};
 const enriched=normalizeEvent(event,'NFL');enrichGame(enriched,detail,game);
 assert.match(enriched.moment,new RegExp(`^OT · ${clock}`));assert.equal(enriched.momentLabel,'Decisive play');
 assert.equal(enriched.score,rating);assert.equal(enriched.modelVersion,game.modelVersion);
 assert.equal(JSON.stringify(detail),original,'history, provider periods, clocks and all input statistics remain untouched');
});

test('last-score descriptions use OT without changing decisive-play selection',()=>{
 const detail=fixture('401873031'),summary=structuredClone(detail),game=structuredClone(detail.sportsRadarGame);
 const last={...play(5,'Period 5','0:00'),text:'A meaningless late touchdown',homeScore:42,awayScore:7,scoringPlay:true};
 summary.scoringPlays=[last];summary.plays=[last];game.teams[0][2]='7';game.teams[1][2]='42';
 summary.header.competitions[0].competitors.forEach(t=>t.score=t.homeAway==='home'?'42':'7');
 const why=context.summarySpecificWhy(game,summary);assert.equal(why.label,'Last score');assert.match(why.text,/^OT 0:00/);
 const enriched=normalizeEvent({id:game.id,competitions:summary.header.competitions},'NFL');enrichGame(enriched,summary);
 assert.equal(enriched.momentLabel,'Last score');assert.match(enriched.moment,/^OT 0:00/);
});

test('public feed and details normalize old cached moments without writing over stored games or snapshots',async t=>{
 const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../alerts-worker/schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
 const DB={prepare(sql){let values=[];return {bind(...args){values=args;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:{changes:db.prepare(sql).run(...values).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}};
 const d=fixture('401873024'),game=d.sportsRadarGame,feed={updatedAt:new Date().toISOString(),modelVersion:runtime.MODEL_VERSION,games:[game]};
 db.prepare('INSERT INTO sports_feed(id,payload) VALUES(1,?)').run(JSON.stringify(feed));
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>Response.json(d);
 const stored=()=>db.prepare('SELECT payload FROM sports_feed WHERE id=1').get().payload;
 const before=stored();
 for(const path of ['/feed','/game/NFL/401873024']){
  const response=await worker.fetch(new Request('https://example.test'+path),{DB},{});assert.equal(response.status,200);
  const body=await response.json(),actual=body.games?.[0]||body.sportsRadarGame;
  assert.equal(actual.moment,runtime.displayMoment(game));assert.equal(actual.score,95);assert.equal(actual.modelVersion,runtime.MODEL_VERSION);
 }
 assert.equal(stored(),before);
 assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sports_snapshots').get().count,0);
});
