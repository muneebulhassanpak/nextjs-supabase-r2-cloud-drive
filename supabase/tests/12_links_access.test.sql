-- Public links: only owners manage them; anyone with a live token can view, and nothing more.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(40);

-- Managing links ------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.rows('select tests.label(id) from public.share_links'), tests.sorted('{L_sub,L_rev,L_exp}'),
  'owner sees their links');
select tests.authenticate_as('editor');
select is_empty('select 1 from public.share_links', 'editor cannot see links, even on the shared folder');
select tests.authenticate_as('viewer');
select is_empty('select 1 from public.share_links', 'viewer cannot see links');
select tests.authenticate_as('stranger');
select is_empty('select 1 from public.share_links', 'stranger cannot see links');
select tests.authenticate_as_anon();
select throws_ok('select 1 from public.share_links', '42501', 'permission denied for table share_links',
  'anon cannot list links');

select tests.authenticate_as('owner');
select lives_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, extensions.digest('r-token', 'sha256'))$$, tests.id('R')),
  'owner creates a link');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, extensions.digest('e-token', 'sha256'))$$, tests.id('e1')),
  '42501', 'new row violates row-level security policy for table "share_links"',
  'a folder owner cannot link a file someone else owns inside it');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, '\x00'::bytea)$$, tests.id('R')),
  '23514', null, 'the stored hash must be a SHA-256');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash, created_by) values (%L, extensions.digest('x', 'sha256'), %L)$$,
    tests.id('R'), tests.id('editor')),
  '42501', 'permission denied for table share_links', 'created_by cannot be chosen');

select tests.authenticate_as('editor');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, extensions.digest('ed-token', 'sha256'))$$, tests.id('F')),
  '42501', 'new row violates row-level security policy for table "share_links"',
  'editor cannot make a public link');
select tests.authenticate_as('viewer');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, extensions.digest('v-token', 'sha256'))$$, tests.id('Sub')),
  '42501', 'new row violates row-level security policy for table "share_links"',
  'viewer cannot make a public link');
select tests.authenticate_as('stranger');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, extensions.digest('s-token', 'sha256'))$$, tests.id('R')),
  '42501', 'new row violates row-level security policy for table "share_links"',
  'stranger cannot make a link to someone else''s file');

select tests.authenticate_as('owner');
select throws_ok(
  format($$update public.share_links set token_hash = extensions.digest('mine', 'sha256') where id = %L$$, tests.id('L_sub')),
  '42501', 'permission denied for table share_links', 'a link''s token cannot be swapped');
select throws_ok(format('update public.share_links set revoked_at = null where id = %L', tests.id('L_rev')),
  'LK409', 'This link has been revoked', 'a revoked link stays revoked');
select throws_ok('delete from public.share_links', '42501', 'permission denied for table share_links',
  'links are revoked, never deleted');

-- A blanket UPDATE with no WHERE clause skips the select policy, so only the update policy stands
-- between these and every link. (The revoked link is set aside so its trigger doesn't mask that.)
select tests.clear_authentication();
delete from public.share_links where id = tests.id('L_rev');
select tests.authenticate_as('editor');
select is(tests.affected('update public.share_links set revoked_at = now()'), 0, 'editor cannot revoke links');
select tests.authenticate_as('stranger');
select is(tests.affected('update public.share_links set expires_at = now() + interval ''1 year'''), 0,
  'stranger cannot extend links');

-- Opening a link (anyone with the token) -------------------------------------------------------------

select tests.authenticate_as_anon();
select is(tests.rows($$select tests.label(id) from public.resolve_share_link('sub-token')$$), '{Sub}',
  'a live token opens its item');
select is_empty($$select * from public.resolve_share_link('revoked-token')$$, 'a revoked link opens nothing');
select is_empty($$select * from public.resolve_share_link('expired-token')$$, 'an expired link opens nothing');
select is_empty($$select * from public.resolve_share_link('wrong-token')$$, 'a wrong token opens nothing');
select is_empty($$select * from public.resolve_share_link('')$$, 'an empty token opens nothing');
select is_empty(format('select * from public.resolve_share_link(%L)', repeat('a', 10000)),
  'an oversized token is refused without hashing it');

select is(tests.rows(format($$select tests.label(id) from public.share_link_children('sub-token', %L)$$, tests.id('Sub'))),
  tests.sorted('{Deep,f2}'), 'the linked folder''s contents');
select is(tests.rows(format($$select tests.label(id) from public.share_link_children('sub-token', %L)$$, tests.id('Deep'))),
  '{f4}', 'a folder further down');
select is_empty(format($$select * from public.share_link_children('sub-token', %L)$$, tests.id('F')),
  'the folder above the link stays closed');
select is_empty(format($$select * from public.share_link_children('sub-token', %L)$$, tests.id('EF')),
  'someone else''s folder stays closed');
select is_empty(format($$select * from public.share_link_children('revoked-token', %L)$$, tests.id('F')),
  'a revoked link lists nothing');

select is(
  (select object_key from public.share_link_file('sub-token', tests.id('f4'))),
  'u/' || tests.id('owner') || '/f4',
  'a file inside the linked folder can be downloaded');
select is_empty(format($$select * from public.share_link_file('sub-token', %L)$$, tests.id('f1')),
  'a file outside the linked folder cannot');
select is_empty(format($$select * from public.share_link_file('sub-token', %L)$$, tests.id('Deep')),
  'a folder is not a download');
select is_empty(format($$select * from public.share_link_file('expired-token', %L)$$, tests.id('f1')),
  'an expired link downloads nothing');

select throws_ok('select * from public.share_links', '42501', null, 'the token does not open the links table');

-- Trash and revocation close a link at once.
select tests.clear_authentication();
update public.items set trashed_at = now(), trash_root = tests.id('Deep') where id in (tests.id('Deep'), tests.id('f4'));
select tests.authenticate_as_anon();
select is_empty(format($$select * from public.share_link_file('sub-token', %L)$$, tests.id('f4')),
  'a trashed file is no longer reachable through the link');
select is(tests.rows(format($$select tests.label(id) from public.share_link_children('sub-token', %L)$$, tests.id('Sub'))),
  '{f2}', 'trashed items disappear from the listing');

select tests.authenticate_as('owner');
select is(tests.affected(format('update public.share_links set revoked_at = now() where id = %L', tests.id('L_sub'))), 1,
  'owner revokes a link');
select tests.authenticate_as_anon();
select is_empty($$select * from public.resolve_share_link('sub-token')$$, 'the revoked link stops working');
select is_empty(format($$select * from public.share_link_file('sub-token', %L)$$, tests.id('f2')),
  'and its files stop downloading');

select tests.clear_authentication();
select is(
  tests.rows($$select tests.label(item_id) || ':' || action from public.activity
               where action in ('link_created', 'link_revoked') and item_id in (select id from tests.ids)$$),
  tests.sorted('{F:link_created,R:link_created,Sub:link_created,Sub:link_revoked,f1:link_created}'),
  'creating and revoking links is logged');

select tests.authenticate_as('owner');
select throws_ok('select public.cleanup_pending_uploads()', '42501', null,
  'users cannot run the cleanup job');

select * from finish();
rollback;
