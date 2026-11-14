-- Organising: restoring puts things back where they can go, under a free name, and the trash
-- empties itself after 30 days.

-- Free names -------------------------------------------------------------------------------------

-- The first name not taken in a folder (or at the top of someone's drive): `p_name` itself, then
-- "name (1).ext", "name (2).ext"…, the same pattern uploads use (uniqueName in
-- src/lib/files/rules.ts). Long names lose the end of their base so the copy still fits. Callers
-- hold the tree lock, so the name is still free when they use it.
create function private.free_name(p_parent_id uuid, p_owner_id uuid, p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Characters from the end up to and including the last dot (0 when there is none).
  v_tail integer := strpos(reverse(p_name), '.');
  v_base text := p_name;
  v_extension text := '';
  v_candidate text := p_name;
  v_suffix text;
  v_n integer := 0;
begin
  -- A dot at the start isn't an extension (".env"), and one too long to keep a base beside it is
  -- just part of the name.
  if v_tail > 0 and v_tail < char_length(p_name) and v_tail <= 255 - 11 - 1 then
    v_base := left(p_name, char_length(p_name) - v_tail);
    v_extension := right(p_name, v_tail);
  end if;

  while exists (
    select 1 from public.items i
    where i.trashed_at is null and i.status = 'ready' and lower(i.name) = lower(v_candidate)
      and case when p_parent_id is null then i.parent_id is null and i.owner_id = p_owner_id
               else i.parent_id = p_parent_id end
  ) loop
    v_n := v_n + 1;
    v_suffix := ' (' || v_n || ')';
    v_candidate := left(v_base, 255 - char_length(v_suffix) - char_length(v_extension))
      || v_suffix || v_extension;
  end loop;
  return v_candidate;
end;
$$;

revoke execute on function private.free_name(uuid, uuid, text) from public, anon, authenticated;

-- Restore ----------------------------------------------------------------------------------------

-- Brings back an item and everything that went into the trash with it, and says where it went and
-- under what name. It goes back into its folder; if that folder is in the trash too, it goes to the
-- top of its owner's drive instead, but only when the caller owns everything in it, so nobody can
-- take other people's files out of the tree they were shared in (as with moves). A name taken in
-- the meantime gets a number: "report (1).pdf".
drop function public.restore_item(uuid);

create function public.restore_item(p_item_id uuid)
returns table (name text, parent_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_item public.items;
  v_parent_id uuid;
  v_name text;
begin
  perform private.require_access(p_item_id, 'editor');
  perform private.lock_trees(array[p_item_id], true);
  select * into v_item from public.items i where i.id = p_item_id;

  if v_item.trashed_at is null then
    raise exception 'This isn''t in the trash' using errcode = 'LK409';
  end if;
  if v_item.trash_root <> v_item.id then
    raise exception 'Restore the folder it was in instead' using errcode = 'LK409';
  end if;
  if v_item.owner_id <> v_uid
     and (v_item.parent_id is null or coalesce(private.item_access(v_item.parent_id), 'viewer') < 'editor') then
    raise exception 'Only the owner can restore this' using errcode = '42501';
  end if;

  v_parent_id := v_item.parent_id;
  if v_parent_id is not null
     and exists (select 1 from public.items i where i.id = v_parent_id and i.trashed_at is not null) then
    if exists (
      select 1 from public.items d
      where (d.id = p_item_id or d.ancestors @> array[p_item_id]) and d.owner_id <> v_uid
    ) then
      raise exception 'The folder it was in is in the trash' using errcode = 'LK409';
    end if;
    v_parent_id := null;
  end if;

  -- Rename and move it while it's still in the trash (where names don't count), then bring it back.
  v_name := private.free_name(v_parent_id, v_item.owner_id, v_item.name);
  update public.items i
  set parent_id = v_parent_id, name = v_name
  where i.id = p_item_id and (i.parent_id is distinct from v_parent_id or i.name <> v_name);
  update public.items i
  set trashed_at = null, trashed_by = null, trash_root = null
  where i.trash_root = p_item_id;

  return query select v_name, v_parent_id;
end;
$$;

comment on function public.restore_item(uuid) is
  'Takes an item out of the trash; returns the name it got and the folder it went to (NULL: top of the drive).';

revoke execute on function public.restore_item(uuid) from public, anon, authenticated;
grant execute on function public.restore_item(uuid) to authenticated;

-- Deleting forever (unchanged, except one line) ---------------------------------------------------

-- As before: deletes the caller's own items and hands back anything inside that belongs to someone
-- else, to the top of its owner's drive and into their trash. Now the handed-back items count as
-- trashed from that moment, so their owner gets the full 30 days to see and restore them before the
-- trash empties itself (otherwise a purge could hand them back one day and delete them the next).
create or replace function private.delete_own_subtree(p_root_id uuid, p_uid uuid)
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
    update public.items set trash_root = v_foreign_id, trashed_at = now()
    where (id = v_foreign_id or ancestors @> array[v_foreign_id]) and trash_root = p_root_id;
    update public.items set parent_id = null where id = v_foreign_id;
  end loop;

  return query
  select i.object_key from public.items i
  where (i.id = p_root_id or i.ancestors @> array[p_root_id]) and i.kind = 'file';

  delete from public.items where id = p_root_id;
end;
$$;

-- Purging old trash (server only) ----------------------------------------------------------------

-- Deletes trash entries that have been in the trash longer than `p_older_than` for good, oldest
-- first and at most `p_limit` per call, and returns the storage keys of the deleted files so the
-- app can delete the bytes. Each entry goes as if its owner deleted it forever: anything inside
-- that belongs to someone else is handed back to them, still in their trash. Called by a cron route.
create function public.purge_trash(
  p_older_than interval default interval '30 days',
  p_limit integer default 500
)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entries uuid[];
  v_id uuid;
  v_entry public.items;
begin
  select coalesce(array_agg(e.id order by e.trashed_at), '{}') into v_entries
  from (
    select i.id, i.trashed_at from public.items i
    where i.trash_root = i.id and i.trashed_at < now() - p_older_than
    order by i.trashed_at
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ) e;
  perform private.lock_trees(v_entries, true);

  foreach v_id in array v_entries loop
    select * into v_entry from public.items i where i.id = v_id;
    -- Restored while we waited for the lock, or gone inside an entry deleted just before it.
    continue when not found or v_entry.trash_root is distinct from v_entry.id
      or v_entry.trashed_at >= now() - p_older_than;
    return query select * from private.delete_own_subtree(v_entry.id, v_entry.owner_id);
  end loop;
end;
$$;

revoke execute on function public.purge_trash(interval, integer) from public, anon, authenticated;
grant execute on function public.purge_trash(interval, integer) to service_role;

-- The trash page -----------------------------------------------------------------------------------

-- What the caller's trash shows: each trash entry (an item trashed on its own, with whatever went
-- with it) that is theirs, or that they put there from a folder shared with them. Runs as the
-- caller, so row-level security still decides what comes back.
create function public.trash_entries()
returns setof public.items
language sql
stable
security invoker
set search_path = ''
as $$
  select i.*
  from public.items i
  where i.trash_root = i.id
    and (i.owner_id = (select auth.uid()) or i.trashed_by = (select auth.uid()))
  order by i.trashed_at desc, i.id
$$;

revoke execute on function public.trash_entries() from public, anon, authenticated;
grant execute on function public.trash_entries() to authenticated;
