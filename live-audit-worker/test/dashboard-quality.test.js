import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildScoringQuality,captureQualityEvidence} from '../src/quality.js';
import {dashboardHtml} from '../src/dashboard.js';

function harness(fetch){
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';this.value='';this.classList={toggle(){},add(){}};}
    append(...items){for(const item of items){item.parent=this;this.children.push(item);}}
    get firstChild(){return this.children[0]||null;}
    remove(){this.parent.children.splice(this.parent.children.indexOf(this),1);}
    addEventListener(type,callback){this.events[type]=callback;}
    set innerHTML(_){throw Error('HTML insertion forbidden');}
  }
  const elements=new Map([...dashboardHtml.matchAll(/id="([^"]+)"/g)].map(m=>[m[1],new Element('div')]));
  const context={document:{getElementById:id=>elements.get(id),createElement:tag=>new Element(tag)},fetch,location:{},setInterval(){},Date,Intl,console};
  vm.runInNewContext(fs.readFileSync(new URL('../src/dashboard-client.txt',import.meta.url),'utf8'),context);
  const settle=async()=>{for(let i=0;i<6;i++)await new Promise(resolve=>setImmediate(resolve));};
  const texts=element=>[element.textContent,...element.children.flatMap(texts)];
  return {elements,context,settle,texts};
}
test('quality loads on demand, renders model cohorts and treats provider markup as literal text',async()=>{
  const g={id:'x',sport:'NBA',state:'live',score:92,teams:[['<img src=x onerror=alert(1)>','A',120],['B','B',90]],liveRawStatus:{period:4,displayClock:'1:00'}};
  const at=Date.now(),q=buildScoringQuality([{gameKey:'NBA:x',sport:'NBA',matchup:g.teams[0][0],observations:[{observedAt:at,rating:92,state:g,scoringVersion:'test',qualityEvidence:captureQualityEvidence(g,{publishedAt:at,observedAt:at})}]}]);
  let qualityReads=0;
  const h=harness(async url=>({ok:true,status:200,json:async()=>url.includes('/quality')?(qualityReads++,{dateNewYork:'2026-11-03',scoringQuality:q}):url.includes('/export/dates')?{defaultDate:'2026-11-03'}:{}}));
  await h.settle();assert.equal(qualityReads,0,'periodic dashboard refresh does not add expensive quality reads');
  await h.elements.get('quality-load').events.click();
  assert.equal(qualityReads,1);assert.ok(h.texts(h.elements.get('quality')).some(s=>s.includes('<img src=x onerror=alert(1)>')));
  assert.ok(h.texts(h.elements.get('quality')).some(s=>s.includes('Calibration · test')));
  assert.equal(h.elements.get('quality-load').disabled,false);
});
test('late quality response cannot overwrite a different selected date',async()=>{
  let finish;
  const h=harness(async url=>url.includes('/quality')?new Promise(resolve=>finish=resolve):{ok:true,status:200,json:async()=>url.includes('/export/dates')?{defaultDate:'2026-11-03'}:{}});
  await h.settle();const pending=h.elements.get('quality-load').events.click();
  h.elements.get('day').value='2026-11-02';h.elements.get('day').events.change();
  finish({ok:true,status:200,json:async()=>({dateNewYork:'2026-11-03',scoringQuality:buildScoringQuality([])})});
  await pending;assert.equal(h.elements.get('quality-status').textContent,'Load quality for the selected date.');assert.equal(h.elements.get('quality').children.length,0);
});
