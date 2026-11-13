-- Foundation: schemas and extensions every later migration builds on.

-- Privileged helper functions (SECURITY DEFINER) live here. The schema is not exposed through the
-- Data API, and API roles can't use it, so they can't call these functions directly.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Trigram matching for partial file name search (Phase 9). Lives in `extensions`, like Supabase's others.
create extension if not exists pg_trgm with schema extensions;

-- Health check: proves the API can reach Postgres. Runs as the caller and reads nothing.
create function public.ping()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select true $$;

revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
