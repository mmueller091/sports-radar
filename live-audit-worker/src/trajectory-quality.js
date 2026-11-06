// Pure audit measurements. These functions never score or change a game.
import {auditNumber} from './rating-evidence.js';
const THRESHOLDS=[70,80,85,90,95];
const regulation={NFL:4,CFB:4,NBA:4,NCAAB:2,NHL:3};
const periodSeconds={NFL:900,CFB:900,NBA:720,NCAAB:1200,NHL:1200};
const quantile=(values,q)=>{const a=values.filter(Number.isFinite).sort((x,y)=>x-y);return a.length?a[Math.floor((a.length-1)*q)]:null;};
export const eligibleRating=p=>p.evidenceStatus!=='invalid'&&!p.integrity?.length&&Number.isInteger(p.rating)&&p.rating>=1&&p.rating<=99;
export const observationReference=p=>({gameKey:p.gameKey,modelVersion:p.modelVersion,observedAt:p.observedAt,
  referenceId:`${p.gameKey}|${p.modelVersion}|${p.observedAt}`,source:{table:p.provenance==='retained-scoring-snapshot'?'sports_snapshots':'live_audit_observations'},
  timestampKind:p.provenance==='retained-scoring-snapshot'?'scoring-snapshot-refresh-start-bucket':'audit-observation'});
export function lifecycleOf(g,sport,period,scores){
  const raw=g.liveRawStatus||{},label=[raw.type?.name,raw.type?.description,raw.type?.detail,raw.type?.shortDetail,g.status,g.live?.phase].filter(Boolean).join(' ');
  if(g.state==='completed'||raw.type?.completed===true||raw.type?.state==='post'||/\bfinal\b|STATUS_FINAL|STATUS_FULL_TIME/i.test(label))return 'completed';
  if(g.state==='upcoming'||raw.type?.state==='pre')return 'pregame';
  // A hockey overtime goal is decisive even during the feed's live-to-final transition.
  // Shootout attempts are not regulation goals; do not infer a winner from their totals.
  const periodType=String(raw.periodDescriptor?.periodType||g.periodDescriptor?.periodType||'').toUpperCase();
  const shootout=periodType==='SO'||/shootout|\bSO\b/i.test(label);
  const overtime=period===4||period>4&&(periodType==='OT'||/\b\d+\s*OT\b|\bovertime\b/i.test(label));
  if(sport==='NHL'&&overtime&&!shootout&&scores.length===2&&scores.every(Number.isFinite)&&scores[0]!==scores[1])return 'decided';
  return g.state==='live'||raw.type?.state==='in'?'live':'unknown';
}
export function remainingTime(p){
  const count=regulation[p.sport],seconds=periodSeconds[p.sport];
  if(!count||!Number.isFinite(p.period)||!Number.isFinite(p.clockSeconds))return {seconds:null,kind:'unavailable; no verified game clock'};
  if(p.period>count)return {seconds:p.clockSeconds,kind:'current overtime period only; game may end earlier or continue'};
  if(p.period<1||p.clockSeconds<0||p.clockSeconds>seconds)return {seconds:null,kind:'invalid period clock'};
  return {seconds:(count-p.period)*seconds+p.clockSeconds,kind:'regulation game clock; stoppages and possible overtime excluded'};
}
function fresh(p){return p.live&&!p.historical&&p.evidenceStatus!=='invalid'&&!p.integrity.length&&!p.q.rejected&&!p.q.scoringPartial&&Number.isFinite(p.rating)&&
  Number.isFinite(p.publishedAt)&&Number.isFinite(p.observedAt)&&p.observedAt>=p.publishedAt&&p.observedAt-p.publishedAt<=180000;}
export function measurableInterval(a,b){
  if(!a||!b||a.modelVersion!==b.modelVersion||a.segment!==b.segment||b.sourceReference?.trajectoryGapBefore||!fresh(a)||!fresh(b))return null;
  const dt=(b.publishedAt-a.publishedAt)/1000;
  return dt>0&&dt<=360?dt:null;
}
function useful(p){
  if(p.assessment?.settled||p.lifecycle==='decided')return 'effectively_decided';
  const remaining=remainingTime(p);
  if(remaining.seconds===null)return 'unknown_runway';
  if(p.period>regulation[p.sport])return 'overtime_opportunity; sudden ending possible';
  return remaining.seconds<30?'very_short_observed_runway':remaining.seconds<120?'short_observed_runway':'at_least_two_game_minutes_observed';
}
export function thresholdAnalysis(points){
  return THRESHOLDS.map(threshold=>{
    let first=null,prior=null,episode=null,coveredSeconds=0,estimatedSecondsAbove=0,unknownIntervalSeconds=0;
    const episodes=[];
    for(const p of points){
      if(prior&&prior.segment!==p.segment){
        if(episode){episode.uncertainContinuity=true;
          if(prior.modelVersion!==p.modelVersion)episode.censoredByModelBoundary=true;
          else if(p.sourceReference?.trajectoryGapBefore)episode.censoredByEvidenceGap=true;
          else episode.censoredByModelBoundary=true;
          episode=null;}
        prior=null;
      }
      if(!eligibleRating(p)){
        if(episode){episode.uncertainContinuity=true;episode.censoredByInvalidEvidence=true;episode=null;}
        prior=null;continue;
      }
      const dt=measurableInterval(prior,p);
      const above=Number.isFinite(p.rating)&&p.rating>=threshold;
      if(above){
        if(!first)first={p,prior};
        if(!episode){episode={firstObservedAt:p.observedAt,lastObservedAt:p.observedAt,firstReference:observationReference(p),
          lastReference:observationReference(p),entryInterval:prior?{from:prior.observedAt,to:p.observedAt}:null,
          leftCensored:!prior,exitInterval:null,rightCensored:true,uncertainContinuity:false};episodes.push(episode);}
        else if(dt===null)episode.uncertainContinuity=true;
        episode.lastObservedAt=p.observedAt;episode.lastReference=observationReference(p);
      }else if(episode){episode.exitInterval={from:prior?.observedAt??null,to:p.observedAt};episode.rightCensored=false;episode=null;}
      prior=p;
    }
    // Denser snapshots locate observed crossings, but their timestamps are
    // refresh-start buckets. Keep duration estimates on the audit cadence.
    const auditPoints=points.filter(p=>p.provenance!=='retained-scoring-snapshot');
    for(let i=1;i<auditPoints.length;i++){
      const a=auditPoints[i-1],b=auditPoints[i],dt=measurableInterval(a,b);
      if(dt!==null){coveredSeconds+=dt;if(a.rating>=threshold)estimatedSecondsAbove+=dt;}
      else if(b.observedAt>a.observedAt)unknownIntervalSeconds+=(b.observedAt-a.observedAt)/1000;
    }
    if(!auditPoints.length&&points.length>1)unknownIntervalSeconds=Math.max(0,(points.at(-1).observedAt-points[0].observedAt)/1000);
    const auditFirst=auditPoints.find(p=>eligibleRating(p)&&p.rating>=threshold);
    const remaining=first?remainingTime(first.p):{seconds:null,kind:'threshold not observed'};
    const after=first?points.slice(points.indexOf(first.p)):[];
    return {threshold,firstObservedAt:first?.p.observedAt??null,firstObservedRating:first?.p.rating??null,
      firstObservedClockSeconds:first?.p.clockSeconds??null,firstObservedPeriod:first?.p.period??null,
      gameTimeRemainingSeconds:remaining.seconds,remainingTimeKind:remaining.kind,
      firstReference:first?observationReference(first.p):null,
      auditOnlyFirstObservedAt:auditFirst?.observedAt??null,auditOnlyFirstObservedClockSeconds:auditFirst?.clockSeconds??null,
      auditOnlyFirstReference:auditFirst?observationReference(auditFirst):null,
      crossingInterval:first?.prior?{from:first.prior.observedAt,to:first.p.observedAt}:null,
      crossingTiming:first?(first.prior?'First retained crossing bracket; snapshot timestamps are refresh-start buckets, audit timestamps are observations; exact real-world crossing unknown':'Already above at first retained observation in this model cohort; left-censored'):'Not reached in retained observations',
      exactCrossingAt:null,estimatedSecondsAbove:coveredSeconds?estimatedSecondsAbove:null,coveredSeconds,unknownIntervalSeconds,
      durationMethod:'Inclusive threshold, left-held estimate between fresh canonical refresh references; no exact wall-clock duration or provider-publication time',
      durationObservationSource:'Audit cadence only; denser snapshot refresh-start buckets improve crossing location but do not establish elapsed publication duration',
      episodeCount:episodes.length,episodes,episodeCountKind:'Observed below/above episodes; unobserved intervening episodes are possible',
      remainedSatisfied:first?(after.some(p=>!eligibleRating(p))?null:after.every(p=>p.rating>=threshold)):null,
      remainedSatisfiedScope:'Retained live observations only; unobserved dips and the exact exit time remain unknown',
      settledAtCrossing:first?Boolean(first.p.assessment?.settled||first.p.lifecycle==='decided'):null,
      firstCrossingUsefulness:first?useful(first.p):'not_observed',
      usefulnessPolicy:'Descriptive runway bands (<30, <120, >=120 game seconds), not validated human tune-in time or notification policy'};
  });
}
function componentChanges(a,b){
  const map=fs=>{const m=new Map();for(const f of fs||[]){const points=auditNumber(f.points);if(points===null)continue;const key=String(f.label||'unlabeled');m.set(key,(m.get(key)||0)+points);}return m;};
  const before=map(a.components),after=map(b.components);
  return [...new Set([...before.keys(),...after.keys()])].map(label=>({label,before:before.has(label)?before.get(label):null,
    after:after.has(label)?after.get(label):null,change:(after.get(label)||0)-(before.get(label)||0)})).filter(x=>x.change!==0);
}
const finite=auditNumber;
function arithmeticLedger(point){
  const captured=point.q.components?.calculation;
  if(captured){
    const rows=captured.rows||[],sum=rows.reduce((total,row)=>total+(finite(row.points)??NaN),0);
    if(captured.modelVersion===point.modelVersion&&captured.total===point.rating&&rows.length&&Number.isFinite(sum)&&Math.abs(sum-point.rating)<1e-7)
      return {status:'complete',source:'canonical-feed-calculation',total:point.rating,sum,rows};
    return {status:'invalid',source:'canonical-feed-calculation',total:point.rating,sum:Number.isFinite(sum)?sum:null,rows:[],reason:'Retained additive ledger does not reconcile to the same model and rating'};
  }
  const scalars=point.scalarComponents||{},telemetry=point.q.components||{};
  const fields=[['Base score','baseScore'],['Live bonus','liveBonus'],['Momentum','momentumPoints'],['Trajectory adjustment','trajectoryAdjustment']];
  const rows=fields.map(([label,key])=>({label,points:finite(telemetry[key])??finite(scalars[key])}));
  if(rows.some(row=>row.points===null))return {status:'unavailable',source:'retained-component-telemetry',total:point.rating,sum:null,rows:[],reason:'Not all additive scalar components were retained'};
  const raw=rows.reduce((sum,row)=>sum+row.points,0),rounded=Math.round(raw),bounded=Math.min(99,Math.max(1,rounded));
  // A residual is not arbitrarily assigned to rounding. The known arithmetic
  // must reproduce this exact observed rating before it is called complete.
  if(bounded!==point.rating)return {status:'unavailable',source:'retained-component-telemetry',total:point.rating,sum:raw,rows:[],reason:'Retained scalar components do not establish the complete additive policy'};
  rows.push({label:'Rating rounding',points:rounded-raw});
  if(bounded!==rounded)rows.push({label:'Scale bounds',points:bounded-rounded});
  return {status:'complete',source:'validated-scalar-addition-and-rounding',total:point.rating,sum:bounded,rows};
}
function expectedHockeyBoundary(a,b,delta){
  if(a.sport!=='NHL'||b.sport!=='NHL'||a.period!==3||b.period!==3||
    !a.scores.every(Number.isFinite)||!b.scores.every(Number.isFinite)||a.clockSeconds===null||b.clockSeconds===null||
    b.clockSeconds>a.clockSeconds||b.observedAt-a.observedAt>360000)return null;
  const scores=b.scores.map((score,i)=>score-a.scores[i]);
  if(scores.some(score=>score<0)||scores.reduce((sum,score)=>sum+score,0)!==1)return null;
  const before=Math.abs(a.scores[0]-a.scores[1]),after=Math.abs(b.scores[0]-b.scores[1]);
  if(delta<0&&before===1&&after===2&&a.clockSeconds<=120&&b.clockSeconds<=30)
    return {kind:'late lead-widening goal',direction:'decrease_permitted',basis:'Verified score and remaining clock show a one-goal contest becoming a two-goal game in the final thirty seconds or at regulation end'};
  if(delta>0&&before===2&&after===1&&a.clockSeconds<=120&&b.clockSeconds>0&&b.clockSeconds<=60)
    return {kind:'late one-goal rally',direction:'increase_permitted',basis:'Verified score and remaining clock restore a one-goal opportunity in the final minute; no manpower observation is inferred'};
  return null;
}
export function volatilityAnalysis(points){
  const changes=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a.segment!==b.segment||a.modelVersion!==b.modelVersion||!Number.isFinite(a.rating)||!Number.isFinite(b.rating))continue;
    const delta=b.rating-a.rating,factors=componentChanges(a,b),factorSum=factors.reduce((s,c)=>s+c.change,0);
    const beforeLedger=arithmeticLedger(a),afterLedger=arithmeticLedger(b);
    const complete=beforeLedger.status==='complete'&&afterLedger.status==='complete';
    // Different retained ledger groupings still reconcile exactly, but their
    // individual row changes are allocation differences rather than attribution.
    const sameBasis=beforeLedger.source===afterLedger.source;
    const components=complete?componentChanges({components:beforeLedger.rows},{components:afterLedger.rows}):factors;
    const sum=components.reduce((s,c)=>s+c.change,0);
    const ledgerDelta=complete?afterLedger.sum-beforeLedger.sum:null;
    const residual=ledgerDelta===null?null:Math.abs(delta-ledgerDelta)<1e-7?0:delta-ledgerDelta;
    const ledgerInvalid=beforeLedger.status==='invalid'||afterLedger.status==='invalid';
    const eligibleForCalibration=eligibleRating(a)&&eligibleRating(b)&&!ledgerInvalid;
    const scoreCorrection=a.scores.length===2&&b.scores.length===2&&b.scores.some((s,j)=>s<a.scores[j]);
    const clockCorrection=a.period===b.period&&Number.isFinite(a.clockSeconds)&&Number.isFinite(b.clockSeconds)&&b.clockSeconds>a.clockSeconds;
    const eventTriage=!scoreCorrection&&!clockCorrection?expectedHockeyBoundary(a,b,delta):null;
    const expected=eligibleForCalibration&&complete&&residual===0&&eventTriage;
    const ledgerSummary=ledger=>({status:ledger.status,source:ledger.source,total:ledger.total,sum:ledger.sum,reason:ledger.reason??null});
    changes.push({from:observationReference(a),to:observationReference(b),beforeRating:a.rating,afterRating:b.rating,delta,
      before:{scores:a.scores,period:a.period,clockSeconds:a.clockSeconds},after:{scores:b.scores,period:b.period,clockSeconds:b.clockSeconds},
      componentChanges:components,componentBasis:complete?(sameBasis?beforeLedger.source:'validated-ledgers-with-different-row-grouping'):'explanatory-factors-only',
      explanatoryFactorChanges:factors,reportedFactorDelta:factors.length?factorSum:null,
      scoringTelemetry:{before:a.q.components??null,after:b.q.components??null},reportedComponentDelta:complete?ledgerDelta:components.length?sum:null,
      unexplainedByReportedComponents:residual,scoreCorrection,clockCorrection,eligibleForCalibration,
      arithmeticReconciliation:{status:complete&&residual===0?'reconciled':beforeLedger.status==='invalid'||afterLedger.status==='invalid'?'invalid_ledger':'unavailable',
        before:ledgerSummary(beforeLedger),after:ledgerSummary(afterLedger),observedDelta:delta,ledgerDelta,residual},
      eventTriage,calibrationConcern:eligibleForCalibration&&!scoreCorrection&&!clockCorrection&&!expected&&Math.abs(delta)>=24,
      evidenceQualification:a.q.scoringPartial||b.q.scoringPartial?'Partial situation evidence; score/clock response can be described but manpower and exact event attribution remain unverified':null,
      modelPolicyAttribution:complete&&residual===0?'Complete retained arithmetic explains the change; whether the policy is desirable is a separate calibration question':
        'Explanatory factors are incomplete arithmetic; an omitted live bonus, floor or rounding term is not an unexplained scoring defect',
      classification:!eligibleForCalibration||scoreCorrection||clockCorrection?'data_quality_limitation':expected?'expected_behavior':Math.abs(delta)>=24?'calibration_hypothesis':'expected_behavior'});
  }
  const absolute=changes.filter(c=>c.eligibleForCalibration).map(c=>Math.abs(c.delta));
  return {observedChanges:changes.length,meanAbsoluteChange:absolute.length?absolute.reduce((a,b)=>a+b,0)/absolute.length:null,
    invalidSourceChangesExcluded:changes.filter(c=>!c.eligibleForCalibration).length,
    maxAbsoluteChange:absolute.length?Math.max(...absolute):null,p90AbsoluteChange:quantile(absolute,.9),
    majorChanges:changes.filter(c=>Math.abs(c.delta)>=24||c.scoreCorrection||c.clockCorrection),
    limitations:'Observed changes are not instantaneous. Sparse samples may combine events; magnitude alone does not establish a defect'};
}
export function comebackAnalysis(points){
  const records=[],byRecovery=new Map(),largest=[null,null];let previous=null;
  for(const p of points){
    if(!eligibleRating(p)){largest[0]=null;largest[1]=null;previous=null;continue;}
    if(p.scores.length!==2||!p.scores.every(Number.isFinite))continue;
    if(previous&&(previous.segment!==p.segment||p.scores.some((score,i)=>score<previous.scores[i])||p.period<previous.period)){
      largest[0]=null;largest[1]=null;
    }
    for(const side of [0,1]){
      const deficit=p.scores[1-side]-p.scores[side];
      if(!largest[side]||p.segment!==largest[side].p.segment||deficit>=largest[side].deficit)largest[side]={p,deficit};
      const start=largest[side];
      if(start.deficit<=0||deficit>=start.deficit)continue;
      const recovered=start.deficit-Math.max(0,deficit),marginSwing=start.deficit-deficit;
      if(recovered<({NHL:2,NBA:12,NCAAB:10,NFL:14,CFB:14,MLB:3,Tennis:1,Soccer:2}[p.sport]??Infinity))continue;
      const r0=remainingTime(start.p),r1=remainingTime(p),elapsed=start.p.period===p.period&&start.p.clockSeconds>=p.clockSeconds?start.p.clockSeconds-p.clockSeconds:
        p.period<=regulation[p.sport]&&r0.seconds!==null&&r1.seconds!==null&&r0.seconds>=r1.seconds?r0.seconds-r1.seconds:null;
      const key=`${p.segment}|${side}|${start.p.observedAt}|${start.deficit}|${deficit}`;
      const existing=byRecovery.get(key);
      if(existing){
        existing.supportingObservationCount++;existing.lastReference=observationReference(p);
        existing.lastObservedRating=p.rating;existing.lastObservedPeriod=p.period;existing.lastObservedClockSeconds=p.clockSeconds;
        if(Number.isFinite(p.rating)){existing.ratingRange.min=Math.min(existing.ratingRange.min??p.rating,p.rating);existing.ratingRange.max=Math.max(existing.ratingRange.max??p.rating,p.rating);}
        continue;
      }
      const record={teamIndex:side,maximumObservedDeficit:start.deficit,deficitAtObservation:deficit,deficitRecovered:recovered,marginSwing,
        tiedOrLed:deficit<=0,gameSecondsElapsed:elapsed,from:observationReference(start.p),to:observationReference(p),
        beforeRating:start.p.rating,rating:p.rating,period:p.period,clockSeconds:p.clockSeconds,
        supportingObservationCount:1,lastReference:observationReference(p),lastObservedRating:p.rating,lastObservedPeriod:p.period,lastObservedClockSeconds:p.clockSeconds,
        ratingRange:{min:p.rating,max:p.rating},
        observationGrouping:'Repeated observations of the same recovered deficit are summarized by first/last reference, count and rating range; every rating remains in ratingTrajectory',
        historicalRarity:{status:'unavailable',sampleGames:0,percentile:null,reason:'Historical rarity requires comparable same-model retained games; magnitude is reported without a superlative'}};
      records.push(record);byRecovery.set(key,record);
    }
    previous=p;
  }
  return records;
}
export function observationSummary(p){return {...observationReference(p),rating:p.rating,scores:p.scores,period:p.period,
  clockSeconds:p.clockSeconds,lifecycle:p.lifecycle,evidenceStatus:p.evidenceStatus,
  ...(p.ratingInterpretation?.legacyNullCoercion?{rawRating:p.rawRating,ratingInterpretation:p.ratingInterpretation}:{}),
  missingFieldCount:p.fieldCoverage?.missing.length??null,signals:p.assessment?.signals||[]};}
