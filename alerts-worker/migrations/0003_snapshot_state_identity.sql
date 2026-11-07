-- Run as one transaction (D1 migrations apply / local migration test).
-- Preserve every stored field and rowid; verify before replacing the old table.
CREATE TABLE sports_snapshots_state_key (
  game_key TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  sport TEXT NOT NULL,
  state TEXT NOT NULL,
  rating INTEGER NOT NULL,
  score_a TEXT NOT NULL,
  score_b TEXT NOT NULL,
  phase TEXT NOT NULL,
  clock TEXT NOT NULL,
  normalized_state TEXT NOT NULL,
  model_version TEXT NOT NULL DEFAULT 'legacy',
  PRIMARY KEY (game_key, observed_at, state)
);
INSERT INTO sports_snapshots_state_key(rowid,game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version)
  SELECT rowid,game_key,observed_at,sport,state,rating,score_a,score_b,phase,clock,normalized_state,model_version FROM sports_snapshots;
CREATE TABLE snapshot_key_migration_check(ok INTEGER NOT NULL CHECK(ok=1));
INSERT INTO snapshot_key_migration_check
  SELECT (SELECT COUNT(*) FROM sports_snapshots)=(SELECT COUNT(*) FROM sports_snapshots_state_key)
    AND NOT EXISTS (SELECT 1 FROM sports_snapshots old LEFT JOIN sports_snapshots_state_key copy ON copy.rowid=old.rowid
      WHERE copy.rowid IS NULL OR NOT (typeof(old.rowid)=typeof(copy.rowid) AND old.rowid IS copy.rowid
    AND typeof(old.game_key)=typeof(copy.game_key) AND old.game_key IS copy.game_key
    AND typeof(old.observed_at)=typeof(copy.observed_at) AND old.observed_at IS copy.observed_at
    AND typeof(old.sport)=typeof(copy.sport) AND old.sport IS copy.sport
    AND typeof(old.state)=typeof(copy.state) AND old.state IS copy.state
    AND typeof(old.rating)=typeof(copy.rating) AND old.rating IS copy.rating
    AND typeof(old.score_a)=typeof(copy.score_a) AND old.score_a IS copy.score_a
    AND typeof(old.score_b)=typeof(copy.score_b) AND old.score_b IS copy.score_b
    AND typeof(old.phase)=typeof(copy.phase) AND old.phase IS copy.phase
    AND typeof(old.clock)=typeof(copy.clock) AND old.clock IS copy.clock
    AND typeof(old.normalized_state)=typeof(copy.normalized_state) AND old.normalized_state IS copy.normalized_state
    AND typeof(old.model_version)=typeof(copy.model_version) AND old.model_version IS copy.model_version));
DROP TABLE snapshot_key_migration_check;
DROP TABLE sports_snapshots;
ALTER TABLE sports_snapshots_state_key RENAME TO sports_snapshots;
CREATE INDEX IF NOT EXISTS sports_snapshots_age ON sports_snapshots(observed_at);
CREATE INDEX IF NOT EXISTS sports_snapshots_upcoming ON sports_snapshots(game_key,observed_at DESC) WHERE state='upcoming';
CREATE INDEX IF NOT EXISTS sports_snapshots_completed ON sports_snapshots(game_key,observed_at DESC) WHERE state='completed';
CREATE INDEX IF NOT EXISTS sports_snapshots_nfl_records ON sports_snapshots(
  game_key,min(CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT),CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)),max(CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT),CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)),observed_at DESC,state ASC
) WHERE sport='NFL' AND state IN ('upcoming','live') AND json_valid(normalized_state)
  AND json_extract(normalized_state,'$.sport')='NFL'
  AND json_extract(normalized_state,'$.state') IN ('upcoming','live')
  AND game_key='NFL:' || CAST(json_extract(normalized_state,'$.id') AS TEXT)
  AND json_array_length(normalized_state,'$.teams')=2
  AND CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT)<>'' AND CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)<>'' AND CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT)<>CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)
  AND (typeof(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')))='text' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) GLOB '[0-9]*-[0-9]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) NOT GLOB '*[^0-9-]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) NOT GLOB '*--*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) GLOB '*[0-9]' AND length(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')))-length(replace(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')),'-','')) IN (1,2))
  AND (typeof(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')))='text' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) GLOB '[0-9]*-[0-9]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) NOT GLOB '*[^0-9-]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) NOT GLOB '*--*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) GLOB '*[0-9]' AND length(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')))-length(replace(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')),'-','')) IN (1,2));
