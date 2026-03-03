-- ============================================================
-- TikTok Leaderboard — D1 Schema Migration 0002 (Diamonds)
-- ============================================================

-- Per-player diamond wallet.
CREATE TABLE IF NOT EXISTS diamond_wallets (
  player_id   TEXT PRIMARY KEY REFERENCES players(id),
  balance     INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Settlement idempotency (one row per player+run_id).
CREATE TABLE IF NOT EXISTS diamond_settlements (
  player_id     TEXT    NOT NULL REFERENCES players(id),
  run_id        TEXT    NOT NULL,
  wave          INTEGER NOT NULL DEFAULT 0,
  earned        INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, run_id)
);

CREATE INDEX IF NOT EXISTS idx_diamond_settlements_created
  ON diamond_settlements (created_at);

-- Daily cap usage tracker (UTC day).
CREATE TABLE IF NOT EXISTS diamond_daily (
  player_id   TEXT    NOT NULL REFERENCES players(id),
  day_key     TEXT    NOT NULL, -- YYYYMMDD (UTC)
  earned      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_diamond_daily_day
  ON diamond_daily (day_key);

-- Optional purchase audit.
CREATE TABLE IF NOT EXISTS diamond_purchases (
  id            TEXT    PRIMARY KEY,
  player_id      TEXT    NOT NULL REFERENCES players(id),
  item_id        TEXT    NOT NULL,
  price          INTEGER NOT NULL,
  balance_after  INTEGER NOT NULL,
  created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_diamond_purchases_player_created
  ON diamond_purchases (player_id, created_at DESC);
