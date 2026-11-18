-- Search and activity: each person finds and reads about only what they can see.
begin;
\ir helpers/setup.psql
\ir helpers/fixture.psql
select plan(28);

-- Three more of the owner's files, for ranking and typos.
select tests.new_file('s1', 'owner', null, 'Invoice-2026.pdf');
select tests.new_file('s2', 'owner', 'Sub', 'old invoice.pdf');
select tests.new_file('s3', 'owner', null, 'invoce.txt', p_mime_type => 'text/plain');

create function tests.search(
  p_query text, p_type text default null, p_owner text default 'any',
  p_from timestamptz default null, p_to timestamptz default null
)
returns text[]
language sql
as $$
  select array(select name from public.search_items(p_query, p_type, p_owner, p_from, p_to))
$$;

-- Search -------------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
select is(tests.search('invo'), '{invoce.txt,Invoice-2026.pdf,old invoice.pdf}'::text[],
  'part of a name finds it, any case; names that start with it come first');
select is(tests.search('invoice'), '{Invoice-2026.pdf,old invoice.pdf,invoce.txt}'::text[],
  'a near spelling is found too, after the real matches');
select is(tests.search('PROJ'), '{Projects}'::text[], 'folders are found');
select ok(not 'old.pdf' = any (tests.search('old')), 'never what is in the trash');
select is(tests.search('uploading'), '{}'::text[], 'never an upload that has not finished');
select is(tests.search('%'), '{}'::text[], 'a % is searched for as itself');
select is(tests.search('notes'), '{notes.md}'::text[],
  'the top folder''s owner finds what others put in their folder');

select is(tests.search('invo', 'pdf'), '{Invoice-2026.pdf,old invoice.pdf}'::text[], 'filter by type');
select is(tests.search('s', 'folder'), '{Designs,Projects}'::text[], 'filter to folders');
select is(tests.search('notes', p_owner => 'me'), '{}'::text[], 'owner: me');
select is(tests.search('notes', p_owner => 'others'), '{notes.md}'::text[], 'owner: others');

select tests.clear_authentication();
update public.items set updated_at = now() - interval '10 days' where id = tests.id('s1');
select tests.authenticate_as('owner');
select is(tests.search('invo', p_from => now() - interval '7 days'), '{invoce.txt,old invoice.pdf}'::text[],
  'modified since');
select is(tests.search('invo', p_to => now() - interval '7 days'), '{Invoice-2026.pdf}'::text[],
  'modified before');

select throws_ok(format('select public.search_items(%L)', repeat('a', 101)), 'LK422',
  'Search for at most 100 characters', 'a very long search is refused');
select throws_ok($$select public.search_items('a', 'movies')$$, 'LK422', 'Unknown type', 'unknown types');
select throws_ok($$select public.search_items('a', null, 'everyone')$$, 'LK422', null, 'unknown owners');

select tests.authenticate_as('editor');
select is(tests.search('invo'), '{old invoice.pdf}'::text[], 'an editor of a folder finds what is inside it');
select is(tests.search('private'), '{}'::text[], 'but nothing of the owner''s outside it');
select tests.authenticate_as('viewer');
select is(tests.search('pdf'), '{old invoice.pdf}'::text[], 'a viewer finds only inside what they can view');
select tests.authenticate_as('stranger');
select is(tests.search('invo'), '{}'::text[], 'a stranger finds nothing of the owner''s');
select tests.authenticate_as_anon();
select throws_ok($$select public.search_items('a')$$, '42501', null, 'anon cannot search');

-- Activity -----------------------------------------------------------------------------------------

select tests.authenticate_as('owner');
update public.items set name = 'Designs 2026' where id = tests.id('Sub');
select ok(not 'logo.png' = any (tests.search('lgo')), 'short searches don''t guess at spellings');
select public.move_item(tests.id('f2'), tests.id('Deep'));

select is(
  (select array_agg(action::text || ':' || coalesce(from_name, '') || '>' || coalesce(to_name, ''))
   from public.item_activity(tests.id('f2'))),
  '{moved:Designs 2026>Archive,uploaded:>}'::text[],
  'a file''s activity, newest first, with the folders it moved between');
select is(
  (select count(*)::int from public.item_activity(tests.id('Sub'))),
  (select count(*)::int from public.activity a join public.items i on i.id = a.item_id
   where i.id = tests.id('Sub') or i.ancestors @> array[tests.id('Sub')]),
  'a folder''s activity includes everything inside it');

with first_page as (
  select id, created_at from public.item_activity(tests.id('Sub'), p_limit => 2)
), last_row as (
  select * from first_page order by created_at, id limit 1
)
select is(
  array(select id from first_page order by created_at desc, id desc)
    || array(select a.id from last_row, public.item_activity(tests.id('Sub'), last_row.created_at, last_row.id, 2) a
             order by a.created_at desc, a.id desc),
  array(select id from public.item_activity(tests.id('Sub'), p_limit => 4) order by created_at desc, id desc),
  'pages follow on from the cursor without gaps or repeats');
select throws_ok(format('select * from public.item_activity(%L, now())', tests.id('Sub')), 'LK422', null,
  'a cursor needs both parts');

select tests.authenticate_as('viewer');
select throws_ok(format('select * from public.item_activity(%L)', tests.id('F')), 'P0002', 'Item not found',
  'a viewer of a subfolder cannot read the folder above');
select tests.authenticate_as('stranger');
select throws_ok(format('select * from public.item_activity(%L)', tests.id('f1')), 'P0002', 'Item not found',
  'strangers read nothing');

select * from finish();
rollback;
