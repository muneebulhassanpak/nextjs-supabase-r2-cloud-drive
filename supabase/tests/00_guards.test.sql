-- Guard rails that hold for the whole schema, so a new table or function can't skip them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select is_empty(
  $$ select tablename::text from pg_tables where schemaname = 'public' and not rowsecurity $$,
  'every table in public has row-level security enabled'
);

select is_empty(
  $$ select t.tablename::text from pg_tables t
     where t.schemaname = 'public'
       and not exists (select 1 from pg_policies p
                       where p.schemaname = 'public' and p.tablename = t.tablename) $$,
  'every table in public has at least one policy'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'API roles cannot use the private schema'
);

select is_empty(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                       where c like 'search_path=%') $$,
  'every SECURITY DEFINER function in public and private pins its search_path'
);

select * from finish();
rollback;
