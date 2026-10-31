import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app.js','utf8'),runtime=fs.readFileSync('dist/scoring-runtime.js','utf8');
const now=Date.parse('2026-10-31T18:00:00Z');
const metadata={season:2026,updatedAt:new Date(now).toISOString(),conferences:[
  {id:'8',name:'Southeastern Conference',division:'FBS'},
  {id:'18',name:'FBS Independents',division:'FBS'},
  {id:'20',name:'Big Sky Conference',division:'FCS'}
],teams:{'1':{conferenceId:'8',division:'FBS'},'2':{conferenceId:'18',division:'FBS'},'3':{conferenceId:'20',division:'FCS'}}};
const team=(id,rank=null)=>['Team '+id,'T'+id,'0','','','5-2',rank,'',id];
const game=(id,ids=['1','2'],ranks=[],extra={})=>({id,sport:'CFB',state:'live',startTime:'2026-10-31T17:00:00Z',status:'Q1',teams:ids.map((id,i)=>team(id,ranks[i])),score:60,modelVersion:'2026-10-31.football-transition.1',...extra});
function start(storage=new Map(),feed=[]) {
  const elements=new Map(),calls=[];
  const element=selector=>{
    if (!elements.has(selector)) {
      const classes=new Set(),events={};
      elements.set(selector,{innerHTML:'',textContent:'',value:'',dataset:{},events,
        classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>{if(on??!classes.has(n))classes.add(n);else classes.delete(n);}},
        addEventListener:(name,handler)=>(events[name]??=[]).push(handler),setAttribute(name,value){this[name]=value;},querySelectorAll:()=>[]});
    }return elements.get(selector);
  };
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context=vm.createContext({Date:Clock,document:{body:element('body'),querySelector:element,querySelectorAll:()=>[],addEventListener(){},hidden:false},window:{addEventListener(){}},navigator:{},location:{hash:''},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    fetch:async url=>{calls.push(url);return {ok:true,json:async()=>String(url).includes('/metadata/')?structuredClone(metadata):{modelVersion:'2026-10-31.football-transition.1',updatedAt:new Date(now).toISOString(),games:feed}};},
    AbortSignal,setTimeout:()=>1,clearTimeout(){},setInterval(){}});
  vm.runInContext(runtime,context);vm.runInContext(source,context);
  const run=code=>vm.runInContext(code,context);
  const set=(value)=>{context.input=value;run('Object.assign(state,input);render()');};
  const click=async(selector,event={})=>{for(const handler of element(selector).events.click||[])await handler(event);};
  const change=async(value)=>{for(const handler of element('#cfb-conference').events.change||[])await handler({target:{value}});};
  const ids=()=>[...element('#game-list').innerHTML.matchAll(/data-id="([^"]+)"/g)].map(x=>x[1]);
  return {context,run,set,click,change,element,ids,calls,storage,settle:()=>new Promise(resolve=>setImmediate(resolve))};
}
test('defaults preserve all games; CFB controls hide on All Sports, every other sport, soccer and team pages',async()=>{
  const app=start(new Map(),[game('cfb'),game('nfl',undefined,undefined,{sport:'NFL'})]);await app.settle();
  assert.deepEqual(app.ids(),['cfb','nfl']);assert.equal(app.calls.length,1);
  assert.ok(app.element('#cfb-filters').classList.contains('hidden'));
  app.set({sport:'CFB'});await app.settle();assert.ok(!app.element('#cfb-filters').classList.contains('hidden'));
  assert.match(app.element('#cfb-conference').innerHTML,/<optgroup label="FBS">/);assert.match(app.element('#cfb-conference').innerHTML,/<optgroup label="FCS">/);
  for(const sport of ['all','NFL','NHL','NBA','NCAAB','MLB','Tennis']) {app.set({sport});assert.ok(app.element('#cfb-filters').classList.contains('hidden'));}
  app.set({page:'soccer',sport:'CFB'});assert.ok(app.element('#cfb-filters').classList.contains('hidden'));
  app.set({page:'team',teamRoute:{sport:'CFB',id:'1'}});assert.ok(app.element('#cfb-filters').classList.contains('hidden'));
});
test('conference accepts either team and cross-conference games; unknown IDs never guess by name',async()=>{
  const app=start(new Map(),[game('home',['2','1']),game('away',['1','2']),game('other',['2','3']),game('unknown',['999','999'])]);
  await app.settle();app.set({sport:'CFB'});await app.settle();await app.change('8');
  assert.deepEqual(app.ids(),['home','away']);
  await app.change('18');assert.deepEqual(app.ids(),['home','away','other']);
});
test('Top 25 includes ranked/unranked in either order and two ranked teams; missing/invalid ranks do not qualify',async()=>{
  const games=[game('left',undefined,[1,null]),game('right',undefined,[null,25]),game('both',undefined,[5,12]),...['null','missing','zero','26','nan','boolean','blank','fraction'].map((id,i)=>game(id,undefined,[[null,null],[undefined,undefined],[0,0],[26,99],['foo',NaN],[true,false],['',' '],[1.5,25.1]][i]))];
  const app=start(new Map(),games);await app.settle();app.set({sport:'CFB'});await app.settle();await app.click('#cfb-top25');
  assert.deepEqual(app.ids(),['left','right','both']);
  await app.change('20');assert.deepEqual(app.ids(),[]);
  assert.match(app.element('#empty-state h3').textContent,/match these filters/);
  assert.ok(!app.element('#empty-clear-filters').classList.contains('hidden'));
  await app.click('#empty-clear-filters');assert.equal(app.ids().length,games.length);
});
test('filters combine across every tab; favorites and excitement ordering remain unchanged',async()=>{
  const games=[game('low',undefined,[8],{score:51}),game('high',undefined,[9],{score:90}),game('unranked',undefined,[],{score:99}),game('up',undefined,[1],{state:'upcoming',startTime:'2026-11-01T18:00:00Z'}),game('final',undefined,[5],{state:'completed'})];
  const app=start(new Map(),games);await app.settle();app.set({sport:'CFB'});await app.settle();await app.change('8');await app.click('#cfb-top25');
  app.run("state.watchedGames=new Set(['CFB:high','CFB:unranked'])");
  for(const [tab,expected] of [['all',['high','low','final','up']],['live',['high','low']],['upcoming',['up']],['completed',['final']],['watching',['high']]]) {
    app.set({gameState:tab});assert.deepEqual(app.ids(),expected,tab);
  }
  app.set({gameState:'live',favoriteTeams:[{sport:'CFB',id:'1',name:'Team 1'}]});
  assert.deepEqual(app.ids(),['high','low']);assert.deepEqual(app.run('games.map(g=>g.score)').join(','),games.map(g=>g.score).join(','));
  app.set({sport:'all',gameState:'live'});assert.ok(app.ids().includes('unranked'),'CFB preferences never narrow All Sports');
});
test('FCS selection enables FCS explicitly, FCS off clears its conference, and existing crossover exclusion remains',async()=>{
  const app=start(new Map(),[game('fbs'),game('cross',['1','3'],[1],{division:'FCS'}),game('fcs',['3','3'],[7],{division:'FCS'})]);await app.settle();app.set({sport:'CFB',showFCS:false});await app.settle();
  assert.deepEqual(app.ids(),['fbs']);await app.change('20');
  assert.equal(app.run('state.showFCS'),true);assert.deepEqual(app.ids(),['cross','fcs']);assert.match(app.element('#cfb-filter-status').textContent,/FCS is on/);
  await app.click('#fcs-toggle');assert.equal(app.run('state.sportFilters.CFB.conference'),'');assert.deepEqual(app.ids(),['fbs']);
  assert.match(app.element('#cfb-filter-status').textContent,/cleared/);
});
test('preferences survive visits; clear restores defaults without losing favorites, sports, FCS or watchlist',async()=>{
  const store=new Map([['sports-radar-preferences-v2',JSON.stringify({favoriteTeams:[{sport:'CFB',id:'1',name:'Team 1'}],showFCS:false})]]);
  const app=start(store,[game('ranked',undefined,[4])]);await app.settle();app.set({sport:'CFB'});await app.settle();await app.change('8');await app.click('#cfb-top25');
  const next=start(store,[game('ranked',undefined,[4])]);await next.settle();next.set({sport:'CFB'});await next.settle();
  assert.equal(next.run('state.sportFilters.CFB.conference'),'8');assert.equal(next.run('state.sportFilters.CFB.top25'),true);
  assert.equal(next.calls.filter(u=>String(u).includes('/metadata/')).length,0,'browser cache reused');
  await next.click('#cfb-clear');const prefs=JSON.parse(store.get('sports-radar-preferences-v2'));
  assert.deepEqual(prefs.sportFilters.CFB,{conference:'',top25:false});assert.equal(prefs.showFCS,false);assert.equal(prefs.favoriteTeams[0].id,'1');
});
test('missing metadata excludes unverified conferences while Top 25 and clear still work',async()=>{
  const app=start(new Map(),[game('ranked',undefined,[4]),game('other')]);await app.settle();
  app.run("cfbMetadata.set(2026,{error:true,retryAt:Date.now()+60000})");app.set({sport:'CFB'});
  await app.click('#cfb-top25');assert.deepEqual(app.ids(),['ranked']);assert.equal(app.element('#cfb-conference').disabled,true);
  app.run("state.sportFilters.CFB.conference='8';render()");assert.deepEqual(app.ids(),[]);
  assert.match(app.element('#cfb-filter-status').textContent,/unavailable/);await app.click('#cfb-clear');assert.deepEqual(app.ids(),['ranked','other']);
});
