import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const lifecycle=source.slice(source.indexOf('let activeDetailGame = null;'),source.indexOf('\nfunction compactPlay'));
const game=(id='A',state='live')=>({id,sport:'NFL',state,score:70,teams:[['Home','H',24],['Away','A',21]],status:'Final',live:{phase:'Q4 1:00'}});
const summary=(version=1000)=>({sportsRadarFreshness:{updatedAt:new Date(version).toISOString()}});
function harness(){
  let time=0,id=0;const timers=new Map(),requests=[],renders=[];
  const context=vm.createContext({games:[game(),game('B')],document:{hidden:false,body:{classList:{remove(){}}}},
    AbortController,console,
    setTimeout(fn,delay){timers.set(++id,{fn,at:time+delay});return id;},clearTimeout(id){timers.delete(id);},
    $:()=>({}),showGameDetails(){},renderDetailContent(g,s,loading){renders.push({game:g,summary:s,loading});},
    SportsRadarDetail:{validateLiveSummary:()=>true},
    fetchGameSummary(g,controller){return new Promise((resolve,reject)=>requests.push({game:g,controller,resolve,reject}));}
  });
  vm.runInContext(lifecycle,context);
  return {context,requests,renders,timers,run:s=>vm.runInContext(s,context),
    async settle(i=0,s=summary()){requests[i].resolve(s);await new Promise(r=>setImmediate(r));},
    async tick(ms){time+=ms;for(const [key,t] of [...timers])if(t.at<=time){timers.delete(key);t.fn();}await new Promise(r=>setImmediate(r));}};
}
test('live detail schedules ten seconds after completion with only one request',async()=>{
  const h=harness();h.run("openGameDetails('A')");h.run('refreshActiveDetail()');await h.tick(30000);
  assert.equal(h.requests.length,1);assert.equal(h.timers.size,0);
  await h.settle();await h.tick(9999);assert.equal(h.requests.length,1);await h.tick(1);assert.equal(h.requests.length,2);
});
test('hidden suspends and invalidates; visible immediately refreshes without catch-up',async()=>{
  const h=harness();h.run("openGameDetails('A')");h.run('document.hidden=true;detailVisibilityChanged()');
  assert.equal(h.requests[0].controller.signal.aborted,true);await h.settle();await h.tick(60000);assert.equal(h.requests.length,1);
  h.run('document.hidden=false;detailVisibilityChanged()');assert.equal(h.requests.length,2);await h.settle(1);assert.equal(h.timers.size,1);
});
test('close during fetch prevents late rendering and polling',async()=>{
  const h=harness();h.run("openGameDetails('A');hideGameDetails()");const count=h.renders.length;await h.settle();await h.tick(60000);
  assert.equal(h.renders.length,count);assert.equal(h.requests.length,1);assert.equal(h.requests[0].controller.signal.aborted,true);
});
test('rapid A B A switching rejects both earlier generations including same game',async()=>{
  const h=harness();h.run("openGameDetails('A');openGameDetails('B');openGameDetails('A')");
  await h.settle(2,summary(3000));const count=h.renders.length;await h.settle(1,summary(4000));await h.settle(0,summary(5000));
  assert.equal(h.renders.length,count);assert.equal(h.renders.at(-1).game.id,'A');assert.equal(h.renders.at(-1).summary.sportsRadarFreshness.updatedAt,summary(3000).sportsRadarFreshness.updatedAt);
});
test('older resource version cannot replace a newer detail',async()=>{
  const h=harness();h.run("openGameDetails('A')");await h.settle(0,summary(3000));await h.tick(10000);await h.settle(1,summary(2000));
  assert.equal(h.renders.at(-1).summary.sportsRadarFreshness.updatedAt,summary(3000).sportsRadarFreshness.updatedAt);assert.equal(h.renders.at(-1).summary.sportsRadarFreshness.stale,true);
});
test('feed replacement updates open canonical state and temporary disappearance retains it',async()=>{
  const h=harness();h.run("openGameDetails('A')");await h.settle();
  h.run("games=[{...games[0],score:88,teams:[['Home','H',31],['Away','A',21]],live:{phase:'OT'}}];syncActiveDetail()");
  assert.equal(h.renders.at(-1).game.score,88);assert.equal(h.renders.at(-1).game.live.phase,'OT');
  h.run('games=[];syncActiveDetail()');assert.equal(h.renders.at(-1).game.score,88);assert.equal(h.renders.at(-1).summary.sportsRadarFreshness.stale,true);
});
test('final transition immediately renders canonical final and makes one final request',async()=>{
  const h=harness();h.run("openGameDetails('A')");await h.settle();h.run("games=[{...games[0],state:'completed',score:92}];syncActiveDetail()");
  assert.equal(h.renders.at(-1).game.state,'completed');assert.equal(h.renders.at(-1).game.score,92);assert.equal(h.requests.length,2);
  await h.settle(1);await h.tick(60000);assert.equal(h.requests.length,2);
});
test('final arriving during fetch queues one final detail refresh',async()=>{
  const h=harness();h.run("openGameDetails('A');games=[{...games[0],state:'completed'}];syncActiveDetail()");await h.settle();await h.tick(10000);assert.equal(h.requests.length,2);await h.settle(1);await h.tick(60000);assert.equal(h.requests.length,2);
});
test('nonlive detail remains fetch-on-open',async()=>{
  const h=harness();h.run("games[0].state='upcoming';openGameDetails('A')");await h.settle();await h.tick(60000);assert.equal(h.requests.length,1);
});
test('provider timeout preserves rich data and retries at normal cadence while canonical advances',async()=>{
  const h=harness();h.run("openGameDetails('A')");await h.settle();await h.tick(10000);h.requests[1].reject(new Error('timeout'));await new Promise(r=>setImmediate(r));
  assert.ok(h.renders.at(-1).summary);assert.equal(h.renders.at(-1).summary.sportsRadarFreshness.stale,true);
  h.run('games=[{...games[0],score:91}];syncActiveDetail()');assert.equal(h.renders.at(-1).game.score,91);await h.tick(9999);assert.equal(h.requests.length,2);await h.tick(1);assert.equal(h.requests.length,3);
});
test('detail markup always uses canonical score and phase even for behind/ahead/final summaries',()=>{
  const render=source.slice(source.indexOf('function renderDetailContent('),source.indexOf('async function fetchGameSummary'));
  let html='';const context=vm.createContext({$:()=>({set innerHTML(v){html=v;}}),safeText:String,teamLogoUrl:()=>'',labelForSport:x=>x,isWatched:()=>false,watchKey:()=>'',explainRating:g=>g.score,
    displayLine:()=>({text:''}),detailTabsMarkup:()=>'',
    storylineDetails:()=>'',excitementTimeline:()=>'',detailScoring:()=>'',detailStats:()=>'',detailLeaders:()=>'',basketballBoxScoreMarkup:()=>'',detailPlayerStats:()=>'',detailPlays:()=>''});
  vm.runInContext(source.slice(source.indexOf('function compactClockPeriod('),source.indexOf('function gameCard(')),context);
  vm.runInContext(render,context);
  for(const phase of ['Q4 1:00','OT','Intermission'])for(const score of [7,40]){
    context.game={...game(),live:{phase}};context.summary={header:{competitions:[{status:{type:{detail:'Final'}},competitors:[{score},{score}]}]}};
    vm.runInContext('renderDetailContent(game,summary)',context);assert.match(html,/>24<\/b>/);assert.match(html,/>21<\/b>/);assert.ok(html.includes(phase));assert.match(html,/Why 70/);
  }
});

test('detail reuses canonical chronology validation without mutating canonical rating',async()=>{
  const {loadCore}=await import('../calibration/helpers.mjs');const core=await loadCore();
  const {normalizeEvent}=await import('../alerts-worker/src/game-model.js');
  const comp={status:{period:4,displayClock:'4:00',type:{state:'in',detail:'4:00 Q4'}},competitors:[
    {team:{id:'h',displayName:'Home',abbreviation:'H'},score:'24'},
    {team:{id:'a',displayName:'Away',abbreviation:'A'},score:'21'}]};
  const canonical=normalizeEvent({id:'A',competitions:[comp]},'NFL');
  for(const [change,stale] of [
    [c=>{c.status.displayClock='5:00';},true],
    [c=>{c.competitors[0].score='17';},true],
    [c=>{c.status.type={state:'post',completed:true};},true],
    [c=>{c.status.displayClock='3:00';},false],
    [c=>{c.competitors[0].score='31';},true],
    [c=>{c.competitors[0].team.id='wrong';},true]
  ]){
    const h=harness();h.context.SportsRadarDetail=globalThis.SportsRadarDetail;h.context.games=[structuredClone(canonical)];
    const before=JSON.stringify(h.context.games[0]);const detail=structuredClone(comp);change(detail);
    h.run("openGameDetails('A')");await h.settle(0,{...summary(),header:{competitions:[detail]}});
    assert.equal(Boolean(h.renders.at(-1).summary.sportsRadarFreshness.stale),stale,change.toString());
    assert.equal(JSON.stringify(h.context.games[0]),before);
  }
});

test('visibility interruption preserves the pending final detail attempt',async()=>{
  const h=harness();h.run("openGameDetails('A')");await h.settle();
  h.run("games=[{...games[0],state:'completed'}];syncActiveDetail();document.hidden=true;detailVisibilityChanged()");
  await h.settle(1);h.run('document.hidden=false;detailVisibilityChanged()');assert.equal(h.requests.length,3);
  await h.settle(2);await h.tick(60000);assert.equal(h.requests.length,3);
});
