CREATE TABLE IF NOT EXISTS notification_preferences (
  token_hash TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  sports_json TEXT NOT NULL,
  teams_json TEXT NOT NULL DEFAULT '[]',
  threshold INTEGER NOT NULL DEFAULT 85,
  updated_at INTEGER NOT NULL
);
