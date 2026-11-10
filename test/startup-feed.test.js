import {slateNode,slateTemplate} from './helpers/slate-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sourceHelper from './helpers/scoring-source.cjs';
import {gunzipSync} from 'node:zlib';
import {publicFeed} from '../alerts-worker/src/public-feed.js';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const ratingCore = sourceHelper.scoringSource();

function startApp(production=false,now) {
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
  let timerId = 0;
  const timers = new Map(),listeners = new Map(),clock = {now},requests=[];
  class Clock extends Date {
    constructor(...args) {super(...(args.length ? args : [clock.now]));}
    static now() {return clock.now;}
  }
  const context = vm.createContext({
    ...(now === undefined ? {} : {Date:Clock}),
    document:{body:element('body'),querySelector:element,querySelectorAll:() => [],addEventListener:(name,fn)=>listeners.set(name,fn),hidden:false,
      createElement:slateTemplate},
    window:{addEventListener(){}},
    navigator:{},location:{hash:''},
    localStorage:{getItem:() => null,setItem(){}},
    fetch:(url,options) => { fetchCount++;requests.push({url,options});return nextFeed; },
    AbortSignal,setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id),setInterval(){}
  });
  vm.runInContext(ratingCore,context);
  vm.runInContext(fs.readFileSync(new URL('../tennis-coverage.js',import.meta.url),'utf8'),context);
  if (production) vm.runInContext(fs.readFileSync(new URL('../dist/scoring-runtime.js',import.meta.url),'utf8'),context);
  vm.runInContext(source,context);
  return {
    element,resolveFeed,rejectFeed,context,timers,listeners,clock,requests,
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

test('near-start browser eligibility has bounded windows and rejects non-starting fixtures',()=>{
  const now=Date.parse('2026-11-06T23:00:00Z'),app=startApp(false,now);
  const starting=patch=>({...realGame,startTime:new Date(now).toISOString(),...patch});
  for (const [offset,expected] of [[900001,false],[900000,true],[1,true],[0,true],[-1800000,true],[-1800001,false]]) {
    assert.equal(app.context.gameStartingSoon(starting({startTime:new Date(now+offset).toISOString()}),now),expected,`offset ${offset}`);
  }
  for (const patch of [{state:'live'},{state:'completed'},{startTime:undefined},{startTime:'invalid'},
    {status:'Postponed'},{status:'Canceled'},{status:'Suspended'},{status:'Time TBD'},
    {liveRawStatus:{type:{name:'STATUS_POSTPONED',shortDetail:'Tonight'}}}]) {
    assert.equal(app.context.gameStartingSoon(starting(patch),now),false,JSON.stringify(patch));
  }
  for(const sport of ['NFL','CFB','NCAAB','NHL','MLB','NBA'])
    assert.equal(app.context.gameStartingSoon(starting({sport}),now),true,`${sport} remains enabled`);
  for(const sport of ['Soccer','Tennis'])
    assert.equal(app.context.gameStartingSoon(starting({sport}),now),false,`${sport} cannot accelerate the site`);
});

test('hidden soccer alone cannot trigger rapid browser polling, but enabled sports still can',async()=>{
  const now=Date.parse('2026-11-06T19:50:00Z'),app=startApp(false,now);
  const soccer={...realGame,sport:'Soccer',startTime:new Date(now+600000).toISOString()};
  const enabled={...realGame,id:'enabled',sport:'NCAAB',startTime:new Date(now+600000).toISOString()};
  const feed=games=>({ok:true,json:async()=>({updatedAt:new Date(app.clock.now).toISOString(),games})});
  const delay=()=>[...app.timers.values()].find(timer=>timer.fn===app.context.loadLiveGames)?.delay;
  app.resolveFeed(feed([soccer]));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(delay(),60000,'hidden soccer pregame stays idle');
  await app.refreshWith(feed([{...soccer,state:'live'}]));
  assert.equal(delay(),60000,'hidden soccer live cannot trigger 3-second browser polling');
  await app.refreshWith(feed([{...soccer,state:'live'},enabled]));
  assert.equal(delay(),10000,'an enabled sport near start activates 10-second polling');
  await app.refreshWith(feed([{...soccer,state:'live'},{...enabled,state:'live'}]));
  assert.equal(delay(),3000,'an enabled live game activates 3-second polling');
});

test('actual browser scheduling uses 3-second live and 10-second near-start polling without overlapping requests',async()=>{
  const now=Date.parse('2026-11-06T23:00:00Z'),app=startApp(false,now);
  const near={...realGame,startTime:new Date(now+900000).toISOString()};
  const feed=games=>({ok:true,json:async()=>({updatedAt:new Date(app.clock.now).toISOString(),games})});
  const delay=()=>[...app.timers.values()].find(timer=>timer.fn===app.context.loadLiveGames)?.delay;
  await vm.runInContext('loadLiveGames()',app.context);
  assert.equal(app.fetchCount,1,'initial pending request cannot overlap');
  assert.equal(app.requests[0].url,'/feed?view=compact');
  assert.equal(app.requests[0].options.cache,'no-store');
  assert.equal(app.timers.size,0,'the refresh delay starts only after the response completes');
  app.resolveFeed(feed([near]));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(delay(),10000);
  app.context.document.hidden=true;
  app.listeners.get('visibilitychange')();
  assert.equal(delay(),60000);
  await app.refreshWith(feed([{...near,state:'live',live:{phase:'Q1'}}]));
  assert.equal(delay(),60000,'live games do not speed up a hidden tab');
  app.context.document.hidden=false;
  app.listeners.get('visibilitychange')();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(delay(),3000,'returning to the tab refreshes immediately then uses the live interval');
  assert.equal(app.timers.size,1,'only one refresh timer remains');
  await app.refreshWith(feed([near]));
  assert.equal(delay(),10000);
  app.clock.now=Date.parse(near.startTime)+1800001;
  await app.refreshWith({ok:false,status:503});
  assert.equal(delay(),60000,'a failed fetch cannot keep an expired upcoming fixture on rapid polling');
  assert.equal(vm.runInContext('games.length',app.context),1,'last verified feed remains visible');
});

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

test('pending routine polls keep the live or stale status instead of flashing Connecting',async()=>{
  const now=Date.parse('2026-11-09T23:00:00Z'),app=startApp(false,now);
  const feed={ok:true,json:async()=>({updatedAt:new Date(now).toISOString(),games:[realGame]})};
  app.resolveFeed(feed);
  await new Promise(resolve=>setImmediate(resolve));
  const fetch=app.context.fetch;
  for(const stale of [false,true]) {
    if(stale)await app.refreshWith({ok:false,status:503});
    const before=app.element('#data-status-label').textContent;
    let finish;
    app.context.fetch=()=>new Promise(resolve=>{finish=resolve;});
    const pending=vm.runInContext('loadLiveGames()',app.context);
    assert.equal(app.element('#data-status-label').textContent,before);
    assert.doesNotMatch(before,/Connecting/);
    if(stale)assert.match(before,/Stale scores/);
    finish(feed);await pending;app.context.fetch=fetch;
  }
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

test('compact feed preserves card and Game Center rendering for captured games across all six enabled sports',async()=>{
  const captured=JSON.parse(gunzipSync(fs.readFileSync(new URL('./fixtures/ui-corrections-feed.json.gz',import.meta.url))));
  const original=JSON.stringify(captured),apps=[startApp(true,Date.parse(captured.updatedAt)),startApp(true,Date.parse(captured.updatedAt))];
  const payloads=[publicFeed(captured),publicFeed(captured,{compact:true})].map(feed=>JSON.parse(JSON.stringify(feed)));
  for(let index=0;index<apps.length;index++){
    const app=apps[index];
    payloads[index].modelVersion=app.context.SportsRadarScore.MODEL_VERSION;
    for(const game of payloads[index].games)game.modelVersion=payloads[index].modelVersion;
    for(const file of ['game-center.js','watch-links.js','team-logos.js'])
      vm.runInContext(fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),app.context);
    app.resolveFeed({ok:true,json:async()=>payloads[index]});
  }
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(apps[1].element('#game-list').innerHTML,apps[0].element('#game-list').innerHTML);
  assert.deepEqual(new Set(captured.games.map(game=>game.sport)),new Set(['NFL','CFB','NBA','NCAAB','NHL','MLB']));
  for(let index=0;index<captured.games.length;index++){
    const html=apps.map(app=>{
      vm.runInContext(`renderDetailContent(games[${index}],{})`,app.context);
      return app.element('#game-detail-content').innerHTML;
    });
    assert.equal(html[1],html[0],`${captured.games[index].sport}:${captured.games[index].id}`);
  }
  assert.equal(JSON.stringify(captured),original);
});
