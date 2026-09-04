\set ON_ERROR_STOP on

-- Synthetic compatibility fixture for repository CI only.
-- This file contains no production identities, credentials, or customer data.

create extension if not exists pgcrypto;

DO $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);

create or replace function auth.uid()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

revoke all on schema auth from public;
grant usage on schema auth to anon, authenticated;

revoke all on function auth.uid() from public;
grant execute on function auth.uid() to anon, authenticated;
