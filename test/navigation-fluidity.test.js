import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html = fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css = fs.readFileSync(new URL('../ui-overhaul.css',import.meta.url),'utf8');

function navigation() {
  const elements = new Map(),scrolls = [],focuses = [],renders = [];
  const state = {page:'home',teamRoute:null,sport:'CFB',gameState:'live',showFCS:false,
    sportFilters:{CFB:{top25:true}},favoriteTeams:[{sport:'NFL',name:'Baltimore Ravens'}],watchedGames:new Set(['NFL:123'])};
  const element = selector => {
    if (!elements.has(selector)) elements.set(selector,{scrollTop:0,isConnected:true,
      focus:options => focuses.push({selector,options})});
    return elements.get(selector);
  };
  const context = vm.createContext({state,location:{hash:'#home'},history:{scrollRestoration:'auto'},
    document:{activeElement:element('origin-card')},scrollX:0,scrollY:0,
    scrollTo:position => {scrolls.push(position);context.scrollX=position.left;context.scrollY=position.top;},
    $:element,pendingTeamReturn:null,teamReturnStack:[],activeDetailGame:null,linkedGameRequest:null,
    gameRouteFromHash:()=>null,teamRouteFromHash:hash=>{
      const match=hash.match(/^#team\/([^/]+)\/([^/]+)$/);
      return match ? {sport:match[1],id:match[2]} : null;
    },publicSport:()=>false,render:()=>renders.push(state.page),restoreTeamReturn(){},
    activeTeamPageKey:'',teamPageTab:'overview',teamDataKey:route=>route.sport+':'+route.id,
    loadTeamPageData(){},loadTeamStandings(){},loadFavoriteCatalog:()=>({finally(){}})});
  vm.runInContext(source.slice(source.indexOf('const navigationScrollPositions'),source.indexOf('function persistPreferences()')),context);
  vm.runInContext(source.slice(source.indexOf('function handleLocationChange()'),source.indexOf("window.addEventListener('hashchange',handleLocationChange)")),context);
  return {context,state,element,scrolls,focuses,renders,run:code=>vm.runInContext(code,context),
    route(hash){context.location.hash=hash;context.handleLocationChange();}};
}

test('page round trips restore scroll and preserve all slate filters and preferences',()=>{
  const h=navigation(),preferences=structuredClone(h.state);
  h.context.scrollY=900;
  h.route('#info');assert.equal(h.context.scrollY,0);
  h.context.scrollY=240;
  h.route('#standings');assert.equal(h.context.scrollY,0);
  h.context.scrollY=600;
  h.route('#home');assert.equal(h.context.scrollY,900);
  h.route('#info');assert.equal(h.context.scrollY,240);
  h.route('#standings');assert.equal(h.context.scrollY,600);
  h.route('#home');assert.equal(h.context.scrollY,900);
  assert.equal(h.renders.length,6,'one render per route change');
  assert.deepEqual(h.state,preferences);
  assert.ok(h.focuses.every(item=>item.options.preventScroll));
});

test('manual history restoration prevents browser Back and Forward from corrupting saved page positions',()=>{
  const h=navigation();assert.equal(h.context.history.scrollRestoration,'manual');
  const traverse=(hash,nativePosition)=>{
    if(h.context.history.scrollRestoration==='auto')h.context.scrollY=nativePosition;
    h.route(hash);
  };
  h.context.scrollY=860;h.route('#info');h.context.scrollY=310;
  traverse('#home',860);assert.equal(h.context.scrollY,860);
  traverse('#info',310);assert.equal(h.context.scrollY,310);
  traverse('#home',860);assert.equal(h.context.scrollY,860);
  assert.equal(h.run("navigationScrollPositions.get('info').y"),310);
});

test('team navigation stores the outgoing slate position even when the team route is assigned before hashchange',()=>{
  const h=navigation();h.context.scrollY=720;
  h.context.rememberNavigationScroll('#team/NFL/33');
  h.state.page='team';h.state.teamRoute={sport:'NFL',id:'33'};
  h.context.scrollY=0; // A cached team render can clamp the old page before hashchange.
  h.route('#team/NFL/33');assert.equal(h.context.scrollY,0);
  h.context.scrollY=480;h.route('#home');assert.equal(h.context.scrollY,720);
  h.route('#team/NFL/33');assert.equal(h.context.scrollY,480);
  const teamRenderer=source.slice(source.indexOf('function renderTeamPage()'),source.indexOf('function openTeamPage('));
  assert.doesNotMatch(teamRenderer,/list\.innerHTML\s*=\s*['"]['"]/,'hidden slate DOM must survive a team visit');
});

test('returning to a saved team tab restores scroll after its longer content has rendered',()=>{
  const h=navigation();
  h.route('#team/NFL/33');h.context.scrollY=960;
  h.route('#team/NFL/34');h.context.scrollY=200;
  const order=[];
  h.context.renderTeamPage=()=>order.push('tab:'+h.context.teamPageTab);
  h.context.openGameDetails=()=>order.push('detail');
  const scrollTo=h.context.scrollTo;
  h.context.scrollTo=position=>{order.push('scroll:'+position.top);scrollTo(position);};
  vm.runInContext(source.slice(source.indexOf('function restoreTeamReturn('),source.indexOf('function returnFromTeamPage(')),h.context);
  h.context.pendingTeamReturn={hash:'#team/NFL/33',teamTab:'schedule',page:'team',teamRoute:{sport:'NFL',id:'33'}};
  h.route('#team/NFL/33');
  assert.deepEqual(order,['tab:schedule','scroll:960']);
  assert.equal(h.context.scrollY,960);
});

test('Game Center close restores underlying scroll and focus without recapturing the open overlay',()=>{
  const h=navigation(),overlay={hidden:true};h.context.scrollY=640;
  h.element('#game-detail-dialog').scrollTop=350;
  h.context.rememberDetailNavigation(overlay);
  assert.equal(h.element('#game-detail-dialog').scrollTop,0,'a new game starts at the top');
  overlay.hidden=false;h.context.document.activeElement=h.element('close');
  h.context.scrollY=0;h.context.rememberDetailNavigation(overlay);
  h.context.restoreDetailNavigation();
  assert.equal(h.context.scrollY,640);
  assert.equal(h.focuses.at(-1).selector,'origin-card');
  assert.equal(h.focuses.at(-1).options.preventScroll,true);
  const count=h.focuses.length;h.context.restoreDetailNavigation();assert.equal(h.focuses.length,count);
});

test('leaving the underlying page does not restore focus or scroll to an unrelated detail origin',()=>{
  const h=navigation();h.context.scrollY=640;h.context.rememberDetailNavigation({hidden:true});
  h.route('#info');assert.equal(h.context.scrollY,0);
  assert.deepEqual(h.focuses.map(item=>item.selector),['#info-title']);
  assert.equal(h.run('detailNavigationOrigin'),null);
});

test('navigation links leave rendering and filter state to the hash router',()=>{
  const h=navigation(),handlers=[];
  h.context.$$=()=>['home','info','standings'].map(page=>({dataset:{page},addEventListener:(name,handler)=>handlers.push(handler)}));
  vm.runInContext(source.slice(source.lastIndexOf("$$('.nav-link').forEach("),source.indexOf('function handleLocationChange()')),h.context);
  const before=structuredClone(h.state);
  for(const handler of handlers)handler({});
  assert.deepEqual(h.state,before);assert.equal(h.renders.length,0);
  assert.equal(h.context.location.hash,'#home','the native href, not a second imperative route, changes the hash');
});

function sportMenu() {
  const listeners=new Map(),classes=new Set(),label={textContent:''};let focused=false,active='all';
  const register=(target,name,handler,capture=false)=>listeners.set(target+':'+name,{handler,capture});
  const panel={classList:{contains:name=>classes.has(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},
    querySelector:()=>({dataset:{sport:active}}),contains:target=>target===panel,
    addEventListener:(name,handler,capture)=>register('panel',name,handler,capture)};
  const toggle={setAttribute(name,value){this[name]=value;},focus:()=>focused=true,contains:target=>target===toggle,
    addEventListener:(name,handler)=>register('toggle',name,handler)};
  const context=vm.createContext({document:{getElementById:id=>({'mobile-sport-filter-toggle':toggle,'mobile-sport-panel':panel,'mobile-sport-filter-label':label}[id]),
    addEventListener:(name,handler)=>register('document',name,handler)},window:{addEventListener:(name,handler)=>register('window',name,handler)}});
  const inline=html.match(/<script>\s*(\(\(\) => \{[\s\S]*?mobile-sport-filter-toggle[\s\S]*?\}\)\(\);)\s*<\/script>/)[1];
  vm.runInContext(inline,context);
  return {listeners,label,toggle,classes,open:()=>listeners.get('toggle:click').handler(),
    get focused(){return focused;},set active(value){active=value;}};
}

test('sport selection dismisses the menu during capture before expensive chip rendering and updates its label',()=>{
  const h=sportMenu();h.open();assert.equal(h.toggle['aria-expanded'],'true');
  const click=h.listeners.get('panel:click');assert.equal(click.capture,true);
  click.handler({target:{closest:()=>({dataset:{sport:'CFB'}})}});
  assert.equal(h.toggle['aria-expanded'],'false');assert.equal(h.label.textContent,'College Football');
  assert.ok(!h.classes.has('mobile-expanded'));
  h.open();h.active='NHL';h.listeners.get('window:hashchange').handler();
  assert.equal(h.label.textContent,'NHL');assert.equal(h.toggle['aria-expanded'],'false');
});

test('Escape dismisses the sport menu and restores focus to its toggle',()=>{
  const h=sportMenu();let prevented=false;h.open();
  h.listeners.get('document:keydown').handler({key:'Escape',preventDefault:()=>prevented=true});
  assert.equal(h.toggle['aria-expanded'],'false');assert.ok(h.focused);assert.ok(prevented);
});

test('navigation motion is short, tab animation is explicit, and reduced motion remains honored',()=>{
  assert.match(css,/--motion-panel:\s*180ms/);
  assert.match(css,/\.detail-tab-panel\.nav-panel-enter\s*\{\s*animation:\s*panel-reveal 180ms/);
  assert.match(css,/#game-list:not\(\.hidden\).*animation:\s*panel-reveal 160ms/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[\s\S]*#info-page[^}]*animation:\s*none !important/);
});
