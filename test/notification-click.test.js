import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const scope='https://mmueller091.github.io/sports-radar/';
function harness(windows=[],appScope=scope) {
  const scope=appScope;
  const events={},shown=[],opened=[];
  vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{URL,self:{location:{href:scope+'sw.js',origin:new URL(scope).origin},registration:{scope,showNotification:async(title,options)=>shown.push({title,...options})},clients:{matchAll:async()=>windows,openWindow:async url=>opened.push(url)},addEventListener:(name,fn)=>events[name]=fn}});
  return {shown,opened,async push(payload){let task;events.push({data:{json:()=>payload},waitUntil:p=>task=p});await task;},async click(data){let task,closed=false;events.notificationclick({notification:{data,close:()=>closed=true},waitUntil:p=>task=p});await task;assert.equal(closed,true);}};
}
test('background push keeps the stable identity and cold-start Game Center URL',async()=>{
  const h=harness();await h.push({title:'Game crosses 85',body:'A threshold crossing',sport:'NFL',gameId:'401123',gameKey:'NFL:401123',url:scope+'#game/NFL/401123'});
  assert.equal(h.shown[0].data.gameId,'401123');assert.equal(h.shown[0].data.sport,'NFL');await h.click(h.shown[0].data);assert.deepEqual(h.opened,[scope+'#game/NFL/401123']);
});
test('an existing installed or browser window navigates and focuses instead of opening another',async()=>{
  for(const current of ['#home','#soccer','#game/NFL/older']) {
    const navigated=[];let focuses=0;
    const client={url:scope+current,async navigate(url){navigated.push(url);return this;},async focus(){focuses++;}};
    const h=harness([{url:'https://mmueller091.github.io/another-app/'},client]);await h.click({sport:'CFB',gameId:'401456'});
    assert.deepEqual(navigated,[scope+'#game/CFB/401456']);assert.equal(focuses,1);assert.deepEqual(h.opened,[]);
  }
});
test('notification URLs remain inside the GitHub Pages base path',async()=>{
  const h=harness();await h.click({url:'https://evil.example/game'});assert.deepEqual(h.opened,[scope+'#home']);
  const legacy=harness();await legacy.click({url:scope+'#home'});assert.deepEqual(legacy.opened,[scope+'#home']);
});
test('a window closed during notification navigation falls back to a new app window',async()=>{
  const h=harness([{url:scope,async navigate(){throw new Error('window closed');}}]);
  await h.click({sport:'NHL',gameId:'123'});assert.deepEqual(h.opened,[scope+'#game/NHL/123']);
});
test('old and new installations preserve game identity across canonical URL changes',async()=>{
  for(const installedScope of [scope,'https://slatemeter.app/']) {
    for(const payloadScope of [scope,'https://slatemeter.app/']) {
      const h=harness([],installedScope);
      await h.push({sport:'NFL',gameId:'401123',gameKey:'NFL:401123',url:payloadScope+'#game/NFL/401123'});
      assert.equal(h.shown[0].title,'SlateMeter');
      await h.click(h.shown[0].data);
      assert.deepEqual(h.opened,[installedScope+'#game/NFL/401123']);
      const home=harness([],installedScope);await home.click({url:payloadScope+'#home'});assert.deepEqual(home.opened,[installedScope+'#home']);
    }
  }
});
test('canonical installation rejects off-origin and out-of-scope notification destinations',async()=>{
  for(const url of ['https://evil.example/','https://slatemeter.app/other','javascript:alert(1)']) {
    const h=harness([],'https://slatemeter.app/');await h.click({url});assert.deepEqual(h.opened,['https://slatemeter.app/#home']);
  }
});
