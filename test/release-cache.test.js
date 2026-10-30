import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('cached shell upgrade installs a complete revision, preserves user storage and refuses mixed assets',async()=>{
  const origin='https://mmueller091.github.io/sports-radar/';
  const stores=new Map([['sports-radar-shell-trajectory-v1',new Map()],['unrelated-cache',new Map()]]);
  const localStorage=new Map([['sports-radar-selected-favorites-v1','favorites'],['sports-radar-preferences-v2','preferences'],['sports-radar-watched-games-v1','watchlist']]);
  const original=[...localStorage];const listeners={};let offline=false,claimed=false;
  const href=request=>new URL(typeof request==='string'?request:request.url,origin).href;
  const fetch=async request=>{if(offline)throw Error('offline');return new Response(href(request));};
  const caches={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async key=>{
    if(!stores.has(key))stores.set(key,new Map());const entries=stores.get(key);
    return {addAll:async requests=>{for(const r of requests)entries.set(href(r),await fetch(r));},
      match:async(request,options)=>{
        const url=href(request);const key=options?.ignoreSearch?[...entries.keys()].find(k=>k.split('?')[0]===url.split('?')[0]):url;
        return entries.get(key)?.clone();
      }};
  }};
  const context={caches,URL,Response,fetch,localStorage,
    Request:class extends Request {constructor(url,options){super(new URL(url,origin),options);}},
    self:{location:{origin:new URL(origin).origin},addEventListener:(name,fn)=>listeners[name]=fn,
      skipWaiting:async()=>{},clients:{claim:async()=>{claimed=true;}}}};
  vm.runInNewContext(fs.readFileSync('sw.js','utf8').replaceAll('__BUILD_REV__','release-123'),context);
  const dispatch=async name=>{let promise;listeners[name]({waitUntil:p=>promise=p});await promise;};
  await dispatch('install');await dispatch('activate');
  assert.equal(claimed,true);assert.equal(stores.has('sports-radar-shell-trajectory-v1'),false);
  assert.equal(stores.has('unrelated-cache'),true);assert.deepEqual([...localStorage],original);
  offline=true;
  const request=async url=>{let promise;listeners.fetch({request:new Request(new URL(url,origin)),respondWith:p=>promise=p});return promise;};
  assert.match(await (await request('scoring-runtime.js?rev=release-123')).text(),/release-123/);
  await assert.rejects(request('scoring-runtime.js?rev=old-build'),/offline/);
  assert.match(await (await request('./')).text(),/release-123/);
});
