-- This database is independent of the production sports-radar-alerts D1.
-- No existing sports scoring, audit, or notification table is modified.
CREATE TABLE IF NOT EXISTS social_seen_games (
  sport TEXT NOT NULL,
  game_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  rating INTEGER NOT NULL,
  feed_at INTEGER NOT NULL,
  PRIMARY KEY (sport,game_id)
);

CREATE TABLE IF NOT EXISTS social_post_claims (
  sport TEXT NOT NULL,
  game_id TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('reserved','sending','accepted','rejected','delivery_unknown')),
  rating INTEGER NOT NULL,
  feed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  buffer_post_id TEXT,
  error_code TEXT,
  PRIMARY KEY (sport,game_id,milestone)
);

CREATE INDEX IF NOT EXISTS social_post_claims_created ON social_post_claims(created_at);

CREATE TABLE IF NOT EXISTS social_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
