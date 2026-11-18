-- Phase 8: sharing. Rate limits for sharing and public links, sharing that says whether it was new
-- (so only new shares send an email), one live public link per item created in one step, and a
-- status lookup so a dead link can say why.

-- Rate limits --------------------------------------------------------------------------------------

-- Fixed windows per key ("share:<user>", "link:<link id>"). One row per key, reused when its window
-- has passed, so the table only grows with the number of people and links.
create table private.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null
);

-- Not reachable through the API (private schema); RLS with no policies all the same.
alter table private.rate_limits enable row level security;

-- Counts one use of `p_key`; raises LK429 once more than `p_limit` fall in one window. The refused
-- use rolls back with its transaction, so hammering doesn't push the window further out.
create function private.take_rate_limit(p_key text, p_limit integer, p_window interval)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hits integer;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update
  set window_start = case when r.window_start <= now() - p_window then now() else r.window_start end,
      hits = case when r.window_start <= now() - p_window then 1 else r.hits + 1 end
  returning r.hits into v_hits;
  if v_hits > p_limit then
    raise exception 'Too many requests. Try again in a few minutes.' using errcode = 'LK429';
  end if;
end;
$$;

revoke execute on function private.take_rate_limit(text, integer, interval) from public, anon, authenticated;

-- Sharing with people ------------------------------------------------------------------------------

-- As before, but limited to 50 shares an hour per person (each one can send an email), and it
-- returns whether this gave the address access for the first time (false for a role change). That
-- is true for both accounts and invites, so it still says nothing about who has an account.
drop function public.share_item(uuid, text, public.share_role);

create function public.share_item(p_item_id uuid, p_email text, p_role public.share_role)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
  v_new boolean;
begin
  if private.require_access(p_item_id, 'viewer') <> 'owner' then
    raise exception 'Only the owner can share this' using errcode = '42501';
  end if;
  if p_role is null then
    raise exception 'Choose a role' using errcode = 'LK422';
  end if;
  if exists (select 1 from public.items where id = p_item_id and (trashed_at is not null or status <> 'ready')) then
    raise exception 'This item can''t be shared right now' using errcode = 'LK409';
  end if;
  if v_email = (select lower(email) from public.profiles where id = v_uid) then
    raise exception 'You already own this' using errcode = 'LK422';
  end if;
  perform private.take_rate_limit('share:' || v_uid, 50, interval '1 hour');

  -- Auth stores emails lower-cased, so this uses its index.
  select u.id into v_user_id
  from auth.users u
  where u.email = v_email and u.email_confirmed_at is not null;

  -- xmax is 0 on a row this statement inserted, and set on one it updated.
  if v_user_id is not null then
    insert into public.item_shares as s (item_id, user_id, role, created_by)
    values (p_item_id, v_user_id, p_role, v_uid)
    on conflict (item_id, user_id) do update set role = excluded.role
    returning s.xmax = 0 into v_new;
  else
    insert into public.share_invites as s (item_id, email, role, created_by)
    values (p_item_id, v_email, p_role, v_uid)
    on conflict (item_id, email) do update set role = excluded.role
    returning s.xmax = 0 into v_new;
  end if;
  return v_new;
end;
$$;

comment on function public.share_item(uuid, text, public.share_role) is
  'Shares an item with an email (account or invite); true when that address had no share yet.';

revoke execute on function public.share_item(uuid, text, public.share_role) from public, anon, authenticated;
grant execute on function public.share_item(uuid, text, public.share_role) to authenticated;

-- Public links -------------------------------------------------------------------------------------

-- One live link per item: a new one replaces the old (create_share_link revokes it first).
create unique index share_links_one_live_idx on public.share_links (item_id) where revoked_at is null;

-- Creates the item's public link, replacing any it had. The app makes the token and sends only its
-- SHA-256, so the token is never stored. 30 new links an hour per person.
create function public.create_share_link(
  p_item_id uuid,
  p_token_hash bytea,
  p_expires_at timestamptz default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_id uuid;
begin
  if private.require_access(p_item_id, 'viewer') <> 'owner' then
    raise exception 'Only the owner can create a link' using errcode = '42501';
  end if;
  if exists (select 1 from public.items where id = p_item_id and (trashed_at is not null or status <> 'ready')) then
    raise exception 'This item can''t be shared right now' using errcode = 'LK409';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Choose an expiry date in the future' using errcode = 'LK422';
  end if;
  perform private.take_rate_limit('new-link:' || v_uid, 30, interval '1 hour');

  update public.share_links l set revoked_at = now()
  where l.item_id = p_item_id and l.revoked_at is null;
  insert into public.share_links (item_id, token_hash, expires_at, created_by)
  values (p_item_id, p_token_hash, p_expires_at, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;

comment on function public.create_share_link(uuid, bytea, timestamptz) is
  'Replaces the item''s public link with a new one (owner only); returns the link id.';

revoke execute on function public.create_share_link(uuid, bytea, timestamptz) from public, anon, authenticated;
grant execute on function public.create_share_link(uuid, bytea, timestamptz) to authenticated;

-- Counts a use of a live link: 600 requests per 10 minutes per link (a folder page, a preview and a
-- download are one each). Unknown tokens aren't counted: there is nothing to protect, and a 256-bit
-- token can't be guessed.
create function private.count_link_use(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select l.id into v_id
  from public.share_links l
  where char_length(p_token) between 1 and 128
    and l.token_hash = extensions.digest(p_token, 'sha256')
    and l.revoked_at is null;
  if v_id is not null then
    perform private.take_rate_limit('link:' || v_id, 600, interval '10 minutes');
  end if;
end;
$$;

revoke execute on function private.count_link_use(text) from public, anon, authenticated;

-- The three link functions as before, each counting a use first.
create or replace function public.resolve_share_link(p_token text)
returns table (
  id uuid, kind public.item_kind, name text, size bigint, mime_type text,
  category public.item_category, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.count_link_use(p_token);
  return query
  select i.id, i.kind, i.name, i.size, i.mime_type, i.category, i.updated_at
  from private.link_item(p_token) i
  where i.id is not null;
end;
$$;

create or replace function public.share_link_children(p_token text, p_folder_id uuid)
returns table (
  id uuid, kind public.item_kind, name text, size bigint, mime_type text,
  category public.item_category, updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.count_link_use(p_token);
  return query
  select c.id, c.kind, c.name, c.size, c.mime_type, c.category, c.updated_at
  from private.link_reaches(p_token, p_folder_id) f
  join public.items c on c.parent_id = f.id
  where f.kind = 'folder' and c.trashed_at is null and c.status = 'ready'
  order by c.kind = 'file', lower(c.name), c.id;
end;
$$;

create or replace function public.share_link_file(p_token text, p_item_id uuid)
returns table (object_key text, name text, mime_type text, size bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.count_link_use(p_token);
  return query
  select f.object_key, f.name, f.mime_type, f.size
  from private.link_reaches(p_token, p_item_id) f
  where f.kind = 'file';
end;
$$;

-- Why a link doesn't open, for a friendly page: 'ok', 'revoked', 'expired' or 'unavailable' (the
-- item is in the trash); no row for a token that never existed or whose item was deleted. Only
-- someone holding the token learns this.
create function public.share_link_status(p_token text)
returns table (status text, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when l.revoked_at is not null then 'revoked'
      when l.expires_at is not null and l.expires_at <= now() then 'expired'
      when i.trashed_at is not null or i.status <> 'ready' then 'unavailable'
      else 'ok'
    end,
    l.expires_at
  from public.share_links l
  join public.items i on i.id = l.item_id
  where char_length(p_token) between 1 and 128
    and l.token_hash = extensions.digest(p_token, 'sha256')
$$;

revoke execute on function public.share_link_status(text) from public, anon, authenticated;
grant execute on function public.share_link_status(text) to anon, authenticated;

-- The path from the linked folder down to an item reached through the link, top first, for the
-- link page's breadcrumbs. Nothing above the linked item is ever shown. Not counted as a use: it
-- comes with a folder page, which already counts.
create function public.share_link_path(p_token text, p_item_id uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.name
  from private.link_reaches(p_token, p_item_id) t
  cross join lateral (select (private.link_item(p_token)).id as root_id) r
  cross join lateral unnest(t.ancestors || t.id) with ordinality as p(item_id, position)
  join public.items a on a.id = p.item_id
  where t.id is not null
    and p.position >= array_position(t.ancestors || t.id, r.root_id)
  order by p.position
$$;

revoke execute on function public.share_link_path(text, uuid) from public, anon, authenticated;
grant execute on function public.share_link_path(text, uuid) to anon, authenticated;
