import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {canonicalResearchGame,selectResearchGames,selectCfbTeamNews,cachedResearchSlate,RESEARCH_LIMITS,researchDiagnostics,publicLinkEligible} from '../src/research-allocation.js';
import {buildResearchItems,refreshStorylines,articleMatchesGame} from '../src/storylines.js';
import {measuredResearchInference} from '../src/ai-budget.js';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/research-slate-20261103.json',import.meta.url)));
const now=Date.parse(fixture.capturedAt),DAY=86400000;
const raw=(id,score=60,sport='NBA',offset=DAY)=>({id:String(id),sport,state:'upcoming',score,startTime:new Date(now+offset).toISOString(),teams:[['Away','A','0','','','5-1',null,'Away','1'],['Home','H','0','','','5-1',null,'Home','2']],factors:[]});
function database(t,feed){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  if(feed)db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify(feed));
  const env={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
  return {db,env};
}
test('captured Saturday leaders receive attention four days ahead, at noon and in prime time',()=>{
  const games=fixture.games.map(g=>canonicalResearchGame(g,now)).filter(Boolean),before=JSON.stringify(fixture);
  const selected=selectResearchGames(games,{},now);
  for(const id of ['401856743','401856741','401856849','401858291','401856740','401856745'])assert.ok(selected.some(g=>g.eventId===id),id);
  assert.equal(selected.length,30);assert.equal(JSON.stringify(fixture),before);
  assert.deepEqual(selected.slice(0,6).map(g=>g.score),[82,81,80,79,76,73]);
});
test('quality slots, sport coverage and bounded rotation do not become time-first selection',()=>{
  const games=Array.from({length:50},(_,i)=>canonicalResearchGame(raw(i,99-i,'NBA',DAY*(i%6+1)),now));
  games.push(canonicalResearchGame(raw('nfl',48,'NFL'),now));
  const first=selectResearchGames(games,{},now),last=Object.fromEntries(first.map(g=>[g.key,now]));
  const second=selectResearchGames(games,last,now+1);
  assert.equal(first.length,30);assert.equal(second.length,30);
  assert.ok(first.some(g=>g.sport==='NFL'));assert.deepEqual(first.slice(0,20).map(g=>g.key),second.slice(0,20).map(g=>g.key));
  assert.ok(second.some(g=>!last[g.key]));
});
test('spare source requests rotate through future uncurated CFB teams without increasing the provider ceiling',()=>{
  const games=Array.from({length:5},(_,i)=>{
    const g=canonicalResearchGame(raw(`g${i}`,80-i,'CFB'),now);
    g.teams[0].id=String(i*2+1);g.teams[1].id=String(i*2+2);
    return g;
  });
  const first=selectCfbTeamNews(games,{},4,now);
  assert.deepEqual(first,['1','2','3','4']);
  const second=selectCfbTeamNews(games,Object.fromEntries(first.map(id=>[id,now])),4,now+1);
  assert.deepEqual(second,['5','6','7','8']);
  assert.deepEqual(selectCfbTeamNews(games,{},0,now),[]);
});
test('unranked games below the news threshold receive rotating discovery opportunities before they earn a bonus',()=>{
  const quality=Array.from({length:40},(_,i)=>canonicalResearchGame(raw(`high-${i}`,80-i,'CFB'),now));
  const low=Array.from({length:10},(_,i)=>{
    const row=raw(`low-${i}`,35-i,'CFB');row.teams[0][8]=String(100+i*2);row.teams[1][8]=String(101+i*2);
    return canonicalResearchGame(row,now);
  });
  assert.ok(low.every(g=>g.exploratory&&!g.verifiedContext));
  const first=selectResearchGames([...quality,...low],{},now);
  assert.ok(first.filter(g=>g.exploratory).length>=2);
  assert.ok(selectCfbTeamNews(first,{},2,now).includes(first.find(g=>g.exploratory).teams[0].id));
  const previously=Object.fromEntries(first.filter(g=>g.exploratory).map(g=>[g.key,now]));
  const second=selectResearchGames([...quality,...low],previously,now+1);
  assert.ok(second.some(g=>g.exploratory&&!previously[g.key]));
});
test('unreviewed CFB rivalry articles must identify both actual opponents',()=>{
  const game=canonicalResearchGame(raw('uncurated',80,'CFB'),now);
  const article={headline:'Away and Home renew their rivalry',description:'Away meets Home this weekend for their annual rivalry.',published:now,
    url:'https://www.espn.com/college-football/story/_/id/auto',teamIds:new Set(['1','2']),eventIds:new Set()};
  assert.equal(articleMatchesGame(article,game,now),true);
  assert.equal(articleMatchesGame({...article,headline:'Away prepares for rivalry with Other',description:'Away meets Other this weekend.',teamIds:new Set(['1'])},game,now),false);
  assert.equal(articleMatchesGame({...article,headline:'Away and Home plan future rivalry for 2028',description:'The two schools announce a future series in 2028.',teamIds:new Set(['1','2'])},game,now),false);
});
test('team-specific CFB news automatically contributes a grounded fact for an unseen game',async t=>{
  const unseen=raw('unseen-game',80,'CFB');
  const {env,db}=database(t,{updatedAt:new Date(now).toISOString(),games:[unseen]});
  const original=globalThis.fetch,calls=[];t.after(()=>{globalThis.fetch=original;});
  const article={id:'new-rivalry',headline:'Away and Home renew their rivalry',description:'Away and Home meet again in their annual rivalry game.',
    published:new Date(now).toISOString(),links:{web:{href:'https://www.espn.com/college-football/story/_/id/new-rivalry'}},
    categories:[{type:'team',teamId:1},{type:'team',teamId:2}]};
  globalThis.fetch=async url=>{calls.push(url);return Response.json({articles:url.includes('team=1')?[article]:[]});};
  const result=await refreshStorylines(env,now);
  assert.equal(result.diagnostics.savedFactors,1);
  assert.equal(result.diagnostics.readAccepted,1);
  assert.equal(db.prepare('SELECT factor_type AS type FROM game_context').get().type,'rivalry');
  assert.deepEqual(result.diagnostics.teamNews.queried,['1','2']);
  assert.equal(calls.length,3);
  assert.ok(calls.every(url=>url.includes('/news?')));
  assert.ok(!JSON.stringify(unseen).includes('new-rivalry'));
});
test('only upcoming identified games within seven days enter the pool',()=>{
  for(const change of [{state:'live'},{state:'completed'},{score:NaN},{teams:[]},{startTime:new Date(now+8*DAY).toISOString()},{startTime:new Date(now-1).toISOString()}])assert.equal(canonicalResearchGame({...raw('x'),...change},now),null);
});

test('a near-term return story is not carried into an unrelated game four days away',()=>{
  const game=canonicalResearchGame(raw('future',80,'NBA',4*DAY),now);
  const article={id:'injury',headline:'Away star returns from knee injury',description:'The star is back tonight.',published:now,url:'https://www.espn.com/nba/story/1',teamIds:new Set(['1']),eventIds:new Set()};
  assert.equal(buildResearchItems([game],new Map([['NBA',[article]]]),now).length,0);
  article.eventIds.add('future');
  assert.equal(buildResearchItems([game],new Map([['NBA',[article]]]),now).length,1);
});
test('cached partitioned feed is reused; missing, stale and partial feeds fail closed',async t=>{
  const {env,db}=database(t,{updatedAt:new Date(now).toISOString(),revision:1,parts:1});
  assert.equal((await cachedResearchSlate(env,now)).reason,'incomplete-parts');
  db.prepare('INSERT INTO sports_feed_parts VALUES (1,0,?)').run(JSON.stringify([raw('x')]));
  assert.equal((await cachedResearchSlate(env,now)).games.length,1);
  assert.equal((await cachedResearchSlate(env,now+3*3600000)).reason,'stale-feed');
});
test('older exact-match evidence outranks four new loosely related articles; every selected game gets articles',()=>{
  const games=Array.from({length:30},(_,i)=>canonicalResearchGame(raw(i),now));
  const articles=Array.from({length:6},(_,i)=>({id:String(i),headline:'Away coach returns to former team',description:'Away will meet Home in this coaching reunion.',published:now-i*3600000,url:'https://www.espn.com/nba/story/'+i,teamIds:new Set(['1']),eventIds:new Set()}));
  articles[5].eventIds=new Set(['0']);
  const items=buildResearchItems(games,new Map([['NBA',articles]]),now);
  assert.equal(items.length,60);assert.equal(items[0].article.id,'5');
  assert.equal(new Set(items.map(i=>i.gameKey)).size,30);assert.ok(items.every(i=>i.article.id!=='5'||i.eventId==='0'));
});
test('a research run stays inside the existing request, item, AI and quota limits',async t=>{
  const {env,db}=database(t,{updatedAt:new Date(now).toISOString(),games:fixture.games});
  const original=globalThis.fetch,calls=[];t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async url=>{calls.push(url);return Response.json({articles:[]});};
  const result=await refreshStorylines(env,now);
  assert.ok(calls.length<=6);assert.ok(calls.every(url=>url.includes('/news?')));assert.equal(result.candidates,30);
  assert.equal(result.diagnostics.savedFactors,0);assert.equal(result.diagnostics.readAccepted,0);assert.equal(result.aiUsed,false);
  assert.equal((await researchDiagnostics(env)).candidatePool,result.diagnostics.candidatePool);
  assert.equal(db.prepare('SELECT count(*) AS n FROM research_ai_budget').get().n,0);
  assert.deepEqual(RESEARCH_LIMITS,{days:7,games:30,articles:60,perGame:4,editorialItems:8,providerRequests:6,aiRequests:3});
});
test('actual returned usage is recorded and missing or failed usage is never presented as zero',async()=>{
  const usage=[],env={AI:{run:async()=>({response:'{}',usage:{prompt_tokens:547,completion_tokens:208,neurons:12.9714}})}};
  await measuredResearchInference(env,'model',{},usage,'review');assert.equal(usage[0].neurons,12.9714);
  env.AI.run=async()=>({response:'{}'});await measuredResearchInference(env,'model',{},usage,'review');assert.equal(usage[1].neurons,null);
  env.AI.run=async()=>{throw Error('failed');};await assert.rejects(measuredResearchInference(env,'model',{},usage,'review'));
  assert.equal(usage[2].succeeded,false);assert.equal(usage[2].neurons,null);
});

test('a saturated six-sport pass respects every bound, and exhausted quota prevents all inference',async t=>{
  const paths={NFL:'nfl',MLB:'mlb',NHL:'nhl',NBA:'nba',CFB:'college-football',NCAAB:'mens-college-basketball'};
  const games=Object.keys(paths).flatMap((sport,s)=>Array.from({length:10},(_,i)=>raw(`${s}${i}`,80-i,sport)));
  const {env,db}=database(t,{updatedAt:new Date(now).toISOString(),games});
  const original=globalThis.fetch,requests=[],inferences=[];t.after(()=>{globalThis.fetch=original;});
  globalThis.fetch=async url=>{
    requests.push(url);const league=new URL(url).pathname.split('/').at(-2);
    return Response.json({articles:Array.from({length:100},(_,i)=>({id:String(i),headline:'Away names a new head coach',description:'Away appointed a new head coach for the rest of the season.',published:new Date(now-i*1000).toISOString(),
      links:{web:{href:`https://www.espn.com/${league}/story/_/id/${i}`}},categories:[{type:'team',teamId:1}]}))});
  };
  env.AI={async run(model,args){
    inferences.push(args);assert.equal(model,'@cf/meta/llama-3.1-8b-instruct-fp8');assert.equal(args.max_tokens,1200);
    assert.ok(new TextEncoder().encode(JSON.stringify(args.messages)).length<=24000);
    const prompt=args.messages[1].content;let response;
    if(prompt.includes('Sources: ')){
      const items=JSON.parse(prompt.split('Sources: ')[1]);assert.ok(items.length<=8);
      response={factors:items.map(item=>({id:item.id,type:'editorial_storyline',kind:'coaching',evidence:item.description,matchupEvidence:item.headline,confidence:.95}))};
    }else if(prompt.startsWith('For each item independently')){
      const items=JSON.parse(prompt.split('Items: ')[1]);assert.ok(items.length<=8);
      response={reviews:items.map(item=>({id:item.id,kind:item.kind,evidence:item.description,factual:true,relevant:true,material:true,notRoutine:true,upcoming:true,confidence:.95}))};
    }else response={factors:[]};
    return {response:JSON.stringify(response),usage:{prompt_tokens:100,completion_tokens:50,neurons:1}};
  }};
  const result=await refreshStorylines(env,now);
  assert.equal(requests.length,6);assert.ok(requests.every(url=>url.includes('/news?')));
  assert.equal(result.candidates,30);assert.equal(result.articles,60);assert.equal(inferences.length,3);
  assert.equal(result.diagnostics.usage.length,3);
  assert.ok(db.prepare('SELECT reserved_neurons n FROM research_ai_budget').get().n<=8000);
  const selected=selectResearchGames(games.map(g=>canonicalResearchGame(g,now)),{},now);
  const articles=Array.from({length:100},(_,i)=>({id:String(i),headline:'Away coach changes',description:'Away named a new coach to lead the team.',published:now,url:`https://www.espn.com/nba/story/${i}`,teamIds:new Set(['1']),eventIds:new Set()}));
  const items=buildResearchItems(selected,new Map(Object.keys(paths).map(s=>[s,articles])),now);
  assert.ok(selected.every(g=>items.filter(i=>i.gameKey===g.key).length<=4));
  db.prepare('UPDATE research_ai_budget SET reserved_neurons=8000').run();
  inferences.length=0;await refreshStorylines(env,now);
  assert.equal(inferences.length,0);assert.equal(db.prepare('SELECT reserved_neurons n FROM research_ai_budget').get().n,8000);
});
test('diagnostic public eligibility retains recap, preview, freshness and suppression rules',()=>{
  const story={type:'coach_return',verified:true,text:'A coaching reunion',sourceUrl:'https://www.espn.com/nba/story/x',publishedAt:new Date(now).toISOString()};
  assert.equal(publicLinkEligible(story,{},now),true);
  for(const change of [{sourceUrl:'https://www.espn.com/nba/preview?gameId=x'},{publishedAt:new Date(now-8*DAY).toISOString()},{verified:false},{type:'notable_recent_performance'},{sourceUrl:'https://user:password@example.com/story'}])assert.equal(publicLinkEligible({...story,...change},{},now),false);
  assert.equal(publicLinkEligible(story,{suppressedContextTypes:['coach_return']},now),false);
});
