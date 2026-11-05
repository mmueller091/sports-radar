import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {documentFromHtml,verifiedEvidenceFactors,revalidateEvidence,officialLinks,SOURCE_LIMITS,distinctEvidenceFactors} from '../src/source-evidence.js';
import {researchOfficialSources} from '../src/source-research.js';
import {deterministicFactor,saveFactors,contextsForGames,refreshStorylines} from '../src/storylines.js';
import {normalizeEvent,applyContextsToGame} from '../src/live-game-model.js';
import {canonicalResearchGame} from '../src/research-allocation.js';
import {OPEN_NEWS_KEY} from '../src/open-news-discovery.js';
import cfbContext from '../../scoring/cfb-verified-context.cjs';
const now=Date.parse('2026-11-04T22:30:00Z'),DAY=86400000;
const paths={CFB:'https://www.ncaa.com/news/football/fbs/2026/11/03/history',NFL:'https://www.nfl.com/news/history',NHL:'https://www.nhl.com/news/history',NBA:'https://www.nba.com/news/history',NCAAB:'https://www.ncaa.com/news/basketball-men/d1/2026/11/03/history',MLB:'https://www.mlb.com/news/history'};
function game(sport='NFL'){
  return normalizeEvent({id:'evidence-test',date:'2026-11-06T01:15:00Z',season:{year:2026,type:2},competitions:[{status:{type:{state:'pre'}},
    competitors:[{homeAway:'away',team:{id:'30',displayName:'Jacksonville Jaguars',abbreviation:'JAX'},score:'0'},
      {homeAway:'home',team:{id:'33',displayName:'Baltimore Ravens',abbreviation:'BAL'},score:'0'}]}]},sport);
}
const doc=(url,body,extra={})=>({version:1,url,title:'Official release',body,published:now-DAY,retrievedAt:now,authors:['League Communications'],section:'Official release',links:[],...extra});
const transcript=()=>doc('https://www.baltimoreravens.com/news/transcript-press-conferences-11-3-26',
  "HEAD COACH JESSE MINTER\nWe'll be starting Joe [Fagnano] at quarterback this week on Thursday.\nQB JOE FAGNANO\nI will be ready.",
  {title:'Transcript: Press Conferences (11/3/26)',section:'Transcripts'});
const factors=(g,docs,at=now,slate=[g])=>verifiedEvidenceFactors(g,docs,deterministicFactor,at,slate);
function database(t,feed){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  if(feed)db.prepare('INSERT INTO sports_feed(id,payload) VALUES (1,?)').run(JSON.stringify(feed));
  const env={DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(writes){for(const w of writes)await w.run();}}};
  return {db,env};
}
for(const sport of Object.keys(paths))test(`${sport}: authoritative historical evidence automatically survives cache and scores without registry`,async t=>{
  const g=game(sport),baseline=g.score,{env}=database(t),d=doc(paths[sport],'Jacksonville Jaguars and Baltimore Ravens share a longstanding rivalry dating to 1996.',{published:now-1000*DAY});
  const found=factors(g,[d]);assert.equal(found.length,1);assert.equal(found[0].verification,'authoritative-history');assert.ok(!found[0].registryVersion);
  await saveFactors(env,[{key:sport+':'+g.id,start:Date.parse(g.startTime)}],found,now);
  const restored=await contextsForGames(env,[sport+':'+g.id],[g],now);assert.equal(restored[sport+':'+g.id].length,1);
  applyContextsToGame(g,restored[sport+':'+g.id],now);
  assert.ok(g.score>baseline);assert.ok(g.factors.some(f=>f.contextType==='rivalry'));
  assert.ok(g.qualitativeContexts[0].evidence.rationale);assert.equal(g.qualitativeContexts[0].evidence.documents[0].body,undefined,'full source bodies stay in research cache');
  assert.equal(g.factors.find(f=>f.contextType==='rivalry').sourceEvidence.documents[0].url,d.url);
});
test('coach confirmation earns existing starter points, with exact passage and read-time revalidation',async t=>{
  const g=game(),before=g.score,{db,env}=database(t),found=factors(g,[transcript()]);assert.equal(found.length,1);
  assert.equal(found[0].type,'confirmed_key_starters');assert.equal(found[0].verification,'authoritative-primary');
  await saveFactors(env,[{key:'NFL:'+g.id,start:Date.parse(g.startTime)}],found,now);
  const read=()=>contextsForGames(env,['NFL:'+g.id],[g],now);
  applyContextsToGame(g,(await read())['NFL:'+g.id],now);assert.equal(g.score-before,4);
  assert.equal(g.factors.find(f=>f.contextType==='confirmed_key_starters').sourceEvidence.passage,found[0].text);
  const row=db.prepare('SELECT context_text FROM game_context').get(),saved=JSON.parse(row.context_text);
  for(const mutation of [s=>delete s.evidence,s=>s.evidence.documents[0].body='No starter confirmed.',s=>s.evidence.teamIds.reverse(),s=>s.evidence.documents[0].published=now-8*DAY,s=>s.evidence.documents[0].url='https://baltimoreravens.com.evil.test/news/fake']){
    const changed=structuredClone(saved);mutation(changed);db.prepare('UPDATE game_context SET context_text=?').run(JSON.stringify(changed));assert.deepEqual(await read(),{});
  }
});
test('wrong games, uncertain schedules, expired facts and unsupported claims fail closed',()=>{
  const g=game(),d=transcript(),f=factors(g,[d])[0];
  for(const patch of [{state:'completed'},{startTime:'invalid'},{timingUncertain:true},{startTime:'2026-11-07T01:15Z'},{sport:'NBA'},
    {teams:[['Other Hawks','OTH','0','','','',null,'','99'],g.teams[1]]}]){
    const changed={...g,...patch};assert.equal(revalidateEvidence(f,changed,deterministicFactor,now),null,JSON.stringify(patch));
  }
  assert.equal(revalidateEvidence(f,g,deterministicFactor,Date.parse(f.expiresAt)),null);
  for(const text of ["We might be starting Joe Fagnano at quarterback on Thursday.","Will Joe Fagnano start at quarterback on Thursday?",
    "We'll be starting Joe Fagnano at quarterback next Monday.","We'll be starting Joe Fagnano at quarterback on 2026-11-09.",
    "Jaguars quarterback John Smith will start on Thursday."])
    assert.deepEqual(factors(g,[{...d,body:'HEAD COACH JESSE MINTER\n'+text}]),[],text);
  assert.deepEqual(factors(g,[{...d,body:d.body.replace('HEAD COACH JESSE MINTER','QB JOE FAGNANO')}]),[]);
  assert.deepEqual(factors(g,[{...d,body:d.body.replace('HEAD COACH JESSE MINTER','FAN OPINION')}]),[]);
  assert.deepEqual(factors(g,[{...d,retrievedAt:now+DAY}]),[]);
  for(const patch of [{body:{}},{title:{}},{authors:[{}]},{links:[{}]},{section:{}},{published:null}])assert.deepEqual(factors(g,[{...d,...patch}]),[]);
  assert.deepEqual(factors(g,[d],now,[g,{...g,id:'doubleheader'}]),[]);
  assert.deepEqual(factors(g,[{...d,body:d.body.replace('Thursday','2026-11-05')}],now,[g,{...g,id:'doubleheader'}]),[]);
});
test('independent reporters require distinct publishers and named original sources, not copies or shared attribution',()=>{
  const g=game();
  const one=doc('https://www.espn.com/nfl/story/_/id/1/report','Adam One independently confirmed to ESPN that Ravens quarterback Joe Fagnano will start on Thursday. Reporters attended the practice session.',{authors:['Reporter Alpha'],section:'NFL',title:'Ravens starter decision'});
  const two=doc('https://www.reuters.com/article/2/report','Bill Two told Reuters that Baltimore announced Joe Fagnano as the starting quarterback on Thursday. The coaching staff met at its facility to complete preparations.',{authors:['Reporter Beta'],section:'NFL',title:'Baltimore confirms lineup'});
  assert.equal(factors(g,[one]).length,0);assert.equal(factors(g,[one,two]).length,1);
  assert.equal(factors(g,[one,two])[0].verification,'independently-corroborated');
  for(const other of [{...two,url:'https://www.espn.com/nfl/story/_/id/2/report'}, {...two,authors:one.authors}, {...two,body:one.body},
    {...two,body:two.body.replace('Bill Two','Adam One')},{...two,body:two.body+' According to ESPN.'},
    {...two,body:two.body.replace('Joe Fagnano','Other Player')},{...two,body:two.body.replace('Thursday','Friday')},
    {...two,body:two.body+' Reuters syndicated this report.'},{...two,body:'Baltimore announced Joe Fagnano as the starting quarterback on Thursday. Bill Two told Reuters about stadium parking.'}])assert.equal(factors(g,[one,other]).length,0,JSON.stringify(other));
  assert.equal(factors(g,[{...one,links:['https://original.test/news/release']},{...two,links:['https://original.test/news/release']}]).length,0);
});
test('trade story requires a material first appearance, not every following game',()=>{
  const g=game('NHL');g.teams[0][0]='Nashville Predators';g.teams[1][0]='Colorado Avalanche';
  const url='https://www.nhl.com/news/transaction';
  for(const body of ['Nashville Predators announced Shane Wright was traded on Sunday.',
    'Nashville Predators announced Shane Wright made his team debut on Tuesday after a blockbuster trade.',
    'Nashville Predators announced Shane Wright will play on Thursday after a trade.'])assert.deepEqual(factors(g,[doc(url,body)]),[]);
  const body='Nashville Predators announced Shane Wright will make his team debut on Thursday after a blockbuster trade.';
  assert.equal(factors(g,[doc(url,body)]).length,1);
});
test('historical rematches expire by season and do not need fresh reporting',()=>{
  const g=game('NFL'),d=doc(paths.NFL,'Baltimore Ravens defeated Jacksonville Jaguars in the 2025 Super Bowl.',{published:now-500*DAY});
  assert.equal(factors(g,[d])[0]?.type,'championship_rematch');
  assert.deepEqual(factors(g,[{...d,body:d.body.replace('2025','2024')}]),[]);
});
test('reviewed Alabama-LSU history is durable, exact-pair bound and does not duplicate automatic rivalry',()=>{
  const g=game('CFB');g.teams[0][8]='333';g.teams[1][8]='99';
  const facts=cfbContext.verifiedCfbContexts(g,now);assert.equal(facts.length,1);assert.equal(facts[0].factKey,'alabama-lsu');
  assert.equal(cfbContext.mergeCfbContexts(g,[{type:'rivalry',text:'automatic duplicate'}],now).length,1);
  assert.equal(cfbContext.verifiedCfbContexts({...g,teams:[g.teams[0],['Other','','','','','',null,'','30']]},now).length,0);
  const future={...g,id:'future',teams:[g.teams[1],g.teams[0]],startTime:'2027-11-06T01:15Z'};
  assert.equal(cfbContext.verifiedCfbContexts(future,Date.parse('2027-11-04T22:00Z'))[0].factKey,'alabama-lsu');
  assert.equal(cfbContext.verifiedCfbContexts({...g,state:'completed'},now).length,0);
});
test('JSON-LD parsing requires real article content, valid canonical identity and bounded responses',()=>{
  const url=transcript().url,node={'@type':'NewsArticle',headline:'Transcript',datePublished:new Date(now-DAY).toISOString(),articleBody:transcript().body,author:{name:'Team'},url};
  const html=n=>'<script type="application/ld&#x2B;json">'+JSON.stringify(n)+'</script>';
  assert.ok(documentFromHtml(html(node),url,now));
  for(const patch of [{articleBody:undefined},{url:'https://evil.test/a'},{url:'https://['},{datePublished:new Date(now+DAY).toISOString()},{articleBody:'x'.repeat(32001)}])assert.equal(documentFromHtml(html({...node,...patch}),url,now),null);
  assert.equal(documentFromHtml('x'.repeat(SOURCE_LIMITS.bytes+1),url,now),null);
  assert.deepEqual(officialLinks('<a href="https://baltimoreravens.com.evil.test/news/transcript">Press conference transcript</a>', 'https://www.baltimoreravens.com/news/transcripts',game()),[]);
});
test('source failures, redirects and size limits stop without retries or consuming extra slots',async t=>{
  const g=canonicalResearchGame(game(),now),item={game:g,article:{headline:'Ravens confirmed starting quarterback Joe Fagnano',description:''}},original=fetch;
  t.after(()=>globalThis.fetch=original);
  for(const response of [new Response('blocked',{status:429}),new Response('',{status:302,headers:{Location:'https://other.test'}}),new Response('large',{headers:{'Content-Type':'text/html','Content-Length':String(SOURCE_LIMITS.bytes+1)}})]){
    let calls=0;globalThis.fetch=async()=>{calls++;return response;};
    const r=await researchOfficialSources([item],{},deterministicFactor,now);assert.equal(calls,1);assert.equal(r.diagnostics.failed,true);assert.equal(r.documents.length,0);
    const next=await researchOfficialSources([item],r,deterministicFactor,now+1000);assert.equal(next.diagnostics.requests,0);assert.equal(calls,1);
  }
});
test('six-sport research rotates coverage and stays within six provider and three AI calls, with GDELT dormant',async t=>{
  const original=fetch;t.after(()=>globalThis.fetch=original);const covered=new Set();
  for(let cycle=0;cycle<12;cycle++){
    const at=now+cycle*2*3600000,games=Object.keys(paths).map((sport,i)=>({...game(sport),id:'cycle-'+i,score:80,startTime:new Date(at+DAY).toISOString()}));
    const {env}=database(t,{updatedAt:new Date(at).toISOString(),games});let calls=0,ai=0;
    globalThis.fetch=async url=>{calls++;assert.ok(!String(url).includes('gdelt'));for(const [part,sport] of [['/nfl/','NFL'],['/mlb/','MLB'],['/nhl/','NHL'],['/nba/','NBA'],['/college-football/','CFB'],['/mens-college-basketball/','NCAAB']])if(String(url).includes(part))covered.add(sport);return Response.json(String(url).includes('wikipedia')?{pages:[]}:{articles:[]});};
    env.AI={async run(){ai++;return {response:'{"factors":[]}'}}};
    const result=await refreshStorylines(env,at);assert.ok(calls<=6);assert.equal(result.diagnostics.providerRequests,calls);assert.ok(ai<=3);
  }
  assert.equal(covered.size,6);
});

test('overlapping personnel facts and conflicting cached availability cannot stack',()=>{
  const base={...factors(game(),[transcript()])[0],sourcePublished:123};
  const returned={...base,type:'star_injury_return'};
  assert.deepEqual(distinctEvidenceFactors([base,returned]),[returned]);
  assert.deepEqual(distinctEvidenceFactors([base,{...base,type:'star_absence'}]),[]);
  const newer={...base,type:'star_absence',sourcePublished:124};
  assert.deepEqual(distinctEvidenceFactors([base,newer]),[newer]);
  const other={...returned,evidence:{...returned.evidence,subject:'other player'}};
  assert.equal(distinctEvidenceFactors([base,other]).length,2);
});

test('legacy facts can reuse independently acquired documents before the rotating writer upgrades their rows',async t=>{
  const g=game(),{db,env}=database(t),source=transcript();
  await saveFactors(env,[{key:'NFL:'+g.id,start:Date.parse(g.startTime)}],[{eventId:g.id,sport:'NFL',type:'confirmed_key_starters',confidence:.9,
    text:'Ravens quarterback Joe Fagnano will start Thursday',sourceTitle:'Ravens quarterback Joe Fagnano will start Thursday',sourceDescription:'',
    sourceUrl:'https://www.espn.com/nfl/story/_/id/1/starter',sourcePublished:(now-DAY)/1000,sourceTeamIds:['33']}],now);
  const stored=db.prepare('SELECT context_text FROM game_context').get().context_text;
  db.prepare('INSERT INTO sports_resources (key,payload,updated_at) VALUES (?,?,?)').run(OPEN_NEWS_KEY,JSON.stringify({documents:[source]}),now);
  const read=await contextsForGames(env,['NFL:'+g.id],[g],now);
  assert.equal(read['NFL:'+g.id][0].verification,'authoritative-primary');
  assert.equal(read['NFL:'+g.id][0].sourceUrl,source.url);
  assert.equal(db.prepare('SELECT context_text FROM game_context').get().context_text,stored,'reading never mutates old rows');
  db.prepare('DELETE FROM sports_resources').run();
  const missing=await contextsForGames(env,['NFL:'+g.id],[g],now);
  assert.ok(missing['NFL:'+g.id].every(f=>f.scoringEligible===false));
});

for(const sport of Object.keys(paths))test(`${sport}: a current official starter confirmation is game-bound and uses the existing sport rules`,async t=>{
  const g=game(sport),{env}=database(t);
  const role=['NFL','CFB'].includes(sport)?'quarterback':sport==='NHL'?'goalie':'pitcher';
  const text=['NBA','NCAAB'].includes(sport)?'Starting lineup confirmed for Baltimore Ravens on Thursday: John Smith will start.':`Baltimore Ravens announced ${role} John Smith will start on Thursday.`;
  const found=factors(g,[doc(paths[sport],text)]);assert.equal(found[0]?.type,'confirmed_key_starters');
  await saveFactors(env,[{key:sport+':'+g.id,start:Date.parse(g.startTime)}],found,now);
  const checked=await contextsForGames(env,[sport+':'+g.id],[g],now);assert.equal(checked[sport+':'+g.id][0].verification,'authoritative-primary');
  const before=g.score;applyContextsToGame(g,checked[sport+':'+g.id],now);assert.ok(g.score>before);
  assert.equal(factors({...g,startTime:'2026-11-07T01:15Z'},[doc(paths[sport],text)]).length,0);
});
test('quantified game-specific team records may score, while vague strength and generic player debuts do not',()=>{
  const g=game('NBA');
  assert.equal(factors(g,[doc(paths.NBA,'Baltimore Ravens announced a 10-game winning streak entering Thursday.')])[0]?.type,'team_win_streak');
  for(const text of ['Baltimore Ravens announced John Smith will make his season debut on Thursday.',
    'Baltimore Ravens announced their strength of schedule is challenging on Thursday.',
    'Baltimore Ravens announced John Smith is on a hot streak on Thursday.'])assert.equal(factors(g,[doc(paths.NBA,text)]).length,0,text);
});

test('a newer official withdrawal invalidates both fresh and cached starter evidence',async t=>{
  const g=game(),old=transcript(),withdrawal={...old,url:old.url+'-update',published:old.published+3600000,retrievedAt:now,
    body:'HEAD COACH JESSE MINTER\nJoe Fagnano will not start at quarterback on Thursday.'};
  const found=factors(g,[old]);assert.equal(found.length,1);assert.equal(factors(g,[old,withdrawal]).length,0);
  assert.equal(revalidateEvidence(found[0],g,deterministicFactor,now,[g],[withdrawal]),null);
  const {env,db}=database(t);await saveFactors(env,[{key:'NFL:'+g.id,start:Date.parse(g.startTime)}],found,now);
  db.prepare('INSERT INTO sports_resources(key,payload,updated_at) VALUES (?,?,?)').run(OPEN_NEWS_KEY,JSON.stringify({documents:[withdrawal]}),now);
  assert.deepEqual(await contextsForGames(env,['NFL:'+g.id],[g],now),{});
});
