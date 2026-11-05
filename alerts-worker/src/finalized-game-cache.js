import {snapshotEvidence} from './snapshot-history.js';

// A final's canonical result is stable after verification. The key contains
// the authoritative scoreboard result, so a correction or resumed game cannot
// accidentally reuse an older final archive.
export const FINAL_ARCHIVE_PREFIX = 'finalized-game:v1:';
export const FINAL_SETTLEMENT_MS = 15 * 60 * 1000;

export function finalArchivePrefix(sport,id) {
  return `${FINAL_ARCHIVE_PREFIX}${encodeURIComponent(String(sport))}:${encodeURIComponent(String(id))}:`;
}

export function finalArchiveKey(game) {
  if (game?.state !== 'completed' || !game?.sport || !game?.id) return null;
  // sourceCompetition is deliberately non-enumerable in stored feed rows.
  // Derive the key from the normalized scoreboard fields that survive D1.
  const status=game.liveRawStatus || game.sourceCompetition?.status;
  if (status?.type?.state !== 'post' || !Array.isArray(game.teams) || game.teams.length !== 2)
    return null;
  const teams=game.teams.map((team,index)=>({
    side:index===0?'away':'home',id:String(team[8] || ''),score:String(team[2] ?? '')
  }));
  if (teams.some(team=>!team.id || !['home','away'].includes(team.side) ||
      !/^-?\d+$/.test(team.score)) || teams[0].id===teams[1].id) return null;
  const result = JSON.stringify({period:status.period || 0,teams});
  return `${finalArchivePrefix(game.sport,game.id)}${encodeURIComponent(result)}`;
}

export function eligibleFinalArchive(game,prior,meta,history,now,modelVersion) {
  const key=finalArchiveKey(game);
  if(!key || key!==finalArchiveKey(prior) || !meta?.summaryHash || meta.model!==modelVersion ||
      game.modelVersion!==modelVersion || !Number.isFinite(Number(game.score)) ||
      game.scoringPartial || game.detailStale || game.summaryValidationPending || game.enrichmentPending ||
      game.summaryLifecycleRejected || game.scoringHistoryRejected || game.liveUpdateRejected ||
      game.basketballUpdateRejected || game.timingUncertain ||
      snapshotEvidence(game,'completed').evidenceQuality!=='verified') return false;
  const saved=history?.completed?.get(`${game.sport}:${game.id}`);
  return Boolean(saved && saved.model_version===modelVersion &&
    Number.isFinite(Number(saved.observed_at)) &&
    now-Number(saved.observed_at)>=FINAL_SETTLEMENT_MS);
}
