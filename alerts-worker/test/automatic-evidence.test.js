import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {mergeFactors,saveFactors,contextsForGames,singleSourceDiscovery} from '../src/storylines.js';
import {normalizeEvent,applyContextsToGame} from '../src/live-game-model.js';
import {nflPregameContext} from '../src/nfl-pregame.js';
import {selectCfbTeamNews,canonicalResearchGame} from '../src/research-allocation.js';
const now=Date.parse('2026-11-04T21:00Z'),DAY=86400000;
const paths={CFB:'college-football',NFL:'nfl',NHL:'nhl',NBA:'nba',NCAAB:'mens-college-basketball',MLB:'mlb'};
function fixture(sport='CFB'){
  const event={id:'test',date:new Date(now+DAY).toISOString(),season:{year:2026,type:2},competitions:[{
    status:{type:{state:'pre'}},competitors:[{homeAway:'away',team:{id:'1',displayName:'Away Hawks',abbreviation:'AWY'},score:'0'},
      {homeAway:'home',team:{id:'2',displayName:'Home Bears',abbreviation:'HME'},score:'0'}]}]};
  const game=normalizeEvent(event,sport);
  const article={headline:'Away Hawks and Home Bears renew their rivalry',description:'Away Hawks face Home Bears in their annual rivalry game.',
    published:now,url:`https://www.espn.com/${paths[sport]}/story/_/id/123`,teamIds:new Set(['1','2']),eventIds:new Set(['test'])};
  return {game,article,item:{id:'i',sport,eventId:'test',game,article}};
}
function database(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  return {db,env:{DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async run(){return db.prepare(sql).run(...args);},async all(){return {results:db.prepare(sql).all(...args)};}};},async batch(writes){for(const w of writes)await w.run();}}}};
}
for(const sport of Object.keys(paths))test(`${sport}: single-source discoveries survive cache as information with zero scoring effect`,async t=>{
  const {game,article,item}=fixture(sport),{db,env}=database(t),before=structuredClone(game);
  const discovered=mergeFactors([item],[{id:'i',type:'rivalry',confidence:1,text:'Invented significance'}],[],now);
  assert.equal(discovered.length,1);assert.equal(discovered[0].type,'editorial_storyline');
  assert.equal(discovered[0].verification,'single-source');assert.equal(discovered[0].scoringEligible,false);
  assert.equal(discovered[0].text,article.headline);
  await saveFactors(env,[{key:`${sport}:test`,start:now+DAY}],discovered,now);
  assert.equal(db.prepare('SELECT factor_type FROM game_context').get().factor_type,'editorial_storyline');
  const accepted=await contextsForGames(env,[`${sport}:test`],[game],now);
  assert.equal(accepted[`${sport}:test`].length,1);
  applyContextsToGame(game,accepted[`${sport}:test`],now);
  assert.equal(game.score,before.score);assert.deepEqual(game.factors,before.factors);
  assert.equal(game.qualitativeContexts.length,0);assert.equal(game.editorialStorylines[0].sourceUrl,article.url);
  db.prepare("UPDATE game_context SET source_title='Could Away Hawks face an unrelated rival?'").run();
  assert.deepEqual(await contextsForGames(env,[`${sport}:test`],[game],now),{});
});
test('legacy cache rows and repeated ESPN reports never constitute independent corroboration',async t=>{
  const {game,article,item}=fixture(),{env,db}=database(t);
  const stories=mergeFactors([item,{...item,id:'second',article:{...article,url:article.url+'second',headline:'Home Bears face Away Hawks in an annual rivalry'}}],[],[],now);
  assert.equal(stories.length,1);assert.ok(stories.every(s=>s.editorialOnly&&s.scoringEligible===false));
  await saveFactors(env,[{key:'CFB:test',start:now+DAY}],[{sport:'CFB',eventId:'test',type:'rivalry',text:article.headline,
    sourceTitle:article.headline,sourceDescription:article.description,sourceUrl:article.url,sourcePublished:now/1000,
    sourceTeamIds:['1','2'],sourceEventIds:['test'],confidence:.99}],now);
  const res=await contextsForGames(env,['CFB:test'],[game],now);
  assert.equal(res['CFB:test'][0].type,'editorial_storyline');assert.equal(res['CFB:test'][0].verification,'single-source');
  assert.equal(db.prepare('SELECT factor_type FROM game_context').get().factor_type,'rivalry','read-time downgrade does not mutate production records');
  assert.deepEqual(await contextsForGames(env,['CFB:test'],[],now),{});
  assert.deepEqual(await contextsForGames(env,['CFB:test'],[{...game,state:'live'}],now),{});
  assert.deepEqual(await contextsForGames(env,['CFB:test'],[{...game,state:'completed'}],now),{});
});
test('unsupported speculation, stale evidence, unrelated opponents, mismatched events and unknown publishers fail closed',()=>{
  const {article,game}=fixture();
  for(const change of [{headline:'Away Hawks could renew the rivalry with Home Bears'},
    {headline:'A'.repeat(261)},{published:now-8*DAY},{published:now+DAY},{url:'https://espn.com.evil.test/college-football/story/1'},
    {headline:'Away Hawks face Other Tigers in rivalry',description:'Away faces Other in their rivalry.',teamIds:new Set(['1'])},
    {eventIds:new Set(['other'])},{headline:'Away Hawks and Home Bears play after the Tigers rivalry'},
    {url:'https://www.espn.com/college-football/preview?gameId=test'}])
    assert.equal(singleSourceDiscovery({...article,...change},game,now),null,JSON.stringify(change));
});
test('same-city and overlapping school names cannot establish a different matchup rivalry',()=>{
  const {article,game}=fixture('NCAAB');game.teams[0][0]='North Carolina Tar Heels';game.teams[1][0]='North Carolina State Wolfpack';
  assert.equal(singleSourceDiscovery({...article,headline:'North Carolina and Duke renew their rivalry',description:'The Tar Heels face Duke.'},game,now),null);
});
test('NFL cached summary news follows the same informational-only gate',()=>{
  const {game,article}=fixture('NFL');
  const news={headline:article.headline,description:article.description,published:new Date(now).toISOString(),
    links:{web:{href:article.url}},categories:[{type:'team',teamId:1},{type:'team',teamId:2}]};
  const before=structuredClone(game),stories=nflPregameContext(game,{news:{articles:[news,news]}},[news],[],now);
  assert.equal(stories.length,1);assert.equal(stories[0].verification,'single-source');
  applyContextsToGame(game,stories,now);assert.equal(game.score,before.score);assert.deepEqual(game.factors,before.factors);
});
test('additional CFB research prioritizes ranked teams without starving unranked exploration',()=>{
  const {game}=fixture();game.score=40;
  const low=canonicalResearchGame(game,now),ranked=canonicalResearchGame({...game,id:'ranked',score:60,teams:game.teams.map((t,i)=>{const team=[...t];team[6]=i?null:5;team[8]=String(i+3);return team;})},now);
  assert.deepEqual(selectCfbTeamNews([low,ranked],{},3,now),['1','3','4']);
  const second=selectCfbTeamNews([low,ranked],{'1':now,'3':now,'4':now},2,now+1);
  assert.ok(second.includes('2'));
});
