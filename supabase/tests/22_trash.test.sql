-- Trash, restore and delete forever.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(35);

-- Trash ------------------------------------------------------------------------------------------------

select tests.authenticate_as('viewer');
select throws_ok(format('select public.trash_item(%L)', tests.id('f2')), '42501', null, 'viewer cannot trash');
select tests.authenticate_as('stranger');
select throws_ok(format('select public.trash_item(%L)', tests.id('f1')), 'P0002', 'Item not found', 'stranger cannot trash');
select tests.authenticate_as('editor');
select throws_ok(format('select public.trash_item(%L)', tests.id('F')), '42501', 'Only the owner can remove this',
  'editor cannot trash the shared folder itself');
select tests.authenticate_as('owner');
select throws_ok(format('select public.trash_item(%L)', tests.id('p1')), 'P0002', 'Item not found',
  'unfinished uploads are cancelled, not trashed');
select throws_ok(format('select public.trash_item(%L)', tests.id('t1')), 'LK409', 'This is already in the trash',
  'trashing twice is refused');

-- f2 goes in the trash first, then its folder.
select tests.authenticate_as('editor');
select lives_ok(format('select public.trash_item(%L)', tests.id('f2')), 'editor trashes a file inside the shared folder');
select lives_ok(format('select public.trash_item(%L)', tests.id('Sub')), 'editor trashes a subfolder');
select tests.clear_authentication();
select is(
  tests.rows($$select tests.label(id) || '>' || tests.label(trash_root) from public.items
    where trashed_at is not null and id in (select id from tests.ids)$$),
  tests.sorted('{Deep>Sub,Sub>Sub,f2>f2,f4>Sub,t1>t1}'),
  'everything inside goes with the folder; f2 keeps its own trash entry');
select is((select trashed_by from public.items where id = tests.id('Sub')), tests.id('editor'), 'it records who trashed it');

select tests.authenticate_as('viewer');
select is_empty('select 1 from public.items where owner_id <> auth.uid()', 'viewer no longer sees trashed items');
select tests.authenticate_as('editor');
select is(tests.rows('select tests.label(id) from public.items where trashed_at is not null'),
  tests.sorted('{Sub,Deep,f2,f4,t1}'), 'editor still sees them, so they can restore them');

select tests.authenticate_as('owner');
select throws_ok(format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'new')$$, tests.id('Sub')),
  'LK409', 'That folder is in the trash', 'nothing new goes inside a trashed folder');
select throws_ok(format($$select public.start_upload(%L, 'new.txt', 1, 'text/plain')$$, tests.id('Deep')),
  'LK409', 'That folder is in the trash', 'no uploads into a trashed folder either');
select throws_ok(format('select public.move_item(%L, %L)', tests.id('R'), tests.id('Sub')),
  'LK409', 'That folder is in the trash', 'and no moves into one');

-- Restore -------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select throws_ok(format('select public.restore_item(%L)', tests.id('f4')), 'LK409', 'Restore the folder it was in instead',
  'an item trashed with its folder comes back with the folder');
select throws_ok(format('select public.restore_item(%L)', tests.id('f2')), 'LK409', 'The folder it was in is in the trash',
  'an item cannot come back into a trashed folder');
select throws_ok(format('select public.restore_item(%L)', tests.id('f1')), 'LK409', 'This isn''t in the trash',
  'restoring something not in the trash is refused');
select tests.authenticate_as('viewer');
select throws_ok(format('select public.restore_item(%L)', tests.id('Sub')), 'P0002', 'Item not found',
  'viewer cannot restore (or see) it');
select tests.authenticate_as('editor');
select lives_ok(format('select public.restore_item(%L)', tests.id('Sub')), 'editor restores the folder');
select tests.clear_authentication();
select is(tests.rows('select tests.label(id) from public.items where trashed_at is not null and id in (select id from tests.ids)'),
  tests.sorted('{f2,t1}'),
  'what went in with the folder comes back; f2 was trashed on its own and stays in the trash');
select ok(
  not exists (
    select 1 from public.items c join public.items p on p.id = c.parent_id
    where p.trashed_at is not null and c.trashed_at is null
  ),
  'nothing outside the trash sits inside a trashed folder');

select tests.clear_authentication();
select tests.new_file('dup', 'owner', 'F', 'old.pdf');
select tests.authenticate_as('owner');
select throws_ok(format('select public.restore_item(%L)', tests.id('t1')), '23505', null,
  'restoring onto a name now taken is refused');

-- Delete forever --------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select throws_ok(format('select public.delete_forever(%L)', tests.id('Sub')), 'LK409', 'Move it to the trash first',
  'only trashed items can be deleted forever');
select lives_ok(format('select public.trash_item(%L)', tests.id('e1')), 'a folder owner can trash a file someone uploaded into it');
select throws_ok(format('select public.delete_forever(%L)', tests.id('e1')), '42501', 'Only the owner can delete this forever',
  'but cannot delete it forever: only its owner can');
select public.restore_item(tests.id('e1'));
select public.trash_item(tests.id('F'));
select tests.authenticate_as('editor');
select throws_ok(format('select public.delete_forever(%L)', tests.id('F')), '42501', 'Only the owner can delete this forever',
  'editors cannot delete forever');
select tests.authenticate_as('stranger');
select throws_ok(format('select public.delete_forever(%L)', tests.id('F')), 'P0002', 'Item not found',
  'strangers cannot either');

select tests.authenticate_as('owner');
select is(
  tests.rows(format('select k from public.delete_forever(%L) k', tests.id('F'))),
  tests.sorted(array['u/' || tests.id('owner') || '/f1', 'u/' || tests.id('owner') || '/f2', 'u/' || tests.id('owner') || '/f4',
    'u/' || tests.id('owner') || '/t1', 'u/' || tests.id('owner') || '/p1', 'u/' || tests.id('owner') || '/dup']),
  'deleting returns the storage key of every file of theirs inside, so the bytes can be deleted too');
select tests.clear_authentication();
select is(tests.rows($$select tests.label(id) from public.items where owner_id in (
  select id from tests.ids where label in ('owner', 'editor'))$$), tests.sorted('{R,EF,e1}'),
  'the folder and everything the owner had in it is gone');
select is(
  (select row(parent_id, trash_root = id, trashed_at is not null)::text from public.items where id = tests.id('e1')),
  row(null::uuid, true, true)::text,
  'the editor''s upload was handed back: top of their drive, in their own trash');
select is(
  tests.rows($$select tests.label(id) || '=' || storage_used from public.profiles where id in (
    select id from tests.ids where label in ('owner', 'editor'))$$),
  tests.sorted('{owner=1000,editor=1000}'),
  'the owner gets their space back; the editor''s file still counts for the editor');

select tests.authenticate_as('owner');
select public.trash_item(tests.id('R'));
select is(tests.rows('select k from public.empty_trash() k'), array['u/' || tests.id('owner') || '/R'],
  'emptying the trash deletes what''s in it and returns the keys');

-- An editor can't destroy the owner's file by putting it in a folder of their own and deleting that.
select tests.clear_authentication();
select tests.new_folder('G', 'owner', null, 'Shared again');
insert into public.item_shares (item_id, user_id, role, created_by)
values (tests.id('G'), tests.id('editor'), 'editor', tests.id('owner'));
select tests.new_folder('EG', 'editor', 'G', 'Editor box');
select tests.new_file('g1', 'owner', 'EG', 'precious.pdf');
select tests.authenticate_as('editor');
select public.trash_item(tests.id('EG'));
select is(tests.rows(format('select k from public.delete_forever(%L) k', tests.id('EG'))), '{}',
  'deleting their folder forever deletes none of the owner''s files');
select tests.clear_authentication();
select is(
  (select row(owner_id, parent_id, trash_root = id)::text from public.items where id = tests.id('g1')),
  row(tests.id('owner'), null::uuid, true)::text,
  'the owner''s file is back at the top of the owner''s drive, in their trash, ready to restore');
select tests.authenticate_as('owner');
select lives_ok(format('select public.restore_item(%L)', tests.id('g1')), 'and the owner restores it');

select * from finish();
rollback;
