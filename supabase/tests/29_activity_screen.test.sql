-- The Activity screen: what gets logged, and that everyone reads only what's theirs to read.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(50);

-- What someone's screen shows, as item:action (or the kept name, once the item is deleted).
create function tests.feed(p_type text default null, p_who text default 'any')
returns text[]
language sql
as $$
  select array(
    select coalesce(a.item_name, '-') || ':' || a.action
    from public.my_activity(p_type, p_who, p_limit => 100) a
    order by a.created_at desc, a.id desc)
$$;
create function tests.forget() returns void language sql security definer as $$ delete from public.activity where true $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Everyone's starting point: their own things and what's shared with them.
select tests.authenticate_as('stranger');
select is(tests.feed(), '{s.txt:uploaded}'::text[], 'a stranger sees only their own history');
select tests.authenticate_as('viewer');
select is(
  tests.sorted(tests.feed()),
  tests.sorted('{Designs:created,Archive:created,logo.png:uploaded,draft.txt:uploaded,v.txt:uploaded,Designs:shared,Designs:link_created}'),
  'a viewer sees the folder shared with them and nothing above it');
select tests.authenticate_as('editor');
select ok(not 'private.txt:uploaded' = any (tests.feed()), 'an editor sees nothing outside the shared folder');
select ok('plan.pdf:uploaded' = any (tests.feed()), 'and sees what is inside it');
select ok('old.pdf:trashed' = any (tests.feed('trash')), 'including its trash');
select tests.authenticate_as_anon();
select throws_ok('select * from public.my_activity()', '42501', null, 'anon has no activity');
select throws_ok(format('select public.log_download(%L)', tests.id('f2')), '42501', null, 'anon logs no downloads');

-- Stars and downloads are private to whoever did them.
select tests.clear_authentication();
select tests.forget();
select tests.authenticate_as('editor');
insert into public.stars (item_id) values (tests.id('f1'));
select public.log_download(tests.id('f1'));
select public.log_download(tests.id('f1'));
select is(tests.feed(), '{plan.pdf:downloaded,plan.pdf:starred}'::text[],
  'stars and downloads are logged, repeated downloads once');
delete from public.stars where item_id = tests.id('f1');
select is((tests.feed())[1], 'plan.pdf:unstarred', 'and taking the star off');
select is((select count(*)::int from public.item_activity(tests.id('f1'))), 3, 'they see them on the item too');
select tests.authenticate_as('owner');
select is(tests.feed(), '{}'::text[], 'the owner of the file does not see them');
select is_empty(format('select * from public.item_activity(%L)', tests.id('f1')), 'nor on the item');
select is_empty('select * from public.activity', 'nor straight from the table');
select throws_ok(format('select public.log_download(%L)', tests.id('F')), 'P0002', null, 'folders are not downloaded');
select throws_ok(format('select public.log_download(%L)', tests.id('p1')), 'P0002', null, 'nor unfinished uploads');
select throws_ok(format('select public.log_download(%L)', tests.id('t1')), 'P0002', null, 'nor things in the trash');
insert into public.stars (item_id) values (tests.id('p1'));
select is(tests.feed(), '{}'::text[], 'nothing is logged about an unfinished upload');
select tests.authenticate_as('stranger');
select throws_ok(format('select public.log_download(%L)', tests.id('f1')), 'P0002', 'Item not found',
  'no logging on things you cannot see');

-- Invites.
select tests.clear_authentication();
select tests.forget();
select tests.authenticate_as('owner');
select public.share_item(tests.id('R'), 'new@test.dev', 'editor');
select is((select details from public.my_activity('sharing')), '{"email": "new@test.dev", "role": "editor"}'::jsonb,
  'an invite is logged with its address and role');
update public.share_invites set role = 'viewer' where item_id = tests.id('R');
select is(
  (select details from public.my_activity('sharing') where action = 'invite_changed'),
  '{"email": "new@test.dev", "from": "editor", "to": "viewer"}'::jsonb, 'changing its role is logged');
select public.share_item(tests.id('F'), 'secret@test.dev', 'viewer');
delete from public.share_invites where email = 'secret@test.dev';
select tests.authenticate_as('editor');
select is(tests.feed(), '{}'::text[], 'an editor doesn''t see who was invited, even to what they can see');
select is_empty(format('select * from public.item_activity(%L)', tests.id('F')), 'nor on the item');
select is_empty('select * from public.activity', 'nor straight from the table');
select tests.authenticate_as('owner');
delete from public.share_invites where item_id = tests.id('R');
select is((tests.feed())[1], 'private.txt:invite_removed', 'so is cancelling it');
select public.share_item(tests.id('R'), 'new@test.dev', 'editor');
select tests.clear_authentication();
select tests.create_user('new');
select tests.authenticate_as('owner');
select is((tests.feed())[1:2], '{private.txt:shared,private.txt:invited}'::text[],
  'a claimed invite is logged as the share, not as a removal');
select is((select actor_id from public.my_activity() order by id desc limit 1), tests.id('owner'),
  'credited to whoever sent it');
select tests.authenticate_as('new');
select is(tests.feed(p_who => 'me'), '{}'::text[], 'and not to the person who signed up');
select ok('private.txt:shared' = any (tests.feed()), 'who sees that it was shared');

-- Deleting: the history stays, for the owner only.
select tests.clear_authentication();
select tests.forget();
select tests.authenticate_as('editor');
update public.items set name = 'plan-2.pdf' where id = tests.id('f1');
insert into public.stars (item_id) values (tests.id('f1'));
select tests.authenticate_as('owner');
select public.trash_item(tests.id('F'));
select public.delete_forever(tests.id('F'));
select is(tests.feed(), '{old.pdf:deleted,Projects:deleted,Projects:trashed,plan-2.pdf:renamed}'::text[],
  'a deleted folder is logged once (what was trashed before it, on its own), and the history of what was inside keeps its name');
select is((select array_agg(distinct item_id) from public.my_activity()), '{NULL}'::uuid[], 'but points at nothing');
select is(tests.feed('trash'), '{old.pdf:deleted,Projects:deleted,Projects:trashed}'::text[], 'filter: trash');
select tests.authenticate_as('editor');
select is(tests.feed(), '{notes.md:moved}'::text[], 'the editor''s view of it ends with it, but for their own file handed back');
select is(tests.rows('select action::text from public.activity'), '{moved}', 'in the table as well');
select tests.clear_authentication();
select is((select item_id from public.activity where action = 'renamed'), null, 'nothing dangles');
select is_empty($$select 1 from public.activity where action = 'starred'$$, 'other people''s stars go with the item');

-- The daily purge is logged as automatic.
select tests.forget();
select tests.authenticate_as('stranger');
select public.trash_item(tests.id('SR'));
select tests.clear_authentication();
update public.items set trashed_at = now() - interval '40 days' where id = tests.id('SR');
select public.purge_trash();
select tests.authenticate_as('stranger');
select is((select details from public.my_activity('trash') where action = 'deleted'), '{"automatic": true}'::jsonb,
  'the purge is logged as automatic');

-- The account.
select tests.clear_authentication();
select tests.forget();
select tests.authenticate_as('viewer');
update public.profiles set full_name = 'Vi' where id = tests.id('viewer');
select tests.clear_authentication();
update auth.users set last_sign_in_at = now() where id = tests.id('viewer');
update auth.users set encrypted_password = 'changed' where id = tests.id('viewer');
select tests.authenticate_as('viewer');
select is(tests.feed('account'), '{-:password_changed,-:signed_in,-:name_changed}'::text[],
  'sign-ins and account changes are logged');
select is(tests.feed('files'), '{}'::text[], 'and filtered apart');
select tests.authenticate_as('owner');
select is(tests.feed(), '{}'::text[], 'for that person only, even when they share a folder');

-- Filters, paging, bad input.
select tests.clear_authentication();
select tests.forget();
select tests.authenticate_as('viewer');
update public.items set name = 'v2.txt' where id = tests.id('VR');
update public.items set name = 'v3.txt' where id = tests.id('VR');
update public.items set name = 'v4.txt' where id = tests.id('VR');
select is(array_length(tests.feed(p_who => 'me'), 1), 3, 'who: me');
select is(tests.feed(p_who => 'others'), '{}'::text[], 'who: others');
with first_page as (
  select id, created_at from public.my_activity(p_limit => 2)
), last_row as (
  select * from first_page order by created_at, id limit 1
)
select is(
  array(select id from first_page order by id desc)
    || array(select a.id from last_row, public.my_activity(null, 'any', last_row.created_at, last_row.id, 2) a),
  array(select id from public.my_activity() order by id desc),
  'pages follow on without gaps or repeats');
select throws_ok($$select * from public.my_activity('movies')$$, 'LK422', 'Unknown type', 'unknown types');
select throws_ok($$select * from public.my_activity(null, 'them')$$, 'LK422', null, 'unknown who');
select throws_ok($$select * from public.my_activity(p_before_at => now())$$, 'LK422', null, 'half a cursor');

-- Someone's file goes when the account owning the folder it's in does: they're told, and not that it
-- was the purge.
select tests.clear_authentication();
select tests.forget();
select tests.new_folder('VF', 'stranger', null, 'Shared place');
select tests.new_file('VE', 'editor', 'VF', 'report.pdf');
delete from auth.users where id = tests.id('stranger');
select is(
  (select details from public.activity where action = 'deleted' and owner_id = tests.id('editor')), '{}'::jsonb,
  'a file lost with someone''s account is logged for its owner');

-- Deleting an account takes its log with it, and doesn't trip over it.
select tests.clear_authentication();
select lives_ok(format('delete from auth.users where id = %L', tests.id('viewer')), 'an account can be deleted');
select is_empty(format('select 1 from public.activity where owner_id = %L', tests.id('viewer')), 'with its log');
select ok(to_regprocedure('public.log_activity(uuid,activity_action,jsonb)') is null, 'logging itself is not callable');
select is(
  (select count(*)::int from public.activity where owner_id is null), 0, 'every entry has an owner');

select * from finish();
rollback;
