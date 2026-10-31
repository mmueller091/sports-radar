import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import watch from '../watch-links.js';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/game-model.js';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const safeText = value=>String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function load(context,name) {
  const start=source.indexOf(`function ${name}(`);
  assert.ok(start>=0,name);
  vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}
const examples = [
  ['Peacock','peacock','https://www.peacocktv.com/watch/playback/event/test-event'],
  ['ESPN+','espn','https://www.espn.com/watch/player/_/id/test-event'],
  ['Paramount+','paramount','https://www.paramountplus.com/shows/video/test-event/'],
  ['Prime Video','prime','https://www.primevideo.com/detail/test-event'],
  ['Apple TV+','apple','https://tv.apple.com/us/sporting-event/test-game/umc.cse.test']
];

for(const [channel,id,url] of examples) {
  test(`${channel}: official sports fallback and supplied game URL across event/summary shapes`,()=>{
    const game={channel};
    assert.deepEqual(watch.resolve(game),[{provider:id,name:id==='apple'?'Apple TV':channel,url:watch.providers.find(p=>p.id===id).sports,direct:false}]);
    for(const summary of [
      {links:[{rel:['watch'],href:url}]},
      {competitions:[{geoBroadcasts:[{media:{shortName:channel},links:[{href:url}]}]}]},
      {header:{competitions:[{broadcasts:[{media:{shortName:channel},link:{href:url}}]}]}},
      {broadcasts:[{names:[channel],media:{links:[{href:url}]}}]}
    ]) assert.equal(watch.resolve(game,summary)[0].url,url);
    const serialized=JSON.parse(JSON.stringify({...game,watchLinks:watch.resolve(game,{links:[{rel:['watch'],href:url}]})}));
    assert.equal(watch.resolve(serialized)[0].url,url,'direct URL survives feed JSON');
    assert.equal(watch.resolve(serialized)[0].direct,true);
    assert.equal(game.channel,channel);
  });
}

test('mixed providers, aliases and duplicate listings preserve labels without inventing availability',()=>{
  const game={channel:'NBC · Peacock / Peacock Premium; ESPN+ & ESPN3 | Paramount Plus, Amazon Prime Video, Apple TV+'};
  const labels=game.channel;
  assert.deepEqual(watch.resolve(game).map(link=>link.name),['Peacock','ESPN+','Paramount+','Prime Video','Apple TV']);
  assert.equal(game.channel,labels);
  for(const channel of ['NBC','CBS','ABC','FOX','TNT','Not Peacock','ESPN Radio','Channel not listed',null,{},'']) assert.deepEqual(watch.resolve({channel}),[]);
});

test('unlisted broadcast names can still supply an action without replacing the channel text',()=>{
  const game={channel:'NBC'};
  assert.equal(watch.resolve(game,{broadcasts:[{names:[{name:'Peacock'}]}]})[0].name,'Peacock');
  assert.equal(game.channel,'NBC');
});

test('rejects unsafe, unrelated, spoofed and redirect URLs; always keeps a usable HTTPS fallback',()=>{
  for(const url of [
    'peacock://watch/test','intent://watch/test','javascript:alert(1)','http://www.peacocktv.com/watch/playback/event/test',
    'https://www.peacocktv.com.evil.example/watch/playback/event/test',
    'https://www.peacocktv.com@evil.example/watch/playback/event/test',
    'https://user:secret@www.peacocktv.com/watch/playback/event/test',
    'https://www.peacocktv.com:444/watch/playback/event/test',
    'https://www.peacocktv.com/redirect?url=https://evil.example',
    'https://www.peacocktv.com/watch/playback/event/test?redirect_uri=https://evil.example',
    'https://www.peacocktv.com/watch/playback/%2f%2fevil.example',
    'https://www.peacocktv.com/watch/playback/\\evil',
    'https://www.peacocktv.com/watch/home',
    'https://www.espn.com/nfl/game/_/gameId/1',
    null,{},'https://www.peacocktv.com/watch/playback/" onclick="bad'
  ]) {
    const result=watch.resolve({channel:'Peacock'},{links:[{rel:['watch'],href:url}]})[0];
    assert.equal(result.direct,false,String(url));
    assert.equal(result.url,'https://www.peacocktv.com/watch/sports');
  }
  assert.equal(watch.resolve({channel:'ESPN+'},{links:[{rel:['watch'],href:'https://www.espn.com/watch/player/'}]})[0].direct,false);
});

test('does not treat highlights, article links or another provider as the game stream',()=>{
  const url=examples[0][2];
  for(const summary of [{links:[{rel:['highlights'],href:url}]},{videos:[{links:[{href:url}]}]}, {links:[{rel:['watch'],href:examples[1][2]}]}]) {
    assert.equal(watch.resolve({channel:'Peacock'},summary)[0].direct,false);
  }
});

test('normalizer and enrichment retain only validated direct metadata without changing scores or labels',()=>{
  const competition={status:{type:{state:'pre'}},broadcasts:[{names:['Peacock']}],competitors:[
    {team:{id:'1',displayName:'Away'},homeAway:'away'},{team:{id:'2',displayName:'Home'},homeAway:'home'}]};
  const event={id:'1',date:'2026-11-01T18:00:00Z',competitions:[competition]};
  const original=normalizeEvent(structuredClone(event),'NFL');
  const withLink=normalizeEvent({...structuredClone(event),links:[{rel:['watch'],href:examples[0][2]}]},'NFL');
  assert.equal(withLink.score,original.score);
  assert.equal(withLink.channel,original.channel);
  assert.equal(JSON.parse(JSON.stringify(withLink)).watchLinks[0].url,examples[0][2]);
  assert.ok(!original.watchLinks,'no fallback URLs inflate feed snapshots');
  enrichGame(original,{header:{competitions:[{...competition,broadcasts:[{media:{shortName:'Peacock'},links:[{href:examples[0][2]}]}]}]}});
  assert.equal(original.watchLinks[0].url,examples[0][2]);
});

test('cards and Game Center share accessible native anchors and an external-link icon',()=>{
  const context=vm.createContext({SportsRadarWatch:watch,safeText});
  load(context,'broadcastWatchMarkup');
  const html=context.broadcastWatchMarkup({channel:'Peacock · ESPN+'});
  assert.equal((html.match(/<a /g)||[]).length,2);
  assert.match(html,/Watch on Peacock<svg/);
  assert.match(html,/Watch on ESPN\+<svg/);
  assert.match(html,/aria-label="Watch on Peacock \(opens externally\)"/);
  assert.match(html,/target="_blank" rel="noopener noreferrer"/);
  assert.match(html,/aria-hidden="true" focusable="false"/);
  assert.doesNotMatch(html,/onclick|window.open|intent:|peacock:/);
  assert.equal(context.broadcastWatchMarkup({channel:'Unknown'}),'');
  const inline=context.broadcastWatchMarkup({channel:'NBC · Peacock / ESPN2'},null,true);
  assert.match(inline,/NBC · <a /);
  assert.match(inline,/Watch on Peacock<svg/);
  assert.match(inline,/Watch on ESPN2<svg/);
  assert.doesNotMatch(inline,/broadcast-watch-actions/);
  assert.equal(context.broadcastWatchMarkup({channel:'Unknown'},null,true),'Unknown');
  assert.match(source,/broadcastWatchMarkup\(game,null,true\)/);
  assert.match(source,/broadcastWatchMarkup\(game,summary\)/);
});

test('provider module loads in browser and service worker upgrades include the new dependency',()=>{
  const context=vm.createContext({URL});
  vm.runInContext(fs.readFileSync(new URL('../watch-links.js',import.meta.url),'utf8'),context);
  assert.equal(context.SportsRadarWatch.resolve({channel:'Peacock'})[0].url,watch.providers[0].sports);
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(html.indexOf('src="watch-links.js?')<html.indexOf('src="app.js?'));
  assert.match(fs.readFileSync(new URL('../sw.js',import.meta.url),'utf8'),/'\.\/watch-links.js'/);
  assert.match(fs.readFileSync(new URL('../scripts/build-site.mjs',import.meta.url),'utf8'),/'watch-links.js'/);
});
