import {preservePregameRecords} from './game-model.js';
import runtime from '../../scoring/live-runtime.cjs';
import transition from '../../scoring/football-transition.cjs';
import openingTransition from '../../scoring/opening-transition.cjs';
import market from '../../scoring/shared/market.js';
import {snapshotTimingIssue} from './snapshot-provenance.js';

export async function recoverPregameBaselines(env,games,now,previous) {
  const missing=[];
  const priors=new Map((previous?.games || []).map(g=>[`${g.sport}:${g.id}`,g]));
  for (const game of games) {
    if (!['NFL','CFB',...openingTransition.SPORTS].includes(game.sport) || game.state==='upcoming') continue;
    const prior=priors.get(`${game.sport}:${game.id}`);
    if (runtime.preservePregameBaseline(game,prior) && game.pregameBaseline.source==='observed') continue;
    missing.push(game);
  }
  for (const retention of [RETENTION_MS,FOOTBALL_RETENTION_MS]) {
    const eligible=missing.filter(game=>retentionMs(game.sport)===retention);
    for (let start=0;start<eligible.length;start+=40) {
      const group=eligible.slice(start,start+40);
      const rows=(await env.DB.prepare(`WITH keys(game_key) AS (VALUES ${group.map(()=> '(?)').join(',')})
        SELECT s.game_key,s.normalized_state,s.model_version FROM keys k JOIN sports_snapshots s
        ON s.game_key=k.game_key AND s.observed_at=(SELECT observed_at FROM sports_snapshots p
          WHERE p.game_key=k.game_key AND p.state='upcoming' AND p.observed_at>=?
          AND (p.model_version=? OR json_extract(p.normalized_state,'$.pregameBaseline.calibration') IN (?,?))
          ORDER BY p.observed_at DESC LIMIT 1)`)
        .bind(...group.map(g=>`${g.sport}:${g.id}`),now-retention,transition.CALIBRATION,transition.CALIBRATION,openingTransition.CALIBRATION).all()).results || [];
      for (const row of rows) {
        const game=group.find(g=>`${g.sport}:${g.id}`===row.game_key);
        const snapshot=JSON.parse(row.normalized_state);
        if (!snapshot.pregameBaseline && ['NFL','CFB'].includes(game.sport) && row.model_version===transition.CALIBRATION) {
          // The preceding release already calibrated upcoming games. Its actual
          // observed score is valid even though it did not serialize this structure.
          const odds=snapshot.line?.spread ? [{details:snapshot.line.spread,overUnder:snapshot.line.total}] : [];
          const competition={competitors:snapshot.teams.map((t,i)=>({homeAway:i?'home':'away',team:{id:t[8],abbreviation:t[1]},score:t[2]})),odds};
          snapshot.pregameBaseline={calibration:transition.CALIBRATION,source:'observed',score:snapshot.score,
            rawPregameScore:snapshot.rawPregameScore,factors:snapshot.factors,odds,
            spread:market.footballPregameSpread(competition),underdog:market.underdogCandidate(game.sport,competition,odds[0])};
        }
        runtime.preservePregameBaseline(game,snapshot);
      }
    }
  }
}

export const RETENTION_MS = 7 * 86400000;
export const FOOTBALL_RETENTION_MS = 14 * 86400000;
export const SNAPSHOT_CLEANUP_BATCH = 250;
export const retentionMs = sport => sport==='NFL'||sport==='CFB' ? FOOTBALL_RETENTION_MS : RETENTION_MS;

// Prune gradually after successful feed publication. Keep one final observation
// per game for archived-score fallback, and retain evidence for unresolved audits.
// The small batch prevents a one-time retention change from stalling live refreshes.
export async function pruneSnapshots(env,now) {
  const auditTable=await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='live_audit_findings'").first();
  const auditHold=auditTable ? `AND NOT EXISTS (SELECT 1 FROM live_audit_findings f
    WHERE f.game_key=s.game_key AND f.status!='recovered')` : '';
  const result=await env.DB.prepare(`DELETE FROM sports_snapshots WHERE rowid IN (
    SELECT s.rowid FROM sports_snapshots s
    WHERE s.observed_at < ? AND (s.sport NOT IN ('NFL','CFB') OR s.observed_at < ?)
      ${auditHold}
      AND (s.state!='completed' OR EXISTS (SELECT 1 FROM sports_snapshots newer
        WHERE newer.game_key=s.game_key AND newer.state='completed' AND newer.observed_at>s.observed_at))
    ORDER BY s.observed_at LIMIT ${SNAPSHOT_CLEANUP_BATCH}
  )`).bind(now-RETENTION_MS,now-FOOTBALL_RETENTION_MS).run();
  return result.meta?.changes || 0;
}
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
    const row = await env.DB.prepare(NFL_RECORD_SQL).bind(key,...ids,now-FOOTBALL_RETENTION_MS,key,cutoff).first();
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
    for (const retention of [RETENTION_MS,FOOTBALL_RETENTION_MS]) {
      const keys = games.filter(game=>game.state===state && retentionMs(game.sport)===retention).map(game=>`${game.sport}:${game.id}`);
      for (let start=0;start<keys.length;start+=40) {
        const group = keys.slice(start,start+40);
        const sql = state==='upcoming' ? upcomingLookupSql(group.length) : completedLookupSql(group.length);
        const rows = (await env.DB.prepare(sql).bind(...group,now-retention).all()).results || [];
        for (const row of rows) {
          if (state==='upcoming') upcoming.add(row.game_key);
          else completed.set(row.game_key,row);
        }
      }
    }
  }
  return {upcoming,completed};
}

// Read-time provenance only: never rewrite or re-rate a stored observation.
export function snapshotEvidence(normalized,state) {
  if(normalized.liveUpdateRejected || normalized.basketballUpdateRejected ||
     normalized.summaryLifecycleRejected || normalized.scoringHistoryRejected || normalized.timingUncertain)
    return {evidenceQuality:'invalid'};
  if(normalized.evidenceQuality==='invalid')return {evidenceQuality:'invalid'};
  if(normalized.evidenceQuality==='partial')return {evidenceQuality:'partial'};
  if(normalized.evidenceQuality==='complete')return {evidenceQuality:'verified'};
  if(normalized.historyOwnership?.relevance?.ledgerMatches===false)return {evidenceQuality:'partial'};
  if(normalized.scoringPartial && !normalized.sameStateEvidenceRetained)
    return {evidenceQuality:'partial'};
  if(state==='completed'){
    // Older failed/prematch enrichments stored only the baseline and margin.
    // Missing summary evidence means unverified, not a valid alternative final.
    const supported=Boolean(normalized.moment || normalized.completedFacts ||
      Number.isFinite(normalized.momentumPoints));
    return {evidenceQuality:supported?'verified':'partial'};
  }
  if(normalized.lastSummaryAccepted || normalized.sameStateEvidenceRetained)
    return {evidenceQuality:'verified'};
  return {};
}

export async function gameHistory(env,sport,id,now=Date.now()) {
  const gameKey = `${sport}:${id}`;
  const rows = (await env.DB.prepare(`SELECT observed_at,state,rating,score_a,score_b,phase,clock,normalized_state,model_version
    FROM sports_snapshots
    WHERE game_key=? AND observed_at>=?
    ORDER BY observed_at ASC`)
    .bind(gameKey,now-retentionMs(sport))
    .all()).results || [];

  const snapshots = rows.map(row => {
    let normalized = {};
    try { normalized = JSON.parse(row.normalized_state || '{}'); } catch {}

    const period = Number(row.phase);
    return {
      observedAt:Number(row.observed_at),
      state:String(row.state || ''),
      rating:row.rating==null ? NaN : Number(row.rating),
      scoreA:String(row.score_a ?? ''),
      scoreB:String(row.score_b ?? ''),
      period:Number.isFinite(period) && period > 0 ? period : null,
      clock:String(row.clock || ''),
      phaseLabel:String(normalized?.live?.phase || normalized?.status || ''),
      modelVersion:String(row.model_version || 'legacy'),
      ...snapshotEvidence(normalized,row.state),
      ...(normalized.liveUpdateRejected || normalized.basketballUpdateRejected ? {integrityIssue:true} : {}),
      ...(snapshotTimingIssue({...row,game_key:gameKey},normalized)?{
        evidenceQuality:'invalid',integrityIssue:true,timingIssue:snapshotTimingIssue({...row,game_key:gameKey},normalized)
      }:{})
    };
  }).filter(point =>
    Number.isFinite(point.observedAt) &&
    Number.isFinite(point.rating)
  );

  // Historical provider transitions stay in the audit record. Classify them
  // at read time so an old "verified" flag cannot make Q4 0.0 a game-end fact.
  if(['NBA','NCAAB'].includes(sport)){
    const finalPeriod=sport==='NCAAB'?2:4;
    for(let i=0;i<snapshots.length;i++){
      const point=snapshots[i],previous=snapshots[i-1];
      if(point.state!=='live'||point.period!==finalPeriod||!/^0+(?:(?::0+(?:\.0+)?)|(?:\.0+))?$/.test(point.clock)){
        continue;
      }
      const followedByPlay=snapshots.slice(i+1).some(next=>next.state==='live'&&next.period===point.period&&
        /^(?:\d+):(?:\d+(?:\.\d+)?)$/.test(next.clock)&&Number(next.clock.split(':')[0])*60+Number(next.clock.split(':')[1])>2);
      const atTransition=previous?.period<point.period && previous?.state==='live';
      const invalid=followedByPlay||atTransition;
      if(invalid){point.evidenceQuality='invalid';point.integrityIssue=true;point.timingIssue='unconfirmed-period-transition';}
    }
  }

  return {gameKey,snapshots};
}

export function providerIdentity(value) {
  if (typeof value !== 'string') return value;
  const name = value.trim().toLowerCase().replace(/\s+/g,' ');
  return /^draft\s*kings$/.test(name) ? 'draftkings' : name;
}

export function finalContent(game) {
  const {scoreboard,detailStale,staleEnrichment,lastSummaryAccepted,summaryState,
    favorite,updatedAt,freshness,...content} = game;
  const ordered = value => Array.isArray(value) ? value.map(ordered)
    : value && typeof value==='object'
      ? Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,ordered(value[key])]))
      : value;
  // Normalize only provider identity; preserve the display text and every odds
  // value in storage. Arbitrary punctuation and other semantic fields stay intact.
  if (content.line) content.line = {...content.line,provider:providerIdentity(content.line.provider)};
  return JSON.stringify(ordered(content));
}

export function shouldSnapshot(game,history,now,modelVersion) {
  const key = `${game.sport}:${game.id}`;
  if (game.state==='live') return game.score!=null && Number.isFinite(Number(game.score)) &&
    !game.liveUpdateRejected && !game.basketballUpdateRejected;
  if (game.state==='upcoming') return !history.upcoming.has(key);
  if (game.state!=='completed') return false;
  if (game.scoringPartial || game.summaryLifecycleRejected) return false;
  const prior = history.completed.get(key);
  if (!prior) return true;
  // Corrections remain eligible throughout retention; at most one final per minute.
  // A skipped correction is compared again next refresh, not marked as persisted.
  if (now-prior.observed_at<60000) return false;
  return prior.model_version!==modelVersion || finalContent(game)!==finalContent(JSON.parse(prior.normalized_state));
}
