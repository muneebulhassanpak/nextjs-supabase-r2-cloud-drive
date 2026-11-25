-- The Activity screen: everything that happened, in one place. The log now outlives the items it's
-- about, and covers deletes, invites, stars, downloads and the person's own account.

-- Whose item it was (or whose account), so an entry still has an owner once the item is gone, and
-- what the item was called, filled in as it's deleted.
alter table public.activity
  add column owner_id uuid references public.profiles (id) on delete cascade,
  add column item_name text,
  add column item_kind public.item_kind;

update public.activity a set owner_id = i.owner_id from public.items i where i.id = a.item_id;

alter table public.activity
  alter column owner_id set not null,
  alter column item_id drop not null,
  drop constraint activity_item_id_fkey,
  add constraint activity_item_id_fkey
    foreign key (item_id) references public.items (id) on delete set null;

create index activity_owner_created_id_idx on public.activity (owner_id, created_at desc, id desc);

-- Who sees an entry: whoever can see the item; once it's deleted (and for account entries), only
-- its owner. And some entries aren't for everyone who can see the item: stars, downloads and
-- account entries are nobody's business but the person's own, and an invited address is only the
-- owner's (it stays in the log after the invite is gone).
create function private.may_read_activity(
  p_action public.activity_action, p_owner_id uuid, p_actor_id uuid, p_uid uuid
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_action in (
      'starred', 'unstarred', 'downloaded', 'signed_in', 'name_changed', 'picture_changed', 'password_changed'
    ) then p_actor_id is not distinct from p_uid
    when p_action in ('invited', 'invite_changed', 'invite_removed') then p_owner_id = p_uid
    else true
  end
$$;

drop policy "activity: see activity on items you can see" on public.activity;
create policy "activity: see activity on items you can see"
  on public.activity for select to authenticated
  using (
    private.may_read_activity(action, owner_id, actor_id, (select auth.uid()))
    and case
      when item_id is null then owner_id = (select auth.uid())
      else private.item_access(item_id) is not null
    end
  );

-- Writing the log ----------------------------------------------------------------------------------

-- An item that's already gone (its shares and stars go with it) has nothing to log on, and an upload
-- that isn't finished yet isn't worth it.
create or replace function private.log_activity(p_item_id uuid, p_action public.activity_action, p_details jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (item_id, owner_id, actor_id, action, details)
  select i.id, i.owner_id, (select auth.uid()), p_action, coalesce(p_details, '{}')
  from public.items i
  where i.id = p_item_id and i.status = 'ready';
$$;

-- Entries keep the name of a deleted item, except other people's own (their stars, say): those go
-- with it, as they may have lost access long ago. What was deleted as one (a trash entry) is logged
-- once, not once per thing inside. Something that wasn't in the trash only goes along when the
-- folder it's in does, with its owner's account. When the item's own owner's account is going,
-- nobody is left to read any of it.
create function private.items_before_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'ready' and exists (select 1 from public.profiles where id = old.owner_id) then
    delete from public.activity a
    where a.item_id = old.id
      and not private.may_read_activity(a.action, a.owner_id, a.actor_id, old.owner_id);
    update public.activity set item_name = old.name, item_kind = old.kind where item_id = old.id;
    if old.trash_root = old.id or old.trashed_at is null then
      insert into public.activity (owner_id, actor_id, action, details, item_name, item_kind)
      values (
        old.owner_id, (select auth.uid()), 'deleted',
        -- The daily purge, rather than someone.
        case
          when (select auth.uid()) is null and old.trashed_at < now() - interval '30 days'
          then '{"automatic": true}'::jsonb
          else '{}'
        end,
        old.name, old.kind
      );
    end if;
  end if;
  return old;
end;
$$;

create trigger items_before_delete before delete on public.items
  for each row execute function private.items_before_delete();

-- A share made by an invite being claimed is credited to whoever sent the invite.
create or replace function private.item_shares_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity (item_id, owner_id, actor_id, action, details)
    select i.id, i.owner_id, coalesce((select auth.uid()), new.created_by), 'shared',
      jsonb_build_object('user_id', new.user_id, 'role', new.role)
    from public.items i where i.id = new.item_id;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.log_activity(new.item_id, 'share_changed',
        jsonb_build_object('user_id', new.user_id, 'from', old.role, 'to', new.role));
    end if;
  else
    perform private.log_activity(old.item_id, 'unshared',
      jsonb_build_object('user_id', old.user_id, 'role', old.role));
  end if;
  return null;
end;
$$;

-- Invites removed by nobody in particular are being claimed, which logs the share instead.
create function private.share_invites_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.log_activity(new.item_id, 'invited',
      jsonb_build_object('email', new.email, 'role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform private.log_activity(new.item_id, 'invite_changed',
        jsonb_build_object('email', new.email, 'from', old.role, 'to', new.role));
    end if;
  elsif (select auth.uid()) is not null then
    perform private.log_activity(old.item_id, 'invite_removed',
      jsonb_build_object('email', old.email, 'role', old.role));
  end if;
  return null;
end;
$$;

create trigger share_invites_activity after insert or update or delete on public.share_invites
  for each row execute function private.share_invites_activity();

-- Only stars people set themselves.
create function private.stars_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_star public.stars := case when tg_op = 'DELETE' then old else new end;
begin
  if v_star.user_id = (select auth.uid()) then
    perform private.log_activity(v_star.item_id,
      case when tg_op = 'DELETE' then 'unstarred' else 'starred' end::public.activity_action, '{}');
  end if;
  return null;
end;
$$;

create trigger stars_activity after insert or delete on public.stars
  for each row execute function private.stars_activity();

-- Called by the app as it signs a download link. Once a minute per file is enough to say it.
create function public.log_download(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.current_user_id();
begin
  perform private.require_access(p_item_id, 'viewer');
  if not exists (
    select 1 from public.items i
    where i.id = p_item_id and i.kind = 'file' and i.status = 'ready' and i.trashed_at is null
  ) then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;
  -- One at a time, so two clicks at once don't both find nothing logged yet.
  perform pg_advisory_xact_lock(hashtextextended('lockerly.download:' || v_uid || p_item_id, 0));
  if not exists (
    select 1 from public.activity a
    where a.item_id = p_item_id and a.actor_id = v_uid and a.action = 'downloaded'
      and a.created_at > clock_timestamp() - interval '1 minute'
  ) then
    perform private.log_activity(p_item_id, 'downloaded', '{}');
  end if;
end;
$$;

-- The person's own account -------------------------------------------------------------------------

create function private.profiles_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.full_name is distinct from old.full_name then
    insert into public.activity (owner_id, actor_id, action) values (new.id, new.id, 'name_changed');
  end if;
  if new.avatar_key is distinct from old.avatar_key then
    insert into public.activity (owner_id, actor_id, action) values (new.id, new.id, 'picture_changed');
  end if;
  return null;
end;
$$;

create trigger profiles_activity after update of full_name, avatar_key on public.profiles
  for each row execute function private.profiles_activity();

-- Runs inside Supabase Auth's own writes: failing to log must never stop someone signing in.
create function private.auth_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      insert into public.activity (owner_id, actor_id, action) values (new.id, new.id, 'signed_in');
    end if;
    if new.encrypted_password is distinct from old.encrypted_password then
      insert into public.activity (owner_id, actor_id, action) values (new.id, new.id, 'password_changed');
    end if;
  exception when others then
    raise warning 'auth activity not logged: %', sqlerrm;
  end;
  return null;
end;
$$;

create trigger on_auth_user_activity
  after update of last_sign_in_at, encrypted_password on auth.users
  for each row execute function private.auth_activity();

-- Reading ------------------------------------------------------------------------------------------

-- Entries the caller has already been allowed to read, with names. Who did it, and the names the
-- details point at (folders moved between, the person shared with), each only if the caller could
-- see it anyway: otherwise null. `item_listed` is whether it's an entry on the caller's Trash page.
create function private.activity_rows(p_ids bigint[], p_uid uuid)
returns table (
  id bigint,
  action public.activity_action,
  details jsonb,
  created_at timestamptz,
  item_id uuid,
  item_name text,
  item_kind public.item_kind,
  item_trashed boolean,
  item_listed boolean,
  actor_id uuid,
  actor_name text,
  actor_email text,
  from_name text,
  to_name text,
  person_name text,
  person_email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id, p.action, p.details, p.created_at, p.item_id,
    coalesce(i.name, p.item_name), coalesce(i.kind, p.item_kind), i.trashed_at is not null,
    coalesce(i.trash_root = i.id and (i.owner_id = p_uid or i.trashed_by = p_uid), false),
    p.actor_id, actor.full_name, actor.email,
    from_folder.name, to_folder.name,
    person.full_name, person.email
  from public.activity p
  left join public.items i on i.id = p.item_id
  left join public.profiles actor
    on actor.id = p.actor_id and (actor.id = p_uid or private.can_see_profile(actor.id))
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
    and (person.id = p_uid or private.can_see_profile(person.id))
  where p.id = any (p_ids)
  order by p.created_at desc, p.id desc
$$;

-- As before, without other people's stars and downloads, or invites to anyone but the owner.
create or replace function public.item_activity(
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
    select i.id
    from public.items i
    where (i.id = p_item_id or i.ancestors @> array[p_item_id])
      and (i.owner_id = v_uid
           or (i.status = 'ready'
               and private.item_role(i.owner_id, i.id, i.ancestors)
                 >= case when i.trashed_at is null then 'viewer'::public.access_role else 'editor' end))
  ),
  page as (
    select a.id
    from visible i
    join public.activity a on a.item_id = i.id
    where (p_before_at is null or (a.created_at, a.id) < (p_before_at, p_before_id))
      and private.may_read_activity(a.action, a.owner_id, a.actor_id, v_uid)
    order by a.created_at desc, a.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 100)
  )
  select
    r.id, r.action, r.details, r.created_at, r.item_id, r.item_name, r.item_kind,
    r.actor_id, r.actor_name, r.actor_email, r.from_name, r.to_name, r.person_name, r.person_email
  from private.activity_rows(array(select p.id from page p), v_uid) r;
end;
$$;

-- Everything the caller may see in the log, newest first: on their own items (deleted ones too), on
-- what's shared with them, and on their account. Filters: `p_type` is 'files', 'sharing', 'trash' or
-- 'account'; `p_who` is 'me', 'others' or 'any'. Pages like `item_activity`. Names as there. Item
-- fields are null for account entries; `item_id` is null once the item is deleted.
create function public.my_activity(
  p_type text default null,
  p_who text default 'any',
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
  item_trashed boolean,
  item_listed boolean,
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
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 100);
  v_actions public.activity_action[];
  -- Where other people's items are visible from (as in `search_items`).
  v_roots uuid[];
begin
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'A cursor needs both its time and id' using errcode = 'LK422';
  end if;
  if p_who is null or p_who not in ('me', 'others', 'any') then
    raise exception 'Who must be me, others or any' using errcode = 'LK422';
  end if;
  v_actions := case p_type
    when 'files' then '{created,uploaded,renamed,moved,starred,unstarred,downloaded}'
    when 'sharing' then '{shared,share_changed,unshared,invited,invite_changed,invite_removed,link_created,link_revoked}'
    when 'trash' then '{trashed,restored,deleted}'
    when 'account' then '{signed_in,name_changed,picture_changed,password_changed}'
  end::public.activity_action[];
  if p_type is not null and v_actions is null then
    raise exception 'Unknown type' using errcode = 'LK422';
  end if;
  v_roots := array(
    select s.item_id from public.item_shares s where s.user_id = v_uid
    union all
    select f.id from public.items f where f.owner_id = v_uid and f.parent_id is null and f.kind = 'folder'
  );

  return query
  with others as materialized (
    select i.id
    from public.items i
    where (i.id = any (v_roots) or i.ancestors operator(pg_catalog.&&) v_roots)
      and i.owner_id <> v_uid
      and i.status = 'ready'
      -- Seeing something in the trash takes an editor, which the overlap above doesn't tell.
      and (i.trashed_at is null or private.item_role(i.owner_id, i.id, i.ancestors) >= 'editor')
  ),
  page as (
    (
      select a.id, a.created_at from public.activity a
      where a.owner_id = v_uid
        and (p_before_at is null or (a.created_at, a.id) < (p_before_at, p_before_id))
        and (v_actions is null or a.action = any (v_actions))
        and (p_who = 'any' or (a.actor_id is not distinct from v_uid) = (p_who = 'me'))
        and private.may_read_activity(a.action, a.owner_id, a.actor_id, v_uid)
      order by a.created_at desc, a.id desc
      limit v_limit
    )
    union all
    (
      select a.id, a.created_at from others o
      join public.activity a on a.item_id = o.id
      where (p_before_at is null or (a.created_at, a.id) < (p_before_at, p_before_id))
        and (v_actions is null or a.action = any (v_actions))
        and (p_who = 'any' or (a.actor_id is not distinct from v_uid) = (p_who = 'me'))
        and private.may_read_activity(a.action, a.owner_id, a.actor_id, v_uid)
      order by a.created_at desc, a.id desc
      limit v_limit
    )
    order by created_at desc, id desc
    limit v_limit
  )
  select * from private.activity_rows(array(select p.id from page p), v_uid);
end;
$$;

comment on function public.my_activity(text, text, timestamptz, bigint, integer) is
  'Everything in the activity log the caller may see, newest first, with filters.';

revoke execute on function
  private.may_read_activity(public.activity_action, uuid, uuid, uuid),
  private.items_before_delete(),
  private.activity_rows(bigint[], uuid),
  private.share_invites_activity(),
  private.stars_activity(),
  private.profiles_activity(),
  private.auth_activity(),
  public.log_download(uuid),
  public.my_activity(text, text, timestamptz, bigint, integer)
from public, anon, authenticated;
-- The policy runs as the caller.
grant execute on function private.may_read_activity(public.activity_action, uuid, uuid, uuid) to authenticated;
grant execute on function public.log_download(uuid) to authenticated;
grant execute on function public.my_activity(text, text, timestamptz, bigint, integer) to authenticated;
