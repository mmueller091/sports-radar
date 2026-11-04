import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = path => fs.readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\r\n/g,'\n');
const source = read('app.js'), html = read('index.html');
const approved = JSON.parse(read('test/fixtures/info-copy.json'));

test('Info contains every approved heading and paragraph in order, with no extra content',() => {
  const article = html.match(/<article id="info-page"[\s\S]*?<\/article>/)[0];
  const blocks = [...article.matchAll(/<(h[12]|p)\b[^>]*>([\s\S]*?)<\/\1>/g)]
    .map(match => match[2].replace(/<[^>]+>/g,'').trim());
  assert.deepEqual(blocks,approved);
  assert.match(article,/<strong>What's worth watching right now\?<\/strong>/);
  assert.doesNotMatch(article,/<a\b|<button\b|<iframe\b|donat|ko-fi|support|contribut|fundrais/i);
  assert.match(html,/data-page="home">Slate<\/a>\s*<a[^>]+href="#info"[^>]+data-page="info">Info<\/a>/);
});

test('Info is selected on direct load using the existing route state',() => {
  const init = source.slice(source.indexOf('const state = {'),source.indexOf('\nconst $ ='));
  const context = vm.createContext({location:{hash:'#info'},teamRouteFromHash:()=>null,publicSport:()=>false,
    savedPreferences:{},normalizeCfbFilters:()=>({}),savedSports:['NFL'],savedFavorites:[],readWatchedGames:()=>new Set()});
  vm.runInContext(init,context);
  assert.equal(vm.runInContext('state.page',context),'info');
});

test('hash navigation preserves filters, favorites and watchlist across Info and Slate',() => {
  const state = {page:'home',sport:'CFB',gameState:'upcoming',showFCS:false,sportFilters:{CFB:{top25:true}},
    favoriteTeams:[{sport:'NFL',name:'Baltimore Ravens'}],watchedGames:new Set(['NFL:123'])};
  const original = structuredClone(state);
  let focused = 0;
  const context = vm.createContext({state,location:{hash:'#info'},pendingTeamReturn:null,teamReturnStack:[],
    gameRouteFromHash:()=>null,teamRouteFromHash:()=>null,activeDetailGame:null,linkedGameRequest:null,
    publicSport:()=>false,render(){},restoreTeamReturn(){},activeTeamPageKey:'',teamPageTab:'overview',
    $:()=>({focus(){focused++;}})});
  vm.runInContext(source.slice(source.indexOf('function handleLocationChange()'),source.indexOf("window.addEventListener('hashchange',handleLocationChange)")),context);
  for (const hash of ['#info','#home','#info','#home']) {
    context.location.hash = hash;
    context.handleLocationChange();
    assert.equal(state.page,hash === '#info' ? 'info' : 'home');
    for (const key of ['sport','gameState','showFCS','sportFilters','favoriteTeams','watchedGames']) assert.deepEqual(state[key],original[key]);
  }
  assert.equal(focused,2);
});

test('game links opened from Info restore the normal Slate before opening Game Center',() => {
  const opened = [],state = {page:'info',teamRoute:null};
  const context = vm.createContext({state,location:{hash:'#game/NFL/123'},pendingTeamReturn:null,teamReturnStack:[],
    gameRouteFromHash:()=>({sport:'NFL',id:'123'}),activeDetailGame:null,render(){},
    openGameDetails:(...args)=>opened.push(args)});
  vm.runInContext(source.slice(source.indexOf('function handleLocationChange()'),source.indexOf("window.addEventListener('hashchange',handleLocationChange)")),context);
  context.handleLocationChange();
  assert.equal(state.page,'home');
  assert.deepEqual(opened,[['123','NFL']]);
});
