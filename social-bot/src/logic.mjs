export const BOT_THRESHOLD=85;
export const MAX_FEED_AGE_MS=120_000;
export const BOT_SPORTS=new Set(['NFL','NBA','NHL','CFB','NCAAB']);
const INVALID_FLAGS=['detailStale','scoringPartial','timingUncertain','liveUpdateRejected',
  'basketballUpdateRejected','summaryLifecycleRejected','scoringHistoryRejected',
  'enrichmentPending','summaryValidationPending'];

export function freshFeed(feed,now=Date.now(),expectedModel){
  const at=Date.parse(feed?.updatedAt||'');
  return Boolean(feed && feed.modelVersion===expectedModel &&
    Number.isFinite(at) && at<=now && now-at<=MAX_FEED_AGE_MS);
}

export function eligibleLiveGame(feed,game,now,expectedModel){
  return freshFeed(feed,now,expectedModel) && BOT_SPORTS.has(game?.sport) &&
    game.modelVersion===feed.modelVersion && game.state==='live' &&
    /^[A-Za-z0-9_-]{1,100}$/.test(String(game.id||'')) &&
    Number.isInteger(Number(game.score)) && Number(game.score)>=1 && Number(game.score)<=99 &&
    !INVALID_FLAGS.some(name=>game[name]) && !['partial','invalid'].includes(game.evidenceQuality) &&
    Array.isArray(game.teams) && game.teams.length===2;
}

export function shouldClaim(previous,game,feedAt){
  return Boolean(previous && previous.model_version===game.modelVersion &&
    Number(previous.feed_at)<feedAt && Number(previous.rating)<BOT_THRESHOLD &&
    Number(game.score)>=BOT_THRESHOLD);
}

/** Reads only the stored, published feed. Never invokes scoring or ESPN. */
export async function readStoredFeed(db){
  const row=await db.prepare('SELECT payload FROM sports_feed WHERE id=1').first();
  if(!row)return null;
  const feed=JSON.parse(row.payload);
  if(feed.revision){
    if(!Number.isSafeInteger(feed.parts)||feed.parts<1||feed.parts>1000)
      throw new Error('Invalid feed parts metadata');
    const parts=(await db.prepare('SELECT payload FROM sports_feed_parts WHERE revision=? ORDER BY part')
      .bind(feed.revision).all()).results||[];
    if(parts.length!==feed.parts)throw new Error('Incomplete published feed');
    feed.games=parts.flatMap(part=>JSON.parse(part.payload));
  }
  if(!Array.isArray(feed.games))throw new Error('Missing published games');
  return feed;
}
