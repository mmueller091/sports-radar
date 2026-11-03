import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {EDITORIAL_TYPE,editorialArticleEligible,groundedEditorialCandidate,acceptEditorialReview,discoverEditorialStories} from '../src/editorial-context.js';
import {articleMetadata,deterministicFactor,mergeFactors,saveFactors,contextsForGames} from '../src/storylines.js';
import {normalizeEvent,applyContextsToGame} from '../src/live-game-model.js';

const now=Date.parse('2026-11-03T18:00:00Z');
const item=(headline='Oklahoma fires OC Ben Arbuckle, tabs Jason Witten as play caller',description='Oklahoma has fired offensive coordinator Ben Arbuckle after less than two seasons, the school announced on Monday.')=>({
  id:'i0',sport:'CFB',eventId:'game',gameKey:'CFB:game',matchup:'Oklahoma Sooners vs Florida Gators',
  game:{sport:'CFB',state:'upcoming',id:'game',eventId:'game',teamIds:new Set(['201','57']),teams:[{id:'201',name:'Oklahoma Sooners'},{id:'57',name:'Florida Gators'}]},
  article:{headline,description,published:now-86400000,url:'https://www.espn.com/college-football/story/_/id/50359646/oklahoma-fires-second-year-oc-ben-arbuckle-jason-witten-call-plays',teamIds:new Set(['201']),eventIds:new Set()}
});
const proposal=(i,kind='coaching')=>({id:i.id,type:EDITORIAL_TYPE,kind,evidence:i.article.description||i.article.headline,matchupEvidence:i.article.headline,confidence:.95});
const review=(i,kind='coaching')=>({id:i.id,kind,factual:true,relevant:true,material:true,notRoutine:true,upcoming:true,confidence:.95,evidence:i.article.description||i.article.headline});
const approved=i=>acceptEditorialReview(i,groundedEditorialCandidate(i,proposal(i),now),review(i),now);

test('captured coordinator change lacks an old category but qualifies only after independent review',()=>{
  const i=item();assert.equal(deterministicFactor(i.article),null);
  assert.equal(editorialArticleEligible(i.article,i.game,now),true);
  assert.equal(acceptEditorialReview(i,proposal(i),null,now),null);
  assert.ok(approved(i));
});

for(const [kind,headline,description] of [
  ['coaching','A different voice on the sideline','Oklahoma will have Jason Witten calling plays against Florida following the dismissal of its offensive coordinator.'],
  ['player_return','A long wait ends on Wednesday','The Bulls confirmed that Lonzo Ball will play against Minnesota after more than two seasons away.'],
  ['off_field','An emotional home opener','Columbus will honor Johnny and Matthew Gaudreau before hosting Florida in its home opener.'],
  ['rivalry','One last annual meeting','LSU and Alabama meet Saturday before their annual series takes a hiatus in 2027.']
])test(`${kind}: wording outside scoring keywords is reviewable without a numerical award`,()=>{
  // Controlled paraphrases based on archived/current reporting; this tests the
  // protocol, not a claim that a live model has produced the supplied verdict.
  const i=item(headline,description);
  // Match the test article to the actual sport and teams; these paraphrases are
  // controlled inputs, not captured articles or observed model verdicts.
  const scenario={player_return:{sport:'NBA',teams:[['4','Chicago Bulls'],['16','Minnesota Timberwolves']],url:'https://www.nba.com/news/test-return'},
    off_field:{sport:'NHL',teams:[['29','Columbus Blue Jackets'],['26','Florida Panthers']],url:'https://www.nhl.com/news/test-home-opener'},
    rivalry:{sport:'CFB',teams:[['99','LSU Tigers'],['333','Alabama Crimson Tide']],url:'https://www.espn.com/college-football/story/_/id/50360298/kiffin-sad-annual-lsu-alabama-game-take-hiatus-2027'}}[kind];
  if(scenario){i.sport=i.game.sport=scenario.sport;i.game.teams=scenario.teams.map(([id,name])=>({id,name}));i.game.teamIds=new Set(scenario.teams.map(t=>t[0]));
    i.article.teamIds=new Set(i.game.teamIds);i.article.url=scenario.url;i.matchup=scenario.teams.map(t=>t[1]).join(' vs ');}
  const candidate=proposal(i,kind);
  assert.ok(acceptEditorialReview(i,candidate,review(i,kind),now));
  const factors=mergeFactors([i],[],[acceptEditorialReview(i,candidate,review(i,kind),now)],now);
  assert.equal(factors.length,1);assert.equal(factors[0].type,EDITORIAL_TYPE);assert.equal(factors[0].text,headline);
});

test('source mutations, cherry-picked excerpts, wrong item, low confidence and invented facts fail',()=>{
  const i=item(),p=proposal(i);
  for(const change of [{evidence:'Jason Witten will guarantee a win.'},{evidence:i.article.description.slice(0,-15)},
    {matchupEvidence:'A game with playoff implications'},{id:'wrong'},{confidence:.89},{confidence:NaN},{kind:'trade'}])
    assert.equal(groundedEditorialCandidate(i,{...p,...change},now),null);
  for(const change of [{factual:false},{relevant:false},{material:false},{notRoutine:false},{upcoming:false},{kind:'rivalry'},
    {confidence:.89},{confidence:NaN},{evidence:'Unsupported fact'}])assert.equal(acceptEditorialReview(i,p,{...review(i),...change},now),null);
});

test('freshness, links, team/event identity and routine-content exclusions stay strict',()=>{
  const i=item();
  for(const change of [{published:now-8*86400000},{published:now+120000},{published:NaN},{url:'javascript:alert(1)'},
    {url:'https://www.espn.com.attacker.test/college-football/story/x'},{url:'https://www.espn.com/olympics/hockey/story/x'},
    {teamIds:new Set(['999'])},{teamIds:new Set(['201','57','8'])},{eventIds:new Set(['other-game'])},
    {type:'Recap'},{headline:'Oklahoma uniforms for Florida'},{headline:'Oklahoma fantasy rankings'}])assert.equal(editorialArticleEligible({...i.article,...change},i.game,now),false);
  assert.equal(editorialArticleEligible(i.article,{...i.game,state:'live'},now),false);
});

test('ordinary recaps cannot be rescued by an AI label or an approving review',()=>{
  const i=item('Oklahoma beats Florida in previous game','Oklahoma won 28-20 on Saturday.');i.article.type='Recap';
  assert.equal(acceptEditorialReview(i,proposal(i),review(i),now),null);
});

test('an expected or conditional return is rejected even if both model passes approve it',()=>{
  for(const headline of ['A player is expected to play after a suspension','A player could return if cleared','A player is optimistic about playing']){
    const i=item(headline,'The player served a suspension and has been allowed to join the team.');
    assert.equal(acceptEditorialReview(i,proposal(i,'player_return'),review(i,'player_return'),now),null);
  }
});

test('recorded Workers AI responses accept unusual coaching/rivalry stories and reject the two negative controls',async()=>{
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/editorial-model-20261103.json',import.meta.url),'utf8'));
  const items=fixture.items.map(i=>({...i,article:{headline:i.headline,description:i.description,published:i.published,url:i.url,
    teamIds:new Set(i.teamIds),eventIds:new Set(i.eventIds)},game:{id:i.eventId,eventId:i.eventId,sport:i.sport,state:'upcoming',teams:i.teams,teamIds:new Set(i.teams.map(t=>t.id))}}));
  let call=0;
  const env={DB:{prepare(){return {bind(){return this;},async run(){return {meta:{changes:1}};}};}},AI:{async run(model,args){assert.equal(model,fixture.model);assert.equal(args.response_format.type,'json_object');return fixture.responses[call++];}}};
  const accepted=await discoverEditorialStories(env,items,Date.parse(fixture.sourceCapturedAt));
  assert.equal(call,2);assert.deepEqual(accepted.map(({id,kind})=>({id,kind})),fixture.accepted);
  assert.deepEqual(accepted.map(i=>i.id),['i0','i1']);
});

test('a busy first sport does not exclude other sports from the bounded discovery pass',async()=>{
  const items=Array.from({length:12},(_,index)=>{const i=item();i.id='i'+index;
    if(index>=10){i.sport=i.game.sport='NBA';i.article.url='https://www.nba.com/news/test-coaching';}
    return i;});
  let selected;
  const env={DB:{prepare(){return {bind(){return this;},async run(){return {meta:{changes:1}};}};}},AI:{async run(model,args){
    selected=JSON.parse(args.messages[1].content.split('Sources: ')[1]);return {response:'{"factors":[]}'};}}};
  assert.deepEqual(await discoverEditorialStories(env,items,now),[]);
  assert.equal(selected.length,8);assert.ok(selected.some(i=>i.sport==='NBA'));assert.ok(selected.some(i=>i.sport==='CFB'));
});

test('disagreement, missing budget and model errors fail closed; both calls reserve budget',async()=>{
  const i=item(),calls=[];
  const env={DB:{prepare(){return {bind(){return this;},async run(){calls.push('budget');return {meta:{changes:1}};}};}},
    AI:{async run(model,args){calls.push('ai');return {response:JSON.stringify(calls.filter(c=>c==='ai').length===1?{factors:[proposal(i)]}:{reviews:[review(i)]})};}}};
  assert.equal((await discoverEditorialStories(env,[i],now)).length,1);assert.deepEqual(calls,['budget','ai','budget','ai']);
  env.AI.run=async()=>{throw Error('offline');};assert.deepEqual(await discoverEditorialStories(env,[i],now),[]);
  env.DB.prepare=()=>({bind(){return this;},async run(){return {meta:{changes:0}};}});assert.deepEqual(await discoverEditorialStories(env,[i],now),[]);
  assert.deepEqual(await discoverEditorialStories({},[i],now),[]);
});

test('AI cannot invent player or coaching details even when its category is supported',()=>{
  const i=item('Coach returns to former team','A coaching reunion at Oklahoma.');
  const [factor]=mergeFactors([i],[{id:i.id,type:'coach_return',confidence:.99,text:'Coach Invented Person returns with 10 championships.'}],[],now);
  assert.equal(factor.text,i.article.headline);assert.doesNotMatch(factor.text,/Invented/);
});

test('saved description survives round trip; upcoming editorial evidence is revalidated and live games omit it',async t=>{
  const i=item();i.article.published=Date.now()-3600000;
  const at=Date.now(),accepted=acceptEditorialReview(i,proposal(i),review(i),at);
  const factors=mergeFactors([i],[],[accepted],at);
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};},async all(){return {results:db.prepare(sql).all(...args)};}};},async batch(writes){return Promise.all(writes.map(w=>w.run()));}}};
  await saveFactors(env,[{key:'CFB:game',start:at+86400000}],factors,at);
  const current=await contextsForGames(env,['CFB:game'],[i.game]);
  assert.equal(current['CFB:game'][0].sourceDescription,i.article.description);
  assert.equal(current['CFB:game'][0].editorialOnly,true);
  assert.deepEqual(await contextsForGames(env,['CFB:game'],[{...i.game,state:'live'}]),{});
  db.prepare('UPDATE game_context SET source_title=?').run('A new unsupported headline');
  assert.deepEqual(await contextsForGames(env,['CFB:game'],[i.game]),{});
});

test('editorial stories never consume scoring slots or affect scores, factors, live output or team logos',()=>{
  for(const sport of ['NFL','CFB','NBA','NHL','NCAAB'])for(const state of ['pre','in','post']){
    const event={id:'game',date:'2026-11-04T00:00Z',competitions:[{status:{period:1,displayClock:'10:00',type:{state}},competitors:[
      {homeAway:'away',team:{id:'201',displayName:'Away',abbreviation:'AWY',logo:'away.png'},score:'0',records:[{summary:'5-2'}]},
      {homeAway:'home',team:{id:'57',displayName:'Home',abbreviation:'HME',logo:'home.png'},score:'0',records:[{summary:'5-2'}]}]}]};
    const a=normalizeEvent(structuredClone(event),sport),b=normalizeEvent(structuredClone(event),sport);
    const scored=[{type:'coach_return',text:'Coach returns to former team',confidence:.8,verified:true}];
    applyContextsToGame(a,scored);applyContextsToGame(b,[{type:EDITORIAL_TYPE,text:'Source headline',confidence:.95,verified:true,editorialOnly:true},...scored]);
    assert.equal(b.score,a.score);assert.deepEqual(b.factors,a.factors);assert.deepEqual(b.teams,a.teams);assert.deepEqual(b.qualitativeContexts,a.qualitativeContexts);
    if(state==='pre')assert.equal(b.editorialStorylines.length,1);else assert.equal(b.editorialStorylines,undefined);
  }
});
