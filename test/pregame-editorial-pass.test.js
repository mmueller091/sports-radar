import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const fixture=JSON.parse(fs.readFileSync('test/fixtures/pregame-corpus-20261103.json'));
class AuditDate extends Date {static now(){return Date.parse(fixture.capturedAt);}}
const src=fs.readFileSync('app.js','utf8');
const {explainRating:explain}=vm.runInNewContext(src.slice(src.indexOf('function explainRating('),src.indexOf('function trendFor('))+';({explainRating})',{Date:AuditDate,Intl});
const game=id=>structuredClone(fixture.games.find(r=>r.game.id===id).game);
test('ranked quality plus a narrow market supports the watch recommendation for any eligible matchup',()=>{
  const texas=game('401856743'),before=JSON.stringify(texas),text=explain(texas);
  assert.match(text,/matching 6-2 records/);assert.match(text,/2\.5-point/);assert.match(text,/worth circling/);
  assert.equal(JSON.stringify(texas),before);
  const other=structuredClone(texas);other.id='different';other.teams[0][0]=other.teams[0][7]='North';other.teams[1][0]=other.teams[1][7]='South';
  assert.match(explain(other),/North.*South/);assert.match(explain(other),/worth circling/);
  other.line.spread='NORTH -17';assert.doesNotMatch(explain(other),/worth circling/);
  other.line.spread='NORTH -2.5';other.teams.forEach(t=>t[6]=null);assert.doesNotMatch(explain(other),/worth circling/);
});
test('Ottawa-Buffalo explains division and competitiveness without calling overtime losses wins',()=>{
  const text=explain(game('401892644'));
  assert.match(text,/9-6-1/);assert.match(text,/7-4-3/);assert.match(text,/Atlantic Division/);assert.match(text,/Sabres are (?:slight favorites|favored)/);
  assert.doesNotMatch(text,/half.*points|winning records|division lead|clinching|rivalry/);
});
test('Detroit-Tampa Bay names the favorite and divisional reason to watch without the unrelated recap',()=>{
  const text=explain(game('401892635'));
  assert.match(text,/Atlantic Division/);assert.match(text,/Lightning are clear favorites/);assert.doesNotMatch(text,/neither side much of an edge/);
  assert.doesNotMatch(text,/Lightning has|1\.5.point|Faulk|Panthers|former.*return|half.*points/);
});
test('rivalry explanations require supplied scoring facts for BYU-Utah and other games alike',()=>{
  const text=explain(game('401856849'));
  assert.match(text,/Utah's unbeaten season/);assert.doesNotMatch(text,/rivalry|bragging rights/);assert.match(text,/5\.5 points/);
  const other=game('401858291');assert.match(explain(other),/Miami's unbeaten season/);assert.doesNotMatch(explain(other),/rivalry|BYU|bragging/);
  other.factors.push({label:'Rivalry',points:4,contextType:'rivalry',contextText:'This is their final scheduled meeting before a break in the series.'});
  const result=explain(other);assert.match(result,/final scheduled meeting before a break/);assert.equal(result.match(/final scheduled meeting/g).length,1);
  other.factors.pop();assert.doesNotMatch(explain(other),/break in the series/);
});
test('sparse FCS evidence cannot manufacture a must-watch hook or postseason implications',()=>{
  const g=game('401867964');assert.equal(g.score,40);
  assert.doesNotMatch(explain(g),/worth circling|playoff|division lead|rivalry|star|injur/);
});
