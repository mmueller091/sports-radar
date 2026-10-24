import {basketballBoxScore} from './display-model.js';
import {createCollector,summaryUrl} from './providers/espn.js';
import {applyContextsToGame,enrichGame} from './game-model.js';
import {contextsForGames} from './storylines.js';

const STALE_MS = 120000;
const RETENTION_MS = 30 * 86400000;
const LIVE_REFRESH_MS = 12000;
const IDLE_REFRESH_MS = 60000;
export const MODEL_VERSION = '2026-10-23.1';

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

async function fetchSourceJson(url,ttl) {
  const response = await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000),cf:{cacheTtl:Math.floor(ttl/1000),cacheEverything:true}});
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  const payload = await response.json();
  if (!payload || typeof payload !== 'object' || (url.includes('/scoreboard') && !Array.isArray(payload.events))) throw new Error('Invalid source response');
  return payload;
}

// The cron already owns the global refresh lease. Read the small cache index once
// and batch writes, rather than spending four D1 operations on every source URL.
// Public detail misses still use their own resource lease below.
async function refreshReader(env,now) {
  const rows = await env.DB.prepare('SELECT key,updated_at FROM sports_resources').all();
  const dates = new Map(rows.results.map(row=>[row.key,row.updated_at]));
  const pending = new Map();
  const requests = new Map();
  const stored = async url => {
    const row = await env.DB.prepare('SELECT payload FROM sports_resources WHERE key=?').bind(url).first();
    return row ? JSON.parse(row.payload) : null;
  };
  return {
    read(url,ttl,errors) {
      if (!requests.has(url)) requests.set(url,(async()=>{
        if (dates.has(url) && now-dates.get(url)<ttl) return stored(url);
        try {
          const payload = await fetchSourceJson(url,ttl);
          pending.set(url,JSON.stringify(payload));
          return payload;
        } catch(error) {
          errors.push(url);
          if (dates.has(url)) return stored(url);
          throw error;
        }
      })());
      return requests.get(url);
    },
    async flush() {
      const entries = [...pending];
      for (let start=0;start<entries.length;start+=20) {
        const group = entries.slice(start,start+20);
        await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at) VALUES ${group.map(()=>'(?,?,?)').join(',')}
          ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
          .bind(...group.flatMap(([url,payload])=>[url,payload,now])).run();
        group.forEach(([url])=>dates.set(url,now));
      }
      pending.clear();
      requests.clear();
    }
  };
}

async function providerJson(env,url,ttl,now,errors) {
  const row = await env.DB.prepare('SELECT payload,updated_at FROM sports_resources WHERE key=?').bind(url).first();
  if (row && now-row.updated_at < ttl) return JSON.parse(row.payload);
  const owner = await acquire(env,url,now,15000);
  if (!owner) {
    errors.push(url);
    if (row) return JSON.parse(row.payload);
    throw new Error('Source refresh in progress');
  }
  try {
    const payload = await fetchSourceJson(url,ttl);
    await env.DB.prepare(`INSERT INTO sports_resources (key,payload,updated_at) VALUES (?,?,?)
      ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`).bind(url,JSON.stringify(payload),now).run();
    return payload;
  } catch (error) {
    errors.push(url);
    if (row) return JSON.parse(row.payload);
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
  const summary = await providerJson(env,url,game.state==='live' ? LIVE_REFRESH_MS : 55000,now,errors);
  const row = await env.DB.prepare('SELECT updated_at FROM sports_resources WHERE key=?').bind(url).first();
  return {...summary,...(['NBA','NCAAB'].includes(sport) ? {basketballBoxScore:basketballBoxScore(summary,sport)} : {}),sportsRadarFreshness:{updatedAt:new Date(row.updated_at).toISOString(),stale:errors.length>0 || now-row.updated_at>STALE_MS}};
}

export async function refreshSportsData(env,now=Date.now()) {
  const owner = await acquire(env,'refresh',now,180000);
  if (!owner) return null;
  try {
    const previous = await readFeed(env,now);
    if (previous && !refreshDue(previous,now)) return previous;
    const errors = [];
    const resources = await refreshReader(env,now);
    const liveSports = new Set((previous?.games || []).filter(game=>game.state==='live').map(game=>game.sport));
    const readJson = url => {
      const parsed = new URL(url);
      const dates = parsed.searchParams.get('dates');
      const today = new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','');
      const path = parsed.pathname;
      const sport = path.includes('/football/nfl/') ? 'NFL' : path.includes('/baseball/mlb/') ? 'MLB' : path.includes('/hockey/nhl/') ? 'NHL' : path.includes('/football/college-football/') ? 'CFB' : path.includes('/basketball/nba/') ? 'NBA' : path.includes('/basketball/mens-college-basketball/') ? 'NCAAB' : path.includes('/soccer/') ? 'Soccer' : path.includes('/tennis/') ? 'Tennis' : '';
      const futureSchedule = dates?.length === 8 && dates > today;
      const liveScoreboard = path.endsWith('/scoreboard') && liveSports.has(sport);
      const ttl = futureSchedule ? 900000 : liveScoreboard ? LIVE_REFRESH_MS : 55000;
      return resources.read(url,ttl,errors);
    };
    const games = await createCollector(readJson)();
    await resources.flush();
    // Do not publish a partial/failed scoreboard refresh as a fresh feed.
    if (errors.length) return null;
    // Match the browser's existing context eligibility and first-100-game window.
    const contextGames = games.filter(game=>['NFL','MLB','NHL','CFB','NBA','NCAAB'].includes(game.sport)).slice(0,100);
    const contexts = await contextsForGames(env,contextGames.map(game=>`${game.sport}:${game.id}`));
    contextGames.forEach(game=>applyContextsToGame(game,contexts[`${game.sport}:${game.id}`]));
    const priorGames = new Map((previous?.games || []).map(game=>[`${game.sport}:${game.id}`,game]));
    // All eligible games share the browser's enrichment, independent of personal favorites.
    const candidates = games.filter(game=>(game.state!=='upcoming' || !game.line) && !(game.division==='FCS' && game.state==='upcoming'));
    // Preserve the old per-client 60-game enrichment selection without client scoring.
    const scoreboardStates = new Map(candidates.map(game=>[game,JSON.parse(JSON.stringify(game))]));
    for (let start=0;start<candidates.length;start+=6) {
      await Promise.all(candidates.slice(start,start+6).map(async game=>{
        const detailErrors = [];
        try {
          const summary = await resources.read(summaryUrl(game),game.state==='live' ? LIVE_REFRESH_MS : 55000,detailErrors);
          enrichGame(game,summary);
          game.detailStale = detailErrors.length > 0;
        } catch { game.detailStale = true; }
        errors.push(...detailErrors);
      }));
      await resources.flush();
    }
    games.forEach(game=>{
      const prior = priorGames.get(`${game.sport}:${game.id}`);
      if (!game.line && prior?.line) game.line = prior.line;
      if (scoreboardStates.has(game)) {
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
    const feed = {version:1,updatedAt:new Date(now).toISOString(),source:'ESPN',sourceErrors:errors,games};
    const priorPregame = new Set(((await env.DB.prepare("SELECT DISTINCT game_key FROM sports_snapshots WHERE state='upcoming' AND observed_at>? ").bind(Math.floor(now/1000)-RETENTION_MS/1000).all()).results || []).map(row=>row.game_key));
    const writes = games.filter(game=>game.state==='live' || game.state==='completed' || (game.state==='upcoming' && !priorPregame.has(`${game.sport}:${game.id}`))).map(game=>env.DB.prepare(`INSERT OR IGNORE INTO sports_snapshots
      (game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(`${game.sport}:${game.id}`,Math.floor(now/(game.state==='live'?15000:60000))*(game.state==='live'?15000:60000),game.sport,game.state,game.score,String(game.teams[0][2]),String(game.teams[1][2]),String(game.liveRawStatus?.period ?? ''),String(game.liveRawStatus?.displayClock || ''),JSON.stringify({...game,scoreboard:undefined}),MODEL_VERSION));
    for (let start=0;start<writes.length;start+=50) await env.DB.batch(writes.slice(start,start+50));
    // Keep individual D1 values small even during full college/NBA/NHL slates.
    const parts=[];
    for (let start=0;start<games.length;start+=50) parts.push(env.DB.prepare('INSERT OR REPLACE INTO sports_feed_parts (revision,part,payload) VALUES (?,?,?)').bind(now,parts.length,JSON.stringify(games.slice(start,start+50))));
    for (let start=0;start<parts.length;start+=50) await env.DB.batch(parts.slice(start,start+50));
    await env.DB.prepare(`INSERT INTO sports_feed (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`).bind(JSON.stringify({...feed,games:undefined,revision:now,parts:parts.length})).run();
    // Keep earlier revisions briefly for readers that already fetched their header.
    await env.DB.prepare('DELETE FROM sports_feed_parts WHERE revision < ?').bind(now-600000).run();
    await env.DB.prepare('DELETE FROM sports_snapshots WHERE observed_at < ?').bind(now-RETENTION_MS).run();
    await env.DB.prepare('DELETE FROM sports_resources WHERE updated_at < ?').bind(now-7*86400000).run();
    await env.DB.prepare('DELETE FROM sports_leases WHERE expires_at < ?').bind(now).run();
    return withFreshness(feed,now);
  } catch (error) {
    console.error('Sports refresh failed; retaining previous feed',String(error));
    return null;
  } finally { await release(env,'refresh',owner); }
}
