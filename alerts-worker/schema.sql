CREATE TABLE IF NOT EXISTS subscriptions (
  token_hash TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
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
