-- Lavishome cloud sync for Supabase (PostgreSQL 15+).
-- Run this once in Supabase → SQL Editor.
--
-- 1. Replace GANTI-KUNCI-INI with a long random workspace secret (12+ chars).
-- 2. Keep the same secret in Lavishome → Pengaturan → Data → Sinkronisasi.
-- 3. The anon / publishable key is safe to ship to the browser. The workspace
--    secret is the write credential; the table itself has RLS with no policies
--    and is only reachable through the SECURITY DEFINER functions below.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.lajur_cloud (
  workspace   text primary key,
  key_hash    text not null,
  revision    bigint not null default 0,
  data        jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.lajur_cloud enable row level security;

-- Create the workspace row. Change the key BEFORE running this statement.
insert into public.lajur_cloud (workspace, key_hash, revision, data)
values ('lavishome', extensions.crypt('GANTI-KUNCI-INI', extensions.gen_salt('bf')), 0, null)
on conflict (workspace) do nothing;

create or replace function public.lajur_cloud_pull(p_workspace text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  rec public.lajur_cloud;
begin
  if p_workspace is null or length(p_workspace) < 2 then
    raise exception 'workspace tidak valid';
  end if;
  select * into rec from public.lajur_cloud where workspace = p_workspace;
  if not found then
    raise exception 'workspace belum dibuat';
  end if;
  if rec.key_hash is null or extensions.crypt(p_key, rec.key_hash) <> rec.key_hash then
    raise exception 'kunci workspace salah';
  end if;
  return jsonb_build_object(
    'revision', rec.revision,
    'data', rec.data,
    'updatedAt', rec.updated_at,
    'updatedBy', rec.updated_by
  );
end;
$$;

create or replace function public.lajur_cloud_push(
  p_workspace text,
  p_key text,
  p_base_revision bigint,
  p_data jsonb,
  p_actor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  rec public.lajur_cloud;
begin
  select * into rec from public.lajur_cloud where workspace = p_workspace for update;
  if not found then
    raise exception 'workspace belum dibuat';
  end if;
  if rec.key_hash is null or extensions.crypt(p_key, rec.key_hash) <> rec.key_hash then
    raise exception 'kunci workspace salah';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception 'data harus objek JSON';
  end if;
  if coalesce(p_base_revision, 0) <> rec.revision then
    raise exception 'revision conflict: cloud %, base %', rec.revision, coalesce(p_base_revision, 0)
      using errcode = '40001';
  end if;

  update public.lajur_cloud
     set revision = rec.revision + 1,
         data = p_data,
         updated_at = now(),
         updated_by = p_actor
   where workspace = p_workspace;

  return jsonb_build_object('revision', rec.revision + 1);
end;
$$;

revoke all on function public.lajur_cloud_pull(text, text) from public;
revoke all on function public.lajur_cloud_push(text, text, bigint, jsonb, text) from public;
grant execute on function public.lajur_cloud_pull(text, text) to anon, authenticated;
grant execute on function public.lajur_cloud_push(text, text, bigint, jsonb, text) to anon, authenticated;

-- Optional checks:
-- select workspace, revision, updated_at, length(data::text) as bytes
--   from public.lajur_cloud;
