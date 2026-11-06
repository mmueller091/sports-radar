import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildScoringQuality,captureQualityEvidence} from '../src/quality.js';
import {dashboardHtml} from '../src/dashboard.js';
import {AUDIT_VERSION} from '../src/audit.js';
import {qualitySummary} from '../src/export.js';

test('dashboard script URL advances with the audit release instead of reusing a cached client',()=>{
  assert.ok(dashboardHtml.includes(`src="/dashboard.js?v=${encodeURIComponent(AUDIT_VERSION)}"`));
});

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

test('quality dashboard exposes diagnostic sections, explicit uncertainty and observation links',async()=>{
  const q=buildScoringQuality([]);
  q.games=[{gameKey:'NHL:regression',matchup:'Winnipeg vs Montreal',modelVersion:'audit-test',
    ratingTrajectory:[{referenceId:'NHL:regression|audit-test|1',observedAt:1,rating:88}],
    thresholds:[{threshold:85,firstObservedAt:1,gameTimeRemainingSeconds:7,episodeCount:1,estimatedSecondsAbove:null,firstCrossingUsefulness:'very_short_observed_runway'}],
    volatility:{maxAbsoluteChange:77,majorChanges:[{delta:77}]},comebackAnalysis:[],
    eventResponses:[{event:{id:'tying-goal',text:'Game-tying goal'},baseline:88,rating:87,change:-1,
      expectedDirection:'context-dependent',directionConsistent:null,magnitudeAssessment:'insufficient_evidence',status:'observed association',latency:{providerPublication:null}}]}];
  q.recommendations=[{gameKey:'NHL:regression',matchup:'Winnipeg vs Montreal',modelVersion:'audit-test',rating:88,observedAt:1,
    classification:'calibration_hypothesis',confidence:'low',signals:[],missingEvidence:['Full arithmetic ledger'],suspectedCause:'Boundary interaction requires replay',
    recommendedCorrection:'Inspect the gate',supportingObservations:[{referenceId:'NHL:regression|audit-test|1'}],replayTestingRequired:true}];
  q.historicalFindingReview=[{gameKey:'NHL:regression',reasonCode:'SIMILAR_STATE_OUTLIER',classification:'insufficient_evidence',reason:'Peers did not match the remaining clock'}];
  const h=harness(async url=>({ok:true,status:200,json:async()=>url.includes('/quality')?{dateNewYork:'2026-11-03',scoringQuality:q}:url.includes('/export/dates')?{defaultDate:'2026-11-03'}:{}}));
  await h.settle();await h.elements.get('quality-load').events.click();
  const texts=h.texts(h.elements.get('quality'));
  for(const heading of ['Executive summary','Confirmed integrity problems','High-priority scoring-quality concerns',
    'Potentially overrated games','Potentially underrated games','Significant events and rating responses',
    'Rating volatility and discontinuities','Alert usefulness','Sport-specific calibration and model-version comparisons',
    'Evidence coverage and limitations','Recommended investigations','Supporting game observations','Historical findings reconsidered'])assert.ok(texts.includes(heading),heading);
  assert.ok(texts.some(t=>t.includes('change -1.')));assert.ok(texts.some(t=>t.includes('game time remaining 7 seconds')));
  const all=e=>[e,...e.children.flatMap(all)],elements=all(h.elements.get('quality'));
  assert.ok(elements.some(e=>e.tag==='a'&&e.href==='#trajectory-NHL%3Aregression%7Caudit-test'));
  assert.ok(elements.some(e=>e.id==='trajectory-NHL%3Aregression%7Caudit-test'));
});

test('event previews prioritize timestamped brackets while labelling later-cache uncertainty',async()=>{
  const q=buildScoringQuality([]),eventResponses=Array.from({length:45},(_,i)=>({event:{id:'inferred-'+i,text:'Inferred event '+i},baseline:50,rating:60,change:10}));
  eventResponses.push({event:{id:'retro',text:'Timestamped retained goal',retrospective:true,occurredAt:1000},eventTimestamp:1000,baseline:80,rating:80,change:0,observedInterval:[500,1500]});
  q.games=[{gameKey:'NHL:test',sport:'NHL',modelVersion:'test',eventResponses}];
  const h=harness(async url=>({ok:true,status:200,json:async()=>url.includes('/quality')?{dateNewYork:'2026-11-03',scoringQuality:q}:url.includes('/export/dates')?{defaultDate:'2026-11-03'}:{}}));
  await h.settle();await h.elements.get('quality-load').events.click();
  const all=e=>[e,...e.children.flatMap(all)],section=all(h.elements.get('quality')).find(e=>e.id==='quality-events');
  const card=section.children.find(e=>e.tag==='article');
  assert.ok(h.texts(card).some(text=>text.includes('Timestamped retained goal')));
  assert.ok(h.texts(card).some(text=>text.includes('historical availability unknown')));
  const summary=qualitySummary(q).join('\n');assert.ok(summary.indexOf('Timestamped retained goal')<summary.indexOf('Inferred event 0'));
  assert.match(summary,/Retrospective later-cache association; historical availability unknown/);
  assert.equal(eventResponses[0].event.id,'inferred-0','presentation ordering never reorders analysis evidence');
});

test('high-priority section uses actual priority and distinguishes usable ratings from complete context',async()=>{
  const q=buildScoringQuality([]);
  q.recommendations=[
    {gameKey:'NHL:high',priority:'high',classification:'calibration_hypothesis',reason:'High concern'},
    {gameKey:'NHL:medium',priority:'medium',classification:'calibration_hypothesis',reason:'Medium concern'},
    {gameKey:'NHL:expected',priority:'high',classification:'expected_behavior',reason:'Expected game event'},
    {gameKey:'NHL:unassigned',classification:'confirmed_defect',reason:'No assigned priority'}];
  q.evidenceCoverage={totalObservations:100,usableScoringObservations:80,completeScoreProgressionObservations:70,completeContextualObservations:0};
  const h=harness(async url=>({ok:true,status:200,json:async()=>url.includes('/quality')?{dateNewYork:'2026-11-05',scoringQuality:q}:url.includes('/export/dates')?{defaultDate:'2026-11-05'}:{}}));
  await h.settle();await h.elements.get('quality-load').events.click();
  const all=e=>[e,...e.children.flatMap(all)],elements=all(h.elements.get('quality'));
  const priority=elements.find(e=>e.id==='quality-priority'),cards=priority.children.filter(e=>e.tag==='article');
  assert.equal(cards.length,1);assert.ok(h.texts(cards[0]).some(text=>text.includes('NHL:high')));
  assert.ok(h.texts(cards[0]).includes('HIGH PRIORITY'));
  const investigations=elements.find(e=>e.id==='quality-recommendations');
  assert.ok(h.texts(investigations).some(text=>text.includes('NHL:medium')),'lower-priority investigation remains visible');
  const coverage=elements.find(e=>e.id==='quality-evidence');
  assert.ok(h.texts(coverage).some(text=>text.includes('Usable scoring observations: 80 / 100')));
  assert.ok(h.texts(coverage).some(text=>text.includes('Complete contextual observations: 0')));
  const summary=qualitySummary(q).join('\n'),high=summary.split('### High-priority scoring-quality concerns')[1].split('### Potentially')[0];
  assert.match(high,/NHL:high.*high priority/);assert.doesNotMatch(high,/NHL:medium|NHL:expected|NHL:unassigned/);
  assert.match(summary,/Usable scoring observations: 80 \/ 100/);assert.match(summary,/Complete contextual observations: 0/);
});
