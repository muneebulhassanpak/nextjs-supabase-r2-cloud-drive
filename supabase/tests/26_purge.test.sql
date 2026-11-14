-- purge_trash(): the trash empties itself after 30 days. Server only.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(9);

select tests.authenticate_as('owner');
select throws_ok('select public.purge_trash()', '42501', null, 'signed-in users cannot purge');
select tests.authenticate_as_anon();
select throws_ok('select public.purge_trash()', '42501', null, 'nor can anyone else');

-- The owner's Projects folder (with the editor's notes.md inside) went to the trash 40 days ago,
-- private.txt 45 days ago; old.pdf (inside Projects) and a new file went yesterday.
select tests.clear_authentication();
select tests.new_file('fresh', 'owner', null, 'yesterday.pdf');
select tests.authenticate_as('owner');
select public.trash_item(tests.id('F'));
select public.trash_item(tests.id('R'));
select public.trash_item(tests.id('fresh'));
select tests.clear_authentication();
update public.items set trashed_at = now() - interval '40 days' where trash_root = tests.id('F');
update public.items set trashed_at = now() - interval '45 days' where trash_root = tests.id('R');
update public.items set trashed_at = now() - interval '1 day' where trash_root in (tests.id('fresh'), tests.id('t1'));

-- Only this fixture's keys count: other tests may leave rows behind in the local database.
create temporary table purged (k text) on commit drop;
create function pg_temp.keys(p_labels text[]) returns text[] language sql as $$
  select tests.sorted(array(select 'u/' || tests.id('owner') || '/' || l from unnest(p_labels) l))
$$;

insert into purged select k from public.purge_trash(interval '30 days', 1) k
where k like 'u/' || tests.id('owner') || '/%';
select is(tests.rows('select k from purged'), pg_temp.keys('{R}'), 'oldest first, and no more than asked for');

delete from purged;
insert into purged select k from public.purge_trash() k where k like 'u/' || tests.id('owner') || '/%';
select is(tests.rows('select k from purged'), pg_temp.keys('{f1,f2,f4,p1,t1}'),
  'a folder goes with everything of the owner''s inside it, even what went to the trash later');
select is(
  tests.rows($$select tests.label(id) from public.items where id in (select id from tests.ids)
    and owner_id = tests.id('owner')$$),
  '{fresh}',
  'what went to the trash yesterday stays');
select is(
  (select row(parent_id, trash_root = id, trashed_at > now() - interval '1 minute')::text
   from public.items where id = tests.id('e1')),
  row(null::uuid, true, true)::text,
  'the editor''s file is handed back into their trash, with a full 30 days from now');
select is(
  (select storage_used from public.profiles where id = tests.id('owner')), 1000::bigint,
  'the owner gets the space back');

delete from purged;
insert into purged select k from public.purge_trash() k where k like 'u/%' and (
  k like 'u/' || tests.id('owner') || '/%' or k like 'u/' || tests.id('editor') || '/%');
select is_empty('select k from purged', 'running again finds nothing more to do');

select tests.clear_authentication();
select ok(
  not has_function_privilege('authenticated', 'public.purge_trash(interval, integer)', 'execute')
    and has_function_privilege('service_role', 'public.purge_trash(interval, integer)', 'execute'),
  'only the server role can call it');

select * from finish();
rollback;
