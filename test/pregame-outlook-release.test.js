import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app.js','utf8').replaceAll('\r\n','\n');
const explain=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('\nfunction trendFor('))+';explainRating');
const team=(name,abbr,record,rank=null)=>[name,abbr,'0','','',record,rank,name,abbr];
const game=(sport,teams,factors,line=null)=>({sport,state:'upcoming',score:59,teams,factors,line,live:{}});
const factor=(label,points=4,extra={})=>({label,points,...extra});

test('NHL outlook uses the matchup rather than a generic previous-game recap',()=>{
  const input=game('NHL',[team('Detroit Red Wings','DET','7-4-0'),team('Tampa Bay Lightning','TB','6-5-0')],[
    factor('Both winning records'),factor('Atlantic Division matchup'),
    factor('Recent notable performance',2,{contextType:'notable_recent_performance',contextText:'Detroit beats Florida in its previous game'})]);
  const text=explain(input);
  assert.match(text,/standings points/i);
  assert.match(text,/similar records|competitive/i);
  assert.doesNotMatch(text,/Florida|previous game|59|source-backed|rating contribution/i);
});

test('ranked CFB rivalry, baseball pitching and an NFL favorite read differently',()=>{
  const cfb=explain(game('CFB',[team('Alabama Crimson Tide','BAMA','8-0',3),team('Georgia Bulldogs','UGA','7-1',6)],[factor('Two ranked teams'),factor('Both winning records'),factor('Rivalry')],{spread:'UGA -3'}));
  assert.match(cfb,/No\. 3 Alabama.*No\. 6 Georgia/i);
  assert.match(cfb,/close contest|familiar stakes/i);
  const mlb=explain(game('MLB',[team('Los Angeles Dodgers','LAD','80-50'),team('New York Mets','NYM','78-52')],[factor('Both winning records'),factor('Ace pitching matchup',5,{contextType:'ace_pitching_matchup',contextText:'Two aces are confirmed to start tonight'})]));
  assert.match(mlb,/winning records/i);
  assert.match(mlb,/aces|pitching/i);
  const nfl=explain(game('NFL',[team('Kansas City Chiefs','KC','9-1'),team('Las Vegas Raiders','LV','2-8')],[factor('Projected spread mismatch',-5)],{spread:'KC -14'}));
  assert.match(nfl,/one-sided game is a real possibility/i);
  for(const text of [cfb,mlb,nfl])assert.doesNotMatch(text,/\b(?:baseline|modifier|source-backed|scoring component|provider reconciliation)\b|\+\d/);
});

test('ordinary basketball and Grand Slam fixtures avoid invented stakes',()=>{
  const nba=explain(game('NBA',[team('Charlotte Hornets','CHA','4-10'),team('Washington Wizards','WSH','3-11')],[]));
  assert.doesNotMatch(nba,/playoff|rival|championship|injur/i);
  const tennis=explain(game('Tennis',[team('Player A','A',''),team('Player B','B','')],[factor('Major tournament')]));
  assert.match(tennis,/tennis.*biggest stages/i);
  assert.doesNotMatch(tennis,/ranked|seed|record|rival/i);
});
