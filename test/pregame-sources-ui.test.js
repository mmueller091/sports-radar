import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {browser} from './helpers/overtime-terminology.mjs';

const source=fs.readFileSync('app.js','utf8');
const baseline=execFileSync('git',['show','e62015cd791dccbf714cfc8b8728e9ad68c0f8d0:app.js'],{encoding:'utf8',maxBuffer:4*1024*1024});
const fixture=JSON.parse(fs.readFileSync('test/fixtures/storyline-significance-20261104.json'));
class FixedDate extends Date{static now(){return Date.parse(fixture.capturedAt);}}
const ui=text=>{const b=browser(text);b.Date=FixedDate;return b;};
const target=(sport='NFL')=>({...structuredClone(fixture.game),sport,score:40,qualitativeContexts:structuredClone(fixture.contexts),pregameContextSummary:fixture.contexts[0].publicText});
const paragraph=html=>html.match(/<p class="detail-explanation detail-why-text">([\s\S]*?)<\/p>/)?.[1];

test('outlook construction and storyline selection are byte-for-byte unchanged',()=>{
  const block=s=>s.slice(s.indexOf('function explainRating('),s.indexOf('function trendFor(')).replaceAll('\r\n','\n');
  assert.equal(block(source),block(baseline));
});

for(const sport of ['NFL','CFB','NHL','MLB','NBA','NCAAB','Soccer','Tennis'])for(const width of [390,1440]){
  test(`${sport} ${width}px markup: sources sit inside the unchanged outlook card without mutating data`,()=>{
    const game=target(sport),original=JSON.stringify(game),before=ui(baseline),after=ui(source);
    before.innerWidth=width;after.innerWidth=width;
    before.renderDetailContent(game,{});after.renderDetailContent(game,{});
    const html=after.detail.innerHTML;
    assert.equal(paragraph(html),paragraph(before.detail.innerHTML));
    assert.match(html,/Pregame rating 40/);assert.match(html,/Pregame outlook/);
    assert.match(html,/<div class="detail-radar-why">[\s\S]*?<\/p><div class="storyline-section"><p class="detail-empty">Sources: [\s\S]*?<\/div><\/div><\/section>/);
    assert.doesNotMatch(html,/Key storylines|<section class="detail-section storyline-section"|Read source|Additional source/);
    assert.equal((after.storylineDetails(game).match(/<a /g)||[]).length,3);
    assert.equal(JSON.stringify(game),original);assert.equal(game.score,40);
  });
}

test('sources use available publication labels, omit invalid URLs and deduplicate only displayed links',()=>{
  const game=target(),story=game.qualitativeContexts[0],url='https://www.espn.com/nfl/story/123';
  game.editorialStorylines=[];story.sourceUrl=url;story.sources=[
    {url,publisher:'ESPN'},{url:url+'#details'},{url:'javascript:alert(1)'},{url:'#'},{},
    {url:'https://user:secret@example.com/story'}];
  const original=JSON.stringify(game),html=ui(source).storylineDetails(game);
  assert.equal((html.match(/<a /g)||[]).length,1);assert.match(html,/>ESPN<\/a>/);
  assert.doesNotMatch(html,/javascript:|user:secret|Read source|\?/);
  assert.equal(JSON.stringify(game),original);
});

test('no valid sources means no Sources wrapper, placeholder or spacing',()=>{
  for(const metadata of [{qualitativeContexts:[],editorialStorylines:[]},
    {qualitativeContexts:[{...fixture.contexts[0],sourceUrl:'javascript:alert(1)',sources:[{url:'#'}]}],editorialStorylines:[]}]){
    const game={...target(),...metadata},original=JSON.stringify(game),before=ui(baseline),after=ui(source);
    before.renderDetailContent(game,{});after.renderDetailContent(game,{});
    assert.equal(after.storylineDetails(game),'');
    assert.doesNotMatch(after.detail.innerHTML,/Sources:|storyline-section|Key storylines/);
    assert.equal(paragraph(after.detail.innerHTML),paragraph(before.detail.innerHTML));
    assert.equal(JSON.stringify(game),original);
  }
});

test('live and completed storyline presentation remains exactly unchanged',()=>{
  for(const state of ['live','completed']){
    const game={...target(),state};
    assert.equal(ui(source).storylineDetails(game),ui(baseline).storylineDetails(game));
  }
});
