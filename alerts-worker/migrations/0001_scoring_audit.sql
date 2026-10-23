ALTER TABLE sports_snapshots ADD COLUMN model_version TEXT NOT NULL DEFAULT 'legacy';

CREATE TABLE IF NOT EXISTS scoring_audit_labels (
  game_key TEXT PRIMARY KEY,
  game_date TEXT NOT NULL,
  label TEXT NOT NULL CHECK (label IN ('right','high','low')),
  updated_at INTEGER NOT NULL
);
