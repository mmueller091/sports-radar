import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import sourceHelper from './helpers/scoring-source.cjs';
import {normalizeEvent,enrichGame} from '../alerts-worker/src/live-game-model.js';

const source=fs.readFileSync('app.js','utf8');
const fixture=JSON.parse(fs.readFileSync('test/fixtures/real-games/CFB-20261017-401858264.json','utf8'));
const archived=normalizeEvent(fixture.event,'CFB');enrichGame(archived,fixture.summary);
function harness(hash,{available=true,inFeed=false,initialState='completed'}={}) {
  const elements=new Map(),events={},calls=[];let serverGame={...archived,state:initialState};
  const element=selector=>{if(!elements.has(selector)){const classes=new Set();elements.set(selector,{innerHTML:'',textContent:'',value:'',hidden:true,
    classList:{add:()=>{},remove:()=>{},contains:()=>false,toggle(){}},addEventListener(){},setAttribute(){},querySelectorAll:()=>[],querySelector:()=>({focus(){}})});}return elements.get(selector);};
  const location={hash};
  const context=vm.createContext({console,location,AbortSignal,AbortController,
    document:{body:element('body'),querySelector:element,querySelectorAll:()=>[],addEventListener(){},hidden:false},
    window:{addEventListener:(name,fn)=>events[name]=fn},navigator:{},localStorage:{getItem:()=>null,setItem(){}},
    history:{pushState(state,title,url){location.hash=url;},replaceState(state,title,url){location.hash=url;}},
    setTimeout:()=>1,clearTimeout(){},setInterval(){},
    SPORTS_RADAR_ALERTS_URL:'https://worker.test',
    fetch:async url=>{
      calls.push(String(url));
      if(String(url).endsWith('/feed'))return Response.json({modelVersion:context.SportsRadarScore.MODEL_VERSION,updatedAt:new Date().toISOString(),games:inFeed?[serverGame]:[]});
      if(String(url).includes('/game/'))return available?Response.json({...fixture.summary,sportsRadarGame:serverGame,sportsRadarArchived:true,sportsRadarFreshness:{updatedAt:new Date().toISOString()}}):Response.json({error:'Game not found'},{status:404});
      return Response.json({});
    }});
  vm.runInContext(sourceHelper.scoringSource(),context);vm.runInContext(fs.readFileSync('dist/scoring-runtime.js','utf8'),context);vm.runInContext(source,context);
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
  return {context,element,calls,location,settle,run:s=>vm.runInContext(s,context),setGame:game=>serverGame=game,async route(hash){location.hash=hash;events.hashchange();await settle();}};
}
test('cold, refreshed and shared game URLs load a finished game absent from the scoreboard',async()=>{
  const url=`#game/CFB/${archived.id}`;
  for(let load=0;load<2;load++) {
    const h=harness(url);await h.settle();
    assert.equal(h.run('activeDetailGame.id'),archived.id);assert.equal(h.run('activeDetailGame.state'),'completed');assert.equal(h.run('games.length'),0,'the archived link does not invent a Radar card');
    assert.equal(h.element('#game-detail-overlay').hidden,false);assert.match(h.element('#game-detail-content').innerHTML,/Game|Utah|Utes|Ducks/);
    assert.ok(h.calls.some(url=>url.includes('/game/CFB/'+archived.id)));assert.equal(h.location.hash,url);
  }
});
test('open-app navigation, browser back, and unavailable-game fallback preserve usable routes',async()=>{
  const h=harness('#home',{inFeed:true});await h.settle();await h.run(`openGameDetails('${archived.id}','CFB')`);await h.settle();
  assert.equal(h.location.hash,`#game/CFB/${archived.id}`);await h.route('#home');assert.equal(h.element('#game-detail-overlay').hidden,true);
  const missing=harness('#game/NFL/unavailable',{available:false});await missing.settle();
  assert.match(missing.element('#game-detail-content').innerHTML,/Game unavailable/);assert.match(missing.element('#game-detail-content').innerHTML,/Try again/);assert.equal(missing.run('activeDetailGame'),null);
  missing.run('hideGameDetails()');assert.equal(missing.location.hash,'#home');
});
test('a linked game refresh can move from live to final without an active feed entry',async()=>{
  const h=harness(`#game/CFB/${archived.id}`,{initialState:'live'});await h.settle();assert.equal(h.run('activeDetailGame.state'),'live');
  h.setGame({...archived,state:'completed'});await h.run('refreshActiveDetail()');await h.settle();assert.equal(h.run('activeDetailGame.state'),'completed');
});
test('route parser rejects malformed links and preserves sport-scoped stable IDs',async()=>{
  const h=harness('#home');await h.settle();
  assert.equal(h.run("gameRouteFromHash('#game/NFL/bad%2Fid')"),null);assert.equal(h.run("gameRouteFromHash('#game/%E0%A4%A/id')"),null);
  assert.equal(h.run("gameRouteFromHash('#game/unknown/123')"),null);assert.equal(h.run("gameRouteFromHash('#game/Soccer/123').sport"),'Soccer');
});
test('Game Center closes top-layer dialogs when a notification link reuses the document',()=>{
  const dialogs=[{id:'settings'},{id:'search'}],closed=[];let focused=false;
  const overlay={hidden:true,querySelector:()=>({focus:()=>focused=true})};
  const context=vm.createContext({document:{querySelectorAll:()=>dialogs,body:{classList:{add(){}}}},hideDialog:dialog=>closed.push(dialog.id),$:()=>overlay});
  vm.runInContext(source.slice(source.indexOf('function showGameDetails('),source.indexOf('let activeDetailGame = null;')),context);
  context.showGameDetails();assert.deepEqual(closed,['settings','search']);assert.equal(overlay.hidden,false);assert.equal(focused,true);
});
