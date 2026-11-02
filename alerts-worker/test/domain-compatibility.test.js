import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/index.js';

const origins=['https://mmueller091.github.io','https://slatemeter.app'];
function environment(t) {
  const db=new DatabaseSync(':memory:');db.exec(fs.readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));t.after(()=>db.close());
  return {db,DB:{prepare(sql){let args=[];return {bind(...values){args=values;return this;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));}}};
}
const call=(env,origin,path,method='GET',body,authorized=false)=>worker.fetch(new Request('https://worker.test'+path,{method,headers:{...(origin===undefined?{}:{Origin:origin}),...(authorized?{Authorization:'Bearer '+'migration_test_device_'.repeat(3)}:{}),'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env,{});

for(const origin of origins) {
  test(`${origin}: explicit preflight accepts all existing endpoint methods`,async t=>{
    const env=environment(t);
    for(const path of ['/health','/config','/feed','/game/NFL/401873024','/subscription','/test']) {
      const r=await call(env,origin,path,'OPTIONS');assert.equal(r.status,204);assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
      assert.equal(r.headers.get('Vary'),'Origin');assert.match(r.headers.get('Access-Control-Allow-Headers'),/Authorization/);
      for(const method of ['GET','PUT','DELETE','POST','OPTIONS'])assert.ok(r.headers.get('Access-Control-Allow-Methods').split(', ').includes(method));
    }
  });
  test(`${origin}: health and subscription preferences work without push delivery`,async t=>{
    const env=environment(t),preferences={enabled:false,sports:['NFL','NHL'],teams:[]};
    const health=await call(env,origin,'/health');assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
    const put=await call(env,origin,'/subscription','PUT',{threshold:87,preferences},true);assert.equal(put.status,200);assert.equal(put.headers.get('Access-Control-Allow-Origin'),origin);
    const get=await call(env,origin,'/subscription','GET',null,true);assert.deepEqual((await get.json()).preferences,preferences);
    const post=await call(env,origin,'/test','POST',null,true);assert.equal(post.status,409,'disabled devices cannot trigger real test pushes');assert.equal(post.headers.get('Access-Control-Allow-Origin'),origin);
    assert.equal(env.db.prepare('SELECT COUNT(*) n FROM subscriptions').get().n,0);
    assert.equal((await call(env,origin,'/subscription','DELETE',null,true)).status,200);
    for(const [path,method] of [['/subscription','GET'],['/subscription','PUT'],['/test','POST']])assert.equal((await call(env,origin,path,method)).status,401);
  });
}
for(const origin of ['https://evil.example','http://slatemeter.app','https://slatemeter.app.evil.example','https://mmueller091.github.io.evil.example','null','']) {
  test(`untrusted origin ${JSON.stringify(origin)} is rejected before any storage access`,async()=>{
    for(const method of ['GET','POST','PUT','DELETE','OPTIONS']) {
      const r=await call({},origin,'/subscription',method);assert.equal(r.status,403);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);assert.equal(r.headers.get('Vary'),'Origin');
    }
  });
}
test('non-browser health checks remain available without wildcard CORS',async t=>{
  const r=await call(environment(t),undefined,'/health');assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
});
