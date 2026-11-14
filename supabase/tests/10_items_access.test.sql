-- Items: who sees what, and who can create, rename or delete. See helpers/fixture.psql for the world.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(63);

-- Select ---------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(
  tests.rows('select tests.label(id) from public.items'),
  tests.sorted('{F,Sub,Deep,f1,f2,f4,R,t1,p1,e1}'),
  'owner sees all their items (trash and unfinished uploads too) and what others uploaded into their folders'
);

select tests.authenticate_as('editor');
select is(
  tests.rows('select tests.label(id) from public.items'),
  tests.sorted('{F,Sub,Deep,f1,f2,f4,t1,e1,EF}'),
  'editor sees the shared tree (with its trash) and their own items, but not unfinished uploads or the owner''s private file'
);

select tests.authenticate_as('viewer');
select is(
  tests.rows('select tests.label(id) from public.items'),
  tests.sorted('{Sub,Deep,f2,f4,VR}'),
  'viewer sees only the shared subfolder and below, plus their own file'
);

select tests.authenticate_as('stranger');
select is(
  tests.rows('select tests.label(id) from public.items'),
  '{SR}',
  'stranger sees only their own file'
);

select tests.authenticate_as_anon();
select throws_ok(
  'select * from public.items', '42501', 'permission denied for table items',
  'anon cannot read items at all'
);

-- Looking up a hidden item by id gives nothing, the same as an id that doesn't exist.
select tests.authenticate_as('stranger');
select is_empty(
  format('select 1 from public.items where id = %L', tests.id('f1')),
  'stranger looking up a hidden id gets nothing back'
);
select tests.authenticate_as('viewer');
select is_empty(
  format('select 1 from public.items where id = %L', tests.id('t1')),
  'viewer cannot see a trashed file in a folder they cannot edit'
);

-- Insert (create folder) -------------------------------------------------------------------------

select tests.authenticate_as('owner');
select lives_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'by owner')$$, tests.id('F')),
  'owner creates a folder in their folder'
);
select lives_ok(
  $$insert into public.items (parent_id, kind, name) values (null, 'folder', 'owner root')$$,
  'owner creates a folder at their root'
);
select throws_ok(
  $$insert into public.items (parent_id, kind, name) values (null, 'file', 'sneaky.bin')$$,
  '42501', null,
  'files cannot be inserted directly (only through start_upload)'
);
select throws_ok(
  format($$insert into public.items (owner_id, kind, name) values (%L, 'folder', 'for editor')$$, tests.id('editor')),
  '42501', 'permission denied for table items',
  'owner_id cannot be chosen by the caller'
);
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'x')$$, tests.id('f1')),
  'LK422', 'Items can only go inside a folder',
  'a file cannot be a parent'
);
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'PLAN.PDF')$$, tests.id('F')),
  '23505', null,
  'names are unique in a folder, ignoring case'
);
select throws_ok(
  $$insert into public.items (parent_id, kind, name) values (null, 'folder', 'a/b')$$,
  '23514', null,
  'names cannot contain a slash'
);

select tests.authenticate_as('editor');
select lives_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'by editor')$$, tests.id('Deep')),
  'editor creates a folder deep inside the shared tree'
);
select tests.clear_authentication();
select is(
  (select owner_id from public.items where name = 'by editor'),
  tests.id('editor'),
  'the folder belongs to the editor who created it'
);
select is(
  (select ancestors from public.items where name = 'by editor'),
  array[tests.id('F'), tests.id('Sub'), tests.id('Deep')],
  'its path is set from its parent, whatever the caller sent'
);

select tests.authenticate_as('viewer');
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'by viewer')$$, tests.id('Sub')),
  '42501', 'new row violates row-level security policy for table "items"',
  'viewer cannot create inside a folder shared with them'
);
select lives_ok(
  $$insert into public.items (parent_id, kind, name) values (null, 'folder', 'viewer root')$$,
  'viewer creates folders in their own drive'
);

select tests.authenticate_as('stranger');
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'by stranger')$$, tests.id('F')),
  'P0002', 'Folder not found',
  'stranger cannot create inside someone else''s folder'
);
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'x')$$, gen_random_uuid()),
  'P0002', 'Folder not found',
  'a folder that does not exist gives the same answer, so ids reveal nothing'
);
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'x')$$, tests.id('f1')),
  'P0002', 'Folder not found',
  'nor does it reveal that a hidden id is a file'
);
select throws_ok(
  format($$insert into public.items (parent_id, kind, name) values (%L, 'folder', 'x')$$, tests.id('t1')),
  'P0002', 'Folder not found',
  'or that it is in the trash'
);

select tests.authenticate_as_anon();
select throws_ok(
  $$insert into public.items (kind, name) values ('folder', 'anon')$$,
  '42501', 'permission denied for table items',
  'anon cannot create anything'
);

-- Update (rename) --------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.affected(format($$update public.items set name = 'plan v2.pdf' where id = %L$$, tests.id('f1'))), 1,
  'owner renames their file');
select is(tests.affected(format($$update public.items set name = 'notes (owner).md' where id = %L$$, tests.id('e1'))), 1,
  'owner renames a file someone uploaded into their folder');
select is(tests.affected(format($$update public.items set name = 'x.zip' where id = %L$$, tests.id('p1'))), 0,
  'unfinished uploads cannot be renamed');
select is(tests.affected(format($$update public.items set name = 'x.pdf' where id = %L$$, tests.id('t1'))), 0,
  'trashed items cannot be renamed');

select tests.authenticate_as('editor');
select is(tests.affected(format($$update public.items set name = 'plan v3.pdf' where id = %L$$, tests.id('f1'))), 1,
  'editor renames a file in the shared folder');
select is(tests.affected(format($$update public.items set name = 'Projects 2' where id = %L$$, tests.id('F'))), 1,
  'editor renames the shared folder itself');
select is(tests.affected(format($$update public.items set name = 'mine.txt' where id = %L$$, tests.id('R'))), 0,
  'editor cannot rename the owner''s unshared file');
select is(tests.affected(format($$update public.items set name = 'x.pdf' where id = %L$$, tests.id('t1'))), 0,
  'editor cannot rename a trashed item');

select tests.authenticate_as('viewer');
select is(tests.affected(format($$update public.items set name = 'hacked.png' where id = %L$$, tests.id('f2'))), 0,
  'viewer cannot rename a shared file');
select is(tests.affected(format($$update public.items set name = 'v2.txt' where id = %L$$, tests.id('VR'))), 1,
  'viewer renames their own file');

select tests.authenticate_as('stranger');
select is(tests.affected($$update public.items set name = 'gotcha'$$), 1,
  'stranger updating every row only reaches their own');

select tests.clear_authentication();
select is(
  tests.rows($$select tests.label(id) || '=' || name from public.items where id in (
    select id from tests.ids where label in ('f1', 'F', 'R', 'f2', 't1', 'p1', 'SR'))$$),
  tests.sorted('{"F=Projects 2","R=private.txt","SR=gotcha","f1=plan v3.pdf","f2=logo.png","p1=uploading.zip","t1=old.pdf"}'),
  'only the allowed renames happened'
);

-- Protected columns: nobody can change these directly, not even the owner.
select tests.authenticate_as('owner');
select throws_ok(format($$update public.items set owner_id = %L where id = %L$$, tests.id('editor'), tests.id('f1')),
  '42501', 'permission denied for table items', 'owner_id cannot be changed');
select throws_ok(format($$update public.items set parent_id = null where id = %L$$, tests.id('f1')),
  '42501', 'permission denied for table items', 'parent_id cannot be changed directly (use move_item)');
select throws_ok(format($$update public.items set ancestors = '{}' where id = %L$$, tests.id('f1')),
  '42501', 'permission denied for table items', 'ancestors cannot be changed');
select throws_ok(format($$update public.items set size = 1 where id = %L$$, tests.id('f1')),
  '42501', 'permission denied for table items', 'size cannot be changed');
select throws_ok(format($$update public.items set object_key = 'u/x' where id = %L$$, tests.id('f1')),
  '42501', 'permission denied for table items', 'object_key cannot be changed');
select throws_ok(format($$update public.items set status = 'ready' where id = %L$$, tests.id('p1')),
  '42501', 'permission denied for table items', 'status cannot be changed (use complete_upload)');
select throws_ok(format($$update public.items set trashed_at = null, trash_root = null where id = %L$$, tests.id('t1')),
  '42501', 'permission denied for table items', 'trash fields cannot be changed (use restore_item)');
select throws_ok(format($$update public.items set kind = 'folder' where id = %L$$, tests.id('f1')),
  '42501', 'permission denied for table items', 'kind cannot be changed');
select throws_ok(format($$update public.items set mime_type = 'text/html' where id = %L$$, tests.id('f1')),
  '42501', 'permission denied for table items', 'mime_type cannot be changed');
select throws_ok(format($$update public.items set updated_by = %L where id = %L$$, tests.id('editor'), tests.id('f1')),
  '42501', 'permission denied for table items', 'updated_by cannot be set by the caller');

-- Even the server's own role can't break the tree's invariants.
select tests.clear_authentication();
set local role service_role;
select throws_ok(format($$update public.items set size = 1 where id = %L$$, tests.id('f1')),
  '42501', 'This field can''t be changed', 'size is fixed even for the service role');
select throws_ok(format($$update public.items set owner_id = %L where id = %L$$, tests.id('editor'), tests.id('f1')),
  '42501', 'This field can''t be changed', 'ownership is fixed even for the service role');
select throws_ok(format($$update public.items set ancestors = '{}' where id = %L$$, tests.id('f2')),
  '42501', 'This field can''t be changed', 'paths only change through a move, even for the service role');
select throws_ok(format($$update public.items set status = 'pending' where id = %L$$, tests.id('f1')),
  'LK409', null, 'a finished upload never goes back to pending');
reset role;

-- Delete: never directly (delete_forever checks ownership and the trash) --------------------------

select tests.authenticate_as('owner');
select throws_ok(format('delete from public.items where id = %L', tests.id('R')),
  '42501', 'permission denied for table items', 'owner cannot delete directly');
select tests.authenticate_as('editor');
select throws_ok(format('delete from public.items where id = %L', tests.id('e1')),
  '42501', 'permission denied for table items', 'editor cannot delete directly, even their own file');
select tests.authenticate_as('viewer');
select throws_ok('delete from public.items',
  '42501', 'permission denied for table items', 'viewer cannot delete');
select tests.authenticate_as('stranger');
select throws_ok('delete from public.items',
  '42501', 'permission denied for table items', 'stranger cannot delete');
select tests.authenticate_as_anon();
select throws_ok('delete from public.items',
  '42501', 'permission denied for table items', 'anon cannot delete');

-- Derived columns -----------------------------------------------------------------------------------

select tests.clear_authentication();
select is(
  (select ancestors from public.items where id = tests.id('f4')),
  array[tests.id('F'), tests.id('Sub'), tests.id('Deep')],
  'a file''s path lists every folder above it, root first'
);
select is(
  tests.rows($$select tests.label(id) || '=' || category from public.items where kind = 'file' and id in (
    select id from tests.ids where label in ('f1', 'f2', 'f4', 'p1', 'e1'))$$),
  tests.sorted('{e1=text,f1=pdf,f2=image,f4=text,p1=archive}'),
  'file category is worked out from the type'
);
select is(
  (select storage_used from public.profiles where id = tests.id('owner')),
  6000::bigint,
  'owner''s storage counts their files, including trash and the unfinished upload'
);
select is(
  (select storage_used from public.profiles where id = tests.id('editor')),
  1000::bigint,
  'a file uploaded into someone else''s folder counts against the uploader'
);
select is(
  (select updated_by from public.items where id = tests.id('f1')),
  tests.id('editor'),
  'updated_by records who renamed it last'
);
select ok(
  (select updated_at > created_at or updated_at = now() from public.items where id = tests.id('f1')),
  'updated_at moves on rename'
);
select is(
  (select count(*)::int from public.items where status = 'pending' and name = 'uploading.zip'),
  1,
  'the unfinished upload is still there'
);
select is(
  (select storage_quota from public.profiles where id = tests.id('owner')),
  104857600::bigint,
  'everyone starts with 100 MB'
);

select * from finish();
rollback;
