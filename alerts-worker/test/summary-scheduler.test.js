import test from 'node:test';
import assert from 'node:assert/strict';
import {forEachSummary} from '../src/summary-scheduler.js';

const sports=['NFL','CFB','NCAAB','NHL','MLB','NBA'];
const entries=(count,sport)=>Array.from({length:count},(_,id)=>({game:{id,sport:sport||sports[id%sports.length]}}));
const gate=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function blockedRun(t,rows,options,failures=new Map()) {
  const gates=rows.map(gate),started=[];
  let active=0,maxActive=0,settled=false;
  const work=forEachSummary(rows,async(entry,index)=>{
    started.push(index);active++;maxActive=Math.max(maxActive,active);
    try {
      await gates[index].promise;
      if(failures.has(index))throw failures.get(index);
    }finally{active--;}
  },options);
  work.then(()=>{settled=true;},()=>{settled=true;});
  t.after(async()=>{gates.forEach(g=>g.resolve());await Promise.allSettled([work]);});
  return {gates,started,work,get active(){return active;},get maxActive(){return maxActive;},get settled(){return settled;}};
}

test('enabled summaries fill a free slot without waiting for the slowest sibling',async t=>{
  const f=blockedRun(t,entries(13),{accelerated:true});
  assert.deepEqual(f.started,[0,1,2,3,4,5]);
  f.gates[1].resolve();await tick();
  assert.deepEqual(f.started,[0,1,2,3,4,5,6],'seventh summary starts while the first remains blocked');
  assert.equal(f.active,6);assert.equal(f.settled,false);
  f.gates.forEach(g=>g.resolve());await f.work;
  assert.deepEqual(f.started,Array.from({length:13},(_,i)=>i),'queue order and exactly-once admission are preserved');
  assert.equal(f.maxActive,6);assert.equal(f.active,0);
});

for(const [name,rows,options] of [
  ['default scheduling',entries(8),{}],
  ['soccer',entries(8,'Soccer'),{accelerated:true}],
  ['tennis',entries(8,'Tennis'),{accelerated:true}],
  ['mixed unsupported sports',[...entries(7),...entries(1,'Soccer')],{accelerated:true}]
])test(`${name} retains six-at-a-time admission`,async t=>{
  const f=blockedRun(t,rows,options);
  assert.deepEqual(f.started,[0,1,2,3,4,5]);
  f.gates.slice(1,6).forEach(g=>g.resolve());await tick();
  assert.deepEqual(f.started,[0,1,2,3,4,5]);
  f.gates[0].resolve();await tick();
  assert.deepEqual(f.started,[0,1,2,3,4,5,6,7]);
  f.gates.forEach(g=>g.resolve());await f.work;
  assert.equal(f.maxActive,6);
});

for(const accelerated of [false,true])test(`${accelerated?'rolling':'grouped'} failure drains admitted work and stops queued summaries`,async t=>{
  const first=new Error('first observed failure'),later=new Error('later failure at an earlier index');
  const f=blockedRun(t,entries(10),{accelerated},new Map([[4,first],[0,later]]));
  f.gates[4].resolve();await tick();
  f.gates[0].resolve();await tick();
  assert.equal(f.settled,false,'failure waits for already admitted siblings to settle');
  assert.deepEqual(f.started,[0,1,2,3,4,5],'queued summaries cannot start after a failure');
  f.gates.slice(0,6).forEach(g=>g.resolve());
  await assert.rejects(f.work,error=>error===first);
  assert.equal(f.active,0);assert.deepEqual(f.started,[0,1,2,3,4,5]);
});
