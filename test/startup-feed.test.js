import {slateNode,slateTemplate} from './helpers/slate-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sourceHelper from './helpers/scoring-source.cjs';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ratingCore = sourceHelper.scoringSource();

function startApp(production=false) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector,selector === '#game-list' ? slateNode() : {
        innerHTML:'',textContent:'',value:selector === '#favorite-sport' ? 'NFL' : '',
        classList:{add:name => classes.add(name),remove:name => classes.delete(name),toggle:(name,force) => {
          if (force ?? !classes.has(name)) classes.add(name);
          else classes.delete(name);
        },contains:name => classes.has(name)},
        addEventListener(){},setAttribute(){},querySelectorAll(){return [];}
      });
      if(selector === '#game-list')elements.get(selector).addEventListener=()=>{};
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
    document:{body:element('body'),querySelector:element,querySelectorAll:() => [],addEventListener(){},hidden:false,
      createElement:slateTemplate},
    window:{addEventListener(){}},
    navigator:{},location:{hash:''},
    localStorage:{getItem:() => null,setItem(){}},
    fetch:() => { fetchCount++; return nextFeed; },
    AbortSignal,setTimeout:() => 1,clearTimeout(){},setInterval(){}
  });
  vm.runInContext(ratingCore,context);
  vm.runInContext(fs.readFileSync(new URL('../tennis-coverage.js',import.meta.url),'utf8'),context);
  if (production) vm.runInContext(fs.readFileSync(new URL('../dist/scoring-runtime.js',import.meta.url),'utf8'),context);
  vm.runInContext(source,context);
  return {
    element,resolveFeed,rejectFeed,context,
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

test('production normal URL rejects old-model scores and keeps cards ordering and detail on the canonical new score',async()=>{
  const app=startApp(true),version=app.context.SportsRadarScore.MODEL_VERSION;
  app.resolveFeed({ok:true,json:async()=>({modelVersion:'old',updatedAt:'2026-10-30T20:00:00Z',games:[realGame]})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.doesNotMatch(app.element('#game-list').innerHTML,/game-card/);
  const live={...realGame,state:'live',score:83,modelVersion:version,live:{bonus:0,phase:'Q4'},factors:[],openingScore:50};
  const lower={...live,id:'lower',score:60};
  await app.refreshWith({ok:true,json:async()=>({modelVersion:version,updatedAt:'2026-10-30T20:01:00Z',games:[lower,live]})});
  assert.match(app.element('#game-list').innerHTML,/83/);
  assert.equal(vm.runInContext('games.find(g=>g.id==="verified-game").score',app.context),83);
  const before=app.element('#game-list').innerHTML;
  await app.refreshWith({ok:true,json:async()=>({modelVersion:'old',updatedAt:'2026-10-30T20:02:00Z',games:[{...live,score:99}]})});
  assert.equal(app.element('#game-list').innerHTML,before);
  assert.match(app.element('#data-status-label').textContent,/Stale scores/);
});

test('startup renders no cards before the first feed resolves, then renders real games',async () => {
  const app = startApp();
  assert.equal(app.fetchCount,1);
  assert.doesNotMatch(app.element('#game-list').innerHTML,/game-card|Chiefs|Bills/);
  assert.match(app.element('#game-list').innerHTML,/slate-skeleton/);
  assert.equal(app.element('#game-list').getAttribute('aria-busy'),'true');
  assert.equal(app.element('#empty-state h3').textContent,'Loading live scores…');
  app.resolveFeed({ok:true,json:async () => ({updatedAt:'2026-10-26T20:00:00Z',games:[realGame]})});
  await new Promise(resolve => setImmediate(resolve));
  assert.match(app.element('#game-list').innerHTML,/game-card/);
  assert.match(app.element('#game-list').innerHTML,/Seattle Seahawks/);
  assert.equal(app.element('#game-list').getAttribute('aria-busy'),'false');
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

test('refresh keeps card identities and visible order while explicit filters apply current ranking',async()=>{
  const app=startApp();
  const high={...realGame,state:'live',score:83,live:{phase:'Q4'}},low={...high,id:'other-game',score:60};
  app.resolveFeed({ok:true,json:async()=>({updatedAt:'2026-10-26T20:00:00Z',games:[low,high]})});
  await new Promise(resolve=>setImmediate(resolve));
  const list=app.element('#game-list'),original=list.querySelectorAll(':scope > .game-card');
  assert.deepEqual(original.map(card=>card.dataset.id),['verified-game','other-game']);
  await app.refreshWith({ok:true,json:async()=>({updatedAt:'2026-10-26T20:01:00Z',games:[{...low,score:95},high]})});
  const refreshed=list.querySelectorAll(':scope > .game-card');
  assert.equal(refreshed[0],original[0],'unchanged card stays mounted');
  assert.equal(refreshed[1],original[1],'updated card retains its article identity');
  assert.match(refreshed[1].innerHTML,/>95<\/span>/,'new score renders without moving the card');
  vm.runInContext('state.gameState="live"; render()',app.context);
  assert.deepEqual(list.querySelectorAll(':scope > .game-card').map(card=>card.dataset.id),['other-game','verified-game']);
});

test('older feed revision cannot rewind the current canonical games',async()=>{
  const app=startApp();app.resolveFeed({ok:true,json:async()=>({updatedAt:'2026-10-26T20:01:00Z',games:[realGame]})});
  await new Promise(resolve=>setImmediate(resolve));
  await app.refreshWith({ok:true,json:async()=>({updatedAt:'2026-10-26T20:00:00Z',games:[]})});
  assert.match(app.element('#game-list').innerHTML,/Seattle Seahawks/);
});

test('Tennis cached non-major records disappear on refresh across every current-game consumer',async()=>{
  const app=startApp(true),version=app.context.SportsRadarScore.MODEL_VERSION;
  const excluded={...realGame,id:'paris',sport:'Tennis',context:'Rolex Paris Masters',score:99,
    tennisTournament:{id:'13-2026',name:'Rolex Paris Masters'},modelVersion:version};
  app.resolveFeed({ok:true,json:async()=>({modelVersion:version,updatedAt:new Date().toISOString(),games:[realGame,excluded]})});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(vm.runInContext('games.some(g=>g.sport==="Tennis")',app.context),false);
  assert.doesNotMatch(app.element('#game-list').innerHTML,/Paris|data-sport="Tennis"/);
  vm.runInContext('state.sport="Tennis"; render()',app.context);
  assert.match(app.element('#empty-message').textContent,/Grand Slam/);
  assert.doesNotMatch(app.element('#game-list').innerHTML,/game-card/);
  await app.refreshWith({ok:true,json:async()=>({modelVersion:version,updatedAt:new Date(Date.now()+1000).toISOString(),games:[excluded]})});
  assert.equal(vm.runInContext('games.length',app.context),0);
});
