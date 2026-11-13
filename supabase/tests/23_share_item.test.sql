-- Sharing by email, invites, and claiming them on sign-up.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(25);

select tests.authenticate_as('owner');
select lives_ok(format($$select public.share_item(%L, '  STRANGER@test.dev ', 'viewer')$$, tests.id('R')),
  'owner shares with an existing account (email is matched without case or spaces)');
select tests.authenticate_as('stranger');
select isnt_empty(format('select 1 from public.items where id = %L', tests.id('R')), 'they can see it now');
select is(tests.affected(format($$update public.items set name = 'mine.txt' where id = %L$$, tests.id('R'))), 0,
  'as a viewer they cannot rename it');

select tests.authenticate_as('owner');
select lives_ok(format($$select public.share_item(%L, 'stranger@test.dev', 'editor')$$, tests.id('R')),
  'sharing again changes the role');
select tests.clear_authentication();
select is(tests.rows(format($$select role::text from public.item_shares where item_id = %L$$, tests.id('R'))), '{editor}',
  'still one share, now as editor');
select ok(exists (select 1 from public.activity where item_id = tests.id('R') and action = 'share_changed'),
  'the role change is logged');

-- Refusals -------------------------------------------------------------------------------------------

select tests.authenticate_as('editor');
select throws_ok(format($$select public.share_item(%L, 'stranger@test.dev', 'viewer')$$, tests.id('F')),
  '42501', 'Only the owner can share this', 'editors cannot re-share');
select tests.authenticate_as('viewer');
select throws_ok(format($$select public.share_item(%L, 'stranger@test.dev', 'viewer')$$, tests.id('Sub')),
  '42501', 'Only the owner can share this', 'viewers cannot re-share');
select tests.authenticate_as('stranger');
select throws_ok(format($$select public.share_item(%L, 'stranger@test.dev', 'editor')$$, tests.id('F')),
  'P0002', 'Item not found', 'strangers cannot share their way in');
select tests.authenticate_as('owner');
select throws_ok(format($$select public.share_item(%L, 'owner@test.dev', 'editor')$$, tests.id('F')),
  'LK422', 'You already own this', 'owners cannot share with themselves');
select throws_ok(format($$select public.share_item(%L, 'stranger@test.dev', 'viewer')$$, tests.id('e1')),
  '42501', 'Only the owner can share this',
  'a folder owner cannot share a file someone else uploaded into their folder');
select throws_ok(format($$select public.share_item(%L, 'x@test.dev', 'editor')$$, tests.id('t1')),
  'LK409', null, 'trashed items cannot be shared');
select throws_ok(format($$select public.share_item(%L, 'not-an-email', 'viewer')$$, tests.id('F')),
  '23514', null, 'the email must look like one');
select tests.authenticate_as_anon();
select throws_ok(format($$select public.share_item(%L, 'x@test.dev', 'viewer')$$, tests.id('F')),
  '42501', null, 'anon cannot share');

-- Invites --------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select lives_ok(format($$select public.share_item(%L, 'newcomer@test.dev', 'editor')$$, tests.id('Sub')),
  'sharing with an email that has no account makes an invite (the caller can''t tell the difference)');
select tests.clear_authentication();
select is(tests.rows($$select tests.label(item_id) || ':' || email || ':' || role from public.share_invites$$),
  tests.sorted('{F:friend@test.dev:viewer,Sub:newcomer@test.dev:editor}'), 'the invite waits');

-- Someone signs up with the invited address but hasn't proved it is theirs.
select tests.create_user('newcomer', p_confirmed => false);
select is_empty(format('select 1 from public.item_shares where user_id = %L', tests.id('newcomer')),
  'an unconfirmed sign-up does not get the invite (it could be someone else using that address)');
select tests.authenticate_as('owner');
select public.share_item(tests.id('F'), 'newcomer@test.dev', 'viewer');
select tests.clear_authentication();
select is_empty(format('select 1 from public.item_shares where user_id = %L', tests.id('newcomer')),
  'sharing with an unconfirmed account also waits as an invite');

update auth.users set email_confirmed_at = now() where id = tests.id('newcomer');
select is(
  tests.rows(format($$select tests.label(item_id) || ':' || role from public.item_shares where user_id = %L$$, tests.id('newcomer'))),
  tests.sorted('{F:viewer,Sub:editor}'),
  'once the email is confirmed, the invites become shares');
select is(
  tests.rows($$select email from public.share_invites$$), '{friend@test.dev}',
  'and the claimed invites are gone');

-- A user changing their email to an invited address gets the invite once the new email is confirmed.
update auth.users set email = 'friend@test.dev' where id = tests.id('stranger');
select is((select email from public.profiles where id = tests.id('stranger')), 'friend@test.dev',
  'the profile email follows the account');
select is(
  tests.rows(format($$select tests.label(item_id) from public.item_shares where user_id = %L$$, tests.id('stranger'))),
  tests.sorted('{F,R}'), 'the stranger now owns the friend@ address and gets the F invite');
select ok(not exists (select 1 from public.share_invites), 'no invites left');

-- Claiming uses up every invite for the address, including ones on the person's own items.
select tests.create_user('selfie', p_confirmed => false);
select tests.new_file('own', 'selfie', null, 'own.txt');
insert into public.share_invites (item_id, email, role, created_by)
values (tests.id('own'), 'selfie@test.dev', 'viewer', tests.id('selfie'));
update auth.users set email_confirmed_at = now() where id = tests.id('selfie');
select is_empty(format('select 1 from public.share_invites where item_id = %L', tests.id('own')),
  'an invite to your own item is cleared, not left behind');
select is_empty(format('select 1 from public.item_shares where item_id = %L', tests.id('own')),
  'and doesn''t become a share with yourself');

select * from finish();
rollback;
