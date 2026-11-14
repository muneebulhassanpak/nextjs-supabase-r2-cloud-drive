-- Uploads: start, complete, cancel, and the storage quota.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(27);

create temporary table upload (id uuid, object_key text);
grant all on upload to authenticated;

-- Start an upload ----------------------------------------------------------------------------------

select tests.authenticate_as('editor');
insert into upload select * from public.start_upload(tests.id('Sub'), '  report.pdf ', 2000, 'Application/PDF');

select tests.clear_authentication();
select ok((select object_key like 'u/' || tests.id('editor') || '/%' from upload),
  'the storage key is random and under the uploader''s id, never the file name');
select is(
  (select row(owner_id, parent_id, name, mime_type, status)::text from public.items where id = (select id from upload)),
  row(tests.id('editor'), tests.id('Sub'), 'report.pdf', 'application/pdf', 'pending'::public.item_status)::text,
  'a pending item owned by the uploader, name trimmed, type lower-cased');
select is((select storage_used from public.profiles where id = tests.id('editor')), 3000::bigint,
  'the space is reserved straight away (counts against the uploader)');
select is((select storage_used from public.profiles where id = tests.id('owner')), 6000::bigint,
  'the folder owner''s usage is unchanged');

select tests.authenticate_as('owner');
select is_empty(format('select 1 from public.items where id = %L', (select id from upload)),
  'nobody else sees an unfinished upload, not even the folder owner');

select tests.authenticate_as('owner');
select throws_ok(format('select public.complete_upload(%L)', (select id from upload)), 'P0002', 'Upload not found',
  'only the uploader can complete it');
select throws_ok(format('select public.cancel_upload(%L)', (select id from upload)), 'P0002', 'Upload not found',
  'only the uploader can cancel it');

select tests.authenticate_as('editor');
select lives_ok(format('select public.complete_upload(%L)', (select id from upload)), 'the uploader completes it');
select throws_ok(format('select public.complete_upload(%L)', (select id from upload)), 'P0002', 'Upload not found',
  'completing twice fails');
select throws_ok(format('select public.cancel_upload(%L)', (select id from upload)), 'P0002', 'Upload not found',
  'a finished upload cannot be cancelled (it goes to the trash instead)');
select tests.authenticate_as('viewer');
select is(tests.rows(format('select name from public.items where id = %L', (select id from upload))), '{report.pdf}',
  'once complete, everyone with access to the folder sees it');
select tests.clear_authentication();
select ok(exists (select 1 from public.activity where item_id = (select id from upload) and action = 'uploaded'
                  and actor_id = tests.id('editor')),
  'completing logs the upload');

-- Refusals -------------------------------------------------------------------------------------------

select tests.authenticate_as('viewer');
select throws_ok(format($$select public.start_upload(%L, 'x.txt', 10, 'text/plain')$$, tests.id('Sub')),
  '42501', null, 'viewer cannot upload into a shared folder');
select tests.authenticate_as('stranger');
select throws_ok(format($$select public.start_upload(%L, 'x.txt', 10, 'text/plain')$$, tests.id('F')),
  'P0002', 'Item not found', 'stranger cannot upload into a folder they cannot see');
select tests.authenticate_as('owner');
select throws_ok(format($$select public.start_upload(%L, 'x.txt', 10, 'text/plain')$$, tests.id('f1')),
  'LK422', 'Items can only go inside a folder', 'a file is not a folder');
select throws_ok(format($$select public.start_upload(%L, 'PLAN.pdf', 10, 'application/pdf')$$, tests.id('F')),
  '23505', null, 'a name already used in the folder is refused before uploading');
select throws_ok($$select public.start_upload(null, 'big.bin', 26214401, 'application/octet-stream')$$,
  'LK413', 'Files can be at most 25 MB', 'files over 25 MB are refused');
select throws_ok($$select public.start_upload(null, 'neg.bin', -1, 'application/octet-stream')$$,
  'LK422', 'Invalid file size', 'negative sizes are refused');
select throws_ok($$select public.start_upload(null, 'a/b.txt', 10, 'text/plain')$$,
  '23514', null, 'invalid names are refused');
select throws_ok($$select public.start_upload(null, 'x.html', 10, 'text/html; charset=utf-8')$$,
  '23514', null, 'malformed types are refused');
select tests.authenticate_as_anon();
select throws_ok($$select public.start_upload(null, 'x.txt', 10, 'text/plain')$$,
  '42501', null, 'anon cannot upload');

-- Quota ----------------------------------------------------------------------------------------------

select tests.clear_authentication();
update public.profiles set storage_quota = 10000 where id = tests.id('owner');  -- 6000 used

select tests.authenticate_as('owner');
select lives_ok($$select public.start_upload(null, 'fits.bin', 4000, 'application/octet-stream')$$,
  'an upload that exactly fills the quota is allowed');
select throws_ok($$select public.start_upload(null, 'one-more.bin', 1, 'application/octet-stream')$$,
  'LK413', 'Not enough storage space left', 'one byte over is refused');
select lives_ok(
  format('select public.cancel_upload(%L)', (select id from public.items where name = 'fits.bin')),
  'cancelling gives the space back');
select is((select storage_used from public.profiles where id = tests.id('owner')), 6000::bigint,
  'usage is back to what it was');

-- now() is fixed for the whole test transaction, so "older than -1 second" means "everything pending".
select tests.clear_authentication();
select ok(
  'u/' || tests.id('owner') || '/p1' = any (array(select k from public.cleanup_pending_uploads(interval '-1 second') k)),
  'the cleanup job removes abandoned uploads and returns their keys');
select is((select storage_used from public.profiles where id = tests.id('owner')), 5000::bigint,
  'and frees their space');

select * from finish();
rollback;
