import {draftExcitementPost} from '../../social/hashtag-registry.mjs';
import {BOT_THRESHOLD,eligibleLiveGame,freshFeed,shouldClaim,readStoredFeed} from './logic.mjs';
import {sendToBuffer,discoverXChannel} from './buffer.mjs';

const upsertSeen=`INSERT INTO social_seen_games(sport,game_id,model_version,rating,feed_at)
 VALUES (?,?,?,?,?) ON CONFLICT(sport,game_id) DO UPDATE SET
 model_version=excluded.model_version,rating=excluded.rating,feed_at=excluded.feed_at
 WHERE excluded.feed_at>social_seen_games.feed_at`;

const insertClaim=`INSERT OR IGNORE INTO social_post_claims
 (sport,game_id,milestone,status,rating,feed_at,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?,?)`;

const updateClaim=`UPDATE social_post_claims SET status=?,updated_at=?,buffer_post_id=?,error_code=?
 WHERE sport=? AND game_id=? AND milestone=? AND status='sending'`;

function logCycle(log,payload){log(JSON.stringify({system:'slatemeter-social-bot',...payload}));}

async function channelIdFor(env,fetchImpl,log){
  if(env.BUFFER_X_CHANNEL_ID)return env.BUFFER_X_CHANNEL_ID;
  const stored=await env.BOT_DB.prepare("SELECT value FROM social_settings WHERE key='buffer_x_channel_id'").first();
  if(stored?.value)return stored.value;
  const channel=await discoverXChannel(env.BUFFER_API_KEY,{fetchImpl,
    expectedHandle:env.BUFFER_X_HANDLE||''});
  await env.BOT_DB.prepare("INSERT OR IGNORE INTO social_settings(key,value) VALUES('buffer_x_channel_name',?)")
    .bind(channel.name).run();
  await env.BOT_DB.prepare("INSERT OR IGNORE INTO social_settings(key,value) VALUES('buffer_x_channel_id',?)")
    .bind(channel.id).run();
  logCycle(log,{event:'buffer-channel-selected',channelName:channel.name});
  return channel.id;
}

/** Called only by the separate bot Worker. Does not alter sports feeds. */
export async function runCycle(env,{now=Date.now(),fetchImpl=fetch,log=console.log}={}){
  const enabled=env.POSTING_ENABLED==='true';
  const expected=String(env.EXPECTED_SCORING_MODEL||'');
  if(!expected)throw new Error('Missing expected scoring model');
  if(enabled&&!env.BUFFER_API_KEY)throw new Error('Posting enabled without Buffer secret');
  const feed=await readStoredFeed(env.SOURCE_DB);
  if(!freshFeed(feed,now,expected))return {outcome:'skipped-stale-or-incompatible',enabled};
  const feedAt=Date.parse(feed.updatedAt);
  const live=feed.games.filter(game=>eligibleLiveGame(feed,game,now,expected));
  live.sort((a,b)=>Number(b.score)-Number(a.score));
  // A disabled Worker may verify its Buffer connection, but cannot send a post.
  // The resolved channel is cached so subsequent cron runs need no Buffer API calls.
  if(!enabled&&env.BUFFER_API_KEY)await channelIdFor(env,fetchImpl,log);
  const channelId=enabled?await channelIdFor(env,fetchImpl,log):null;
  const summary={outcome:'ok',enabled,eligible:live.length,observed:0,crossings:0,
    claimed:0,accepted:0,rejected:0,deliveryUnknown:0};
  for(const game of live){
    const id=String(game.id),sport=game.sport,rating=Number(game.score);
    const previous=await env.BOT_DB.prepare(`SELECT rating,model_version,feed_at FROM social_seen_games
      WHERE sport=? AND game_id=?`).bind(sport,id).first();
    if(previous&&Number(previous.feed_at)>=feedAt)continue;
    const crossing=shouldClaim(previous,game,feedAt);
    if(crossing)summary.crossings++;
    let draft=null;
    if(crossing&&enabled){
      try{draft=draftExcitementPost(game,{reason:game.why||''});}
      catch{logCycle(log,{event:'invalid-draft',sport,gameId:id});}
    }
    let claimWon=false;
    if(draft?.eligible){
      const result=await env.BOT_DB.prepare(insertClaim)
        .bind(sport,id,BOT_THRESHOLD,'reserved',rating,feedAt,now,now).run();
      claimWon=Boolean(result.meta?.changes);
    }
    await env.BOT_DB.prepare(upsertSeen).bind(sport,id,game.modelVersion,rating,feedAt).run();
    summary.observed++;
    if(!claimWon){
      if(crossing&&!enabled)logCycle(log,{event:'dry-run-crossing',sport,gameId:id,rating});
      continue;
    }
    summary.claimed++;
    // This atomic transition is the sole permission to call Buffer. A crash
    // or ambiguous response can never reopen it automatically.
    const sender=await env.BOT_DB.prepare(`UPDATE social_post_claims SET status='sending',updated_at=?
      WHERE sport=? AND game_id=? AND milestone=? AND status='reserved'`)
      .bind(now,sport,id,BOT_THRESHOLD).run();
    if(!sender.meta?.changes)continue;
    const result=await sendToBuffer({apiKey:env.BUFFER_API_KEY,
      channelId,text:draft.text,fetchImpl});
    await env.BOT_DB.prepare(updateClaim).bind(result.status,Date.now(),result.postId||null,
      result.reason||null,sport,id,BOT_THRESHOLD).run();
    if(result.status==='accepted')summary.accepted++;
    else if(result.status==='rejected')summary.rejected++;
    else summary.deliveryUnknown++;
    logCycle(log,{event:'buffer-result',sport,gameId:id,rating,status:result.status,
      bufferPostId:result.postId||null,reason:result.reason||null});
  }
  return summary;
}
