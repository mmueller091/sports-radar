// Pure audit measurements. These functions never score or change a game.
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
  if(!a||!b||a.modelVersion!==b.modelVersion||a.segment!==b.segment||!fresh(a)||!fresh(b))return null;
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
        if(episode){episode.uncertainContinuity=true;episode.censoredByModelBoundary=true;episode=null;}
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
  const map=fs=>{const m=new Map();for(const f of fs||[]){if(!Number.isFinite(Number(f.points)))continue;const key=String(f.label||'unlabeled');m.set(key,(m.get(key)||0)+Number(f.points));}return m;};
  const before=map(a.components),after=map(b.components);
  return [...new Set([...before.keys(),...after.keys()])].map(label=>({label,before:before.has(label)?before.get(label):null,
    after:after.has(label)?after.get(label):null,change:(after.get(label)||0)-(before.get(label)||0)})).filter(x=>x.change!==0);
}
export function volatilityAnalysis(points){
  const changes=[];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(a.segment!==b.segment||a.modelVersion!==b.modelVersion||!Number.isFinite(a.rating)||!Number.isFinite(b.rating))continue;
    const delta=b.rating-a.rating,components=componentChanges(a,b),sum=components.reduce((s,c)=>s+c.change,0);
    const eligibleForCalibration=eligibleRating(a)&&eligibleRating(b);
    const scoreCorrection=a.scores.length===2&&b.scores.length===2&&b.scores.some((s,j)=>s<a.scores[j]);
    const clockCorrection=a.period===b.period&&Number.isFinite(a.clockSeconds)&&Number.isFinite(b.clockSeconds)&&b.clockSeconds>a.clockSeconds;
    changes.push({from:observationReference(a),to:observationReference(b),beforeRating:a.rating,afterRating:b.rating,delta,
      before:{scores:a.scores,period:a.period,clockSeconds:a.clockSeconds},after:{scores:b.scores,period:b.period,clockSeconds:b.clockSeconds},
      componentChanges:components,scoringTelemetry:{before:a.q.components??null,after:b.q.components??null},reportedComponentDelta:components.length?sum:null,
      unexplainedByReportedComponents:components.length?delta-sum:null,scoreCorrection,clockCorrection,eligibleForCalibration,
      modelPolicyAttribution:'Reported factors are explanatory, not a complete arithmetic ledger; floors, caps, rounding and interactions require replay',
      classification:!eligibleForCalibration||scoreCorrection||clockCorrection?'data_quality_limitation':Math.abs(delta)>=24?'calibration_hypothesis':'expected_behavior'});
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
      const recovered=start.deficit-deficit;
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
      const record={teamIndex:side,maximumObservedDeficit:start.deficit,deficitAtObservation:deficit,deficitRecovered:recovered,
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
  missingFieldCount:p.fieldCoverage?.missing.length??null,signals:p.assessment?.signals||[]};}
