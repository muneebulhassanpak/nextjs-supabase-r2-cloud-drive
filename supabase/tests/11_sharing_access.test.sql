-- Shares and invites: who sees them, and who can change or remove them.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(36);

-- item_shares: select -------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.rows($$select tests.label(item_id) || ':' || tests.label(user_id) from public.item_shares$$),
  tests.sorted('{F:editor,Sub:viewer}'), 'owner sees every share on their items');
select tests.authenticate_as('editor');
select is(tests.rows($$select tests.label(item_id) || ':' || tests.label(user_id) from public.item_shares$$),
  tests.sorted('{F:editor,Sub:viewer}'), 'editor sees who else has access inside the shared tree');
select tests.authenticate_as('viewer');
select is(tests.rows($$select tests.label(item_id) || ':' || tests.label(user_id) from public.item_shares$$),
  '{Sub:viewer}', 'viewer sees shares on what they can see, not on the folder above');
select tests.authenticate_as('stranger');
select is_empty('select 1 from public.item_shares', 'stranger sees no shares');
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.item_shares', '42501', 'permission denied for table item_shares',
  'anon cannot read shares');

-- item_shares: insert (only through share_item) ------------------------------------------------------

select tests.authenticate_as('owner');
select throws_ok(
  format($$insert into public.item_shares (item_id, user_id, role, created_by) values (%L, %L, 'viewer', %L)$$,
    tests.id('R'), tests.id('stranger'), tests.id('owner')),
  '42501', 'permission denied for table item_shares', 'owner cannot insert shares directly');
select tests.authenticate_as('viewer');
select throws_ok(
  format($$insert into public.item_shares (item_id, user_id, role, created_by) values (%L, %L, 'editor', %L)$$,
    tests.id('F'), tests.id('viewer'), tests.id('owner')),
  '42501', 'permission denied for table item_shares', 'viewer cannot grant themselves access');
select tests.authenticate_as('stranger');
select throws_ok(
  format($$insert into public.item_shares (item_id, user_id, role, created_by) values (%L, %L, 'editor', %L)$$,
    tests.id('F'), tests.id('stranger'), tests.id('owner')),
  '42501', 'permission denied for table item_shares', 'stranger cannot grant themselves access');

-- item_shares: update role --------------------------------------------------------------------------

select tests.authenticate_as('viewer');
select is(tests.affected(format($$update public.item_shares set role = 'editor' where item_id = %L$$, tests.id('Sub'))), 0,
  'viewer cannot upgrade their own share');
select tests.authenticate_as('editor');
select is(tests.affected($$update public.item_shares set role = 'editor'$$), 0,
  'editor cannot change anyone''s role (only the owner can)');
select tests.authenticate_as('stranger');
select is(tests.affected($$update public.item_shares set role = 'editor'$$), 0,
  'stranger cannot change roles');
select tests.authenticate_as('owner');
select throws_ok(format($$update public.item_shares set user_id = %L where item_id = %L$$, tests.id('stranger'), tests.id('Sub')),
  '42501', 'permission denied for table item_shares', 'a share cannot be handed to someone else');
select throws_ok(format($$update public.item_shares set item_id = %L where item_id = %L$$, tests.id('R'), tests.id('Sub')),
  '42501', 'permission denied for table item_shares', 'a share cannot be moved to another item');
select is(tests.affected(format($$update public.item_shares set role = 'editor' where item_id = %L$$, tests.id('Sub'))), 1,
  'owner changes a role');
select tests.clear_authentication();
select is((select role from public.item_shares where item_id = tests.id('Sub')), 'editor'::public.share_role,
  'only the owner''s role change happened');

-- item_shares: delete -------------------------------------------------------------------------------

select tests.authenticate_as('editor');
select is(tests.affected(format('delete from public.item_shares where item_id = %L', tests.id('Sub'))), 0,
  'editor cannot remove someone else''s access');
select tests.authenticate_as('stranger');
select is(tests.affected('delete from public.item_shares'), 0, 'stranger cannot remove shares');
select tests.authenticate_as('viewer');
select is(tests.affected('delete from public.item_shares'), 1, 'viewer can leave: removes only their own share');
select is_empty(format('select 1 from public.items where id = %L', tests.id('f2')),
  'after leaving, the viewer no longer sees the files');
select tests.authenticate_as('owner');
select is(tests.affected(format('delete from public.item_shares where item_id = %L', tests.id('F'))), 1,
  'owner removes the editor''s access');
select tests.authenticate_as('editor');
select is(tests.rows('select tests.label(id) from public.items'), tests.sorted('{e1,EF}'),
  'without the share, the editor sees only what they own (their upload stays theirs)');

-- share_invites --------------------------------------------------------------------------------------

select tests.clear_authentication();
insert into public.item_shares (item_id, user_id, role, created_by) values
  (tests.id('F'), tests.id('editor'), 'editor', tests.id('owner')),
  (tests.id('Sub'), tests.id('viewer'), 'viewer', tests.id('owner'));

select tests.authenticate_as('owner');
select is(tests.rows($$select tests.label(item_id) || ':' || email from public.share_invites$$),
  '{F:friend@test.dev}', 'owner sees pending invites');
select tests.authenticate_as('editor');
select is(tests.rows($$select tests.label(item_id) || ':' || email from public.share_invites$$),
  '{F:friend@test.dev}', 'editor sees pending invites on the shared folder');
select tests.authenticate_as('viewer');
select is_empty('select 1 from public.share_invites', 'viewer cannot see invites on the folder above');
select tests.authenticate_as('stranger');
select is_empty('select 1 from public.share_invites', 'stranger sees no invites');
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.share_invites', '42501', 'permission denied for table share_invites',
  'anon cannot read invites');

select tests.authenticate_as('owner');
select throws_ok(
  format($$insert into public.share_invites (item_id, email, role, created_by) values (%L, 'x@test.dev', 'viewer', %L)$$,
    tests.id('R'), tests.id('owner')),
  '42501', 'permission denied for table share_invites', 'invites are only created through share_item');
select throws_ok($$update public.share_invites set email = 'attacker@test.dev'$$,
  '42501', 'permission denied for table share_invites', 'an invite cannot be redirected to another email');
select tests.authenticate_as('editor');
select is(tests.affected($$update public.share_invites set role = 'editor'$$), 0, 'editor cannot change an invite');
select is(tests.affected('delete from public.share_invites'), 0, 'editor cannot cancel an invite');
select tests.authenticate_as('stranger');
select is(tests.affected('delete from public.share_invites'), 0, 'stranger cannot cancel an invite');
select tests.authenticate_as('owner');
select is(tests.affected($$update public.share_invites set role = 'editor'$$), 1, 'owner changes an invite''s role');
select is(tests.affected('delete from public.share_invites'), 1, 'owner cancels an invite');
select tests.clear_authentication();
select is_empty('select 1 from public.share_invites', 'the invite is gone');

-- Owning a folder inside someone else's tree gives no rights over what others put in it.
select tests.clear_authentication();
select tests.new_folder('EE', 'editor', 'F', 'Editor''s folder');
select tests.new_file('oe', 'owner', 'EE', 'owner-in-editor-folder.txt');
select tests.authenticate_as('editor');
select isnt_empty(format('select 1 from public.items where id = %L', tests.id('oe')),
  'while shared, the editor sees the owner''s file in their folder');
select tests.clear_authentication();
delete from public.item_shares where item_id = tests.id('F') and user_id = tests.id('editor');
select tests.authenticate_as('editor');
select is(tests.rows($$select tests.label(id) from public.items where id in (
  select id from tests.ids where label in ('EE', 'oe'))$$), '{EE}',
  'after the share is revoked they keep their folder, but not the owner''s file inside it');

select * from finish();
rollback;
