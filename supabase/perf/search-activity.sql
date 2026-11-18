-- Timing for search and activity on a large drive. Local stack only; everything rolls back.
--   docker cp supabase supabase_db_lockerly:/tmp/lk && docker exec supabase_db_lockerly psql -U postgres -f /tmp/lk/perf/search-activity.sql
--
-- A drive of 10,000 items (100 folders of 99 files) for "owner", 10,000 more for someone else
-- (so RLS has rows to turn away), and an editor who sees the owner's drive through a share.
begin;
\ir ../tests/helpers/setup.psql
select tests.create_user('owner');
select tests.create_user('other');
select tests.create_user('editor');

insert into public.items (id, owner_id, parent_id, kind, name)
select gen_random_uuid(), tests.id('owner'), null, 'folder', 'Folder ' || g
from generate_series(1, 100) g;
insert into public.items (owner_id, parent_id, kind, name, size, mime_type, object_key, status)
select tests.id('owner'), f.id, 'file',
  (array['Invoice', 'Report', 'Photo', 'Notes', 'Budget'])[1 + g % 5] || '-' || f.name || '-' || g || '.pdf',
  1000, 'application/pdf', 'u/' || gen_random_uuid(), 'ready'
from public.items f cross join generate_series(1, 99) g
where f.owner_id = tests.id('owner') and f.kind = 'folder';
insert into public.items (owner_id, parent_id, kind, name, size, mime_type, object_key, status)
select tests.id('other'), null, 'file', 'Invoice-other-' || g || '.pdf', 1000, 'application/pdf',
  'u/' || gen_random_uuid(), 'ready'
from generate_series(1, 10000) g;
-- The editor sees the owner's drive through shares on every top folder.
insert into public.item_shares (item_id, user_id, role, created_by)
select id, tests.id('editor'), 'editor', tests.id('owner')
from public.items where owner_id = tests.id('owner') and parent_id is null;
analyze public.items;
analyze public.activity;
analyze public.item_shares;

\timing on
select tests.authenticate_as('owner');
explain (analyze, costs off, timing off, summary on) select * from public.search_items('invo');
select count(*) as owner_invo from public.search_items('invo');
select count(*) as owner_typo from public.search_items('invoce');
select count(*) as owner_filtered from public.search_items('rep', 'pdf', 'me', now() - interval '7 days');
select tests.authenticate_as('editor');
select count(*) as editor_invo from public.search_items('invo');
select count(*) as folder_activity
from public.item_activity((select id from public.items where name = 'Folder 7'));
select tests.authenticate_as('other');
select count(*) as other_sees_of_owner
from public.search_items('Folder') s where s.owner_id = tests.id('owner');
rollback;
