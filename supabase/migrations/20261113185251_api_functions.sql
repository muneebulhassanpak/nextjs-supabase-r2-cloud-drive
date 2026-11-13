-- Functions the app calls through the API (RPC). Each one that runs as its owner
-- (SECURITY DEFINER) checks who is calling and what they may do itself, before touching anything.
-- Error codes are listed at the top of the triggers migration.

-- Shared checks ------------------------------------------------------------------------------------

create function private.current_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- Fails unless the caller can see the item and has at least `p_needed` on it. "Can't see it" and
-- "doesn't exist" give the same error, so ids reveal nothing.
create function private.require_access(p_id uuid, p_needed public.access_role)
returns public.access_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.access_role := private.item_access(p_id);
begin
  if v_role is null then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if v_role < p_needed then
    raise exception 'You don''t have permission to do that' using errcode = '42501';
  end if;
  return v_role;
end;
$$;

-- Uploads ------------------------------------------------------------------------------------------

-- Step 1 of an upload: checks the folder, the file size limit and the quota, reserves the space and
-- creates a pending item with a random storage key. The app then signs an upload URL for that key.
create function public.start_upload(p_parent_id uuid, p_name text, p_size bigint, p_mime_type text)
returns table (id uuid, object_key text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_name text := btrim(p_name);
begin
  if p_parent_id is not null then
    perform private.require_access(p_parent_id, 'editor');
  end if;
  if p_size is null or p_size < 0 then
    raise exception 'Invalid file size' using errcode = 'LK422';
  end if;
  if p_size > 26214400 then
    raise exception 'Files can be at most 25 MB' using errcode = 'LK413';
  end if;
  -- Fail early on a name clash rather than after the bytes are uploaded. The unique index still
  -- has the final say when the upload completes.
  if exists (
    select 1 from public.items i
    where i.trashed_at is null and i.status = 'ready' and lower(i.name) = lower(v_name)
      and case when p_parent_id is null then i.parent_id is null and i.owner_id = v_uid
               else i.parent_id = p_parent_id end
  ) then
    raise exception 'An item with this name already exists here' using errcode = '23505';
  end if;

  return query
  insert into public.items as i (owner_id, parent_id, kind, name, size, mime_type, object_key, status)
  values (
    v_uid, p_parent_id, 'file', v_name, p_size, lower(btrim(p_mime_type)),
    'u/' || v_uid || '/' || gen_random_uuid(), 'pending'
  )
  returning i.id, i.object_key;
end;
$$;

-- Step 2: the app has checked the object is in storage; the file becomes visible.
create function public.complete_upload(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
begin
  update public.items set status = 'ready'
  where id = p_item_id and owner_id = v_uid and status = 'pending';
  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Gives up on an upload: removes the pending item, frees the space, and returns the storage key
-- so the app can delete anything already uploaded.
create function public.cancel_upload(p_item_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_key text;
begin
  delete from public.items
  where id = p_item_id and owner_id = v_uid and status = 'pending'
  returning object_key into v_key;
  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;
  return v_key;
end;
$$;

-- Moving -------------------------------------------------------------------------------------------

-- Moves an item into another folder (or to the top of the owner's drive with NULL). The caller
-- needs edit rights on both ends. Taking anything into a different tree (including someone's
-- root) requires owning everything being moved, so nobody can carry other people's files out of
-- the folder they were shared in, not even inside a folder of their own. Someone who doesn't own
-- the item also can't move the shared item itself. Moving a folder inside itself is refused by the
-- trigger.
create function public.move_item(p_item_id uuid, p_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_item public.items;
  v_target public.items;
begin
  perform private.require_access(p_item_id, 'editor');
  if p_parent_id is not null then
    perform private.require_access(p_parent_id, 'editor');
  end if;
  perform private.lock_trees(array[p_item_id, p_parent_id], true);

  select * into v_item from public.items where id = p_item_id;
  if v_item.trashed_at is not null then
    raise exception 'Restore the item before moving it' using errcode = 'LK409';
  end if;
  if v_item.parent_id is not distinct from p_parent_id then
    return;
  end if;
  if p_parent_id is not null then
    select * into v_target from public.items where id = p_parent_id;
  end if;

  if v_item.owner_id <> v_uid
     and (v_item.parent_id is null or coalesce(private.item_access(v_item.parent_id), 'viewer') < 'editor') then
    raise exception 'You can only move this inside the folder it''s shared in' using errcode = '42501';
  end if;

  if (p_parent_id is null or coalesce(v_item.ancestors[1], v_item.id) <> coalesce(v_target.ancestors[1], v_target.id))
     and exists (
       select 1 from public.items d
       where (d.id = p_item_id or d.ancestors @> array[p_item_id]) and d.owner_id <> v_uid
     ) then
    raise exception 'Items owned by other people can only be moved within the folder they''re in'
      using errcode = '42501';
  end if;

  update public.items set parent_id = p_parent_id where id = p_item_id;
end;
$$;

-- Trash --------------------------------------------------------------------------------------------

-- Puts an item and everything inside it in the trash. Editors can trash items inside a folder
-- shared with them, but not the shared item itself.
create function public.trash_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_item public.items;
begin
  perform private.require_access(p_item_id, 'editor');
  perform private.lock_trees(array[p_item_id], true);
  select * into v_item from public.items where id = p_item_id;

  if v_item.status <> 'ready' then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  if v_item.trashed_at is not null then
    raise exception 'This is already in the trash' using errcode = 'LK409';
  end if;
  if v_item.owner_id <> v_uid
     and (v_item.parent_id is null or coalesce(private.item_access(v_item.parent_id), 'viewer') < 'editor') then
    raise exception 'Only the owner can remove this' using errcode = '42501';
  end if;

  update public.items
  set trashed_at = now(), trashed_by = v_uid, trash_root = p_item_id
  where (id = p_item_id or ancestors @> array[p_item_id]) and trashed_at is null;
end;
$$;

-- Brings back an item and everything that went into the trash with it.
create function public.restore_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_item public.items;
begin
  perform private.require_access(p_item_id, 'editor');
  perform private.lock_trees(array[p_item_id], true);
  select * into v_item from public.items where id = p_item_id;

  if v_item.trashed_at is null then
    raise exception 'This isn''t in the trash' using errcode = 'LK409';
  end if;
  if v_item.trash_root <> v_item.id then
    raise exception 'Restore the folder it was in instead' using errcode = 'LK409';
  end if;
  if v_item.parent_id is not null
     and exists (select 1 from public.items where id = v_item.parent_id and trashed_at is not null) then
    raise exception 'The folder it was in is in the trash' using errcode = 'LK409';
  end if;
  if v_item.owner_id <> v_uid
     and (v_item.parent_id is null or coalesce(private.item_access(v_item.parent_id), 'viewer') < 'editor') then
    raise exception 'Only the owner can restore this' using errcode = '42501';
  end if;

  update public.items
  set trashed_at = null, trashed_by = null, trash_root = null
  where trash_root = p_item_id;
end;
$$;

-- Deleting forever removes only the caller's own items. Anything inside that belongs to someone
-- else is handed back first: it moves to the top of its owner's drive, still in their trash (as its
-- own trash entry), so they decide what happens to it. Returns the storage keys of the caller's
-- files in the subtree, which are deleted with it.
create function private.delete_own_subtree(p_root_id uuid, p_uid uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_foreign_id uuid;
begin
  -- The topmost item of each foreign branch; its own contents travel with it.
  for v_foreign_id in
    select d.id from public.items d
    where d.ancestors @> array[p_root_id] and d.owner_id <> p_uid
      and not exists (
        select 1 from public.items a
        where a.id = any (d.ancestors) and a.ancestors @> array[p_root_id] and a.owner_id <> p_uid
      )
  loop
    update public.items set trash_root = v_foreign_id
    where (id = v_foreign_id or ancestors @> array[v_foreign_id]) and trash_root = p_root_id;
    update public.items set parent_id = null where id = v_foreign_id;
  end loop;

  return query
  select i.object_key from public.items i
  where (i.id = p_root_id or i.ancestors @> array[p_root_id]) and i.kind = 'file';

  delete from public.items where id = p_root_id;
end;
$$;

-- Deletes a trashed item and everything inside it that the caller owns, for good. Only the owner
-- can. Returns the storage keys of the deleted files so the app can delete the bytes.
create function public.delete_forever(p_item_id uuid)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_item public.items;
begin
  if private.require_access(p_item_id, 'viewer') <> 'owner' then
    raise exception 'Only the owner can delete this forever' using errcode = '42501';
  end if;
  perform private.lock_trees(array[p_item_id], true);
  select * into v_item from public.items where id = p_item_id;
  if v_item.trashed_at is null then
    raise exception 'Move it to the trash first' using errcode = 'LK409';
  end if;

  return query select * from private.delete_own_subtree(p_item_id, v_uid);
end;
$$;

-- Empties the caller's trash: every trash entry they own, whoever put it there.
create function public.empty_trash()
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_roots uuid[];
  v_root uuid;
begin
  select coalesce(array_agg(id), '{}') into v_roots
  from public.items
  where owner_id = v_uid and trashed_at is not null and trash_root = id;
  perform private.lock_trees(v_roots, true);

  foreach v_root in array v_roots loop
    -- It may have gone already, inside another entry deleted just before it.
    if exists (select 1 from public.items where id = v_root and trash_root = id and owner_id = v_uid) then
      return query select * from private.delete_own_subtree(v_root, v_uid);
    end if;
  end loop;
end;
$$;

-- Sharing ------------------------------------------------------------------------------------------

-- Shares an item with an email address. If a confirmed account has that email it gets access now;
-- otherwise an invite waits until someone confirms that address. The caller isn't told which, so
-- this can't be used to find out who has an account.
create function public.share_item(p_item_id uuid, p_email text, p_role public.share_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_email text := lower(btrim(p_email));
  v_user_id uuid;
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

  -- Auth stores emails lower-cased, so this uses its index.
  select u.id into v_user_id
  from auth.users u
  where u.email = v_email and u.email_confirmed_at is not null;

  if v_user_id is not null then
    insert into public.item_shares (item_id, user_id, role, created_by)
    values (p_item_id, v_user_id, p_role, v_uid)
    on conflict (item_id, user_id) do update set role = excluded.role;
  else
    insert into public.share_invites (item_id, email, role, created_by)
    values (p_item_id, v_email, p_role, v_uid)
    on conflict (item_id, email) do update set role = excluded.role;
  end if;
end;
$$;

-- Public links -------------------------------------------------------------------------------------
-- Anyone with the token can view the linked item and what's inside it, read-only, while the link is
-- live: not revoked, not expired, and the item not in the trash.

create function private.link_item(p_token text)
returns public.items
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
  from public.share_links l
  join public.items i on i.id = l.item_id
  where char_length(p_token) between 1 and 128
    and l.token_hash = extensions.digest(p_token, 'sha256')
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now())
    and i.trashed_at is null
    and i.status = 'ready'
$$;

-- An item reachable through a link: the linked item itself or anything inside it.
create function private.link_reaches(p_token text, p_item_id uuid)
returns public.items
language sql
stable
security definer
set search_path = ''
as $$
  select i.*
  from public.items i
  cross join lateral (select (private.link_item(p_token)).id as root_id) l
  where i.id = p_item_id
    and l.root_id is not null
    and (i.id = l.root_id or l.root_id = any (i.ancestors))
    and i.trashed_at is null
    and i.status = 'ready'
$$;

create function public.resolve_share_link(p_token text)
returns table (
  id uuid, kind public.item_kind, name text, size bigint, mime_type text,
  category public.item_category, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.kind, i.name, i.size, i.mime_type, i.category, i.updated_at
  from private.link_item(p_token) i
  where i.id is not null
$$;

-- The contents of a folder reached through a link, folders first.
create function public.share_link_children(p_token text, p_folder_id uuid)
returns table (
  id uuid, kind public.item_kind, name text, size bigint, mime_type text,
  category public.item_category, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.kind, c.name, c.size, c.mime_type, c.category, c.updated_at
  from private.link_reaches(p_token, p_folder_id) f
  join public.items c on c.parent_id = f.id
  where f.kind = 'folder' and c.trashed_at is null and c.status = 'ready'
  order by c.kind = 'file', lower(c.name)
$$;

-- What the app needs to sign a download URL for a file reached through a link.
create function public.share_link_file(p_token text, p_item_id uuid)
returns table (object_key text, name text, mime_type text, size bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.object_key, f.name, f.mime_type, f.size
  from private.link_reaches(p_token, p_item_id) f
  where f.kind = 'file'
$$;

-- Search and recents (run as the caller, so RLS decides what comes back) ---------------------------

create function public.search_items(p_query text, p_limit integer default 50)
returns setof public.items
language sql
stable
security invoker
set search_path = ''
as $$
  select i.*
  from public.items i
  where i.trashed_at is null
    and i.status = 'ready'
    and char_length(btrim(p_query)) between 1 and 200
    and i.name ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by extensions.similarity(i.name, btrim(p_query)) desc, i.updated_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100)
$$;

create function public.touch_recent(p_item_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.recents (item_id) values (p_item_id)
  on conflict (user_id, item_id) do update set touched_at = now();
$$;

-- Maintenance (server only) ------------------------------------------------------------------------

-- Removes uploads that never finished and returns their storage keys. Called by a cron route.
create function public.cleanup_pending_uploads(p_older_than interval default interval '1 day')
returns setof text
language sql
security definer
set search_path = ''
as $$
  delete from public.items
  where status = 'pending' and created_at < now() - p_older_than
  returning object_key;
$$;

-- Who can call what --------------------------------------------------------------------------------

revoke execute on function
  private.current_user_id(),
  private.require_access(uuid, public.access_role),
  private.link_item(text),
  private.link_reaches(text, uuid),
  private.delete_own_subtree(uuid, uuid),
  public.start_upload(uuid, text, bigint, text),
  public.complete_upload(uuid),
  public.cancel_upload(uuid),
  public.move_item(uuid, uuid),
  public.trash_item(uuid),
  public.restore_item(uuid),
  public.delete_forever(uuid),
  public.empty_trash(),
  public.share_item(uuid, text, public.share_role),
  public.resolve_share_link(text),
  public.share_link_children(text, uuid),
  public.share_link_file(text, uuid),
  public.search_items(text, integer),
  public.touch_recent(uuid),
  public.cleanup_pending_uploads(interval)
from public, anon, authenticated;

grant execute on function
  public.start_upload(uuid, text, bigint, text),
  public.complete_upload(uuid),
  public.cancel_upload(uuid),
  public.move_item(uuid, uuid),
  public.trash_item(uuid),
  public.restore_item(uuid),
  public.delete_forever(uuid),
  public.empty_trash(),
  public.share_item(uuid, text, public.share_role),
  public.search_items(text, integer),
  public.touch_recent(uuid)
to authenticated;

grant execute on function
  public.resolve_share_link(text),
  public.share_link_children(text, uuid),
  public.share_link_file(text, uuid)
to anon, authenticated;

grant execute on function public.cleanup_pending_uploads(interval) to service_role;
