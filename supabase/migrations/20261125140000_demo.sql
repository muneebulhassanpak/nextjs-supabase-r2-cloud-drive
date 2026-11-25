-- The public demo: one account anyone can sign in to (and a second person for it to share with).
-- Everyone who tries it shares the account, so it can't be taken over, and nothing done in it can
-- reach anyone else: not its sign-in details, nor people outside the demo. Reset daily.

create function private.is_demo(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = p_user_id and is_demo)
$$;

-- Sign-in details ----------------------------------------------------------------------------------

-- Refuses changes made through Supabase Auth, the app's forms or not: email, phone, password, the
-- emails that lead to them, and metadata (it's in everyone's session cookie). To change the demo's
-- password, unset is_demo first.
create function private.lock_demo_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_demo(old.id) and (
    new.email is distinct from old.email
    or new.email_change is distinct from old.email_change
    or new.phone is distinct from old.phone
    or new.phone_change is distinct from old.phone_change
    or new.encrypted_password is distinct from old.encrypted_password
    or new.recovery_token is distinct from old.recovery_token
    or new.reauthentication_token is distinct from old.reauthentication_token
    or new.raw_user_meta_data is distinct from old.raw_user_meta_data
  ) then
    raise exception 'The demo account can''t be changed' using errcode = 'LK409';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_demo_lock
  before update of
    email, email_change, phone, phone_change, encrypted_password, recovery_token,
    reauthentication_token, raw_user_meta_data
  on auth.users
  for each row execute function private.lock_demo_user();

-- Name and picture: people would see each other's. (The reset has no signed-in user.)
create function private.lock_demo_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_demo and (select auth.uid()) is not null
     and (new.full_name is distinct from old.full_name or new.avatar_key is distinct from old.avatar_key) then
    raise exception 'The demo account''s name and picture can''t be changed' using errcode = 'LK409';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_demo before update of full_name, avatar_key on public.profiles
  for each row execute function private.lock_demo_profile();

-- Sharing ------------------------------------------------------------------------------------------

-- The demo shares with the demo's other person only, so it can't send things to strangers, and
-- nobody can put things in front of everyone who tries the demo.
create function private.check_demo_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select i.owner_id into v_owner from public.items i where i.id = new.item_id;
  if tg_table_name = 'share_invites' then
    if private.is_demo(v_owner) then
      raise exception 'The demo can only share with sam@lockerly.heymuneeb.dev' using errcode = 'LK422';
    end if;
  elsif private.is_demo(v_owner) and not private.is_demo(new.user_id) then
    raise exception 'The demo can only share with sam@lockerly.heymuneeb.dev' using errcode = 'LK422';
  elsif private.is_demo(new.user_id) and not private.is_demo(v_owner) then
    raise exception 'You can''t share with the demo account' using errcode = 'LK422';
  end if;
  return new;
end;
$$;

create trigger item_shares_check_demo before insert on public.item_shares
  for each row execute function private.check_demo_share();
create trigger share_invites_check_demo before insert on public.share_invites
  for each row execute function private.check_demo_share();

-- The demo's public links last a day at most.
create function private.limit_demo_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_demo(new.created_by) then
    new.expires_at := least(new.expires_at, now() + interval '1 day');
  end if;
  return new;
end;
$$;

create trigger share_links_limit_demo before insert on public.share_links
  for each row execute function private.limit_demo_link();

-- Activity -----------------------------------------------------------------------------------------

-- As before, but the demo's sign-ins (everyone who tries it) aren't news.
create or replace function private.auth_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null
       and not private.is_demo(new.id) then
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

-- Reset --------------------------------------------------------------------------------------------

-- Puts the demo back as it was, in one transaction: whoever is looking sees the old or the new, not
-- half of each. Only the daily job (the secret key) may call it. `p_people` names the accounts;
-- `p_items` come folders first; `p_activity` replaces what the changes here would have logged.
create function public.reset_demo(
  p_people jsonb, -- [{id, full_name}]
  p_items jsonb, -- [{id, owner_id, parent_id, kind, name, size, mime_type, object_key, created_at, trashed_at}]
  p_shares jsonb, -- [{item_id, user_id, role, created_at}]
  p_stars jsonb, -- [{user_id, item_id, created_at}]
  p_activity jsonb -- [{item_id, actor_id, action, details, created_at}]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := array(select (p ->> 'id')::uuid from jsonb_array_elements(p_people) p);
begin
  if cardinality(v_ids) = 0 then
    raise exception 'No demo accounts given' using errcode = 'LK422';
  end if;
  -- One reset at a time.
  perform pg_advisory_xact_lock(hashtextextended('lockerly.demo', 0));

  update public.profiles p
  set is_demo = true, full_name = d.full_name, avatar_key = null, drive_view = null
  from jsonb_to_recordset(p_people) as d (id uuid, full_name text)
  where p.id = d.id;

  delete from public.items where owner_id = any (v_ids);
  delete from public.item_shares where user_id = any (v_ids);
  delete from public.share_invites where created_by = any (v_ids);
  delete from public.stars where user_id = any (v_ids);
  delete from public.recents where user_id = any (v_ids);

  insert into public.items (id, owner_id, parent_id, kind, name, size, mime_type, object_key, created_at, updated_at)
  select d.id, d.owner_id, d.parent_id, d.kind, d.name, d.size, d.mime_type, d.object_key, d.created_at, d.created_at
  from rows from (
    jsonb_to_recordset(p_items) as (
      id uuid, owner_id uuid, parent_id uuid, kind public.item_kind, name text, size bigint,
      mime_type text, object_key text, created_at timestamptz
    )
  ) with ordinality as d (id, owner_id, parent_id, kind, name, size, mime_type, object_key, created_at, n)
  order by d.n;
  update public.items i
  set trashed_at = d.trashed_at, trashed_by = i.owner_id, trash_root = i.id, updated_by = i.owner_id
  from jsonb_to_recordset(p_items) as d (id uuid, trashed_at timestamptz)
  where i.id = d.id and d.trashed_at is not null;
  update public.items set updated_by = owner_id where owner_id = any (v_ids) and updated_by is null;

  insert into public.item_shares (item_id, user_id, role, created_by, created_at)
  select d.item_id, d.user_id, d.role, i.owner_id, d.created_at
  from jsonb_to_recordset(p_shares) as d (item_id uuid, user_id uuid, role public.share_role, created_at timestamptz)
  join public.items i on i.id = d.item_id;
  insert into public.stars (user_id, item_id, created_at)
  select d.user_id, d.item_id, d.created_at
  from jsonb_to_recordset(p_stars) as d (user_id uuid, item_id uuid, created_at timestamptz);

  delete from public.activity where owner_id = any (v_ids) or actor_id = any (v_ids);
  insert into public.activity (owner_id, item_id, actor_id, action, details, created_at)
  select i.owner_id, d.item_id, d.actor_id, d.action, coalesce(d.details, '{}'), d.created_at
  from jsonb_to_recordset(p_activity) as d (
    item_id uuid, actor_id uuid, action public.activity_action, details jsonb, created_at timestamptz
  )
  join public.items i on i.id = d.item_id
  order by d.created_at;
end;
$$;

comment on function public.reset_demo(jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Puts the demo accounts back as they were (the daily job only).';

revoke execute on function
  private.is_demo(uuid),
  private.lock_demo_user(),
  private.lock_demo_profile(),
  private.check_demo_share(),
  private.limit_demo_link(),
  public.reset_demo(jsonb, jsonb, jsonb, jsonb, jsonb)
from public, anon, authenticated;
grant execute on function public.reset_demo(jsonb, jsonb, jsonb, jsonb, jsonb) to service_role;
