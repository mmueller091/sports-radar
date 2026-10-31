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
const uuid='12345678-1234-1234-1234-123456789abc';
examples.push(
  ['Disney+','disney',`https://www.disneyplus.com/play/${uuid}`],
  ['HBO Max','max',`https://play.hbomax.com/video/watch/${uuid}/${uuid}`],
  ['Netflix','netflix','https://www.netflix.com/watch/12345678'],
  ['YouTube TV','youtube-tv','https://tv.youtube.com/watch/test-event'],
  ['Hulu','hulu',`https://www.hulu.com/watch/${uuid}`],
  ['YouTube','youtube','https://www.youtube.com/watch?v=abcDEF123_-']
);

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

test('Disney aliases and the reported Florida–Georgia broadcast link only the named service',()=>{
  for(const channel of ['Disney+','Disney +','Disney Plus','DisneyPlus','DISNEY PLUS','ESPN on Disney+']) {
    assert.equal(watch.resolve({channel})[0].provider,'disney');
  }
  const context=vm.createContext({SportsRadarWatch:watch,safeText});
  load(context,'broadcastWatchMarkup');
  const html=context.broadcastWatchMarkup({id:'401856734',channel:'ABC · Disney+'},null,true);
  assert.match(html,/^ABC · <a /);
  assert.match(html,/href="https:\/\/www.disneyplus.com\/explore\/sports"/);
  assert.match(html,/Watch on Disney\+/);
  assert.equal((html.match(/<a /g)||[]).length,1);
  assert.equal(watch.resolve({id:'401856842',channel:'ESPN · TV'})[0].url,'https://www.espn.com/watch/');
});

test('audited service aliases resolve without inferring subscription services from networks',()=>{
  for(const [channel,id] of [
    ['HBOMax','max'],['HBO MAX','max'],['Max','max'],['YoutubeTV','youtube-tv'],['YTTV','youtube-tv'],
    ['Hulu + Live TV','hulu'],['FloSports','flo'],['DAZN (YES)','dazn'],['DAZN MEM','dazn'],
    ['NBA League Pass','nba'],['MW+','mw'],['Mountain West Plus','mw'],['Midco Sports Plus','midco'],
    ['SWAC TV','swac'],['YouTube','youtube'],['Prime Video (Local)','prime'],['ESPN Unlmtd','espn'],['SEC Network +','espn']
  ]) assert.equal(watch.resolve({channel})[0]?.provider,id,channel);
  for(const channel of ['ABC','NBC','CBS','FOX','FS1','TNT','TBS','truTV','BTN','NBA TV','Streaming','TV','Disney Channel','YouTube Music','DAZN Radio','Suns Live']) {
    assert.deepEqual(watch.resolve({channel}),[],channel);
  }
});

test('multiple explicit services have independent anchors on cards and in Game Center',()=>{
  const context=vm.createContext({SportsRadarWatch:watch,safeText});
  load(context,'broadcastWatchMarkup');
  for(const inline of [false,true]) {
    const html=context.broadcastWatchMarkup({channel:'ABC · Disney+ · ESPN+ · HBO Max · Netflix · YouTube TV'},null,inline);
    assert.equal((html.match(/<a /g)||[]).length,5);
    for(const host of ['disneyplus.com','espn.com','hbomax.com','netflix.com','tv.youtube.com']) assert.ok(html.includes(host));
    assert.doesNotMatch(html,/onclick|window.open|intent:/);
  }
});

test('missing/malformed broadcast metadata stays empty and cannot manufacture a stream',()=>{
  for(const game of [undefined,null,{}, {channel:null},{channel:42},{channel:[]},{watchLinks:[{provider:'disney',url:'https://evil.example'}]}]) {
    assert.deepEqual(watch.resolve(game,null,{broadcasts:[null,{}],geoBroadcasts:42,links:[null]}),[]);
  }
  assert.deepEqual(watch.resolve({}, {links:[{rel:['watch'],href:examples[5][2]}]}),[],'a URL alone does not assert service availability');
  assert.equal(watch.resolve({}, {broadcasts:[{media:{name:'Disney Plus'}}]})[0].provider,'disney');
});

test('every direct provider rejects redirect tricks and spoofed URLs while preserving its official fallback',()=>{
  for(const [channel,id,url] of examples) {
    const provider=watch.providers.find(p=>p.id===id);
    for(const unsafe of [
      url.replace('https:','http:'),url.replace('https://','https://user:pass@'),
      url.replace(new URL(url).hostname,new URL(url).hostname+'.evil.example'),
      url+(url.includes('?')?'&':'?')+'redirect_uri=https://evil.example',
      url+(url.includes('?')?'&':'?')+'callback=https://evil.example',
      url+'#https://evil.example',url.replace('https://','https:////'),
      url.replace(new URL(url).pathname,'/redirect/../'+new URL(url).pathname.slice(1)),
      url.replace(new URL(url).pathname,new URL(url).pathname+'/%252f%252fevil.example'),
      url.replace(new URL(url).pathname,new URL(url).pathname+'/%2e%2e/redirect')
    ]) {
      const result=watch.resolve({channel},{links:[{rel:['watch'],href:unsafe}]})[0];
      assert.equal(result.direct,false,unsafe);
      assert.equal(result.url,provider.sports);
    }
    assert.equal(watch.resolve({channel},{broadcasts:[{links:[{rel:['highlights','watch'],href:url}]}]})[0].direct,false);
    assert.equal(watch.resolve({channel},{links:[{rel:['highlights','watch'],href:url}]})[0].direct,false);
  }
});
