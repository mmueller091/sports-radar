import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {manifest,directory,sha256,readCapture,closingQuotes,inputFor,before,active,evaluate,replayCheckpoints,lateQ4Close} from './helpers/release-basketball.mjs';
import {scenario} from './helpers/live-underdog-scenarios.mjs';
const captures=manifest.captures.map(c=>({...c,fixture:readCapture(c)}));

test('supplemental retrospective source archives retain their exact bytes and explicit provenance',()=>{
 assert.equal(captures.length,8);
 for(const c of captures){
  assert.equal(sha256(fs.readFileSync(new URL(c.file,directory))),c.sha256);
  assert.equal(c.fixture.event.id,c.eventId);
  assert.equal(c.fixture.event.season.type,2,'ordinary regular season');
  assert.match(c.urls.summary,/^https:\/\/site.api.espn.com\//);
 }
});

test('supplemental real completed games retain both their score and scoring factors',()=>{
 for(const {fixture:f} of captures){
  const input={sport:f.modelSport,event:f.event,summary:f.summary};
  const a=evaluate(before,input),b=evaluate(active,input);
  assert.equal(b.state,'completed');
  assert.equal(b.score,a.score,f.eventId);
  assert.deepEqual(b.factors,a.factors,f.eventId);
 }
});

test('regular-season archived upset threats cover both halves with retained large closing lines',()=>{
 const f=captures.find(c=>c.eventId==='401909771').fixture;
 assert.equal(closingQuotes(f)[0].pointSpread.away.close.line,'+15.5');
 const replay=replayCheckpoints(f);
 for(const period of [1,2]){
  const close=replay.checkpoints.filter(c=>c.play.period.number===period&&Math.abs(c.play.awayScore-c.play.homeScore)<=3);
  assert.ok(close.length>50);
  for(const cp of [close[0],close[Math.floor(close.length/2)],close.at(-1)]){
   const input=inputFor(f,cp),a=evaluate(before,input),b=evaluate(active,input);
   assert.equal(b.liveUpset.market.spread,15.5);assert.equal(b.openingScore,a.openingScore);
   assert.equal(b.factors.filter(x=>x.liveUpset).length,Number(b.upsetPoints>0));
   assert.ok(b.upsetPoints>=0&&b.upsetPoints<=18);
  }
 }
});

test('real late-Q4 NBA one-possession archive covers underdog, opponent, and unknown possession',()=>{
 const f=captures.find(c=>c.eventId==='401909877').fixture;
 const close=replayCheckpoints(f).checkpoints.filter(c=>lateQ4Close(c.play.period.number,c.play.clock.displayValue,c.play.awayScore,c.play.homeScore));
 const dog='17',opponent='2';
 for(const possession of [dog,opponent,null]){
  const cp=close.find(c=>(c.competition.situation?.possession||null)===possession);
  assert.ok(cp,`real ${possession||'unknown'} possession exists`);
  const input=inputFor(f,cp),game=evaluate(active,input);
  assert.equal(game.liveUpset.market.spread,13.5);
  assert.equal(game.liveUpset.possessionId,possession);
  assert.ok(game.upsetPoints>=0&&game.upsetPoints<=14);
  const noWP=structuredClone(input);delete noWP.summary.winprobability;
  const missing=evaluate(active,noWP);
  assert.equal(missing.liveUpset.currentProbability,null);
  assert.equal(missing.liveUpset.probabilityGate,1);
  // A controlled omission is a robustness test, never labeled an observed state.
  for(const setting of ['missing','stale']){
   const modified=structuredClone(input);
   if(setting==='missing')delete modified.summary.pickcenter;
   else modified.summary.pickcenter.forEach(q=>{q.lastUpdated='2020-01-01T00:00:00Z';});
   assert.equal(evaluate(active,modified).upsetPoints,0,setting);
  }
 }
});

test('archive late-Q4 coverage includes decimal-second clocks and all trailing possession states',()=>{
 assert.equal(lateQ4Close(4,'30.0',114,117),true);
 assert.equal(lateQ4Close(4,'4:00',114,117),false);
 assert.equal(lateQ4Close(4,'',114,117),false);
 const f=captures.find(c=>c.eventId==='401909877').fixture;
 const close=replayCheckpoints(f).checkpoints.filter(c=>lateQ4Close(c.play.period.number,c.play.clock.displayValue,c.play.awayScore,c.play.homeScore)&&c.play.awayScore<c.play.homeScore);
 for(const possession of ['17','2',null]){
  const cp=close.findLast(c=>(c.competition.situation?.possession||null)===possession);
  assert.ok(cp,`real trailing ${possession||'unknown'} possession exists`);
  const game=evaluate(active,inputFor(f,cp));
  assert.equal(game.liveUpset.possessionId,possession);
  assert.ok(game.liveUpset.currentProbability<.05);
  assert.equal(game.upsetPoints,0,'observed three-point deficit in final seconds has almost no viable comeback runway');
 }
});

test('older genuine archives with absent or untimestamped current markets cannot masquerade as verified pregame quotes',()=>{
 for(const c of captures.filter(c=>Number(c.date)<20260000)){
  assert.equal(closingQuotes(c.fixture).length,0);
  const cp=replayCheckpoints(c.fixture).checkpoints.findLast(p=>p.play.period.number<= (c.modelSport==='NBA'?4:2)&&p.play.clock.displayValue!=='0:00');
  const game=evaluate(active,inputFor(c.fixture,cp));
  assert.equal(game.upsetPoints,0);
  assert.equal(game.liveUpset?.market??null,null);
 }
});

for(const sport of ['NCAAB','NBA'])test(`${sport}: explicit simulation controls preserve uncertain transition withholding and impossible-comeback suppression`,()=>{
 const period=sport==='NCAAB'?2:4;
 const expires=scenario({sport,period,clock:'0:00',margin:-14,possession:'dog'});
 const pending=evaluate(active,expires);
 assert.equal(pending.score,null,'unconfirmed zero-clock transition withheld');
 for(const possession of ['dog','fav','unknown']){
  assert.equal(evaluate(active,scenario({sport,period,clock:'0:02',margin:-14,possession})).upsetPoints,0);
  assert.equal(evaluate(active,scenario({sport,period,clock:'0:02',margin:-7,possession})).upsetPoints,0);
 }
 const next=evaluate(active,scenario({sport,period:period+1,clock:'4:59',margin:0}));
 assert.ok(Number.isFinite(next.score));assert.equal(next.liveUpset.progress,1);
});
