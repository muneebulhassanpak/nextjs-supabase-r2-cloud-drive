-- Triggers keep the derived data right no matter who writes: profiles on sign-up, folder
-- ancestry, storage used, `updated_at`, and the activity log.

-- Project error codes (SQLSTATE), mapped to HTTP errors in src/server/errors.ts:
--   P0002 not found (standard `no_data_found`)    42501 not allowed (standard)
--   LK409 conflict with the current state          LK413 quota or size limit reached
--   LK422 invalid input (our own; Postgres' 22023 is not shown to users, its wording is internal)

-- Tree locks -------------------------------------------------------------------------------------
-- Moving and trashing rewrite whole subtrees in one statement. If an item were added inside the
-- subtree at the same moment, that statement wouldn't see it and the new item would keep a stale
-- path (and, with it, stale access). So changes to a tree's shape lock that tree exclusively, and
-- adding an item locks it shared: adds don't wait for each other, only for moves and trashing in
-- the same tree. A tree is named by its top item. Locks are taken in a fixed order, and the roots
-- are read again afterwards in case a move changed them while we waited.

create function private.lock_trees(p_item_ids uuid[], p_exclusive boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_locked uuid[] := '{}'::uuid[];
  v_roots uuid[];
  v_root uuid;
begin
  loop
    select coalesce(array_agg(distinct coalesce(i.ancestors[1], i.id) order by coalesce(i.ancestors[1], i.id)), '{}')
    into v_roots
    from public.items i
    where i.id = any (p_item_ids);

    exit when v_roots <@ v_locked;

    foreach v_root in array v_roots loop
      continue when v_root = any (v_locked);
      if p_exclusive then
        perform pg_advisory_xact_lock(hashtextextended('lockerly.tree:' || v_root, 0));
      else
        perform pg_advisory_xact_lock_shared(hashtextextended('lockerly.tree:' || v_root, 0));
      end if;
      v_locked := v_locked || v_root;
    end loop;
  end loop;
end;
$$;

-- Profiles and invites -----------------------------------------------------------------------------

-- Turns invites for this email into shares. Only called once the email is confirmed, so signing
-- up with someone else's address doesn't hand you what was shared with them. Every invite for the
-- email is used up, including any on the user's own items (those just don't become shares).
create function private.claim_share_invites(p_user_id uuid, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    delete from public.share_invites inv
    where inv.email = lower(p_email)
    returning inv.item_id, inv.role, inv.created_by
  )
  insert into public.item_shares (item_id, user_id, role, created_by)
  select c.item_id, p_user_id, c.role, c.created_by
  from claimed c
  join public.items i on i.id = c.item_id
  where i.owner_id <> p_user_id
  on conflict (item_id, user_id) do update set role = greatest(public.item_shares.role, excluded.role);
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 100), '')
  );
  if new.email_confirmed_at is not null then
    perform private.claim_share_invites(new.id, new.email);
  end if;
  return null;
end;
$$;

create function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  if new.email_confirmed_at is not null
     and (old.email_confirmed_at is null or new.email is distinct from old.email) then
    perform private.claim_share_invites(new.id, new.email);
  end if;
  return null;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create trigger on_auth_user_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function private.handle_user_updated();

-- updated_at ---------------------------------------------------------------------------------------

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger set_updated_at before update on public.item_shares
  for each row execute function private.set_updated_at();

-- Items: path, quota and protected columns ---------------------------------------------------------

-- Reads the folder an item goes into and returns its path (ancestors + its own id).
create function private.folder_path(p_folder_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_folder public.items;
begin
  select * into v_folder from public.items where id = p_folder_id;
  if not found then
    raise exception 'Folder not found' using errcode = 'P0002';
  end if;
  if v_folder.kind <> 'folder' then
    raise exception 'Items can only go inside a folder' using errcode = 'LK422';
  end if;
  if v_folder.trashed_at is not null then
    raise exception 'That folder is in the trash' using errcode = 'LK409';
  end if;
  return v_folder.ancestors || v_folder.id;
end;
$$;

create function private.items_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    -- A signed-in caller must be able to see the folder before learning anything else about it,
    -- so a hidden folder gives the same error as one that doesn't exist. (RLS would refuse the
    -- insert anyway, but only after this trigger has run.)
    if (select auth.uid()) is not null and private.item_access(new.parent_id) is null then
      raise exception 'Folder not found' using errcode = 'P0002';
    end if;
    perform private.lock_trees(array[new.parent_id], false);
  end if;

  new.ancestors := case when new.parent_id is null then '{}' else private.folder_path(new.parent_id) end;
  new.trashed_at := null;
  new.trashed_by := null;
  new.trash_root := null;
  new.updated_by := (select auth.uid());

  -- Reserve the space. One statement checks and adds, and the row lock makes parallel uploads
  -- queue up, so two of them can't both squeeze under the quota. (A file without a size is left
  -- for the check constraint to refuse.)
  if new.kind = 'file' and new.size is not null then
    update public.profiles
    set storage_used = storage_used + new.size
    where id = new.owner_id and storage_used + new.size <= storage_quota;
    if not found then
      raise exception 'Not enough storage space left' using errcode = 'LK413';
    end if;
  end if;

  return new;
end;
$$;

create function private.items_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Never change after creation: ownership, the stored bytes and what kind of item it is.
  if new.owner_id is distinct from old.owner_id
     or new.kind is distinct from old.kind
     or new.size is distinct from old.size
     or new.object_key is distinct from old.object_key
     or new.mime_type is distinct from old.mime_type
     or new.created_at is distinct from old.created_at then
    raise exception 'This field can''t be changed' using errcode = '42501';
  end if;
  if new.status = 'pending' and old.status = 'ready' then
    raise exception 'A finished upload can''t go back to pending' using errcode = 'LK409';
  end if;

  if new.parent_id is distinct from old.parent_id then
    if new.parent_id is null then
      new.ancestors := '{}';
    else
      new.ancestors := private.folder_path(new.parent_id);
      if new.id = any (new.ancestors) then
        raise exception 'A folder can''t be moved inside itself' using errcode = 'LK409';
      end if;
    end if;
  elsif new.ancestors is distinct from old.ancestors and pg_trigger_depth() = 1 then
    -- Paths change only as a result of a move (depth > 1, from the trigger below).
    raise exception 'This field can''t be changed' using errcode = '42501';
  end if;

  if new.name is distinct from old.name
     or new.parent_id is distinct from old.parent_id
     or new.status is distinct from old.status
     or new.trashed_at is distinct from old.trashed_at then
    new.updated_at := now();
    new.updated_by := coalesce((select auth.uid()), old.updated_by);
  end if;

  return new;
end;
$$;

-- After a move, rewrite the path of everything inside the moved item.
create function private.items_after_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.items
  set ancestors = new.ancestors || new.id || ancestors[cardinality(old.ancestors) + 2:]
  where ancestors @> array[old.id];
  return null;
end;
$$;

-- Deleting a file (cancelled upload, delete forever, account removal) gives its space back.
create function private.items_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kind = 'file' then
    update public.profiles
    set storage_used = greatest(storage_used - old.size, 0)
    where id = old.owner_id;
  end if;
  return null;
end;
$$;

create trigger items_before_insert before insert on public.items
  for each row execute function private.items_before_insert();
create trigger items_before_update before update on public.items
  for each row execute function private.items_before_update();
create trigger items_after_move after update of parent_id on public.items
  for each row when (old.parent_id is distinct from new.parent_id)
  execute function private.items_after_move();
create trigger items_after_delete after delete on public.items
  for each row execute function private.items_after_delete();

-- Links: a revoked link stays revoked --------------------------------------------------------------

create function private.share_links_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null then
    raise exception 'This link has been revoked' using errcode = 'LK409';
  end if;
  return new;
end;
$$;

create trigger share_links_before_update before update on public.share_links
  for each row execute function private.share_links_before_update();

-- Activity log -------------------------------------------------------------------------------------

create function private.log_activity(p_item_id uuid, p_action public.activity_action, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (item_id, actor_id, action, details)
  values (p_item_id, (select auth.uid()), p_action, coalesce(p_details, '{}'));
$$;

create function private.items_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.kind = 'folder' then
      perform private.log_activity(new.id, 'created', jsonb_build_object('name', new.name));
    elsif new.status = 'ready' then
      perform private.log_activity(new.id, 'uploaded', jsonb_build_object('name', new.name));
    end if;
    return null;
  end if;

  if old.status = 'pending' and new.status = 'ready' then
    perform private.log_activity(new.id, 'uploaded', jsonb_build_object('name', new.name));
  end if;
  if new.name is distinct from old.name then
    perform private.log_activity(new.id, 'renamed', jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if new.parent_id is distinct from old.parent_id then
    perform private.log_activity(new.id, 'moved', jsonb_build_object('from', old.parent_id, 'to', new.parent_id));
  end if;
  -- Only the item the user acted on, not everything that went into the trash with it.
  if old.trashed_at is null and new.trashed_at is not null and new.trash_root = new.id then
    perform private.log_activity(new.id, 'trashed', '{}');
  end if;
  if old.trashed_at is not null and new.trashed_at is null and old.trash_root = old.id then
    perform private.log_activity(new.id, 'restored', '{}');
  end if;
  return null;
end;
$$;

create trigger items_activity after insert or update on public.items
  for each row execute function private.items_activity();

create function private.item_shares_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.item_id, 'shared',
      jsonb_build_object('user_id', new.user_id, 'role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.log_activity(new.item_id, 'share_changed',
        jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
    end if;
  -- When the item itself is being deleted, its shares go with it and there is nothing to log on.
  elsif exists (select 1 from public.items where id = old.item_id) then
    perform private.log_activity(old.item_id, 'unshared',
      jsonb_build_object('user_id', old.user_id, 'role', old.role));
  end if;
  return null;
end;
$$;

create trigger item_shares_activity after insert or update or delete on public.item_shares
  for each row execute function private.item_shares_activity();

create function private.share_links_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.item_id, 'link_created', jsonb_build_object('link_id', new.id));
  elsif old.revoked_at is null and new.revoked_at is not null then
    perform private.log_activity(new.item_id, 'link_revoked', jsonb_build_object('link_id', new.id));
  end if;
  return null;
end;
$$;

create trigger share_links_activity after insert or update on public.share_links
  for each row execute function private.share_links_activity();

-- Postgres lets everyone execute new functions. None of these are meant to be called directly
-- (triggers don't need EXECUTE to fire), so take that away. The guard tests keep it that way.
revoke execute on function
  private.lock_trees(uuid[], boolean),
  private.claim_share_invites(uuid, text),
  private.handle_new_user(),
  private.handle_user_updated(),
  private.set_updated_at(),
  private.folder_path(uuid),
  private.items_before_insert(),
  private.items_before_update(),
  private.items_after_move(),
  private.items_after_delete(),
  private.share_links_before_update(),
  private.log_activity(uuid, public.activity_action, jsonb),
  private.items_activity(),
  private.item_shares_activity(),
  private.share_links_activity()
from public, anon, authenticated;
