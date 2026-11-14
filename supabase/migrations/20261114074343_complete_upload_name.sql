-- Finishing an upload can also give the file its final name. Uploads in progress don't hold their
-- name, so two of "report.pdf" can be under way at once; whichever lands second needs another name
-- ("report (1).pdf"). Renaming has to happen in the same step, because people can't rename items
-- that aren't ready (and shouldn't: nobody else can see them yet).
--
-- It also checks the folder again (the upload may have started before access was taken away or the
-- folder was trashed), and answers a repeated call with the name it already gave, so a client whose
-- first answer was lost can ask again instead of uploading a second copy.

drop function public.complete_upload(uuid);

create function public.complete_upload(p_item_id uuid, p_name text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
  v_item public.items;
  v_name text;
begin
  select * into v_item from public.items
  where id = p_item_id and owner_id = v_uid and status in ('pending', 'ready')
  for update;
  if not found then
    raise exception 'Upload not found' using errcode = 'P0002';
  end if;
  -- Already finished: a retry whose first answer got lost on the way back. Same answer again.
  if v_item.status = 'ready' then
    return v_item.name;
  end if;
  -- The folder may have changed since the upload started: access taken away, or moved to the trash.
  if v_item.parent_id is not null then
    perform private.require_access(v_item.parent_id, 'editor');
    if exists (select 1 from public.items where id = v_item.parent_id and trashed_at is not null) then
      raise exception 'The folder is in the trash' using errcode = 'P0002';
    end if;
  end if;

  update public.items
  set status = 'ready', name = coalesce(btrim(p_name), name)
  where id = p_item_id
  returning name into v_name;
  return v_name;
end;
$$;

comment on function public.complete_upload(uuid, text) is
  'Makes a pending upload visible, optionally under a new name; returns the name it got.';

revoke execute on function public.complete_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_upload(uuid, text) to authenticated;
