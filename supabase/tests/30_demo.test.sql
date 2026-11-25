-- The public demo: it can't be taken over, can't reach anyone outside it, and can be put back.
begin;
\ir helpers/setup.psql
select plan(30);

select tests.create_user('demo');
select tests.create_user('sam');
select tests.create_user('other');
update public.profiles set is_demo = true where id in (tests.id('demo'), tests.id('sam'));
select tests.new_folder('D', 'demo', null, 'Demo folder');
select tests.new_folder('O', 'other', null, 'Other folder');

-- Sign-in details, as Supabase Auth would write them.
select throws_ok(format('update auth.users set %s where id = %L', change, tests.id('demo')), 'LK409', null, change)
from (values
  ($$email = 'mine@test.dev'$$), ($$email_change = 'mine@test.dev'$$), ($$phone = '123'$$),
  ($$encrypted_password = 'x'$$), ($$recovery_token = 'x'$$), ($$reauthentication_token = 'x'$$),
  ($$raw_user_meta_data = '{"a": 1}'$$)
) as t (change);
select lives_ok(
  format('update auth.users set last_sign_in_at = now() where id = %L', tests.id('demo')), 'signing in still works');
select is_empty(
  format($$select 1 from public.activity where actor_id = %L and action = 'signed_in'$$, tests.id('demo')),
  'and isn''t logged');
select lives_ok(
  format($$update auth.users set encrypted_password = 'x' where id = %L$$, tests.id('other')), 'others can change theirs');

-- The profile.
select tests.authenticate_as('demo');
select throws_ok($$update public.profiles set full_name = 'Rude' where id = auth.uid()$$, 'LK409', null, 'not its name');
select throws_ok(
  $$update public.profiles set avatar_key = 'a/' || auth.uid() || '/' || gen_random_uuid() where id = auth.uid()$$,
  'LK409', null, 'nor its picture');
select lives_ok($$update public.profiles set drive_view = 'grid' where id = auth.uid()$$, 'only its view');
select throws_ok($$update public.profiles set is_demo = false where id = auth.uid()$$, '42501', null, 'it stays the demo');

-- Sharing.
select throws_ok(
  format($$select public.share_item(%L, 'nobody@test.dev', 'viewer')$$, tests.id('D')), 'LK422', null, 'no invites');
select throws_ok(
  format('select public.share_item(%L, %L, ''viewer'')', tests.id('D'), (select email from public.profiles where id = auth.uid())),
  'LK422', null, 'nor with itself');
reset role;
select set_config('tests.other', (select email from public.profiles where id = tests.id('other')), true),
  set_config('tests.sam', (select email from public.profiles where id = tests.id('sam')), true),
  set_config('tests.demo', (select email from public.profiles where id = tests.id('demo')), true);
select tests.authenticate_as('demo');
select throws_ok(
  format('select public.share_item(%L, %L, ''viewer'')', tests.id('D'), current_setting('tests.other')),
  'LK422', null, 'no sharing with strangers');
select throws_ok(
  format($$insert into public.item_shares (item_id, user_id, role, created_by) values (%L, %L, 'viewer', auth.uid())$$,
    tests.id('D'), tests.id('other')),
  '42501', null, 'and nothing goes around share_item');
select lives_ok(
  format('select public.share_item(%L, %L, ''viewer'')', tests.id('D'), current_setting('tests.sam')), 'with Sam it works');
select public.create_share_link(tests.id('D'), decode(repeat('ab', 32), 'hex'), null);
select ok(
  (select expires_at <= now() + interval '1 day' from public.share_links where item_id = tests.id('D')),
  'a public link lasts a day at most');
select tests.authenticate_as('other');
select throws_ok(
  format('select public.share_item(%L, %L, ''viewer'')', tests.id('O'), current_setting('tests.demo')),
  'LK422', null, 'nobody shares with the demo');
select lives_ok(
  format('select public.create_share_link(%L, decode(repeat(''cd'', 32), ''hex''), null)', tests.id('O')), 'others'' links');
select is((select expires_at from public.share_links where item_id = tests.id('O')), null, 'keep the expiry they chose');

-- The reset.
select throws_ok($$select public.reset_demo('[]', '[]', '[]', '[]', '[]')$$, '42501', null, 'people can''t run it');
select tests.clear_authentication();
select throws_ok($$select public.reset_demo('[]', '[]', '[]', '[]', '[]')$$, 'LK422', null, 'it needs accounts');
select tests.new_file('junk', 'demo', 'D', 'junk.bin');
create function tests.reset() returns void language sql as $$
  select public.reset_demo(
    jsonb_build_array(
      jsonb_build_object('id', tests.id('demo'), 'full_name', 'Alex'),
      jsonb_build_object('id', tests.id('sam'), 'full_name', 'Sam')),
    jsonb_build_array(
      jsonb_build_object('id', '00000000-0000-4000-8000-000000000001', 'owner_id', tests.id('demo'), 'kind', 'folder',
        'name', 'Projects', 'created_at', '2026-01-01'),
      jsonb_build_object('id', '00000000-0000-4000-8000-000000000002', 'owner_id', tests.id('demo'), 'kind', 'file',
        'parent_id', '00000000-0000-4000-8000-000000000001', 'name', 'a.txt', 'size', 5, 'mime_type', 'text/plain',
        'object_key', 'u/demo/a', 'created_at', '2026-01-02'),
      jsonb_build_object('id', '00000000-0000-4000-8000-000000000003', 'owner_id', tests.id('demo'), 'kind', 'file',
        'name', 'old.txt', 'size', 7, 'mime_type', 'text/plain', 'object_key', 'u/demo/b', 'created_at', '2026-01-02',
        'trashed_at', '2026-01-03')),
    jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-000000000001', 'user_id', tests.id('sam'),
      'role', 'editor', 'created_at', '2026-01-04')),
    jsonb_build_array(jsonb_build_object('user_id', tests.id('demo'), 'item_id', '00000000-0000-4000-8000-000000000001',
      'created_at', '2026-01-05')),
    jsonb_build_array(jsonb_build_object('item_id', '00000000-0000-4000-8000-000000000002', 'actor_id', tests.id('sam'),
      'action', 'renamed', 'details', '{"from": "b", "to": "a"}'::jsonb, 'created_at', '2026-01-06')))
$$;
select tests.reset();
select lives_ok('select tests.reset()', 'it can be run again');
select results_eq(
  format('select name, trashed_at is not null, created_at::date from public.items where owner_id = %L order by created_at, name', tests.id('demo')),
  $$values ('Projects', false, '2026-01-01'::date), ('a.txt', false, '2026-01-02'), ('old.txt', true, '2026-01-02')$$,
  'everything else is gone and the seed is there, on its dates');
select is((select storage_used from public.profiles where id = tests.id('demo')), 12::bigint, 'the space matches');
select results_eq(
  format('select action::text, details ->> ''to'' from public.activity where owner_id = any (array[%L, %L]::uuid[])',
    tests.id('demo'), tests.id('sam')),
  $$values ('renamed', 'a')$$, 'the log holds only what the seed says');
select is((select count(*)::int from public.items where owner_id = tests.id('other')), 1, 'nobody else is touched');

select * from finish();
rollback;
