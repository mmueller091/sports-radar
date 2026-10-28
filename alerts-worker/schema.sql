CREATE TABLE IF NOT EXISTS subscriptions (
  token_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sports_feed (id INTEGER PRIMARY KEY CHECK (id=1), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sports_feed_parts (revision INTEGER NOT NULL, part INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (revision,part));
CREATE TABLE IF NOT EXISTS sports_resources (key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sports_resources_age ON sports_resources(updated_at);
CREATE TABLE IF NOT EXISTS sports_leases (key TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sports_snapshots (
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
  PRIMARY KEY (game_key, observed_at)
);
CREATE TABLE IF NOT EXISTS scoring_audit_labels (
  game_key TEXT PRIMARY KEY,
  game_date TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('right','high','low')),
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sports_snapshots_age ON sports_snapshots(observed_at);
CREATE TABLE IF NOT EXISTS game_state (
  game_key TEXT PRIMARY KEY,
  score INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  token_hash TEXT NOT NULL,
  game_key TEXT NOT NULL,
  score INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (token_hash, game_key)
);
CREATE INDEX IF NOT EXISTS alerts_status_idx ON alerts (status, created_at);

CREATE TABLE IF NOT EXISTS game_context (
  event_id TEXT NOT NULL,
  sport TEXT NOT NULL,
  factor_type TEXT NOT NULL,
  context_text TEXT NOT NULL,
  confidence REAL NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_published INTEGER,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (event_id, sport, factor_type)
);
CREATE INDEX IF NOT EXISTS game_context_expiry_idx ON game_context (expires_at);

CREATE TABLE IF NOT EXISTS research_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_run INTEGER NOT NULL,
  candidates INTEGER NOT NULL DEFAULT 0,
  articles INTEGER NOT NULL DEFAULT 0,
  factors INTEGER NOT NULL DEFAULT 0,
  ai_used INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS research_ai_budget (
  day TEXT PRIMARY KEY,
  reserved_neurons INTEGER NOT NULL
);

-- Targeted lookups: no changes to existing snapshots or scoring.
CREATE INDEX IF NOT EXISTS sports_snapshots_upcoming ON sports_snapshots(game_key,observed_at DESC) WHERE state='upcoming';
CREATE INDEX IF NOT EXISTS sports_snapshots_completed ON sports_snapshots(game_key,observed_at DESC) WHERE state='completed';
-- Only valid pre-final NFL records enter this index; team IDs avoid scanning mismatched records.
CREATE INDEX IF NOT EXISTS sports_snapshots_nfl_records ON sports_snapshots(
  game_key,min(CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT),CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)),max(CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT),CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)),observed_at DESC
) WHERE sport='NFL' AND state IN ('upcoming','live') AND json_valid(normalized_state)
  AND json_extract(normalized_state,'$.sport')='NFL'
  AND json_extract(normalized_state,'$.state') IN ('upcoming','live')
  AND game_key='NFL:' || CAST(json_extract(normalized_state,'$.id') AS TEXT)
  AND json_array_length(normalized_state,'$.teams')=2
  AND CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT)<>'' AND CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)<>'' AND CAST(json_extract(normalized_state,'$.teams[0][8]') AS TEXT)<>CAST(json_extract(normalized_state,'$.teams[1][8]') AS TEXT)
  AND (typeof(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')))='text' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) GLOB '[0-9]*-[0-9]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) NOT GLOB '*[^0-9-]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) NOT GLOB '*--*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')) GLOB '*[0-9]' AND length(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')))-length(replace(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[0]'),''),json_extract(normalized_state,'$.teams[0][5]')),'-','')) IN (1,2))
  AND (typeof(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')))='text' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) GLOB '[0-9]*-[0-9]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) NOT GLOB '*[^0-9-]*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) NOT GLOB '*--*' AND COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')) GLOB '*[0-9]' AND length(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')))-length(replace(COALESCE(NULLIF(json_extract(normalized_state,'$.pregameRecords[1]'),''),json_extract(normalized_state,'$.teams[1][5]')),'-','')) IN (1,2));
