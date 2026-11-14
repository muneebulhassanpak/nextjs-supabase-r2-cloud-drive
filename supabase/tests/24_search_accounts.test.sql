-- Search runs as the caller, so it finds only what they can see. Deleting an account cleans up.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(16);

-- Search ---------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.rows($$select tests.label(id) from public.search_items('PDF')$$), '{f1}',
  'owner finds their file by part of its name, any case; trash and unfinished uploads are left out');
select tests.authenticate_as('editor');
select is(tests.rows($$select tests.label(id) from public.search_items('.')$$), tests.sorted('{f1,f2,f4,e1}'),
  'editor finds files in the shared tree, not the owner''s private ones');
select tests.authenticate_as('viewer');
select is_empty($$select * from public.search_items('plan')$$, 'viewer cannot find files outside their share');
select is(tests.rows($$select tests.label(id) from public.search_items('ar')$$), '{Deep}',
  'viewer finds a folder inside their share');
select tests.authenticate_as('stranger');
select is(tests.rows($$select tests.label(id) from public.search_items('t')$$), '{SR}', 'stranger finds only their own');
select tests.authenticate_as('owner');
select is_empty($$select * from public.search_items('%')$$, '% is matched literally, not as a wildcard');
select is_empty($$select * from public.search_items('_')$$, '_ is matched literally, not as a wildcard');
select is_empty($$select * from public.search_items('   ')$$, 'a blank search finds nothing');
select is(
  (select count(*)::int from public.search_items('.', 2)), 2, 'the caller can ask for fewer results');
select tests.authenticate_as_anon();
select throws_ok($$select * from public.search_items('a')$$, '42501', null, 'anon cannot search');

-- Deleting accounts ------------------------------------------------------------------------------------

select tests.clear_authentication();
delete from auth.users where id = tests.id('editor');
select is_empty(format('select 1 from public.items where owner_id = %L', tests.id('editor')),
  'a deleted account''s files go with it');
select isnt_empty(format('select 1 from public.items where id = %L', tests.id('F')),
  'the folders they had access to stay');
select ok(exists (select 1 from public.activity where item_id = tests.id('F') and action = 'unshared'),
  'losing the share is logged on the folder');

delete from auth.users where id = tests.id('owner');
select is_empty(format($$select 1 from public.items where id in (%L, %L)$$, tests.id('F'), tests.id('R')),
  'deleting the owner removes their whole drive');
select is_empty(format('select 1 from public.item_shares where user_id = %L', tests.id('viewer')),
  'and the shares on it');
select isnt_empty(format('select 1 from public.items where id = %L', tests.id('VR')), 'other people''s files are untouched');

select * from finish();
rollback;
