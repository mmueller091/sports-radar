import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
const source=fs.readFileSync(new URL('../notifications.js',import.meta.url),'utf8');
const allSports=['NFL','MLB','NHL','CFB','NBA','NCAAB','Tennis','Soccer'];
const favorite={sport:'NFL',id:'33',name:'Baltimore Ravens'};
function harness({storage=new Map(),remote={subscribed:true,threshold:85,preferences:{enabled:true,sports:allSports,teams:[]}},ios=false,installed=false,subscribed=true}={}) {
  const elements=new Map(),windowEvents={},calls=[];let unsubscribed=0,subscribes=0,permissionRequests=0,online=true;
  const element=selector=>{if(!elements.has(selector))elements.set(selector,{value:selector==='#notification-team-sport'?'all':'',innerHTML:'',textContent:'',hidden:false,disabled:false,attrs:{},events:{},classList:{toggle(){}},setAttribute(key,value){this.attrs[key]=value;},addEventListener(name,fn){this.events[name]=fn;}});return elements.get(selector);};
  const transport=()=>({toJSON:()=>({endpoint:'https://web.push.apple.com/client',keys:{p256dh:'test',auth:'test'}}),async unsubscribe(){unsubscribed++;subscription=null;return true;}});
  let subscription=subscribed?transport():null;
  const registration={pushManager:{async getSubscription(){return subscription;},async subscribe(){subscribes++;return subscription=transport();}}};
  const Notification={permission:'default',async requestPermission(){permissionRequests++;this.permission='granted';return 'granted';}};
  const directory={load:async()=>{},search:(query='',sport='all')=>[favorite,{sport:'NHL',id:'23',name:'Washington Capitals'}].filter(team=>(sport==='all'||sport===team.sport)&&team.name.toLowerCase().includes(query.toLowerCase())),favorites:()=>[favorite]};
  const context=vm.createContext({console,Uint8Array,crypto:webcrypto,atob,AbortSignal,
    SPORTS_RADAR_ALERTS_URL:'https://worker.test',SportsRadarTeams:directory,
    document:{readyState:'complete',querySelector:element,addEventListener(){}},
    navigator:{userAgent:ios?'iPhone':'Android',standalone:installed,serviceWorker:{ready:Promise.resolve(registration)}},
    matchMedia:()=>({matches:installed}),PushManager:function(){},Notification,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
    fetch:async(url,options={})=>{
      if(!online)throw new Error('offline');calls.push({url,method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
      if(url.endsWith('/config'))return Response.json({publicKey:'AQID'});
      if(options.method==='PUT'){const body=JSON.parse(options.body);remote={...remote,threshold:body.threshold,preferences:body.preferences,subscribed:Boolean(body.subscription)||remote.subscribed};return Response.json({ok:true,...remote});}
      if(options.method==='DELETE'){remote={...remote,subscribed:false,preferences:{...remote.preferences,enabled:false}};return Response.json({ok:true});}
      return Response.json(remote);
    }});
  context.window=context;context.addEventListener=(name,fn)=>windowEvents[name]=fn;
  vm.runInContext(source,context);
  const settle=async()=>{for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));};
  return {context,storage,calls,element,settle,remote:()=>remote,counts:()=>({unsubscribed,subscribes,permissionRequests}),setOnline:value=>online=value,
    async event(selector,name,event={}){await element(selector).events[name](event);await settle();},async online(){await windowEvents.online();await settle();}};
}
test('team/favorite preferences persist independently of disabled sports and survive reopening',async()=>{
  const h=harness();await h.settle();
  await h.event('#notification-sports','change',{target:{dataset:{notificationSport:'NFL'},checked:false}});
  await h.event('#notification-add-favorites','click');
  assert.equal(h.remote().preferences.sports.includes('NFL'),false);assert.deepEqual(h.remote().preferences.teams,[favorite]);
  const reopened=harness({storage:h.storage,remote:h.remote()});await reopened.settle();
  assert.equal(reopened.element('#alert-toggle').attrs['aria-checked'],'true');assert.match(reopened.element('#notification-selected-teams').innerHTML,/Baltimore Ravens/);
  assert.doesNotMatch(reopened.element('#notification-sports').innerHTML,/data-notification-sport="NFL" checked/);
  await reopened.event('#alert-toggle','click');assert.equal(reopened.remote().preferences.enabled,false);assert.equal(reopened.counts().unsubscribed,1);
});
test('installed iPhone and Android enroll only from a user action; regular iPhone explains installation',async()=>{
  for(const ios of [true,false]) {
    const h=harness({ios,installed:true,subscribed:false,remote:{subscribed:false,threshold:85,preferences:{enabled:false,sports:['NFL'],teams:[]}}});await h.settle();
    assert.equal(h.counts().permissionRequests,0);assert.equal(h.element('#alert-toggle').disabled,false);
    await h.event('#alert-toggle','click');assert.equal(h.counts().permissionRequests,1);assert.equal(h.counts().subscribes,1);assert.equal(h.remote().preferences.enabled,true);
  }
  const safari=harness({ios:true,installed:false,subscribed:false,remote:{subscribed:false,threshold:85,preferences:{enabled:false,sports:allSports,teams:[]}}});await safari.settle();
  assert.equal(safari.element('#alert-toggle').disabled,true);assert.match(safari.element('#alert-status').textContent,/Home Screen icon/);assert.equal(safari.counts().permissionRequests,0);
});
test('offline preference changes remain pending and sync on reconnect; master off unsubscribes',async()=>{
  const h=harness();await h.settle();h.setOnline(false);
  await h.event('#alert-toggle','click');assert.equal(h.counts().unsubscribed,1);assert.equal(h.element('#alert-toggle').attrs['aria-checked'],'false');
  assert.equal(JSON.parse(h.storage.get('sports-radar-notification-preferences-v1')).pending,true);
  h.setOnline(true);await h.online();assert.equal(h.remote().preferences.enabled,false);assert.equal(JSON.parse(h.storage.get('sports-radar-notification-preferences-v1')).pending,false);
});

test('native install is offered on request and installed apps are not prompted again',async()=>{
  const app=fs.readFileSync('app.js','utf8').replace(/\r\n/g,'\n');const install=app.slice(app.indexOf('let deferredInstallPrompt;'),app.indexOf("if (\n  'serviceWorker'",app.indexOf('let deferredInstallPrompt;')));
  const elements=new Map(),events={},storage=new Map();let prompts=0;
  const element=key=>{if(!elements.has(key))elements.set(key,{hidden:true,events:{},classList:{toggle(){}},addEventListener(name,fn){this.events[name]=fn;}});return elements.get(key);};
  const context=vm.createContext({navigator:{standalone:false},$:element,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},matchMedia:()=>({matches:false,addEventListener(){}})});
  context.window={addEventListener:(name,fn)=>events[name]=fn};vm.runInContext(install,context);
  events.beforeinstallprompt({preventDefault(){},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'accepted'})});
  assert.equal(element('#settings-install-button').hidden,false);assert.equal(prompts,0);
  await element('#settings-install-button').events.click();assert.equal(prompts,1);
  events.appinstalled();assert.equal(element('#settings-install-button').hidden,true);assert.equal(element('#install-status').textContent,'Already installed');
  context.navigator.standalone=true;events.beforeinstallprompt({preventDefault(){},prompt(){prompts++;}});await element('#settings-install-button').events.click();assert.equal(prompts,1);
});
