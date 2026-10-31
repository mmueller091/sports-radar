import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const team=['New Jersey Devils','NJD','3','','logo.png','8-5',1,'Devils','11'];
test('only the logo is inside the team-page button',()=>{
  const context=vm.createContext({safeText:String,teamLogoUrl:()=>''});
  vm.runInContext(source.slice(source.indexOf('function teamMarkup('),source.indexOf('function explainRating(')),context);
  const html=context.teamMarkup({sport:'NHL'},team,0);
  assert.match(html,/<button[^>]*class="card-team-link"[^>]*><img[^>]*><\/button>/);
  assert.ok(html.indexOf('</button>')<html.indexOf('class="team-name-text"'));
  assert.doesNotMatch(context.teamMarkup({sport:'NHL'},team),/card-team-link/);
});

function harness(kind) {
  const listeners={},opened=[];
  const card={dataset:{id:'game',sport:'NHL'}};
  const logo={dataset:{cardTeamIndex:'0'},closest:()=>card};
  const dot={closest:()=>card};
  const target={closest:selector=>selector==='.game-card'?card:selector==='.card-team-link'&&kind==='logo'?logo:selector==='.broadcast-watch-link'&&kind==='stream'?{}:selector==='.score-circle'&&kind==='rating'?dot:null};
  const context=vm.createContext({$:()=>({addEventListener:(name,fn)=>listeners[name]=fn}),games:[{id:'game',sport:'NHL',teams:[team]}],Date,
    openGameDetails:(...args)=>opened.push(['game',...args]),openTeamPage:args=>opened.push(['team',args.id])});
  vm.runInContext(source.slice(source.indexOf('let lastTouchOpen = 0;'),source.indexOf("$('#game-detail-overlay')\n  .addEventListener(\n    'click'")),context);
  return {listeners,opened,event:{target,pointerType:'touch',clientX:30,clientY:60,preventDefault(){},stopPropagation(){}}};
}

test('card text, scores and rating open Game Center; only a logo opens a team',()=>{
  for(const kind of ['name','score','rating','clock','background','logo']) {
    const h=harness(kind);h.listeners.click(h.event);
    assert.equal(h.opened[0][0],kind==='logo'?'team':'game',kind);
    assert.equal(h.opened.length,1);
  }
});

test('touch opens Game Center once and preserves scrolling',()=>{
  for(const kind of ['name','rating','logo']) {
    const h=harness(kind);h.listeners.pointerdown(h.event);h.listeners.pointerup(h.event);h.listeners.click(h.event);
    assert.equal(h.opened.length,1,kind);
    assert.equal(h.opened[0][0],kind==='logo'?'team':'game');
  }
  const scroll=harness('name');scroll.listeners.pointerdown(scroll.event);scroll.listeners.pointerup({...scroll.event,clientY:160});assert.equal(scroll.opened.length,0);
});

test('streaming links keep native activation and never open a game or team on touch or click',()=>{
  for(const input of ['click','touch']) {
    const h=harness('stream');let prevented=false;
    h.event.preventDefault=()=>{prevented=true;};
    if(input==='touch') { h.listeners.pointerdown(h.event);h.listeners.pointerup(h.event); }
    h.listeners.click(h.event);
    assert.equal(h.opened.length,0,input);
    assert.equal(prevented,false,'browser must handle HTTPS app handoff/fallback');
  }
});
