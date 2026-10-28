import {preservePregameRecords} from './game-model.js';

export const RETENTION_MS = 30 * 86400000;
const RECORD = /^\d+-\d+(?:-\d+)?$/;
// Keep this predicate identical to migration 0002 so SQLite can use the partial index.
export const NFL_RECORD_PREDICATE = `sport='NFL' AND state IN ('upcoming','live') AND json_valid(normalized_state)
  AND json_extract(normalized_state,'$.sport')='NFL'
  AND json_extract(normalized_state,'$.state') IN ('upcoming','live')
  AND game_key='NFL:' || CAST(json_extract(normalized_state,'$.id') AS TEXT)
  AND json_array_length(normalized_state,'$.teams')=2
  AND CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT)<>'' AND CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)<>'' AND CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT)<>CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)
  AND (typeof(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')))='text' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) GLOB '[0-9]*-[0-9]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) NOT GLOB '*[^0-9-]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) NOT GLOB '*--*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) GLOB '*[0-9]' AND length(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')))-length(replace(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')),'-','')) IN (1,2))
  AND (typeof(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')))='text' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) GLOB '[0-9]*-[0-9]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) NOT GLOB '*[^0-9-]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) NOT GLOB '*--*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) GLOB '*[0-9]' AND length(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')))-length(replace(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')),'-','')) IN (1,2))`;
export const NFL_RECORD_SQL = `SELECT normalized_state FROM sports_snapshots
  WHERE ${NFL_RECORD_PREDICATE}
    AND game_key=? AND min(CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT),CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT))=?
    AND max(CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT),CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT))=? AND observed_at>=?
    AND observed_at < COALESCE((SELECT MIN(observed_at) FROM sports_snapshots
      WHERE game_key=? AND state='completed'),?)
  ORDER BY observed_at DESC LIMIT 1`;

function validPregameRecords(game) {
  return game.teams?.length === 2 && game.pregameRecords?.length === 2 &&
    game.pregameRecords.every(record=>typeof record === 'string' && RECORD.test(record));
}

export async function recoverPregameRecords(env,games,now,previous) {
  const cutoff = previous?.updatedAt ? Math.min(now,Date.parse(previous.updatedAt) || now) : now;
  for (const game of games) {
    if (game.sport!=='NFL' || game.state!=='completed' || validPregameRecords(game)) continue;
    const ids = (game.teams || []).map(team=>String(team[8] || '')).sort();
    if (ids.length!==2 || !ids[0] || ids[0]===ids[1]) continue;
    const key = `NFL:${game.id}`;
    const row = await env.DB.prepare(NFL_RECORD_SQL).bind(key,...ids,now-RETENTION_MS,key,cutoff).first();
    if (!row) continue;
    const snapshot = JSON.parse(row.normalized_state);
    const records = snapshot.teams.map((team,index)=>snapshot.pregameRecords?.[index] || team[5]);
    preservePregameRecords(game,{state:snapshot.state,teams:snapshot.teams,pregameRecords:records});
  }
}

export function upcomingLookupSql(count) {
  return `WITH keys(game_key) AS (VALUES ${Array(count).fill('(?)').join(',')})
    SELECT game_key FROM keys k WHERE EXISTS (
      SELECT 1 FROM sports_snapshots s WHERE s.game_key=k.game_key
        AND s.state='upcoming' AND s.observed_at>? LIMIT 1)`;
}
export function completedLookupSql(count) {
  return `WITH keys(game_key) AS (VALUES ${Array(count).fill('(?)').join(',')})
    SELECT s.game_key,s.observed_at,s.normalized_state,s.model_version
    FROM keys k JOIN sports_snapshots s ON s.game_key=k.game_key AND s.observed_at=(
      SELECT observed_at FROM sports_snapshots f WHERE f.game_key=k.game_key
        AND f.state='completed' AND f.observed_at>=? ORDER BY observed_at DESC LIMIT 1)`;
}

export async function snapshotHistory(env,games,now) {
  const upcoming = new Set(), completed = new Map();
  for (const state of ['upcoming','completed']) {
    const keys = games.filter(game=>game.state===state).map(game=>`${game.sport}:${game.id}`);
    for (let start=0;start<keys.length;start+=40) {
      const group = keys.slice(start,start+40);
      const sql = state==='upcoming' ? upcomingLookupSql(group.length) : completedLookupSql(group.length);
      const rows = (await env.DB.prepare(sql).bind(...group,now-RETENTION_MS).all()).results || [];
      for (const row of rows) {
        if (state==='upcoming') upcoming.add(row.game_key);
        else completed.set(row.game_key,row);
      }
    }
  }
  return {upcoming,completed};
}

// Canonical content, not acquisition health or JSON property insertion order.
// The full original payload is still stored whenever a snapshot is warranted.
export function finalContent(game) {
  const {scoreboard,detailStale,staleEnrichment,lastSummaryAccepted,summaryState,
    favorite,updatedAt,freshness,...content} = game;
  const ordered = value => Array.isArray(value) ? value.map(ordered)
    : value && typeof value==='object'
      ? Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key])]))
      : value;
  return JSON.stringify(ordered(content));
}

export function shouldSnapshot(game,history,now,modelVersion) {
  const key = `${game.sport}:${game.id}`;
  if (game.state==='live') return true; // Existing 15-second buckets are unchanged.
  if (game.state==='upcoming') return !history.upcoming.has(key);
  if (game.state!=='completed') return false;
  const prior = history.completed.get(key);
  if (!prior) return true;
  // Corrections remain eligible throughout retention; at most one final per minute.
  // A skipped correction is compared again next refresh, not marked as persisted.
  if (now-prior.observed_at<60000) return false;
  return prior.model_version!==modelVersion || finalContent(game)!==finalContent(JSON.parse(prior.normalized_state));
}
