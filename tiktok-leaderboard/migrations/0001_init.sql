-- ============================================================
-- TikTok Leaderboard — D1 Schema Migration 0001
-- ============================================================

-- ── Seasons ─────────────────────────────────────────────────
-- Seasons partition scores into time windows.
-- status: 'active' | 'upcoming' | 'archived'
CREATE TABLE IF NOT EXISTS seasons (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  start_at   TEXT    NOT NULL,   -- ISO-8601
  end_at     TEXT    NOT NULL,   -- ISO-8601
  status     TEXT    NOT NULL DEFAULT 'upcoming',
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed a default "eternal" season so the system works out of the box.
INSERT OR IGNORE INTO seasons (id, name, start_at, end_at, status)
VALUES ('season_default', 'Default Season', '2024-01-01T00:00:00Z', '2099-12-31T23:59:59Z', 'active');

-- ── Players ─────────────────────────────────────────────────
-- One row per (platform, platform_user_id) pair.
-- platform: 'tiktok' | 'douyin' | 'web' | …
CREATE TABLE IF NOT EXISTS players (
  id                TEXT    PRIMARY KEY,
  platform          TEXT    NOT NULL,
  platform_user_id  TEXT    NOT NULL,
  display_name      TEXT    NOT NULL DEFAULT '',
  avatar_url        TEXT    NOT NULL DEFAULT '',
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Fast lookup by platform identity (login / upsert).
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_platform_uid
  ON players (platform, platform_user_id);

-- ── Scores ──────────────────────────────────────────────────
-- Every submitted run is recorded (append-only audit trail).
CREATE TABLE IF NOT EXISTS scores (
  id          TEXT    PRIMARY KEY,
  player_id   TEXT    NOT NULL REFERENCES players(id),
  season_id   TEXT    NOT NULL REFERENCES seasons(id),
  score       INTEGER NOT NULL,
  wave        INTEGER NOT NULL DEFAULT 0,
  run_id      TEXT    NOT NULL,           -- client-generated idempotency key per run
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Idempotency: reject duplicate run submissions.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_run_id
  ON scores (run_id);

-- Leaderboard query: top scores in a season, ordered desc.
CREATE INDEX IF NOT EXISTS idx_scores_season_score
  ON scores (season_id, score DESC);

-- Player history within a season.
CREATE INDEX IF NOT EXISTS idx_scores_player_season
  ON scores (player_id, season_id, score DESC);

-- ── Leaderboard Best (materialised view) ────────────────────
-- One row per (player, season) holding their personal best.
-- Updated on each score submission via upsert in the repository layer.
CREATE TABLE IF NOT EXISTS leaderboard_best (
  player_id   TEXT    NOT NULL REFERENCES players(id),
  season_id   TEXT    NOT NULL REFERENCES seasons(id),
  best_score  INTEGER NOT NULL DEFAULT 0,
  best_wave   INTEGER NOT NULL DEFAULT 0,
  best_run_id TEXT    NOT NULL DEFAULT '',
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, season_id)
);

-- Leaderboard ranking query: top N by best_score.
CREATE INDEX IF NOT EXISTS idx_lb_best_season_score
  ON leaderboard_best (season_id, best_score DESC);

-- ── Idempotency Keys ────────────────────────────────────────
-- Generic idempotency / rate-limit table.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT    PRIMARY KEY,
  scope      TEXT    NOT NULL DEFAULT '',
  result     TEXT    NOT NULL DEFAULT '',  -- cached JSON response
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT    NOT NULL              -- ISO-8601; cleaned up periodically
);

CREATE INDEX IF NOT EXISTS idx_idem_expires
  ON idempotency_keys (expires_at);

-- ============================================================
-- Index Design Notes
-- ============================================================
-- idx_players_platform_uid   — O(1) upsert on login; unique constraint
-- idx_scores_run_id          — O(1) idempotency check on submit
-- idx_scores_season_score    — powers "top N in season" leaderboard query
-- idx_scores_player_season   — powers "my best / my history" per season
-- idx_lb_best_season_score   — powers materialised leaderboard ranking
-- idx_idem_expires           — efficient cleanup of expired idempotency rows
-- ============================================================
