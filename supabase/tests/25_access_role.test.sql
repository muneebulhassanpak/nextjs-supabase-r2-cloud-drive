-- item_access_role(): the caller's own role on an item, and nothing about items they can't see.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(12);

select tests.authenticate_as('owner');
select is(public.item_access_role(tests.id('F')), 'owner', 'owner owns their folder');
select is(public.item_access_role(tests.id('e1')), 'editor',
  'the top folder''s owner can edit what others upload into it');

select tests.authenticate_as('editor');
select is(public.item_access_role(tests.id('F')), 'editor', 'editor edits the shared folder');
select is(public.item_access_role(tests.id('f4')), 'editor', 'and everything below it');
select is(public.item_access_role(tests.id('e1')), 'owner', 'and owns what they uploaded');
select is(public.item_access_role(tests.id('p1')), null, 'but not the owner''s unfinished uploads');

select tests.authenticate_as('viewer');
select is(public.item_access_role(tests.id('Sub')), 'viewer', 'viewer views the folder shared with them');
select is(public.item_access_role(tests.id('F')), null, 'but not the folder above it');
select is(public.item_access_role(tests.id('t1')), null, 'nor trashed items');

select tests.authenticate_as('stranger');
select is(public.item_access_role(tests.id('F')), null, 'stranger gets nothing');
select is(public.item_access_role(gen_random_uuid()), null, 'the same as for an id that doesn''t exist');

select tests.authenticate_as_anon();
select throws_ok(format('select public.item_access_role(%L)', tests.id('F')), '42501', null,
  'anon cannot ask');

select * from finish();
rollback;
