-- Guard rails that hold for the whole schema, so a new table or function can't skip them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

select is_empty(
  $$ select tablename || ': ' || policyname from pg_policies where schemaname = 'public' and cmd = 'ALL' $$,
  'no catch-all policies: each operation gets its own'
);

select is_empty(
  $$ select tablename || ': ' || policyname from pg_policies
     where schemaname = 'public' and roles <> '{authenticated}' $$,
  'every policy applies to signed-in users only'
);

select is_empty(
  $$ select table_name || '.' || privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and grantee = 'anon' $$,
  'anon has no privileges on any table'
);

select is_empty(
  $$ select table_name || '.' || column_name || '.' || privilege_type from information_schema.column_privileges
     where table_schema = 'public' and grantee = 'anon' $$,
  'anon has no privileges on any column'
);

select ok(
  not has_schema_privilege('anon', 'private', 'usage')
    and not has_schema_privilege('authenticated', 'private', 'usage'),
  'API roles cannot use the private schema, so they cannot call its functions directly'
);

select is_empty(
  $$ select p.proname::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                       where c like 'search_path=%') $$,
  'every SECURITY DEFINER function in public and private pins its search_path'
);

-- Exactly these functions are callable through the API. Adding one means updating this list.
select is(
  array(select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute') order by 1),
  array[
    'ping()',
    'resolve_share_link(text)',
    'share_link_children(text,uuid)',
    'share_link_file(text,uuid)'
  ],
  'anon can call only the health check and the public link functions'
);

select is(
  array(select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute') order by 1),
  array[
    'cancel_upload(uuid)',
    'complete_upload(uuid)',
    'delete_forever(uuid)',
    'empty_trash()',
    'item_access_role(uuid)',
    'move_item(uuid,uuid)',
    'ping()',
    'resolve_share_link(text)',
    'restore_item(uuid)',
    'search_items(text,integer)',
    'share_item(uuid,text,share_role)',
    'share_link_children(text,uuid)',
    'share_link_file(text,uuid)',
    'start_upload(uuid,text,bigint,text)',
    'touch_recent(uuid)',
    'trash_item(uuid)'
  ],
  'signed-in users can call only the app''s functions'
);

-- Policies call a few private helpers, so signed-in users need EXECUTE on those (but no USAGE on
-- the schema). Nothing else in private is executable by API roles.
select is(
  array(select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and has_function_privilege('authenticated', p.oid, 'execute') order by 1),
  array[
    'private.can_see_profile(uuid)',
    'private.is_item_owner(uuid)',
    'private.item_access(uuid)',
    'private.item_role(uuid,uuid,uuid[])'
  ],
  'signed-in users can execute only the helpers that policies use'
);

select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private' and has_function_privilege('anon', p.oid, 'execute') $$,
  'anon can execute nothing in private'
);

select * from finish();
rollback;
