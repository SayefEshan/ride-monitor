-- The platform layer Supabase used to provide, now owned by this repo.
-- Runs before 0001_init.sql, which references auth.* and storage.* and is
-- applied byte-identical to its Supabase-era form.

create extension if not exists pgcrypto;

create schema if not exists auth;
create schema if not exists storage;

-- The real user store. GoTrue's bcrypt hashes migrate straight into
-- password_hash, so nobody's password changes at cutover.
create table if not exists auth.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text,
  created_at    timestamptz not null default now()
);

-- Every RLS policy keys off auth.uid(). The app sets this GUC inside each
-- request's transaction; outside one it is empty and every policy denies.
create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- storage.* stand-ins kept solely so 0001 applies unchanged. Receipts live on
-- local disk (see src/lib/storage.ts); these tables stay empty.
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

create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/')
$$;

-- ---------------------------------------------------------------------------
-- Roles. The app connects as one of these two — never as a superuser, or RLS
-- would be silently bypassed. Passwords are attached by scripts/migrate.sh
-- from the environment; tests use SET ROLE and need no login.
--
--   app_user   the request path: RLS enforced, cannot see credentials
--   app_admin  the service-role replacement: BYPASSRLS, sole access to
--              auth.users, used only by onboarding/driver-creation/scripts
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'app_admin') then
    create role app_admin nologin;
  end if;
end;
$$;
alter role app_admin bypassrls;

grant usage on schema public, auth, storage to app_user, app_admin;

-- 0001 creates its tables after this file runs; these defaults cover them.
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_user, app_admin;

-- Credentials are readable and writable only through app_admin. app_user gets
-- no grant at all: the request path cannot see password hashes even with SQL
-- injection, and the FK from profiles.id is checked as the table owner.
grant select, insert, update, delete on auth.users to app_admin;
