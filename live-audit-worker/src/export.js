import {auditKeySql,observationScopeSql,auditGameAllowed,auditKeyAllowed,scopeEvidence,scopeFindingRows,AUDIT_SPORTS,AUDIT_SCOPE_VERSION} from './scope.js';
import {AUDIT_VERSION,auditTimeline} from './audit.js';
import {buildScoringQuality} from './quality.js';
import {reviewHistoricalFindings} from './historical-review.js';
import {extractRetainedProviderEvents} from './evidence.js';
import {normalizeAuditRating} from './rating-evidence.js';
import {snapshotTimingIssue} from '../../alerts-worker/src/snapshot-provenance.js';

const dateFormatter=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'});
export function slateDateNY(value) {
  const at=typeof value==='number'?value:Date.parse(String(value || ''));
  if (!Number.isFinite(at)) return null;
  const parts=Object.fromEntries(dateFormatter.formatToParts(at).map(part=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function midnightNY(date) {
  const noon=Date.parse(`${date}T12:00:00Z`);
  const localHour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(noon));
  return Date.parse(`${date}T00:00:00Z`)-(localHour-12)*3600000;
}
function nextDay(date) {return new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10)}
function previousDay(date) {return new Date(Date.parse(`${date}T12:00:00Z`)-86400000).toISOString().slice(0,10)}
const rows=async statement=>(await statement.all()).results || [];
const parse=value=>{try{return JSON.parse(value)}catch{return null}};
const sensitive=/password|secret|api.?key|auth(?:orization)?|bearer|credential|cookie|private.?key|token/i;
export function scrub(value,key='') {
  if (sensitive.test(key)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map(item=>scrub(item));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scrub(v,k)]));
  if (typeof value!=='string') return value;
  if (/\bBearer\s+\S+|\b(?:api[_-]?key|access[_-]?token|password|secret)=/i.test(value)) return '[REDACTED]';
  if (/^https?:\/\//i.test(value)) {
    try {
      const url=new URL(value);
      if (!['site.api.espn.com','api-web.nhle.com'].includes(url.hostname)) return '[EXTERNAL_URL_REDACTED]';
      const event=url.searchParams.get('event');
      return `${url.origin}${url.pathname}${event?`?event=${encodeURIComponent(event)}`:''}`;
    } catch {return '[INVALID_URL_REDACTED]'}
  }
  return value;
}
export async function defaultSlateDate(env,feed,now=Date.now()) {
  const candidates=await rows(env.DB.prepare(`SELECT DISTINCT slate_date FROM live_audit_observations
    WHERE ${observationScopeSql()} AND slate_date IS NOT NULL ORDER BY slate_date DESC LIMIT 30`));
  const unfinished=new Set((feed?.games || []).filter(game=>auditGameAllowed(game)&&['live','upcoming'].includes(game.state))
    .map(game=>slateDateNY(game.startTime)).filter(Boolean));
  const availableDates=candidates.map(row=>row.slate_date);
  const defaultDate=availableDates.find(date=>!unfinished.has(date)) ||
    previousDay(slateDateNY(now));
  return {defaultDate,availableDates,timeZone:'America/New_York'};
}
async function gameKeys(env,date) {
  const out=[];let after='';
  for(;;) {
    const batch=await rows(env.DB.prepare(`SELECT DISTINCT game_key FROM live_audit_observations
      WHERE ${observationScopeSql()} AND slate_date=? AND game_key>? ORDER BY game_key LIMIT 100`).bind(date,after));
    if (!batch.length) break;
    out.push(...batch.map(row=>row.game_key).filter(auditKeyAllowed));after=batch.at(-1).game_key;
    if (batch.length<100) break;
  }
  return out;
}
const projectedByteLength=value=>new TextEncoder().encode(JSON.stringify(value)).length;
// Project inside SQLite: normalized histories and duplicate event ledgers must
// not consume the archive budget before the end of a game's rating trajectory.
// json_each preserves an absent property versus an explicitly null score.
const stateProjection={fields:['id','sport','state','score','baseScore','openingScore','teams','startTime','context','status','modelVersion',
  'evidenceQuality','evidenceReasons','scoringPartial','timingUncertain','detailStale','liveUpdateRejected','basketballUpdateRejected','summaryLifecycleRejected','scoringHistoryRejected','momentumPoints'],
  liveRawStatus:{fields:['period','displayClock','type','periodDescriptor']},
  liveRawSituation:{fields:['possession','down','distance','yardsToEndzone','awayTimeouts','homeTimeouts','fouls','bonus','shotClock','outs',
    'onFirst','onSecond','onThird','battingTeamId','battingSide','powerPlayTeamId','goaliePulled','noHitBid','matchPoint','breakPoint','breakOfServe','tiebreak'],
    lastPlay:{fields:['period','text']}},
  live:{fields:['phase','bonus','winProbability'],sportImpact:{fields:['manpower','overtime']}},
  liveUpset:{fields:['market','currentProbability']},liveSurprise:{fields:['market','currentProbability']},
  inputEvidence:{fields:['clockMode']},trajectoryScoring:{fields:['adjustment']},historyOwnership:{fields:['combinedPoints']},
  pregameBaseline:{fields:['source','score','rawPregameScore']}};
const qualityProjection={fields:['version','source','publishedAt','observedAt','possession','down','distance','yardsToEndzone','timeouts',
  'fouls','bonus','shotClock','outs','bases','battingTeamId','powerPlayTeamId','goaliePulled','pressure','noHitBid','bestOf','matchPoint',
  'breakPoint','breakOfServe','tiebreak','grandSlam','stakes','championship','market','underdogMargin','underdogProbability','winProbability',
  'historyPoints','stakesPoints','event','evidenceQuality','scoringPartial','rejected','providerPublication','providerPublicationLatencyMs',
  'manpower','manpowerEvidenceStatus','goalieEvidenceSource','goalieEvidenceScope','pregameTeamQuality','verifiedSignificance','retainedEvidenceStatus'],
  components:{fields:['baseScore','openingScore','liveBonus','momentumPoints','historyPoints','historyCombinedPoints','trajectoryAdjustment']}};
function projectedJson(column,shape,path='$'){
  const safe=`CASE WHEN json_valid(${column}) THEN ${column} ELSE '{}' END`;
  const direct=`(SELECT json_group_object(key,CASE WHEN type IN ('object','array') THEN json(value) WHEN type='true' THEN json('true') WHEN type='false' THEN json('false') ELSE value END) FROM json_each(${safe},'${path}') WHERE key IN (${shape.fields.map(k=>`'${k}'`).join(',')}))`;
  const children=Object.entries(shape).filter(([key])=>key!=='fields');
  const value=children.length?`json_set(${direct},${children.map(([key,child])=>`'$.${key}',${projectedJson(column,child,`${path}.${key}`)}`).join(',')})`:direct;
  return `CASE WHEN json_type(${safe},'${path}')='object' THEN ${value} ELSE NULL END`;
}
const auditProjection={fields:['scoringVersion','auditVersion','auditScopeVersion','feedRevision','modelAttribution','feedModelVersion','sourceErrorScope',
  'feedUpdatedAt','sourceFreshnessMs','rawInputReferences','auditCandidates','comparison'],state:stateProjection,qualityEvidence:qualityProjection,
  timelineDiagnostics:{fields:['scoreRollbacks','sequenceRollbacks','clockRollbacks','periodRollbacks','conflictingEvents','duplicatesRemoved']}};
const projectedAuditSql=projectedJson('evidence',auditProjection);
const projectedSnapshotSql=projectedJson('normalized_state',stateProjection);
function projectObject(value,shape){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const out=Object.fromEntries(shape.fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
  for(const [key,child]of Object.entries(shape))if(key!=='fields'&&value[key]&&typeof value[key]==='object')out[key]=projectObject(value[key],child);
  return out;
}
function boundedPoints(points,byteLimit){
  const bytes=list=>list.reduce((sum,p)=>sum+projectedByteLength(p),0);
  let selected=points,total=bytes(points);
  while(total>byteLimit&&selected.length>2){
    const next=[selected[0],...selected.slice(1,-1).filter((_,i)=>i%2===1),selected.at(-1)];selected=next;total=bytes(next);
  }
  return {rows:total<=byteLimit?selected:[],bytes:total<=byteLimit?total:0};
}
function finalizeTrajectory(points,predecessors,byteLimit,audit=false){
  let selected=points;
  for(;;){
    for(let i=0;i<selected.length;i++){
      const p=selected[i],before=selected[i-1],source=predecessors.get(p),omitted=Boolean(source?.omitted||
        source?.at!==null&&source?.at!==undefined&&source.at!==(before?.observedAt??null));
      const staleInterval=Boolean(before&&p.observedAt-before.observedAt>360000),gap=omitted||staleInterval;
      if(gap)p.sourceReference={...p.sourceReference,trajectoryGapBefore:true,
        trajectoryGapReason:omitted?'Intervening source observations were omitted by export sampling':'More than six minutes between retained source observations',
        previousIncludedObservedAt:before?.observedAt??null,sourcePredecessorObservedAt:source?.at??null};
      if(audit){
        const reason=gap?p.sourceReference.trajectoryGapReason:!before?null:before.scoringVersion!==p.scoringVersion?'model version boundary':
          !p.scoringVersion?'scoring model attribution unavailable':!Number.isFinite(before.rating)||!Number.isFinite(p.rating)?'unavailable rating':null;
        p.ratingChange=before&&!reason&&p.scoringVersion?p.rating-before.rating:null;
        p.ratingChangeUnavailableReason=reason;p.ratingChangeFromObservedAt=p.ratingChange===null?null:before.observedAt;
      }
    }
    const bounded=boundedPoints(selected,byteLimit);
    if(bounded.rows.length===selected.length)return bounded;
    selected=bounded.rows;
  }
}
function auditObservation(row,key,previous){
  const evidence=parse(row.evidence) || {};
  const interpretation=normalizeAuditRating(row.rating,evidence.state),rating=interpretation.rating;
  return scopeEvidence(scrub({observationId:`live_audit_observations:${key}:${row.observed_at}`,runId:row.run_id,observedAt:row.observed_at,slateDate:row.slate_date,
    provenance:'scheduled-audit-observation',timestampKind:'audit-observation',
    rating,...(rating!==row.rating?{rawRating:row.rating,ratingInterpretation:interpretation}:{}),
    ratingChange:previous&&Number.isFinite(rating)&&Number.isFinite(previous.rating)&&evidence.scoringVersion&&previous.scoringVersion===evidence.scoringVersion?rating-previous.rating:null,
    ratingChangeUnavailableReason:previous&&previous.scoringVersion!==evidence.scoringVersion?'model version boundary':null,
    scores:[row.score_a,row.score_b],period:row.period,clockSeconds:row.clock_seconds,
    stateBucket:row.state_bucket,state:evidence.state || null,scoringVersion:evidence.scoringVersion || null,
    auditVersion:evidence.auditVersion || null,auditScopeVersion:evidence.auditScopeVersion || null,feedRevision:evidence.feedRevision || null,
    qualityEvidence:evidence.qualityEvidence || null,
    comparison:evidence.comparison || null,timelineDiagnostics:evidence.timelineDiagnostics || null,
    modelAttribution:evidence.modelAttribution || null,feedModelVersion:evidence.feedModelVersion || null,
    sourceErrorScope:evidence.sourceErrorScope || null,
    feedUpdatedAt:evidence.feedUpdatedAt ?? null,sourceFreshnessMs:evidence.sourceFreshnessMs ?? null,
    sourceReference:{table:'live_audit_observations',gameKey:key,runId:row.run_id,observedAt:row.observed_at},
    rawInputReferences:evidence.rawInputReferences || [],auditCandidates:evidence.auditCandidates || []}));
}
async function gameObservations(env,date,key,budget) {
  const stats=await env.DB.prepare(`SELECT COUNT(*) AS retained_rows,MIN(observed_at) AS first_at,MAX(observed_at) AS last_at
    FROM live_audit_observations WHERE ${observationScopeSql()} AND slate_date=? AND game_key=?`).bind(date,key).first();
  budget.statisticsQueries++;
  const available=Number.isInteger(stats?.retained_rows)?stats.retained_rows:null,limit=2000;
  const sampling=available>limit,ceiling=Math.max(0,Math.min(budget.byteLimit,budget.phaseCeiling)-budget.projectedBytes);
  let out=[],after=-1,readRows=0,exhausted=false,byteSampled=false,previousReadAt=null,previousReadRank=0;
  const predecessors=new WeakMap();
  for(;;) {
    const columns=`run_id,game_key,observed_at,slate_date,sport,state_bucket,rating,score_a,score_b,period,clock_seconds,${projectedAuditSql} AS evidence`;
    const sql=sampling?`SELECT ${columns},export_rank FROM (SELECT *,ROW_NUMBER() OVER (ORDER BY observed_at) AS export_rank FROM live_audit_observations
      WHERE ${observationScopeSql()} AND slate_date=? AND game_key=?) WHERE observed_at>? AND
      (export_rank=1 OR ((export_rank-1)*${limit-1})/${available-1}>((export_rank-2)*${limit-1})/${available-1}) ORDER BY observed_at LIMIT 100`:
      `SELECT ${columns} FROM live_audit_observations WHERE ${observationScopeSql()} AND slate_date=? AND game_key=? AND observed_at>? ORDER BY observed_at LIMIT 100`;
    const batch=await rows(env.DB.prepare(sql).bind(date,key,after));
    budget.auditQueries++;budget.auditReadRows+=batch.length;readRows+=batch.length;
    if (!batch.length){exhausted=true;break;}
    for(const row of batch){
      // The JS projection also protects test adapters and old D1 readers that
      // return the original column instead of the SQL alias.
      const observation=auditObservation({...row,evidence:JSON.stringify(projectObject(parse(row.evidence),auditProjection))},key,out.at(-1));
      observation.evidenceProjection='trajectory';out.push(observation);
      const omitted=sampling&&row.export_rank>previousReadRank+1;
      predecessors.set(observation,{at:omitted?null:previousReadAt,omitted});previousReadAt=row.observed_at;previousReadRank=row.export_rank??previousReadRank+1;
    }
    const bounded=boundedPoints(out,ceiling);byteSampled ||= bounded.rows.length<out.length;out=bounded.rows;
    after=batch.at(-1).observed_at;
    if(batch.length<100||available!==null&&readRows>=Math.min(available,limit)){exhausted=true;break;}
    if(readRows>=limit)break;
  }
  const finalized=finalizeTrajectory(out,predecessors,ceiling,true);byteSampled ||= finalized.rows.length<out.length;out=finalized.rows;
  const projectedBytes=finalized.bytes;
  budget.projectedBytes+=projectedBytes;budget.auditProjectedBytes+=projectedBytes;
  const countMismatch=available!==null&&readRows!==Math.min(available,limit);
  const truncated=sampling||byteSampled||!exhausted||countMismatch;
  return {rows:out,coverage:{rows:out.length,availableRows:available,readRows,projectedBytes,truncated,complete:!truncated,
    countMismatch,
    projection:'lightweight trajectory; diagnostic details are separately bounded',sampling:truncated?'full-span retained-row sampling':'none',
    ratingChangeScope:'Consecutive retained source audit observations within one model only; unavailable across omitted rows, long source gaps or unavailable ratings',
    firstAvailableAt:stats?.first_at??out[0]?.observedAt??null,lastAvailableAt:stats?.last_at??out.at(-1)?.observedAt??null,
    firstIncludedAt:out[0]?.observedAt??null,lastIncludedAt:out.at(-1)?.observedAt??null,
    fullSpanPreserved:available===0||Boolean(out.length&&out[0].observedAt===(stats?.first_at??out[0].observedAt)&&out.at(-1).observedAt===(stats?.last_at??out.at(-1).observedAt)),
    detail:truncated?'Lightweight audit trajectory sampled within the row/projected-byte budget; omitted rows remain in D1. Sampling preserves the first and last retained rows when the endpoint pair fits. It is not complete coverage.':'Every retained audit observation for this game and slate is included as a lightweight trajectory point'}};
}
function compactSnapshot(row) {
  const state=parse(row.normalized_state) || {};
  const timingIssue=snapshotTimingIssue(row,state);
  return scrub({observedAt:row.observed_at,state:row.state,rating:row.rating,
    ...(timingIssue?{evidenceQuality:'invalid',integrityIssue:true,timingIssue}:{}),
    scores:[row.score_a,row.score_b],period:Number(row.phase)||null,clock:row.clock,
    modelVersion:row.model_version,phaseLabel:state.live?.phase || state.status || null,
    explanation:state.why || null,moment:state.moment || null,
    factors:state.factors || [],momentumText:state.momentumText || null,
    rawInputReference:{table:'sports_snapshots',gameKey:row.game_key,observedAt:row.observed_at}});
}
const snapshotFields=['id','sport','state','score','baseScore','openingScore','teams','startTime','context',
  'factors','detailStale','liveRawStatus','liveRawSituation',
  'sourceCompetition','live','status','liveUpset','liveSurprise','evidenceQuality','scoringPartial','timingUncertain',
  'liveUpdateRejected','basketballUpdateRejected','summaryLifecycleRejected','scoringHistoryRejected','modelVersion',
  'trajectoryScoring','historyOwnership','momentumPoints','evidenceReasons','evidenceCoverage','inputEvidence','scoringPolicy'];
export function retainedObservation(row) {
  const decoded=parse(row.normalized_state);
  const timingIssue=snapshotTimingIssue(row,decoded||{});
  const interpretation=normalizeAuditRating(row.rating,decoded),rating=interpretation.rating;
  const validState=row.normalized_state_valid===undefined?Boolean(decoded&&typeof decoded==='object'&&!Array.isArray(decoded)):Boolean(row.normalized_state_valid);
  const state=validState?Object.fromEntries(snapshotFields.filter(k=>decoded[k]!==undefined).map(k=>[k,decoded[k]])):{};
  const select=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,value[k]]));
  if(Array.isArray(state.teams))state.teams=state.teams.map(t=>[t?.[0]??null,t?.[1]??null,t?.[2]??null,null,null,null,null,null,t?.[8]??null]);
  if(state.inputEvidence)state.inputEvidence=select(state.inputEvidence,['clockMode','duplicatesRemoved','conflictingEvents','futureEventsExcluded','summaryAhead','aggregateEvidenceDeferred','providerBoundary','canonicalBoundary']);
  if(state.liveRawSituation?.lastPlay){
    state.liveRawSituation={...state.liveRawSituation,lastPlay:select(state.liveRawSituation.lastPlay,
      ['id','type','text','scoringPlay','period','clock','wallclock','awayScore','homeScore','team','scoreValue'])};
  }
  if(state.live){
    state.live=select(state.live,['phase','bonus','winProbability','components','bases','aggregation','sportImpact']);
    if(state.live.sportImpact){
      state.live.sportImpact=select(state.live.sportImpact,['points','competitiveFloor','competitiveTarget','manpower','overtime','allocation']);
      if(state.live.sportImpact.allocation)state.live.sportImpact.allocation=select(state.live.sportImpact.allocation,['context','floorBase']);
    }
  }
  if(state.trajectoryScoring)state.trajectoryScoring=select(state.trajectoryScoring,[
    'enabled','policyId','adjustment','rawTrajectory','boundedTrajectory','positiveCurrentStateGate','effectivePositiveGate',
    'unprotectedAdjustment','decisiveStrength','requestedPositive','positiveAfterHistoryCaps','positiveReducedByRelevance',
    'negativeMultiplier','negativeAfterTaper','negativeAfterFloor','protectedRating','floorBonus','observedCoverageShare','scoreObservationCount','hasHistory','fallback']);
  if(state.historyOwnership)state.historyOwnership=select(state.historyOwnership,[
    'originalPoints','eventPoints','replacedPoints','combinedPoints','positiveLimitedByCaps','relevance','allocation','cfbRun']);
  if(decoded?.pregameBaseline&&typeof decoded.pregameBaseline==='object')state.pregameBaseline=select(decoded.pregameBaseline,
    ['source','score','rawPregameScore','spread','underdog']);
  // Stored refresh buckets are retained exactly. They are not publication times.
  return scrub({observationId:`sports_snapshots:${row.game_key}:${row.observed_at}`,observedAt:row.observed_at,
    provenance:'retained-scoring-snapshot',timestampKind:'scoring-snapshot-refresh-bucket',rating,
    ...(rating!==row.rating?{rawRating:row.rating,ratingInterpretation:interpretation}:{}),
    state:{...state,state:row.state,...(timingIssue?{evidenceQuality:'invalid',timingUncertain:true}: {})},
    ...(timingIssue?{integrityIssue:true,timingIssue}:{}),scores:[row.score_a,row.score_b],period:Number(row.phase)||null,clock:row.clock,
    scoringVersion:row.model_version||null,qualityEvidence:null,feedUpdatedAt:null,feedRevision:null,
    sourceReference:{table:'sports_snapshots',gameKey:row.game_key,observedAt:row.observed_at,
      modelVersion:row.model_version||null,normalizedStateValid:validState},rawInputReferences:[{table:'sports_snapshots',gameKey:row.game_key,observedAt:row.observed_at}]});
}
function archiveSnapshot(observation){
  const s=observation.state||{},pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
  const state=pick(s,['id','sport','state','modelVersion','score','baseScore','openingScore','momentumPoints','evidenceQuality',
    'scoringPartial','timingUncertain','detailStale','evidenceReasons','liveUpdateRejected','basketballUpdateRejected','summaryLifecycleRejected','scoringHistoryRejected']);
  if(s.live)state.live=pick(s.live,['phase','bonus','winProbability']);
  if(s.liveRawStatus)state.liveRawStatus=pick(s.liveRawStatus,['period','displayClock','type','periodDescriptor']);
  if(s.inputEvidence)state.inputEvidence=pick(s.inputEvidence,['clockMode']);
  if(s.trajectoryScoring)state.trajectoryScoring=pick(s.trajectoryScoring,['adjustment']);
  if(s.historyOwnership)state.historyOwnership=pick(s.historyOwnership,['combinedPoints','positiveLimitedByCaps']);
  if(s.pregameBaseline)state.pregameBaseline=pick(s.pregameBaseline,['source','score','rawPregameScore']);
  return {...observation,state};
}
async function retainedTrajectory(env,key,{from,to,budget}) {
  const stats=await env.DB.prepare('SELECT COUNT(*) AS retained_rows,MIN(observed_at) AS first_at,MAX(observed_at) AS last_at FROM sports_snapshots WHERE game_key=? AND observed_at>=? AND observed_at<=?').bind(key,from,to).first();
  budget.input.statisticsQueries++;
  const available=Number.isInteger(stats?.retained_rows)?stats.retained_rows:null,cap=Math.min(budget.perGameRowLimit,budget.remaining),sampling=available>cap;
  const ceiling=Math.max(0,Math.min(budget.perGameByteLimit,budget.input.byteLimit-budget.input.projectedBytes,budget.input.phaseCeiling-budget.input.projectedBytes));
  let selected=[],after=from-1,readRows=0,exhausted=available===0,byteSampled=false,previousReadAt=null,previousReadRank=0;
  const predecessors=new WeakMap();
  while(readRows<cap&&!exhausted) {
    const limit=Math.min(200,cap-readRows);
    const columns=`game_key,observed_at,state,rating,score_a,score_b,phase,clock,${projectedSnapshotSql} AS normalized_state,
      (json_valid(normalized_state) AND json_type(CASE WHEN json_valid(normalized_state) THEN normalized_state ELSE '{}' END)='object') AS normalized_state_valid,model_version`;
    const sql=sampling&&cap>=2?`SELECT ${columns},export_rank FROM (SELECT *,ROW_NUMBER() OVER (ORDER BY observed_at) AS export_rank FROM sports_snapshots
      WHERE game_key=? AND observed_at>=? AND observed_at<=?) WHERE observed_at>? AND
      (export_rank=1 OR ((export_rank-1)*${cap-1})/${available-1}>((export_rank-2)*${cap-1})/${available-1}) ORDER BY observed_at LIMIT ?`:
      `SELECT ${columns} FROM sports_snapshots WHERE game_key=? AND observed_at>? AND observed_at<=? ORDER BY observed_at LIMIT ?`;
    const batch=await rows(env.DB.prepare(sql).bind(...(sampling&&cap>=2?[key,from,to,after,limit]:[key,after,to,limit])));
    budget.queries++;budget.rows+=batch.length;budget.remaining-=batch.length;
    readRows+=batch.length;
    if(!batch.length){exhausted=true;break;}
    for(const row of batch){
      const original=parse(row.normalized_state),valid=row.normalized_state_valid??Boolean(original&&typeof original==='object'&&!Array.isArray(original));
      const projected=retainedObservation({...row,normalized_state:JSON.stringify(projectObject(original,stateProjection)),normalized_state_valid:valid});
      projected.evidenceProjection='trajectory';selected.push(projected);
      const omitted=sampling&&row.export_rank>previousReadRank+1;
      predecessors.set(projected,{at:omitted?null:previousReadAt,omitted});previousReadAt=row.observed_at;previousReadRank=row.export_rank??previousReadRank+1;
    }
    const bounded=boundedPoints(selected,ceiling);byteSampled ||= bounded.rows.length<selected.length;selected=bounded.rows;
    const cursor=Number(batch.at(-1).observed_at);
    if(!Number.isFinite(cursor)||cursor<=after)break;
    after=cursor;
    if(batch.length<limit||available!==null&&readRows>=Math.min(available,cap)){exhausted=true;break;}
  }
  const finalized=finalizeTrajectory(selected,predecessors,ceiling);byteSampled ||= finalized.rows.length<selected.length;selected=finalized.rows;
  const projectedBytes=finalized.bytes;budget.projectedBytes+=projectedBytes;budget.input.projectedBytes+=projectedBytes;
  const countMismatch=available!==null&&readRows!==Math.min(available,cap);
  const truncated=sampling||byteSampled||!exhausted||countMismatch;
  return {rows:selected,surrounding:[],coverage:{from,to,rows:selected.length,availableRows:available,readRows,projectedBytes,truncated,complete:!truncated,
    countMismatch,
    projection:'lightweight trajectory; diagnostic details are separately bounded',sampling:truncated?'full-span retained-row sampling':'none',
    firstAvailableAt:stats?.first_at??selected[0]?.observedAt??null,lastAvailableAt:stats?.last_at??selected.at(-1)?.observedAt??null,
    firstIncludedAt:selected[0]?.observedAt??null,lastIncludedAt:selected.at(-1)?.observedAt??null,
    fullSpanPreserved:available===0||Boolean(selected.length&&selected[0].observedAt===(stats?.first_at??selected[0].observedAt)&&selected.at(-1).observedAt===(stats?.last_at??selected.at(-1).observedAt)),
    detail:truncated?'Snapshot row/projected-byte limit requires full-span retained-row sampling. First/last endpoints are preserved when the endpoint pair fits; omitted rows remain in D1 and full snapshot coverage is not established.':'Every retained scoring snapshot in the bounded game window is included as a lightweight trajectory point'}};
}
async function retainedTimeline(env,key,observations,cost,reviewedAt,inputBudget) {
  const id=key.slice(key.indexOf(':')+1),sport=key.split(':')[0];
  const source=observations.flatMap(o=>o.rawInputReferences||[]).map(r=>r.source).find(value=>{
    try {const u=new URL(value);return u.origin==='https://site.api.espn.com'&&u.pathname.endsWith('/summary')&&u.searchParams.get('event')===id;} catch{return false;}
  });
  const unavailable={retrospectiveEvents:[],eventCoverage:{retained:0,completeness:'unavailable'}};
  if(!source)return {...unavailable,asOf:null,source:null,status:'unavailable',limitation:'No retained summary reference was recorded; provider events cannot be reconstructed'};
  const row=await env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(source).first();
  cost.queries++;
  if(!row)return {...unavailable,asOf:null,source,status:'unavailable',limitation:'Cached summary is unavailable; provider events cannot be reconstructed'};
  const summary=parse(row.payload);cost.bytes+=typeof row.payload==='string'?new TextEncoder().encode(row.payload).length:0;
  if(!summary)return {...unavailable,asOf:row.updated_at,source,status:'invalid',limitation:'Retained summary payload is invalid JSON'};
  const headerId=summary.header?.id??summary.header?.competitions?.[0]?.id;
  if(headerId!=null&&String(headerId)!==id)return {...unavailable,asOf:row.updated_at,source,status:'invalid',limitation:'Retained summary header identifies a different event; timeline review withheld'};
  const retrospective=extractRetainedProviderEvents(summary,sport,{source,cachedAt:row.updated_at,reviewedAt});
  const retainedEvents=[];let projectedBytes=0;
  for(const event of retrospective.events){
    const bytes=projectedByteLength(event);
    if(inputBudget.projectedBytes+bytes>Math.min(inputBudget.byteLimit,inputBudget.phaseCeiling))break;
    retainedEvents.push(event);projectedBytes+=bytes;inputBudget.projectedBytes+=bytes;inputBudget.retrospectiveEventProjectedBytes+=bytes;
  }
  const omittedByInputBudget=retrospective.events.length-retainedEvents.length;
  return scrub({asOf:row.updated_at,reviewedAt,source,status:'reviewed',...auditTimeline(summary,sport),
    summaryIdentity:headerId==null?'recorded-cache-key matches game; provider header identity unavailable':'provider header matches game',
    retrospectiveEvents:retainedEvents,eventCoverage:{...retrospective.coverage,retained:retainedEvents.length,
      truncated:Boolean(retrospective.coverage.truncated||omittedByInputBudget),omittedByInputBudget,projectedBytes},
    evidenceScope:'Later cached provider revision used for retrospective event associations only. Availability to the scorer or audit at the historical observation time is unknown; historical observations are not backfilled.',
    limitation:'Later retained provider revision; not proof of the exact originally flagged payload. Cache acquisition is not provider publication time.'});
}
function detailTargets(game,observations){
  const selected=new Set(),atTimes=game.findings.flatMap(f=>[f.firstSeen,f.lastSeen,...(f.events||[]).map(e=>e.at)]).filter(Number.isFinite);
  const add=i=>{if(i>=0&&i<observations.length)selected.add(observations[i].observedAt);};
  for(const at of atTimes){
    const next=observations.findIndex(o=>o.observedAt>=at);if(next>=0){add(next-1);add(next);add(next+1);}else add(observations.length-1);
  }
  for(let i=0;i<observations.length;i++){
    const p=observations[i],before=observations[i-1],s=p.state||{};
    if((p.auditCandidates||[]).length||p.ratingInterpretation||s.liveUpdateRejected||s.basketballUpdateRejected||s.detailStale||s.timingUncertain){add(i-1);add(i);add(i+1);}
    if(before&&before.scoringVersion===p.scoringVersion&&Number.isFinite(before.rating)&&Number.isFinite(p.rating)&&
      (Math.abs(p.rating-before.rating)>=24||before.rating<85&&p.rating>=85||before.rating>=85&&p.rating<85||
       p.scores?.some((score,j)=>Number.isFinite(score)&&Number.isFinite(before.scores?.[j])&&score<before.scores[j]))){add(i-1);add(i);}
  }
  return [...selected].sort((a,b)=>a-b);
}
async function upgradeDetails(env,date,game,inputBudget,snapshotBudget){
  const coverage={projection:'Flagged observations, major-change and 85-crossing endpoints only; full raw histories stay in referenced D1 rows',audit:{},snapshots:{}};
  for(const kind of ['audit','snapshots']){
    const list=kind==='audit'?game.observations:game.retainedScoringObservations,targetTimes=detailTargets(game,list);
    const cap=kind==='audit'?100:Math.max(0,Math.min(100,snapshotBudget.remaining,2000-game.snapshotCoverage.readRows));
    const detailTimes=targetTimes.length<=cap?targetTimes:cap<2?targetTimes.slice(0,cap):
      Array.from({length:cap},(_,i)=>targetTimes[Math.round(i*(targetTimes.length-1)/(cap-1))]);
    const byTime=new Map(list.map((observation,i)=>[observation.observedAt,i]));
    let included=0,readRows=0,projectedBytes=0;
    for(let offset=0;offset<detailTimes.length;offset+=5){
      const times=detailTimes.slice(offset,offset+5),placeholders=times.map(()=>'?').join(',');
      const sql=kind==='audit'?`SELECT run_id,game_key,observed_at,slate_date,sport,state_bucket,rating,score_a,score_b,period,clock_seconds,evidence
        FROM live_audit_observations WHERE ${observationScopeSql()} AND slate_date=? AND game_key=? AND observed_at IN (${placeholders}) ORDER BY observed_at`:
        `SELECT game_key,observed_at,state,rating,score_a,score_b,phase,clock,normalized_state,model_version FROM sports_snapshots WHERE game_key=? AND observed_at IN (${placeholders}) ORDER BY observed_at`;
      const batch=await rows(env.DB.prepare(sql).bind(...(kind==='audit'?[date,game.gameKey,...times]:[game.gameKey,...times])));
      readRows+=batch.length;
      if(kind==='audit'){inputBudget.auditQueries++;inputBudget.auditReadRows+=batch.length;}
      else {snapshotBudget.queries++;snapshotBudget.rows+=batch.length;snapshotBudget.remaining-=batch.length;}
      for(const row of batch){
        const index=byTime.get(row.observed_at);if(index===undefined)continue;
        const detailed=kind==='audit'?auditObservation(row,game.gameKey,list[index-1]):retainedObservation(row);
        detailed.sourceReference={...detailed.sourceReference,...list[index].sourceReference};
        if(kind==='audit')for(const field of ['ratingChange','ratingChangeUnavailableReason','ratingChangeFromObservedAt'])detailed[field]=list[index][field];
        detailed.evidenceProjection='detailed';
        const delta=Math.max(0,projectedByteLength(detailed)-projectedByteLength(list[index]));
        if(inputBudget.projectedBytes+delta>Math.min(inputBudget.byteLimit,inputBudget.phaseCeiling))continue;
        if(kind==='snapshots'&&game.snapshotCoverage.projectedBytes+projectedBytes+delta>snapshotBudget.perGameByteLimit)continue;
        list[index]=detailed;inputBudget.projectedBytes+=delta;projectedBytes+=delta;included++;
        if(kind==='audit')inputBudget.auditProjectedBytes+=delta;else {snapshotBudget.projectedBytes+=delta;game.surroundingScoringSnapshots.push(compactSnapshot(row));}
      }
      if(inputBudget.projectedBytes>=inputBudget.phaseCeiling)break;
    }
    coverage[kind]={requestedRows:targetTimes.length,readRows,includedRows:included,omittedRows:targetTimes.length-included,
      complete:included===targetTimes.length,projectedBytes,rowLimit:cap};
  }
  return coverage;
}
function mergeFindings(gameKey,observations,stored,events) {
  const map=new Map();
  for(const observation of observations) for(const candidate of observation.auditCandidates || []) {
    const id=candidate.reasonCode;
    if(!map.has(id))map.set(id,{gameKey,reasonCode:id,firstSeen:observation.observedAt,
      lastSeen:observation.observedAt,observationsDetected:0,events:[],status:'watch',...candidate});
    const entry=map.get(id);entry.lastSeen=observation.observedAt;entry.observationsDetected++;
  }
  for(const row of stored) {
    const evidence=parse(row.evidence) || {},id=row.reason_code;
    const entry=map.get(id) || {gameKey,reasonCode:id,events:[],observationsDetected:0};
    Object.assign(entry,{firstSeen:row.first_seen,lastSeen:row.last_seen,resolvedAt:row.resolved_at,
      status:row.status,severity:row.severity,confidence:row.confidence,failureLayer:row.failure_layer,
      observed:evidence.observed ?? entry.observed,expected:evidence.expected ?? entry.expected,
      detail:evidence.detail ?? entry.detail,deterministic:evidence.deterministic ?? entry.deterministic,
      affectedGames:evidence.affectedGames || [gameKey],supportingEvidence:evidence.rawInputReferences || []});
    map.set(id,entry);
  }
  for(const event of events) {
    const evidence=parse(event.evidence) || {},id=event.reason_code;
    const entry=map.get(id) || {gameKey,reasonCode:id,events:[],observationsDetected:0};
    entry.events.push({at:event.at,type:event.event,evidence:scrub(evidence)});
    entry.firstSeen=Math.min(entry.firstSeen || event.at,event.at);
    entry.lastSeen=Math.max(entry.lastSeen || event.at,event.at);
    entry.severity ||= evidence.severity;
    entry.confidence ||= evidence.confidence;
    entry.failureLayer ||= evidence.failureLayer;
    entry.observed ||= evidence.observed;
    entry.expected ||= evidence.expected;
    entry.detail ||= evidence.detail;
    entry.deterministic ??= evidence.deterministic;
    entry.affectedGames ||= evidence.affectedGames || [gameKey];
    if(!stored.some(row=>row.reason_code===id)) entry.status=event.event==='recovered'?'recovered':'open';
    map.set(id,entry);
  }
  return [...map.values()].map(item=>scopeEvidence(scrub({...item,
    classification:item.deterministic?'confirmed_integrity_failure':'heuristic_concern',
    corroborated:item.deterministic || item.events.some(event=>event.type==='opened')})))
    .sort((a,b)=>(a.firstSeen || 0)-(b.firstSeen || 0));
}
function markdownEscape(value) {return String(value ?? '').replace(/[|\r\n]/g,' ').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
const isoTimestamp=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=8640000000000000?new Date(value).toISOString():'unavailable';
export function renderSummary(data) {
  const m=data.metadata,h=data.sourceHealth;
  const lines=[`# SlateMeter nightly audit: ${m.slateDateNewYork}`,'',
    'This archive is an observation-only audit export for ChatGPT and Codex investigation. Heuristic concerns are review prompts, not verified scoring defects.','',
    `- Generated: ${m.generatedAt}`,
    `- Original slate date: ${m.slateDateNewYork} (America/New_York; games finishing after midnight stay with this date)`,
    `- Audit version: ${m.auditVersion}`,
    `- Scoring model versions: ${m.scoringModelVersions.join(', ') || 'unavailable'}`,
    `- Games monitored: ${m.gamesMonitored}`,
    `- Slate scans with game observations: ${m.totalScans}`,
    `- Scheduled runs in observed window: ${h.scheduledRuns}`,
    `- Original recorded findings: ${m.findingsCount} (${m.integrityFailures} recorded deterministic classifications, ${m.heuristicConcerns} recorded heuristic classifications)`,
    `- Current historical-finding review: ${m.currentConfirmedIntegrityFailures??'unavailable'} confirmed integrity findings; ${m.currentAuditCollectionErrors??'unavailable'} audit-collection errors. Original records remain unchanged.`,
    `- Missing observation intervals: ${m.missingObservationIntervals}`,
    `- Coverage gaps: ${data.coverageGaps.length}`,'',
    `- Lightweight trajectory coverage: ${m.trajectoryCoverageComplete?'complete for retained rows in the declared windows':'partial; inspect per-game observationCoverage and snapshotCoverage'}`,
    `- Requested diagnostic detail: ${m.diagnosticDetailCoverageComplete?'all requested flagged endpoints included':'partial within the separate detail budget; lightweight trajectories are not removed'}`,'',
    '## Source health','',
    `- Completed scan runs: ${h.completedRuns}; failed runs: ${h.failedRuns}`,
    `- Maximum feed age at scan: ${h.maxFeedAgeMs == null?'unknown':Math.round(h.maxFeedAgeMs/1000)+' seconds'}`,
    `- Audit provider requests: ${h.providerRequests}`,'',
    '## Every monitored game','',
    '| Game | Sport | Start (New York slate) | Observations | Rating range | Findings |',
    '| --- | --- | --- | ---: | --- | ---: |'];
  for(const game of data.games) lines.push(`| ${markdownEscape(game.matchup || game.gameKey)} | ${markdownEscape(game.sport)} | ${markdownEscape(game.startTime || 'unknown')} | ${game.observations.length} | ${game.minRating ?? '—'}–${game.maxRating ?? '—'} | ${game.findings.length} |`);
  if(!data.games.length)lines.push('| No live games observed | — | — | 0 | — | 0 |');
  lines.push('','## Findings','');
  const reviews=new Map((data.scoringQuality?.historicalFindingReview||[]).map(r=>[`${r.gameKey}|${r.reasonCode}`,r]));
  for(const finding of data.findings){
    const review=reviews.get(`${finding.gameKey}|${finding.reasonCode}`);
    lines.push(`- **${markdownEscape(finding.severity || 'unknown')} · ${markdownEscape(finding.reasonCode)} · ${markdownEscape(finding.gameKey)}**: original recorded classification ${markdownEscape(finding.classification)}, ${markdownEscape(finding.status)}. ${review?`Current review: ${markdownEscape(review.classification)}. ${markdownEscape(review.reason)}. `:''}Original detail: ${markdownEscape(finding.detail || '')} First ${isoTimestamp(finding.firstSeen)}; last ${isoTimestamp(finding.lastSeen)}.`);
  }
  if(!data.findings.length)lines.push('No findings recorded for these games.');
  lines.push('','## Coverage gaps and missing observations','');
  for(const gap of data.coverageGaps) lines.push(`- ${markdownEscape(gap.gameKey || 'slate')}: ${markdownEscape(gap.code)} — ${markdownEscape(gap.detail)}`);
  if(!data.coverageGaps.length)lines.push('No coverage gaps detected in retained audit observations.');
  if(data.scoringQuality)lines.push(...qualitySummary(data.scoringQuality));
  lines.push('','## Investigation guide','',
    'Use `findings.json` for the full timestamped observations, rating deltas, finding evidence, recovery events, and stored scoring snapshots around each anomaly. Inspect provider and clock issues before proposing a scoring change. Preserve current scoring behavior until a separate fix is tested.','');
  return lines.join('\n');
}
export async function buildNightlyExport(env,date,{feed=null,now=Date.now()}={}) {
  const keys=await gameKeys(env,date),games=[],coverageGaps=[];
  const inputBudget={projectedBytes:0,byteLimit:36*1024*1024,auditProjectedBytes:0,retrospectiveEventProjectedBytes:0,auditQueries:0,auditReadRows:0,statisticsQueries:0};
  const snapshotBudget={remaining:20000,rows:0,queries:0,projectedBytes:0,input:inputBudget,perGameByteLimit:8*1024*1024};
  const timelineCost={queries:0,bytes:0};
  const feedGames=new Map((feed?.games || []).filter(auditGameAllowed).map(game=>[`${game.sport}:${game.id}`,game]));
  const runIds=new Set();let firstAt=Infinity,lastAt=-Infinity,missingIntervals=0;
  for(const [keyIndex,key] of keys.entries()) {
    // Finish every game's lightweight trajectories before reading any full
    // diagnostic state. Unused per-game shares flow forward.
    const remainingGames=keys.length-keyIndex;
    const gameStartBytes=inputBudget.projectedBytes;
    const gameByteShare=Math.floor((inputBudget.byteLimit-gameStartBytes)/remainingGames);
    const gameCeiling=gameStartBytes+gameByteShare;
    inputBudget.phaseCeiling=gameStartBytes+Math.floor(gameByteShare*.3);
    snapshotBudget.perGameRowLimit=Math.min(2000,Math.floor(snapshotBudget.remaining/remainingGames));
    const audit=await gameObservations(env,date,key,inputBudget),observations=audit.rows;
    if(audit.coverage.truncated)coverageGaps.push({gameKey:key,code:'AUDIT_OBSERVATION_READ_LIMIT',
      from:audit.coverage.nextOmittedAt,detail:audit.coverage.detail});
    for(const observation of observations) {
      runIds.add(observation.runId);firstAt=Math.min(firstAt,observation.observedAt);lastAt=Math.max(lastAt,observation.observedAt);
    }
    for(let i=1;i<observations.length;i++) if(!audit.coverage.truncated&&observations[i].observedAt-observations[i-1].observedAt>6*60000) {
      missingIntervals++;coverageGaps.push({gameKey:key,code:'OBSERVATION_GAP',
        from:observations[i-1].observedAt,to:observations[i].observedAt,
        detail:`${Math.round((observations[i].observedAt-observations[i-1].observedAt)/60000)} minutes between audit observations`});
    }
    const first=observations[0],state=first?.state || {},startTime=state.startTime || feedGames.get(key)?.startTime || null;
    if(!startTime)coverageGaps.push({gameKey:key,code:'START_TIME_MISSING',detail:'Original scheduled start time was not retained'});
    else if(slateDateNY(startTime)!==date)coverageGaps.push({gameKey:key,code:'SLATE_DATE_CONFLICT',detail:'Original start time disagrees with stored slate date'});
    if(feedGames.get(key)?.state==='live')coverageGaps.push({gameKey:key,code:'SLATE_STILL_LIVE',detail:'Game remained live at export time; this is a partial slate export'});
    const stored=await rows(env.DB.prepare('SELECT * FROM live_audit_findings WHERE game_key=?').bind(key));
    const events=await rows(env.DB.prepare('SELECT * FROM live_audit_events WHERE game_key=? ORDER BY at').bind(key));
    const findings=mergeFindings(key,observations,stored,events);
    const startMs=Date.parse(startTime||'');
    const from=Math.min(first?.observedAt??midnightNY(date),Number.isFinite(startMs)?startMs:midnightNY(date))-6*3600000;
    const to=Math.min(now,Math.max(observations.at(-1)?.observedAt??from,Number.isFinite(startMs)?startMs:from)+12*3600000);
    inputBudget.phaseCeiling=gameCeiling;
    const trajectory=await retainedTrajectory(env,key,{from,to,budget:snapshotBudget});
    if(trajectory.coverage.truncated)coverageGaps.push({gameKey:key,code:'SNAPSHOT_READ_LIMIT',detail:trajectory.coverage.detail});
    if(!trajectory.rows.length&&!trajectory.coverage.truncated)coverageGaps.push({gameKey:key,code:'RETAINED_SNAPSHOTS_UNAVAILABLE',detail:'No scoring snapshots remain in the bounded game window; observation gaps cannot be reconstructed'});
    const snapshots=trajectory.surrounding;
    const scores=observations.map(item=>item.rating).filter(Number.isFinite);
    games.push({gameKey:key,sport:key.split(':')[0],matchup:(state.teams || []).map(team=>team?.[0]).join(' vs ') || key,
      startTime,slateDateNewYork:date,currentState:feedGames.get(key)?.state || 'not in current feed',
      firstObservedAt:first?.observedAt || null,lastObservedAt:observations.at(-1)?.observedAt || null,
      minRating:scores.length?Math.min(...scores):null,maxRating:scores.length?Math.max(...scores):null,
      observations,observationCoverage:audit.coverage,auditBudget:{projectedBytes:gameByteShare,snapshotRows:snapshotBudget.perGameRowLimit},findings,surroundingScoringSnapshots:snapshots,
      retainedScoringObservations:trajectory.rows,snapshotCoverage:trajectory.coverage});
  }
  const trajectoryProjectedBytes=inputBudget.projectedBytes;
  for(const [index,game]of games.entries()){
    const share=Math.floor((inputBudget.byteLimit-inputBudget.projectedBytes)/(games.length-index)),ceiling=inputBudget.projectedBytes+share;
    inputBudget.phaseCeiling=inputBudget.projectedBytes+Math.floor(share*.9);
    game.diagnosticDetailCoverage=await upgradeDetails(env,date,game,inputBudget,snapshotBudget);
    inputBudget.phaseCeiling=ceiling;
    const review=await retainedTimeline(env,game.gameKey,game.observations,timelineCost,now,inputBudget);
    game.retainedTimelineReview=review;game.retainedProviderEvents=review.retrospectiveEvents;game.retainedProviderEventCoverage=review.eventCoverage;
    if(review.eventCoverage?.truncated)coverageGaps.push({gameKey:game.gameKey,code:'RETAINED_EVENT_PROJECTION_LIMIT',
      detail:review.eventCoverage.omittedByInputBudget?'Shared projected input byte budget omitted provider event details; source summary remains in D1':'Retrospective provider events capped at 200 per game; source summary remains in D1'});
  }
  if(!keys.length)coverageGaps.push({code:'NO_LIVE_OBSERVATIONS',detail:'No live games were monitored for this original New York slate date'});
  const start=Number.isFinite(firstAt)?firstAt-180000:midnightNY(date),
    end=Number.isFinite(lastAt)?lastAt+180000:midnightNY(nextDay(date));
  const runs=await rows(env.DB.prepare('SELECT * FROM live_audit_runs WHERE started_at>=? AND started_at<=? ORDER BY started_at LIMIT 1000').bind(start,end));
  const ages=runs.map(run=>run.feed_updated_at?run.started_at-run.feed_updated_at:null).filter(Number.isFinite);
  const globalRows=scopeFindingRows(await rows(env.DB.prepare(`SELECT * FROM live_audit_findings
    WHERE ${auditKeySql('game_key',true)} AND (game_key='feed' OR game_key LIKE 'sport:%')`)));
  const globalEvents=scopeFindingRows(await rows(env.DB.prepare(`SELECT * FROM live_audit_events WHERE at>=? AND at<=?
    AND ${auditKeySql('game_key',true)} AND (game_key='feed' OR game_key LIKE 'sport:%') ORDER BY at`).bind(start,end)));
  const globalKeys=new Set([...globalRows.filter(row=>row.first_seen<=end && row.last_seen>=start).map(row=>row.game_key),
    ...globalEvents.map(row=>row.game_key)]);
  const globalFindings=[...globalKeys].flatMap(key=>mergeFindings(key,[],
    globalRows.filter(row=>row.game_key===key && row.first_seen<=end && row.last_seen>=start),
    globalEvents.filter(row=>row.game_key===key)));
  const findings=[...games.flatMap(game=>game.findings),...globalFindings];
  const scoringModelVersions=[...new Set([...runs.map(run=>run.model_version),...games.flatMap(game=>[...game.observations,...game.retainedScoringObservations].map(o=>o.scoringVersion))].filter(Boolean))];
  if(runs.some(run=>run.error)) coverageGaps.push({code:'SCAN_FAILURE',detail:`${runs.filter(run=>run.error).length} scheduled audit runs failed during the observed window`});
  const sourceHealth={scheduledRuns:runs.length,completedRuns:runs.filter(run=>run.finished_at && !run.error).length,
    failedRuns:runs.filter(run=>run.error).length,maxFeedAgeMs:ages.length?Math.max(...ages):null,
    providerRequests:runs.reduce((sum,run)=>sum+Number(run.provider_requests || 0),0),
    runErrors:runs.filter(run=>run.error).map(run=>({at:run.started_at,error:run.error})),
    providerAndSportFindings:globalFindings,
    onDemandTimelineReads:timelineCost,
    onDemandInputReads:{projectedBytes:inputBudget.projectedBytes,projectedByteBudget:inputBudget.byteLimit,
      auditObservationProjectedBytes:inputBudget.auditProjectedBytes,scoringSnapshotProjectedBytes:snapshotBudget.projectedBytes,
      retrospectiveEventProjectedBytes:inputBudget.retrospectiveEventProjectedBytes,
      trajectoryProjectedBytes,diagnosticProjectedBytes:inputBudget.projectedBytes-trajectoryProjectedBytes-inputBudget.retrospectiveEventProjectedBytes,
      auditObservationQueries:inputBudget.auditQueries,auditObservationReadRows:inputBudget.auditReadRows,auditObservationPageSize:100,
      trajectoryStatisticsQueries:inputBudget.statisticsQueries,
      scope:'All lightweight audit and scoring-snapshot trajectories are read before bounded flagged diagnostic details or cached provider events. Unchanged shared byte and snapshot-read budgets; per-game caps use full-span sampling with explicit incomplete coverage. Original D1 rows remain unchanged'},
    onDemandSnapshotReads:{queries:snapshotBudget.queries,rows:snapshotBudget.rows,rowBudget:20000,perGameRowBudget:2000,
      projectedBytes:snapshotBudget.projectedBytes,projectedByteBudget:inputBudget.byteLimit,byteBudgetScope:'shared with audit observations',perGameProjectedByteBudget:snapshotBudget.perGameByteLimit,
      scheduledQueriesAdded:0,storageRowsAdded:0,providerRequestsAdded:0}};
  // Observations, projected snapshots, findings and cached reviews are scrubbed
  // at their input boundaries. Do not clone the whole archive a second time:
  // that retains two complete trajectory graphs until the request returns.
  const data={metadata:{schemaVersion:3,auditVersion:AUDIT_VERSION,auditScopeVersion:AUDIT_SCOPE_VERSION,generatedAt:new Date(now).toISOString(),
    slateDateNewYork:date,timeZone:'America/New_York',auditSports:AUDIT_SPORTS,scoringModelVersions,totalScans:runIds.size,
    gamesMonitored:games.length,findingsCount:findings.length,
    integrityFailures:findings.filter(f=>f.classification==='confirmed_integrity_failure').length,
    heuristicConcerns:findings.filter(f=>f.classification==='heuristic_concern').length,
    missingObservationIntervals:missingIntervals,complete:!coverageGaps.length,
    trajectoryCoverageComplete:games.every(g=>g.observationCoverage.complete&&g.snapshotCoverage.complete&&g.snapshotCoverage.rows>0),
    diagnosticDetailCoverageComplete:games.every(g=>g.diagnosticDetailCoverage.audit.complete&&g.diagnosticDetailCoverage.snapshots.complete)},
    sourceHealth:scrub(sourceHealth),coverageGaps,games,findings,scoringQuality:buildScoringQuality(games)};
  data.scoringQuality.historicalFindingReview=scrub(reviewHistoricalFindings(data));
  data.metadata.integrityFailureCountScope='Original recorded finding classifications; current historical review is reported separately and never rewrites D1';
  data.metadata.currentConfirmedIntegrityFailures=data.scoringQuality.historicalFindingReview.filter(r=>r.classification==='confirmed_defect').length;
  data.metadata.currentAuditCollectionErrors=data.scoringQuality.historicalFindingReview.filter(r=>r.classification==='audit_collection_error').length;
  // Analysis uses the bounded diagnostic projection above. Once that finishes,
  // release duplicate per-snapshot telemetry: the archive retains every selected
  // lightweight rating and exact D1 reference, plus detail for investigated changes.
  for(const game of games)game.retainedScoringObservations=game.retainedScoringObservations.map(archiveSnapshot);
  data.metadata.retainedSnapshotProjection={
    scope:'Every included snapshot keeps identity, refresh bucket, row model, rating, score, period, clock, lifecycle and concise scoring diagnostics; this is not a full normalized-state dump',
    analysis:'Lightweight trajectories retain scalar rating ledgers and situation flags. Detailed factors, aggregation, history allocation and gates/caps are read only at flagged observations and major-change/85-crossing endpoints within diagnosticDetailCoverage',
    supportingTelemetry:'Detailed investigated before/after telemetry is in scoringQuality.games[].volatility and recommendations; full raw normalized_state remains in the referenced sports_snapshots row while retained',
    limits:'Read rows are bounded by per-game and export row/byte budgets. Any full-span sampling is explicit in snapshotCoverage and coverageGaps; no rating row is removed by archive compaction. Complete lightweight trajectory coverage does not imply complete contextual or diagnostic detail'};
  return {data,summary:renderSummary(data)};
}

export function qualitySummary(q){
  const fmt=v=>v===null||v===undefined?'unavailable':typeof v==='number'?String(Math.round(v*10)/10):markdownEscape(typeof v==='object'?JSON.stringify(v):v);
  const when=isoTimestamp;
  const brief=v=>{const text=fmt(v);return text.length>200?text.slice(0,200)+'... (full evidence in findings.json)':text;};
  const eventPriority=e=>Number.isFinite(e.eventTimestamp??e.event?.occurredAt)?Number.isFinite(e.change??e.delta??e.ratingChange)?0:1:2;
  const games=q.games||[],recommendations=q.recommendations||[],responses=games.flatMap(g=>(g.eventResponses||[]).map(e=>({...e,gameKey:g.gameKey,modelVersion:g.modelVersion}))).sort((a,b)=>eventPriority(a)-eventPriority(b));
  const lines=['','## Scoring Quality','',
    'Audit-only investigation. A hypothesis is not a verified defect. Live, pregame, decided and completed ratings are assessed separately.',
    '', '### Executive summary','',
    `- Model cohorts: ${(q.modelCohorts||[]).length}; game/model trajectories: ${games.length}; scoring defects confirmed: ${(q.confirmedScoringDefects||[]).length}.`,
    `- Qualitative significance findings: ${(q.qualitativeFindings||[]).length}; definite defects and human-review cases are labeled separately in findings.json.`,
    `- Potential overrating reviews: ${(q.topOverrated||[]).length}; potential underrating reviews: ${(q.topUnderrated||[]).length}; recommended investigations: ${recommendations.length}.`,
    `- Event responses: ${responses.length}; game/model evidence-gap groups: ${(q.missingEvidence||[]).length}.`,
    `- ${fmt(q.methodology?.denominator)}`,
    `- ${fmt(q.methodology?.timeAbove85)}`,
    '- Feed refresh start, snapshot acquisition, audit observation, provider event time and provider publication are different clocks. Missing publication times are never inferred.',
    '', '### Confirmed integrity problems',''];
  if(!(q.integrityProblems||[]).length)lines.push('No deterministic integrity problems in the analyzed observations. This does not prove scoring accuracy.');
  for(const f of q.integrityProblems||[])lines.push(`- ${fmt(f.gameKey)} at ${when(f.observedAt)}: ${fmt(Array.isArray(f.codes)?f.codes.join(', '):f.detail)}. See the matching observation ID in findings.json.`);
  if(q.historicalFindingReview?.length){
    lines.push('','### Historical findings reconsidered','',
      'Original findings remain preserved in findings.json. The updated assessment below is an audit interpretation, not a rewrite of historical records.');
    for(const r of q.historicalFindingReview)lines.push(`- ${fmt(r.gameKey)} / ${fmt(r.reasonCode)}: ${fmt(r.classification)}. ${fmt(r.reason||r.detail)}. Evidence: ${brief(r.supportingObservations||r.observationReferences||r.sourceReference||'See historicalFindingReview in findings.json')}.`);
  }
  lines.push('', '### High-priority scoring-quality concerns','');
  const concerns=recommendations.filter(r=>['confirmed_defect','strong_calibration_concern','calibration_hypothesis'].includes(r.classification));
  const priority=concerns.filter(r=>['critical','high'].includes(r.priority));
  if(!priority.length)lines.push('No critical/high-priority scoring concerns in retained evidence. Medium/low-priority investigations and data limitations remain below.');
  for(const r of priority.slice(0,20))lines.push(`- ${fmt(r.gameKey)} / ${fmt(r.priority)} priority / ${fmt(r.classification)} / ${fmt(r.confidence)} confidence: ${fmt(r.reason||r.whyInvestigate||r.suspectedCause)}.`);
  if(concerns.length>priority.length)lines.push(`${concerns.length-priority.length} additional scoring concerns have medium/low or unassigned priority and remain in Recommended investigations.`);
  for(const [label,items] of [['Potentially overrated games',q.topOverrated||[]],['Potentially underrated games',q.topUnderrated||[]]]){
    lines.push('',`### ${label}`,'');
    if(!items.length)lines.push('No supported candidates in the retained window; coverage may be incomplete.');
    for(const r of items)lines.push(`- **${fmt(r.matchup||r.gameKey)} (${fmt(r.gameKey)})**: ${(r.scores||[]).join('-')}, period ${fmt(r.period)}, clock ${fmt(r.clockSeconds)}s, rating ${fmt(r.rating)}; observed ${when(r.observedAt)}; model ${fmt(r.modelVersion)}. ${fmt(r.classification)}, ${fmt(r.confidence)} confidence. Evidence: ${fmt((r.signals||[]).join('; '))}. Cause: ${fmt(r.suspectedCause)}. Next: ${fmt(r.recommendedCorrection)}. Missing: ${fmt((r.missingEvidence||[]).join('; '))}. Reference: ${fmt(r.observationId||r.sourceReference)}.`);
  }
  lines.push('', '### Significant events and rating responses','',
    'The first observed post-event sample is not necessarily an immediate response. Timing intervals and concurrent events must be reviewed before assigning causality.');
  if(!responses.length)lines.push('No supported event-response measurements in retained evidence.');
  for(const e of responses.slice(0,24))lines.push(`- ${fmt(e.gameKey)} / ${fmt(e.modelVersion)}: ${fmt(e.event?.text||e.event?.type||e.eventType||e.event?.id)}; before ${fmt(e.beforeRating??e.ratingBefore??e.baseline)}, after ${fmt(e.afterRating??e.ratingAfter??e.rating)}, change ${fmt(e.change??e.delta??e.ratingChange)}. ${e.event?.retrospective?'Retrospective later-cache association; historical availability unknown. ':''}${fmt(e.status)}. Timing: ${brief(e.observedInterval??e.responseIntervalMs??e.latency)}. Direction: ${fmt(e.directionAssessment??{expected:e.expectedDirection,consistent:e.directionConsistent,magnitude:e.magnitudeAssessment})}. Sources: ${brief((e.supportingObservations||[]).map(r=>r.referenceId||r.observedAt))}.`);
  if(responses.length>24)lines.push(`Summary displays 24 of ${responses.length}; all responses remain in findings.json.`);
  lines.push('', '### Rating volatility and discontinuities','');
  for(const g of games.filter(g=>g.volatility?.majorChanges?.length))lines.push(`- ${fmt(g.matchup||g.gameKey)} / ${fmt(g.modelVersion)}: maximum observed change ${fmt(g.volatility.maxAbsoluteChange)}; ${g.volatility.majorChanges.length} major changes. First major changes: ${brief(g.volatility.majorChanges.slice(0,3).map(c=>({at:c.to?.observedAt,delta:c.delta,scores:c.after?.scores,clock:c.after?.clockSeconds,reference:c.to?.referenceId})))}. Comeback evidence: ${brief((g.comebackAnalysis||[]).slice(-2).map(c=>({deficit:c.maximumObservedDeficit,recovered:c.deficitRecovered,gameSeconds:c.gameSecondsElapsed,at:c.to?.observedAt})))}. Full change ledger remains in findings.json.`);
  if(!games.some(g=>g.volatility?.majorChanges?.length))lines.push('No major rating changes supported by comparable retained observations.');
  lines.push('', '### Alert usefulness','',
    'Each crossing below is first observed, not the exact real-world crossing. An observation already above a threshold at coverage start is left-censored. Duration is sampled; intermissions, missing observations and clock corrections limit viewing-time conclusions.',
    '', '| Game / model | Threshold | First observed | Game seconds remaining | Episodes | Sampled seconds above | Usefulness |',
    '| --- | ---: | --- | ---: | ---: | ---: | --- |');
  for(const g of games)for(const t of g.thresholds||[])if(t.firstObservedAt!=null)lines.push(`| ${fmt(g.gameKey)} / ${fmt(g.modelVersion)} | ${fmt(t.threshold)} | ${when(t.firstObservedAt)} | ${fmt(t.gameTimeRemainingSeconds)} | ${fmt(t.episodeCount)} | ${fmt(t.estimatedSecondsAbove)} | ${fmt(t.firstCrossingUsefulness)} |`);
  const notReached=games.reduce((n,g)=>n+(g.thresholds||[]).filter(t=>t.firstObservedAt==null).length,0);
  if(notReached)lines.push(`\n${notReached} additional game/model/threshold combinations were not reached in retained coverage. The complete threshold ledger remains in findings.json.`);
  if(!games.some(g=>g.thresholds?.length))lines.push('| No threshold evidence | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable |');
  lines.push('', '### Sport-specific calibration and model-version comparisons','',
    'Cohorts stay separate. One slate cannot establish excess inflation, scarcity or equivalent excitement across sports. Soccer is excluded from all audit operations. Grand Slam tennis requires verified tournament scope.');
  for(const c of q.modelCohorts||[]){
    lines.push('',`#### Model ${fmt(c.modelVersion)}`,'','| Sport | Games with ratings | Reached 70 / 80 / 85 / 90 / 95 (%) | Peak median | Sampled seconds >85 |','| --- | ---: | --- | ---: | ---: |');
    for(const s of c.sports||[])if(s.sport!=='Soccer')lines.push(`| ${fmt(s.displaySport||(s.sport==='NCAAB'?'NCAAM':s.sport))} | ${fmt(s.gamesWithRating)} | ${Object.values(s.percentageReaching||{}).map(fmt).join(' / ')} | ${fmt(s.peakDistribution?.median)} | ${fmt(s.estimatedSecondsAbove85)} |`);
  }
  const retrospectiveResponses=responses.filter(e=>e.event?.retrospective);
  const coverage=q.evidenceCoverage||{};
  lines.push('', '### Evidence coverage and limitations','',
    `- Usable scoring observations: ${fmt(coverage.usableScoringObservations)} / ${fmt(coverage.totalObservations)}. Complete score-progression evidence: ${fmt(coverage.completeScoreProgressionObservations)}.`,
    `- Complete contextual observations: ${fmt(coverage.completeContextualObservations)}. This stricter label requires situation, market and team-quality context; it does not determine whether a retained rating or score progression is usable.`,
    `- Detailed coverage counts: ${fmt(coverage)}`,
    `- Retrospective event associations: ${retrospectiveResponses.length}; with provider event wallclock: ${retrospectiveResponses.filter(e=>Number.isFinite(e.eventTimestamp??e.event?.occurredAt)).length}. Historical observation missing-timestamp counts above are unchanged: later-cache events are separate evidence and never backfill the original observations.`,
    `- Provider-to-publication latency: ${fmt(q.methodology?.providerToPublicationLatency)}`);
  for(const gap of q.missingEvidence||[])lines.push(`- ${fmt(gap.gameKey)} / ${fmt(gap.modelVersion)}: ${fmt(gap.classification)} / ${brief((gap.gaps||[]).join('; '))}.`);
  lines.push('', '### Recommended investigations','');
  if(!recommendations.length)lines.push('No additional supported investigation in the retained window. More complete event and component evidence is required before recommending production scoring changes.');
  if(recommendations.length>12)lines.push(`The summary shows the first 12 of ${recommendations.length} prioritized investigations. All findings and full evidence remain in findings.json.`);
  for(const r of recommendations.slice(0,12)){
    lines.push(`- **${brief(r.gameKey)} / ${brief(r.modelVersion)} / ${brief(r.classification)} / ${brief(r.priority||'unassigned')} priority** at ${when(r.observedAt)}; rating ${brief(r.rating)}.`,
      `  Verified situation: ${brief(r.verifiedSituation??r.situation??r.signals)}. Why investigate: ${brief(r.whyInvestigate??r.reason??r.suspectedCause)}.`,
      `  Components: ${brief(r.scoringComponents??r.components)}. Mechanism: ${brief(r.suspectedCausalMechanism??r.suspectedCause)}.`,
      `  Supporting observations: ${brief(r.supportingObservations??r.sourceReference)}. Comparable situations: ${brief(r.comparableSituations??r.comparisons)}.`,
      `  Evidence gaps: ${brief(r.evidenceGaps??r.missingEvidence)}. Confidence: ${brief(r.confidence)}. User impact: ${brief(r.potentialUserImpact??r.userImpact)}.`,
      `  Proposed investigation: ${brief(r.proposedInvestigation??r.proposedCorrection??r.recommendedCorrection)}. Other scenarios: ${brief(r.expectedEffectsOnOtherScenarios??r.regressionRisks)}. Replay required: ${brief(r.replayTestingRequired??r.replayRequired??r.furtherReplayTestingNecessary)}.`);
  }
  return lines;
}
