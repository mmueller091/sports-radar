import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {slateNode,slateTemplate} from './helpers/slate-dom.mjs';
import sourceHelper from './helpers/scoring-source.cjs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helpers=source.slice(source.indexOf('const SLATE_INITIAL_CARDS'),source.indexOf('function readLineSnapshots('));
const game=(id,extra={})=>({id:String(id),sport:'NFL',state:'live',startTime:'2026-11-09T23:00:00Z',score:70,clock:'5:00',logo:'official.png',...extra});
const markup=game=>`<article class="game-card${game.state==='completed'?' completed-card':''}" data-id="${game.id}" data-sport="${game.sport}"><button class="card-open-target" data-open-game aria-label="Open ${game.id}, rating ${game.score}"></button><span class="match-meta"><span class="card-clock">${game.clock}</span>${game.provisional?'<span class="status-provisional">Provisional rating</span>':''}</span><span class="team-row"><button class="card-team-link" data-card-team-index="0"><img class="team-logo" data-team-logo data-logo-contrast="pending" src="${game.logo}" crossorigin="anonymous"><span class="team-logo-fallback" hidden>ABC</span></button><span class="team-label">${game.rank?`<b class="team-rank">#${game.rank}</b>`:''}<span class="team-name">Team</span>${game.pp?'<span class="team-power-play">PP</span>':''}</span><b class="team-score">${game.score}</b></span><span class="excitement" style="--score-hue:${game.score}"><span class="score-circle">${game.score}</span></span></article>`;

function harness({progressive=true,count=60}={}) {
  const list=slateNode(),listeners=new Map(),timers=new Map(),frames=[],observations=[];
  let items=Array.from({length:count},(_,index)=>game(index)),selection='all',selectedState='all',parsed=0,generated=0,id=0;
  const state={page:'home'};
  class Observer {
    constructor(callback,options){this.callback=callback;this.options=options;observations.push(this);}
    observe(target){this.target=target;}
    disconnect(){this.target=null;}
    enter(target=this.target){this.callback([{target,isIntersecting:true}]);}
  }
  const context=vm.createContext({
    state,games:items,window:{addEventListener:(name,listener)=>listeners.set(name,listener)},
    document:{createElement:tag=>{if(tag==='template')parsed++;return slateTemplate(tag);}},
    ...(progressive?{IntersectionObserver:Observer}:{}),
    gameCard:game=>{generated++;return markup(game);},
    watchKey:game=>`${game.sport}:${game.id}`,safeText:String,
    localDayStamp:value=>String(value).slice(0,10),gameDayLabel:value=>String(value).slice(0,10),
    requestAnimationFrame:fn=>frames.push(fn),setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:id=>timers.delete(id),
    render:()=>render()
  });
  vm.runInContext(helpers,context);
  const render=()=>context.renderSlateCards(list,[...items],selectedState,selection,JSON.stringify([selection,items.map(item=>[item.id,item.state,item.startTime]).sort()]));
  return {
    list,state,context,listeners,observations,render,
    get items(){return items;},
    setItems(next,{all=next}={}){items=next;context.games=all;},
    select(key,mode='all'){selection=key;selectedState=mode;},
    cards:()=>list.querySelectorAll(':scope > .game-card'),
    flush(){while(frames.length)frames.shift()();},
    stopScroll(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());this.flush();},
    get parsed(){return parsed;},get generated(){return generated;}
  };
}

test('285-game slate mounts 24 cards, grows on approach, and retains the full order and prior nodes',()=>{
  const h=harness({count:285});h.render();
  const initial=h.cards(),divider=h.list.children[0];
  assert.equal(initial.length,24);assert.equal(h.generated,24);
  assert.equal(h.list._slateItems.length,285);assert.equal(h.context.games.length,285);
  assert.equal(h.observations[0].options.rootMargin,'1000px 0px');
  assert.ok(h.list.querySelector('.slate-load-more'));
  h.observations[0].enter();
  assert.equal(h.cards().length,40);
  assert.equal(h.list.children[0],divider);
  initial.forEach((node,index)=>assert.equal(h.cards()[index],node));
  while(h.cards().length<285)h.observations[0].enter();
  assert.equal(h.cards().length,285);
  assert.equal(new Set(h.cards().map(card=>card.dataset.id)).size,285);
  assert.equal(h.list.querySelector('.slate-load-more'),null);
});

test('unsupported observers retain the full accessible slate without a load-more requirement',()=>{
  const h=harness({progressive:false,count:45});h.render();
  assert.equal(h.cards().length,45);assert.equal(h.list.querySelector('.slate-load-more'),null);
});

test('new games beyond an already complete prefix enable automatic loading again',()=>{
  const h=harness({count:24});h.render();
  assert.equal(h.observations[0].target,null);
  const initial=h.cards();
  h.setItems([...h.items,...Array.from({length:20},(_,index)=>game(index+24))]);h.render();
  assert.equal(h.cards().length,24);assert.equal(h.observations[0].target,initial.at(-1));
  h.observations[0].enter();assert.equal(h.cards().length,40);
  h.observations[0].enter();assert.equal(h.cards().length,44);
  assert.equal(h.observations[0].target,null);
});

test('unchanged refresh parses no cards or date dividers and preserves full off-screen ranking',()=>{
  const h=harness();h.render();
  const initial=h.cards(),parsed=h.parsed;
  h.setItems([...h.items].reverse());h.render();
  assert.equal(h.parsed,parsed);
  initial.forEach((card,index)=>assert.equal(h.cards()[index],card));
  h.observations[0].enter();
  assert.deepEqual(h.cards().slice(24).map(card=>card.dataset.id),Array.from({length:16},(_,index)=>String(index+24)));
  h.select('live','live');h.render();
  assert.equal(h.cards().length,24);
  assert.equal(h.cards()[0].dataset.id,'59','an explicit filter still applies the current established sort');
  assert.equal(h.list._slateItems.length,60);
});

test('one changed clock and score patch their existing nodes without recreating logos, controls or peers',()=>{
  const h=harness();h.render();
  const cards=h.cards(),card=cards[0],image=card.querySelector('img'),button=card.querySelector('[data-open-game]');
  const score=card.querySelector('.team-score'),clock=card.querySelector('.card-clock'),parsed=h.parsed;
  button.focus();card.classList.add('score-just-changed');
  h.setItems(h.items.map(item=>item.id==='0'?{...item,score:88,clock:'0:12'}:item));h.render();
  assert.equal(h.parsed-parsed,1,'only the changed card is parsed');
  for(const [selector,node]of [['img',image],['[data-open-game]',button],['.team-score',score],['.card-clock',clock]])assert.equal(card.querySelector(selector),node);
  assert.equal(score.textContent,'88');assert.equal(clock.textContent,'0:12');
  assert.equal(button._focused,true);assert.match(button.getAttribute('aria-label'),/rating 88/);
  assert.ok(card.classList.contains('score-just-changed'));
  cards.slice(1).forEach((node,index)=>assert.equal(h.cards()[index+1],node));
});

test('clock updates preserve logo glow, CORS retry and fallback state; a new source resets it',()=>{
  const h=harness();h.render();
  const card=h.cards()[0],image=card.querySelector('img'),fallback=card.querySelector('.team-logo-fallback');
  image.setAttribute('data-logo-contrast','unreadable');image.setAttribute('data-logo-cors-retried','official.png');
  image.removeAttribute('crossorigin');image.setAttribute('hidden','');fallback.removeAttribute('hidden');
  h.setItems(h.items.map(item=>item.id==='0'?{...item,clock:'4:59'}:item));h.render();
  assert.equal(card.querySelector('img'),image);assert.equal(card.querySelector('.team-logo-fallback'),fallback);
  assert.equal(image.dataset.logoContrast,'unreadable');assert.equal(image.dataset.logoCorsRetried,'official.png');
  assert.equal(image.hasAttribute('crossorigin'),false);assert.equal(image.hasAttribute('hidden'),true);assert.equal(fallback.hasAttribute('hidden'),false);
  h.setItems(h.items.map(item=>item.id==='0'?{...item,logo:'new-official.png'}:item));h.render();
  assert.notEqual(card.querySelector('img'),image);
  assert.equal(card.querySelector('img').getAttribute('src'),'new-official.png');
  assert.equal(card.querySelector('img').hasAttribute('hidden'),false);
  assert.equal(card.querySelector('.team-logo-fallback').hasAttribute('hidden'),true);
});

test('existing update pulses clear after completion so subsequent changes can animate on the same nodes',()=>{
  const h=harness({count:1});h.render();
  const card=h.cards()[0],score=card.querySelector('.team-score'),rating=card.querySelector('.excitement');
  for(const scoreValue of [80,90]) {
    h.setItems([{...h.items[0],score:scoreValue}]);h.render();
    card.classList.add('score-just-changed','rating-just-changed');
    h.list.dispatch('animationend',{target:score,animationName:'score-update'});
    assert.equal(card.classList.contains('score-just-changed'),false);
    assert.equal(card.classList.contains('rating-just-changed'),true);
    h.list.dispatch('animationend',{target:rating,animationName:'rating-update'});
    assert.equal(card.classList.contains('rating-just-changed'),false);
    assert.equal(card.querySelector('.team-score'),score);assert.equal(card.querySelector('.excitement'),rating);
  }
});

test('conditional rank, PP, provisional and final markup matches the existing card output exactly',()=>{
  const h=harness({count:1});h.render();
  const card=h.cards()[0],logoButton=card.querySelector('.card-team-link');
  for(const patch of [{pp:true,rank:4,provisional:true},{pp:false,rank:null,score:81},{state:'completed',provisional:false,clock:'Final'},{state:'live',pp:true,rank:12,clock:'OT'}]) {
    h.setItems([{...h.items[0],...patch}]);h.render();
    assert.equal(h.cards()[0],card);assert.equal(card.querySelector('.card-team-link'),logoButton);
    assert.equal(card.outerHTML,slateNode(markup(h.items[0])).outerHTML);
  }
});

test('a pointer gesture retains its game while scores update; membership reconciles after release',()=>{
  const h=harness({count:3});h.select('live','live');h.render();
  const tapped=h.cards()[0],original=h.items;
  h.list.dispatch('pointerdown');
  const finished={...original[0],state:'completed',score:90};
  h.setItems([original[1],original[2]],{all:[finished,original[1],original[2]]});h.render();
  assert.equal(h.cards()[0],tapped);assert.equal(tapped.querySelector('.team-score').textContent,'90');
  assert.equal(h.cards().length,3);
  h.listeners.get('pointerup')();
  assert.equal(h.cards()[0],tapped,'click dispatch completes before deferred structural work');
  h.flush();
  assert.deepEqual(h.cards().map(card=>card.dataset.id),['1','2']);
});

test('keyboard activation and scrolling defer only structural changes, not fresh displayed scores',()=>{
  for(const gesture of ['key','scroll']) {
    const h=harness({count:3});h.render();const original=h.items;
    if(gesture==='key')h.list.dispatch('keydown',{key:'Enter'});else h.listeners.get('scroll')();
    h.setItems([game('new'),{...original[0],score:91},original[1],original[2]]);h.render();
    assert.equal(h.cards()[0].dataset.id,'0');assert.equal(h.cards()[0].querySelector('.team-score').textContent,'91');
    if(gesture==='key'){h.listeners.get('keyup')();h.flush();}else h.stopScroll();
    assert.equal(h.cards()[0].dataset.id,'new');
  }
});

test('keyboard users preload near the tail and can explicitly load remaining games with retained focus',()=>{
  const h=harness();h.render();
  h.list.dispatch('focusin',{target:h.cards().at(-1).querySelector('[data-open-game]')});
  assert.equal(h.cards().length,40);
  h.list.dispatch('click',{target:h.list.querySelector('.slate-load-more')});
  assert.equal(h.cards().length,56);assert.ok(h.cards()[40].querySelector('[data-open-game]')._focused);
  const css=fs.readFileSync(new URL('../ui-overhaul.css',import.meta.url),'utf8');
  assert.match(css,/\.slate-load-more:not\(:focus-visible\)/);assert.match(css,/\.slate-load-more:focus-visible/);
});

test('off-screen routes cannot append cards, while the existing mounted prefix survives returning',()=>{
  const h=harness();h.render();h.observations[0].enter();
  const cards=h.cards();h.state.page='info';h.observations[0].enter();
  assert.equal(h.cards().length,40);h.state.page='home';h.render();
  assert.equal(h.cards().length,40);cards.forEach((card,index)=>assert.equal(h.cards()[index],card));
});

test('the actual app counts and searches the full feed and opens or filters to an unmounted game',()=>{
  const elements=new Map();
  const element=selector=>{
    if(!elements.has(selector)){const node=slateNode();node.value='';elements.set(selector,node);}
    return elements.get(selector);
  };
  const observers=[];
  class Observer {constructor(callback){this.callback=callback;observers.push(this);}observe(target){this.target=target;}disconnect(){}enter(){this.callback([{target:this.target,isIntersecting:true}]);}}
  const context=vm.createContext({
    document:{createElement:slateTemplate,body:element('body'),querySelector:element,querySelectorAll:()=>[],addEventListener(){},hidden:false},
    window:{addEventListener(){}},navigator:{},location:{hash:''},IntersectionObserver:Observer,
    localStorage:{getItem:()=>null,setItem(){}},fetch:()=>new Promise(()=>{}),
    AbortSignal,AbortController,setTimeout:()=>1,clearTimeout(){},setInterval(){}
  });
  vm.runInContext(sourceHelper.scoringSource(),context);vm.runInContext(source,context);
  context.input=Array.from({length:60},(_,index)=>({...game(index),status:'Q4',live:{phase:'Q4'},teams:[
    [`Unique Team ${index}`,'UT',7,'','official.png','5-2',null,'UT',String(index)],
    ['Opponent','OP',3,'','opponent.png','2-5',null,'OP','opponent']
  ]}));
  const run=code=>vm.runInContext(code,context),list=element('#game-list');
  run('games=input;state.source="live";render()');
  assert.equal(list.querySelectorAll(':scope > .game-card').length,24);
  assert.equal(element('#all-count').textContent,'60');assert.equal(element('#live-count').textContent,'60 LIVE');
  assert.equal(run('games.length'),60);
  element('#search-query').value='Unique Team 59';run('renderGlobalSearch()');
  assert.match(element('#search-results').innerHTML,/data-search-game-id="59"/);
  observers[0].enter();observers[0].enter();
  assert.equal(list.querySelectorAll(':scope > .game-card').length,56);
  run('renderDetailContent=()=>{};showGameDetails=()=>{};refreshActiveDetail=async()=>{};openGameDetails("59","NFL")');
  assert.equal(run('activeDetailGame.id'),'59');
  run('state.watchedGames.add("NFL:59");render()');
  assert.equal(list.querySelectorAll(':scope > .game-card').length,56,'watchlist changes inside Game Center cannot truncate the slate underneath');
  run('state.favoriteTeams=[{sport:"NFL",name:"Unique Team 50",id:"50"}];render()');
  assert.equal(list.querySelectorAll(':scope > .game-card').length,56,'favorite changes retain the mounted depth');
  run('activeDetailGame=null;state.watchedGames=new Set(["NFL:59"]);state.gameState="watching";render()');
  assert.deepEqual(list.querySelectorAll(':scope > .game-card').map(card=>card.dataset.id),['59']);
  assert.equal(element('#watch-count').textContent,'1');assert.equal(run('games.length'),60);
});
