const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const app = fs.readFileSync('app.js','utf8');
const scoreLogic = app.slice(app.indexOf('const SPORT_BASE'),app.indexOf('function normalizeEvent'));
const explanationLogic = app.slice(app.indexOf('function explainRating'),app.indexOf('function trendFor'));
const nflLogic = app.slice(app.indexOf('function nflWeekMeta'),app.indexOf('function dedupeGames'));
const dedupeLogic = app.slice(app.indexOf('function dedupeGames'),app.indexOf('async function loadLiveGames'));
assert.match(app,/scoreboard\?groups=80[^\n]*limit:500/);
assert.match(app,/scoreboard\?groups=81[^\n]*limit:500/);
const fixtures = `
  const cfb = {notes:[],competitors:[{team:{displayName:'Minnesota'}},{team:{displayName:'Iowa'}}]};
  const worldSeries = {notes:[{headline:'World Series - Game 1'}],competitors:[{team:{displayName:'Brewers'}},{team:{displayName:'Rays'}}]};
  const scheduledTeams = [{score:'0'},{score:'0'}];
  const ordinary = rateGame('CFB','upcoming',scheduledTeams,{name:'Minnesota vs Iowa'},cfb,'');
  const championship = rateGame('MLB','upcoming',scheduledTeams,{name:'Brewers vs Rays'},worldSeries,'');
  const postseason = rateGame('MLB','upcoming',scheduledTeams,{name:'Brewers vs Rays',season:{type:3}},{notes:[],competitors:[]},'');
  assert.equal(ordinary.score,36);
  assert.equal(championship.score,85);
  assert.ok(championship.score > ordinary.score);
  assert.equal(postseason.score,60);
  const rankedPair = {notes:[],competitors:[
    {curatedRank:{current:19},records:[{type:'overall',summary:'4-2'}]},
    {curatedRank:{current:7},records:[{type:'overall',summary:'5-1'}]}
  ]};
  const unbeatenPair = {notes:[],competitors:[
    {curatedRank:{current:10},records:[{type:'overall',summary:'6-0'}]},
    {curatedRank:{current:14},records:[{type:'overall',summary:'6-1'}]}
  ]};
  const texasOleMiss = rateGame('CFB','upcoming',scheduledTeams,{name:'Texas vs Ole Miss'},rankedPair,'');
  const utahHouston = rateGame('CFB','upcoming',scheduledTeams,{name:'Utah vs Houston'},unbeatenPair,'');
  assert.equal(texasOleMiss.score,76);
  assert.equal(utahHouston.score,80);
  assert.ok(championship.score > utahHouston.score);
  assert.ok(!ordinary.factors.some(item => /close/i.test(item.label)));
  const final = rateGame('NFL','completed',[{score:'24'},{score:'27'}],{name:'Jaguars vs Texans'},{status:{type:{detail:'Final'}}},'');
  assert.ok(final.score > final.openingScore);
  assert.equal(recordFor({records:[{type:'overall',summary:'5-2'}]}),'5-2');
  assert.equal(rankFor({curatedRank:{current:12}},'CFB'),12);
  const line = parseLine({details:'Iowa -3.5',overUnder:44.5,provider:{name:'ESPN BET'}},{});
  assert.equal(line.spread,'Iowa -3.5');
  assert.equal(line.total,44.5);
  assert.equal(displayLine({id:'test',state:'upcoming',line}).text,'Spread Iowa -3.5 · O/U 44.5');
  assert.equal(displayLine({id:'test',state:'live',line}).label,'Last listed pregame line');
  const hockeyLine = parseLine({details:'WSH -162',overUnder:5.5}, {}, 'NHL');
  assert.equal(hockeyLine.spread,'');
  assert.equal(displayLine({id:'hockey',sport:'NHL',state:'live',line:hockeyLine}).text,'Moneyline WSH -162 · O/U 5.5');
  const hockeyFinal = rateGame('NHL','completed',[{score:'2'},{score:'5'}],{name:'Capitals vs Kings'},{status:{type:{detail:'Final'}}},'');
  assert.match(hockeyFinal.reason,/goals/);
  const prose = explainRating({state:'upcoming',score:85,factors:championship.factors,teams:[['Brewers'],['Rays']]});
  assert.match(prose,/Game 1 of the World Series/);
  assert.doesNotMatch(prose,/Sport baseline/);
  const cfbProse = explainRating({state:'upcoming',score:80,factors:utahHouston.factors,teams:[['Utah','UTA','—','',null,'6-0',10],['Houston','HOU','—','',null,'6-1',14]]});
  assert.match(cfbProse,/unbeaten/);
  const unique = dedupeGames([{sport:'CFB',id:'1',division:'FBS'},{sport:'CFB',id:'1',division:'FCS'},{sport:'CFB',id:'2',division:'FBS'}]);
  assert.equal(unique.length,2);
  assert.equal(unique[0].division,'FCS');
  const meta = nflWeekMeta({season:{type:2,year:2026},week:{number:7}});
  assert.equal(meta.week,7);
  assert.equal(adjacentNFLWeek(meta,1).week,8);
  assert.equal(new URL(nflWeekFeed({sport:'NFL',url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard'},meta).url).searchParams.get('week'),'7');
  const nflGames = [
    {sport:'NFL',id:'w6a',nflWeek:2026206,state:'completed'},
    {sport:'NFL',id:'w6b',nflWeek:2026206,state:'completed'},
    {sport:'NFL',id:'w7a',nflWeek:2026207,state:'completed'},
    {sport:'NFL',id:'w7b',nflWeek:2026207,state:'completed'},
    {sport:'NFL',id:'w7m',nflWeek:2026207,state:'upcoming'},
    {sport:'NFL',id:'w8t',nflWeek:2026208,state:'upcoming'},
    {sport:'NFL',id:'w8m',nflWeek:2026208,state:'upcoming'}
  ];
  const monday = selectNFLWindow(nflGames);
  assert.equal(monday.filter(game => game.state === 'completed').length,4);
  assert.equal(monday.filter(game => game.state === 'upcoming').length,3);
  nflGames[4].state = 'completed';
  const tuesday = selectNFLWindow(nflGames);
  assert.equal(tuesday.filter(game => game.state === 'completed').length,3);
  assert.equal(tuesday.filter(game => game.state === 'upcoming').length,2);
  nflGames[5].state = 'live';
  nflGames.push({sport:'NFL',id:'w9t',nflWeek:2026209,state:'upcoming'});
  const thursday = selectNFLWindow(nflGames);
  assert.ok(thursday.some(game => game.id === 'w9t'));
  assert.ok(thursday.some(game => game.id === 'w7a'));
  console.log('Score model fixtures passed');
`;
vm.runInNewContext(`${scoreLogic}\n${explanationLogic}\n${nflLogic}\n${dedupeLogic}\n${fixtures}`,{assert,console,URL,localStorage:{getItem:()=>null}});
