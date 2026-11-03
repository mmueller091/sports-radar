import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fixture=JSON.parse(fs.readFileSync('test/fixtures/pregame-corpus-20261103.json'));
class AuditDate extends Date {static now(){return Date.parse(fixture.capturedAt);}}
const source=fs.readFileSync('app.js','utf8');
const api=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('function trendFor('))+';({explainRating,upcomingLinkedStories})',{Date:AuditDate,Intl});
const explain=api.explainRating;
for(const {game} of fixture.games)test(`production ${game.sport} ${game.id}: factual narrative leaves rating and evidence intact`,()=>{
  const frozen=JSON.stringify(game),text=explain(game);
  assert.equal(JSON.stringify(game),frozen);
  assert.ok(text.length<800,text);
  for(const t of game.teams)assert.ok(text.includes(['CFB','NCAAB'].includes(game.sport)?t[7]||t[0]:t[0]),text);
  assert.doesNotMatch(text,/\b(?:algorithm|telemetry|modifier|allocation|baseline|provider|calibration)\b|\+\d|below the strongest|below a meeting|without a listed betting line|no betting line|Lightning has|Wild has|Heat has|Jazz has|a Atlantic/i);
  if(['NHL','NBA'].includes(game.sport)&&game.factors.some(f=>/Division matchup$/.test(f.label)))assert.match(text,/Division/);
  for(const n of text.matchAll(/No\. (\d+)/g))assert.ok(game.teams.some(t=>Number(t[6])===Number(n[1])));
});
test('Saturday top six CFB games explain ranks and competitiveness without invented negatives',()=>{
  const top=fixture.games.map(r=>r.game).filter(g=>g.sport==='CFB').sort((a,b)=>b.score-a.score).slice(0,6);
  assert.deepEqual(top.map(g=>g.score),[82,81,80,79,76,73]);
  for(const game of top){const text=explain(game);assert.match(text,/ranked|top-10/);assert.match(text,/close contest|expected closeness|looks competitive/);assert.doesNotMatch(text,/limits|less certain|risk|below|multiple losses/);}
});
test('NFL scoring outlook is explained without converting a total into team statistics',()=>{
  const game=fixture.games.find(r=>r.game.id==='401873038').game,text=explain(game);
  assert.match(text,/52\.5.*scoring/);assert.doesNotMatch(text,/top.*offense|best.*offense|will score|jointly|capped/);
});
const team=(name,short,record,rank=null)=>[name,name,'0','','',record,rank,short,name];
test('ties, NHL overtime losses, openers and neutral fixtures retain their meanings',()=>{
  const base={sport:'NHL',state:'upcoming',teams:[team('Tampa Bay Lightning','Lightning','6-5-4'),team('Minnesota Wild','Wild','7-5-3')],factors:[]};
  assert.doesNotMatch(explain(base),/winning records|visits|hosts|has/);
  const opener={...base,sport:'NBA',teams:[team('Miami Heat','Heat','0-0'),team('Utah Jazz','Jazz','0-0')]};
  assert.match(explain(opener),/open their seasons/);assert.doesNotMatch(explain(opener),/unbeaten|losing|winning records/);
  const football={...base,sport:'NFL',teams:[team('One','One','4-3-1'),team('Two','Two','4-4')]};
  assert.doesNotMatch(explain(football),/both.*winning/i);
});
test('Grand Slam stage and baseball starters require actual supplied evidence',()=>{
  const base={sport:'Tennis',state:'upcoming',teams:[team('Player A','Player A',''),team('Player B','Player B','')],factors:[{label:'Major tournament',points:5}]};
  assert.match(explain(base),/tennis's biggest stages/);assert.doesNotMatch(explain(base),/seed|final|ranked|rival/);
  const baseball={...base,sport:'MLB',teams:[team('Los Angeles Dodgers','Dodgers','80-50'),team('New York Mets','Mets','78-52')],factors:[]};
  assert.doesNotMatch(explain(baseball),/pitch|ace/);
  baseball.factors=[{contextType:'ace_pitching_matchup',contextText:'Two aces are confirmed to start tonight',points:5}];
  assert.match(explain(baseball),/Two aces are confirmed/);
});
