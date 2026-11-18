-- Phase 9: search and activity. Both answer only with what the caller can see: the same rule as
-- the items policy (`private.item_role`), applied after narrowing by index. They are security
-- definer for speed: under RLS, Postgres checks the policy on every row before a non-leakproof
-- filter like ILIKE can use its index (10k items: 0.4 s to search, 8 s for a folder's activity).

-- Search -------------------------------------------------------------------------------------------

-- Replaces the first version (substring only, no filters).
drop function public.search_items(text, integer);

-- Names that contain the text (any case), or, for 4 characters or more, a word close to it (a
-- typo: "invoice" finds "invoce.txt"), ranked: names that start with it, then names that contain
-- it, then near matches. A blank search finds nothing. Never trashed or
-- unfinished items. Filters: `p_type` is 'folder' or a file category; `p_owner` is 'me', 'others'
-- or 'any'; `p_modified_from` / `p_modified_to` bound the last change (inclusive, exclusive).
-- The trigram index on `items.name` serves both the substring and the near match.
create function public.search_items(
  p_query text,
  p_type text default null,
  p_owner text default 'any',
  p_modified_from timestamptz default null,
  p_modified_to timestamptz default null,
  p_limit integer default 50
)
returns setof public.items
language plpgsql
-- Volatile only because it sets the similarity threshold (below); it changes no data.
volatile
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_escaped text;
  v_uid uuid := private.current_user_id();
  -- Where someone else's items are visible from: what's shared with the caller, and the caller's
  -- top folders (others' uploads into them). For ready items outside the trash, which is all
  -- search returns, `private.item_role` is not null exactly when the item or a folder above it is
  -- one of these, so the overlap below is that rule, without a lookup per row.
  v_roots uuid[];
begin
  if v_query = '' then
    return;
  end if;
  if char_length(v_query) > 100 then
    raise exception 'Search for at most 100 characters' using errcode = 'LK422';
  end if;
  if p_owner is null or p_owner not in ('me', 'others', 'any') then
    raise exception 'Owner must be me, others or any' using errcode = 'LK422';
  end if;
  if p_type is not null and p_type <> 'folder'
     and not p_type = any (enum_range(null::public.item_category)::text[]) then
    raise exception 'Unknown type' using errcode = 'LK422';
  end if;
  -- pg_trgm's default (0.6) misses a single missing letter in a 7-letter word. Set here, for this
  -- transaction only: a `set` clause on the function needs a superuser on hosted Postgres.
  perform pg_catalog.set_config('pg_trgm.word_similarity_threshold', '0.5', true);
  -- Typed % and _ are searched for as themselves.
  v_roots := array(
    select s.item_id from public.item_shares s where s.user_id = v_uid
    union all
    select f.id from public.items f where f.owner_id = v_uid and f.parent_id is null and f.kind = 'folder'
  );
  v_escaped := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  select i.*
  from public.items i
  where i.trashed_at is null
    and i.status = 'ready'
    and (i.name ilike '%' || v_escaped || '%'
         or (char_length(v_query) >= 4 and v_query operator(extensions.<%) i.name))
    and (p_type is null
         or (p_type = 'folder' and i.kind = 'folder')
         or i.category::text = p_type)
    and (p_owner = 'any'
         or (p_owner = 'me' and i.owner_id = v_uid)
         or (p_owner = 'others' and i.owner_id <> v_uid))
    and (p_modified_from is null or i.updated_at >= p_modified_from)
    and (p_modified_to is null or i.updated_at < p_modified_to)
    and (i.owner_id = v_uid or (i.ancestors || i.id) operator(pg_catalog.&&) v_roots)
  order by
    case
      when i.name ilike v_escaped || '%' then 0
      when i.name ilike '%' || v_escaped || '%' then 1
      else 2
    end,
    extensions.word_similarity(v_query, i.name) desc,
    lower(i.name),
    i.id
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
end;
$$;

comment on function public.search_items(text, text, text, timestamptz, timestamptz, integer) is
  'Items the caller can see whose name matches, best first (same visibility as the items policy).';

revoke execute on function public.search_items(text, text, text, timestamptz, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.search_items(text, text, text, timestamptz, timestamptz, integer) to authenticated;

-- Activity -----------------------------------------------------------------------------------------

-- Newest first, for paging by (created_at, id): the next page starts below the last row shown.
create index activity_item_created_id_idx on public.activity (item_id, created_at desc, id desc);
drop index public.activity_item_created_idx;

-- What happened to an item, newest first; for a folder, to everything inside it that the caller
-- can see as well. Who did it, and the names the details point at (folders moved between, the
-- person shared with), each only if the caller could see it anyway: otherwise null. Pages of
-- `p_limit`, after the cursor (the last row's created_at and id). Unknown or invisible items: P0002.
create function public.item_activity(
  p_item_id uuid,
  p_before_at timestamptz default null,
  p_before_id bigint default null,
  p_limit integer default 30
)
returns table (
  id bigint,
  action public.activity_action,
  details jsonb,
  created_at timestamptz,
  item_id uuid,
  item_name text,
  item_kind public.item_kind,
  actor_id uuid,
  actor_name text,
  actor_email text,
  from_name text,
  to_name text,
  person_name text,
  person_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
begin
  perform private.require_access(p_item_id, 'viewer');
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'A cursor needs both its time and id' using errcode = 'LK422';
  end if;

  return query
  -- The items policy, once per item in the folder (not once per entry, of which there are more).
  with visible as materialized (
    select i.id, i.name, i.kind
    from public.items i
    where (i.id = p_item_id or i.ancestors @> array[p_item_id])
      and (i.owner_id = v_uid
           or (i.status = 'ready'
               and private.item_role(i.owner_id, i.id, i.ancestors)
                 >= case when i.trashed_at is null then 'viewer'::public.access_role else 'editor' end))
  ),
  page as (
    select a.id, a.action, a.details, a.created_at, a.actor_id, i.id as item_id, i.name, i.kind
    from visible i
    join public.activity a on a.item_id = i.id
    where (p_before_at is null or (a.created_at, a.id) < (p_before_at, p_before_id))
    order by a.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select
    p.id, p.action, p.details, p.created_at, p.item_id, p.name, p.kind, p.actor_id,
    actor.full_name, actor.email,
    from_folder.name, to_folder.name,
    person.full_name, person.email
  from page p
  left join public.profiles actor
    on actor.id = p.actor_id and (actor.id = v_uid or private.can_see_profile(actor.id))
  left join public.items from_folder
    on from_folder.id = case when p.action = 'moved' then (p.details ->> 'from')::uuid end
    and private.item_access(from_folder.id) is not null
  left join public.items to_folder
    on to_folder.id = case when p.action = 'moved' then (p.details ->> 'to')::uuid end
    and private.item_access(to_folder.id) is not null
  left join public.profiles person
    on person.id = case
      when p.action in ('shared', 'share_changed', 'unshared') then (p.details ->> 'user_id')::uuid
    end
    and (person.id = v_uid or private.can_see_profile(person.id))
  order by p.created_at desc, p.id desc;
end;
$$;

comment on function public.item_activity(uuid, timestamptz, bigint, integer) is
  'Activity on an item (and, for a folder, everything inside it), newest first, as the caller may see it.';

revoke execute on function public.item_activity(uuid, timestamptz, bigint, integer) from public, anon, authenticated;
grant execute on function public.item_activity(uuid, timestamptz, bigint, integer) to authenticated;
