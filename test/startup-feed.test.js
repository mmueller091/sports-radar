import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sourceHelper from './helpers/scoring-source.cjs';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ratingCore = sourceHelper.scoringSource();

function startApp() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector,{
        innerHTML:'',textContent:'',value:selector === '#favorite-sport' ? 'NFL' : '',
        classList:{add:name => classes.add(name),remove:name => classes.delete(name),toggle:(name,force) => {
          if (force ?? !classes.has(name)) classes.add(name);
          else classes.delete(name);
        },contains:name => classes.has(name)},
        addEventListener(){},setAttribute(){},querySelectorAll(){return [];}
      });
    }
    return elements.get(selector);
  };
  let resolveFeed;
  let rejectFeed;
  const feedRequest = new Promise((resolve,reject) => {
    resolveFeed = resolve;
    rejectFeed = reject;
  });
  let nextFeed = feedRequest;
  let fetchCount = 0;
  const context = vm.createContext({
    document:{querySelector:element,querySelectorAll:() => [],addEventListener(){},hidden:false},
    window:{addEventListener(){}},
    navigator:{},location:{hash:''},
    localStorage:{getItem:() => null,setItem(){}},
    fetch:() => { fetchCount++; return nextFeed; },
    AbortSignal,setTimeout:() => 1,clearTimeout(){},setInterval(){}
  });
  vm.runInContext(ratingCore,context);
  vm.runInContext(source,context);
  return {
    element,resolveFeed,rejectFeed,
    refreshWith:response => {
      nextFeed = Promise.resolve(response);
      return vm.runInContext('loadLiveGames()',context);
    },
    get fetchCount(){return fetchCount;}
  };
}

const realGame = {
  id:'verified-game',sport:'NFL',state:'upcoming',status:'Tonight',
  startTime:'2026-10-26T23:00:00Z',teams:[
    ['Seattle Seahawks','SEA','—'],['Arizona Cardinals','ARI','—']
  ],score:72
};

test('startup renders no cards before the first feed resolves, then renders real games',async () => {
  const app = startApp();
  assert.equal(app.fetchCount,1);
  assert.doesNotMatch(app.element('#game-list').innerHTML,/game-card|Chiefs|Bills/);
  assert.equal(app.element('#empty-state h3').textContent,'Loading live scores…');
  app.resolveFeed({ok:true,json:async () => ({updatedAt:'2026-10-26T20:00:00Z',games:[realGame]})});
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.element('#game-list').innerHTML,/game-card/);
  assert.match(app.element('#game-list').innerHTML,/Seattle Seahawks/);
  assert.doesNotMatch(app.element('#game-list').innerHTML,/Chiefs|Bills/);
});

test('initial feed failure shows retry state without demo games',async () => {
  const app = startApp();
  app.rejectFeed(new Error('Feed unavailable'));
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(app.element('#game-list').innerHTML,/game-card|Chiefs|Bills/);
  assert.equal(app.element('#empty-state h3').textContent,'Live scores unavailable');
  assert.match(app.element('#empty-message').textContent,/Refresh to retry/);
  assert.match(app.element('#data-status-label').textContent,/unavailable/);
});

test('a later refresh failure keeps the last verified game and marks scores stale',async () => {
  const app = startApp();
  app.resolveFeed({ok:true,json:async () => ({updatedAt:'2026-10-26T20:00:00Z',games:[realGame]})});
  await new Promise(resolve => setImmediate(resolve));
  await app.refreshWith({ok:false,status:503});
  assert.equal(app.fetchCount,2);
  assert.match(app.element('#game-list').innerHTML,/Seattle Seahawks/);
  assert.match(app.element('#data-status-label').textContent,/Stale scores/);
});
