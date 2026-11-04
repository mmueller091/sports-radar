import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('app.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const runtime=fs.readFileSync('dist/scoring-runtime.js','utf8');
const sports=['NFL','MLB','NHL','CFB','NBA','NCAAB'];
const preferencesKey='sports-radar-preferences-v2';
const modelVersion=vm.runInNewContext(runtime+';SportsRadarScore.MODEL_VERSION');

function start(storage=new Map()) {
  const elements=new Map();
  const element=selector=>{
    if (!elements.has(selector)) {
      const classes=new Set(),events={};
      elements.set(selector,{innerHTML:'',textContent:'',value:'',dataset:{},events,
        classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,on)=>{if(on??!classes.has(n))classes.add(n);else classes.delete(n);}},
        addEventListener:(name,handler)=>(events[name]??=[]).push(handler),setAttribute(name,value){this[name]=value;},querySelectorAll:()=>[]});
    }
    return elements.get(selector);
  };
  const chips=[...html.matchAll(/<button class="([^"]*sport-chip[^"]*)" data-sport="([^"]+)">([\s\S]*?)<\/button>/g)].map(([,classes,sport,label])=>{
    const chip=element('chip:'+sport);chip.dataset.sport=sport;chip.textContent=label;
    classes.split(' ').forEach(name=>chip.classList.add(name));return chip;
  });
  const toggles=[...html.matchAll(/data-visible-sport="([^"]+)"/g)].map(([,sport])=>{
    const input=element('toggle:'+sport);input.dataset.visibleSport=sport;input.closest=()=>element('label:'+sport);return input;
  });
  const all=selector=>selector==='.sport-chip[data-sport]'?chips:selector==='[data-visible-sport]'?toggles:selector==='.soccer-chip'?chips.filter(chip=>chip.dataset.sport==='Soccer'):[];
  const feed=sports.map(sport=>({id:sport,sport,state:'live',startTime:new Date().toISOString(),status:'Live',score:60,modelVersion,teams:[['Home','H','0'],['Away','A','0']]}));
  const context=vm.createContext({
    document:{body:element('body'),querySelector:element,querySelectorAll:all,addEventListener(){},hidden:false},
    window:{addEventListener(){}},navigator:{},location:{hash:''},
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    fetch:async()=>({ok:true,json:async()=>({modelVersion,updatedAt:new Date().toISOString(),games:feed})}),
    AbortSignal,setTimeout:()=>1,clearTimeout(){},setInterval(){}
  });
  vm.runInContext(runtime,context);
  vm.runInContext(fs.readFileSync('sport-visibility.js','utf8'),context);
  vm.runInContext(source,context);
  const event=(target,name)=>{for(const handler of target.events[name]||[])handler({target});};
  return {
    storage,element,run:code=>vm.runInContext(code,context),
    options:()=>chips.filter(chip=>!chip.classList.contains('hidden')).map(chip=>chip.dataset.sport),
    checkboxes:()=>toggles.filter(input=>!input.closest().classList.contains('hidden')).map(input=>input.dataset.visibleSport),
    ids:()=>[...element('#game-list').innerHTML.matchAll(/data-id="([^"]+)"/g)].map(match=>match[1]),
    toggle(sport,checked){const input=element('toggle:'+sport);input.checked=checked;event(input,'change');},
    select(sport){event(element('chip:'+sport),'click');element('#mobile-sport-filter-label').textContent=sport;},
    reopen(){event(element('#profile-button'),'click');},
    settle:()=>new Promise(resolve=>setImmediate(resolve))
  };
}

test('default Sports options and Settings retain all six sports in their existing order',async()=>{
  const app=start();await app.settle();
  assert.deepEqual(app.options(),['all',...sports]);
  assert.deepEqual(app.checkboxes(),sports);
  assert.ok(sports.every(sport=>app.element('toggle:'+sport).checked));
  assert.deepEqual(new Set(app.ids()),new Set(sports));
  assert.deepEqual(sports.map(sport=>app.element('chip:'+sport).textContent),['NFL','MLB','NHL','College Football','NBA','NCAAM']);
});

test('unchecking each home sport removes its chip and All sports games; rechecking restores the original order',async()=>{
  const app=start();await app.settle();
  for(const sport of sports) {
    app.toggle(sport,false);
    assert.deepEqual(app.options(),['all',...sports.filter(item=>item!==sport)]);
    assert.deepEqual(new Set(app.ids()),new Set(sports.filter(item=>item!==sport)));
    assert.deepEqual(app.checkboxes(),sports);
    app.reopen();assert.ok(!app.options().includes(sport),'reopening Settings must not restore an unchecked chip');
    app.toggle(sport,true);
    assert.deepEqual(app.options(),['all',...sports]);
    assert.deepEqual(new Set(app.ids()),new Set(sports));
  }
});

test('disabling selected NHL returns the active chip and collapsed Sports label to All',async()=>{
  const app=start();await app.settle();app.select('NHL');
  assert.deepEqual(app.ids(),['NHL']);
  app.toggle('NHL',false);
  assert.equal(app.run('state.sport'),'all');
  assert.ok(app.element('chip:all').classList.contains('active'));
  assert.ok(!app.element('chip:NHL').classList.contains('active'));
  assert.equal(app.element('#mobile-sport-filter-label').textContent,'All');
  assert.ok(!app.options().includes('NHL'));
  assert.deepEqual(new Set(app.ids()),new Set(sports.filter(sport=>sport!=='NHL')));
});

test('disabled sports remain absent after refresh and all-off preferences stay empty without changing other saved settings',async()=>{
  const favorites=[{sport:'NFL',name:'Baltimore Ravens',id:'',logo:''}];
  const storage=new Map([[preferencesKey,JSON.stringify({showFCS:false,favoriteTeams:favorites,sportFilters:{CFB:{conference:'',top25:true}}})],['notification-preferences-sentinel','unchanged']]);
  const app=start(storage);await app.settle();const originalKeys=[...storage.keys()];app.toggle('NHL',false);
  const next=start(storage);await next.settle();
  assert.ok(!next.element('toggle:NHL').checked);
  assert.deepEqual(next.options(),['all',...sports.filter(sport=>sport!=='NHL')]);
  assert.ok(!next.ids().includes('NHL'));
  for(const sport of sports)next.toggle(sport,false);
  const empty=start(storage);await empty.settle();
  assert.deepEqual(empty.options(),['all']);assert.deepEqual(empty.ids(),[]);assert.deepEqual(empty.checkboxes(),sports);
  for(const sport of sports)empty.toggle(sport,true);
  const restored=start(storage);await restored.settle();assert.deepEqual(restored.options(),['all',...sports]);
  const saved=JSON.parse(storage.get(preferencesKey));
  assert.equal(saved.showFCS,false);assert.deepEqual(saved.favoriteTeams,favorites);assert.equal(saved.sportFilters.CFB.top25,true);
  assert.equal(storage.get('notification-preferences-sentinel'),'unchanged');
  assert.deepEqual([...storage.keys()],originalKeys);
});

test('both installation rows share the correctly encoded down chevron with no mojibake in the component',()=>{
  const css=fs.readFileSync('styles.css','utf8');
  const rule=css.match(/\.install-settings summary::after\s*\{([^}]+)\}/)[1];
  const content=rule.match(/content:\s*'([^']+)'/)[1].replace(/\\([0-9a-f]{1,6})/gi,(_,hex)=>String.fromCodePoint(parseInt(hex,16)));
  assert.equal(content,'⌄');
  const install=html.match(/<section class="preference-block install-settings"[\s\S]*?<\/section>/)[0];
  assert.equal((install.match(/<summary>/g)||[]).length,2);
  assert.doesNotMatch(install+css.split('\n').filter(line=>/install-settings|install-share-icon|install-menu-icon/.test(line)).join('\n'),/â|Ã|\uFFFD/);
});
