-- Run this once against your Postgres database (Neon, Supabase, Render Postgres, etc.)
-- before starting the server with DATABASE_URL set.
--
-- If you're upgrading from the earlier week-based version of this app, drop
-- the old table first (this loses old data — export anything you want to
-- keep before running this):
--   DROP TABLE IF EXISTS entries;

CREATE TABLE IF NOT EXISTS entries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  entry_date  DATE NOT NULL,
  month       TEXT NOT NULL,
  counts      JSONB NOT NULL,
  total       INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_month_idx ON entries (month);
CREATE INDEX IF NOT EXISTS entries_name_idx ON entries (name);
CREATE INDEX IF NOT EXISTS entries_date_idx ON entries (entry_date);
