import test from 'node:test';
import assert from 'node:assert/strict';
import {buildEventResponses} from '../src/event-response.js';
import {captureEvidenceDetails,eventKinds,extractRetainedProviderEvents} from '../src/evidence.js';

const origin=Date.parse('2026-11-04T02:00:00Z');
const point=(seconds,rating,scores=[2,3],extra={})=>({gameKey:'NHL:test',modelVersion:'model-a',
  observedAt:origin+seconds*1000,publishedAt:origin+seconds*1000-15000,rating,scores,
  sport:'NHL',period:3,clockSeconds:300-seconds,live:true,lifecycle:'live',integrity:[],
  evidenceStatus:'partial',q:{rejected:false,scoringPartial:false},...extra});
const event=(id,seconds,kinds=['goal','game_tying'],extra={})=>({id,occurredAt:seconds===null?null:origin+seconds*1000,
  kinds,timestampKind:seconds===null?'unavailable':'provider-event-wallclock',stateAlignment:'not-ahead-of-rated-state',...extra});
const withEvents=(p,events)=>({...p,q:{...p.q,canonicalEvents:events}});

test('tying goal has a bounded positive association, never an exact publication latency',()=>{
  const responses=buildEventResponses([point(0,78),withEvents(point(180,90,[3,3]),[event('tie',120,undefined,{scores:[3,3]})])],'NHL');
  const r=responses.find(r=>r.event.id==='tie');
  assert.equal(r.baseline,78);assert.equal(r.rating,90);assert.equal(r.change,12);
  assert.equal(r.expectedDirection,'increase_or_sustain');assert.equal(r.directionConsistent,true);
  assert.equal(r.latency.exactResponseMs,null);assert.equal(r.latency.providerLatencyMs,null);
  assert.equal(r.latency.providerPublicationLatencyMs,null);assert.equal(r.latency.scoringProcessingMs,null);
  assert.equal(r.latency.eventToFirstObservedResponseUpperBoundMs,60000);
  assert.equal(r.responsePublishedAt,null);assert.equal(r.eventToObservedRiseMs,null);
});

test('a lead-widening goal late can appropriately lower neutral watchability',()=>{
  const r=buildEventResponses([point(0,85,[3,4]),withEvents(point(180,40,[3,5]),[event('widen',120,['goal'],{scores:[3,5]})])],'NHL').find(r=>r.event.id==='widen');
  assert.equal(r.change,-45);assert.equal(r.expectedDirection,'decrease_permitted');
  assert.equal(r.directionConsistent,true);assert.match(r.magnitudeAssessment,/excess is unproven/);
});

test('an overtime winner is resolved watchability even if provider state has not become completed',()=>{
  const r=buildEventResponses([point(0,95,[4,4],{period:4}),withEvents(point(180,59,[5,4],{period:4,lifecycle:'resolved'}),
    [event('winner',120,['goal','lead_change'],{scores:[5,4]})])],'NHL').find(r=>r.event.id==='winner');
  assert.equal(r.expectedDirection,'decrease_permitted');assert.equal(r.directionConsistent,true);
});

test('no rating change after a tying event is censored without inventing a response time',()=>{
  const r=buildEventResponses([point(0,95),withEvents(point(180,95,[3,3]),[event('tie',120,undefined,{scores:[3,3]})])],'NHL').find(r=>r.event.id==='tie');
  assert.equal(r.change,0);assert.equal(r.directionConsistent,true);
  assert.match(r.status,/right-censored/);assert.equal(r.firstObservedResponse,null);
  assert.equal(r.latency.eventToFirstObservedResponseUpperBoundMs,null);
});

test('missing provider event timestamps are not replaced by acquisition or observation time',()=>{
  const e=event('unknown',null,['turnover'],{sourceAcquiredAt:origin+100000,firstRetainedAt:origin+180000});
  const r=buildEventResponses([point(0,70),withEvents(point(180,80),[e])],'NHL').find(r=>r.event.id==='unknown');
  assert.equal(r.eventTimestamp,null);assert.equal(r.change,null);assert.equal(r.baseline,null);
  assert.equal(r.latency.exactResponseMs,null);assert.equal(r.latency.eventToFirstObservedResponseUpperBoundMs,null);
});

test('model boundaries cannot provide an event baseline from a different scoring model',()=>{
  const r=buildEventResponses([point(0,70),withEvents(point(180,90,[3,3],{modelVersion:'model-b'}),
    [event('tie',120,undefined,{scores:[3,3]})])],'NHL').find(r=>r.event.id==='tie');
  assert.equal(r.baseline,null);assert.equal(r.change,null);assert.equal(r.responseAssessment,'insufficient_evidence');
});

test('stale and explicitly partial scorer evidence cannot establish a reliable response',()=>{
  for(const bad of [point(0,70,[2,3],{publishedAt:origin-181000}),point(0,70,[2,3],{q:{scoringPartial:true}})]){
    const r=buildEventResponses([bad,withEvents(point(180,90,[3,3]),[event('tie',120,undefined,{scores:[3,3]})])],'NHL').find(r=>r.event.id==='tie');
    assert.equal(r.change,null);assert.equal(r.responseAssessment,'insufficient_evidence');
  }
});

test('multiple timestamped events in the same bracket remain explicitly confounded',()=>{
  const responses=buildEventResponses([point(0,70),withEvents(point(180,90,[3,3]),[
    event('penalty',100,['power_play'],{scores:[2,3]}),event('tie',120,undefined,{scores:[3,3]})])],'NHL');
  const r=responses.find(r=>r.event.id==='tie');
  assert.ok(r.simultaneousEvents.some(e=>e.id==='penalty'));
  assert.match(r.sourceReliability,/confounded/);assert.match(r.status,/causality unproven/);
});

test('inferred scoring changes expose an interval rather than a synthetic goal timestamp',()=>{
  const r=buildEventResponses([point(0,70),point(180,90,[3,3])],'NHL')[0];
  assert.equal(r.eventTimestamp,null);assert.deepEqual(r.eventOccurrenceInterval,[origin,origin+180000]);
  assert.equal(r.event.timestampKind,'unknown-within-observed-interval');
  assert.equal(r.latency.exactResponseMs,null);assert.equal(r.latency.eventToFirstObservedResponseUpperBoundMs,null);
});

test('all supported sport event families retain type without inventing occurrence timestamps',()=>{
  const cases=[['NFL','Touchdown',['touchdown']],['CFB','Fourth-down conversion',['fourth_down_conversion']],
    ['NBA','Turnover',['turnover']],['MLB','Walk-off hit',['walk_off']],['Tennis','Match point and tiebreak',['match_point','tiebreak']],
    ['NHL','Pulled the goalie for a power play',['goalie_pulled','power_play']]];
  for(const [sport,text,kinds] of cases){const actual=eventKinds({text,scoringPlay:sport==='NFL'},sport);for(const kind of kinds)assert.ok(actual.includes(kind),`${sport}: ${kind}`);}
});

const hockey=(extra={})=>({id:'123',sport:'NHL',state:'live',score:87,modelVersion:'m',
  teams:[['Away','A','4',null,null,null,null,null,'1'],['Home','H','4',null,null,null,null,null,'2']],
  liveRawStatus:{period:3,displayClock:'0:31'},evidenceQuality:'complete',inputEvidence:{clockMode:'elapsed'},...extra});
const play=(id,clock,scores=[4,4])=>({id,period:{number:3},clock:{displayValue:clock},awayScore:scores[0],homeScore:scores[1],scoringPlay:true,text:'Goal'});

test('NHL cached elapsed clocks do not attach a future goal to an earlier rated state',()=>{
  const summary={header:{id:'123'},plays:[play('past','19:28'),play('future','19:30')]};
  const q=captureEvidenceDetails(hockey(),{summary,summaryUpdatedAt:origin,observedAt:origin+1000,publishedAt:origin});
  assert.ok(q.canonicalEvents.some(e=>e.id==='past'));
  assert.ok(!q.canonicalEvents.some(e=>e.id==='future'));
});

test('invalid producer score progression cannot be upgraded to partial audit evidence',()=>{
  const q=captureEvidenceDetails(hockey({evidenceQuality:'invalid',evidenceReasons:['inconsistent-scoring-ledger']}),{observedAt:origin});
  assert.equal(q.retainedEvidenceStatus,'invalid');
});

test('mismatched and stale cached provider summaries cannot contribute event evidence',()=>{
  for(const options of [
    {summary:{header:{id:'different'},plays:[play('goal','19:28')]},summaryUpdatedAt:origin},
    {summary:{header:{id:'123'},plays:[play('goal','19:28')]},summaryUpdatedAt:origin-181000}
  ]){const q=captureEvidenceDetails(hockey(),{...options,observedAt:origin,publishedAt:origin});assert.equal(q.canonicalEvents.length,0);}
});

test('later cache preserves missing wallclock and distinct acquisition/review timestamps',()=>{
  const {events,coverage}=extractRetainedProviderEvents({plays:[play('no-time','19:28'),{...play('dated','19:29'),wallclock:new Date(origin).toISOString()}]},'NHL',
    {source:'recorded-summary',cachedAt:origin+86400000,reviewedAt:origin+86500000});
  assert.equal(events[0].occurredAt,null);assert.equal(events[0].firstRetainedAt,null);
  assert.equal(events[1].occurredAt,origin);assert.equal(events[1].sourceAcquiredAt,origin+86400000);
  assert.equal(events[1].reviewedAt,origin+86500000);assert.equal(events[1].providerPublishedAt,null);
  assert.equal(coverage.providerTimestamps,1);assert.equal(coverage.availabilityAtRating,'unknown');
});

test('retrospective goal excludes bucket-rounded state that already reflects the goal from baseline',()=>{
  const points=[point(0,70),point(115,90,[3,3]),point(135,90,[3,3])].map(p=>({...p,provenance:'retained-scoring-snapshot'}));
  const original=structuredClone(points),e=event('retrospective-tie',120,undefined,{scores:[3,3],sourceAcquiredAt:origin+86400000});
  const responses=buildEventResponses(points,'NHL',[e]),r=responses.find(r=>r.event.id===e.id);
  assert.equal(r.baseline,70);assert.equal(r.change,20);assert.equal(r.before.observedAt,origin);
  assert.equal(r.latency.eventToFirstObservedResponseUpperBoundMs,null);assert.match(r.sourceReliability,/historical availability unknown/);
  assert.ok(!responses.some(r=>r.event.id.startsWith('observed:')),'same scoring change is not double counted');
  assert.deepEqual(points,original);
});

test('retrospective corrections and shootout namespaces never establish expected scoring direction',()=>{
  for(const extra of [{correction:true},{scoreNamespace:'shootout-attempts'}]){
    const r=buildEventResponses([point(0,70),point(180,90,[3,3])],'NHL',[event('revision',120,undefined,{scores:[3,3],...extra})]).find(r=>r.event.id==='revision');
    assert.equal(r.expectedDirection,'unknown');assert.equal(r.responseAssessment,'insufficient_evidence');
    assert.equal(r.latency.eventToFirstObservedResponseUpperBoundMs,null);
  }
});

test('partial first post-event state does not hide a later reliable response in the same cohort',()=>{
  const responses=buildEventResponses([point(0,78),point(130,87,[3,3],{q:{scoringPartial:true}}),point(160,92,[3,3])],'NHL',
    [event('tie',120,undefined,{scores:[3,3]})]);
  const r=responses.find(r=>r.event.id==='tie');
  assert.equal(r.baseline,78);assert.equal(r.rating,92);assert.equal(r.after.observedAt,origin+160000);
  assert.equal(r.firstObservedAt,null);assert.equal(r.firstAssociatedRating.observedAt,r.after.observedAt);
});

test('goal dedup preserves other simultaneous inferred pressure changes',()=>{
  const after=withEvents(point(180,90,[3,3],{q:{goaliePulled:true}}),[event('tie',120,undefined,{scores:[3,3]})]);
  const responses=buildEventResponses([point(0,70),after],'NHL'),r=responses.find(r=>r.event.id==='tie');
  assert.ok(responses.some(r=>r.event.kinds.includes('goalie_pulled')));
  assert.ok(r.simultaneousEvents.some(e=>e.kinds.includes('goalie_pulled')));
  assert.match(r.sourceReliability,/confounded/);
});

test('later first rating response includes intervening known events as confounders',()=>{
  const responses=buildEventResponses([point(0,95),withEvents(point(180,95,[3,3]),[event('tie',120,undefined,{scores:[3,3]})]),
    withEvents(point(300,70,[3,4]),[event('next',250,['goal'],{scores:[3,4]})])],'NHL');
  const r=responses.find(r=>r.event.id==='tie');
  assert.equal(r.firstObservedResponse.observedAt,origin+300000);assert.ok(r.simultaneousEvents.some(e=>e.id==='next'));
  assert.match(r.sourceReliability,/confounded/);
});

test('historically retained single event takes precedence over a later revision of the same ID',()=>{
  const p=point(180,90,[3,3],{event:event('same',125,undefined,{scores:[3,3],source:'canonical-last-play'})});
  const responses=buildEventResponses([point(0,70),p],'NHL',[event('same',120,undefined,{scores:[3,3]})]);
  assert.equal(responses.filter(r=>r.event.id==='same').length,1);
  const r=responses.find(r=>r.event.id==='same');assert.equal(r.eventTimestamp,origin+125000);assert.equal(r.event.source,'canonical-last-play');
});

test('a second overtime is not a shootout; explicit shootout phase applies to its attempts',()=>{
  const goal={...play('goal','1:00'),period:{number:5,displayValue:'2nd OT'}};
  assert.equal(extractRetainedProviderEvents({plays:[goal]},'NHL').events[0].scoreNamespace,'regulation-or-overtime');
  const start={id:'start',text:'Start of Shootout',period:{number:5}};
  assert.equal(extractRetainedProviderEvents({plays:[start,goal]},'NHL').events.find(e=>e.id==='goal').scoreNamespace,'shootout-attempts');
});
