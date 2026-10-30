import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const context=vm.createContext({
  safeText:value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  teamLogoUrl:()=>'',normalizedTeamName:value=>String(value || '').trim().toLowerCase().replace(/\s+/g,' ')
});
vm.runInContext(source.slice(source.indexOf('function basketballPeriodLabel('),source.indexOf('function readRatingHistory(')),context);
vm.runInContext("let activePlayerTeam=''; let activePlayerCategory='';",context);
vm.runInContext(source.slice(source.indexOf('function detailPlayerBrowser('),source.indexOf('function detailTabSections(')),context);

const teams=[['Away Team','AWY','7','','away.png','','','','11'],['Home Team','HME','3','','home.png','','','','22']];
const group=(type,name)=>({type,name:type,displayName:type,labels:['YDS'],athletes:[{athlete:{displayName:name},stats:['42']}]});
const game=sport=>({sport,teams,state:'live',status:'Live'});
function select(team,category) {
  vm.runInContext(`activePlayerTeam=${JSON.stringify(team)};activePlayerCategory=${JSON.stringify(category)}`,context);
}

test('football player controls select one team and one provider category without inventing stats',()=>{
  const summary={boxscore:{players:[
    {team:{id:'11',displayName:'Away Team'},statistics:[group('passing','Away Passer'),group('rushing','Away Runner')]},
    {team:{id:'22',displayName:'Home Team'},statistics:[group('passing','Home Passer'),group('rushing','Home Runner')]}
  ]}};
  select('1','rushing');
  const html=context.detailPlayerBrowser(game('CFB'),summary);
  assert.match(html,/Home Runner/);assert.doesNotMatch(html,/Away Runner|Home Passer/);
  assert.match(html,/value="passing"/);assert.match(html,/value="rushing" selected/);
  assert.match(html,/data-player-team="1" aria-pressed="true"/);
  assert.match(html,/data-player-category/);assert.match(html,/42/);
  assert.equal(summary.boxscore.players[1].statistics.length,2,'source summary is unchanged');
});

test('MLB and NHL categories use their existing sport-specific tables',()=>{
  for(const [sport,categories] of [['MLB',['batting','pitching']],['NHL',['skaters','goalies']]]) {
    const summary={boxscore:{players:[
      {team:{id:'11',displayName:'Away Team'},statistics:categories.map((type,i)=>group(type,`Away ${i}`))},
      {team:{id:'22',displayName:'Home Team'},statistics:categories.map((type,i)=>group(type,`Home ${i}`))}
    ]}};
    select('1',categories[1]);
    const html=context.detailPlayerBrowser(game(sport),summary);
    assert.match(html,/Home 1/);assert.doesNotMatch(html,/Home 0|Away 1/);
    assert.ok(categories.every(key=>html.includes(`value="${key}"`)));
  }
});

test('basketball and soccer expose available sport-appropriate categories',()=>{
  const basketball={basketballBoxScore:{teams:[
    {teamId:'11',displayName:'Away Team',players:[{id:'a',name:'Away Guard',stats:{points:'11'}}]},
    {teamId:'22',displayName:'Home Team',players:[{id:'h',name:'Home Guard',stats:{points:'17'}}]}
  ]},boxscore:{players:[]}};
  select('1','box-score');
  const box=context.detailPlayerBrowser(game('NBA'),basketball);
  assert.match(box,/Home Guard/);assert.doesNotMatch(box,/Away Guard/);assert.match(box,/Box score/);
  const soccer={boxscore:{players:[{team:{id:'11',displayName:'Away Team'},statistics:[group('goalkeeping','Keeper')]}]}};
  select('0','goalkeeping');
  assert.match(context.detailPlayerBrowser(game('Soccer'),soccer),/Keeper/);
  assert.equal(context.detailPlayerBrowser(game('Soccer'),{}),'');
});

test('a category absent for the selected team remains an honest empty state',()=>{
  const summary={boxscore:{players:[
    {team:{id:'11',displayName:'Away Team'},statistics:[group('passing','Away Passer')]},
    {team:{id:'22',displayName:'Home Team'},statistics:[group('rushing','Home Runner')]}
  ]}};
  select('1','passing');
  const html=context.detailPlayerBrowser(game('NFL'),summary);
  assert.match(html,/No player statistics are available for this team and category/);
  assert.doesNotMatch(html,/Away Passer|Home Runner/);
});
