import {buildPushPayload} from '@block65/webcrypto-web-push';
import '../../rating-core.js';
import {contextsForGames,refreshStorylines} from './storylines.js';
import {readFeed,withFreshness,gameDetails,teamDetails,teamStandings,refreshDue,refreshSportsData,requestFeedRefresh} from './sports-feed.js';
import {gameHistory} from './snapshot-history.js';
import runtime from '../../scoring/live-runtime.cjs';
import {normalizeNotificationPreferences,preferencesForRow,notificationEligible,notificationGame,gameNotificationUrl} from './notification-preferences.js';

const {rateGame,applyLiveSnapshot,recordFor,rankFor,clampScore,underdogCandidate,upsetImpact,gameProgress,momentumImpact} = globalThis.SportsRadarScore;
const ORIGIN = 'https://mmueller091.github.io';
const PUSH_HOSTS = ['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com'];
const JSON_HEADERS = {'Content-Type':'application/json','Cache-Control':'no-store'};
const AUDIT_LABELS = new Set(['right','high','low']);
function validAuditDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value; }
function newYorkMidnight(date) {
  const noon=Date.parse(`${date}T12:00:00Z`);
  const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',hourCycle:'h23'}).format(noon));
  return Date.parse(`${date}T00:00:00Z`)-(hour-12)*3600*1000;
}

function cors(request) {
  return request.headers.get('Origin') === ORIGIN ? {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, PUT, DELETE, POST, OPTIONS','Vary':'Origin'} : {};
}
function reply(request,body,status=200) { return new Response(JSON.stringify(body),{status,headers:{...JSON_HEADERS,...cors(request)}}); }
function token(request) { const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(request.headers.get('Authorization') || ''); return match?.[1] || null; }
async function hashToken(value) { const bytes = new TextEncoder().encode(value); return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte => byte.toString(16).padStart(2,'0')).join(''); }
function validSubscription(value) {
  if (!value || typeof value !== 'object' || !value.keys || typeof value.keys.p256dh !== 'string' || typeof value.keys.auth !== 'string') return false;
  if (!/^[A-Za-z0-9_-]{86,90}$/.test(value.keys.p256dh) || !/^[A-Za-z0-9_-]{20,26}$/.test(value.keys.auth)) return false;
  try { const url = new URL(value.endpoint); return url.protocol === 'https:' && PUSH_HOSTS.includes(url.hostname) && value.endpoint.length <= 2048; } catch { return false; }
}
async function sendPush(env,row,notification) {
  const subscription = {endpoint:row.endpoint,expirationTime:null,keys:{p256dh:row.p256dh,auth:row.auth}};
  const vapid = {subject:env.VAPID_SUBJECT,publicKey:env.VAPID_SERVER_PUBLIC_KEY,privateKey:env.VAPID_SERVER_PRIVATE_KEY};
  const payload = await buildPushPayload({data:JSON.stringify(notification),options:{ttl:300}},subscription,vapid);
  const result = await fetch(row.endpoint,payload);
  return result.status;
}
function gameFromEvent(sport,path,event) {
  const competition = event.competitions?.[0];
  if (!competition || competition.status?.type?.state !== 'in') return null;
  const teams = (competition.competitors || []).slice(0,2).map(item => ({id:String(item.team?.id || ''),name:item.team?.displayName || item.athlete?.displayName || 'Unknown',abbr:item.team?.abbreviation || item.abbreviation || '',score:String(Number(item.score) || 0),record:recordFor(item),rank:rankFor(item,sport)}));
  if (teams.length !== 2) return null;
  const context = competition.notes?.[0]?.headline || event.name || '';
  const rating = rateGame(sport,'live',teams,event,competition,context);
  const game = {id:String(event.id),sport,state:'live',teams:teams.map(team => [team.name,team.abbr,team.score,'','',team.record,team.rank,'',team.id]),score:rating.score,baseScore:rating.score,liveRawStatus:competition.status,liveRawSituation:competition.situation};
  return {key:`${sport}:${event.id}`,sport,path,competition,event,game,rating};
}
async function checkGames(env,feed,deliver=sendPush) {
  if (feed?.modelVersion !== runtime.MODEL_VERSION) return;
  const now = Math.floor(Date.now()/1000);
  const subscribers = (await env.DB.prepare('SELECT s.*,p.enabled,p.sports_json,p.teams_json FROM subscriptions s LEFT JOIN notification_preferences p ON p.token_hash=s.token_hash LIMIT 200').all()).results || [];
  if (!subscribers.length) return;
  const items = (feed?.games || []).filter(game=>game.state==='live' && !game.detailStale).map(game=>({key:`${game.sport}:${game.id}`,game,rating:{reason:game.why,momentumText:game.momentumText,upsetText:game.upsetText}}));
  const stateKey = item => `${runtime.MODEL_VERSION}:${item.key}`;
  const previous = new Map(((await env.DB.prepare('SELECT game_key, score FROM game_state WHERE seen_at > ?').bind(now-172800).all()).results || []).map(row => [row.game_key,row.score]));
  const writes = items.map(item => env.DB.prepare('INSERT INTO game_state (game_key, score, seen_at) VALUES (?, ?, ?) ON CONFLICT(game_key) DO UPDATE SET score=excluded.score, seen_at=excluded.seen_at').bind(stateKey(item),item.game.score,now));
  for (let start=0;start<writes.length;start+=50) await env.DB.batch(writes.slice(start,start+50));
  const pending = [];
  for (const item of items) {
    const prior = previous.get(stateKey(item));
    if (prior == null) continue; // First observation is a baseline, not a new alert.
    const score = clampScore(item.game.score);
    for (const sub of subscribers) {
      if (notificationEligible(item.game,preferencesForRow(sub)) && prior < sub.threshold && score >= sub.threshold) {
        const names = item.game.teams.map(team => team[0]).join(' vs ');
        const reason = [item.rating.momentumText,item.rating.upsetText].filter(Boolean).join('. ') || item.rating.reason || 'The game has become more exciting.';
        pending.push(env.DB.prepare('INSERT OR IGNORE INTO alerts (token_hash, game_key, score, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(sub.token_hash,stateKey(item),score,`${names} · ${score}`,reason.slice(0,230),now));
      }
    }
  }
  for (let start=0;start<pending.length;start+=50) await env.DB.batch(pending.slice(start,start+50));
  const queued = (await env.DB.prepare("SELECT a.token_hash,a.game_key,a.score,a.title,a.body,s.endpoint,s.p256dh,s.auth,s.threshold,p.enabled,p.sports_json,p.teams_json FROM alerts a JOIN subscriptions s ON s.token_hash=a.token_hash LEFT JOIN notification_preferences p ON p.token_hash=s.token_hash WHERE a.status='pending' AND a.game_key LIKE ? ORDER BY a.created_at LIMIT 10").bind(`${runtime.MODEL_VERSION}:%`).all()).results || [];
  for (const row of queued) {
    try {
      const identity=notificationGame(row.game_key,runtime.MODEL_VERSION);
      let game=identity && feed.games.find(game=>game.sport===identity.sport && String(game.id)===identity.gameId);
      if (identity && !game) {
        const snapshot=await env.DB.prepare('SELECT normalized_state FROM sports_snapshots WHERE game_key=? ORDER BY observed_at DESC LIMIT 1').bind(identity.gameKey).first();
        if (snapshot) game=JSON.parse(snapshot.normalized_state);
      }
      if (!game || row.score<row.threshold || !notificationEligible(game,preferencesForRow(row))) {
        await env.DB.prepare("UPDATE alerts SET status='cancelled' WHERE token_hash=? AND game_key=?").bind(row.token_hash,row.game_key).run();
        continue;
      }
      const status = await deliver(env,row,{title:row.title,body:row.body,tag:identity.gameKey,...identity,url:gameNotificationUrl(identity.sport,identity.gameId)});
      if (status >= 200 && status < 300) await env.DB.prepare("UPDATE alerts SET status='sent' WHERE token_hash=? AND game_key=?").bind(row.token_hash,row.game_key).run();
      else if (status === 404 || status === 410) { await env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=?').bind(row.token_hash).run(); await env.DB.prepare('DELETE FROM alerts WHERE token_hash=?').bind(row.token_hash).run(); }
      else console.error('Push rejected',status,row.game_key);
    } catch (error) { console.error('Push failed',row.game_key,String(error)); }
  }
  await env.DB.prepare('DELETE FROM game_state WHERE seen_at < ?').bind(now-604800).run();
  await env.DB.prepare('DELETE FROM alerts WHERE created_at < ?').bind(now-604800).run();
}

export {gameFromEvent,validSubscription,checkGames};
export default {
  async fetch(request,env,ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors(request)});
    if (request.headers.get('Origin') && request.headers.get('Origin') !== ORIGIN) return reply(request,{error:'Origin not allowed'},403);
    if (url.pathname === '/feed' && request.method === 'GET') {
      try {
        let feed = await readFeed(env);
        if (refreshDue(feed)) {
          feed = await requestFeedRefresh(env,feed,ctx);
        }
        return reply(request,feed || {error:'Feed is warming up'},feed ? 200 : 503);
      } catch { return reply(request,{error:'Feed temporarily unavailable'},503); }
    }
    const detail = /^\/game\/([A-Za-z]+)\/([A-Za-z0-9_-]{1,100})$/.exec(url.pathname);
    if (detail && request.method === 'GET') {
      try {
        const [summary,history] = await Promise.all([
          gameDetails(env,detail[1],detail[2]),
          gameHistory(env,detail[1],detail[2]).catch(() => ({
            gameKey:`${detail[1]}:${detail[2]}`,
            snapshots:[]
          }))
        ]);
        return reply(
          request,
          summary ? {...summary,sportsRadarHistory:history} : {error:'Game not found'},
          summary ? 200 : 404
        );
      } catch { return reply(request,{error:'Game details temporarily unavailable'},503); }
    }
    const teamStandingsRoute = /^\/team\/([A-Za-z]+)\/([A-Za-z0-9_-]{1,100})\/standings$/.exec(url.pathname);
    if (teamStandingsRoute && request.method === 'GET') {
      try {
        const standings = await teamStandings(env,teamStandingsRoute[1],teamStandingsRoute[2]);
        return reply(request,standings || {error:'Standings not found'},standings ? 200 : 404);
      } catch {
        return reply(request,{error:'Team standings temporarily unavailable'},503);
      }
    }
    const teamDetail = /^\/team\/([A-Za-z]+)\/([A-Za-z0-9_-]{1,100})$/.exec(url.pathname);
    if (teamDetail && request.method === 'GET') {
      try {
        const details = await teamDetails(env,teamDetail[1],teamDetail[2]);
        return reply(request,details || {error:'Team not found'},details ? 200 : 404);
      } catch {
        return reply(request,{error:'Team details temporarily unavailable'},503);
      }
    }
    if (url.pathname === '/config' && request.method === 'GET') return reply(request,{publicKey:env.VAPID_SERVER_PUBLIC_KEY || '',pollSeconds:60});
    if (url.pathname === '/health' && request.method === 'GET') {
      const research = await env.DB.prepare('SELECT last_run,candidates,articles,factors,ai_used,last_error FROM research_status WHERE id=1').first().catch(() => null);
      return reply(request,{ok:true,notificationVersion:'2026-10-30.preferences-links.1',modelVersion:runtime.MODEL_VERSION,scoringPolicy:runtime.POLICY_ID,storylines:{enabled:true,source:'league news + Workers AI free allocation',lastRun:research?.last_run || null,candidates:research?.candidates || 0,articles:research?.articles || 0,factors:research?.factors || 0,aiUsed:Boolean(research?.ai_used),lastError:research?.last_error || null}});
    }
    if (url.pathname === '/contexts' && request.method === 'GET') {
      const games = String(url.searchParams.get('games') || '').split(',').map(value => value.trim()).filter(Boolean);
      if (games.length > 100 || String(url.searchParams.get('games') || '').length > 6000) return reply(request,{error:'Too many games'},400);
      return reply(request,{contexts:await contextsForGames(env,games)});
    }
    if (url.pathname === '/audit' && request.method === 'GET') {
      const date = url.searchParams.get('date') || new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York'}).format(new Date());
      if (!validAuditDate(date)) return reply(request,{error:'Date must be YYYY-MM-DD'},400);
      const next = new Date(Date.parse(`${date}T12:00:00Z`)+86400000).toISOString().slice(0,10);
      // sports_snapshots.observed_at is stored in milliseconds (same as Date.now()).
      const start = newYorkMidnight(date), end = newYorkMidnight(next);
      const rows = (await env.DB.prepare(`SELECT s.*,l.label FROM sports_snapshots s LEFT JOIN scoring_audit_labels l ON l.game_key=s.game_key
        WHERE s.observed_at>=? AND s.observed_at<? ORDER BY s.game_key,s.observed_at`).bind(start,end).all()).results || [];
      const groups = new Map();
      for (const row of rows) { if (!groups.has(row.game_key)) groups.set(row.game_key,[]); groups.get(row.game_key).push(row); }
      const games = [];
      for (const [key,snapshots] of groups) {
        const final = [...snapshots].reverse().find(row=>row.state==='completed');
        if (!final) continue;
        const state = JSON.parse(final.normalized_state);
        const first = snapshots[0], teams = state.teams || [];
        games.push({key,sport:final.sport,game:(teams.map(team=>team[0]).join(' vs ') || key),scoreA:final.score_a,scoreB:final.score_b,
          pregameRating:snapshots.find(row=>row.state==='upcoming')?.rating ?? state.pregameRating ?? null,peakLiveRating:Math.max(...snapshots.filter(row=>row.state==='live').map(row=>row.rating),0),
          finalRating:final.rating,modelVersion:final.model_version || 'legacy',label:final.label || null,
          snapshots:snapshots.map(row=>({observedAt:row.observed_at,state:row.state,rating:row.rating,scoreA:row.score_a,scoreB:row.score_b,modelVersion:row.model_version || 'legacy',factors:JSON.parse(row.normalized_state).factors || []}))});
      }
      return reply(request,{date,games});
    }
    const auditLabel = /^\/audit\/([^/]{1,120})\/label$/.exec(url.pathname);
    if (auditLabel && request.method === 'PUT') {
      let body; try { body = await request.json(); } catch { return reply(request,{error:'Invalid JSON'},400); }
      if (!AUDIT_LABELS.has(body?.label) || !validAuditDate(body?.date)) return reply(request,{error:'Invalid date or label'},400);
      await env.DB.prepare(`INSERT INTO scoring_audit_labels (game_key,game_date,label,updated_at) VALUES (?,?,?,?)
        ON CONFLICT(game_key) DO UPDATE SET game_date=excluded.game_date,label=excluded.label,updated_at=excluded.updated_at`)
        .bind(decodeURIComponent(auditLabel[1]),body.date,body.label,Math.floor(Date.now()/1000)).run();
      return reply(request,{ok:true,label:body.label});
    }
    if (url.pathname === '/admin/research' && request.method === 'POST') {
      const bearer = token(request);
      if (!bearer || !env.RESEARCH_ADMIN_TOKEN || bearer !== env.RESEARCH_ADMIN_TOKEN) return reply(request,{error:'Not authorized'},401);
      try { return reply(request,{ok:true,...await refreshStorylines(env)}); }
      catch (error) { return reply(request,{ok:false,error:String(error)},500); }
    }
    if (!['/subscription','/test'].includes(url.pathname)) return reply(request,{error:'Not found'},404);
    const bearer = token(request); if (!bearer) return reply(request,{error:'Device token required'},401);
    const id = await hashToken(bearer);
    if (url.pathname === '/subscription' && request.method === 'GET') {
      const [sub,saved]=await Promise.all([
        env.DB.prepare('SELECT threshold FROM subscriptions WHERE token_hash=?').bind(id).first(),
        env.DB.prepare('SELECT * FROM notification_preferences WHERE token_hash=?').bind(id).first()
      ]);
      return reply(request,{subscribed:Boolean(sub),threshold:saved?.threshold ?? sub?.threshold ?? 85,
        preferences:saved ? preferencesForRow(saved) : {...preferencesForRow(null),enabled:Boolean(sub)}});
    }
    if (url.pathname === '/subscription' && request.method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=?').bind(id),
        env.DB.prepare('UPDATE notification_preferences SET enabled=0 WHERE token_hash=?').bind(id),
        env.DB.prepare("UPDATE alerts SET status='cancelled' WHERE token_hash=? AND status='pending'").bind(id)
      ]);
      return reply(request,{ok:true});
    }
    if (url.pathname === '/subscription' && request.method === 'PUT') {
      let body; try { const text=await request.text();if(new TextEncoder().encode(text).length>65536)return reply(request,{error:'Request too large'},413);body=JSON.parse(text); } catch { return reply(request,{error:'Invalid JSON'},400); }
      if (!Number.isInteger(body?.threshold) || body.threshold < 50 || body.threshold > 99 || (body.subscription != null && !validSubscription(body.subscription))) return reply(request,{error:'Invalid threshold or browser subscription'},400);
      const saved=await env.DB.prepare('SELECT * FROM notification_preferences WHERE token_hash=?').bind(id).first();
      const preferences=body.preferences===undefined ? preferencesForRow(saved) : normalizeNotificationPreferences(body.preferences);
      if (!preferences) return reply(request,{error:'Invalid notification preferences'},400);
      const now=Math.floor(Date.now()/1000),sub=body.subscription;
      const writes=[env.DB.prepare(`INSERT INTO notification_preferences (token_hash,enabled,sports_json,teams_json,threshold,updated_at) VALUES (?,?,?,?,?,?)
        ON CONFLICT(token_hash) DO UPDATE SET enabled=excluded.enabled,sports_json=excluded.sports_json,teams_json=excluded.teams_json,threshold=excluded.threshold,updated_at=excluded.updated_at`)
        .bind(id,Number(preferences.enabled),JSON.stringify(preferences.sports),JSON.stringify(preferences.teams),body.threshold,now)];
      writes.push(!preferences.enabled ? env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=?').bind(id)
        : sub ? env.DB.prepare('INSERT INTO subscriptions (token_hash,endpoint,p256dh,auth,threshold,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,threshold=excluded.threshold,updated_at=excluded.updated_at').bind(id,sub.endpoint,sub.keys.p256dh,sub.keys.auth,body.threshold,now)
        : env.DB.prepare('UPDATE subscriptions SET threshold=?,updated_at=? WHERE token_hash=?').bind(body.threshold,now,id));
      if (!preferences.enabled) writes.push(env.DB.prepare("UPDATE alerts SET status='cancelled' WHERE token_hash=? AND status='pending'").bind(id));
      await env.DB.batch(writes);
      return reply(request,{ok:true,threshold:body.threshold,preferences});
    }
    if (url.pathname === '/test' && request.method === 'POST') {
      const saved=await env.DB.prepare('SELECT * FROM notification_preferences WHERE token_hash=?').bind(id).first();
      if (!preferencesForRow(saved).enabled) return reply(request,{error:'Enable notifications before sending a test'},409);
      const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE token_hash=?').bind(id).first();
      if (!row) return reply(request,{error:'No saved subscription'},404);
      const status = await sendPush(env,row,{title:'Sports Radar alerts are ready',body:'This is a test notification.',tag:'sports-radar-test',url:`${ORIGIN}/sports-radar/#home`});
      return reply(request,{ok:status >= 200 && status < 300,status},status >= 200 && status < 300 ? 200 : 502);
    }
    return reply(request,{error:'Method not allowed'},405);
  },
  async scheduled(event,env,ctx) {
    if (event.cron === '* * * * *') ctx.waitUntil(refreshSportsData(env,Date.now(),{trigger:'cron'}).then(feed => feed && !feed.freshness.stale ? checkGames(env,feed) : undefined));
    else ctx.waitUntil(refreshStorylines(env).catch(async error => {
      console.error('Storyline refresh failed',String(error));
      await env.DB.prepare(`INSERT INTO research_status (id,last_run,candidates,articles,factors,ai_used,last_error)
        VALUES (1,?,0,0,0,0,?)
        ON CONFLICT(id) DO UPDATE SET last_run=excluded.last_run,last_error=excluded.last_error`)
        .bind(Math.floor(Date.now()/1000),String(error).slice(0,500)).run().catch(() => {});
    }));
  }
};
