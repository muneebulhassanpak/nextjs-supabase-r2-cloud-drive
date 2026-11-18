-- Phase 8: shares that say whether they're new, one live public link per item, link status, and
-- the rate limits on sharing and on public links.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(34);

-- Sharing says whether it was new ---------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(public.share_item(tests.id('R'), 'stranger@test.dev', 'viewer'), true,
  'a first share with an account is new');
select is(public.share_item(tests.id('R'), 'stranger@test.dev', 'editor'), false,
  'changing their role is not');
select is(public.share_item(tests.id('R'), 'someone-new@test.dev', 'viewer'), true,
  'a first invite is new too (so the answer says nothing about accounts)');
select is(public.share_item(tests.id('R'), 'someone-new@test.dev', 'editor'), false,
  'and changing an invite''s role is not');

-- Rate limit on sharing ---------------------------------------------------------------------------------

select tests.clear_authentication();
insert into private.rate_limits (key, window_start, hits)
values ('share:' || tests.id('owner'), now(), 50)
on conflict (key) do update set window_start = now(), hits = 50;
select tests.authenticate_as('owner');
select throws_ok(format($$select public.share_item(%L, 'viewer@test.dev', 'viewer')$$, tests.id('R')),
  'LK429', 'Too many requests. Try again in a few minutes.', 'the 51st share in an hour is refused');
select tests.clear_authentication();
update private.rate_limits set window_start = now() - interval '61 minutes'
where key = 'share:' || tests.id('owner');
select tests.authenticate_as('owner');
select lives_ok(format($$select public.share_item(%L, 'viewer@test.dev', 'viewer')$$, tests.id('R')),
  'once the hour has passed, sharing works again');
select tests.clear_authentication();
select is((select hits from private.rate_limits where key = 'share:' || tests.id('owner')), 1,
  'and the count starts over');

-- Creating links ----------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select isnt(public.create_share_link(tests.id('R'), extensions.digest('r-1', 'sha256')), null,
  'the owner creates a link');
select lives_ok(
  format($$select public.create_share_link(%L, extensions.digest('r-2', 'sha256'), now() + interval '7 days')$$, tests.id('R')),
  'and replaces it with one that expires');
select is(
  tests.rows(format($$select (revoked_at is null)::text || ':' || (expires_at is not null)::text from public.share_links where item_id = %L order by created_at, revoked_at nulls last$$, tests.id('R'))),
  '{false:false,true:true}',
  'the old link is revoked; only the new one is live');
select throws_ok(
  format($$select public.create_share_link(%L, extensions.digest('r-3', 'sha256'), now() - interval '1 minute')$$, tests.id('R')),
  'LK422', 'Choose an expiry date in the future', 'an expiry in the past is refused');
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('t', 'sha256'))$$, tests.id('t1')),
  'LK409', null, 'items in the trash get no link');
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('e', 'sha256'))$$, tests.id('e1')),
  '42501', 'Only the owner can create a link', 'a folder owner cannot link a file someone else owns');
select throws_ok(format($$select public.create_share_link(%L, '\x00'::bytea)$$, tests.id('F')),
  '23514', null, 'the hash must be a SHA-256');
select throws_ok(
  format($$insert into public.share_links (item_id, token_hash) values (%L, extensions.digest('sub-2', 'sha256'))$$, tests.id('Sub')),
  '23505', null, 'a second live link cannot be added directly either');

select tests.authenticate_as('editor');
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('x', 'sha256'))$$, tests.id('F')),
  '42501', 'Only the owner can create a link', 'editors cannot make links');
select tests.authenticate_as('viewer');
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('x', 'sha256'))$$, tests.id('Sub')),
  '42501', 'Only the owner can create a link', 'viewers cannot make links');
select tests.authenticate_as('stranger');
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('x', 'sha256'))$$, tests.id('F')),
  'P0002', 'Item not found', 'strangers cannot tell the item exists');
select tests.authenticate_as_anon();
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('x', 'sha256'))$$, tests.id('R')),
  '42501', null, 'anon cannot make links');

select tests.clear_authentication();
insert into private.rate_limits (key, window_start, hits)
values ('new-link:' || tests.id('owner'), now(), 30)
on conflict (key) do update set window_start = now(), hits = 30;
select tests.authenticate_as('owner');
select throws_ok(format($$select public.create_share_link(%L, extensions.digest('r-4', 'sha256'))$$, tests.id('R')),
  'LK429', null, 'the 31st link in an hour is refused');

-- Why a link doesn't open -------------------------------------------------------------------------------

select tests.clear_authentication();
select tests.new_link('L_t1', 't1', 'trashed-token');
select tests.authenticate_as_anon();
select is(tests.rows($$select status from public.share_link_status('sub-token')$$), '{ok}', 'a live link');
select is(tests.rows($$select status from public.share_link_status('revoked-token')$$), '{revoked}', 'a revoked link');
select is(tests.rows($$select status from public.share_link_status('expired-token')$$), '{expired}', 'an expired link');
select is(tests.rows($$select status from public.share_link_status('trashed-token')$$), '{unavailable}',
  'a link to something in the trash');
select is_empty($$select 1 from public.share_link_status('never-made')$$, 'a token that never existed');

-- The path inside a link -------------------------------------------------------------------------------

select is(array(select name from public.share_link_path('sub-token', tests.id('f4'))),
  '{Designs,Archive,draft.txt}'::text[], 'the path starts at the linked folder, never above it');
select is(
  (select kind::text from public.share_link_path('sub-token', tests.id('f4')) order by kind = 'file' desc limit 1),
  'file', 'the last step says it is a file, so it is not opened as a folder');
select is_empty(format($$select 1 from public.share_link_path('sub-token', %L)$$, tests.id('f1')),
  'items outside the linked folder have no path');
select is_empty(format($$select 1 from public.share_link_path('revoked-token', %L)$$, tests.id('f1')),
  'a dead link has none either');

-- Rate limit on using a link ----------------------------------------------------------------------------

select is(tests.rows($$select name from public.resolve_share_link('sub-token')$$), '{Designs}',
  'anyone with the token opens the link');
select tests.clear_authentication();
select is((select hits from private.rate_limits where key = 'link:' || tests.id('L_sub')), 1,
  'and each use is counted against the link');
update private.rate_limits set hits = 600 where key = 'link:' || tests.id('L_sub');
select tests.authenticate_as_anon();
select throws_ok($$select * from public.resolve_share_link('sub-token')$$, 'LK429', null,
  'past 600 uses in 10 minutes the link pauses');
select throws_ok(format($$select * from public.share_link_file('sub-token', %L)$$, tests.id('f2')), 'LK429', null,
  'downloads included');
select is_empty($$select 1 from public.resolve_share_link('never-made')$$,
  'unknown tokens find nothing (and are not counted)');

select * from finish();
rollback;
