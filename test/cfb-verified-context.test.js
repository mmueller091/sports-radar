import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import context from '../scoring/cfb-verified-context.cjs';
import runtime from '../scoring/live-runtime.cjs';
import * as active from '../alerts-worker/src/live-game-model.js';
import {contextsForGames,researchGame,articleMatchesGame} from '../alerts-worker/src/storylines.js';
import {canonicalResearchGame,selectResearchGames,publicLinkEligible} from '../alerts-worker/src/research-allocation.js';
import {editorialArticleEligible,acceptEditorialReview} from '../alerts-worker/src/editorial-context.js';
import {fixture,now,copy,gameFor,summary} from './helpers/cfb-verified-context.mjs';
const row=id=>fixture.games.find(g=>g.id===id),factors=g=>g.factors.filter(f=>f.contextType);
const expected=[['401856849',7,['rivalry']],['401856741',6,['playoff_rematch']],['401858291',9,['rivalry','meaningful_rematch']],
  ['401856745',7,['rivalry']],['401862823',7,['rivalry']],['401858514',2,['meaningful_rematch']],['401856740',0,['rivalry']],['401856743',0,[]]];
for(const [id,delta,types] of expected)test(`${id}: reviewed matchup evidence earns only the appropriate existing weights`,()=>{
  const before=gameFor(row(id),{reviewed:false}),after=gameFor(row(id));
  assert.equal(before.score,row(id).before);assert.equal(after.score,before.score+delta);
  assert.deepEqual(factors(after).map(f=>f.contextType).sort(),types.sort());
  for(const f of factors(after).filter(f=>f.factKey)){
    assert.equal(f.eventId,id);assert.ok(f.sourceUrl.startsWith('https://'));assert.ok(f.evidence.every(e=>e.evidence&&e.reviewedAt));
  }
  assert.equal(after.rawPregameScore,after.factors.reduce((n,f)=>n+f.points,0));
});
test('the entire 111-game Saturday slate reproduces production and only the six intended ratings change',()=>{
  assert.equal(fixture.games.length,111);
  const changed=[];
  for(const r of fixture.games){const before=gameFor(r,{reviewed:false}),after=gameFor(r);
    assert.equal(before.score,r.before,r.id);assert.deepEqual(before.factors,r.beforeFactors,r.id);
    if(before.score!==after.score)changed.push(r.id);
  }
  assert.deepEqual(changed.sort(),expected.filter(e=>e[1]).map(e=>e[0]).sort());
  assert.ok(gameFor(row('401856849')).score>gameFor(row('401856743')).score);
});
test('Army-Air Force and Army-Navy qualify unranked; bounded selection protects a rivalry slot',()=>{
  const army=gameFor(row('401862823'),{reviewed:false});
  assert.ok(army.teams.every(t=>!t[6]));assert.equal(army.score,44);
  const candidate=canonicalResearchGame(army,now);assert.ok(candidate?.verifiedContext);
  assert.ok(researchGame('CFB',row('401862823').event,now));
  const saturated=Array.from({length:50},(_,i)=>({...candidate,key:`NBA:${i}`,eventId:String(i),sport:'NBA',score:99-i/10,verifiedContext:false}));
  const selected=selectResearchGames([...saturated,candidate],{},now);
  assert.equal(selected.length,30);assert.ok(selected.includes(candidate));
  const navy={...army,id:'future-navy',startTime:'2026-12-12T20:00Z',teams:copy(army.teams)};
  navy.teams[0][8]='2426';
  assert.ok(canonicalResearchGame(navy,Date.parse('2026-12-10T00:00Z')));
  // The unreviewed opponent can be explored without pretending to have an
  // established rivalry or receiving any of the reviewed source credit.
  navy.teams[0][8]='9999';
  const discovery=canonicalResearchGame(navy,Date.parse('2026-12-10T00:00Z'));
  assert.equal(discovery?.verifiedContext,false);assert.equal(discovery?.exploratory,true);
});
test('registry facts reach the feed even with an empty news database and no research allocation',async()=>{
  const game=gameFor(row('401856849'),{reviewed:false});
  const env={DB:{prepare:()=>({bind:()=>({all:async()=>({results:[]})})})}};
  const result=await contextsForGames(env,[`CFB:${game.id}`],[game],now);
  assert.equal(result[`CFB:${game.id}`][0].type,'rivalry');
  assert.deepEqual(await contextsForGames(env,[`NFL:${game.id}`],[{...game,sport:'NFL'}],now),{});
});
test('Alabama-LSU does not stack duplicate rivalry/coaching stories; rematch levels never stack',()=>{
  const g=gameFor(row('401856740'),{reviewed:false}),rival=row(g.id).contexts[0];
  const merged=context.mergeCfbContexts(g,[rival,{...rival},{...rival,type:'coach_return'}],now);
  active.applyContextsToGame(g,merged,now);
  assert.equal(g.score,row(g.id).before);assert.equal(factors(g).length,1);
  assert.match(g.editorialStorylines[0].text,/Kiffin.*Alabama/);
  const rematch=gameFor(row('401856741'));
  active.applyContextsToGame(rematch,[...rematch.qualitativeContexts,{...rival,type:'meaningful_rematch'}],now);
  assert.equal(factors(rematch).length,1);assert.equal(factors(rematch)[0].points,6);
  const older=gameFor(row('401858514'),{reviewed:false});
  active.applyContextsToGame(older,context.mergeCfbContexts(older,[{...rival,type:'playoff_rematch'}],now),now);
  assert.equal(factors(older)[0].contextType,'meaningful_rematch');assert.equal(factors(older)[0].points,2);
});
test('unrelated Notre Dame scheduling fails deterministic eligibility and cannot pass an AI editorial review',()=>{
  const g=gameFor(row('401858291')),saved=row(g.id).editorial[0];
  const article={headline:saved.sourceTitle,description:saved.sourceDescription,url:saved.sourceUrl,published:Date.parse(saved.publishedAt),teamIds:new Set(['87']),eventIds:new Set()};
  const candidate={id:'x',type:'editorial_storyline',kind:'rivalry',confidence:1,evidence:article.description,matchupEvidence:article.headline};
  assert.equal(editorialArticleEligible(article,g,now),false);assert.equal(articleMatchesGame(article,g,now),false);
  assert.equal(acceptEditorialReview({id:'x',game:g,article},candidate,{...candidate,factual:true,relevant:true,material:true,notRoutine:true,upcoming:true},now),null);
});
test('historical evidence remains eligible; current news still expires after seven days',()=>{
  const army=gameFor(row('401862823')),fact=army.qualitativeContexts[0];
  assert.ok(now-Date.parse(fact.publishedAt)>7*86400000);assert.ok(publicLinkEligible(fact,army,now));
  assert.equal(publicLinkEligible({...fact,registryVersion:undefined},army,now),false);
});
test('event facts expire, reject wrong identities/date, and never alter completed or older games',()=>{
  const g=gameFor(row('401856741')),fact=g.qualitativeContexts[0];
  for(const changed of [{id:'other'},{sport:'NFL'},{state:'completed'},{startTime:'2026-11-09T00:30Z'},
    {teams:[g.teams[1],g.teams[0]]},{timingUncertain:true},{startTime:'2025-11-07T00:30Z'}])
    assert.deepEqual(context.verifiedCfbContexts({...g,...changed},now),[]);
  assert.equal(context.verifiedCfbContextEligible(fact,g,Date.parse(fact.expiresAt)),false);
  assert.deepEqual(context.verifiedCfbContexts(g,Date.parse('2026-11-03T12:00Z')),[]);
  const registry=copy(context.REGISTRY);registry.events.find(e=>e.id===g.id).facts[0].previousSeason=2024;
  assert.deepEqual(context.verifiedCfbContexts(g,now,registry),[]);
});
test('missing/invalid sources and fabricated registry provenance fail closed',()=>{
  const g=gameFor(row('401856741')),fact=g.qualitativeContexts[0];
  for(const changes of [{url:'https://georgiadogs.com.attacker.test/news/x'},{url:'http://georgiadogs.com/news/x'},
    {evidence:''},{reviewedAt:'invalid'},{publishedAt:'2027-01-01'},{url:'https://user:password@georgiadogs.com/news/x'}]){
    const registry=copy(context.REGISTRY);Object.assign(registry.sources.georgia,changes);
    assert.deepEqual(context.verifiedCfbContexts(g,now,registry),[]);
  }
  const missing=copy(context.REGISTRY);delete missing.sources.georgia;assert.deepEqual(context.verifiedCfbContexts(g,now,missing),[]);
  for(const changes of [{text:'Invented significance'},{eventId:'wrong'},{sourceUrl:'https://example.com'},{evidence:[]}]){
    assert.equal(context.verifiedCfbContextEligible({...fact,...changes},g,now),false);
    const fresh=gameFor(row(g.id),{reviewed:false});active.applyContextsToGame(fresh,[{...fact,...changes}],now);assert.equal(fresh.score,row(g.id).before);
  }
});
test('all eight games preserve pregame credit through kickoff, early WP and meaningful play without duplicate context',()=>{
  for(const [id] of expected){
    const r=row(id),kickoff=Date.parse(r.event.date),pregame=gameFor(r,{at:kickoff-5*60000});
    let previous=copy(pregame);
    for(const [clock,wp] of [['15:00',null],['15:00',.95],['14:55',null],['14:30',.5]]){
      const game=gameFor(r,{state:'in',clock,at:kickoff+30000});
      active.enrichGame(game,summary(game,{wp}),previous);
      assert.ok(Math.abs(game.score-pregame.score)<=1,`${id} ${clock}: ${pregame.score}->${game.score}`);
      if(clock==='15:00')assert.equal(game.score,pregame.score,`${id}: kickoff/WP cannot create a jump`);
      assert.equal(game.pregameBaseline.score,pregame.score);assert.equal(game.pregameBaseline.source,'observed');
      const repeated=copy(game);active.enrichGame(game,summary(game,{wp}),repeated);assert.equal(game.score,repeated.score);
      previous=copy(game);
    }
    // The earlier checkpoints are evaluated immediately in this test. Allow
    // the intervening real match time to pass before evaluating the 8:00 play.
    // The production clock-integrity guard must still reject genuinely
    // impossible jumps when provider observations arrive seconds apart.
    if(previous.priorObservation)previous.priorObservation.observedAt=Date.now()-15*60000;
    const game=gameFor(r,{state:'in',clock:'8:00',scores:[7,0],at:kickoff+15*60000});
    const plays=[{id:'td',period:{number:1},clock:{displayValue:'8:00'},awayScore:7,homeScore:0,scoringPlay:true,type:{text:'Passing Touchdown'},text:'Away passing touchdown',team:{id:r.event.competitions[0].competitors[0].team.id}}];
    active.enrichGame(game,summary(game,{wp:.4,plays}),previous);
    assert.equal(game.pregameBaseline.score,pregame.score);assert.ok(Number.isFinite(game.score));
    const repeated=copy(game);active.enrichGame(game,summary(game,{wp:.4,plays}),repeated);assert.equal(game.score,repeated.score);
  }
});
test('browser and Worker agree with reviewed context, and completed games cannot acquire new registry credit',()=>{
  const browser=vm.runInNewContext(fs.readFileSync('dist/scoring-runtime.js','utf8')+';SportsRadarScore',{URL,Intl,console});
  const plain=x=>JSON.parse(JSON.stringify(x));
  for(const [id] of expected){
    const r=row(id),pregame=gameFor(r),live=gameFor(r,{state:'in'});
    active.enrichGame(live,summary(live,{wp:.5}),copy(pregame));
    const web=copy(live);web.sourceEvent=copy(live.sourceEvent);web.sourceCompetition=copy(live.sourceCompetition);
    browser.applyLiveSnapshot(web,web.sourceCompetition,summary(live,{wp:.5}));
    for(const key of ['score','factors','openingScore','pregameBaseline'])assert.deepEqual(plain(web[key]),plain(live[key]),`${id} ${key}`);
    const completed=gameFor(r,{state:'post',period:4,clock:'0:00',scores:[24,21]}),original=copy(completed);
    active.applyContextsToGame(completed,pregame.qualitativeContexts||[],now);
    assert.equal(completed.score,original.score);assert.deepEqual(completed.factors,original.factors);
  }
});
test('Game Center keeps scored stakes in the outlook and removes duplicate Key storylines',()=>{
  const source=fs.readFileSync('app.js','utf8');class FixedDate extends Date{static now(){return now;}}
  const api=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+source.slice(source.indexOf('function safeStoryUrl('),source.indexOf('const DETAIL_TAB_CONFIG'))+';({explainRating,upcomingLinkedStories,publicStorySentence,storylineDetails})',{Date:FixedDate,Intl,URL,safeText:String,SportsRadarScore:runtime});
  const displayed=g=>api.explainRating(g)+' '+api.storylineDetails(g);
  const before=gameFor(row('401856849'),{reviewed:false}),after=gameFor(row('401856849'));
  assert.doesNotMatch(api.explainRating(before),/holy war|rivalry|bragging rights/i);
  assert.match(api.explainRating(after),/Holy War.*first time.*top ten/i);
  assert.match(api.explainRating(gameFor(row('401856741'))),/playoff run.*quarterfinal/i);
  assert.match(api.explainRating(gameFor(row('401858291'))),/CFP selection debate/i);
  assert.match(displayed(after),/Holy War/i);
  assert.match(api.storylineDetails(after),/Sources:.*href=/,'outlook context retains its source link');
  assert.doesNotMatch(api.storylineDetails(after),/Key storylines|<li>/);
  assert.equal(after.qualitativeContexts.length,1,'evidence remains intact');
  assert.equal(api.storylineDetails({...after,state:'live'}).includes('Holy War'),true,'live storylines retain their existing behavior');
  assert.match(displayed(gameFor(row('401856740'))),/Kiffin.*Alabama/);
  const texas=gameFor(row('401856743'));
  assert.match([...(texas.qualitativeContexts||[]),...(texas.editorialStorylines||[])].map(f=>f.text).join(' '),/Columbia.*2011/,'removing standalone story text preserves underlying evidence');
  assert.match(api.storylineDetails(gameFor(row('401862823'))),/Sources:.*href=/);
  assert.match(api.storylineDetails(gameFor(row('401856743'))),/Sources:.*href=/,'a distinct informational story keeps its source link');
});
