import {buildPushPayload} from '@block65/webcrypto-web-push';
import '../../rating-core.js';

const {rateGame,applyLiveSnapshot,recordFor,rankFor,clampScore} = globalThis.SportsRadarScore;
const ORIGIN = 'https://mmueller091.github.io';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports';
const FEEDS = [
  ['NFL','football/nfl/scoreboard'],['MLB','baseball/mlb/scoreboard'],['NHL','hockey/nhl/scoreboard'],
  ['CFB','football/college-football/scoreboard?groups=80&limit=500'],['CFB','football/college-football/scoreboard?groups=81&limit=500'],
  ['NBA','basketball/nba/scoreboard'],['NCAAB','basketball/mens-college-basketball/scoreboard'],
  ['Soccer','soccer/eng.1/scoreboard'],['Soccer','soccer/uefa.champions/scoreboard'],['Tennis','tennis/atp/scoreboard']
];
const PUSH_HOSTS = ['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com'];
const JSON_HEADERS = {'Content-Type':'application/json','Cache-Control':'no-store'};

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
async function liveGames() {
  const feeds = await Promise.all(FEEDS.map(async ([sport,path]) => {
    try { const url = `${ESPN}/${path}${path.includes('?') ? '&' : '?'}limit=500`; const response = await fetch(url,{headers:{Accept:'application/json'},cf:{cacheTtl:0}}); if (!response.ok) return []; const json = await response.json(); return (json.events || []).map(event => gameFromEvent(sport,path,event)).filter(Boolean); } catch { return []; }
  }));
  return [...new Map(feeds.flat().map(item => [item.key,item])).values()];
}
async function addDetails(items,minimum) {
  await Promise.all(items.filter(item => item.game.score >= minimum - 20).slice(0,18).map(async item => {
    try { const path = item.path.split('?')[0].replace('/scoreboard','/summary'); const response = await fetch(`${ESPN}/${path}?event=${encodeURIComponent(item.event.id)}`,{cf:{cacheTtl:0}}); if (response.ok) applyLiveSnapshot(item.game,item.competition,await response.json()); } catch {}
  }));
}
async function checkGames(env) {
  const now = Math.floor(Date.now()/1000);
  const subscribers = (await env.DB.prepare('SELECT token_hash, endpoint, p256dh, auth, threshold FROM subscriptions LIMIT 200').all()).results || [];
  if (!subscribers.length) return;
  const items = await liveGames();
  if (!items.length) return;
  await addDetails(items,Math.min(...subscribers.map(item => item.threshold)));
  const previous = new Map(((await env.DB.prepare('SELECT game_key, score FROM game_state WHERE seen_at > ?').bind(now-172800).all()).results || []).map(row => [row.game_key,row.score]));
  const writes = items.map(item => env.DB.prepare('INSERT INTO game_state (game_key, score, seen_at) VALUES (?, ?, ?) ON CONFLICT(game_key) DO UPDATE SET score=excluded.score, seen_at=excluded.seen_at').bind(item.key,item.game.score,now));
  for (let start=0;start<writes.length;start+=50) await env.DB.batch(writes.slice(start,start+50));
  const pending = [];
  for (const item of items) {
    const prior = previous.get(item.key);
    if (prior == null) continue; // First observation is a baseline, not a new alert.
    const score = clampScore(item.game.score);
    for (const sub of subscribers) {
      if (prior < sub.threshold && score >= sub.threshold) {
        const names = item.game.teams.map(team => team[0]).join(' vs ');
        const reason = item.rating.upsetText || item.rating.reason || 'The game has become more exciting.';
        pending.push(env.DB.prepare('INSERT OR IGNORE INTO alerts (token_hash, game_key, score, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(sub.token_hash,item.key,score,`${names} · ${score}`,reason.slice(0,230),now));
      }
    }
  }
  for (let start=0;start<pending.length;start+=50) await env.DB.batch(pending.slice(start,start+50));
  const queued = (await env.DB.prepare("SELECT a.token_hash,a.game_key,a.score,a.title,a.body,s.endpoint,s.p256dh,s.auth FROM alerts a JOIN subscriptions s ON s.token_hash=a.token_hash WHERE a.status='pending' ORDER BY a.created_at LIMIT 10").all()).results || [];
  for (const row of queued) {
    try {
      const status = await sendPush(env,row,{title:row.title,body:row.body,tag:row.game_key,url:`${ORIGIN}/sports-radar/#home`});
      if (status >= 200 && status < 300) await env.DB.prepare("UPDATE alerts SET status='sent' WHERE token_hash=? AND game_key=?").bind(row.token_hash,row.game_key).run();
      else if (status === 404 || status === 410) { await env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=?').bind(row.token_hash).run(); await env.DB.prepare('DELETE FROM alerts WHERE token_hash=?').bind(row.token_hash).run(); }
      else console.error('Push rejected',status,row.game_key);
    } catch (error) { console.error('Push failed',row.game_key,String(error)); }
  }
  await env.DB.prepare('DELETE FROM game_state WHERE seen_at < ?').bind(now-604800).run();
  await env.DB.prepare('DELETE FROM alerts WHERE created_at < ?').bind(now-604800).run();
}

export {gameFromEvent,validSubscription};
export default {
  async fetch(request,env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors(request)});
    if (request.headers.get('Origin') && request.headers.get('Origin') !== ORIGIN) return reply(request,{error:'Origin not allowed'},403);
    if (url.pathname === '/config' && request.method === 'GET') return reply(request,{publicKey:env.VAPID_SERVER_PUBLIC_KEY || '',pollSeconds:60});
    if (url.pathname === '/health' && request.method === 'GET') return reply(request,{ok:true});
    if (!['/subscription','/test'].includes(url.pathname)) return reply(request,{error:'Not found'},404);
    const bearer = token(request); if (!bearer) return reply(request,{error:'Device token required'},401);
    const id = await hashToken(bearer);
    if (url.pathname === '/subscription' && request.method === 'DELETE') { await env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=?').bind(id).run(); return reply(request,{ok:true}); }
    if (url.pathname === '/subscription' && request.method === 'PUT') {
      if (Number(request.headers.get('Content-Length') || 0) > 4096) return reply(request,{error:'Request too large'},413);
      let body; try { body = await request.json(); } catch { return reply(request,{error:'Invalid JSON'},400); }
      if (!Number.isInteger(body?.threshold) || body.threshold < 50 || body.threshold > 99 || !validSubscription(body.subscription)) return reply(request,{error:'Invalid threshold or browser subscription'},400);
      const sub = body.subscription;
      await env.DB.prepare('INSERT INTO subscriptions (token_hash,endpoint,p256dh,auth,threshold,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,threshold=excluded.threshold,updated_at=excluded.updated_at').bind(id,sub.endpoint,sub.keys.p256dh,sub.keys.auth,body.threshold,Math.floor(Date.now()/1000)).run();
      return reply(request,{ok:true,threshold:body.threshold});
    }
    if (url.pathname === '/test' && request.method === 'POST') {
      const row = await env.DB.prepare('SELECT * FROM subscriptions WHERE token_hash=?').bind(id).first();
      if (!row) return reply(request,{error:'No saved subscription'},404);
      const status = await sendPush(env,row,{title:'Sports Radar alerts are ready',body:'This is a test notification.',tag:'sports-radar-test',url:`${ORIGIN}/sports-radar/#home`});
      return reply(request,{ok:status >= 200 && status < 300,status},status >= 200 && status < 300 ? 200 : 502);
    }
    return reply(request,{error:'Method not allowed'},405);
  },
  async scheduled(_event,env,ctx) { ctx.waitUntil(checkGames(env)); }
};
