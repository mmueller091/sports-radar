import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import time from '../scoring/shared/time.js';
import {browser,fixture} from './helpers/overtime-terminology.mjs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const functionSource=name=>{const start=source.indexOf(`function ${name}(`);return source.slice(start,source.indexOf('\n}',start)+2);};
function tabsContext() {
  const context=vm.createContext({...time,safeText:String,labelForSport:String,playPeriodLabel:()=>'',
    normalizedTeamName:value=>String(value||'').toLowerCase(),teamLogoUrl:()=>'',teamLogoWithFallback:()=>'',
    renderExcitementTimeline:()=>'<section>Verified timeline</section>',storylineDetails:()=>''});
  vm.runInContext(source.slice(source.indexOf('function basketballPeriodLabel('),source.indexOf('function readRatingHistory(')),context);
  vm.runInContext(source.slice(source.indexOf('const DETAIL_TAB_CONFIG ='),source.indexOf('function updateDetailMarkup(')),context);
  return context;
}
const game=sport=>({id:'navigation',sport,state:'live',score:80,teams:[['Left','LFT',24,'','','8-2',null,'','left'],['Right','RGT',21,'','','7-3',null,'','right']]});
function summaryFor(sport) {
  const groups=sport==='MLB'?['batting','pitching']:sport==='NHL'?['skaters','goalies']:['passing','rushing'];
  const teams=['left','right'].map(id=>({id,displayName:id,abbreviation:id,color:'aabbcc'}));
  return {header:{competitions:[{competitors:teams.map(team=>({team,score:'1',linescores:[{displayValue:'1'}]}))}]},
    boxscore:{teams:teams.map(team=>({team,statistics:[{name:'totalYards',displayValue:'100',value:100}]})),
      players:teams.map(team=>({team,statistics:groups.map(name=>({name,type:name,labels:['YDS'],athletes:[{athlete:{displayName:'Player'},stats:['100']}]}))}))},
    drives:{current:{id:'drive',team:teams[0],plays:[]}},plays:[{text:'Verified play'}]};
}

test('loading shell renders canonical score, teams and rating without constructing detail tabs',()=>{
  const ui=browser();let tabs=0;
  ui.detailTabsMarkup=()=>{tabs++;throw new Error('tab construction must wait');};
  const current=fixture('401873031').sportsRadarGame;
  ui.renderDetailContent(current,null,true);
  assert.equal(tabs,0);assert.match(ui.detail.innerHTML,/detail-excitement-score/);
  for(const team of current.teams)assert.ok(ui.detail.innerHTML.includes(team[0]));
  assert.match(ui.detail.innerHTML,/Loading game statistics/);
});

test('lazy availability preserves the eager tab set across six sports and empty summaries',()=>{
  const ctx=tabsContext();
  for(const sport of ['NFL','CFB','MLB','NHL','NBA','NCAAB'])for(const state of ['live','upcoming'])for(const summary of [null,{},summaryFor(sport)]){
    const current={...game(sport),state};
    const eager=ctx.detailTabSections(current,summary);
    const lazy=ctx.detailTabSections(current,summary,true);
    assert.deepEqual(Array.from(lazy,tab=>tab.id),Array.from(eager,tab=>tab.id),`${sport} ${state}`);
    assert.deepEqual(Array.from(lazy,tab=>tab.render()),Array.from(eager,tab=>tab.content),`${sport} content stays identical`);
  }
});

test('hidden tabs do not construct player tables, drives or plays until selected',()=>{
  const ctx=tabsContext(),counts={players:0,drives:0,plays:0};
  for(const [name,kind,flag]of [['detailPlayerStats','players',2],['detailDrives','drives',3]]){
    const original=ctx[name];ctx[name]=(...args)=>{if(!args[flag])counts[kind]++;return original(...args);};
  }
  const plays=ctx.detailPlays;ctx.detailPlays=(...args)=>{counts.plays++;return plays(...args);};
  const html=ctx.detailTabsMarkup(game('NFL'),summaryFor('NFL'));
  assert.deepEqual(counts,{players:0,drives:0,plays:0});assert.match(html,/data-detail-lazy="true"/);
  const panels=['overview','players'].map(id=>({id:`detail-panel-navigation-${id}`,dataset:id==='players'?{detailLazy:'true'}:{},classList:{toggle(){}},childNodes:[],innerHTML:''}));
  const tabs=['overview','players'].map(id=>({dataset:{detailTab:id},classList:{toggle(){}},setAttribute(){}}));
  const shell={querySelectorAll:selector=>selector==='.detail-tab'?tabs:panels};
  const button={dataset:{detailTab:'players'},closest:()=>shell,getAttribute:()=>panels[1].id};
  ctx.setActiveDetailTab(button);assert.ok(counts.players>0);const rendered=counts.players;
  assert.match(panels[1].innerHTML,/mobile-player-browser/);assert.equal(panels[1].dataset.detailLazy,undefined);
  ctx.setActiveDetailTab(button);assert.equal(counts.players,rendered,'unchanged selected panel is reused');
  assert.equal(counts.drives,0);assert.equal(counts.plays,0);
});

// Minimal detached DOM for the patcher. Templates are supplied as trees so the
// test exercises identity and authored-attribute diffs without a DOM dependency.
class Element {
  constructor(name,attrs={},children=[]) {
    this.nodeType=1;this.nodeName=this.tagName=name.toUpperCase();this.attrs=new Map(Object.entries(attrs));this.childNodes=[];
    this.dataset=new Proxy({}, {get:(_,key)=>this.getAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase())),
      set:(_,key,value)=>{this.setAttribute('data-'+String(key).replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),String(value));return true;}});
    children.forEach(child=>this.appendChild(child));
  }
  get attributes(){return [...this.attrs].map(([name,value])=>({name,value}));}
  get id(){return this.getAttribute('id')||'';}
  get outerHTML(){return `<${this.nodeName}${[...this.attrs].map(([key,value])=>` ${key}="${value}"`).join('')}>${this.childNodes.map(child=>child.outerHTML??child.nodeValue).join('')}</${this.nodeName}>`;}
  get lastChild(){return this.childNodes.at(-1);}
  getAttribute(name){return this.attrs.get(name)??null;}
  setAttribute(name,value){this.attrs.set(name,String(value));}
  hasAttribute(name){return this.attrs.has(name);}
  removeAttribute(name){this.attrs.delete(name);}
  appendChild(child){child.parent=this;this.childNodes.push(child);return child;}
  replaceWith(next){const index=this.parent.childNodes.indexOf(this);this.parent.childNodes[index]=next;next.parent=this.parent;}
  remove(){this.parent.childNodes.splice(this.parent.childNodes.indexOf(this),1);}
  querySelectorAll(selector){const all=this.childNodes.flatMap(child=>child.nodeType===1?[child,...child.querySelectorAll('*')]:[]);return selector==='*'?all:all.filter(node=>(node.getAttribute('class')||'').includes('detail-tab-panel')&&node.hasAttribute('hidden'));}
}
const textNode=value=>({nodeType:3,nodeName:'#text',nodeValue:String(value),replaceWith:Element.prototype.replaceWith,remove:Element.prototype.remove});
function patchHarness(){
  let next=[];const ctx=vm.createContext({document:{createElement:()=>({content:{get childNodes(){return next;}},set innerHTML(value){}})}});
  vm.runInContext(functionSource('rememberDetailMarkupNode')+'\n'+functionSource('updateDetailMarkup'),ctx);
  const root=new Element('div');return {root,render(tree){next=tree;ctx.updateDetailMarkup(root,'template');}};
}

test('first summary and live updates preserve logo runtime state, nodes, focus targets and scroll',()=>{
  const h=patchHarness();
  const tree=score=>new Element('section',{},[
    new Element('img',{'data-team-logo':'',src:'official.png',crossorigin:'anonymous','data-logo-contrast':'pending'}),
    new Element('span',{class:'team-logo-fallback',hidden:''},[textNode('LFT')]),
    new Element('b',{},[textNode(score)])]);
  h.render([tree(24)]);const section=h.root.childNodes[0],[logo,fallback,score]=section.childNodes;
  logo.removeAttribute('crossorigin');logo.setAttribute('data-logo-cors-retried','official.png');logo.setAttribute('data-logo-contrast','contour');logo.setAttribute('hidden','');fallback.removeAttribute('hidden');
  section.scrollLeft=70;h.render([tree(31)]);
  assert.equal(h.root.childNodes[0],section);assert.equal(section.childNodes[0],logo);assert.equal(section.childNodes[1],fallback);assert.equal(section.childNodes[2],score);
  assert.equal(score.childNodes[0].nodeValue,'31');assert.equal(section.scrollLeft,70);
  assert.equal(logo.getAttribute('data-logo-contrast'),'contour');assert.equal(logo.getAttribute('data-logo-cors-retried'),'official.png');
  assert.equal(logo.hasAttribute('crossorigin'),false);assert.equal(logo.hasAttribute('hidden'),true);assert.equal(fallback.hasAttribute('hidden'),false);
});

test('detail patch preserves timeline choice and disclosures, marks hidden panels without rebuilding them',()=>{
  const h=patchHarness();
  const tree=label=>new Element('section',{},[
    new Element('details',{},[textNode(label)]),new Element('button',{'data-timeline-range':'recent','aria-pressed':'false'},[textNode('Recent')]),
    new Element('div',{'data-timeline-view':'recent',hidden:''},[textNode(label)]),
    new Element('div',{id:'detail-panel-plays',class:'detail-tab-panel',hidden:'','data-detail-lazy':'true'})]);
  h.render([tree('before')]);const [disclosure,range,view,hidden]=h.root.childNodes[0].childNodes;
  disclosure.setAttribute('open','');range.setAttribute('aria-pressed','true');view.removeAttribute('hidden');
  const table=new Element('table',{},[textNode('previously visited')]);hidden.appendChild(table);hidden.removeAttribute('data-detail-lazy');
  h.render([tree('after')]);
  assert.equal(disclosure.hasAttribute('open'),true);assert.equal(range.getAttribute('aria-pressed'),'true');assert.equal(view.hasAttribute('hidden'),false);
  assert.equal(hidden.childNodes[0],table);assert.equal(hidden.getAttribute('data-detail-lazy'),'true');
  assert.equal(disclosure.childNodes[0].nodeValue,'after');assert.equal(view.childNodes[0].nodeValue,'after');
  assert.doesNotMatch(hidden.getAttribute('class'),/nav-panel-enter/);
});
