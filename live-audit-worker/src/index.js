import {auditGame,gameState,stateBucket,SPORTS,AUDIT_VERSION} from './audit.js';
import {dashboardHtml,loginHtml} from './dashboard.js';
import dashboardClient from './dashboard-client.generated.js';
import {buildNightlyExport,defaultSlateDate,slateDateNY} from './export.js';
import {zipEntriesStream,jsonTextChunks} from './zip.js';
import {captureQualityEvidence} from './quality.js';
import {auditQualitativeContext} from './qualitative-quality.js';
import {classifySourceErrors} from './comparison.js';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const streamedJson=body=>{
  const iterator=jsonTextChunks(body);
  const stream=new ReadableStream({pull(controller){const next=iterator.next();if(next.done)controller.close();else controller.enqueue(new TextEncoder().encode(next.value));},cancel(){iterator.return?.();}});
  return new Response(stream,{headers:{'content-type':'application/json','cache-control':'no-store'}});
};
const dateOnly=value=>/^\d{4}-\d{2}-\d{2}$/.test(value || '') &&
  !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
function newYorkMidnight(date) {
  const noon=Date.parse(`${date}T12:00:00Z`);
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(noon));
  return Date.parse(`${date}T00:00:00Z`)-(hour-12)*3600000;
}
const html=(body,status=200,headers={})=>new Response(body,{status,headers:{'content-type':'text/html; charset=utf-8',
  'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'",...headers}});
const bytes=value=>new TextEncoder().encode(value);
const hex=buffer=>[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
async function signature(secret,payload) {
  const key=await crypto.subtle.importKey('raw',bytes(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',key,bytes(payload)));
}
function equal(a,b) {
  if (a.length!==b.length) return false;
  let mismatch=0;for(let i=0;i<a.length;i++) mismatch|=a.charCodeAt(i)^b.charCodeAt(i);
  return mismatch===0;
}
async function authorized(request,env) {
  if (!env.AUDIT_READ_TOKEN) return false;
  if (equal(request.headers.get('Authorization') || '',`Bearer ${env.AUDIT_READ_TOKEN}`)) return true;
  const value=/(?:^|;\s*)slatemeter_audit=([^;]+)/.exec(request.headers.get('Cookie') || '')?.[1] || '';
  const [version,at,sig]=value.split('.');
  if (version!=='v1' || !/^\d{13}$/.test(at) || !/^[a-f0-9]{64}$/.test(sig || '') ||
      Date.now()-Number(at)>43200000 || Number(at)>Date.now()+30000) return false;
  return equal(sig,await signature(env.AUDIT_READ_TOKEN,`v1.${at}`));
}
const rows=async statement=>(await statement.all()).results || [];
const compact=game=>({id:game.id,sport:game.sport,state:game.state,score:game.score,
  baseScore:game.baseScore,openingScore:game.openingScore,teams:game.teams,startTime:game.startTime,
  context:game.context,line:game.line,why:game.why,moment:game.moment,momentumText:game.momentumText,
  upsetText:game.upsetText,factors:game.factors,detailStale:game.detailStale,
  qualitativeContexts:game.qualitativeContexts,pregameContextSummary:game.pregameContextSummary,
  pregameMarketQuote:game.pregameMarketQuote?{raw:{lastUpdated:game.pregameMarketQuote.raw?.lastUpdated,lastModified:game.pregameMarketQuote.raw?.lastModified}}:undefined,
  footballSituation:game.footballSituation,baseballSituation:game.baseballSituation,
  liveRawStatus:game.liveRawStatus,live:game.live,status:game.status,
  modelVersion:game.modelVersion,evidenceQuality:game.evidenceQuality,evidenceReasons:game.evidenceReasons,
  evidenceCoverage:game.evidenceCoverage,scoringPartial:game.scoringPartial,
  timingUncertain:game.timingUncertain,liveUpdateRejected:game.liveUpdateRejected,basketballUpdateRejected:game.basketballUpdateRejected,
  summaryLifecycleRejected:game.summaryLifecycleRejected,scoringHistoryRejected:game.scoringHistoryRejected,
  trajectoryScoring:game.trajectoryScoring,historyOwnership:game.historyOwnership,momentumPoints:game.momentumPoints,
  liveRawSituation:game.liveRawSituation,liveUpset:game.liveUpset,liveSurprise:game.liveSurprise,
  sourceCompetition:game.sourceCompetition?{format:game.sourceCompetition.format}:undefined});
const blob=value=>JSON.stringify(value);
async function feedFromD1(env) {
  const row=await env.DB.prepare('SELECT payload FROM sports_feed WHERE id=1').first();
  if (!row) return null;
  const feed=JSON.parse(row.payload);
  if (feed.revision) {
    const parts=await rows(env.DB.prepare('SELECT payload FROM sports_feed_parts WHERE revision=? ORDER BY part').bind(feed.revision));
    if (parts.length!==feed.parts) throw new Error('Incomplete canonical feed parts');
    feed.games=parts.flatMap(part=>JSON.parse(part.payload));
  }
  return feed;
}
function cachedNhlCrosschecks(resources,game,now) {
  const away=String(game.teams?.[0]?.[1] || ''),home=String(game.teams?.[1]?.[1] || '');
  const match=resources.find(row=>{
    const p=row.parsed;
    return p?.awayTeam?.abbrev===away && p?.homeTeam?.abbrev===home &&
      Math.abs(Date.parse(p.startTimeUTC || p.gameDate || game.startTime)-Date.parse(game.startTime))<6*3600000;
  });
  return match ? {scores:[Number(match.parsed.awayTeam.score),Number(match.parsed.homeTeam.score)],
    ageMs:now-match.updated_at,source:match.key} : null;
}
function watchCandidate(code,observed,expected,detail,layer='provider data') {
  return {reasonCode:code,severity:'high',confidence:.88,failureLayer:layer,observed,expected,detail,deterministic:false};
}
async function applyFindings(env,candidates,active,now,scannedKeys) {
  const writes=[],events=[];
  const seen=new Set();
  for (const {gameKey,finding,evidence} of candidates) {
    const id=`${gameKey}|${finding.reasonCode}`; if (seen.has(id)) continue; seen.add(id);
    const prior=active.get(id), consecutive=prior && prior.status!=='recovered' ? prior.consecutive+1 : 1;
    const status=finding.deterministic || consecutive>=2?'open':'watch';
    const item={...finding,...evidence,affectedGames:evidence.affectedGames || [gameKey],likelyFailureLayer:finding.failureLayer};
    writes.push(env.DB.prepare(`INSERT INTO live_audit_findings
      (game_key,reason_code,first_seen,last_seen,resolved_at,status,consecutive,severity,confidence,failure_layer,evidence)
      VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(game_key,reason_code) DO UPDATE SET
      first_seen=CASE WHEN live_audit_findings.status='recovered' THEN excluded.first_seen ELSE live_audit_findings.first_seen END,
      last_seen=excluded.last_seen,resolved_at=NULL,status=excluded.status,consecutive=excluded.consecutive,
      severity=excluded.severity,confidence=excluded.confidence,failure_layer=excluded.failure_layer,evidence=excluded.evidence`)
      .bind(gameKey,finding.reasonCode,now,now,null,status,consecutive,finding.severity,finding.confidence,finding.failureLayer,blob(item)));
    if (status==='open' && prior?.status!=='open') events.push({gameKey,reasonCode:finding.reasonCode,event:'opened',evidence:item});
  }
  for (const [id,prior] of active) {
    if (seen.has(id) || !scannedKeys.has(prior.game_key)) continue;
    if (prior.status==='open' && prior.consecutive>0) {
      // One clean scan starts recovery; the next confirms it.
      writes.push(env.DB.prepare("UPDATE live_audit_findings SET status='recovering',consecutive=0,last_seen=? WHERE game_key=? AND reason_code=?")
        .bind(now,prior.game_key,prior.reason_code));
    } else {
      writes.push(env.DB.prepare("UPDATE live_audit_findings SET status='recovered',resolved_at=?,last_seen=?,consecutive=0 WHERE game_key=? AND reason_code=?")
        .bind(now,now,prior.game_key,prior.reason_code));
      if (prior.status==='recovering') events.push({gameKey:prior.game_key,reasonCode:prior.reason_code,event:'recovered',evidence:JSON.parse(prior.evidence)});
    }
  }
  for (const event of events) writes.push(env.DB.prepare('INSERT INTO live_audit_events(at,game_key,reason_code,event,evidence) VALUES (?,?,?,?,?)')
    .bind(now,event.gameKey,event.reasonCode,event.event,blob(event.evidence)));
  for (let i=0;i<writes.length;i+=50) await env.DB.batch(writes.slice(i,i+50));
  return {writes:writes.length,events};
}
export async function scan(env,now=Date.now()) {
  const started=now;
  const inserted=await env.DB.prepare('INSERT INTO live_audit_runs(started_at) VALUES (?)').bind(started).run();
  const runId=inserted.meta.last_row_id;
  try {
    const feed=await feedFromD1(env), feedAt=Date.parse(feed?.updatedAt || ''),age=now-feedAt;
    const games=(feed?.games || []).filter(game=>game?.state==='live' && SPORTS.has(game.sport));
    const active=new Map((await rows(env.DB.prepare("SELECT * FROM live_audit_findings WHERE status!='recovered' LIMIT 2000")))
      .map(row=>[`${row.game_key}|${row.reason_code}`,row]));
    const nhlResources=games.some(game=>game.sport==='NHL') ?
      (await rows(env.DB.prepare("SELECT key,payload,updated_at FROM sports_resources WHERE updated_at>? AND key LIKE '%/gamecenter/%/play-by-play' LIMIT 40")
        .bind(now-120000))).map(row=>{try{return {...row,parsed:JSON.parse(row.payload)}}catch{return row}}) : [];
    const candidates=[],observations=[],scannedKeys=new Set(['feed']);
    let checks=0;
    // Reuse the feed already read by this scan. Only findings are written;
    // pregame games do not enter live observations or calibration cohorts.
    for(const game of (feed?.games||[]).filter(g=>['upcoming','live'].includes(g.state)&&SPORTS.has(g.sport))){
      const result=auditQualitativeContext(game),key=`${game.sport}:${game.id}`;
      scannedKeys.add(key);checks+=result.checks;
      for(const finding of result.findings)candidates.push({gameKey:key,finding,evidence:{state:compact(game),scoringVersion:game.modelVersion||feed.modelVersion,feedRevision:feed.revision,rawInputReferences:['sports_feed:1'],classification:finding.classification}});
    }
    if (games.length && (!feed || !Number.isFinite(feedAt) || age>540000))
      candidates.push({gameKey:'feed',finding:watchCandidate('FEED_STALE',{updatedAt:feed?.updatedAt || null,ageMs:age},
        'canonical feed refreshed within 9 minutes','Source publication is delayed'),
        evidence:{scoringVersion:feed?.modelVersion || null,rawInputReferences:['sports_feed:1']}});
    const sourceErrorAssessment=classifySourceErrors(feed?.sourceErrors||[],feed?.games||[]);
    if (games.length && (sourceErrorAssessment.active.length||sourceErrorAssessment.unknown.length))
      candidates.push({gameKey:'feed',finding:{...watchCandidate('SOURCE_ERRORS',{
        count:sourceErrorAssessment.total,active:sourceErrorAssessment.active.length,inactive:sourceErrorAssessment.inactive.length,
        unknown:sourceErrorAssessment.unknown.length},'active game sources available',
        sourceErrorAssessment.active.length?'Provider failures reference active games; check stale/recovered evidence':'Provider failures have unverified active-game relevance'),
        severity:sourceErrorAssessment.active.length?'high':'low',classification:sourceErrorAssessment.classification},
        evidence:{scoringVersion:feed.modelVersion,affectedGames:sourceErrorAssessment.activeGames,
          rawInputReferences:[...sourceErrorAssessment.active,...sourceErrorAssessment.unknown].slice(0,12),sourceErrorAssessment}});
    checks+=2;
    const peerCache=new Map();
    for (const game of games) {
      const key=`${game.sport}:${game.id}`, state=gameState(game),bucket=stateBucket(state);
      scannedKeys.add(key);
      const priorAudit=await env.DB.prepare(`SELECT observed_at,rating,evidence FROM live_audit_observations
        WHERE game_key=? ORDER BY observed_at DESC LIMIT 1`).bind(key).first();
      const snapshot=await env.DB.prepare(`SELECT observed_at,state,normalized_state,model_version FROM sports_snapshots
        WHERE game_key=? AND observed_at<? ORDER BY observed_at DESC LIMIT 1`)
        .bind(key,feedAt-30000).first();
      const prior=priorAudit && priorAudit.observed_at>=Number(snapshot?.observed_at || 0) ?
        {observed_at:priorAudit.observed_at,state:'live',model_version:JSON.parse(priorAudit.evidence).scoringVersion,
          normalized_state:JSON.stringify(JSON.parse(priorAudit.evidence).state)} : snapshot;
      if (!peerCache.has(`${game.sport}|${bucket}`)) {
        const samples=await rows(env.DB.prepare(`SELECT game_key,rating,sport,period,clock_seconds,score_a,score_b,observed_at,evidence FROM live_audit_observations WHERE sport=? AND state_bucket=?
          AND observed_at>? ORDER BY observed_at DESC LIMIT 100`)
          .bind(game.sport,bucket,now-7*86400000));
        peerCache.set(`${game.sport}|${bucket}`,samples);
      }
      const cross=cachedNhlCrosschecks(nhlResources,game,now);
      const peers=peerCache.get(`${game.sport}|${bucket}`).filter(row=>row.game_key!==key);
      const summaryKey=game.providerPath?`https://site.api.espn.com/apis/site/v2/sports/${game.providerPath}/summary?event=${encodeURIComponent(game.id)}`:null;
      const summaryRow=summaryKey?await env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(summaryKey).first():null;
      let summary=null;
      try { if (summaryRow && now-summaryRow.updated_at<180000) summary=JSON.parse(summaryRow.payload); } catch {}
      const scoringVersion=game.modelVersion||feed?.modelVersion||null;
      const result=auditGame({...game,modelVersion:scoringVersion},prior?[prior]:[],peers,now,cross,summary);
      checks+=result.checks;
      const evidence={at:now,state:compact(game),auditVersion:AUDIT_VERSION,
        qualityEvidence:captureQualityEvidence(game,{publishedAt:feedAt,observedAt:now,summary,summaryUpdatedAt:summaryRow?.updated_at,
          calculation:feed?.scoreCalculations?.[key],modelVersion:scoringVersion}),
        scoringVersion,modelAttribution:game.modelVersion?'canonical-game':'canonical-feed-fallback',
        feedModelVersion:feed?.modelVersion||null,
        comparison:result.comparison,timelineDiagnostics:result.timelineDiagnostics,
        sourceErrorScope:{active:sourceErrorAssessment.active.length,inactive:sourceErrorAssessment.inactive.length,unknown:sourceErrorAssessment.unknown.length},
        feedRevision:String(feed?.revision || feedAt),feedUpdatedAt:feed?.updatedAt || null,
        sourceFreshnessMs:age,rawInputReferences:[result.rawRef,...(summaryRow?[{source:summaryKey,updatedAt:summaryRow.updated_at}]:[]),
          ...(cross?[{source:cross.source,ageMs:cross.ageMs}]:[])],auditCandidates:result.findings};
      observations.push(env.DB.prepare(`INSERT INTO live_audit_observations
        (run_id,game_key,observed_at,slate_date,sport,state_bucket,rating,score_a,score_b,period,clock_seconds,evidence)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(runId,key,now,slateDateNY(game.startTime) || slateDateNY(now),game.sport,bucket,
          state.rating,state.scores[0],state.scores[1],state.period,state.clock,blob(evidence)));
      for (const finding of result.findings) candidates.push({gameKey:key,finding,evidence});
      if (game.detailStale || age>180000) candidates.push({gameKey:key,
        finding:watchCandidate('GAME_SOURCE_STALE',{detailStale:game.detailStale,feedAgeMs:age},
          'fresh canonical game and summary','Live source data is stale'),evidence});
    }
    for (const sport of SPORTS) {
      scannedKeys.add(`sport:${sport}`);
      const group=candidates.filter(item=>item.finding.reasonCode==='LATE_WIDE_MARGIN_HIGH' && item.evidence.state.sport===sport);
      if (group.length>=3) candidates.push({gameKey:`sport:${sport}`,
        finding:{reasonCode:'SPORT_WIDE_MARGIN_BIAS',severity:'medium',confidence:.7,failureLayer:'scoring model',
          observed:{gameCount:group.length,ratings:group.map(item=>item.evidence.state.score)},
          expected:'review comparable late wide-margin games and stakes',
          detail:'Several live games in this sport show the same high-rating pattern',deterministic:false},
        evidence:{scoringVersion:feed.modelVersion,affectedGames:group.map(item=>item.gameKey),rawInputReferences:group.map(item=>item.evidence.rawInputReferences[0])}});
    }
    for (let i=0;i<observations.length;i+=50) await env.DB.batch(observations.slice(i,i+50));
    const applied=await applyFindings(env,candidates,active,now,scannedKeys);
    const flagged=new Set(candidates.flatMap(x=>x.gameKey.startsWith('sport:') ? x.evidence.affectedGames || [] :
      x.gameKey==='feed' ? [] : [x.gameKey]));
    const writes=1+observations.length+applied.writes+1;
    await env.DB.prepare(`UPDATE live_audit_runs SET finished_at=?,feed_updated_at=?,feed_revision=?,model_version=?,
      games_checked=?,checks_completed=?,clean_games=?,flagged_games=?,provider_requests=0,storage_writes=?,notifications=0
      WHERE id=?`).bind(Date.now(),Number.isFinite(feedAt)?feedAt:null,String(feed?.revision || ''),
      feed?.modelVersion || null,games.length,checks,games.length-flagged.size,flagged.size,writes,runId).run();
    // Bound per-scan observations; preserve finding and recovery events indefinitely.
    const clock=new Date(now);
    if (clock.getUTCHours()===0 && clock.getUTCMinutes()<3) {
      await env.DB.prepare('DELETE FROM live_audit_observations WHERE observed_at<?').bind(now-14*86400000).run();
      await env.DB.prepare('DELETE FROM live_audit_runs WHERE started_at<?').bind(now-14*86400000).run();
    }
    return {runId,gamesChecked:games.length,checksCompleted:checks,cleanGames:games.length-flagged.size,
      flaggedGames:flagged.size,sourceFreshnessMs:age,alertsOpened:applied.events.filter(e=>e.event==='opened').length,
      recoveries:applied.events.filter(e=>e.event==='recovered').length,providerRequests:0,storageWrites:writes,notifications:0};
  } catch(error) {
    await env.DB.prepare('UPDATE live_audit_runs SET finished_at=?,error=? WHERE id=?')
      .bind(Date.now(),String(error).slice(0,500),runId).run().catch(()=>{});
    throw error;
  }
}
async function report(env,date) {
  const latest=await env.DB.prepare('SELECT * FROM live_audit_runs ORDER BY id DESC LIMIT 1').first();
  const lastSuccessful=await env.DB.prepare('SELECT finished_at FROM live_audit_runs WHERE error IS NULL AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1').first();
  const unresolved=await rows(env.DB.prepare("SELECT * FROM live_audit_findings WHERE status IN ('open','recovering') ORDER BY last_seen DESC LIMIT 200"));
  const games=latest?.id ? await rows(env.DB.prepare('SELECT game_key,evidence FROM live_audit_observations WHERE run_id=? ORDER BY game_key LIMIT 300').bind(latest.id)) : [];
  const events=await rows(env.DB.prepare('SELECT at,game_key,reason_code,event,evidence FROM live_audit_events ORDER BY at DESC LIMIT 100'));
  const output={latestRun:latest,lastSuccessfulScan:lastSuccessful?.finished_at || null,
    sourceFreshnessMs:latest?.feed_updated_at ? Date.now()-latest.feed_updated_at : null,
    activeUnresolvedCount:unresolved.length,
    activeUnresolvedFindings:unresolved.map(row=>({...row,evidence:JSON.parse(row.evidence)})),
    games:games.map(row=>({gameKey:row.game_key,evidence:JSON.parse(row.evidence)})),
    recentAlertEvents:events.map(row=>({...row,evidence:JSON.parse(row.evidence)}))};
  if (date) {
    const next=new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10);
    const start=newYorkMidnight(date),end=newYorkMidnight(next);
    const runs=await rows(env.DB.prepare('SELECT * FROM live_audit_runs WHERE started_at>=? AND started_at<? ORDER BY id LIMIT 500').bind(start,end));
    const dailyEvents=await rows(env.DB.prepare('SELECT at,game_key,reason_code,event,evidence FROM live_audit_events WHERE at>=? AND at<? ORDER BY at LIMIT 300').bind(start,end));
    const gameSummaries=await rows(env.DB.prepare(`SELECT game_key,sport,COUNT(*) observations,MIN(rating) min_rating,
      MAX(rating) peak_rating,MIN(observed_at) first_seen,MAX(observed_at) last_seen
      FROM live_audit_observations WHERE observed_at>=? AND observed_at<? GROUP BY game_key,sport ORDER BY game_key LIMIT 300`)
      .bind(start,end));
    const latestEvidence=await rows(env.DB.prepare(`SELECT o.game_key,o.evidence FROM live_audit_observations o
      JOIN (SELECT game_key,MAX(observed_at) last_at FROM live_audit_observations
        WHERE observed_at>=? AND observed_at<? GROUP BY game_key) last
      ON last.game_key=o.game_key AND last.last_at=o.observed_at ORDER BY o.game_key LIMIT 300`).bind(start,end));
    const evidenceByGame=new Map(latestEvidence.map(row=>[row.game_key,JSON.parse(row.evidence)]));
    const historicalFindings=await rows(env.DB.prepare(`SELECT f.* FROM live_audit_findings f
      WHERE f.first_seen<? AND f.last_seen>=? AND
      (f.status IN ('open','recovering') OR EXISTS
        (SELECT 1 FROM live_audit_events e WHERE e.game_key=f.game_key AND e.reason_code=f.reason_code AND e.event='opened'))
      ORDER BY f.last_seen DESC LIMIT 300`).bind(end,start));
    output.postSlate={dateNewYork:date,scans:runs.length,gamesChecked:runs.reduce((n,r)=>n+r.games_checked,0),
      checksCompleted:runs.reduce((n,r)=>n+r.checks_completed,0),scanErrors:runs.filter(r=>r.error).map(r=>r.error),
      distinctGames:gameSummaries.length,gameSummaries:gameSummaries.map(row=>({...row,latestEvidence:evidenceByGame.get(row.game_key) || null})),
      findings:historicalFindings.map(row=>({...row,evidence:JSON.parse(row.evidence)})),
      events:dailyEvents.map(row=>({...row,evidence:JSON.parse(row.evidence)}))};
  }
  return output;
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if (url.pathname==='/session' && request.method==='POST') {
      if (!env.AUDIT_READ_TOKEN || Number(request.headers.get('Content-Length') || 0)>1024)
        return html(loginHtml(true),401);
      const form=await request.formData().catch(()=>null);
      const supplied=String(form?.get('password') || '');
      if (!equal(supplied,env.AUDIT_READ_TOKEN)) return html(loginHtml(true),401);
      const at=String(Date.now()),sig=await signature(env.AUDIT_READ_TOKEN,`v1.${at}`);
      return new Response(null,{status:303,headers:{Location:'/dashboard',
        'Set-Cookie':`slatemeter_audit=v1.${at}.${sig}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`,
        'Cache-Control':'no-store'}});
    }
    if (url.pathname==='/logout' && request.method==='POST')
      return new Response(null,{status:303,headers:{Location:'/dashboard',
        'Set-Cookie':'slatemeter_audit=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
        'Cache-Control':'no-store'}});
    if (request.method!=='GET') return json({error:'Read only'},405);
    if (url.pathname==='/' || url.pathname==='/dashboard')
      return html(await authorized(request,env)?dashboardHtml:loginHtml());
    if (url.pathname==='/dashboard.js') return new Response(dashboardClient,{headers:{'content-type':'text/javascript; charset=utf-8',
      'cache-control':'public, max-age=3600','x-content-type-options':'nosniff'}});
    if (url.pathname==='/health') {
      const latest=await env.DB.prepare('SELECT started_at,finished_at,error,games_checked,checks_completed FROM live_audit_runs ORDER BY id DESC LIMIT 1').first().catch(()=>null);
      return json({ok:Boolean(latest?.finished_at && !latest.error),scheduledCron:'*/3 * * * *',latestRun:latest});
    }
    if (!['/report','/export','/export/dates','/quality'].includes(url.pathname)) return json({error:'Not found'},404);
    if (!await authorized(request,env))
      return json({error:'Unauthorized'},401);
    if (url.pathname==='/export/dates') {
      const feed=await feedFromD1(env);
      return json(await defaultSlateDate(env,feed));
    }
    const date=url.searchParams.get('date');
    if (date && !dateOnly(date)) return json({error:'date must be YYYY-MM-DD (New York)'},400);
    if (url.pathname==='/quality') {
      const feed=await feedFromD1(env);
      const selected=date || (await defaultSlateDate(env,feed)).defaultDate;
      const {data}=await buildNightlyExport(env,selected,{feed});
      return streamedJson({dateNewYork:selected,scoringQuality:data.scoringQuality});
    }
    if (url.pathname==='/export') {
      const feed=await feedFromD1(env);
      const selected=date || (await defaultSlateDate(env,feed)).defaultDate;
      const {data,summary}=await buildNightlyExport(env,selected,{feed});
      const zip=zipEntriesStream([['summary.md',summary],['findings.json',jsonTextChunks(data)]]);
      return new Response(zip,{headers:{'content-type':'application/zip','cache-control':'no-store',
        'content-disposition':`attachment; filename="slatemeter-audit-${selected}.zip"`,
        'x-content-type-options':'nosniff'}});
    }
    return json(await report(env,date));
  },
  async scheduled(event,env,ctx) { ctx.waitUntil(scan(env).catch(error=>console.error('Live audit failed',String(error)))); }
};
