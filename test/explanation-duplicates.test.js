import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {refinementGames} from '../scripts/nfl-refinement-report.mjs';
const source=fs.readFileSync('app.js','utf8').replaceAll('\r\n','\n');
class AuditDate extends Date {static now(){return Date.parse('2026-11-03T18:00:00Z');}}
const api=vm.runInNewContext(source.slice(source.indexOf('function explainRating('),source.indexOf('\nfunction trendFor('))+';({explainRating,publicStorySentence,upcomingLinkedStories})',{Date:AuditDate});
const explain=api.explainRating;
const title="Ravens QB Jackson to return for Bills clash, calls ankle pain 'bearable'";
const description='Ravens quarterback Lamar Jackson will return to play Sunday at Buffalo, saying the pain in his injured left ankle is "bearable."';
const base=(sport='NFL')=>({sport,state:'upcoming',score:75,teams:[['Away','AWAY','0'],['Home','HOME','0']],line:{spread:'HOME -3'},factors:[]});
test('captured Ravens source produces one return sentence and preserves the exact game and rating',()=>{
 const game=refinementGames().find(g=>g.teams.some(t=>t[1]==='BAL')),original=JSON.stringify(game),text=explain(game);
 const stories=api.upcomingLinkedStories(game).map(s=>api.publicStorySentence(s)).join(' ');
 assert.equal((text.match(/\breturn\b/gi)||[]).length,0,text);assert.match(stories,/Lamar Jackson.*return/);assert.match(text,/3-point spread/);
 assert.doesNotMatch(text+stories,/Ravens QB Jackson to return|bearable|[.!?]["”][.!?]/);assert.equal(JSON.stringify(game),original);
});
for(const sport of ['NFL','CFB','NBA','NCAAB','MLB','NHL','Soccer','Tennis'])test(`${sport}: headline plus description is one public storyline`,()=>{
 const headline='Jordan Smith returns from injury',body='Jordan Smith will return from injury for the season opener.';
 const g=base(sport);g.factors=[{contextType:'star_injury_return',contextText:headline+'. '+body,sourceUrl:'https://example.com/story',points:4}];
 g.qualitativeContexts=[{type:'star_injury_return',text:headline+'. '+body,sourceTitle:headline,sourceDescription:body,sourceUrl:'https://example.com/story'}];
 const text=explain(g);assert.equal((text.match(/Jordan Smith/g)||[]).length,1,text);assert.match(text,/will return from injury/);
});
test('old cached factors can remove their source headline without requiring a new provider field',()=>{
 const g=base();g.factors=[{contextType:'star_injury_return',contextText:title+'. '+description,points:5}];
 g.qualitativeContexts=[{type:'star_injury_return',text:title+'. '+description,sourceTitle:title}];
 const text=explain(g);assert.equal((text.match(/return/g)||[]).length,1);assert.match(text,/Lamar Jackson/);assert.doesNotMatch(text,/bearable/);
});
test('unstructured repeated sentences cannot turn one factor into repeated public facts',()=>{
 const g=base();g.factors=[{contextType:'star_injury_return',contextText:'Jordan Smith returns from injury. Jordan Smith will return from injury for the opener.',points:4}];
 const text=explain(g);assert.equal((text.match(/Jordan Smith/g)||[]).length,1,text);
});
test('identical facts in different factors and punctuation variants appear only once',()=>{
 const g=base('MLB');delete g.line;
 g.factors=[{contextType:'star_injury_return',contextText:'Jordan Smith returns from injury.',points:4},
  {contextType:'season_debut',contextText:'Jordan Smith returns from injury',points:3}];
 const text=explain(g);assert.equal((text.match(/Jordan Smith/g)||[]).length,1,text);
});
test('distinct stories survive and uncertainty is not rewritten as a confirmed return',()=>{
 const g=base('NHL');delete g.line;
 g.factors=[{contextType:'star_injury_return',contextText:'Jordan Smith could return if cleared by the medical staff.',points:4},
  {contextType:'coach_return',contextText:'Coach Taylor faces a former team for the first time.',points:3}];
 const text=explain(g);assert.match(text,/could return if cleared/);assert.match(text,/Coach Taylor faces/);assert.doesNotMatch(text,/Jordan Smith will return/);
});
test('decimal numbers, initials and closing quotes keep valid sentence punctuation',()=>{
 const g=base();g.factors=[{contextType:'notable_recent_performance',contextText:'A.J. Smith averaged 28.5 points in his last three games.',points:3}];
 assert.match(explain(g),/A\.J\. Smith averaged 28\.5 points in his last three games\./);
 g.factors[0].contextText='Jordan Smith called the matchup "special."';
 assert.doesNotMatch(explain(g),/[.!?]["”][.!?]/);
});
test('qualifying attribution and a conditional source headline cannot become a definite claim',()=>{
 const g=base();g.factors=[{contextType:'star_injury_return',contextText:'Jordan Smith plans to return, according to doctors who still require medical clearance.',points:3}];
 assert.match(explain(g),/still require medical clearance/);
 const headline='Jordan Smith could return if cleared';g.factors[0].contextText=headline+'. Jordan Smith will return on Sunday.';
 g.qualitativeContexts=[{type:'star_injury_return',text:g.factors[0].contextText,sourceTitle:headline}];
 assert.match(explain(g),/could return if cleared/);assert.doesNotMatch(explain(g),/will return on Sunday/);
});
test('the source-story list uses the same renderer and suppresses repeated entries without changing evidence',()=>{
 const context=vm.createContext({URL,safeText:String});
 vm.runInContext(source.slice(source.indexOf('function explainRating('),source.indexOf('\nfunction trendFor(')),context);
 vm.runInContext(source.slice(source.indexOf('function safeStoryUrl('),source.indexOf('const DETAIL_TAB_CONFIG')),context);
 const story={type:'star_injury_return',text:title+'. '+description,sourceTitle:title,sourceUrl:'https://example.com/story',publishedAt:new Date().toISOString()};
 const g={...base(),qualitativeContexts:[story,{...story}],factors:[{contextType:'star_injury_return',points:5}]},original=JSON.stringify(g);
 const html=context.storylineDetails(g),text=html.match(/<span>(.*?)<\/span>/)?.[1];
 assert.equal((text.match(/\breturn\b/gi)||[]).length,1);assert.doesNotMatch(text,/bearable/);assert.equal((html.match(/<li>/g)||[]).length,1);
 assert.doesNotMatch(html,/\(\+5\)|rating contribution|background context/);assert.match(html,/Read source/);assert.match(html,/https:\/\/example.com\/story/);assert.equal(JSON.stringify(g),original);
});
test('missing or partial source metadata still produces one safe statement',()=>{
 for(const metadata of [undefined,null,{},[null]]){
  const g=base();g.qualitativeContexts=metadata;
  g.factors=[{contextType:'star_injury_return',contextText:'Jordan Smith returns from injury. Jordan Smith returns for the opener.',points:4}];
  const text=explain(g);assert.equal((text.match(/Jordan Smith/g)||[]).length,1,text);
 }
});
