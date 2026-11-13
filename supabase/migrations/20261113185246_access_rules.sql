-- Who can do what. Postgres decides access: every request on behalf of a user runs as that user,
-- so these policies hold even if the app has a bug.
--
-- The helpers below are SECURITY DEFINER so they can read shares and parent folders without
-- tripping the policies that call them. They live in `private`, which API roles have no USAGE on,
-- so they can't be called through the API; `authenticated` only gets EXECUTE because policies run
-- with the caller's privileges.

-- Roles --------------------------------------------------------------------------------------------

-- The caller's role on an item, from the item's own columns (no re-read, so it is cheap inside a
-- policy): `owner` if they own it, else the strongest of
--   - a share on the item or any folder above it, and
--   - `editor` if they own the top folder of the tree (someone uploaded into their folder).
-- Only the top folder counts: owning a folder somewhere inside someone else's tree gives no rights
-- over what others put in it, so losing your share on the tree really removes your access.
-- NULL means no access at all.
create function private.item_role(p_owner_id uuid, p_id uuid, p_ancestors uuid[])
returns public.access_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    when p_owner_id = (select auth.uid()) then 'owner'::public.access_role
    else (
      select max(r)
      from (
        select s.role::text::public.access_role as r
        from public.item_shares s
        where s.user_id = (select auth.uid()) and s.item_id = any (p_ancestors || p_id)
        union all
        select 'editor'::public.access_role
        from public.items a
        where a.id = p_ancestors[1] and a.owner_id = (select auth.uid())
      ) roles
    )
  end
$$;

-- The caller's role on an item they can see, by id; NULL if they can't see it. Mirrors the items
-- select policy: owners see everything of theirs, others see only uploaded items, and trashed
-- items only if they could restore them (editor or better).
create function private.item_access(p_id uuid)
returns public.access_role
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when i.owner_id = (select auth.uid()) then 'owner'::public.access_role
    when i.status <> 'ready' then null
    when i.trashed_at is not null and r.role < 'editor' then null
    else r.role
  end
  from public.items i
  cross join lateral (select private.item_role(i.owner_id, i.id, i.ancestors) as role) r
  where i.id = p_id
$$;

create function private.is_item_owner(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.items where id = p_id and owner_id = (select auth.uid())
  )
$$;

-- People can see the profile (name, email, avatar) of anyone who owns an item they can see or is
-- shared on one, so the app can show owners and "who has access". Strangers stay invisible.
create function private.can_see_profile(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.items i
    where i.owner_id = p_id and private.item_access(i.id) is not null
  ) or exists (
    select 1 from public.item_shares s
    where s.user_id = p_id and private.item_access(s.item_id) is not null
  )
$$;

revoke execute on function
  private.item_role(uuid, uuid, uuid[]),
  private.item_access(uuid),
  private.is_item_owner(uuid),
  private.can_see_profile(uuid)
from public, anon;

grant execute on function
  private.item_role(uuid, uuid, uuid[]),
  private.item_access(uuid),
  private.is_item_owner(uuid),
  private.can_see_profile(uuid)
to authenticated;

-- Profiles -----------------------------------------------------------------------------------------
-- Created by a trigger on sign-up and deleted with the account, so no insert or delete.
-- Users change only their name and avatar; storage numbers and the demo flag are off limits.

grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

create policy "profiles: see yourself and people you share with"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.can_see_profile(id));

create policy "profiles: update your own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Items --------------------------------------------------------------------------------------------
-- Folders are created with a plain insert. Files are created by start_upload(), and moving,
-- trashing and deleting go through functions that check more than a policy can.
-- Users may rename (the only column they can update directly).

grant select on public.items to authenticated;
grant insert (parent_id, kind, name) on public.items to authenticated;
grant update (name) on public.items to authenticated;

create policy "items: see your own and what is shared with you"
  on public.items for select to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      status = 'ready'
      and private.item_role(owner_id, id, ancestors)
        >= case when trashed_at is null then 'viewer'::public.access_role else 'editor' end
    )
  );

create policy "items: create folders where you can edit"
  on public.items for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and kind = 'folder'
    and (parent_id is null or private.item_access(parent_id) >= 'editor')
  );

create policy "items: rename what you can edit"
  on public.items for update to authenticated
  using (
    trashed_at is null and status = 'ready'
    and (owner_id = (select auth.uid()) or private.item_role(owner_id, id, ancestors) >= 'editor')
  )
  with check (
    trashed_at is null and status = 'ready'
    and (owner_id = (select auth.uid()) or private.item_role(owner_id, id, ancestors) >= 'editor')
  );

-- Shares -------------------------------------------------------------------------------------------
-- Created by share_item() (it looks people up by email, which users can't do themselves).
-- Owners change roles and remove shares; anyone can remove their own access.

grant select on public.item_shares to authenticated;
grant update (role) on public.item_shares to authenticated;
grant delete on public.item_shares to authenticated;

create policy "item_shares: see shares on items you can see"
  on public.item_shares for select to authenticated
  using (user_id = (select auth.uid()) or private.item_access(item_id) is not null);

create policy "item_shares: owners change roles"
  on public.item_shares for update to authenticated
  using (private.is_item_owner(item_id))
  with check (private.is_item_owner(item_id));

create policy "item_shares: owners remove shares, people leave"
  on public.item_shares for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_item_owner(item_id));

grant select on public.share_invites to authenticated;
grant update (role) on public.share_invites to authenticated;
grant delete on public.share_invites to authenticated;

create policy "share_invites: see invites on items you can see"
  on public.share_invites for select to authenticated
  using (private.item_access(item_id) is not null);

create policy "share_invites: owners change roles"
  on public.share_invites for update to authenticated
  using (private.is_item_owner(item_id))
  with check (private.is_item_owner(item_id));

create policy "share_invites: owners cancel invites"
  on public.share_invites for delete to authenticated
  using (private.is_item_owner(item_id));

-- Public links -------------------------------------------------------------------------------------
-- Only owners manage links. Links are revoked, never deleted, so the history stays.

grant select on public.share_links to authenticated;
grant insert (item_id, token_hash, expires_at) on public.share_links to authenticated;
grant update (expires_at, revoked_at) on public.share_links to authenticated;

create policy "share_links: owners see their links"
  on public.share_links for select to authenticated
  using (private.is_item_owner(item_id));

create policy "share_links: owners create links"
  on public.share_links for insert to authenticated
  with check (created_by = (select auth.uid()) and private.is_item_owner(item_id));

create policy "share_links: owners revoke links"
  on public.share_links for update to authenticated
  using (private.is_item_owner(item_id))
  with check (private.is_item_owner(item_id));

-- Stars and recents --------------------------------------------------------------------------------
-- Each user's own rows, and only for items they can see.

grant select, delete on public.stars to authenticated;
grant insert (item_id) on public.stars to authenticated;

create policy "stars: see your own"
  on public.stars for select to authenticated
  using (user_id = (select auth.uid()));

create policy "stars: star items you can see"
  on public.stars for insert to authenticated
  with check (user_id = (select auth.uid()) and private.item_access(item_id) is not null);

create policy "stars: unstar your own"
  on public.stars for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, delete on public.recents to authenticated;
grant insert (item_id) on public.recents to authenticated;
grant update (touched_at) on public.recents to authenticated;

create policy "recents: see your own"
  on public.recents for select to authenticated
  using (user_id = (select auth.uid()));

create policy "recents: record items you can see"
  on public.recents for insert to authenticated
  with check (user_id = (select auth.uid()) and private.item_access(item_id) is not null);

create policy "recents: update your own"
  on public.recents for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.item_access(item_id) is not null);

create policy "recents: clear your own"
  on public.recents for delete to authenticated
  using (user_id = (select auth.uid()));

-- Activity -----------------------------------------------------------------------------------------
-- Read-only for users: written by triggers, never by hand.

grant select on public.activity to authenticated;

create policy "activity: see activity on items you can see"
  on public.activity for select to authenticated
  using (private.item_access(item_id) is not null);
