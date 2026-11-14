-- Trash, restore and delete forever.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(46);

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
select tests.authenticate_as('editor');
select throws_ok(format('select public.restore_item(%L)', tests.id('f2')), 'LK409', 'The folder it was in is in the trash',
  'an editor cannot bring the owner''s file back to the top of a drive when its folder is in the trash');
select tests.authenticate_as('owner');
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
select is(
  tests.rows(format($$select r.name || ' in ' || tests.label(r.parent_id) from public.restore_item(%L) r$$, tests.id('t1'))),
  '{old (1).pdf in F}',
  'restoring onto a name taken meanwhile gives it a number, and says so');

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

-- Restoring when the folder it was in is in the trash too ---------------------------------------------

select tests.clear_authentication();
select tests.new_folder('H', 'owner', null, 'Clients');
select tests.new_folder('H2', 'owner', 'H', 'Acme');
select tests.new_file('h1', 'owner', 'H2', 'brief.pdf');
select tests.new_file('h2', 'owner', 'H', 'brief.pdf');
select tests.new_file('top', 'owner', null, 'brief.pdf');
select tests.new_file('h3', 'owner', 'H', 'shared-notes.md', p_mime_type => 'text/markdown');
insert into public.item_shares (item_id, user_id, role, created_by)
values (tests.id('H'), tests.id('editor'), 'editor', tests.id('owner'));
select tests.new_file('eh', 'editor', 'H2', 'editor.txt', p_mime_type => 'text/plain');
select tests.authenticate_as('owner');
select public.trash_item(tests.id('h2'));
select public.trash_item(tests.id('H'));
select is(
  tests.rows(format($$select r.name || ' in ' || coalesce(tests.label(r.parent_id), 'My Drive') from public.restore_item(%L) r$$, tests.id('h2'))),
  '{brief (1).pdf in My Drive}',
  'with its folder in the trash, it goes to the top of the owner''s drive, under a free name');
select throws_ok(format('select public.restore_item(%L)', tests.id('H2')), 'LK409', 'Restore the folder it was in instead',
  'a folder trashed with its parent still comes back only with it');
select public.restore_item(tests.id('H'));
select public.trash_item(tests.id('H2'));
select public.trash_item(tests.id('H'));
select throws_ok(format('select public.restore_item(%L)', tests.id('H2')), 'LK409', 'The folder it was in is in the trash',
  'the owner cannot take someone else''s file out of the shared tree by restoring the folder it''s in');
select tests.clear_authentication();
delete from public.items where id = tests.id('eh');
select tests.authenticate_as('owner');
select is(
  tests.rows(format($$select r.name || ' in ' || coalesce(tests.label(r.parent_id), 'My Drive') from public.restore_item(%L) r$$, tests.id('H2'))),
  '{Acme in My Drive}',
  'once everything in it is theirs, it comes back to the top of their drive');
select is(
  tests.rows($$select tests.label(id) || ':' || cardinality(ancestors) || ':' || (trashed_at is null) from public.items
    where id in (tests.id('H2'), tests.id('h1'))$$),
  tests.sorted('{H2:0:true,h1:1:true}'),
  'with everything inside it, paths rewritten');

-- Names for copies --------------------------------------------------------------------------------------

select tests.clear_authentication();
select is(private.free_name(null, tests.id('owner'), 'brief.pdf'), 'brief (2).pdf', 'the next free number');
select is(private.free_name(null, tests.id('owner'), 'BRIEF.PDF'), 'BRIEF (2).PDF', 'names clash ignoring case');
select is(private.free_name(null, tests.id('owner'), 'fresh.pdf'), 'fresh.pdf', 'a free name stays as it is');
select tests.new_file('dot', 'owner', null, '.env', p_mime_type => 'text/plain');
select tests.new_file('tgz', 'owner', null, 'site.tar.gz', p_mime_type => 'application/gzip');
select is(private.free_name(null, tests.id('owner'), '.env'), '.env (1)', 'a leading dot is not an extension');
select is(private.free_name(null, tests.id('owner'), 'site.tar.gz'), 'site.tar (1).gz', 'the number goes before the last extension');
select tests.new_file('long', 'owner', null, repeat('a', 251) || '.pdf');
select is(private.free_name(null, tests.id('owner'), repeat('a', 251) || '.pdf'), repeat('a', 247) || ' (1).pdf',
  'a long name loses the end of its base so the copy still fits');

select * from finish();
rollback;
