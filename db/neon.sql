-- Lavishome shared dataset for Neon Postgres.
-- Run once in the Neon SQL Editor (or psql "$DATABASE_URL" -f db/neon.sql).
-- The API also creates this table on first use, so running it is optional.

create table if not exists lajur_cloud (
  workspace   text primary key,
  revision    bigint not null default 0,
  data        jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Optional check:
-- select workspace, revision, updated_at, pg_size_pretty(length(data::text)::bigint) as size
--   from lajur_cloud;
