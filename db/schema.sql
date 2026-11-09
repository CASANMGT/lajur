-- Lajur production database schema (PostgreSQL 15+).
-- The reference API stores the versioned domain document in JSONB with ACID
-- transactions, plus audit, users, sessions and idempotency tables.
-- Run: psql "$DATABASE_URL" -f db/schema.sql

BEGIN;

CREATE TABLE IF NOT EXISTS lajur_state (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revision    bigint NOT NULL DEFAULT 0,
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lajur_state (id, revision, data)
VALUES (1, 0, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS lajur_audit (
  id          bigserial PRIMARY KEY,
  revision    bigint NOT NULL,
  actor_id    text,
  actor_name  text,
  actor_role  text,
  action      text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lajur_audit_revision_idx ON lajur_audit (revision);
CREATE INDEX IF NOT EXISTS lajur_audit_created_idx ON lajur_audit (created_at DESC);

CREATE TABLE IF NOT EXISTS lajur_users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('manager','operator','sales','driver')),
  active        boolean NOT NULL DEFAULT true,
  pin_salt      text NOT NULL,
  pin_hash      text NOT NULL,
  pin_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lajur_sessions (
  token_hash  text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES lajur_users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lajur_sessions_expiry_idx ON lajur_sessions (expires_at);

CREATE TABLE IF NOT EXISTS lajur_idempotency (
  key         text PRIMARY KEY,
  revision    bigint NOT NULL,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lajur_idempotency_created_idx ON lajur_idempotency (created_at DESC);

-- Optimistic revision guard for full-document writes.
CREATE OR REPLACE FUNCTION lajur_bump_revision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION 'lajur_revision_conflict expected % got %', OLD.revision + 1, NEW.revision;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS lajur_state_revision_guard ON lajur_state;
CREATE TRIGGER lajur_state_revision_guard
BEFORE UPDATE ON lajur_state
FOR EACH ROW EXECUTE FUNCTION lajur_bump_revision();

COMMIT;
