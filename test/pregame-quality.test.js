import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('app.js','utf8');
const fixtures=JSON.parse(fs.readFileSync('test/fixtures/pregame-quality-20261103.json'));
class AuditDate extends Date {static now(){return Date.parse(fixtures.capturedAt);}}
const api=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+';({explainRating,upcomingLinkedStories,publicStorySentence})',{Date:AuditDate});
for(const {game} of fixtures.games)test(`${game.sport} ${game.id}: captured outlook is specific, readable and read-only`,()=>{
  const input=structuredClone(game),before=JSON.stringify(input),text=api.explainRating(input);
  for(const team of game.teams)assert.ok(text.includes(['CFB','NCAAB'].includes(game.sport)?team[7]||team[0]:team[0]),text);
  assert.ok(text.length<800,text);
  assert.doesNotMatch(text,/few visible signs|brings a ranked team|\b(?:algorithm|telemetry|modifier|allocation|baseline|source-backed|provider)\b|\+\d/);
  assert.equal(JSON.stringify(input),before);
});

test('NHL puck lines never masquerade as a narrow points spread and overtime losses are not wins',()=>{
  const input=structuredClone(fixtures.games.find(row=>row.game.id==='401892635').game);
  const text=api.explainRating(input);assert.doesNotMatch(text,/1\.5-point|close contest/);
  input.teams[0][5]='6-5-4';input.teams[1][5]='7-5-3';
  assert.doesNotMatch(api.explainRating(input),/winning records/);
});

test('missing betting evidence is uncertainty, not evidence that the game has no stakes',()=>{
  const input={sport:'CFB',state:'upcoming',teams:[['One'],['Two']],factors:[]};
  assert.match(api.explainRating(input),/not available yet/);
  assert.doesNotMatch(api.explainRating(input),/no.*stakes|no.*news|no.*story/);
});

test('linked upcoming stories appear once across sections and stale/unlinked/duplicate stories are omitted',()=>{
  const story={type:'coach_return',sourceTitle:'Coach Taylor faces a former team',text:'Coach Taylor faces a former team',sourceUrl:'https://www.espn.com/nba/story/1',publishedAt:new Date(AuditDate.now()).toISOString(),verified:true};
  const input={sport:'NBA',state:'upcoming',teams:[['One'],['Two']],factors:[{contextType:'coach_return',contextText:story.text,points:4}],
    qualitativeContexts:[story,{...story},{...story,sourceUrl:'javascript:bad',text:'Unlinked'},{...story,sourceUrl:'https://',text:'Invalid URL'},
      {...story,sourceUrl:'https://user:password@example.com/story',text:'Credentials in URL'},{...story,text:'Old',publishedAt:'2020-01-01'}]};
  assert.equal(api.upcomingLinkedStories(input).length,1);
  assert.doesNotMatch(api.explainRating(input),/Coach Taylor/);
  assert.match(api.publicStorySentence(api.upcomingLinkedStories(input)[0]),/Coach Taylor/);
  assert.deepEqual(Array.from(api.upcomingLinkedStories({...input,state:'live'})),[]);
});

test('editorial story copy preserves the source headline, including uncertainty and unusual details',()=>{
  const headline="Kiffin 'sad' annual LSU-Alabama game to take hiatus in 2027";
  assert.equal(api.publicStorySentence({type:'editorial_storyline',text:headline,sourceTitle:headline,sourceDescription:'LSU coach Lane Kiffin lamented the end of an annual rivalry.'}),headline+'.');
  assert.equal(api.publicStorySentence({type:'editorial_storyline',sourceTitle:'A player could return if cleared'}),'A player could return if cleared.');
});

test('BYU–Utah rivalry is displayed only for the verified college pair without changing its score',()=>{
  const game=structuredClone(fixtures.games.find(row=>row.game.id==='401856849').game),original=JSON.stringify(game);
  assert.match(api.explainRating(game),/BYU–Utah rivalry/);assert.equal(JSON.stringify(game),original);
  assert.doesNotMatch(api.explainRating({...game,sport:'NCAAB'}),/BYU–Utah rivalry/);
  game.teams[0][8]='999';assert.doesNotMatch(api.explainRating(game),/BYU–Utah rivalry/);
});

test('a generic cached rivalry preview neither repeats the Outlook nor fills Key Storylines',()=>{
  const game=structuredClone(fixtures.games.find(row=>row.game.id==='401873026').game);
  const stories=api.upcomingLinkedStories(game);assert.equal(stories.length,1);assert.equal(stories[0].type,'star_injury_return');
  assert.doesNotMatch(api.explainRating(game),/bar stools|talk radio|social media/);
});

test('empty Game Center story and summary sections disappear',()=>{
  const empty=()=>'',context={URL,safeText:String,storylineDetails:empty,detailScoring:empty,detailLeaders:empty,detailDrives:empty,
    detailMlbPlayerStats:empty,detailStats:empty,detailNhlAdvanced:empty,detailPlayerStats:empty,detailNhlGoalies:empty,basketballBoxScoreMarkup:empty,detailPlays:empty,
    globalThis:{innerWidth:1440}};
  const section=source.slice(source.indexOf('const DETAIL_TAB_CONFIG ='),source.indexOf('function detailTabsMarkup('));
  const tabs=vm.runInNewContext(section+';detailTabSections',context);
  assert.deepEqual(Array.from(tabs({sport:'NHL',state:'upcoming'},null)),[]);
  context.storylineDetails=()=>'<section>Linked story</section>';
  assert.equal(tabs({sport:'NHL',state:'upcoming'},null).length,1);
});
