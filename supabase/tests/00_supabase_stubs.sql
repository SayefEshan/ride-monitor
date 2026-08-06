-- Minimal stand-ins for the Supabase-managed `auth` and `storage` schemas.
-- Lets the migration and its RLS policies be verified against a plain local
-- Postgres, with no Docker and no cloud project. Never applied to a real
-- Supabase database, which provides these objects itself.

create schema if not exists auth;
create schema if not exists storage;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- Tests impersonate a user by setting `request.jwt.claim.sub`.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null,
  owner     uuid
);
alter table storage.objects enable row level security;

-- Real signature returns the path segments of an object name minus the filename.
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;
