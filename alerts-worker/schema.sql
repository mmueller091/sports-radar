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
