import {AUDIT_VERSION,auditTimeline} from './audit.js';
import {buildScoringQuality} from './quality.js';
import {reviewHistoricalFindings} from './historical-review.js';
import {extractRetainedProviderEvents} from './evidence.js';

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
    WHERE slate_date IS NOT NULL ORDER BY slate_date DESC LIMIT 30`));
  const unfinished=new Set((feed?.games || []).filter(game=>['live','upcoming'].includes(game.state))
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
      WHERE slate_date=? AND game_key>? ORDER BY game_key LIMIT 100`).bind(date,after));
    if (!batch.length) break;
    out.push(...batch.map(row=>row.game_key));after=batch.at(-1).game_key;
    if (batch.length<100) break;
  }
  return out;
}
const projectedByteLength=value=>new TextEncoder().encode(JSON.stringify(value)).length;
function auditObservation(row,key,previous){
  const evidence=parse(row.evidence) || {};
  return scrub({observationId:`live_audit_observations:${key}:${row.observed_at}`,runId:row.run_id,observedAt:row.observed_at,slateDate:row.slate_date,
    provenance:'scheduled-audit-observation',timestampKind:'audit-observation',
    rating:row.rating,ratingChange:previous&&evidence.scoringVersion&&previous.scoringVersion===evidence.scoringVersion?row.rating-previous.rating:null,
    ratingChangeUnavailableReason:previous&&previous.scoringVersion!==evidence.scoringVersion?'model version boundary':null,
    scores:[row.score_a,row.score_b],period:row.period,clockSeconds:row.clock_seconds,
    stateBucket:row.state_bucket,state:evidence.state || null,scoringVersion:evidence.scoringVersion || null,
    auditVersion:evidence.auditVersion || null,feedRevision:evidence.feedRevision || null,
    qualityEvidence:evidence.qualityEvidence || null,
    comparison:evidence.comparison || null,timelineDiagnostics:evidence.timelineDiagnostics || null,
    modelAttribution:evidence.modelAttribution || null,feedModelVersion:evidence.feedModelVersion || null,
    sourceErrorScope:evidence.sourceErrorScope || null,
    feedUpdatedAt:evidence.feedUpdatedAt ?? null,sourceFreshnessMs:evidence.sourceFreshnessMs ?? null,
    rawInputReferences:evidence.rawInputReferences || [],auditCandidates:evidence.auditCandidates || []});
}
async function gameObservations(env,date,key,budget) {
  const out=[];let after=-1,projectedBytes=0,readRows=0;
  const result=(truncated,nextOmittedAt=null)=>({rows:out,coverage:{rows:out.length,readRows,projectedBytes,truncated,
    lastIncludedAt:out.at(-1)?.observedAt??null,nextOmittedAt,
    detail:truncated?'Combined audit-observation and scoring-snapshot input byte budget reached; later audit rows remain in D1 and this export is incomplete':'All retained audit observations for this game and slate were read'}});
  for(;;) {
    const batch=await rows(env.DB.prepare(`SELECT run_id,game_key,observed_at,slate_date,sport,state_bucket,rating,
      score_a,score_b,period,clock_seconds,evidence FROM live_audit_observations
      WHERE slate_date=? AND game_key=? AND observed_at>? ORDER BY observed_at LIMIT 100`)
      .bind(date,key,after));
    budget.auditQueries++;budget.auditReadRows+=batch.length;readRows+=batch.length;
    if (!batch.length) return result(false);
    for(const row of batch){
      const observation=auditObservation(row,key,out.at(-1)),bytes=projectedByteLength(observation);
      if(budget.projectedBytes+bytes>budget.byteLimit)return result(true,row.observed_at);
      out.push(observation);projectedBytes+=bytes;budget.projectedBytes+=bytes;budget.auditProjectedBytes+=bytes;
    }
    after=batch.at(-1).observed_at;
    if (batch.length<100) return result(false);
  }
}
function compactSnapshot(row) {
  const state=parse(row.normalized_state) || {};
  return scrub({observedAt:row.observed_at,state:row.state,rating:row.rating,
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
  const validState=Boolean(decoded&&typeof decoded==='object'&&!Array.isArray(decoded));
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
    provenance:'retained-scoring-snapshot',timestampKind:'scoring-snapshot-refresh-bucket',rating:row.rating,
    state:{...state,state:row.state},scores:[row.score_a,row.score_b],period:Number(row.phase)||null,clock:row.clock,
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
async function retainedTrajectory(env,key,{from,to,budget,times=[]}) {
  const selected=[],surrounding=[];let after=from-1,exhausted=false,projectedBytes=0,byteLimited=false;
  while(selected.length<2000&&budget.remaining>0&&!byteLimited) {
    const limit=Math.min(200,2000-selected.length,budget.remaining);
    const batch=await rows(env.DB.prepare(`SELECT game_key,observed_at,state,rating,score_a,score_b,phase,clock,
      normalized_state,model_version FROM sports_snapshots WHERE game_key=? AND observed_at>? AND observed_at<=?
      ORDER BY observed_at LIMIT ?`).bind(key,after,to,limit));
    budget.queries++;budget.rows+=batch.length;budget.remaining-=batch.length;
    if(!batch.length){exhausted=true;break;}
    // Project each page before retaining it so full normalized game histories do
    // not accumulate in the Worker alongside the output and quality analysis.
    for(const row of batch){
      const projected=retainedObservation(row),bytes=projectedByteLength(projected);
      if(budget.input.projectedBytes+bytes>budget.input.byteLimit||projectedBytes+bytes>budget.perGameByteLimit){byteLimited=true;break;}
      selected.push(projected);projectedBytes+=bytes;budget.projectedBytes+=bytes;budget.input.projectedBytes+=bytes;
      if(row.state==='completed'||times.some(at=>Math.abs(row.observed_at-at)<=10*60000))surrounding.push(compactSnapshot(row));
    }
    const cursor=Number(batch.at(-1).observed_at);
    if(!Number.isFinite(cursor)||cursor<=after)break;
    after=cursor;
    if(batch.length<limit&&!byteLimited){exhausted=true;break;}
  }
  return {rows:selected,surrounding,coverage:{from,to,rows:selected.length,projectedBytes,truncated:!exhausted,
    detail:!exhausted?`${byteLimited?'Snapshot projected-byte':'Snapshot row'} read budget reached; trajectory may be incomplete`:'All retained snapshots in the bounded game window were read'}};
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
    if(inputBudget.projectedBytes+bytes>inputBudget.byteLimit)break;
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
  return [...map.values()].map(item=>scrub({...item,
    classification:item.deterministic?'confirmed_integrity_failure':'heuristic_concern',
    corroborated:item.deterministic || item.events.some(event=>event.type==='opened')}))
    .sort((a,b)=>(a.firstSeen || 0)-(b.firstSeen || 0));
}
function markdownEscape(value) {return String(value ?? '').replace(/[|\r\n]/g,' ').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
const isoTimestamp=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=8640000000000000?new Date(value).toISOString():'unavailable';
export function renderSummary(data) {
  const m=data.metadata,h=data.sourceHealth;
  const lines=[`# SlateMeter nightly audit — ${m.slateDateNewYork}`,'',
    'This archive is an observation-only audit export for ChatGPT and Codex investigation. Heuristic concerns are review prompts, not verified scoring defects.','',
    `- Generated: ${m.generatedAt}`,
    `- Original slate date: ${m.slateDateNewYork} (America/New_York; games finishing after midnight stay with this date)`,
    `- Audit version: ${m.auditVersion}`,
    `- Scoring model versions: ${m.scoringModelVersions.join(', ') || 'unavailable'}`,
    `- Games monitored: ${m.gamesMonitored}`,
    `- Slate scans with game observations: ${m.totalScans}`,
    `- Scheduled runs in observed window: ${h.scheduledRuns}`,
    `- Findings: ${m.findingsCount} (${m.integrityFailures} deterministic integrity failures, ${m.heuristicConcerns} heuristic concerns)`,
    `- Missing observation intervals: ${m.missingObservationIntervals}`,
    `- Coverage gaps: ${data.coverageGaps.length}`,'',
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
  for(const finding of data.findings) lines.push(`- **${markdownEscape(finding.severity || 'unknown')} · ${markdownEscape(finding.reasonCode)} · ${markdownEscape(finding.gameKey)}** — ${markdownEscape(finding.classification)}, ${markdownEscape(finding.status)}. ${markdownEscape(finding.detail || '')} First ${isoTimestamp(finding.firstSeen)}; last ${isoTimestamp(finding.lastSeen)}.`);
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
  const inputBudget={projectedBytes:0,byteLimit:36*1024*1024,auditProjectedBytes:0,retrospectiveEventProjectedBytes:0,auditQueries:0,auditReadRows:0};
  const snapshotBudget={remaining:20000,rows:0,queries:0,projectedBytes:0,input:inputBudget,perGameByteLimit:8*1024*1024};
  const timelineCost={queries:0,bytes:0};
  const feedGames=new Map((feed?.games || []).map(game=>[`${game.sport}:${game.id}`,game]));
  const runIds=new Set();let firstAt=Infinity,lastAt=-Infinity,missingIntervals=0;
  for(const key of keys) {
    const audit=await gameObservations(env,date,key,inputBudget),observations=audit.rows;
    if(audit.coverage.truncated)coverageGaps.push({gameKey:key,code:'AUDIT_OBSERVATION_READ_LIMIT',
      from:audit.coverage.nextOmittedAt,detail:audit.coverage.detail});
    for(const observation of observations) {
      runIds.add(observation.runId);firstAt=Math.min(firstAt,observation.observedAt);lastAt=Math.max(lastAt,observation.observedAt);
    }
    for(let i=1;i<observations.length;i++) if(observations[i].observedAt-observations[i-1].observedAt>6*60000) {
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
    const retainedTimelineReview=await retainedTimeline(env,key,observations,timelineCost,now,inputBudget);
    if(retainedTimelineReview.eventCoverage?.truncated)coverageGaps.push({gameKey:key,code:'RETAINED_EVENT_PROJECTION_LIMIT',
      detail:retainedTimelineReview.eventCoverage.omittedByInputBudget?'Shared projected input byte budget omitted later provider events; source summary remains in D1':'Retrospective provider events capped at 200 per game; source summary remains in D1'});
    const times=findings.flatMap(f=>[f.firstSeen,f.lastSeen,...f.events.map(e=>e.at)]).filter(Number.isFinite);
    const startMs=Date.parse(startTime||'');
    const from=Math.min(first?.observedAt??midnightNY(date),Number.isFinite(startMs)?startMs:midnightNY(date))-6*3600000;
    const to=Math.min(now,Math.max(observations.at(-1)?.observedAt??from,Number.isFinite(startMs)?startMs:from)+12*3600000);
    const trajectory=await retainedTrajectory(env,key,{from,to,budget:snapshotBudget,times});
    if(trajectory.coverage.truncated)coverageGaps.push({gameKey:key,code:'SNAPSHOT_READ_LIMIT',detail:trajectory.coverage.detail});
    if(!trajectory.rows.length&&!trajectory.coverage.truncated)coverageGaps.push({gameKey:key,code:'RETAINED_SNAPSHOTS_UNAVAILABLE',detail:'No scoring snapshots remain in the bounded game window; observation gaps cannot be reconstructed'});
    const snapshots=trajectory.surrounding;
    const scores=observations.map(item=>item.rating).filter(Number.isFinite);
    games.push({gameKey:key,sport:key.split(':')[0],matchup:(state.teams || []).map(team=>team?.[0]).join(' vs ') || key,
      startTime,slateDateNewYork:date,currentState:feedGames.get(key)?.state || 'not in current feed',
      firstObservedAt:first?.observedAt || null,lastObservedAt:observations.at(-1)?.observedAt || null,
      minRating:scores.length?Math.min(...scores):null,maxRating:scores.length?Math.max(...scores):null,
      observations,observationCoverage:audit.coverage,findings,surroundingScoringSnapshots:snapshots,
      retainedScoringObservations:trajectory.rows,snapshotCoverage:trajectory.coverage,retainedTimelineReview,
      retainedProviderEvents:retainedTimelineReview.retrospectiveEvents,
      retainedProviderEventCoverage:retainedTimelineReview.eventCoverage});
  }
  if(!keys.length)coverageGaps.push({code:'NO_LIVE_OBSERVATIONS',detail:'No live games were monitored for this original New York slate date'});
  const start=Number.isFinite(firstAt)?firstAt-180000:midnightNY(date),
    end=Number.isFinite(lastAt)?lastAt+180000:midnightNY(nextDay(date));
  const runs=await rows(env.DB.prepare('SELECT * FROM live_audit_runs WHERE started_at>=? AND started_at<=? ORDER BY started_at LIMIT 1000').bind(start,end));
  const ages=runs.map(run=>run.feed_updated_at?run.started_at-run.feed_updated_at:null).filter(Number.isFinite);
  const globalRows=await rows(env.DB.prepare(`SELECT * FROM live_audit_findings
    WHERE game_key='feed' OR game_key LIKE 'sport:%'`));
  const globalEvents=await rows(env.DB.prepare(`SELECT * FROM live_audit_events WHERE at>=? AND at<=?
    AND (game_key='feed' OR game_key LIKE 'sport:%') ORDER BY at`).bind(start,end));
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
      auditObservationQueries:inputBudget.auditQueries,auditObservationReadRows:inputBudget.auditReadRows,auditObservationPageSize:100,
      scope:'Shared projected input budget across audit observations, retained scoring snapshots and retrospective provider events; original D1 rows remain unchanged'},
    onDemandSnapshotReads:{queries:snapshotBudget.queries,rows:snapshotBudget.rows,rowBudget:20000,perGameRowBudget:2000,
      projectedBytes:snapshotBudget.projectedBytes,projectedByteBudget:inputBudget.byteLimit,byteBudgetScope:'shared with audit observations',perGameProjectedByteBudget:snapshotBudget.perGameByteLimit,
      scheduledQueriesAdded:0,storageRowsAdded:0,providerRequestsAdded:0}};
  // Observations, projected snapshots, findings and cached reviews are scrubbed
  // at their input boundaries. Do not clone the whole archive a second time:
  // that retains two complete trajectory graphs until the request returns.
  const data={metadata:{schemaVersion:3,auditVersion:AUDIT_VERSION,generatedAt:new Date(now).toISOString(),
    slateDateNewYork:date,timeZone:'America/New_York',scoringModelVersions,totalScans:runIds.size,
    gamesMonitored:games.length,findingsCount:findings.length,
    integrityFailures:findings.filter(f=>f.classification==='confirmed_integrity_failure').length,
    heuristicConcerns:findings.filter(f=>f.classification==='heuristic_concern').length,
    missingObservationIntervals:missingIntervals,complete:!coverageGaps.length},
    sourceHealth:scrub(sourceHealth),coverageGaps,games,findings,scoringQuality:buildScoringQuality(games)};
  data.scoringQuality.historicalFindingReview=scrub(reviewHistoricalFindings(data));
  // Analysis uses the bounded diagnostic projection above. Once that finishes,
  // release duplicate per-snapshot telemetry: the archive retains every read
  // rating and exact D1 reference, plus detailed telemetry for investigated changes.
  for(const game of games)game.retainedScoringObservations=game.retainedScoringObservations.map(archiveSnapshot);
  data.metadata.retainedSnapshotProjection={
    scope:'Every read snapshot keeps identity, refresh bucket, row model, rating, score, period, clock, lifecycle and concise scoring diagnostics; this is not a full normalized-state dump',
    analysis:'Quality analysis runs before archive compaction using retained factors, aggregation, manpower/overtime, history recovery/allocation and trajectory gates/caps',
    supportingTelemetry:'Detailed investigated before/after telemetry is in scoringQuality.games[].volatility and recommendations; full raw normalized_state remains in the referenced sports_snapshots row while retained',
    limits:'Read rows are bounded by per-game and export row/byte budgets. Any truncation is explicit in snapshotCoverage and coverageGaps; no rating row is removed by archive compaction'};
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
  const priority=recommendations.filter(r=>['confirmed_defect','strong_calibration_concern','calibration_hypothesis'].includes(r.classification));
  if(!priority.length)lines.push('No evidence-supported high-priority scoring change. Investigations and data limitations remain below.');
  for(const r of priority.slice(0,20))lines.push(`- ${fmt(r.gameKey)} / ${fmt(r.classification)} / ${fmt(r.confidence)} confidence: ${fmt(r.reason||r.whyInvestigate||r.suspectedCause)}.`);
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
    'Cohorts stay separate. One slate cannot establish excess inflation, scarcity or equivalent excitement across sports. Hidden soccer does not drive public calibration recommendations. Grand Slam tennis requires verified tournament scope.');
  for(const c of q.modelCohorts||[]){
    lines.push('',`#### Model ${fmt(c.modelVersion)}`,'','| Sport | Games with ratings | Reached 70 / 80 / 85 / 90 / 95 (%) | Peak median | Sampled seconds >85 |','| --- | ---: | --- | ---: | ---: |');
    for(const s of c.sports||[])if(s.sport!=='Soccer')lines.push(`| ${fmt(s.displaySport||(s.sport==='NCAAB'?'NCAAM':s.sport))} | ${fmt(s.gamesWithRating)} | ${Object.values(s.percentageReaching||{}).map(fmt).join(' / ')} | ${fmt(s.peakDistribution?.median)} | ${fmt(s.estimatedSecondsAbove85)} |`);
  }
  const retrospectiveResponses=responses.filter(e=>e.event?.retrospective);
  lines.push('', '### Evidence coverage and limitations','',`- Coverage: ${fmt(q.evidenceCoverage)}`,
    `- Retrospective event associations: ${retrospectiveResponses.length}; with provider event wallclock: ${retrospectiveResponses.filter(e=>Number.isFinite(e.eventTimestamp??e.event?.occurredAt)).length}. Historical observation missing-timestamp counts above are unchanged: later-cache events are separate evidence and never backfill the original observations.`,
    `- Provider-to-publication latency: ${fmt(q.methodology?.providerToPublicationLatency)}`);
  for(const gap of q.missingEvidence||[])lines.push(`- ${fmt(gap.gameKey)} / ${fmt(gap.modelVersion)}: ${fmt(gap.classification)} / ${brief((gap.gaps||[]).join('; '))}.`);
  lines.push('', '### Recommended investigations','');
  if(!recommendations.length)lines.push('No additional supported investigation in the retained window. More complete event and component evidence is required before recommending production scoring changes.');
  if(recommendations.length>12)lines.push(`The summary shows the first 12 of ${recommendations.length} prioritized investigations. All findings and full evidence remain in findings.json.`);
  for(const r of recommendations.slice(0,12)){
    lines.push(`- **${brief(r.gameKey)} / ${brief(r.modelVersion)} / ${brief(r.classification)}** at ${when(r.observedAt)}; rating ${brief(r.rating)}.`,
      `  Verified situation: ${brief(r.verifiedSituation??r.situation??r.signals)}. Why investigate: ${brief(r.whyInvestigate??r.reason??r.suspectedCause)}.`,
      `  Components: ${brief(r.scoringComponents??r.components)}. Mechanism: ${brief(r.suspectedCausalMechanism??r.suspectedCause)}.`,
      `  Supporting observations: ${brief(r.supportingObservations??r.sourceReference)}. Comparable situations: ${brief(r.comparableSituations??r.comparisons)}.`,
      `  Evidence gaps: ${brief(r.evidenceGaps??r.missingEvidence)}. Confidence: ${brief(r.confidence)}. User impact: ${brief(r.potentialUserImpact??r.userImpact)}.`,
      `  Proposed investigation: ${brief(r.proposedInvestigation??r.proposedCorrection??r.recommendedCorrection)}. Other scenarios: ${brief(r.expectedEffectsOnOtherScenarios??r.regressionRisks)}. Replay required: ${brief(r.replayTestingRequired??r.replayRequired??r.furtherReplayTestingNecessary)}.`);
  }
  return lines;
}
