import {basketballBoxScore} from './display-model.js';
import {createCollector,summaryUrl} from './providers/espn.js';
import {preservePregameRecords,applyContextsToGame,enrichGame} from './game-model.js';
import {contextsForGames} from './storylines.js';
import {fingerprint,summaryCandidate,reusable,refreshBudget,boundedFeedRefresh,REFRESH_LEASE_MS} from './refresh-policy.js';
import {RETENTION_MS,recoverPregameRecords,snapshotHistory,shouldSnapshot} from './snapshot-history.js';

const STALE_MS = 120000;
const LIVE_REFRESH_MS = 12000;
const IDLE_REFRESH_MS = 60000;
export const MODEL_VERSION = '2026-10-26.1';

export function refreshDue(feed,now=Date.now()) {
  if (!feed) return true;
  const updatedAt = Date.parse(feed.updatedAt || '');
  if (!Number.isFinite(updatedAt)) return true;
  const live = (feed.games || []).some(game=>game.state==='live');
  return now-updatedAt >= (live ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
}

export function withFreshness(feed,now=Date.now()) {
  if (!feed) return null;
  const ageMs = Math.max(0,now-Date.parse(feed.updatedAt));
  return {...feed,freshness:{ageMs,stale:ageMs > STALE_MS,degraded:Boolean(feed.sourceErrors?.length),maxAgeMs:STALE_MS}};
}

export async function readFeed(env,now=Date.now()) {
  const row = await env.DB.prepare('SELECT payload FROM sports_feed WHERE id=1').first();
  if (!row) return null;
  const feed = JSON.parse(row.payload);
  if (feed.revision) {
    const parts = await env.DB.prepare('SELECT payload FROM sports_feed_parts WHERE revision=? ORDER BY part').bind(feed.revision).all();
    if (parts.results.length !== feed.parts) throw new Error('Incomplete stored feed');
    feed.games = parts.results.flatMap(part=>JSON.parse(part.payload));
  }
  return withFreshness(feed,now);
}

// A D1 lease coordinates all isolates and regions, including overlapping cron runs.
async function acquire(env,key,now,ttl) {
  const owner = crypto.randomUUID();
  const result = await env.DB.prepare(`INSERT INTO sports_leases (key,owner,expires_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
    WHERE sports_leases.expires_at <= ?`).bind(key,owner,now+ttl,now).run();
  return result.meta?.changes ? owner : null;
}
async function release(env,key,owner) {
  await env.DB.prepare('DELETE FROM sports_leases WHERE key=? AND owner=?').bind(key,owner).run();
}

async function fetchSourceJson(url,ttl,budget) {
  budget?.check();
  if (budget) budget.stats.providerRequests++;
  try {
    const response = await fetch(url,{headers:{Accept:'application/json'},signal:budget ? AbortSignal.any([budget.signal,AbortSignal.timeout(7000)]) : AbortSignal.timeout(7000),cf:{cacheTtl:Math.floor(ttl/1000),cacheEverything:true}});
    if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload !== 'object' || (url.includes('/scoreboard') && !Array.isArray(payload.events))) throw new Error('Invalid source response');
    return payload;
  } catch(error) {
    if (budget) budget.stats.providerFailures++;
    if (budget && (error?.name==='TimeoutError' || error?.name==='AbortError' || budget.signal.aborted)) budget.stats.providerTimeouts++;
    throw error;
  }
}

// The cron already owns the global refresh lease. Read the small cache index once
// and batch writes, rather than spending four D1 operations on every source URL.
// Summary reads share the per-URL ownership path with public details.
async function refreshReader(env,now,budget) {
  const rows = await env.DB.prepare('SELECT key,updated_at FROM sports_resources').all();
  const dates = new Map(rows.results.map(row=>[row.key,row.updated_at]));
  const pending = new Map();
  const requests = new Map();
  const stored = async url => {
    const row = await env.DB.prepare('SELECT payload FROM sports_resources WHERE key=?').bind(url).first();
    return row ? JSON.parse(row.payload) : null;
  };
  return {
    dates,
    settle:()=>Promise.allSettled([...requests.values()]),
    async cached(url) {
      budget.check();
      const row = await env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(url).first();
      return row ? {payload:JSON.parse(row.payload),updatedAt:row.updated_at} : null;
    },
    read(url,ttl,errors) {
      budget.check();
      if (!requests.has(url)) requests.set(url,(async()=>{
        if (new URL(url).pathname.endsWith('/summary')) return (await providerJson(env,url,ttl,now,errors,budget)).payload;
        if (dates.has(url) && now-dates.get(url)<ttl) return stored(url);
        try {
          const payload = await fetchSourceJson(url,ttl,budget);
          pending.set(url,JSON.stringify(payload));
          return payload;
        } catch(error) {
          errors.push(url);
          budget.check();
          if (dates.has(url)) return stored(url);
          throw error;
        }
      })());
      return requests.get(url);
    },
    async flush() {
      budget.check();
      const entries = [...pending];
      for (let start=0;start<entries.length;start+=20) {
        const group = entries.slice(start,start+20);
        await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at) VALUES ${group.map(()=>'(?,?,?)').join(',')}
          ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
          WHERE excluded.updated_at > sports_resources.updated_at`)
          .bind(...group.flatMap(([url,payload])=>[url,payload,now])).run();
        group.forEach(([url])=>dates.set(url,now));
      }
      pending.clear();
      requests.clear();
    }
  };
}

async function providerJson(env,url,ttl,now,errors,budget) {
  budget?.check();
  const read = () => env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(url).first();
  const unpack = row => ({payload:JSON.parse(row.payload),updatedAt:row.updated_at});
  let row = await read();
  if (row && now-row.updated_at < ttl) return unpack(row);
  const owner = await acquire(env,url,now,15000);
  if (!owner) {
    errors.push(url);
    row = await read();
    if (row) return unpack(row);
    throw new Error('Source refresh in progress');
  }
  try {
    // Another owner may have committed between our first read and acquisition.
    row = await read();
    if (row && now-row.updated_at < ttl) return unpack(row);
    const payload = await fetchSourceJson(url,ttl,budget);
    budget?.check();
    // Atomic owner fencing plus monotonic versions: an expired owner cannot write
    // after a successor, even if its provider request eventually completes.
    await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at)
      SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key=? AND owner=?)
      ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
      WHERE excluded.updated_at > sports_resources.updated_at`)
      .bind(url,JSON.stringify(payload),now,url,owner).run();
    const stored = await read();
    if (!stored) throw new Error('Source lease lost');
    if (stored.updated_at !== now) errors.push(url);
    return unpack(stored);
  } catch (error) {
    errors.push(url);
    budget?.check();
    row = await read();
    if (row) return unpack(row);
    throw error;
  } finally { await release(env,url,owner); }
}

export async function gameDetails(env,sport,id,now=Date.now()) {
  // Only known feed games can request provider data; no arbitrary upstream proxy.
  const feed = await readFeed(env,now);
  const game = feed?.games.find(game => game.sport === sport && String(game.id) === id);
  if (!game) return null;
  const errors = [];
  const url = summaryUrl(game);
  const resource = await providerJson(env,url,game.state==='live' ? LIVE_REFRESH_MS : 55000,now,errors);
  const summary = resource.payload;
  return {...summary,...(['NBA','NCAAB'].includes(sport) ? {basketballBoxScore:basketballBoxScore(summary,sport)} : {}),sportsRadarFreshness:{updatedAt:new Date(resource.updatedAt).toISOString(),canonicalUpdatedAt:feed.updatedAt,canonicalRevision:feed.revision || Date.parse(feed.updatedAt),receivedAt:new Date(now).toISOString(),stale:errors.length>0 || now-resource.updatedAt>STALE_MS}};
}

// Owner-qualified revisions keep a late producer's parts separate, even when
// two attempts have the same millisecond start. SQLite's existing non-STRICT
// INTEGER-affinity revision column also accepts these text keys (no migration).
export async function publishFeed(env,feed,owner,at,stage=async(name,fn)=>fn()) {
  const revision = `${Date.parse(feed.updatedAt)}:${owner}`;
  const parts=[];
  await stage('feedWrites',async()=>{
    for (let start=0;start<feed.games.length;start+=50) parts.push(env.DB.prepare(
      'INSERT OR IGNORE INTO sports_feed_parts (revision,part,payload) VALUES (?,?,?)')
      .bind(revision,parts.length,JSON.stringify(feed.games.slice(start,start+50))));
    for (let start=0;start<parts.length;start+=50) await env.DB.batch(parts.slice(start,start+50));
  });
  const header = JSON.stringify({...feed,games:undefined,revision,parts:parts.length});
  const result = await stage('publication',()=>env.DB.prepare(`INSERT INTO sports_feed (id,payload)
    SELECT 1,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key='refresh' AND owner=? AND expires_at>?
      AND expires_at>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload
    WHERE json_extract(excluded.payload,'$.updatedAt') > json_extract(sports_feed.payload,'$.updatedAt')`)
    .bind(header,owner,at()).run());
  return result.meta?.changes ? {...feed,revision,parts:parts.length} : null;
}

export async function requestFeedRefresh(env,previous,ctx,options={}) {
  let published;
  const publication = new Promise(resolve=>{published=resolve;});
  const work = refreshSportsData(env,Date.now(),{...options,trigger:'feed',onPublished:published});
  ctx?.waitUntil(work);
  const result = await boundedFeedRefresh(Promise.race([work,publication]),previous,null,options.waitMs);
  const feed=withFreshness(result || previous);
  (options.log || (entry=>console.log(JSON.stringify(entry))))({event:'canonical_feed_response',
    reused:!feed || feed.updatedAt===previous?.updatedAt,stale:feed?.freshness.stale ?? true,
    ageMs:feed?.freshness.ageMs ?? null});
  return feed;
}

export async function refreshSportsData(env,now=Date.now(),options={}) {
  const budget = refreshBudget(now,options);
  const metrics = {event:'canonical_refresh',trigger:options.trigger || 'direct',startedAt:new Date(now).toISOString(),
    outcome:'failed',lease:'pending',published:false,reusedPublication:false,
    candidates:0,liveCandidates:0,criticalCandidates:0,reusedGames:0,cachedEnrichments:0,cachedSummaryReads:0,
    deferredCandidates:0,revalidated:0,providerFailures:0,
    stages:{collection:0,recordRecovery:0,contexts:0,summary:0,snapshots:0,feedWrites:0,publication:0,cleanup:0,maintenance:0}};
  const stage = async (name,fn) => {
    budget.check();
    const start=budget.elapsed();
    try { return await fn(); } finally { metrics.stages[name]+=budget.elapsed()-start; }
  };
  let owner,resources,committed=null,released=false;
  const errors=[];
  try {
    const acquisitionStart=budget.elapsed();
    owner = await acquire(env,'refresh',now,REFRESH_LEASE_MS);
    metrics.leaseAcquisitionMs=budget.elapsed()-acquisitionStart;
    if (!owner) {metrics.lease='lost';metrics.outcome='contended';metrics.reusedPublication=true;return null;}
    metrics.lease='acquired';metrics.owner=owner;
    const previous = await readFeed(env,now);
    if (previous && !refreshDue(previous,now)) {metrics.outcome='not_due';metrics.reusedPublication=true;return previous;}
    resources = await stage('collection',()=>refreshReader(env,now,budget));
    const liveSports = new Set((previous?.games || []).filter(game=>game.state==='live').map(game=>game.sport));
    const readJson = (url,{purpose}={}) => {
      const parsed = new URL(url);
      const dates = parsed.searchParams.get('dates');
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
      const path = parsed.pathname;
      const sport = path.includes('/football/nfl/') ? 'NFL' : path.includes('/baseball/mlb/') ? 'MLB' : path.includes('/hockey/nhl/') ? 'NHL' : path.includes('/football/college-football/') ? 'CFB' : path.includes('/basketball/nba/') ? 'NBA' : path.includes('/basketball/mens-college-basketball/') ? 'NCAAB' : path.includes('/soccer/') ? 'Soccer' : path.includes('/tennis/') ? 'Tennis' : '';
      const futureSchedule = dates?.length === 8 && dates > today;
      const liveScoreboard = path.endsWith('/scoreboard') && liveSports.has(sport);
      const weekKey = Number(dates)*1000 + Number(parsed.searchParams.get('seasontype'))*100 + Number(parsed.searchParams.get('week'));
      const adjacentLive = purpose==='adjacent-schedule' && (previous?.games || []).some(game=>game.sport==='NFL' && game.state==='live' && game.nflWeek===weekKey);
      const ttl = (futureSchedule || (purpose==='adjacent-schedule' && !adjacentLive)) ? 900000 : liveScoreboard ? LIVE_REFRESH_MS : 55000;
      return resources.read(url,ttl,errors);
    };
    const games = await stage('collection',async()=>{
      const collected=await createCollector(readJson)();
      await resources.flush();
      return collected;
    });
    // Do not publish a partial/failed scoreboard refresh as a fresh feed.
    if (errors.length) return null;
    const priorGames = new Map((previous?.games || []).map(game=>[`${game.sport}:${game.id}`,game]));
    games.forEach(game=>preservePregameRecords(game,priorGames.get(`${game.sport}:${game.id}`)));
    await stage('recordRecovery',()=>recoverPregameRecords(env,games,now,previous));
    const contextGames = games.filter(game=>['NFL','MLB','NHL','CFB','NBA','NCAAB'].includes(game.sport));
    const contexts = await stage('contexts',()=>contextsForGames(env,contextGames.map(game=>`${game.sport}:${game.id}`)));
    contextGames.forEach(game=>applyContextsToGame(game,contexts[`${game.sport}:${game.id}`]));

    const candidates = games.filter(summaryCandidate);
    metrics.candidates=candidates.length;
    metrics.liveCandidates=candidates.filter(game=>game.state==='live').length;
    const scoreboardStates = new Map(candidates.map(game=>[game,JSON.parse(JSON.stringify(game))]));
    const reusedGames = new Set(), enrichment={}, deferred=[],critical=[];
    const copyPrior = (game,prior) => {
      // Input fingerprint includes all source and normalized/context fields. This
      // is never used for live games or a transition; no ID-only reuse.
      Object.assign(game,JSON.parse(JSON.stringify(prior)));
      reusedGames.add(game);metrics.reusedGames++;
    };
    const acquireCritical=async entries=>{
      for (let start=0;start<entries.length;start+=6) {
        budget.check();
        await Promise.all(entries.slice(start,start+6).map(async ({game,key,input,url,prior})=>{
          const detailErrors=[];
          try {
            const resource=await providerJson(env,url,game.state==='live'?LIVE_REFRESH_MS:55000,now,detailErrors,budget);
            budget.check();
            enrichGame(game,resource.payload,prior);
            game.detailStale=detailErrors.length>0;
            // Failed acquisitions are retried, not certified as reusable inputs.
            if (!detailErrors.length) enrichment[key]={input,model:MODEL_VERSION,
              summaryHash:await fingerprint(resource.payload),summaryVersion:resource.updatedAt};
          } catch { game.detailStale=true;detailErrors.push(url); }
          errors.push(...detailErrors);
        }));
      }
    };
    await stage('summary',async()=>{
      const live=[];
      for (const game of candidates.filter(game=>game.state==='live')) {
        const key=`${game.sport}:${game.id}`;
        live.push({game,key,input:await fingerprint({game,source:game.sourceEvent,model:MODEL_VERSION}),url:summaryUrl(game),prior:priorGames.get(key)});
      }
      metrics.criticalCandidates=live.length;
      await acquireCritical(live);
      const nonlive=candidates.filter(game=>game.state!=='live').sort((a,b)=>(a.state==='completed'?0:1)-(b.state==='completed'?0:1));
      // Resource versions can advance during maintenance without changing their
      // content. Bound concurrency, but do not serialize every D1 payload read.
      for (let start=0;start<nonlive.length;start+=6) {
        const results=await Promise.allSettled(nonlive.slice(start,start+6).map(async game=>{
          budget.check();
          const key=`${game.sport}:${game.id}`, prior=priorGames.get(key), meta=previous?.enrichment?.[key];
          const input=await fingerprint({game,source:game.sourceEvent,model:MODEL_VERSION});
          const url=summaryUrl(game);
          if (!reusable(game,prior,meta,input,MODEL_VERSION)) {
            critical.push({game,key,input,url,prior});return;
          }
          const version=resources.dates.get(url);
          if (version===meta.summaryVersion) {
            copyPrior(game,prior);enrichment[key]=meta;
          } else {
            metrics.cachedSummaryReads++;
            const cached=await resources.cached(url);
            if (!cached) {critical.push({game,key,input,url,prior});return;}
            const summaryHash=await fingerprint(cached.payload);
            if (summaryHash===meta.summaryHash) copyPrior(game,prior);
            else {enrichGame(game,cached.payload,prior);metrics.cachedEnrichments++;}
            game.detailStale=false;
            enrichment[key]={input,model:MODEL_VERSION,summaryHash,summaryVersion:cached.updatedAt};
          }
          // Keep the existing nonlive 55s resource eligibility. Revalidation does
          // not gate publication when all currently known rating inputs match.
          if (!version || now-version>=55000) deferred.push({url,version:version || 0});
          // A failed/deadline-limited maintenance pass must not make old rich
          // data look newly acquired just because the scoreboard was published.
          game.detailStale=!version || now-version>STALE_MS;
          if (game.detailStale) errors.push(url);
        }));
        const failure=results.find(result=>result.status==='rejected');
        if (failure) throw failure.reason;
      }
      critical.sort((a,b)=>(a.game.state==='completed'?0:1)-(b.game.state==='completed'?0:1));
      metrics.criticalCandidates+=critical.length;
      await acquireCritical(critical);
    });
    games.forEach(game=>{
      const prior = priorGames.get(`${game.sport}:${game.id}`);
      if (!game.line && prior?.line) game.line = prior.line;
      if (scoreboardStates.has(game) && !reusedGames.has(game)) {
        const scoreboard = scoreboardStates.get(game);
        // The browser deliberately renders this pre-enrichment snapshot to keep
        // rating inputs stable; carry refreshed additive situation fields over.
        if (['NFL','CFB'].includes(game.sport)) scoreboard.footballSituation = game.footballSituation || null;
        if (game.sport === 'MLB') {
          scoreboard.baseballSituation = game.baseballSituation || scoreboard.baseballSituation || null;
          game.baseballSituation = scoreboard.baseballSituation;
        }
        game.scoreboard = scoreboard;
      }
    });

    metrics.deferredCandidates=deferred.length;
    const feed = {version:1,updatedAt:new Date(now).toISOString(),source:'ESPN',sourceErrors:[...errors],games,enrichment};
    // History remains before publication: future NFL record recovery and audit
    // ordering depend on it. Do not let concurrent maintenance reorder snapshots.
    await stage('snapshots',async()=>{
      const history=await snapshotHistory(env,games,now);
      budget.check();
      const writes=games.filter(game=>shouldSnapshot(game,history,now,MODEL_VERSION)).map(game=>env.DB.prepare(`INSERT OR IGNORE INTO sports_snapshots
        (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version)
        SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM sports_leases WHERE key='refresh' AND owner=? AND expires_at>?
      AND expires_at>CAST((julianday('now')-2440587.5)*86400000 AS INTEGER))`)
        .bind(`${game.sport}:${game.id}`,game.state==='completed'?now:Math.floor(now/(game.state==='live'?15000:60000))*(game.state==='live'?15000:60000),
          game.sport,game.state,game.score,String(game.teams[0][2]),String(game.teams[1][2]),String(game.liveRawStatus?.period ?? ''),String(game.liveRawStatus?.displayClock || ''),JSON.stringify({...game,scoreboard:undefined}),MODEL_VERSION,owner,budget.time()));
      for(let start=0;start<writes.length;start+=50){budget.check();await env.DB.batch(writes.slice(start,start+50));}
    });
    committed=await publishFeed(env,feed,owner,()=>{budget.check();return budget.time();},stage);
    if (!committed) {metrics.lease='fenced';metrics.outcome='fenced';return null;}
    metrics.published=true;metrics.outcome='published';metrics.publicationMs=budget.elapsed();
    options.onPublished?.(withFreshness(committed,budget.time()));
    // No network maintenance holds the canonical lease. Per-resource ownership
    // still coordinates detail and canonical callers during revalidation.
    await release(env,'refresh',owner);released=true;
    await stage('cleanup',async()=>{
      await env.DB.prepare('DELETE FROM sports_feed_parts WHERE CAST(revision AS INTEGER) < ?').bind(now-600000).run();
      await env.DB.prepare('DELETE FROM sports_snapshots WHERE observed_at < ?').bind(now-RETENTION_MS).run();
      await env.DB.prepare('DELETE FROM sports_resources WHERE updated_at < ?').bind(now-7*86400000).run();
      await env.DB.prepare('DELETE FROM sports_leases WHERE expires_at < ?').bind(now).run();
    });
    if (deferred.length) await stage('maintenance',async()=>{
      // One opportunistic sweep across isolates; oldest resource first ensures
      // deadline-limited sweeps make progress without a fixed game-count cap.
      const maintenanceOwner=await acquire(env,'summary-maintenance',budget.time(),REFRESH_LEASE_MS);
      if (!maintenanceOwner) return;
      try {
        deferred.sort((a,b)=>a.version-b.version || a.url.localeCompare(b.url));
        for(let start=0;start<deferred.length;start+=6){
          budget.check();
          await Promise.all(deferred.slice(start,start+6).map(async ({url})=>{
            const failures=[];
            try {
              await providerJson(env,url,55000,budget.time(),failures,budget);
              if (!failures.length) metrics.revalidated++;
            } catch {failures.push(url);}
            errors.push(...failures);
          }));
        }
      } finally {await release(env,'summary-maintenance',maintenanceOwner);}
    });
    return withFreshness(committed,budget.time());
  } catch(error) {
    metrics.outcome=committed?'published_maintenance_incomplete':'failed';
    metrics.reason=budget.signal.aborted || String(error).includes('Refresh deadline')?'deadline':'refresh_error';
    return committed ? withFreshness(committed,budget.time()) : null;
  } finally {
    budget.close();
    // A scoreboard Promise.all may reject before sibling fetches settle. Abort
    // and drain them while still owned by waitUntil, rather than orphaning work.
    await resources?.settle();
    if (owner && !released) await release(env,'refresh',owner).catch(()=>{metrics.lease='release_failed';});
    metrics.reusedPublication ||= !metrics.published;
    metrics.degradedResources=new Set(errors).size;
    Object.assign(metrics,budget.stats);
    metrics.totalMs=budget.elapsed();
    (options.log || (entry=>console.log(JSON.stringify(entry))))(metrics);
  }
}
