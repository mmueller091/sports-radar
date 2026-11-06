// One audit-only allowlist. NCAAB is the canonical provider key for men's NCAAM.
export const AUDIT_SCOPE_VERSION = '2026-11-05.audit-scope.1';
export const AUDIT_SPORTS = Object.freeze(['NFL','CFB','NBA','NHL','MLB','NCAAB','Tennis']);
export const canonicalSport = sport => sport === 'NCAAM' ? 'NCAAB' : sport;
export const supportedSport = sport => AUDIT_SPORTS.includes(canonicalSport(sport));
const major = /\b(wimbledon|australian open|french open|roland garros|u\.?s\.? open)\b/i;
export function grandSlam(game) {
  return game?.qualityEvidence?.grandSlam === true || major.test(String(game?.context || game?.tennisTournament?.name || ''));
}
export function auditGameAllowed(game) {
  return supportedSport(game?.sport) && (game.sport !== 'Tennis' || grandSlam(game));
}
export function auditKeyAllowed(key) {
  if(key === 'feed') return true;
  const [prefix, value] = String(key || '').split(':');
  return supportedSport(prefix === 'sport' ? value : prefix);
}
export function auditAnalysisGameAllowed(game) {
  return auditKeyAllowed(game?.gameKey) && supportedSport(game?.sport) &&
    (game.sport !== 'Tennis' || auditGameAllowed(game) ||
      [...(game.observations || []), ...(game.retainedScoringObservations || [])]
        .some(o => auditGameAllowed({...o.state, sport:'Tennis', qualityEvidence:o.qualityEvidence})));
}
// Identifiers are internal constants, never request input. Filter before LIMIT,
// pagination and evidence reads so excluded history cannot consume audit capacity.
export function auditKeySql(column='game_key', globals=false) {
  const sports=[...AUDIT_SPORTS,'NCAAM'];
  return '(' + [ ...(globals ? [column+"='feed'", ...sports.map(s=>column+"='sport:"+s+"'")] : []),
    ...sports.map(s=>column+" GLOB '"+s+":*'") ].join(' OR ') + ')';
}
export function observationScopeSql(alias='') {
  const p=alias ? alias+'.' : '';
  const evidence=`CASE WHEN json_valid(${p}evidence) THEN ${p}evidence ELSE '{}' END`;
  const context=`lower(COALESCE(json_extract(${evidence}, '$.state.context'), json_extract(${evidence}, '$.state.tennisTournament.name'), ''))`;
  return `(${auditKeySql(p+'game_key')} AND ${p}sport IN (${[...AUDIT_SPORTS,'NCAAM'].map(s=>"'"+s+"'").join(',')}) AND (${p}game_key NOT GLOB 'Tennis:*' OR
    json_extract(${evidence}, '$.qualityEvidence.grandSlam')=1 OR
    ${['wimbledon','australian open','french open','roland garros','us open','u.s. open'].map(s=>`${context} LIKE '%${s}%'`).join(' OR ')}))`;
}
export function auditSourceErrors(errors=[]) {
  return errors.filter(error=> !/\/soccer\/|\bSoccer:/i.test(typeof error==='string'?error:JSON.stringify(error)));
}
// Old feed-level findings can mix sports. Project references without rewriting D1.
export function scopeEvidence(value) {
  if(Array.isArray(value)) return value.filter(item=>{
    if(typeof item==='string') return !/^(?:sport:)?soccer:/i.test(item) && !/\/soccer\//i.test(item);
    if(item && typeof item==='object') return (!item.gameKey || auditKeyAllowed(item.gameKey)) &&
      (!item.sport || supportedSport(item.sport)) && !/\/soccer\//i.test(String(item.source || item.error || ''));
    return true;
  }).map(scopeEvidence);
  if(value && typeof value==='object') {
    const scoped=Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scopeEvidence(v)]));
    if(scoped.sourceErrorScope && scoped.auditVersion!==AUDIT_SCOPE_VERSION && scoped.auditScopeVersion!==AUDIT_SCOPE_VERSION) {
      scoped.sourceErrorScope=null;
      scoped.sourceErrorScopeUnavailableReason='Legacy mixed-sport source counts cannot be apportioned; original evidence remains in D1';
    }
    return scoped;
  }
  return value;
}

// Historical run totals included soccer and cannot be used as scoped totals.
// Count retained eligible observations without modifying the original run row.
export function scopedRunsSql() {
  return `SELECT r.*,
    (SELECT COUNT(*) FROM live_audit_observations o WHERE o.run_id=r.id AND ${observationScopeSql('o')}) AS scoped_games_checked,
    (SELECT COUNT(*) FROM live_audit_observations o WHERE o.run_id=r.id AND ${observationScopeSql('o')}
      AND json_array_length(CASE WHEN json_valid(o.evidence) THEN o.evidence ELSE '{}' END,'$.auditCandidates')=0) AS scoped_clean_games,
    EXISTS(SELECT 1 FROM live_audit_observations o WHERE o.run_id=r.id
      AND (json_extract(CASE WHEN json_valid(o.evidence) THEN o.evidence ELSE '{}' END,'$.auditVersion')='${AUDIT_SCOPE_VERSION}'
        OR json_extract(CASE WHEN json_valid(o.evidence) THEN o.evidence ELSE '{}' END,'$.auditScopeVersion')='${AUDIT_SCOPE_VERSION}')) AS scoped_run
    FROM live_audit_runs r`;
}
export function scopeRun(row) {
  if(!row || row.scoped_games_checked===undefined) return row;
  const {scoped_games_checked,scoped_clean_games,scoped_run,...original}=row;
  return {...original, games_checked:scoped_games_checked,
    clean_games:scoped_run?row.clean_games:scoped_clean_games,
    flagged_games:scoped_run?row.flagged_games:scoped_games_checked-scoped_clean_games,
    checks_completed:scoped_run?row.checks_completed:null,
    countScope:'Supported sports only; historical counts use retained observations. Legacy mixed-sport check totals are unavailable.'};
}

export function scopeFindingRows(rows) {
  return rows.filter(row=>auditKeyAllowed(row.game_key)).flatMap(row=>{
    let original; try {original=JSON.parse(row.evidence);} catch {original={};}
    const evidence=scopeEvidence(original);
    if(original.affectedGames?.length && !evidence.affectedGames?.length) return [];
    if(row.reason_code==='SOURCE_ERRORS' && original.rawInputReferences?.length && !evidence.rawInputReferences?.length) return [];
    if(JSON.stringify(evidence)!==JSON.stringify(original)) {
      // Aggregates from a mixed-sport legacy warning cannot be apportioned.
      if(evidence.observed) evidence.observed={scope:'Legacy mixed-sport aggregate unavailable; see supported references'};
      if(evidence.sourceErrorAssessment) delete evidence.sourceErrorAssessment;
      evidence.auditScopeNote='Excluded sport references omitted; original evidence remains unchanged in D1';
    }
    return [{...row,evidence:JSON.stringify(evidence)}];
  });
}
