-- Run this once against your Postgres database (Neon, Supabase, Render Postgres, etc.)
-- before starting the server with DATABASE_URL set.

CREATE TABLE IF NOT EXISTS entries (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  month       TEXT NOT NULL,
  week        INTEGER NOT NULL,
  counts      JSONB NOT NULL,
  total       INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_month_idx ON entries (month);
CREATE INDEX IF NOT EXISTS entries_name_idx ON entries (name);
