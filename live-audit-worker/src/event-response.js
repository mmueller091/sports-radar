// Observed event/rating associations only: no synthetic event or publication times.
import {eventKinds} from './evidence.js';
const number=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);
const stamp=v=>typeof v==='number'?number(v):typeof v==='string'&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
const reg={NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3,MLB:9};
const margin=p=>p?.scores?.length===2&&p.scores.every(Number.isFinite)?Math.abs(p.scores[0]-p.scores[1]):null;
const leader=p=>Math.sign(p.scores[0]-p.scores[1]);
const reference=p=>p?{gameKey:p.gameKey,observedAt:p.observedAt,modelVersion:p.modelVersion,rating:p.rating,sourceReference:p.sourceReference}:null;
const usable=p=>p&&p.modelVersion&&p.modelVersion!=='unknown'&&Number.isFinite(p.observedAt)&&Number.isFinite(p.rating)&&!p.historical&&!p.integrity?.length&&!p.q?.rejected&&!p.q?.scoringPartial&&
  !['invalid','unavailable'].includes(p.evidenceStatus)&&p.q?.evidenceQuality!=='invalid'&&
  (p.provenance==='retained-scoring-snapshot'||Number.isFinite(p.publishedAt)&&p.observedAt>=p.publishedAt&&p.observedAt-p.publishedAt<=180000);
function inferredKinds(a,b,sport){
  const kinds=[];if(!a||!b||a.modelVersion!==b.modelVersion||a.segment!==b.segment)return kinds;
  const valid=a.scores?.length===2&&b.scores?.length===2&&a.scores.every(Number.isFinite)&&b.scores.every(Number.isFinite);
  if(valid){
    const deltas=b.scores.map((v,i)=>v-a.scores[i]);
    if(deltas.some(v=>v<0))return ['score_correction'];
    if(deltas.some(v=>v>0)){
      kinds.push(sport==='NHL'?'goal_observed': ['NFL','CFB'].includes(sport)&&deltas.some(v=>v===6||v===7||v===8)?'touchdown_sized_score_change':'scoring_change');
      if(leader(a)&&leader(b)&&leader(a)!==leader(b))kinds.push('lead_change');
      if(margin(a)>0&&margin(b)===0)kinds.push('game_tying');
      if(['NBA','NCAAB'].includes(sport)&&deltas.some((v,i)=>v>=8&&deltas[1-i]===0))kinds.push('major_scoring_run');
      if(margin(a)>margin(b))kinds.push('comeback_development');
    }
  }
  if(b.period>reg[sport]&&a.period<=reg[sport])kinds.push('overtime');
  if(b.q?.manpower?.advantage!==a.q?.manpower?.advantage&&b.q?.manpower?.advantage)kinds.push('manpower_advantage');
  if(b.q?.goaliePulled===true&&a.q?.goaliePulled!==true)kinds.push('goalie_pulled');
  for(const [field,kind] of [['breakPoint','break_point'],['setPoint','set_point'],['matchPoint','match_point'],['breakOfServe','break_of_serve'],['tiebreak','tiebreak']])
    if(b.q?.[field]===true&&a.q?.[field]!==true)kinds.push(kind);
  for(const signal of b.assessment?.signals||[])if(!(a.assessment?.signals||[]).includes(signal)&&/Decisive|Meaningful|tying\/winning run|underdog threat/i.test(signal))kinds.push('pressure_opportunity');
  return [...new Set(kinds)];
}
function direction(before,after,kinds,sport){
  if(!before||!after)return {expected:'unknown',basis:'No reliable bracket'};
  if(['completed','resolved','decided'].includes(after.lifecycle)||after.live===false)
    return {expected:'decrease_permitted',basis:'Outcome resolved; current watchability can decline after the decisive event'};
  if(kinds.includes('score_correction'))return {expected:'unknown',basis:'Provider correction invalidates a causal scoring comparison'};
  if(kinds.includes('game_tying')||kinds.includes('overtime')||kinds.includes('comeback_development'))
    return {expected:'increase_or_sustain',basis:'Competitive opportunity increased; a high prior rating may already reflect the drama'};
  if(margin(before)!==null&&margin(after)!==null&&margin(after)>margin(before)&&after.period>=reg[sport])
    return {expected:'decrease_permitted',basis:'Lead widened late; scoring need not raise neutral watchability'};
  return {expected:'context_dependent',basis:'Scoring, turnovers and pressure can help either side; a universal positive response is unjustified'};
}
const scoringEvent=e=>e.scoringPlay===true||e.kinds?.some(k=>['goal','touchdown','scoring','game_tying','lead_change','walk_off'].includes(k));
const reflectsEvent=(p,e)=>e.scores?.length===2&&p?.scores?.length===2&&p.scores.every((v,i)=>Number.isFinite(v)&&Number.isFinite(e.scores[i])&&v>=e.scores[i]);
export function buildEventResponses(input=[],sport,retainedProviderEvents=[]){
  const points=[...input].filter(p=>Number.isFinite(p.observedAt)).sort((a,b)=>a.observedAt-b.observedAt);
  const events=[],seen=new Set();
  // A later provider revision is a separate retrospective source, never backfilled into a rated state.
  for(const e of retainedProviderEvents){
    const at=stamp(e.occurredAt);if(!e.id||at===null)continue;
    const aligned=p=>p.observedAt>=at&&p.observedAt-at<=360000&&
      (e.period==null||p.period==null||p.period>=e.period)&&(e.scores?.length!==2||reflectsEvent(p,e));
    const firstAligned=points.find(aligned);
    const attached=points.find(p=>aligned(p)&&usable(p)&&p.modelVersion===firstAligned?.modelVersion&&p.segment===firstAligned?.segment)||firstAligned;
    if(!attached)continue;
    const key=`${attached.modelVersion}|${attached.segment??''}|${e.id}`;
    // Prefer evidence actually retained by a historical scan when the same event is present there.
    if(points.some(p=>p.modelVersion===attached.modelVersion&&p.segment===attached.segment&&
      (p.q?.canonicalEvents?.some(c=>c.id===e.id)||p.event?.id===e.id)))continue;
    if(seen.has(key))continue;seen.add(key);
    events.push({event:{...e,retrospective:true,availabilityAtRating:'unknown',kinds:e.kinds?.length?e.kinds:eventKinds(e,sport)},
      model:attached.modelVersion,segment:attached.segment,attached,at,interval:null,inferred:false,retrospective:true});
  }
  for(let i=0;i<points.length;i++){
    const p=points[i],previous=points[i-1];
    const supplied=[...(p.q?.canonicalEvents||[]),...(p.event?[p.event]:[])];
    for(const e of supplied){
      const key=`${p.modelVersion}|${p.segment??''}|${e.id}`;if(!e.id||seen.has(key))continue;seen.add(key);
      events.push({event:{...e,kinds:e.kinds?.length?e.kinds:eventKinds(e,sport)},model:p.modelVersion,segment:p.segment,attached:p,
        at:stamp(e.occurredAt),interval:null,inferred:false});
    }
    let kinds=inferredKinds(previous,p,sport);
    if(kinds.length&&previous?.live!==false){
      const already=[...supplied,...events.filter(e=>e.model===p.modelVersion&&e.segment===p.segment&&!e.inferred).map(e=>e.event)]
        .some(e=>{const t=stamp(e.occurredAt);return t!==null&&t>previous.observedAt-15000&&t<=p.observedAt+15000&&
          (kinds.some(k=>/goal_observed|scoring_change|touchdown_sized/.test(k))?scoringEvent(e)&&reflectsEvent(p,e)&&!reflectsEvent(previous,e):false);});
      if(already)kinds=kinds.filter(k=>!['goal_observed','scoring_change','touchdown_sized_score_change','lead_change','game_tying','major_scoring_run','comeback_development'].includes(k));
      if(kinds.length)events.push({event:{id:`observed:${p.gameKey}:${previous.observedAt}:${p.observedAt}`,kinds,
        occurredAt:null,timestampKind:'unknown-within-observed-interval',text:'Change between retained rated states; may contain multiple events'},
        model:p.modelVersion,segment:p.segment,attached:p,at:null,interval:[previous.observedAt,p.observedAt],inferred:true});
    }
  }
  return events.map(entry=>{
    const {event,at,interval,model}=entry;
    const cohort=points.filter(p=>p.modelVersion===model&&p.segment===entry.segment);
    const before=[...cohort].reverse().find(p=>usable(p)&&p.live!==false&&(at!==null?p.observedAt<at:interval?p.observedAt===interval[0]:false)&&
      !(at!==null&&scoringEvent(event)&&reflectsEvent(p,event)));
    // State brackets are observable; provider event publication and exact scorer processing are not.
    const after=entry.inferred?entry.attached:cohort.find(p=>usable(p)&&at!==null&&p.observedAt>=at&&p.observedAt-at<=360000&&
      (event.scores?.length!==2||p.scores?.length===2&&p.scores.every((v,i)=>v>=event.scores[i])));
    const bracketGood=usable(before)&&usable(after)&&after.observedAt-before.observedAt<=360000&&after.observedAt>=before.observedAt;
    const delta=bracketGood?after.rating-before.rating:null;
    const contextKinds=before&&after?[...new Set([...event.kinds,...inferredKinds(before,after,sport)])]:event.kinds;
    const expectation=event.correction||event.scoreNamespace==='shootout-attempts'?{expected:'unknown',basis:'Correction or shootout score namespace requires separate replay; not a causal scoring-response test'}:direction(before,after,contextKinds,sport);
    const response=bracketGood?cohort.find(p=>usable(p)&&p.observedAt>=after.observedAt&&p.observedAt-before.observedAt<=360000&&p.rating!==before.rating):null;
    const simultaneous=events.filter(e=>e!==entry&&e.model===model&&e.segment===entry.segment&&before&&after&&(e.at??e.interval?.[1]??e.attached.observedAt)>before.observedAt&&(e.at??e.interval?.[1]??e.attached.observedAt)<=(response?.observedAt??after.observedAt)).map(e=>({id:e.event.id,kinds:e.event.kinds}));
    const compatible=delta===null?null:expectation.expected==='increase_or_sustain'?delta>=-2:expectation.expected==='decrease_permitted'?delta<=2:null;
    const uncertain=entry.inferred||entry.retrospective||simultaneous.length>0||event.correction||event.stateAlignment==='partial';
    return {gameKey:entry.attached.gameKey,modelVersion:model,event,baseline:bracketGood?before.rating:null,
      before:reference(before),after:reference(after),rating:bracketGood?after.rating:null,change:delta,
      observedInterval:before&&after?[before.observedAt,after.observedAt]:interval,
      eventOccurrenceInterval:interval,eventTimestamp:at,firstObservedAt:entry.retrospective?null:entry.attached.observedAt,
      firstAssociatedRating:reference(after),
      firstObservedResponse:reference(response),expectedDirection:expectation.expected,expectedDirectionBasis:expectation.basis,
      directionConsistent:compatible,
      magnitudeAssessment:delta===null?'unavailable':Math.abs(delta)>=24?'large change warrants component replay; excess is unproven':
        compatible===false?'direction warrants investigation; magnitude adequacy unproven':'observed response compatible or context dependent; calibration unvalidated',
      responseAssessment:delta===null||compatible===null?'insufficient_evidence':compatible===false?'calibration_hypothesis':'expected_behavior',
      simultaneousEvents:simultaneous,sourceReliability:entry.retrospective?'limited: later cached revision; historical availability unknown':bracketGood&&!uncertain?'moderate: observed association':'limited: sampled or confounded',
      latency:{exactResponseMs:null,eventToFirstObservedResponseUpperBoundMs:!entry.retrospective&&at!==null&&response&&before?.provenance!=='retained-scoring-snapshot'&&response.provenance!=='retained-scoring-snapshot'?Math.max(0,response.observedAt-at):null,
        observedChangeIntervalMs:bracketGood?after.observedAt-before.observedAt:null,lowerBoundMs:response?0:null,
        providerLatencyMs:null,providerPublicationLatencyMs:null,pollingDelayMs:null,scoringProcessingMs:null,
        explanation:'Bounds describe observation uncertainty. Event wallclock, refresh start, cache acquisition and audit scan are distinct; snapshot timestamps are rounded refresh-start buckets, not strict latency bounds. No provider publication time is retained.'},
      eventToObservedRiseMs:null,responsePublishedAt:null,
      status:!bracketGood?'unavailable: no reliable pre-event and post-event bracket':!response?'right-censored: no observed rating change':'observed association; causality unproven',
      resolution:entry.retrospective?'Retrospective event wallclock from later cache; availability during scoring and exact latency unknown':entry.inferred?'Event inferred within a sampled interval; no event timestamp invented':'Provider event wallclock retained; exact response and publication latency unknown',
      missingEvidence:[...(!bracketGood?['Reliable same-model fresh bracket within six minutes unavailable']:[]),
        ...(entry.inferred?['Exact event time and individual simultaneous plays unavailable']:[]),...(entry.retrospective?['Historical provider revision and event availability at rating time unknown']:[]),'Provider publication and actual canonical commit timestamps unavailable',
        'Expected response magnitude requires matched historical replay'],
      supportingObservations:[reference(before),reference(after)].filter(Boolean)};
  });
}
