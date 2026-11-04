import runtime from '../../scoring/live-runtime.cjs';
import '../../sport-visibility.js';
import {currentGameAllowed} from './providers/tennis.js';
import {preferencesForRow,notificationEligible,notificationGame,gameNotificationUrl} from './notification-preferences.js';

export const ALERT_DELIVERY_VERSION='2026-11-03.cross-model-dedupe.1';
export const ALERT_MAX_AGE_MS=120000;

// Crossing baselines belong to a model, but a device's consumed notification
// belongs to the game. Preserve sent, ambiguous and in-flight claims across
// model changes (including legacy unversioned keys). Bind device, game, suffix,
// suffix; exact suffix comparison avoids treating '_' in event IDs as LIKE.
export const CONSUMED_GAME_ALERT_SQL=`SELECT 1 FROM alerts consumed WHERE consumed.token_hash=?
  AND (consumed.game_key=? OR substr(consumed.game_key,-length(?))=?)
  AND (consumed.status IN ('sent','delivery_unknown') OR consumed.status LIKE 'sending:%')`;

export function currentAlertGame(feed,game,now=Date.now()) {
  const updatedAt=Date.parse(feed?.updatedAt || '');
  return feed?.modelVersion===runtime.MODEL_VERSION && Number.isFinite(updatedAt) &&
    updatedAt<=now && now-updatedAt<=ALERT_MAX_AGE_MS && !feed.freshness?.stale &&
    game?.state==='live' && currentGameAllowed(game,now) && game.modelVersion===runtime.MODEL_VERSION &&
    game.score!=null && Number.isFinite(Number(game.score)) &&
    !game.detailStale && !game.scoringPartial && !game.timingUncertain && !game.liveUpdateRejected && !game.basketballUpdateRejected &&
    !game.summaryLifecycleRejected && !game.scoringHistoryRejected &&
    !['partial','invalid'].includes(game.evidenceQuality);
}

export function notificationCopy(game) {
  const score=runtime.clampScore(game.score);
  const names=game.teams.map(team=>team[0]).join(' vs ');
  const reason=[game.momentumText,game.upsetText].filter(Boolean).join('. ') || game.why || 'The game has become more exciting.';
  return {score,title:`${names} · ${score}`,body:reason.slice(0,230)};
}

// D1's conditional write is the delivery claim. A process that loses this claim
// must not send, even if it read the pending row before the winner claimed it.
// A crash/ambiguous transport failure never reopens the claim: push services do
// not provide an exactly-once acceptance key, so retrying could duplicate it.
export async function drainAlerts(env,readCurrentFeed,deliver) {
  await env.DB.prepare("UPDATE alerts SET status='cancelled' WHERE status='pending' AND game_key NOT LIKE ?")
    .bind(`${runtime.MODEL_VERSION}:%`).run();
  const queued=(await env.DB.prepare("SELECT a.token_hash,a.game_key,a.created_at FROM alerts a WHERE a.status='pending' AND a.game_key LIKE ? ORDER BY a.created_at LIMIT 10")
    .bind(`${runtime.MODEL_VERSION}:%`).all()).results || [];
  for(const queuedRow of queued){
    const identity=notificationGame(queuedRow.game_key,runtime.MODEL_VERSION);
    const gameKey=identity?.gameKey || queuedRow.game_key,suffix=`:${gameKey}`;
    const claimStatus=`sending:${crypto.randomUUID()}`;
    const claim=await env.DB.prepare(`UPDATE alerts SET status=? WHERE token_hash=? AND game_key=? AND created_at=? AND status='pending'
      AND NOT EXISTS (${CONSUMED_GAME_ALERT_SQL})`)
      .bind(claimStatus,queuedRow.token_hash,queuedRow.game_key,queuedRow.created_at,queuedRow.token_hash,gameKey,suffix,suffix).run();
    if(!claim.meta?.changes){
      // A losing concurrent claim is already sending. Cancel only if consumed
      // history still exists: its owner may meanwhile have received a definite
      // transport rejection and reopened this row for a legitimate retry.
      await env.DB.prepare(`UPDATE alerts SET status='cancelled' WHERE token_hash=? AND game_key=? AND created_at=? AND status='pending'
        AND EXISTS (${CONSUMED_GAME_ALERT_SQL})`)
        .bind(queuedRow.token_hash,queuedRow.game_key,queuedRow.created_at,queuedRow.token_hash,gameKey,suffix,suffix).run();
      continue;
    }
    const settle=status=>env.DB.prepare("UPDATE alerts SET status=? WHERE token_hash=? AND game_key=? AND status=? AND created_at=?")
      .bind(status,queuedRow.token_hash,queuedRow.game_key,claimStatus,queuedRow.created_at).run();
    let sending=false;
    try {
      const row=await env.DB.prepare('SELECT s.*,p.enabled,p.sports_json,p.teams_json,COALESCE(p.threshold,s.threshold) AS threshold FROM subscriptions s LEFT JOIN notification_preferences p ON p.token_hash=s.token_hash WHERE s.token_hash=?')
        .bind(queuedRow.token_hash).first();
      // Read persisted publication last, immediately before the eligibility test
      // and transport call. A passed-in cron feed or archived snapshot can lag it.
      const feed=await readCurrentFeed();
      const now=Date.now(),createdAt=Number(queuedRow.created_at)*1000;
      const game=identity && feed?.games?.find(g=>g.sport===identity.sport && String(g.id)===identity.gameId);
      if(!row || !globalThis.SlateMeterSports.visible.includes(identity?.sport) || !Number.isFinite(createdAt) || createdAt>now || now-createdAt>ALERT_MAX_AGE_MS ||
        !currentAlertGame(feed,game,now) || !Number.isFinite(Number(row.threshold)) ||
        Number(game.score)<Number(row.threshold) || !notificationEligible(game,preferencesForRow(row))){
        await settle('cancelled');continue;
      }
      const {score,title,body}=notificationCopy(game);
      sending=true;
      const status=await deliver(env,{...row,game_key:queuedRow.game_key,score,title,body},
        {title,body,tag:identity.gameKey,...identity,url:gameNotificationUrl(identity.sport,identity.gameId)});
      if(status>=200 && status<300)await settle('sent');
      else if(status===404 || status===410){
        const removed=await env.DB.prepare('DELETE FROM subscriptions WHERE token_hash=? AND endpoint=?').bind(row.token_hash,row.endpoint).run();
        // A device may replace its subscription while the old push is in flight.
        // Do not remove that replacement or any other delivery's queue record.
        await settle(removed.meta?.changes?'cancelled':'pending');
      }else if(Number.isInteger(status) && status>=300 && status<=599){
        // A definite rejection is safe to retry; each attempt rechecks current
        // state, preferences, threshold and the original crossing's expiry.
        await settle('pending');
      }else await settle('delivery_unknown');
    } catch(error){
      await settle(sending?'delivery_unknown':'cancelled');
      console.error('Push not confirmed',queuedRow.game_key,String(error));
    }
  }
}
