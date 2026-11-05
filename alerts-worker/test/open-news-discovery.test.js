import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {canonicalResearchGame,RESEARCH_LIMITS} from '../src/research-allocation.js';
import {refreshStorylines,contextsForGames,deterministicFactor,saveFactors} from '../src/storylines.js';
import {OPEN_NEWS_LIMITS,eligibleOpenGame,selectOpenNewsGames,openNewsUrl,parseOpenArticles,openNewsCandidates,
  corroboratedOpenNews,mergeOpenEvidence,readOpenNewsState,historicalSearchUrl,historicalRivalry} from '../src/open-news-discovery.js';

const now=Date.parse('2026-11-04T20:00:00Z'),DAY=86400000;
function game(sport,id,a,b,rank=null){return {sport,id:String(id),state:'upcoming',score:70,startTime:new Date(now+3*DAY).toISOString(),factors:[],
  teams:[[a,a.slice(0,3).toUpperCase(),'0','','','7-1',rank,'','101'],[b,b.slice(0,3).toUpperCase(),'0','','','7-1',null,'','202']]};}
const byu=game('CFB','byu-utah','BYU Cougars','Utah Utes',9);
const dates=at=>new Date(at).toISOString().replace(/[-:]/g,'').replace('.000','');
function gdelt(title,url,seen=now){return {title,url,seendate:dates(seen)};}
const a=gdelt('BYU and Utah renew the Holy War rivalry before Saturday','https://www.espn.com/college-football/story/_/id/1');
const b=gdelt('Utah and BYU prepare for their long-running rivalry','https://apnews.com/article/holy-war-2026');

function database(t,rows){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  db.prepare('INSERT INTO sports_feed (id,payload) VALUES (1,?)').run(JSON.stringify({updatedAt:new Date(now).toISOString(),games:rows}));
  const env={DB:{prepare(sql){let args=[];return {bind(...v){args=v;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}};}};},
    async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
  return {db,env};
}

test('open discovery includes all six major sports, giving ranked college games the only extra search slots',()=>{
  const rows=[game('NFL','nfl','Philadelphia Eagles','Dallas Cowboys'),game('NBA','nba','New York Knicks','Los Angeles Lakers'),
    game('NHL','nhl','New York Rangers','Philadelphia Flyers'),game('MLB','mlb','New York Yankees','Boston Red Sox'),
    byu,game('NCAAB','ncaab','Duke Blue Devils','North Carolina Tar Heels',3),
    game('CFB','cfb-low','Away Hawks','Home Bulldogs'),game('NCAAB','ncaab-low','Other Hawks','Another Wolves')];
  const canonical=rows.map(row=>canonicalResearchGame(row,now));
  assert.equal(canonical.length,rows.length);
  assert.equal(canonical.filter(eligibleOpenGame).length,6);
  const first=selectOpenNewsGames(canonical,{},now,6);
  assert.deepEqual(new Set(first.map(row=>row.sport)),new Set(['NFL','NBA','NHL','MLB','CFB','NCAAB']));
  const next=selectOpenNewsGames(canonical,Object.fromEntries(first.slice(0,5).map(row=>[row.key,now])),now+1,5);
  assert.equal(next.length,5);
  assert.ok(next.some(row=>!first.slice(0,5).some(prior=>prior.key===row.key)));
  const url=new URL(openNewsUrl(first));
  assert.equal(url.hostname,'api.gdeltproject.org');
  assert.ok(url.searchParams.get('query').includes('BYU'));
  assert.ok(url.searchParams.get('query').includes('Utah'));
  assert.equal(url.searchParams.get('maxrecords'),String(OPEN_NEWS_LIMITS.articlesPerRequest));
  assert.equal(RESEARCH_LIMITS.providerRequests,6);
});

test('GDELT queries do not contain quoted three-letter team phrases',()=>{
  const url=new URL(openNewsUrl([canonicalResearchGame(byu,now)]));
  const query=url.searchParams.get('query');
  assert.match(query,/"BYU Cougars"/);
  assert.doesNotMatch(query,/"BYU"/);
  assert.ok([...query.matchAll(/"([^"]+)"/g)].every(match=>match[1].length>=4));
});

test('free historical discovery validates the exact pair, caches a rivalry nickname and uses it only as a search hint',()=>{
  const row=canonicalResearchGame(byu,now),url=new URL(historicalSearchUrl(row));
  assert.equal(url.hostname,'en.wikipedia.org');
  assert.ok(url.searchParams.get('q').includes('BYU Utah rivalry'));
  const history=historicalRivalry({pages:[{title:'Holy War (BYU–Utah)',
    description:'A college football rivalry between the BYU Cougars and Utah Utes.'}]},row,now);
  assert.equal(history.type,'rivalry');assert.equal(history.title,'Holy War (BYU–Utah)');
  assert.ok(new URL(openNewsUrl([row],[history])).searchParams.get('query').includes('Holy War'));
  assert.equal(historicalRivalry({pages:[{title:'Holy War (BYU–USC)',description:'A football rivalry'}]},row,now),null);
  assert.equal(historicalRivalry({pages:[{title:'2026 BYU Cougars football season',description:'BYU competes against Utah'}]},row,now),null);
});

test('verified opponent matching also works for NFL, NBA, NHL, MLB, and ranked NCAAB',()=>{
  const fixtures=[
    game('NFL','nfl','Philadelphia Eagles','Dallas Cowboys'),game('NBA','nba','New York Knicks','Los Angeles Lakers'),
    game('NHL','nhl','New York Rangers','Philadelphia Flyers'),game('MLB','mlb','New York Yankees','Boston Red Sox'),
    game('NCAAB','ncaab','Duke Blue Devils','North Carolina Tar Heels',3)];
  for(const raw of fixtures){
    const g=canonicalResearchGame(raw,now),name=raw.teams.map(t=>t[0]).join(' and ');
    const articles=parseOpenArticles({articles:[gdelt(`${name} renew their rivalry this weekend`,'https://apnews.com/article/1'),
      gdelt(`${name} meet in another chapter of their rivalry`,'https://www.espn.com/story/2')]},now);
    const accepted=openNewsCandidates([g],articles,deterministicFactor,now);
    assert.equal(accepted.length,2,g.sport);
    assert.equal(corroboratedOpenNews([g],accepted,now).length,1,g.sport);
  }
});

test('external article metadata requires fresh dates, HTTPS and recognized sources',()=>{
  const rows=[a,b,gdelt('A sketchy sports article','http://www.espn.com/article'),
    gdelt('More fake news','https://sports.unknown-website.xyz/article'),
    gdelt('Stale headline','https://www.espn.com/story/5',now-8*DAY),
    gdelt('Future headline','https://apnews.com/article/6',now+DAY),
    gdelt('Preview recap for next week','https://apnews.com/article/7')];
  const found=parseOpenArticles({articles:rows},now);
  assert.equal(found.length,2);
  assert.deepEqual(found.map(v=>v.host),['espn.com','apnews.com']);
  assert.deepEqual(parseOpenArticles({error:'429'},now),[]);
});

test('dormant adapter proposes differently worded cross-domain candidates, not scoring proof',()=>{
  const row=canonicalResearchGame(byu,now);
  const parsed=parseOpenArticles({articles:[a,b]},now);
  const facts=openNewsCandidates([row],parsed,deterministicFactor,now);
  assert.equal(facts.length,2);assert.ok(facts.every(f=>f.type==='rivalry'));
  assert.equal(corroboratedOpenNews([row],[facts[0]],now).length,0);
  assert.equal(corroboratedOpenNews([row],facts,now).length,1);
  assert.equal(corroboratedOpenNews([row],[facts[0],{...facts[1],url:'https://www.espn.com/story/duplicate',host:'espn.com'}],now).length,0);
  assert.equal(corroboratedOpenNews([row],[facts[0],{...facts[1],title:facts[0].title}],now).length,0);
  assert.equal(corroboratedOpenNews([row],[facts[0],{...facts[1],title:'BYU and Utah renew Holy War rivalry Saturday'}],now).length,0);
  assert.equal(openNewsCandidates([row],[{...parsed[0],title:'BYU coach returns against another rival'}],deterministicFactor,now).length,0);
  assert.equal(openNewsCandidates([row],[{...parsed[0],title:'Could BYU and Utah renew their rivalry?'}],deterministicFactor,now).length,0);
  assert.equal(openNewsCandidates([row],[{...parsed[0],title:'BYU and Utah announce their 2028 rivalry series'}],deterministicFactor,now).length,0);
  assert.equal(openNewsCandidates([row],[{...parsed[0],url:'https://evil.example/malware',host:'espn.com'}],deterministicFactor,now).length,0);
  assert.equal(mergeOpenEvidence(facts,facts,now).length,2);
  assert.equal(mergeOpenEvidence(facts,facts,now+8*DAY).length,0);
});

test('shared team names and unrelated opponents cannot establish matchup evidence',()=>{
  const raw=game('NCAAB','unc-ncstate','North Carolina Tar Heels','North Carolina State Wolfpack',3);
  const row=canonicalResearchGame(raw,now);
  const unrelated=parseOpenArticles({articles:[
    gdelt('North Carolina and Duke renew their rivalry','https://apnews.com/article/unc-duke'),
    gdelt('Duke and North Carolina prepare for their rivalry','https://www.espn.com/story/unc-duke')
  ]},now);
  assert.equal(openNewsCandidates([row],unrelated,deterministicFactor,now).length,0);
  assert.equal(historicalRivalry({pages:[{title:'Duke–North Carolina rivalry',description:'College basketball rivalry'}]},row,now),null);
  const byuRow=canonicalResearchGame(byu,now);
  const misleading=parseOpenArticles({articles:[
    gdelt('BYU plays Utah after the USC rivalry','https://apnews.com/article/other-rivalry'),
    gdelt('Utah faces BYU following the USC rivalry','https://www.espn.com/story/other-rivalry')
  ]},now);
  // A matchup mention is not enough when the rivalry is explicitly another team's.
  assert.equal(openNewsCandidates([byuRow],misleading,deterministicFactor,now).length,0);
});

test('new open-news evidence cannot overwrite an existing verified factor',async t=>{
  const {env,db}=database(t,[byu]);const game=canonicalResearchGame(byu,now);
  const original={eventId:game.eventId,sport:game.sport,type:'rivalry',text:'Existing verified rivalry',
    confidence:.9,sourceTitle:'Existing verified rivalry',sourceUrl:'https://www.espn.com/story/existing',sourcePublished:Math.floor(now/1000)};
  await saveFactors(env,[game],[original],now);
  const incoming={...original,text:'New open-news story',sourceTitle:'New open-news story',sourceUrl:'https://apnews.com/story/new',origin:'open-news',openNewsSources:[]};
  await saveFactors(env,[game],[incoming],now+1000);
  const saved=db.prepare('SELECT source_title,source_url FROM game_context').get();
  assert.equal(saved.source_title,original.sourceTitle);assert.equal(saved.source_url,original.sourceUrl);
});

test('GDELT remains dormant on every scheduled cycle, even with cached corroboration',async t=>{
  const {env,db}=database(t,[byu]);
  const old=globalThis.fetch,calls=[];t.after(()=>{globalThis.fetch=old;});
  globalThis.fetch=async url=>{calls.push(url);assert.ok(!url.includes('gdelt'));return Response.json(url.includes('wikipedia')?{pages:[]}:{articles:[]});};
  for(let cycle=0;cycle<12;cycle++){
    const at=now+cycle*2*3600000;
    db.prepare('UPDATE sports_feed SET payload=?').run(JSON.stringify({updatedAt:new Date(at).toISOString(),games:[byu]}));
    calls.length=0;const result=await refreshStorylines(env,at);
    assert.ok(calls.length<=6);assert.equal(result.diagnostics.openNews.enabled,false);
    assert.equal(result.diagnostics.openNews.attempted,false);assert.equal(result.diagnostics.savedFactors,0);
  }
  await saveFactors(env,[canonicalResearchGame(byu,now)],[{eventId:byu.id,sport:'CFB',type:'rivalry',text:a.title,
    confidence:.99,sourceTitle:a.title,sourceUrl:a.url,sourcePublished:now/1000,origin:'open-news',
    openNewsSources:parseOpenArticles({articles:[a,b]},now)}],now);
  assert.deepEqual(await contextsForGames(env,['CFB:'+byu.id],[byu],now),{});
});

test('historical lookup runs under the same six-request ceiling and does not score from Wikipedia alone',async t=>{
  const historicalNow=now-4*3600000;
  const {env,db}=database(t,[byu]);
  db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify({updatedAt:new Date(historicalNow).toISOString(),games:[byu]}));
  const old=globalThis.fetch,calls=[];t.after(()=>{globalThis.fetch=old;});
  globalThis.fetch=async (url,options)=>{
    calls.push({url,options});
    return Response.json(url.includes('en.wikipedia.org')?{pages:[{title:'Holy War (BYU–Utah)',
      description:'Football rivalry between BYU and Utah'}]}:{articles:[]});
  };
  const first=await refreshStorylines(env,historicalNow);
  assert.equal(first.diagnostics.openNews.historicalFound,true);
  assert.equal(first.diagnostics.openNews.corroborated,0);
  assert.equal(first.diagnostics.savedFactors,0);
  assert.ok(calls.length<=6);
  assert.ok(calls.find(x=>x.url.includes('en.wikipedia.org'))?.options?.headers?.['User-Agent']);
  assert.equal((await readOpenNewsState(env,historicalNow)).history.length,1);
  db.prepare('UPDATE sports_feed SET payload=? WHERE id=1').run(JSON.stringify({updatedAt:new Date(now).toISOString(),games:[byu]}));
  calls.length=0;
  await refreshStorylines(env,now);
  const gdeltCall=calls.find(x=>x.url.includes('api.gdeltproject.org'));
  assert.equal(gdeltCall,undefined);
});
