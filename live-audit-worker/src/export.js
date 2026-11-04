import {AUDIT_VERSION} from './audit.js';
import {buildScoringQuality} from './quality.js';

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
async function gameObservations(env,date,key) {
  const out=[];let after=-1;
  for(;;) {
    const batch=await rows(env.DB.prepare(`SELECT run_id,game_key,observed_at,slate_date,sport,state_bucket,rating,
      score_a,score_b,period,clock_seconds,evidence FROM live_audit_observations
      WHERE slate_date=? AND game_key=? AND observed_at>? ORDER BY observed_at LIMIT 300`)
      .bind(date,key,after));
    if (!batch.length) break;
    out.push(...batch);after=batch.at(-1).observed_at;
    if (batch.length<300) break;
  }
  return out;
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
async function snapshotContext(env,key,times) {
  const selected=new Map();
  for(const at of [...new Set(times)].sort((a,b)=>a-b)) {
    const batch=await rows(env.DB.prepare(`SELECT game_key,observed_at,state,rating,score_a,score_b,phase,clock,
      normalized_state,model_version FROM sports_snapshots WHERE game_key=? AND observed_at>=? AND observed_at<=?
      ORDER BY observed_at LIMIT 160`).bind(key,at-10*60000,at+10*60000));
    for(const row of batch) selected.set(row.observed_at,compactSnapshot(row));
  }
  const final=await env.DB.prepare(`SELECT game_key,observed_at,state,rating,score_a,score_b,phase,clock,
    normalized_state,model_version FROM sports_snapshots WHERE game_key=? AND state='completed'
    ORDER BY observed_at DESC LIMIT 1`).bind(key).first();
  if(final)selected.set(final.observed_at,compactSnapshot(final));
  return [...selected.values()].sort((a,b)=>a.observedAt-b.observedAt);
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
  for(const finding of data.findings) lines.push(`- **${markdownEscape(finding.severity || 'unknown')} · ${markdownEscape(finding.reasonCode)} · ${markdownEscape(finding.gameKey)}** — ${markdownEscape(finding.classification)}, ${markdownEscape(finding.status)}. ${markdownEscape(finding.detail || '')} First ${new Date(finding.firstSeen).toISOString()}; last ${new Date(finding.lastSeen).toISOString()}.`);
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
  const feedGames=new Map((feed?.games || []).map(game=>[`${game.sport}:${game.id}`,game]));
  const runIds=new Set();let firstAt=Infinity,lastAt=-Infinity,missingIntervals=0;
  for(const key of keys) {
    const raw=await gameObservations(env,date,key),observations=[];
    for(const row of raw) {
      const evidence=parse(row.evidence) || {};
      observations.push(scrub({runId:row.run_id,observedAt:row.observed_at,slateDate:row.slate_date,
        rating:row.rating,ratingChange:observations.length?row.rating-observations.at(-1).rating:null,
        scores:[row.score_a,row.score_b],period:row.period,clockSeconds:row.clock_seconds,
        stateBucket:row.state_bucket,state:evidence.state || null,scoringVersion:evidence.scoringVersion || null,
        auditVersion:evidence.auditVersion || null,feedRevision:evidence.feedRevision || null,
        qualityEvidence:evidence.qualityEvidence || null,
        feedUpdatedAt:evidence.feedUpdatedAt || null,sourceFreshnessMs:evidence.sourceFreshnessMs || null,
        rawInputReferences:evidence.rawInputReferences || [],auditCandidates:evidence.auditCandidates || []}));
      runIds.add(row.run_id);firstAt=Math.min(firstAt,row.observed_at);lastAt=Math.max(lastAt,row.observed_at);
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
    const times=findings.flatMap(f=>[f.firstSeen,f.lastSeen,...f.events.map(e=>e.at)]).filter(Number.isFinite);
    const snapshots=await snapshotContext(env,key,times);
    const scores=observations.map(item=>item.rating).filter(Number.isFinite);
    games.push({gameKey:key,sport:key.split(':')[0],matchup:(state.teams || []).map(team=>team?.[0]).join(' vs ') || key,
      startTime,slateDateNewYork:date,currentState:feedGames.get(key)?.state || 'not in current feed',
      firstObservedAt:first?.observedAt || null,lastObservedAt:observations.at(-1)?.observedAt || null,
      minRating:scores.length?Math.min(...scores):null,maxRating:scores.length?Math.max(...scores):null,
      observations,findings,surroundingScoringSnapshots:snapshots});
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
  const scoringModelVersions=[...new Set([...runs.map(run=>run.model_version),...games.flatMap(game=>game.observations.map(o=>o.scoringVersion))].filter(Boolean))];
  if(runs.some(run=>run.error)) coverageGaps.push({code:'SCAN_FAILURE',detail:`${runs.filter(run=>run.error).length} scheduled audit runs failed during the observed window`});
  const sourceHealth={scheduledRuns:runs.length,completedRuns:runs.filter(run=>run.finished_at && !run.error).length,
    failedRuns:runs.filter(run=>run.error).length,maxFeedAgeMs:ages.length?Math.max(...ages):null,
    providerRequests:runs.reduce((sum,run)=>sum+Number(run.provider_requests || 0),0),
    runErrors:runs.filter(run=>run.error).map(run=>({at:run.started_at,error:run.error})),
    providerAndSportFindings:globalFindings};
  const data=scrub({metadata:{schemaVersion:2,auditVersion:AUDIT_VERSION,generatedAt:new Date(now).toISOString(),
    slateDateNewYork:date,timeZone:'America/New_York',scoringModelVersions,totalScans:runIds.size,
    gamesMonitored:games.length,findingsCount:findings.length,
    integrityFailures:findings.filter(f=>f.classification==='confirmed_integrity_failure').length,
    heuristicConcerns:findings.filter(f=>f.classification==='heuristic_concern').length,
    missingObservationIntervals:missingIntervals,complete:!coverageGaps.length},
    sourceHealth,coverageGaps,games,findings,scoringQuality:buildScoringQuality(games)});
  return {data,summary:renderSummary(data)};
}

export function qualitySummary(q){
  const fmt=v=>v===null||v===undefined?'unavailable':typeof v==='number'?String(Math.round(v*10)/10):markdownEscape(v);
  const lines=['','## Scoring Quality','',
    'Potential outliers require review. Missing evidence is not proof that nothing happened. Ratings and alerts are unchanged.',
    '',`Method: ${q.methodology.denominator}. ${q.methodology.timeAbove85}.`,
    '', '| Sport | Games with ratings | Reached 70 / 80 / 85 / 90 / 95 (%) | Peak median | Estimated seconds >85 |',
    '| --- | ---: | --- | ---: | ---: |'];
  for(const s of q.calibration)lines.push(`| ${s.sport==='NCAAB'?'NCAAM':s.sport} | ${s.gamesWithRating} | ${Object.values(s.percentageReaching).map(fmt).join(' / ')} | ${fmt(s.peakDistribution.median)} | ${fmt(s.estimatedSecondsAbove85)} |`);
  if(q.modelCohorts.length>1)lines.push('','Multiple model versions are present. Compare the separate modelCohorts in findings.json; the overview is not a release baseline.');
  for(const [label,rows] of [['Top 10 potentially overrated games',q.topOverrated],['Top 10 potentially underrated games',q.topUnderrated]]){
    lines.push('',`### ${label}`,'');
    if(!rows.length)lines.push('No supported candidates in the retained window; this does not establish scoring correctness.');
    for(const r of rows)lines.push(`- **${markdownEscape(r.matchup)} (${r.gameKey})**: ${r.scores.join('-')}, period ${r.period}, clock ${fmt(r.clockSeconds)}s, rating ${r.rating}; observed ${r.observedAt===null?'unavailable':new Date(r.observedAt).toISOString()}; model ${markdownEscape(r.modelVersion)}. ${r.classification}, ${r.confidence} confidence. Evidence: ${markdownEscape(r.signals.join('; ')||'wide margin / low comeback feasibility')}. Suspected cause: ${r.suspectedCause}. Correction: ${r.recommendedCorrection}. Missing: ${markdownEscape(r.missingEvidence.join('; '))}. Impact: production 0 rating points / 0 alerts; candidate impact unknown until replay.`);
  }
  lines.push('', '### Evidence and calibration limits','',
    `- Integrity failures: ${q.integrityProblems.length}; game/model evidence-gap groups: ${q.missingEvidence.length}; simultaneous priority conflicts: ${q.simultaneousPriorityConflicts.length}.`,
    '- Full game/model cohorts, decisive moment timestamps and ratings, censored event responses, watchability checks, and significant games never observed at 85 are in findings.json → scoringQuality.',
    '- An equivalent 85 across sports is not established. Retained samples and retrospective archives have different coverage.',
    `- Provider-to-publication latency: ${q.methodology.providerToPublicationLatency}.`);
  return lines;
}
