-- Profiles, stars, recents and the activity log.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(56);

-- Profiles -------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.rows('select tests.label(id) from public.profiles'), tests.sorted('{owner,editor,viewer}'),
  'owner sees themselves and the people they share with');
select tests.authenticate_as('editor');
select is(tests.rows('select tests.label(id) from public.profiles'), tests.sorted('{owner,editor,viewer}'),
  'editor sees the owner and the others with access inside the shared tree');
select tests.authenticate_as('viewer');
select is(tests.rows('select tests.label(id) from public.profiles'), tests.sorted('{owner,viewer}'),
  'viewer sees the owner, but not people with access only to the folder above');
select tests.authenticate_as('stranger');
select is(tests.rows('select tests.label(id) from public.profiles'), '{stranger}',
  'stranger sees only themselves');
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.profiles', '42501', 'permission denied for table profiles',
  'anon cannot read profiles');

select tests.authenticate_as('viewer');
select is(tests.affected($$update public.profiles set full_name = 'Vee'$$), 1, 'users rename themselves, and only themselves');
select is(tests.affected($$update public.profiles set avatar_key = 'a/' || auth.uid() || '/' || gen_random_uuid()$$), 1,
  'users set a picture in their own avatar folder');
select throws_ok($$update public.profiles set avatar_key = 'a/' || tests.id('owner') || '/' || gen_random_uuid()$$,
  '23514', null, 'a picture key can''t point into someone else''s avatar folder');
select throws_ok($$update public.profiles set avatar_key = 'u/' || auth.uid() || '/' || gen_random_uuid()$$,
  '23514', null, 'a picture key can''t point at a file');
select throws_ok($$update public.profiles set avatar_key = 'a/' || auth.uid() || '/../u/x'$$,
  '23514', null, 'a picture key is exactly a/<own id>/<uuid>');
select lives_ok($$update public.profiles set avatar_key = null$$, 'users remove their picture');
select is(tests.affected($$update public.profiles set drive_view = 'grid'$$), 1,
  'users choose grid or list for themselves, and only themselves');
select is((select drive_view::text from public.profiles where id = auth.uid()), 'grid', 'the choice is kept');
select throws_ok($$update public.profiles set drive_view = 'table'$$, '22P02', null, 'only grid or list');
select tests.authenticate_as('owner');
select is((select drive_view from public.profiles where id = auth.uid()), null::public.drive_view,
  'everyone else keeps the default until they choose');
select tests.authenticate_as('viewer');
select throws_ok($$update public.profiles set storage_quota = 999999999999$$, '42501', 'permission denied for table profiles',
  'users cannot raise their quota');
select throws_ok($$update public.profiles set storage_used = 0$$, '42501', 'permission denied for table profiles',
  'users cannot reset their usage');
select throws_ok($$update public.profiles set is_demo = false$$, '42501', 'permission denied for table profiles',
  'users cannot change the demo flag');
select throws_ok($$update public.profiles set email = 'other@test.dev'$$, '42501', 'permission denied for table profiles',
  'email follows the auth account and cannot be edited here');
select throws_ok(format($$update public.profiles set id = %L$$, gen_random_uuid()), '42501', 'permission denied for table profiles',
  'ids are fixed');
select throws_ok(format($$insert into public.profiles (id, email) values (%L, 'x@test.dev')$$, gen_random_uuid()),
  '42501', 'permission denied for table profiles', 'profiles are created only by sign-up');
select throws_ok('delete from public.profiles', '42501', 'permission denied for table profiles',
  'profiles are deleted only with the account');
select tests.clear_authentication();
select is(tests.rows($$select tests.label(id) || '=' || coalesce(full_name, '') from public.profiles
                       where id in (select id from tests.ids)$$),
  tests.sorted('{editor=Editor,owner=Owner,stranger=Stranger,viewer=Vee}'),
  'only the viewer''s own name changed; sign-up copied the others from the sign-up form');

-- Stars ----------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.rows('select tests.label(item_id) from public.stars'), '{f1}', 'owner sees only their stars');
select tests.authenticate_as('viewer');
select is(tests.rows('select tests.label(item_id) from public.stars'), '{f2}', 'viewer sees only their stars');
select lives_ok(format('insert into public.stars (item_id) values (%L)', tests.id('f4')), 'viewer stars a shared file');
select throws_ok(format('insert into public.stars (item_id) values (%L)', tests.id('f1')), '42501',
  'new row violates row-level security policy for table "stars"', 'viewer cannot star a file they cannot see');
select throws_ok(format('insert into public.stars (user_id, item_id) values (%L, %L)', tests.id('owner'), tests.id('f2')),
  '42501', 'permission denied for table stars', 'nobody stars on someone else''s behalf');
select tests.authenticate_as('editor');
select throws_ok(format('insert into public.stars (item_id) values (%L)', tests.id('p1')), '42501',
  'new row violates row-level security policy for table "stars"',
  'editor cannot star someone else''s unfinished upload in the shared folder');
select tests.authenticate_as('owner');
select lives_ok(format('insert into public.stars (item_id) values (%L)', tests.id('p1')), 'owners can star their own upload');
select tests.authenticate_as('stranger');
select throws_ok(format('insert into public.stars (item_id) values (%L)', tests.id('f1')), '42501',
  'new row violates row-level security policy for table "stars"', 'stranger cannot star a file to probe it');
select is(tests.affected('delete from public.stars'), 0, 'stranger cannot remove other people''s stars');
select tests.authenticate_as('owner');
select is(tests.affected('delete from public.stars'), 2, 'owner removes their own stars only');
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.stars', '42501', 'permission denied for table stars', 'anon has no stars');

-- Recents --------------------------------------------------------------------------------------------

select tests.authenticate_as('editor');
select is(tests.rows('select tests.label(item_id) from public.recents'), '{f1}', 'editor sees only their recents');
select lives_ok(format('select public.touch_recent(%L)', tests.id('f2')), 'editor records opening a shared file');
select lives_ok(format('select public.touch_recent(%L)', tests.id('f2')), 'opening it again just updates the time');
select is(tests.rows('select tests.label(item_id) from public.recents'), tests.sorted('{f1,f2}'), 'no duplicates');
select throws_ok(format('select public.touch_recent(%L)', tests.id('R')), '42501',
  'new row violates row-level security policy for table "recents"', 'editor cannot record a file they cannot see');
select tests.authenticate_as('stranger');
select is(tests.affected('update public.recents set touched_at = now()'), 0, 'stranger cannot touch other people''s recents');
select is(tests.affected('delete from public.recents'), 0, 'stranger cannot clear other people''s recents');
select tests.authenticate_as('viewer');
select is(tests.affected('delete from public.recents'), 1, 'viewer clears their own');
select tests.authenticate_as_anon();
select throws_ok(format('select public.touch_recent(%L)', tests.id('f2')), '42501', null, 'anon has no recents');

-- Activity -------------------------------------------------------------------------------------------

-- Some things to log, done by real users.
select tests.authenticate_as('editor');
select tests.affected(format($$update public.items set name = 'plan-final.pdf' where id = %L$$, tests.id('f1')));
select tests.authenticate_as('owner');
select public.share_item(tests.id('R'), 'stranger@test.dev', 'viewer');

select tests.authenticate_as('owner');
select is(
  tests.rows($$select tests.label(item_id) || ':' || action from public.activity
               where item_id in (select id from tests.ids where label in ('F', 'f1', 'R'))$$),
  tests.sorted('{F:created,F:shared,F:link_created,f1:uploaded,f1:link_created,f1:renamed,R:uploaded,R:shared}'),
  'owner sees the whole history of their items');
select tests.authenticate_as('viewer');
select is(
  tests.rows($$select distinct tests.label(item_id) from public.activity$$),
  tests.sorted('{Sub,Deep,f2,f4,VR}'),
  'viewer sees activity only on items they can see');
select tests.authenticate_as('stranger');
select is(
  tests.rows($$select distinct tests.label(item_id) from public.activity$$),
  tests.sorted('{R,SR}'),
  'once shared, the stranger sees that file''s history too');
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.activity', '42501', 'permission denied for table activity', 'anon sees no activity');

select tests.clear_authentication();
select is(
  (select actor_id from public.activity where action = 'renamed' and item_id = tests.id('f1')),
  tests.id('editor'),
  'the log records who did it');
select is(
  (select details from public.activity where action = 'renamed' and item_id = tests.id('f1')),
  '{"from": "plan.pdf", "to": "plan-final.pdf"}'::jsonb,
  'and what changed');

-- Nobody writes the log by hand, not even about their own items.
select tests.authenticate_as('owner');
select throws_ok(format($$insert into public.activity (item_id, action) values (%L, 'created')$$, tests.id('R')),
  '42501', 'permission denied for table activity', 'owner cannot add log entries');
select throws_ok($$update public.activity set details = '{}'$$, '42501', 'permission denied for table activity',
  'owner cannot edit the log');
select throws_ok('delete from public.activity', '42501', 'permission denied for table activity',
  'owner cannot erase the log');
select tests.authenticate_as('editor');
select throws_ok(format($$insert into public.activity (item_id, action) values (%L, 'trashed')$$, tests.id('F')),
  '42501', 'permission denied for table activity', 'editor cannot forge log entries');
select tests.authenticate_as('stranger');
select throws_ok('delete from public.activity', '42501', 'permission denied for table activity',
  'stranger cannot erase the log');

-- Removing a share is logged on the item, and the person loses the item's history with it.
select tests.authenticate_as('owner');
select is(tests.affected(format('delete from public.item_shares where item_id = %L', tests.id('R'))), 1, 'owner unshares R');
select tests.authenticate_as('stranger');
select is(tests.rows($$select distinct tests.label(item_id) from public.activity$$), '{SR}',
  'the stranger no longer sees R''s history');

select * from finish();
rollback;
